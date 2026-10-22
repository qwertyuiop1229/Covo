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
test('channel creation distributes its key to the original server after navigation', async () => {
  let finish;
  const distribute = jest.fn(async () => {}), reload = jest.fn(), cache = {};
  const ctx = vm.createContext({ window: { crypto: { subtle: { generateKey: async () => ({}), exportKey: async () => new ArrayBuffer(32) } } },
    userId: 'alice', currentServerId: 'first', currentServerData: { joinedUsers: ['alice', 'bob'] }, appId: 'test', db: {},
    document: { getElementById: id => id === 'modalChannelNameInput' ? { value: 'New' } : null, querySelector: () => null },
    addDoc: () => new Promise(resolve => { finish = resolve; }), collection: (_, path) => path, serverTimestamp: () => 1,
    _distributeRoomKeyVersion: distribute, _e2ee: { roomKeyCache: cache }, roomKeyScope: (server, room) => server + '/' + room,
    closeCreateChannelModal: jest.fn(), loadServerRooms: reload, alertMessage: jest.fn(), console });
  vm.runInContext(assignment('submitCreateChannel'), ctx);
  const pending = ctx.window.submitCreateChannel();
  ctx.currentServerId = 'second'; ctx.currentServerData = { joinedUsers: ['alice', 'mallory'] };
  finish({ id: 'room' }); await pending;
  expect(distribute.mock.calls[0].slice(0, 2)).toEqual(['first', 'room']);
  expect([...distribute.mock.calls[0][3]]).toEqual(['alice', 'bob']);
  expect(cache['first/room']).toBeDefined(); expect(cache['second/room']).toBeUndefined();
  expect(reload).not.toHaveBeenCalled();
});
test('outgoing replies encrypt legacy plaintext quotes and fail closed when no key is available', async () => {
  const key = {}, ctx = vm.createContext({ _e2ee: { dmKeyCache: { alice_bob: key } }, encryptText: jest.fn(async (text, selected) => selected ? 'enc::secured-quote' : null) });
  vm.runInContext(declaration('encryptOutgoingReply') + '\nglobalThis.encryptReply = encryptOutgoingReply;', ctx);
  const data = { text: 'enc::body', replyTo: { messageId: 'old', senderNickname: 'Alice', text: 'private legacy quote' } };
  const result = await ctx.encryptReply(data, { dmId: 'alice_bob' });
  expect(result.replyTo.text).toBe('enc::secured-quote'); expect(data.replyTo.text).toBe('private legacy quote');
  ctx._e2ee.dmKeyCache = {};
  await expect(ctx.encryptReply(data, { dmId: 'alice_bob' })).rejects.toThrow('引用');
});
test('P2P history authorization uses authoritative membership and fails closed on read failure or account switch', async () => {
  let finish;
  const getDocFromServer = jest.fn(async () => ({ exists: () => true, data: () => ({ joinedUsers: ['alice', 'bob'] }) }));
  const ctx = vm.createContext({ userId: 'alice', appId: 'test', db: {}, doc: (_, path) => path, withReadDeadline: promise => promise,
    firestore: async () => ({ getDocFromServer }) });
  vm.runInContext(declaration('authorizeP2PHistoryRequest').replace(/import\('[^']+'\)/, 'firestore()') + '\nglobalThis.authorize = authorizeP2PHistoryRequest;', ctx);
  const request = { targetUid: 'alice', requesterUid: 'bob', channelType: 'server', serverId: 'server', roomId: 'room' };
  expect(await ctx.authorize(request, 'alice')).toBe(true);
  getDocFromServer.mockResolvedValueOnce({ exists: () => true, data: () => ({ joinedUsers: ['alice'] }) });
  expect(await ctx.authorize(request, 'alice')).toBe(false);
  getDocFromServer.mockRejectedValueOnce(new Error('offline'));
  expect(await ctx.authorize(request, 'alice')).toBe(false);
  getDocFromServer.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = ctx.authorize(request, 'alice'); await new Promise(setImmediate);
  ctx.userId = 'mallory'; finish({ exists: () => true, data: () => ({ joinedUsers: ['alice', 'bob'] }) });
  expect(await pending).toBe(false);
});

test('P2P responder cannot send another account history after a delayed local read', async () => {
  let finish;
  const Peer = jest.fn(), ctx = vm.createContext({ userId: 'alice', authorizeP2PHistoryRequest: async () => true,
    LocalStore: { getMessages: () => new Promise(resolve => { finish = resolve; }) }, RTCPeerConnection: Peer });
  vm.runInContext(declaration('_handleIncomingP2PLogRequest') + '\nglobalThis.respond = _handleIncomingP2PLogRequest;', ctx);
  const pending = ctx.respond('session', { requesterUid: 'bob', targetUid: 'alice', channelType: 'server', serverId: 'server', roomId: 'room' });
  await new Promise(setImmediate); ctx.userId = 'mallory';
  finish([{ id: 'private', text: 'enc::cipher' }]); await pending;
  expect(Peer).not.toHaveBeenCalled();
});
test('an unacknowledged write releases the composer while the optimistic message stays visible', async () => {
  const attempt = jest.fn(() => new Promise(() => {})), render = jest.fn();
  const ctx = vm.createContext({ userId: 'alice', crypto: { randomUUID: () => 'fixed-id' }, Date,
    currentDmId: 'alice_bob', currentServerId: null, currentRoomId: null, allLoadedMessages: [],
    mergeChannelRecords: (old, incoming) => [...old, ...incoming], compareHistoryMessages: (a,b) => a.timestamp - b.timestamp,
    renderMessagesWithReadReceipts: render, LocalStore: { putMessage: async () => {} }, _outbox: { attempt }, alertMessage: jest.fn(),
  });
  vm.runInContext(declaration('commitChatMessage') + '\nglobalThis.commit = commitChatMessage;', ctx);
  const entry = await ctx.commit({ text: 'enc::cipher' }, { dmId: 'alice_bob' }, 'preview');
  expect(entry.state).toBe('sending'); expect(attempt).toHaveBeenCalledTimes(1);
  expect(ctx.allLoadedMessages[0]).toMatchObject({ text: 'preview', _originalText: 'enc::cipher' });
  expect(entry.data.text).toBe('enc::cipher'); expect(render).toHaveBeenCalledTimes(1);
});
test('a late token from the previous account cannot replace the current token cache', async () => {
  let finish;
  const alice = { uid: 'alice', getIdToken: () => new Promise(resolve => { finish = resolve; }) };
  const ctx = vm.createContext({ auth: { currentUser: alice }, _cachedIdToken: null, withReadDeadline: promise => promise });
  vm.runInContext(declaration('cacheCurrentIdToken') + '\nglobalThis.cache = cacheCurrentIdToken;', ctx);
  const pending = ctx.cache(alice);
  const bob = { uid: 'bob', getIdToken: async () => 'bob-token' };
  ctx.auth.currentUser = bob; await ctx.cache(bob);
  finish('alice-token'); await pending;
  expect(ctx._cachedIdToken).toBe('bob-token');
});
test('late notification preference cache cannot overwrite a fresh snapshot', async () => {
  let finishLocal;
  const ctx = vm.createContext({ userId: 'alice', _notificationPreferences: {}, _notificationPreferencesUnsub: null,
    db: {}, appId: 'test', doc: () => ({}), navigator: {},
    LocalStore: { getSetting: () => new Promise(resolve => { finishLocal = resolve; }), putSetting: async () => {} },
    onSnapshot: (_, publish) => { publish({ exists: () => true, data: () => ({ channels: { room: 'none' } }) }); return () => {}; },
  });
  vm.runInContext(declaration('setupNotificationPreferences') + '\nsetupNotificationPreferences("alice");', ctx);
  finishLocal({ channels: { room: 'all' } }); await Promise.resolve();
  expect(ctx._notificationPreferences.channels.room).toBe('none');
});
test('notification batches respect the API recipient limit and preserve mentions', async () => {
  const fetch = jest.fn(async () => ({ ok: true }));
  const ctx = vm.createContext({ userId: 'alice', fetch });
  vm.runInContext(declaration('dispatchMessageNotification') + '\nglobalThis.dispatch = dispatchMessageNotification;', ctx);
  await ctx.dispatch('/notify', { body: JSON.stringify({ senderId: 'alice', receiverIds: Array.from({ length: 121 }, (_, i) => 'u' + i), mentionedUserIds: ['u120'] }) });
  expect(fetch.mock.calls.map(call => JSON.parse(call[1].body).receiverIds.length)).toEqual([50, 50, 21]);
  expect(JSON.parse(fetch.mock.calls[2][1].body).mentionedUserIds).toEqual(['u120']);
  ctx.userId = 'bob'; await ctx.dispatch('/notify', { body: JSON.stringify({ senderId: 'alice', receiverIds: ['u1'] }) });
  expect(fetch).toHaveBeenCalledTimes(3);
});
test('late message ACK cannot move channel metadata behind a newer message', async () => {
  const transaction = { get: async () => ({ exists: () => true, data: () => ({ lastMessageAt: 200 }) }), set: jest.fn() };
  const ctx = vm.createContext({ userId: 'alice', db: {}, appId: 'test', doc: () => ({}), Timestamp: { fromMillis: n => n }, parseTimestampToMs: n => n,
    firestore: async () => ({ runTransaction: async (_, work) => work(transaction) }) });
  vm.runInContext(declaration('updateAcknowledgedMetadata').replace(/import\('[^']+'\)/, 'firestore()') + '\nglobalThis.update = updateAcknowledgedMetadata;', ctx);
  const entry = { ownerId: 'alice', ack: { rtdb: true }, destination: { serverId: 's', roomId: 'r' }, data: { timestamp: 100 } };
  await ctx.update(entry, { lastMessageText: 'old' }); expect(transaction.set).not.toHaveBeenCalled();
  entry.data.timestamp = 300; await ctx.update(entry, { lastMessageText: 'new' });
  expect(transaction.set.mock.calls[0][1]).toMatchObject({ lastMessageAt: 300, lastMessageSender: 'alice' });
});
test('message side effects wait for an ACK, run once after a late ACK, and reject foreign owners', async () => {
  const callbacks = new Map();
  const callback = jest.fn(async () => {});
  const LocalStore = { deleteSetting: jest.fn(async () => {}), putSetting: jest.fn(async () => {}) };
  const prune = jest.fn();
  const ctx = vm.createContext({ userId: 'alice', _afterMessageAck: callbacks, LocalStore, pruneExcessMessages: prune });
  vm.runInContext(declaration('onMessageAcknowledged') + '\nglobalThis.register = onMessageAcknowledged;', ctx);
  const entry = { id: 'fixed', ownerId: 'alice', destination: { dmId: 'alice_bob' }, ack: {}, state: 'waiting' };
  ctx.register(entry, callback);
  expect(callback).not.toHaveBeenCalled();
  expect(prune).not.toHaveBeenCalled();
  entry.ack.rtdb = true;
  const finish = callbacks.get(entry.id);
  await Promise.all([finish(), finish()]);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(prune).toHaveBeenCalledTimes(1);
  expect(entry.sideEffectsDone).toBe(true);
  ctx.register(entry, callback);
  expect(callbacks.size).toBe(0);
  const foreign = { id: 'foreign', ownerId: 'bob', ack: { firestore: true } };
  ctx.register(foreign, callback);
  await Promise.resolve();
  expect(callback).toHaveBeenCalledTimes(1);
});
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
    userId: 'alice', roomNames: {}, _searchFetch: (_, fetch) => fetch(), withReadDeadline: promise => promise,
    ...searchRuntime(),
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
  expect((await ctx.getMessage('one', 'm0000')).id).toBe('m0000');
  expect(await ctx.getMessage('two', 'm0000')).toBeNull();
  const newer = await ctx.getMessagesAfter('one', 100, 'm0100', 20);
  expect(newer.map(message => message.id)).toEqual(Array.from({ length: 20 }, (_, index) => `m${String(index + 101).padStart(4, '0')}`));
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
    userId: 'alice', roomNames: {}, _searchFetch: (_, fetch) => fetch(), withReadDeadline: promise => promise,
    ...searchRuntime(),
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

function searchRuntime() {
 const ctx = vm.createContext({ Date, console });
 vm.runInContext(fs.readFileSync('public/js/search_engine.js', 'utf8').replace(/\bexport /g, '') + '\nglobalThis.api = { parseSearch, matchesSearch };', ctx);
 return ctx.api;
}

test('jump to old cached history needs no network and never replaces the current live timeline', async () => {
  const live = [{ id: 'latest', timestamp: 1000 }];
  const target = { id: 'old', timestamp: 1, channelId: 'server_room' };
  const ctx = vm.createContext({
    window: { revealVirtualMessage: jest.fn() }, document: { getElementById: () => null },
    messagesDisplay: { querySelector: () => null },
    _jumpGeneration: 0, isJumpView: false, jumpViewMessages: [], allLoadedMessages: live,
    lastMessagesData: [], hasMoreJumpOlder: false, hasMoreJumpNewer: false,
    isLoadingJumpOlder: false, isLoadingJumpNewer: false, allowPagination: true,
    captureJumpScope: () => ({ active: () => true, channelId: 'server_room', decrypt: async () => {} }),
    LocalStore: { getMessage: async () => target, getMessages: async () => [], getMessagesAfter: async () => [] },
    withReadDeadline: promise => promise, getMsgTimestamp: time, compareHistoryMessages: runtime().compareHistoryMessages,
    setChannelLoadStatus: jest.fn(), renderMessagesWithReadReceipts: jest.fn(),
    _virtualTimeline: { reset() {} }, _jumpOlderGate: { reset() {} }, _jumpNewerGate: { reset() {} },
    requestAnimationFrame: callback => callback(), doJumpHighlight: jest.fn(), get: jest.fn(),
  });
  vm.runInContext(declaration('jumpToUnloadedMessage'), ctx);
  await ctx.jumpToUnloadedMessage('old');
  expect(ctx.isJumpView).toBe(true);
  expect(ctx.jumpViewMessages[0].id).toBe('old');
  expect(ctx.allLoadedMessages).toBe(live);
  expect(ctx.get).not.toHaveBeenCalled();
});
