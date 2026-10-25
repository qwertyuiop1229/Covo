const fs = require('fs');
const vm = require('vm');
const parser = require('@babel/parser');
function api(file, names, injected = {}) {
  const context = vm.createContext({ console, setTimeout, clearTimeout, Date, ...injected });
  vm.runInContext(fs.readFileSync(`public/js/${file}.js`, 'utf8').replace(/^import[^\n]*\n/gm, '').replace(/\bexport /g, '') + `\nglobalThis.api={${names}};`, context);
  return context.api;
}
const main = fs.readFileSync('public/js/main.js', 'utf8');
const ast = parser.parse(main, { sourceType: 'module' });
function declaration(name) { const node = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === name); return main.slice(node.start, node.end); }

test('maintenance closes all history peers and rejects newly created peers without retaining them', () => {
  const peers = new Set(), unsubscribe = jest.fn();
  const ctx = vm.createContext({ window: { covoMaintenanceBlocked: false }, _p2pHistoryConnections: peers, _p2pLogSyncUnsub: unsubscribe });
  vm.runInContext(declaration('trackP2PHistoryConnection') + declaration('stopP2PHistoryConnections'), ctx);
  const firstClose = jest.fn(), secondClose = jest.fn();
  const first = { close: firstClose }, second = { close: secondClose };
  ctx.trackP2PHistoryConnection(first); ctx.trackP2PHistoryConnection(second); expect(peers.size).toBe(2);
  ctx.stopP2PHistoryConnections(); expect(peers.size).toBe(0); expect(firstClose).toHaveBeenCalledTimes(1); expect(secondClose).toHaveBeenCalledTimes(1); expect(unsubscribe).toHaveBeenCalledTimes(1);
  ctx.window.covoMaintenanceBlocked = true; const rejected = { close: jest.fn() };
  expect(() => ctx.trackP2PHistoryConnection(rejected)).toThrow(); expect(rejected.close).toHaveBeenCalledTimes(1); expect(peers.size).toBe(0);
});

test('offline pruning coalesces bounded work and never submits a token from the previous account', async () => {
  const fetcher = jest.fn(), queue = new Map(); let finishToken;
  const ctx = vm.createContext({ window: {}, navigator: { onLine: false }, userId: 'alice', _pruneRetryQueue: queue, _pruneThrottleMap: new Map(), _prunePendingTimers: new Map(), Date, setTimeout, clearTimeout,
    auth: { currentUser: { getIdToken: () => new Promise(resolve => { finishToken = resolve; }) } }, fetch: fetcher });
  vm.runInContext(declaration('queuePruneRetry') + declaration('pruneExcessMessages'), ctx);
  await ctx.pruneExcessMessages('server','room',null); await ctx.pruneExcessMessages('server','room',null);
  expect(queue.size).toBe(1); expect(fetcher).not.toHaveBeenCalled();
  for (let index = 0; index < 40; index++) await ctx.pruneExcessMessages('server',String(index),null);
  expect(queue.size).toBe(32);
  ctx.navigator.onLine = true; const task = ctx.pruneExcessMessages('server','online',null);
  ctx.userId = 'bob'; finishToken('old-token'); await task; expect(fetcher).not.toHaveBeenCalled();
});

test('presence coalesces repeated focus events, drains real changes, and retries failed writes', async () => {
  const { createStatePublisher } = api('communication_runtime', 'createStatePublisher');
  let finish;
  const write = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  const publish = createStatePublisher(write);
  const first = publish('online', { state: 'online' });
  for (let i = 0; i < 100; i++) publish('online', { state: 'online' });
  await Promise.resolve();
  expect(write).toHaveBeenCalledTimes(1);
  finish(); await first;
  await publish('online', {}); expect(write).toHaveBeenCalledTimes(1);
  const failedWrite = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const retry = createStatePublisher(failedWrite);
  await expect(retry('away', {})).rejects.toThrow('offline');
  await retry('away', {}); await retry('away', {});
  expect(failedWrite).toHaveBeenCalledTimes(2);
});

test('a newer presence state drains even when the previous write fails', async () => {
  const { createStatePublisher } = api('communication_runtime', 'createStatePublisher');
  let fail;
  const write = jest.fn().mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; })).mockResolvedValue(undefined);
  const publish = createStatePublisher(write);
  const first = publish('online', 'online'); await Promise.resolve();
  publish('away', 'away'); fail(new Error('connection lost'));
  await expect(first).rejects.toThrow('connection lost');
  expect(write.mock.calls.map(args => args[0])).toEqual(['online', 'away']);
  await publish('away', 'away'); expect(write).toHaveBeenCalledTimes(2);
});

