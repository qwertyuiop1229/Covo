const fs = require('fs');
const vm = require('vm');
const parser = require('@babel/parser');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('public/js/server_profile_settings.js', 'utf8').replace(/\bexport /g, '') + '\nglobalThis.api = {saveServerName, normalizeServerName, canManageServerProfile}', context);
const { saveServerName, normalizeServerName, canManageServerProfile } = context.api;
const target = { id: 'server-a', uid: 'alice', name: 'Before' };
const server = { createdBy: 'alice', serverAdmins: ['bob'], name: 'Before' };

test('rename validates input and permission types without accepting map keys as admins', () => {
  expect(normalizeServerName('  名前  ')).toBe('名前');
  for (const name of ['', '  ', 'x'.repeat(101), 'a\nb', 'a\u0000b']) expect(() => normalizeServerName(name)).toThrow();
  expect(canManageServerProfile(server, 'bob')).toBe(true);
  expect(canManageServerProfile({ ...server, serverAdmins: { eve: false } }, 'eve')).toBe(false);
});

test('rename captures destination, writes only name and skips unchanged names', async () => {
  const update = jest.fn(), transact = jest.fn(async (id, mutate) => { expect(id).toBe('server-a'); await mutate(server, update); });
  const result = await saveServerName({ target, name: ' After ', getOwner: () => 'alice', transact });
  expect(result).toEqual({ name: 'After', changed: true }); expect(update.mock.calls).toEqual([[{ name: 'After' }]]);
  transact.mockClear();
  await saveServerName({ target, name: 'Before', getOwner: () => 'alice', transact }); expect(transact).not.toHaveBeenCalled();
});

test('rename rejects revoked rights, concurrent edits and account changes inside transaction', async () => {
  const update = jest.fn();
  for (const remote of [{ ...server, createdBy: 'other', serverAdmins: [] }, { ...server, name: 'Other device' }]) {
    await expect(saveServerName({ target, name: 'After', getOwner: () => 'alice', transact: (_, mutate) => mutate(remote, update) })).rejects.toThrow();
  }
  let owner = 'alice';
  await expect(saveServerName({ target, name: 'After', getOwner: () => owner, transact: (_, mutate) => { owner = 'bob'; return mutate(server, update); } })).rejects.toThrow();
  expect(update).not.toHaveBeenCalled();
});

test('transaction retries report the final committed state, not a previous attempt', async () => {
  const result = await saveServerName({ target, name: 'After', getOwner: () => 'alice', transact: async (_, mutate) => {
    await mutate(server, () => {});
    await mutate({ ...server, name: 'After' }, () => { throw new Error('Unexpected write'); });
  } });
  expect(result.changed).toBe(false);
});

test('an image selected before a server switch or a newer selection cannot open the wrong crop', async () => {
  const main = fs.readFileSync('public/js/main.js', 'utf8');
  const node = parser.parse(main, { sourceType: 'module' }).program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'handleSIconFileChange');
  const pending = [], Image = jest.fn(), createObjectURL = jest.fn(() => 'blob:local');
  const globals = { currentServerId: 'a', userId: 'alice', isAdmin: false, currentServerData: server, canManageServerProfile,
    sIconSelection: 0, sIconTarget: null, newServerIconUploadInput: {}, Image, URL: { createObjectURL },
    checkFileAllowed: () => true, processHeicFile: file => new Promise(resolve => pending.push(() => resolve(file))) };
  const state = vm.createContext(globals); vm.runInContext(main.slice(node.start, node.end), state);
  const upload = { files: [{ type: 'image/heic' }], value: 'file' };
  const first = state.handleSIconFileChange({ target: upload });
  state.currentServerId = 'b'; pending.shift()(); await first; expect(Image).not.toHaveBeenCalled();
  state.currentServerId = 'a';
  const stale = state.handleSIconFileChange({ target: upload });
  const latest = state.handleSIconFileChange({ target: upload });
  pending.pop()(); await latest; expect(Image).toHaveBeenCalledTimes(1);
  pending.shift()(); await stale; expect(Image).toHaveBeenCalledTimes(1);
});

test('password changes keep the original destination through asynchronous hashing', async () => {
  const main = fs.readFileSync('public/js/main.js', 'utf8');
  const node = parser.parse(main, { sourceType: 'module' }).program.body.find(node => node.type === 'ExpressionStatement' && main.slice(node.start, node.end).startsWith('document.getElementById("changeServerPasswordBtn")'));
  const writes = [], fields = { changeServerPasswordInput: { value: 'secure-password' }, changeServerPasswordBtn: { addEventListener: (_, callback) => { globals.handler = callback; } } };
  let finishHash;
  const globals = { currentServerId: 'a', userId: 'alice', isAdmin: false, currentServerData: server, canManageServerProfile, document: { getElementById: id => fields[id] },
    hashPassword: () => new Promise(resolve => { finishHash = resolve; }), db: {}, appId: 'app', doc: (_, ...parts) => parts.join('/'),
    setDoc: async (path, data) => writes.push({ path, data }), updateDoc: async (path, data) => writes.push({ path, data }), deleteField: () => 'delete', alertMessage: jest.fn() };
  vm.runInContext(main.slice(node.start, node.end), vm.createContext(globals));
  const save = globals.handler(); globals.currentServerId = 'b'; finishHash('hash-for-a'); await save;
  expect(writes.map(write => write.path)).toEqual(['artifacts/app/servers/a/secrets/auth', 'artifacts/app/servers/a']);
  expect(fields.changeServerPasswordInput.value).toBe('secure-password');
});
