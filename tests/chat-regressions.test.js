const fs = require('fs');
const vm = require('vm');
const parser = require('@babel/parser');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

const main = fs.readFileSync('public/js/main.js', 'utf8');
const ast = parser.parse(main, { sourceType: 'module' });
function declaration(name) {
  const node = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === name);
  if (!node) throw new Error(`Missing function ${name}`);
  return main.slice(node.start, node.end);
}
function assignment(name) {
  const node = ast.program.body.find(n => n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression' && n.expression.left.object?.name === 'window' && n.expression.left.property?.name === name);
  if (!node) throw new Error(`Missing window function ${name}`);
  return main.slice(node.start, node.end);
}
const time = m => Number(m.timestamp || m.createdAt || 0);
function runtime(context = {}) {
  const ctx = vm.createContext({ getMsgTimestamp: time, DOMException, console, ...context });
  vm.runInContext(fs.readFileSync('public/js/chat_runtime.js', 'utf8').replace(/^import[^\n]*\n/gm, '').replace(/\bexport /g, '') + '\nglobalThis.runtime = { countNewerMessages, compareHistoryMessages, olderHistoryScrollTop, HistoryLoadGate, NotificationLedger, microphoneErrorMessage, AttachmentResources };', ctx);
  return ctx.runtime;
}

test('one history page per scroll intent, with no cascade from layout or image loads', () => {
  const { HistoryLoadGate, olderHistoryScrollTop } = runtime();
  const gate = new HistoryLoadGate();
  expect(gate.take(50, false)).toBe(true);
  for (let i = 0; i < 30; i++) expect(gate.take(50, false)).toBe(false);
  gate.intent(true);
  expect(gate.take(50, false)).toBe(false);
  gate.intent(false);
  expect(gate.take(50, false)).toBe(true);
  expect(olderHistoryScrollTop(720)).toBe(720);
});

test('older history does not increment the new message badge', () => {
  const { countNewerMessages } = runtime();
  expect(countNewerMessages([{ id: 'old' }, { id: 'latest' }], 'latest')).toBe(0);
  expect(countNewerMessages([{ id: 'latest' }, { id: 'new' }], 'latest')).toBe(1);
  expect(countNewerMessages([{ id: 'latest' }], null)).toBe(0);
});

test('search reads remote history despite a partial cache and survives unavailable IndexedDB', async () => {
  const records = Array.from({ length: 201 }, (_, i) => ({ id: `m${String(i).padStart(4, '0')}`, timestamp: i + 1, text: i === 0 ? 'needle' : 'other' }));
  const get = jest.fn(async constraints => {
    const cursor = constraints.find(c => c?.before != null);
    const page = records.filter(m => !cursor || m.timestamp < cursor.before).slice(-100);
    return { val: () => Object.fromEntries(page.map(m => [m.id, m])) };
  });
  const database = { get, ref: () => null, query: (_, ...constraints) => constraints, orderByChild: () => null, limitToLast: () => null, endBefore: before => ({ before }) };
  const ctx = vm.createContext({
    currentServerId: null, currentRoomId: null, currentDmId: 'alice_bob', currentDmParticipants: ['alice', 'bob'], currentServerData: null, _activeChannelSessionId: 1,
    searchQuery: 'needle', appId: 'test', allLoadedMessages: records.slice(-20),
    LocalStore: { getMessages: async () => [], upsertMessagesBatch: async () => false },
    _decryptDmMessagesInPlace: async () => {}, _getOrInitRTDB: async () => ({}), importDatabase: async () => database,
    getMsgTimestamp: time, compareHistoryMessages: runtime().compareHistoryMessages,
    setSearchHistoryStatus: jest.fn(), _searchPreloadedAt: new Map(), setTimeout, Date, console, alertMessage: jest.fn(), renderMessagesWithReadReceipts: jest.fn(),
  });
  vm.runInContext(declaration('_ensureChannelHistoryForSearchImpl').replace(/import\('https:\/\/www.gstatic.com\/firebasejs\/11.6.1\/firebase-database.js'\)/g, 'importDatabase()'), ctx);
  await ctx._ensureChannelHistoryForSearchImpl();
  expect(get).toHaveBeenCalledTimes(3);
  expect(ctx._searchHistoryResults.messages.map(m => m.id)).toEqual(['m0000']);
  expect(ctx.allLoadedMessages).toHaveLength(20);
  expect(ctx._searchPreloadedAt.size).toBe(0);
  expect(ctx.alertMessage).not.toHaveBeenCalled();
});

test('notification replay is suppressed while the session ledger remains bounded', () => {
  const { NotificationLedger } = runtime();
  const ledger = new NotificationLedger(100);
  expect(ledger.claim('alice:server:room:message1')).toBe(true);
  expect(ledger.claim('alice:server:room:message1')).toBe(false);
  expect(ledger.claim('alice:server:room:message2')).toBe(true);
  for (let i = 0; i < 1000; i++) ledger.claim(`message${i}`);
  expect(ledger.keys.size).toBe(100);
});

test('repeated renders share a decrypted blob and all URLs are revoked on room exit', async () => {
  const { AttachmentResources } = runtime();
  const create = jest.fn(() => 'blob:one');
  const revoke = jest.fn();
  const resources = new AttachmentResources(create, revoke);
  const load = jest.fn(async () => new Blob(['secret']));
  const first = { fileData: 'https://file/one' }, second = { ...first };
  await Promise.all([resources.resolve(first, load), resources.resolve(second, load)]);
  expect(load).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledTimes(1);
  resources.clear();
  expect(revoke).toHaveBeenCalledWith('blob:one');
  expect(first._decryptedFileUrl).toBeUndefined();
  expect(second._decryptedFileUrl).toBeUndefined();
  expect(resources.pending.size).toBe(0);
});

test('a decryption completing after navigation never allocates a leaked blob URL', async () => {
  const { AttachmentResources } = runtime();
  const create = jest.fn();
  const resources = new AttachmentResources(create, jest.fn());
  let finish;
  const pending = resources.resolve({ fileData: 'one' }, () => new Promise(r => { finish = r; }));
  await Promise.resolve();
  resources.clear();
  finish(new Blob(['secret']));
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(create).not.toHaveBeenCalled();
});

test('IndexedDB pagination returns every message with timestamp ties and no 100/500 cap', async () => {
  const ctx = vm.createContext({ indexedDB: new IDBFactory(), IDBKeyRange, console, window: {}, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync('public/js/local_store.js', 'utf8').replace(/\bexport /g, ''), ctx);
  const records = Array.from({ length: 650 }, (_, i) => ({ id: `m${String(i).padStart(4, '0')}`, channelId: 'one', timestamp: i < 250 ? 100 : 200, text: 'enc::v1::iv::cipher' }));
  await ctx.upsertMessagesBatch(records);
  await ctx.putMessage({ id: 'unrelated', channelId: 'two', timestamp: 100 });
  let cursor = null;
  const seen = [];
  while (true) {
    const page = await ctx.getMessages('one', cursor?.timestamp ?? null, 30, cursor?.id ?? null);
    if (!page.length) break;
    seen.push(...page.map(m => m.id));
    cursor = page[0];
    if (seen.length > 700) throw new Error('Cursor loop');
  }
  expect(new Set(seen).size).toBe(650);
  expect(seen.length).toBe(650);
  expect(seen).not.toContain('unrelated');
  (await ctx.initLocalDB()).close();
}, 15000);

test('non-admin storage settings never request the privileged statistics API', async () => {
  const label = {}, categories = { replaceChildren: jest.fn() };
  const ctx = vm.createContext({ auth: { currentUser: {} }, isAdmin: false, document: { getElementById: id => id === 'kvUsageText' ? label : categories }, Promise });
  ctx._loadStorageStatsImpl = jest.fn();
  vm.runInContext('let _storageStatsPromise = null;\n' + declaration('loadStorageStats'), ctx);
  await ctx.loadStorageStats();
  expect(ctx._loadStorageStatsImpl).not.toHaveBeenCalled();
  expect(label.textContent).toContain('全体管理者');
});

test('expired storage token is refreshed once and a genuine 403 stays denied', async () => {
  const label = {}, categories = { replaceChildren: jest.fn() };
  const user = { getIdToken: jest.fn(async force => force ? 'fresh' : 'old') };
  const ctx = vm.createContext({ auth: { currentUser: user }, document: { getElementById: id => id === 'kvUsageText' ? label : categories }, WORKER_BASE_URL: 'https://api.test', appId: 'test', console: { error: jest.fn() }, fetch: jest.fn().mockResolvedValueOnce({ status: 401 }).mockResolvedValueOnce({ status: 403 }) });
  vm.runInContext(declaration('_loadStorageStatsImpl'), ctx);
  await ctx._loadStorageStatsImpl();
  expect(user.getIdToken).toHaveBeenCalledWith(true);
  expect(ctx.fetch).toHaveBeenCalledTimes(2);
  expect(label.textContent).toContain('権限');
  expect(ctx.console.error).not.toHaveBeenCalled();
});

function recordingContext(getUserMedia) {
  const ctx = vm.createContext({
    window: {}, currentServerId: 'server', currentRoomId: 'room', currentDmId: null,
    navigator: { mediaDevices: { getUserMedia } }, MediaRecorder: class {},
    localStorage: { getItem: () => '' }, document: { getElementById: () => null },
    alertMessage: jest.fn(), console: { error: jest.fn(), warn: jest.fn() },
    microphoneErrorMessage: runtime().microphoneErrorMessage, setTimeout, clearInterval, clearTimeout, cancelAnimationFrame() {},
  });
  vm.runInContext(`let _isVoiceRecording = false, _voiceRecordStarting = false, _voiceRecordSending = false;
    let _voiceRecordPermissionTimer = null; let _voiceRecordRequest = 0, _voiceRecordDestination = null, _voiceRecordStream = null;
    let _voiceRecordAudioCtx = null, _voiceRecordAnalyser = null, _voiceRecordAnimFrame = null;
    let _voiceRecordTimerInterval = null, _voiceMediaRecorder = null, _voiceRecordChunks = [], _voiceRecordSeconds = 0;
    ${declaration('_cleanupVoiceRecording')}
    ${assignment('startVoiceRecording')}`, ctx);
  return ctx;
}

test('Safari microphone permission rejection provides guidance and permits a later retry', async () => {
  const getUserMedia = jest.fn(async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); });
  const ctx = recordingContext(getUserMedia);
  await ctx.window.startVoiceRecording();
  await ctx.window.startVoiceRecording();
  expect(getUserMedia).toHaveBeenCalledTimes(2);
  expect(ctx.alertMessage.mock.calls[0][0]).toContain('Safari');
  expect(ctx.console.error).not.toHaveBeenCalled();
});