test('a synchronous failure does not leave the state publisher stuck', async () => {
  const { createStatePublisher } = api('communication_runtime', 'createStatePublisher');
  const write = jest.fn().mockImplementationOnce(() => { throw Error('sync'); }).mockResolvedValue(undefined);
  const publish = createStatePublisher(write);
  await expect(publish('online', 1)).rejects.toThrow('sync');
  await publish('online', 2); expect(write).toHaveBeenCalledTimes(2);
});

test('a write queued at completion is never stranded in the finalization microtask', async () => {
  const { createStatePublisher } = api('communication_runtime', 'createStatePublisher');
  let finish;
  const write = jest.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(undefined);
  const publish = createStatePublisher(write);
  const first = publish('online', 1); await Promise.resolve();
  finish();
  await Promise.resolve(); // the drain has finished, its returned promise is settling
  const last = publish('away', 2);
  await first; await last;
  expect(write.mock.calls.map(args => args[0])).toEqual([1, 2]);
});

test('pending legacy envelopes migrate to RTDB without requiring a new Firestore copy', () => {
  const { requiredMessageBackends } = api('communication_runtime', 'requiredMessageBackends,usesRealtimeOnly');
  expect(requiredMessageBackends({ destination: {}, data: { storageVersion: 2 } })).toEqual(['rtdb']);
  expect(requiredMessageBackends({ destination: {}, data: {} })).toEqual(['rtdb']);
  expect(requiredMessageBackends({ destination: {}, data: {}, ack: { firestore: true } })).toEqual(['firestore']);
  expect(requiredMessageBackends({ destination: { dmId: 'alice_bob' }, data: {} })).toEqual(['rtdb']);
});

test('actual send adapter saves one RTDB body and no Firestore body for new messages', async () => {
  const { requiredMessageBackends, usesRealtimeOnly } = api('communication_runtime', 'requiredMessageBackends,usesRealtimeOnly');
  const variable = ast.program.body.find(n => n.type === 'VariableDeclaration' && n.declarations.some(d => d.id.name === '_outbox'));
  const adapter = variable.declarations[0].init.arguments[0].properties.find(p => p.key.name === 'write').value;
  const set = jest.fn(), setDoc = jest.fn(), acknowledged = jest.fn();
  const context = vm.createContext({ userId:'alice',window:{},auth: { currentUser: { uid: 'alice' } }, CLIENT_PROTOCOL: 2, assertSupportedClient() {}, reconcileLegacyOutbox: async entry => { entry.data.storageVersion = 2; entry.data.clientProtocol = 2; }, requiredMessageBackends, usesRealtimeOnly,
    _getOrInitRTDB: async () => ({}), ref: (_, path) => path, appId: 'testApp', set, setDoc,
    doc: (_, path, id) => path + '/' + id, db: {}, Timestamp: { fromMillis: value => value },
    LocalStore: { putSetting: async () => {} }, withReadDeadline: value => value, Promise });
  vm.runInContext('globalThis.write = ' + main.slice(adapter.start, adapter.end), context);
  const base = { ownerId: 'alice', id: 'msg_12345678901234567890123456789012', destination: { serverId: 'server', roomId: 'room' }, ack: {}, data: { id: 'msg_12345678901234567890123456789012', senderId: 'alice', text: 'enc::cipher', timestamp: 10 } };
  await context.write({ ...base, data: { ...base.data, storageVersion: 2 } }, acknowledged);
  expect(set).toHaveBeenCalledTimes(1); expect(setDoc).not.toHaveBeenCalled(); expect(acknowledged).toHaveBeenCalledWith('rtdb');
  const serialized = JSON.stringify(set.mock.calls[0][1]);
  expect(set.mock.calls[0][1].id).toBeUndefined(); expect(set.mock.calls[0][1].storageVersion).toBe(2);
  expect(serialized.length).toBeLessThan(JSON.stringify(base.data).length);
  set.mockClear(); acknowledged.mockClear();
  await context.write({ ...base, ack: {} }, acknowledged);
  expect(set).toHaveBeenCalledTimes(1); expect(setDoc).not.toHaveBeenCalled();
});

test('membership changes preserve unchanged live listeners instead of replaying their initial snapshots', () => {
  const { createSubscriptionRegistry } = api('communication_runtime', 'createSubscriptionRegistry');
  const registry = createSubscriptionRegistry(); const stops = {}; const subscribe = jest.fn(key => stops[key] = jest.fn());
  registry.reconcile(['alice', 'bob'], subscribe);
  registry.reconcile(['bob', 'alice'], subscribe);
  registry.reconcile(['bob', 'carol'], subscribe);
  expect(subscribe).toHaveBeenCalledTimes(3); expect(stops.alice).toHaveBeenCalledTimes(1); expect(stops.bob).not.toHaveBeenCalled();
  registry.clear(); expect(stops.bob).toHaveBeenCalledTimes(1); expect(stops.carol).toHaveBeenCalledTimes(1);
});

