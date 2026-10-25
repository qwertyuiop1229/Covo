const fs = require('fs');
const vm = require('vm');
const parser = require('@babel/parser');

const source = fs.readFileSync('public/js/main.js', 'utf8');
const ast = parser.parse(source, { sourceType: 'module' });
const node = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'sendSingleAttachmentMessage');
const attachmentSender = source.slice(node.start, node.end);

test.each([
  [false, null],
  [true, null],
])('attachment encryption unavailable (%s, %s) stops before upload', async (supported, key) => {
  const upload = jest.fn();
  const context = vm.createContext({
    auth:{currentUser:{uid:'alice'}},window:{},document:{getElementById:()=>null},
    currentDmId: 'bob_mallory', currentRoomId: null, currentServerId: null,
    currentDmParticipants: ['bob', 'mallory'], currentServerData: null, currentServerNickname: null,
    userId: 'alice', _subtleOK: supported, getRoomKeyWithWait: async () => key,
    uploadToExternalService: upload, _getOrInitRTDB: async () => ({}),
  });
  // The Firebase import only initializes a connection; replace it with a local stub.
  vm.runInContext(attachmentSender.replace("await import('../vendor/firebase/firebase-database.js')", '({ ref() {}, set() {} })'), context);
  await expect(context.sendSingleAttachmentMessage({ file: new Blob(['secret']), name: 'file.txt' }, {
    snapDmId: null, snapRoomId: 'room1', snapServerId: 'server1', snapDmParticipants: [], snapMembers: ['alice'], snapServerData: {}, snapServerNickname: 'Alice'
  })).rejects.toThrow('添付ファイル');
  expect(upload).not.toHaveBeenCalled();
});

test('upload timeout and token errors reject instead of leaving the caller pending', async () => {
  const code = fs.readFileSync('public/js/file_uploader.js', 'utf8').replace(/^import[^\n]*\n/gm, '').replace(/\bexport /g, '');
  let xhr;
  const context = vm.createContext({ CLIENT_PROTOCOL: 2, assertSupportedClient() {}, requireClientUpdate() {}, FormData, XMLHttpRequest: class {
    constructor() { xhr = this; this.events = {}; this.headers = {}; this.upload = { addEventListener() {} }; }
    open() {}
    setRequestHeader(name, value) { this.headers[name] = value; }
    addEventListener(name, callback) { this.events[name] = callback; }
    send() { this.events.timeout(); }
  } });
  vm.runInContext(code, context);
  const auth = { currentUser: { uid: 'alice', getIdToken: async () => 'test' } };
  await expect(context._uploadToExternalService(new File(['secret'], 'file.bin'), auth, 'alice', 'https://api.test')).rejects.toThrow('タイムアウト');
  expect(xhr.timeout).toBe(120000);
  expect(xhr.headers.Authorization).toBe('Bearer test');
  await expect(context._uploadToExternalService(null, { currentUser: { uid: 'alice', getIdToken: async () => { throw new Error('offline'); } } }, 'alice')).rejects.toThrow('認証トークン');
});

test('uploads never start after an account switch or during maintenance', async () => {
  const code = fs.readFileSync('public/js/file_uploader.js', 'utf8').replace(/^import[^\n]*\n/gm, '').replace(/\bexport /g, '');
  const XMLHttpRequest = jest.fn(); let finish;
  const context = vm.createContext({ CLIENT_PROTOCOL: 2, assertSupportedClient() {}, requireClientUpdate() {}, window: { covoMaintenanceBlocked: false }, XMLHttpRequest });
  vm.runInContext(code, context);
  const auth = { currentUser: { uid: 'alice', getIdToken: () => new Promise(resolve => { finish = resolve; }) } };
  const pending = context._uploadToExternalService(null, auth, 'alice', 'https://api.test');
  auth.currentUser = { uid: 'bob' }; finish('old-token'); await expect(pending).rejects.toThrow('アカウント');
  context.window.covoMaintenanceBlocked = true;
  await expect(context._uploadToExternalService(null, auth, 'bob', 'https://api.test')).rejects.toThrow('メンテナンス');
  expect(XMLHttpRequest).not.toHaveBeenCalled();
});