test('double click asks for the microphone once, and a late permission response stops all tracks', async () => {
  let finish;
  const getUserMedia = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  const ctx = recordingContext(getUserMedia);
  const pending = ctx.window.startVoiceRecording();
  await ctx.window.startVoiceRecording();
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  ctx.currentRoomId = 'another-room';
  const stop = jest.fn();
  finish({ getTracks: () => [{ stop }] });
  await pending;
  expect(stop).toHaveBeenCalledTimes(1);
});

test('search scans local history beyond 500 without expanding all nonmatching DOM records', async () => {
  const { compareHistoryMessages } = runtime();
  const records = Array.from({ length: 650 }, (_, i) => ({ id: `m${String(i).padStart(4, '0')}`, channelId: 'dm_alice_bob', timestamp: i + 1, text: i === 0 ? 'needle in old history' : 'other' }));
  const getMessages = jest.fn(async (_, before, limit, id) => records.filter(m => before == null || m.timestamp < before || (m.timestamp === before && m.id < id)).slice(-limit));
  const ctx = vm.createContext({
    currentServerId: null, currentRoomId: null, currentDmId: 'alice_bob', currentDmParticipants: ['alice', 'bob'], currentServerData: null, _activeChannelSessionId: 1,
    searchQuery: 'needle', allLoadedMessages: records.slice(-20), LocalStore: { getMessages },
    _decryptDmMessagesInPlace: async () => {}, getMsgTimestamp: time, compareHistoryMessages,
    setSearchHistoryStatus: jest.fn(), _searchPreloadedAt: new Map([['dm_alice_bob', Date.now()]]), setTimeout, Date, console, alertMessage: jest.fn(), renderMessagesWithReadReceipts: jest.fn(), messagesIndexMap: {},
  });
  vm.runInContext(declaration('_ensureChannelHistoryForSearchImpl'), ctx);
  await ctx._ensureChannelHistoryForSearchImpl();
  expect(getMessages.mock.calls.length).toBeGreaterThan(5);
  expect(ctx._searchHistoryResults.messages.some(m => m.id === 'm0000')).toBe(true);
  expect(ctx.allLoadedMessages.length).toBe(20);
});