test('a synchronously cancelled subscription can recover without retaining a dead listener', () => {
  const { createSubscriptionRegistry } = api('communication_runtime', 'createSubscriptionRegistry');
  const registry = createSubscriptionRegistry(), cancelled = jest.fn(), healthy = jest.fn();
  registry.reconcile(['alice'], () => { registry.invalidate('alice'); return cancelled; });
  expect(registry.size).toBe(0); expect(cancelled).toHaveBeenCalledTimes(1);
  registry.reconcile(['alice'], () => healthy); expect(registry.size).toBe(1);
  registry.clear(); expect(healthy).toHaveBeenCalledTimes(1); expect(cancelled).toHaveBeenCalledTimes(1);
});

test('5,000 initial presence snapshots produce one derived list render per frame', () => {
  let frame;
  const requestAnimationFrame = jest.fn(callback => { frame = callback; return 1; });
  const context = vm.createContext({ _presenceRenderFrame: null, _presenceOwner: 'alice', userId: 'alice', _presenceUsers: new Map(), cachedUsers: [], requestAnimationFrame,
    requestRenderMembersList: jest.fn(), renderFriendTabs: jest.fn(), renderDmConversationsList: jest.fn() });
  vm.runInContext(declaration('requestPresenceRender'), context);
  for (let index = 0; index < 5000; index++) { context._presenceUsers.set('user' + index, { id: 'user' + index }); context.requestPresenceRender(); }
  expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  frame(); expect(context.cachedUsers).toHaveLength(5000); expect(context.renderFriendTabs).toHaveBeenCalledTimes(1);
  context.requestPresenceRender();
  context._presenceOwner = context.userId = 'bob'; context._presenceUsers.clear(); context._presenceUsers.set('bob', { id: 'bob' });
  frame(); expect(context.cachedUsers.map(user => user.id)).toEqual(['bob']);
});

test('profile reads coalesce and an old account response cannot replace the new account cache or request', async () => {
  const assignment = ast.program.body.find(n => n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression' && main.slice(n.expression.left.start, n.expression.left.end) === 'window.getUserProfile');
  let oldResolve, newResolve, reads = 0;
  const oldRead = new Promise(resolve => { oldResolve = resolve; });
  const newRead = new Promise(resolve => { newResolve = resolve; });
  const context = vm.createContext({ window: { _userProfileCache: new Map() }, _userProfilePromises: new Map(), userId: 'alice', auth: { currentUser: { uid: 'alice' } }, cachedUsers: [], friendRelationships: {}, db: {}, doc: () => ({}),
    getDoc: jest.fn(() => ++reads <= 2 ? oldRead : newRead), appId: 'testApp', Promise, console });
  vm.runInContext(main.slice(assignment.start, assignment.end), context);
  const old = context.window.getUserProfile('bob');
  const coalesced = context.window.getUserProfile('bob'); expect(context.getDoc).toHaveBeenCalledTimes(2);
  context.userId = 'mallory'; context.auth.currentUser = { uid: 'mallory' }; context._userProfilePromises.clear();
  const current = context.window.getUserProfile('bob'); const pending = context._userProfilePromises.get('bob');
  oldResolve({ exists: () => true, data: () => ({ nickname: 'stale alias' }) }); await old; await coalesced;
  expect(context._userProfilePromises.get('bob')).toBe(pending); expect(context.window._userProfileCache.has('bob')).toBe(false);
  newResolve({ exists: () => true, data: () => ({ nickname: 'Bob', avatarUrl: '' }) });
  expect((await current).nickname).toBe('Bob'); expect(context.window._userProfileCache.get('bob').nickname).toBe('Bob');
});

test('inbox derivation and initial room loading do not issue parallel Firestore queries', () => {
  expect(declaration('scanAllUnreadAndRender')).not.toMatch(/getDocs\(/);
  expect(declaration('setupGlobalNotificationListeners')).not.toMatch(/getDocs\(/);
  const rooms = declaration('loadServerRooms');
  expect(rooms).not.toMatch(/getDocs\(roomsQuery\)/);
});

test('updater shares concurrent checks, downloads once, verifies through SDK, and waits for explicit apply', async () => {
  const { createUpdateController } = api('update_controller', 'createUpdateController');
  let busy = true;
  const resource = { version: '2.0.0', close: jest.fn(), download: jest.fn(async event => { event({ event: 'Started', data: { contentLength: 100 } }); event({ event: 'Progress', data: { chunkLength: 100 } }); }), install: jest.fn() };
  const check = jest.fn(async () => resource);
  const controller = createUpdateController({ check, busy: () => busy });
  await Promise.all([controller.check(), controller.check()]); expect(check).toHaveBeenCalledTimes(1);
  await controller.download(); expect(resource.download).not.toHaveBeenCalled();
  busy = false; await controller.download();
  expect(controller.state).toMatchObject({ phase: 'ready', downloaded: 100, total: 100 });
  await controller.check(); await controller.download(); expect(resource.download).toHaveBeenCalledTimes(1);
  expect(resource.install).not.toHaveBeenCalled();
  busy = true; await expect(controller.apply()).rejects.toThrow('通話');
  expect(controller.state.phase).toBe('ready');
  busy = false; await controller.apply(); expect(resource.install).toHaveBeenCalledTimes(1);
});

test('untrusted update downloads never become ready or installable', async () => {
  const { createUpdateController } = api('update_controller', 'createUpdateController');
  const install = jest.fn();
  const controller = createUpdateController({ check: async () => ({ version: '2', download: async () => { throw Error('signature mismatch'); }, install }) });
  await controller.check(); await expect(controller.download()).rejects.toThrow('signature');
  await expect(controller.apply()).rejects.toThrow('ダウンロード'); expect(install).not.toHaveBeenCalled();
});

test('device migration send blocks updater while connecting and releases after a rejected session', async () => {
  const assignments = ast.program.body.filter(node => node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression');
  const find = name => assignments.find(node => node.expression.left.object?.name === 'window' && node.expression.left.property?.name === name);
  let resolveSession;
  const button = { disabled: false }, input = { value: 'COVO-AAAA-BBBB' };
  const context = vm.createContext({
    window: {}, document: { getElementById: id => id === 'migrationSendCodeInput' ? input : id === 'startSendMigrationBtn' ? button : null },
    authTransition: { busy: false }, _migrationSendBusy: false, activeMigrationSession: null, _fsRole: null, _fsId: null, _callId: null, _isVoiceRecording: false, isSendingMessage: false, _outboxEntries: new Map(),
    db: {}, appId: 'testApp', userId: 'alice', doc: () => ({}), alertMessage: jest.fn(), clearTimeout,
    getDoc: () => new Promise(resolve => { resolveSession = resolve; })
  });
  for (const name of ['initiateMigrationSend', 'covoDesktopBusy']) { const node = find(name); vm.runInContext(main.slice(node.start, node.end), context); }
  const pending = context.window.initiateMigrationSend();
  expect(context.window.covoDesktopBusy()).toBe(true);
  expect(button.disabled).toBe(true);
  resolveSession({ exists: () => false }); await pending;
  expect(context.window.covoDesktopBusy()).toBe(false);
  expect(button.disabled).toBe(false);
  context._fsRole = 'sender'; expect(context.window.covoDesktopBusy()).toBe(true);
  context._fsRole = 'receiver'; expect(context.window.covoDesktopBusy()).toBe(true);
  context._fsRole = null; context._fsId = 'pending-file'; expect(context.window.covoDesktopBusy()).toBe(true);
  context._fsId = null; expect(context.window.covoDesktopBusy()).toBe(false);
});


test('a check during download waits and reports the retained update rather than a false current result', async () => {
  const { createUpdateController } = api('update_controller', 'createUpdateController'); let finish;
  const resource = { version: '2', close: jest.fn(), download: jest.fn(() => new Promise(resolve => { finish = resolve; })), install: jest.fn() };
  const check = jest.fn(async () => resource); const c = createUpdateController({ check });
  await c.check(); const downloading = c.download(); await Promise.resolve();
  const checking = c.check(); finish(); await downloading;
  expect(await checking).toBe(true); expect(check).toHaveBeenCalledTimes(1); expect(c.state.phase).toBe('ready');
});

test('apply queued behind download rechecks busy and cannot accidentally return download success', async () => {
  const { createUpdateController } = api('update_controller', 'createUpdateController'); let finish, busy = false;
  const resource = { version: '2', download: () => new Promise(resolve => { finish = resolve; }), install: jest.fn() };
  const c = createUpdateController({ check: async () => resource, busy: () => busy });
  await c.check(); const downloading = c.download(); await Promise.resolve();
  const applying = c.apply(); busy = true; finish(); await downloading;
  await expect(applying).rejects.toThrow('通話'); expect(resource.install).not.toHaveBeenCalled(); expect(c.state.phase).toBe('ready');
  busy = false; await c.apply(); expect(resource.install).toHaveBeenCalledTimes(1);
});


test('legacy metadata updates cannot let deleting an old ID overwrite a newer last-message pointer', () => {
  const { metadataRefersToMessage } = api('communication_runtime', 'metadataRefersToMessage');
  const mixed = { lastMessageId: 'old', lastMessageStorageTimestamp: 10 };
  expect(metadataRefersToMessage(mixed, 'old', 10, 20)).toBe(false);
  expect(metadataRefersToMessage(mixed, 'new-legacy', 20, 20)).toBe(true);
  expect(metadataRefersToMessage(mixed, 'different', 10, 10)).toBe(false);
  expect(metadataRefersToMessage(mixed, 'old', 10, 10)).toBe(true);
  expect(metadataRefersToMessage({}, 'legacy', 10, 10)).toBe(true);
  expect(metadataRefersToMessage(null, 'old', 0, 0)).toBe(false);
});

test('profile initialization never treats offline absence as a confirmed new user', () => {
  let initializer;
  const walk = node => { if (!node || typeof node !== 'object') return; if (node.type === 'VariableDeclarator' && node.id?.name === 'isConfirmedNewUser') initializer = main.slice(node.init.start, node.init.end); for (const value of Object.values(node)) { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value); } };
  walk(ast);
  const evaluate = ({ fromCache, exists, root = {}, local = false }) => vm.runInNewContext(initializer, { userProfileSnap: { metadata: { fromCache }, exists: () => exists }, hasLocalCache: local, confirmedRootProfile: root });
  expect(evaluate({ fromCache: true, exists: false })).toBe(false);
  expect(evaluate({ fromCache: false, exists: false, root: null })).toBe(false);
  expect(evaluate({ fromCache: false, exists: false, root: { nickname: 'Existing' } })).toBe(false);
  expect(evaluate({ fromCache: false, exists: false })).toBe(true);
  expect(evaluate({ fromCache: false, exists: false, local: true })).toBe(false);
});


test.each(['account-change', 'unsubscribe', 'registration-failure'])('late presence connection callback is contained: %s', async scenario => {
  let callback;
  const walk = node => { if (!node || typeof node !== 'object') return; if (node.type === 'VariableDeclarator' && node.id?.name === 'onConnected') callback = main.slice(node.init.start, node.init.end); for (const value of Object.values(node)) { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value); } };
  walk(ast);
  let finish, fail; const update = jest.fn(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
  const context = vm.createContext({ connectedLive: true, connectedOwner: 'alice', userId: 'alice', auth: { currentUser: { uid: 'alice' } },
    _presenceConnectionEpoch: 0, _rtdbStatusRef: null, _rtdbOnDisconnect: null, rtdb: {}, ref: (_, path) => path,
    rtdbOnDisconnect: () => ({ update }), serverTimestamp: () => ({ '.sv': 'timestamp' }), updateUserStatus: jest.fn(), console: { warn: jest.fn() } });
  vm.runInContext('globalThis.onConnected = ' + callback, context);
  const pending = context.onConnected({ val: () => true });
  expect(update.mock.calls[0][0]).toEqual({ state: 'offline', last_changed: { '.sv': 'timestamp' } });
  if (scenario === 'account-change') { context.userId = 'bob'; context.auth.currentUser = { uid: 'bob' }; }
  if (scenario === 'unsubscribe') context.connectedLive = false;
  if (scenario === 'registration-failure') fail(Error('permission-denied')); else finish();
  await expect(pending).resolves.toBeUndefined(); expect(context.updateUserStatus).not.toHaveBeenCalled();
});


test('public Windows downloads prefer the branded setup and retain old releases as fallback', () => {
  const { selectWindowsInstaller } = api('communication_runtime', 'selectWindowsInstaller');
  const raw = { name: 'Covo_1.1.282_x64-setup.exe' }, branded = { name: 'CovoSetup.exe' };
  expect(selectWindowsInstaller([raw, { name: 'latest.json' }, branded])).toBe(branded);
  expect(selectWindowsInstaller([raw])).toBe(raw);
  expect(selectWindowsInstaller(null)).toBeUndefined();
  expect(selectWindowsInstaller([null, { name: 'CovoSetup.exe.sig' }])).toBeUndefined();
});


test('startup root-profile repair fills missing fields without overwriting concurrent edits or explicit cleared values', () => {
  const { missingProfileFields } = api('communication_runtime', 'missingProfileFields');
  const stale = { nickname: 'Old', avatarUrl: 'old.png', aboutMe: 'Old description', email: 'a@test.invalid' };
  expect(missingProfileFields({ nickname: 'New', avatarUrl: null, aboutMe: '' }, stale)).toEqual({ email: 'a@test.invalid' });
  expect(missingProfileFields({ ...stale, nickname: 'New' }, stale)).toEqual({});
  expect(missingProfileFields(null, { ...stale, ignored: undefined })).toEqual(stale);
});


test('request deadlines work without AbortSignal.timeout and release timers on success and failure', async () => {
  jest.useFakeTimers();
  try {
    const { fetchWithTimeout } = api('communication_runtime', 'fetchWithTimeout', { AbortController });
    await fetchWithTimeout(async () => 'ok', '/api', {}, 1000); expect(jest.getTimerCount()).toBe(0);
    await expect(fetchWithTimeout(async () => { throw Error('network'); }, '/api', {}, 1000)).rejects.toThrow('network'); expect(jest.getTimerCount()).toBe(0);
    const blocked = fetchWithTimeout((_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('aborted')), { once: true })), '/api', {}, 1000);
    const assertion = expect(blocked).rejects.toThrow('aborted'); await jest.advanceTimersByTimeAsync(1000); await assertion;
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});


test('protocol fetch preserves the Request and adds a marker only to Worker mutations', async () => {
  const { createProtocolFetch } = api('client_protocol', 'createProtocolFetch', { URL, Headers });
  const fetcher = jest.fn(async () => new Response('{}'));
  const send = createProtocolFetch(fetcher);
  const controller = new AbortController();
  const request = new Request('https://simplechat-api.astro-fray-server.workers.dev/api/reportError', { method: 'POST', headers: { Authorization: 'Bearer secret' }, body: '{"payload":1}', signal: controller.signal });
  await send(request);
  expect(fetcher.mock.calls[0][0]).toBe(request);
  expect(fetcher.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer secret');
  expect(fetcher.mock.calls[0][1].headers.get('X-Covo-Protocol')).toBe('2');
  const forwarded = new Request(fetcher.mock.calls[0][0], fetcher.mock.calls[0][1]);
  expect(await forwarded.text()).toBe('{"payload":1}');
  controller.abort(); expect(forwarded.signal.aborted).toBe(true);
  for (const url of ['https://other.test/api/reportError', 'https://simplechat-api.astro-fray-server.workers.dev.evil.test/api/reportError']) {
    const options = { method: 'POST', body: '{}' }; await send(url, options);
    expect(fetcher.mock.calls.at(-1)[1]).toBe(options);
  }
  await send('https://simplechat-api.astro-fray-server.workers.dev/api/health');
  expect(fetcher.mock.calls.at(-1)[1]).toBeUndefined();
});

test('one 426 stops subsequent writes without retry traffic and keeps reads available', async () => {
  const window = { dispatchEvent: jest.fn() };
  const { createProtocolFetch, assertSupportedClient, requireClientUpdate } = api('client_protocol', 'createProtocolFetch,assertSupportedClient,requireClientUpdate', { URL, Headers, Event, window });
  const fetcher = jest.fn(async () => new Response('{}', { status: 426 }));
  const send = createProtocolFetch(fetcher);
  expect((await send('https://simplechat-api.astro-fray-server.workers.dev/api/reportError', { method: 'POST' })).status).toBe(426);
  expect(assertSupportedClient).toThrow('最新版');
  requireClientUpdate(); expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
  await expect(send('https://simplechat-api.astro-fray-server.workers.dev/api/reportError', { method: 'POST' })).rejects.toThrow('最新版');
  expect(fetcher).toHaveBeenCalledTimes(1);
  await send('https://simplechat-api.astro-fray-server.workers.dev/api/health');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test.each([['v1.1.281',false],['1.1.282',true],['1.1.1000',true],['1.2.0',true],['2.0.0',true],['1.1.282-beta',false],['junk',false]])('rollback compatibility floor %s -> %s', (version, expected) => {
  const { supportsWindowsVersion } = api('client_protocol', 'supportsWindowsVersion');
  expect(supportsWindowsVersion(version)).toBe(expected);
});

function legacyReconciliation({ realtime = null, firestore = null, dm = false, status = 200, switchAccount = false, ack = {} } = {}) {
  const account = { uid: 'alice', getIdToken: async () => 'secret' };
  const entry = { id: 'msg_legacy', ownerId: 'alice', destination: dm ? { dmId: 'alice_bob' } : { serverId: 'server', roomId: 'room' }, ack, data: { senderId: 'alice', text: 'enc::cipher', timestamp: 5 } };
  const reads = jest.fn(async () => ({ exists: () => !!firestore, data: () => firestore }));
  const persist = jest.fn(async () => {}), acknowledged = jest.fn(backend => { entry.ack[backend] = true; });
  const context = vm.createContext({ CLIENT_PROTOCOL: 2, usesRealtimeOnly: data => data.storageVersion >= 2, auth: { currentUser: account }, userId: 'alice', withReadDeadline: value => value,
    firebaseConfig: { databaseURL: 'https://rtdb.test' }, fetch() {}, fetchWithTimeout: async () => {
      if (switchAccount) context.auth.currentUser = { uid: 'bob' };
      return { ok: status === 200, status, json: async () => realtime };
    }, getDocFromServer: reads, db: {}, doc: (_, path) => path, LocalStore: { putSetting: persist } });
  vm.runInContext(declaration('reconcileLegacyOutbox').replace("await import('../vendor/firebase/firebase-firestore.js')", '({ getDocFromServer: globalThis.getDocFromServer })'), context);
  return { entry, reads, persist, acknowledged, run: () => context.reconcileLegacyOutbox(entry, 'artifacts/test/path/message', acknowledged) };
}

test.each([false, true])('legacy unsent envelope migrates without altering encrypted bytes or ID (DM=%s)', async dm => {
  const test = legacyReconciliation({ dm }); await test.run();
  expect(test.entry.data).toEqual({ senderId: 'alice', text: 'enc::cipher', timestamp: 5, storageVersion: 2, clientProtocol: 2 });
  expect(test.entry.id).toBe('msg_legacy'); expect(test.acknowledged).not.toHaveBeenCalled();
  expect(test.persist).toHaveBeenCalledTimes(1); expect(test.reads).toHaveBeenCalledTimes(dm ? 0 : 1);
});

test.each(['rtdb','firestore'])('legacy body already in %s is acknowledged without migration or copying', async backend => {
  const existing = { senderId: 'alice', text: 'enc::edited' };
  const test = legacyReconciliation(backend === 'rtdb' ? { realtime: existing } : { firestore: existing });
  await test.run(); expect(test.acknowledged).toHaveBeenCalledWith(backend); expect(test.persist).not.toHaveBeenCalled();
  expect(test.entry.data.storageVersion).toBeUndefined();
});

test.each(['owner', 'account', 'network'])('legacy reconciliation fails closed on %s failure', async failure => {
  const test = legacyReconciliation({ realtime: failure === 'owner' ? { senderId: 'bob' } : null, switchAccount: failure === 'account', status: failure === 'network' ? 403 : 200 });
  await expect(test.run()).rejects.toThrow(); expect(test.acknowledged).not.toHaveBeenCalled();
  expect(test.persist).not.toHaveBeenCalled(); expect(test.entry.data.storageVersion).toBeUndefined();
});

test('acknowledged legacy envelope is never re-read or migrated', async () => {
  const test = legacyReconciliation({ ack: { firestore: true } });
  await test.run(); expect(test.reads).not.toHaveBeenCalled(); expect(test.persist).not.toHaveBeenCalled();
});

test('strict production rollout waits for a published signed Windows update', () => {
  const deploy = fs.readFileSync('deploy.ps1', 'utf8');
  expect(deploy.indexOf('git push origin HEAD --tags')).toBeLessThan(deploy.indexOf('firebase deploy --only "firestore:rules,database"'));
  for (const check of ['Wait-CovoReleaseChecks -Repo', 'Assert-CovoPublishedRelease -Release']) {
    expect(deploy.indexOf(check)).toBeGreaterThan(0);
    expect(deploy.indexOf(check)).toBeLessThan(deploy.indexOf('firebase deploy --only "firestore:rules,database"'));
  }
  expect(deploy).toContain('$versionData.version = $newVersion');
});


test('an unacknowledged v2 outbox without a protocol marker migrates without a Firestore read', async () => {
  const test = legacyReconciliation(); test.entry.data.storageVersion = 2;
  await test.run(); expect(test.entry.data.clientProtocol).toBe(2); expect(test.reads).not.toHaveBeenCalled();
});


test('a failed media network request is not retried because it happened inside a cache try block', async () => {
  const fetch = jest.fn(async () => { throw Error('offline'); });
  const cache = { match: async () => null, put: jest.fn() };
  const context = vm.createContext({ window: { caches: {} }, caches: { open: async () => cache }, fetch });
  vm.runInContext(declaration('fetchWithMediaCache'), context);
  await expect(context.fetchWithMediaCache('https://file.test/encrypted')).rejects.toThrow('offline');
  expect(fetch).toHaveBeenCalledTimes(1); expect(cache.put).not.toHaveBeenCalled();
});

test('local diagnostics computes nearest-rank percentiles and does not export private context or unknown traffic as zero total', () => {
  const traffic = { snapshot: () => ({ counters: { 'firestore.setDoc': 2 } }), reset: jest.fn() };
  const { createDiagnostics } = api('diagnostics_runtime', 'createDiagnostics', { traffic, CLIENT_PROTOCOL: 2 });
  let now = 100; const metrics = createDiagnostics(() => now);
  for(let value = 1; value <= 100; value++) metrics.timing('api/syncRtdb', value);
  metrics.resource({ transferSize: 120 }); metrics.resource({ transferSize: 0 }); metrics.resource({});
  metrics.longTask(51); metrics.shift(.1); metrics.failure('http.404'); now=250;
  const report = metrics.report({ version: '1.1.282', email: 'PRIVATE_EMAIL', token: 'PRIVATE_TOKEN', message: 'PRIVATE_MESSAGE' });
  expect(report.stability.timings['api/syncRtdb']).toEqual({ count:100, sampleCount:64, p50Ms:68, p95Ms:97 });
  expect(report.elapsedMs).toBe(150); expect(report.network.observedHttpTransferBytes).toBe(120);
  expect(report.network.zeroOrUnknownTransferCount).toBe(2); expect(report.memory.jsHeapUsedBytes).toBeNull();
  expect(JSON.stringify(report)).not.toContain('PRIVATE_');
  metrics.reset(); expect(traffic.reset).toHaveBeenCalledTimes(1); expect(metrics.report().stability.timings).toEqual({});
});


test('FCM enable/disable operations serialize while permission is requested in the original gesture', async () => {
  let finish;const events=[];
  const Notification={permission:'default',requestPermission:jest.fn(async()=> 'granted')};
  const context=vm.createContext({Promise,_fcmLifecycle:Promise.resolve(),userId:'alice',isTauri:false,window:{Notification},Notification,
    setBrowserPushEnabledNow:async enabled=>{ events.push(enabled); }});
  vm.runInContext(declaration('queueFcmLifecycle')+'\n'+declaration('setBrowserPushEnabled'),context);
  const blocker=context.queueFcmLifecycle(()=>new Promise(resolve=>{finish=resolve;}));await new Promise(setImmediate);
  const enabled=context.setBrowserPushEnabled(true);const disabled=context.setBrowserPushEnabled(false);
  expect(Notification.requestPermission).toHaveBeenCalledTimes(1);expect(events).toEqual([]);
  finish();await blocker;await enabled;await disabled;expect(events).toEqual([true,false]);
});

test('an old account cannot apply a queued push preference to the new account', async () => {
  let finish;const changed=jest.fn();const context=vm.createContext({Promise,_fcmLifecycle:Promise.resolve(),userId:'alice',isTauri:false,window:{},setBrowserPushEnabledNow:changed});
  vm.runInContext(declaration('queueFcmLifecycle')+'\n'+declaration('setBrowserPushEnabled'),context);
  const blocker=context.queueFcmLifecycle(()=>new Promise(resolve=>{finish=resolve;}));await new Promise(setImmediate);
  const queued=context.setBrowserPushEnabled(false);context.userId='bob';finish();await blocker;await queued;expect(changed).not.toHaveBeenCalled();
});

test('maintenance admission initializes local UI once and never starts a delayed listener after blocking', () => {
  const initialize = jest.fn(), listen = jest.fn(), timers = [];
  const context = vm.createContext({ _admittedUIInitialized:false, window:{covoMaintenanceBlocked:true},
    initSettings:initialize, initPinLockSystem:jest.fn(), initializeResizer:jest.fn(), setDiscordUIMode:jest.fn(),
    localStorage:{getItem:()=>null}, setTimeout:fn=>timers.push(fn), setupGlobalAnnouncementListener:listen });
  vm.runInContext(declaration('initializeAdmittedUI'),context);
  context.initializeAdmittedUI(); expect(initialize).not.toHaveBeenCalled();
  context.window.covoMaintenanceBlocked=false; context.initializeAdmittedUI(); context.initializeAdmittedUI();
  expect(initialize).toHaveBeenCalledTimes(1); expect(timers).toHaveLength(1);
  context.window.covoMaintenanceBlocked=true; timers[0](); expect(listen).not.toHaveBeenCalled();
});

test('temporary missing-file cache expires and is bounded, with an explicit manual retry escape', () => {
  let now=1000;const writes=jest.fn();const context=vm.createContext({_missingFilesSet:new Map(),MISSING_FILE_TTL:120000,Date:{now:()=>now},localStorage:{setItem:writes}});
  vm.runInContext(['saveMissingFiles','markFileAsMissing','isFileMissing','unmarkFileAsMissing'].map(declaration).join('\n'),context);
  context.markFileAsMissing('file');expect(context.isFileMissing('file')).toBe(true);
  now+=120000;expect(context.isFileMissing('file')).toBe(false);
  for(let i=0;i<510;i++)context.markFileAsMissing('file'+i);expect(context._missingFilesSet.size).toBe(500);
  context.unmarkFileAsMissing('file509');expect(context.isFileMissing('file509')).toBe(false);
});
