const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

function moduleApi(file, names, injected = {}) {
  const ctx = vm.createContext({ console, URL, Blob, DOMException, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, setTimeout, clearTimeout, ...injected });
  const source = fs.readFileSync(`public/js/${file}`, 'utf8').replace(/^import[^\n]*\n/gm, '').replace(/\bexport /g, '');
  vm.runInContext(source + `\nglobalThis.api = {${names.join(',')}};`, ctx);
  return ctx.api;
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('a pending cached decrypt and realtime snapshot must not leave a detached ciphertext copy in the timeline', () => {
  const { mergeChannelRecords } = moduleApi('loading_runtime.js', ['mergeChannelRecords']);
  const cached = { id: 'message', text: 'enc::v1::iv::cipher', _originalText: 'enc::v1::iv::cipher', _decrypted: false };
  const incoming = { id: 'message', text: cached.text };
  const visible = mergeChannelRecords([cached], [incoming]);
  incoming.text = '復号できた本文'; incoming._originalText = cached.text; incoming._decrypted = true;
  expect(visible[0].text).toBe('復号できた本文');
  expect(visible[0]._decrypted).toBe(true);
});

test('first snapshot accepts textless attachments and stickers without aborting the batch', () => {
  const { mergeChannelRecords } = moduleApi('loading_runtime.js', ['mergeChannelRecords']);
  const records = [{ id: 'file', fileData: 'https://app.test/encrypted' }, { id: 'sticker', sticker: '🙂' }, { id: 'message', text: 'enc::v1::iv::cipher' }];
  const merged = mergeChannelRecords([], records);
  expect(merged).toHaveLength(3);
  expect(merged[0]).toBe(records[0]); expect(merged[1]).toBe(records[1]);
  expect(merged[2]).toBe(records[2]);
});

test('a display exception is reported without escaping the realtime callback or stopping later snapshots', async () => {
  const { startIndependentReads } = moduleApi('loading_runtime.js', ['startIndependentReads']);
  let publish;
  const failure = new Error('render failure'), error = jest.fn(), apply = jest.fn(records => { if (records[0]?.id === 'bad') throw failure; });
  const stop = startIndependentReads({ local: async () => [], remote: callback => { publish = callback; return () => {}; }, apply, error });
  await tick();
  expect(() => publish([{ id: 'bad' }])).not.toThrow();
  publish([{ id: 'good' }]);
  expect(error).toHaveBeenCalledWith(failure, 'apply');
  expect(apply).toHaveBeenLastCalledWith([{ id: 'good' }], 'remote');
  stop();
});

function pushWorker(cacheEntries = new Map()) {
  const events = {}, showNotification = jest.fn(async () => {});
  let background;
  const self = { navigator: {}, location: { origin: 'https://app.test' }, addEventListener: (name, handler) => { events[name] = handler; },
    registration: { showNotification, getNotifications: async () => [] } };
  const ctx = vm.createContext({ self, navigator: self.navigator, Response, console: { log() {}, warn() {} },
    importScripts() {}, firebase: { initializeApp() {}, messaging: () => ({ onBackgroundMessage: handler => { background = handler; } }) },
    caches: { open: async () => ({ match: async key => cacheEntries.get(key)?.clone(), put: async (key, value) => { cacheEntries.set(key, value.clone()); } }) },
    clients: { matchAll: async () => [] }, setTimeout: callback => { Promise.resolve().then(callback); return 1; }, clearTimeout() {},
  });
  vm.runInContext(fs.readFileSync('public/firebase-messaging-sw.js', 'utf8'), ctx);
  const message = async data => { const pending = []; events.message({ data, waitUntil: promise => pending.push(promise) }); await Promise.all(pending); };
  return { self, message, background: payload => background(payload), showNotification, ctx };
}

test('push notifications stay account-bound after SW restart, switching accounts, and logout', async () => {
  const entries = new Map(), first = pushWorker(entries);
  await first.message({ type: 'SET_USER_ID', userId: 'alice', idToken: 'alice-token' });
  const restarted = pushWorker(entries);
  await restarted.background({ data: { ownerId: 'alice', messageId: 'one', title: 'Covo', body: 'new', type: 'chat_message' } });
  expect(restarted.showNotification).toHaveBeenCalledTimes(1);
  await restarted.message({ type: 'SET_USER_ID', userId: 'bob' });
  await restarted.message({ type: 'CACHE_AUTH_TOKEN', userId: 'alice', idToken: 'old-token' });
  expect(restarted.self._cachedUserId).toBe('bob'); expect(restarted.self._cachedIdToken).toBeNull();
  await restarted.background({ data: { ownerId: 'alice', messageId: 'two' } });
  await restarted.background({ data: { messageId: 'unscoped' } });
  expect(restarted.showNotification).toHaveBeenCalledTimes(1);
  await restarted.background({ data: { ownerId: 'bob', messageId: 'three', title: 'Covo' } });
  expect(restarted.showNotification).toHaveBeenCalledTimes(2);
  await restarted.message({ type: 'CLEAR_USER_ID' });
  const loggedOut = pushWorker(entries);
  await loggedOut.background({ data: { ownerId: 'bob', messageId: 'four' } });
  expect(loggedOut.showNotification).not.toHaveBeenCalled();
});

test('a stalled IndexedDB read cannot delay realtime subscription or message display', async () => {
  const { startIndependentReads } = moduleApi('loading_runtime.js', ['startIndependentReads']);
  const apply = jest.fn(), remote = jest.fn(publish => { publish([{ id: 'new' }]); return jest.fn(); });
  const stop = startIndependentReads({ local: () => new Promise(() => {}), remote, apply });
  await tick();
  expect(remote).toHaveBeenCalledTimes(1);
  expect(apply).toHaveBeenCalledWith([{ id: 'new' }], 'remote');
  stop();
});

test('late local cache cannot replace current network data or already decrypted text', () => {
  const { mergeChannelRecords } = moduleApi('loading_runtime.js', ['mergeChannelRecords']);
  const current = [{ id: 'one', text: 'new' }];
  expect(mergeChannelRecords(current, [{ id: 'one', text: 'old' }], new Set(['one']))[0].text).toBe('new');
  expect(mergeChannelRecords([{ id: 'one', text: 'plain', _originalText: 'enc::cipher', _decrypted: true }], [{ id: 'one', text: 'enc::cipher', isPinned: true }])[0]).toMatchObject({ text: 'plain', isPinned: true, _decrypted: true });
});

test('room metadata updates preserve the layout signature while names and permissions invalidate it', () => {
  const { roomLayoutSignature } = moduleApi('loading_runtime.js', ['roomLayoutSignature']);
  const first = [{ id: 'room', data: { name: 'General', order: 1, lastMessageAt: 1 } }];
  const next = [{ id: 'room', data: { name: 'General', order: 1, lastMessageAt: 2, lastMessageText: 'cipher' } }];
  expect(roomLayoutSignature(first, [], false)).toBe(roomLayoutSignature(next, [], false));
  expect(roomLayoutSignature([{ id: 'room', data: { ...next[0].data, name: 'Renamed' } }], [], false)).not.toBe(roomLayoutSignature(first, [], false));
});

test('optional voice load completes after navigation without destroying the existing P2P connections', async () => {
  let finish;
  const { createVoiceEngine } = moduleApi('adaptive_voice_feature.js', ['createVoiceEngine'], { console: { log() {}, warn() {}, error() {} } });
  const engine = createVoiceEngine({ loadAgoraLibrary: () => new Promise(resolve => { finish = resolve; }) });
  engine.isActive = true; engine.mode = 'p2p'; engine.channelId = 'old'; engine._localStream = {};
  engine._cleanupAllPeers = jest.fn();
  const pending = engine._switchToAgora();
  engine.channelId = 'new'; finish(); await pending;
  expect(engine._cleanupAllPeers).not.toHaveBeenCalled();
  expect(engine._modeSwitching).toBe(false);
});

test('settings lazy module updates the version through its live context', async () => {
  const label = { textContent: '' }, window = {};
  const { installSettingsFeature } = moduleApi('settings_feature.js', ['installSettingsFeature'], {
    window, document: { querySelectorAll: () => [], getElementById: id => id === 'appInfoVersion' ? label : null },
    fetch: async () => ({ json: async () => ({ version: '1.2.3' }) }),
  });
  const context = { _appVersion: null, updateE2EEStatusUI() {}, updateLayoutDebugUI() {} };
  installSettingsFeature(context); window.switchDiscordSettingsTab('appinfo'); await tick();
  expect(context._appVersion).toBe('1.2.3');
  expect(label.textContent).toBe('v1.2.3');
});

test('navigation disposes a subscription even when its asynchronous initialization completes late', async () => {
  const { startIndependentReads } = moduleApi('loading_runtime.js', ['startIndependentReads']);
  let finish, publish;
  const apply = jest.fn(), cleanup = jest.fn();
  const stop = startIndependentReads({ local: async () => [], remote: callback => { publish = callback; return new Promise(resolve => { finish = resolve; }); }, apply });
  await tick(); stop(); apply.mockClear(); publish([{ id: 'late' }]); finish(cleanup); await tick();
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(apply).not.toHaveBeenCalled();
});

test('read deadlines release the UI without leaving a scheduled timeout behind', async () => {
  jest.useFakeTimers();
  try {
    const { withReadDeadline } = moduleApi('loading_runtime.js', ['withReadDeadline']);
    const result = withReadDeadline(new Promise(() => {}), 1000);
    const assertion = expect(result).rejects.toMatchObject({ code: 'read-timeout' });
    await jest.advanceTimersByTimeAsync(1000); await assertion;
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

test('Windows activation URLs preserve underscore room IDs and reject foreign accounts and schemes', async () => {
  const loading = moduleApi('loading_runtime.js', ['parseNotificationTarget']);
  const api = moduleApi('notification_runtime.js', ['notificationUrl', 'targetFromUrl', 'createNotificationRouter'], loading);
  const openServer = jest.fn(), openDm = jest.fn(), focus = jest.fn();
  const route = api.createNotificationRouter({ uid: () => 'alice', ready: () => true, focus, openServer, openDm });
  const target = { ownerId: 'alice', serverId: 'server', roomId: 'room_with_underscore' };
  await route(api.targetFromUrl(api.notificationUrl(target)));
  expect(openServer).toHaveBeenCalledWith('server', 'room_with_underscore');
  await route({ ...target, ownerId: 'bob' });
  expect(openServer).toHaveBeenCalledTimes(1);
  await route({ ownerId: 'alice', dmId: 'alice_bob' });
  expect(openDm).toHaveBeenCalledWith('bob');
  expect(api.targetFromUrl('https://evil.test')).toBeNull();
});

test('channel notification overrides inherit correctly and mentions require a real match', () => {
  const { allowsNotification } = moduleApi('notification_runtime.js', ['allowsNotification']);
  const preferences = { servers: { server: 'mentions' }, channels: { 'server:quiet': 'none', 'server:loud': 'all' } };
  expect(allowsNotification(preferences, 'server', 'room')).toBe(false);
  expect(allowsNotification(preferences, 'server', 'room', true)).toBe(true);
  expect(allowsNotification(preferences, 'server', 'quiet', true)).toBe(false);
  expect(allowsNotification(preferences, 'server', 'loud')).toBe(true);
});

test('10,000 variable-height messages keep a bounded DOM window and stable ID offsets', () => {
  const { VirtualTimeline } = moduleApi('virtual_timeline.js', ['VirtualTimeline']);
  const timeline = new VirtualTimeline();
  const ids = Array.from({ length: 10000 }, (_, i) => `m${i}`);
  timeline.set(ids);
  for (let i = 0; i < 100; i++) timeline.measure(`m${i}`, 150 + i);
  timeline.rebuild();
  for (let offset = 0; offset < 950000; offset += 10000) {
    const range = timeline.range(offset, 900);
    expect(range.end - range.start).toBeLessThanOrEqual(160);
    expect(range.before).toBeGreaterThanOrEqual(0);
    expect(range.after).toBeGreaterThanOrEqual(0);
  }
  const previous = timeline.offsetOf('m500');
  timeline.set(['new', ...ids]);
  expect(timeline.offsetOf('m500')).toBe(previous + 96);
});

test('search combines sender, channel, file, text and local date filters', () => {
  const { parseSearch, matchesSearch } = moduleApi('search_engine.js', ['parseSearch', 'matchesSearch']);
  const filters = parseSearch('from:me in:general after:2026-10-01 before:2026-10-22 has:file "hello world"');
  const context = { userId: 'alice', roomId: 'room', roomName: 'general', timestamp: new Date(2026, 9, 22, 23, 59).getTime() };
  expect(matchesSearch({ senderId: 'alice', text: 'hello world!', fileName: 'a.pdf' }, filters, context)).toBe(true);
  expect(matchesSearch({ senderId: 'bob', text: 'hello world!', fileName: 'a.pdf' }, filters, context)).toBe(false);
  expect(() => parseSearch('before:2026-02-30')).toThrow();
});

test('concurrent history scans reuse a request while failed requests can be retried', async () => {
  const { createFetchCoalescer } = moduleApi('search_engine.js', ['createFetchCoalescer']);
  const coalesce = createFetchCoalescer(), fetch = jest.fn(async () => 42);
  expect(await Promise.all([coalesce('one', fetch), coalesce('one', fetch)])).toEqual([42, 42]);
  expect(fetch).toHaveBeenCalledTimes(1);
  await expect(coalesce('failure', () => Promise.reject(new Error('offline')))).rejects.toThrow();
  expect(await coalesce('failure', fetch)).toBe(42);
});

test('outbox timeout and repeated retry keep the same in-flight write and message ID', async () => {
  jest.useFakeTimers();
  try {
    const { createOutbox } = moduleApi('outbox.js', ['createOutbox']);
    let finish;
    const write = jest.fn(() => new Promise(resolve => { finish = resolve; }));
    const changed = jest.fn(), persist = jest.fn();
    const outbox = createOutbox({ uid: () => 'alice', persist, changed, write, timeoutMs: 100 });
    const entry = { id: 'fixed', ownerId: 'alice', data: { text: 'enc::cipher' }, ack: {} };
    const first = outbox.attempt(entry);
    await jest.advanceTimersByTimeAsync(100); await first;
    expect(entry.state).toBe('waiting');
    await outbox.attempt(entry);
    expect(write).toHaveBeenCalledTimes(1);
    finish(); await jest.advanceTimersByTimeAsync(1);
    expect(entry.state).toBe('sent');
    expect(outbox.running.size).toBe(0);
  } finally { jest.useRealTimers(); }
});

test('partial backend success survives retry and a different account cannot send it', async () => {
  const { createOutbox } = moduleApi('outbox.js', ['createOutbox']);
  let owner = 'alice';
  const write = jest.fn(async (entry, ack) => { if (!entry.ack.rtdb) ack('rtdb'); if (write.mock.calls.length === 1) throw new Error('firestore unavailable'); ack('firestore'); });
  const outbox = createOutbox({ uid: () => owner, persist: async () => {}, changed: () => {}, write });
  const entry = { id: 'same', ownerId: 'alice', ack: {}, data: { text: 'enc::cipher' } };
  await outbox.attempt(entry); expect(entry.state).toBe('failed'); expect(entry.ack.rtdb).toBe(true);
  await outbox.attempt(entry); expect(entry.state).toBe('sent');
  owner = 'bob'; await expect(outbox.attempt(entry)).rejects.toThrow('送信者');
});

test('encrypted archives roundtrip, reject tampering and do not retain imported executable URLs', async () => {
  const { encodeArchive, decodeArchive, validateArchive } = moduleApi('archive_codec.js', ['encodeArchive', 'decodeArchive', 'validateArchive']);
  const payload = { messages: [{ id: 'one', text: 'private message', fileData: 'javascript:alert(1)' }] };
  const container = await encodeArchive(payload, 'eight-or-more-characters');
  expect(JSON.stringify(container)).not.toContain('private message');
  const decoded = await decodeArchive(container, 'eight-or-more-characters');
  expect(decoded.messages[0].text).toBe('private message');
  expect(decoded.messages[0].fileData).toBe('');
  await expect(decodeArchive(container, 'wrong password')).rejects.toThrow();
  expect(() => validateArchive({ ...container, version: 99 })).toThrow();
  expect(() => validateArchive({ ...container, iterations: 999999999 })).toThrow();
}, 15000);

test('switching local accounts separates history and encrypted outbox settings', async () => {
  const ctx = vm.createContext({ indexedDB: new IDBFactory(), IDBKeyRange, console, window: {}, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync('public/js/local_store.js', 'utf8').replace(/\bexport /g, ''), ctx);
  ctx.setAccountScope('alice');
  await ctx.putMessage({ id: 'one', channelId: 'server_room', timestamp: 1, text: 'enc::alice' });
  await ctx.putSetting('outbox:one', { ownerId: 'alice' });
  ctx.setAccountScope('bob');
  expect(await ctx.getMessages('server_room')).toHaveLength(0);
  expect(await ctx.getSettingsByPrefix('outbox:')).toHaveLength(0);
  ctx.setAccountScope('alice');
  expect(await ctx.getMessages('server_room')).toHaveLength(1);
  expect(await ctx.getSettingsByPrefix('outbox:')).toHaveLength(1);
  (await ctx.initLocalDB()).close();
});

test('archive storage failures are distinguishable from an empty archive list', async () => {
  const { getSettingsByPrefix, deleteSetting } = moduleApi('local_store.js', ['getSettingsByPrefix', 'deleteSetting'], { console: { warn() {} } });
  await expect(getSettingsByPrefix('archive:', { throwOnError: true })).rejects.toThrow('保存領域');
  await expect(getSettingsByPrefix('archive:')).resolves.toEqual([]);
  await expect(deleteSetting('archive:one')).resolves.toBe(false);
});

function transferStore() {
  const storage = new Map();
  const ctx = vm.createContext({ indexedDB: new IDBFactory(), IDBKeyRange, console, window: {}, setTimeout, clearTimeout,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } });
  vm.runInContext(fs.readFileSync('public/js/local_store.js', 'utf8').replace(/\bexport /g, ''), ctx);
  return { ctx, storage };
}

test('foreign or unscoped migration bundles cannot import messages, settings or private keys', async () => {
  const { ctx, storage } = transferStore(); ctx.setAccountScope('bob');
  const bundle = { accountId: 'alice', messages: [{ id: 'private', channelId: 'secret', text: 'enc::private', timestamp: 1 }],
    settings: [{ key: 'outbox:private', value: { ownerId: 'alice' } }], e2eeKeys: { priv: 'private', pub: 'public' } };
  expect(await ctx.restoreAllLocalData(bundle)).toBe(false);
  expect(await ctx.restoreAllLocalData({ ...bundle, accountId: undefined })).toBe(false);
  expect(await ctx.getMessages('secret')).toHaveLength(0);
  expect(await ctx.getSettingsByPrefix('outbox:')).toHaveLength(0);
  expect(storage.size).toBe(0);
  (await ctx.initLocalDB()).close();
});

test('migration aggregation and restore abort when the account changes during initialization', async () => {
  const { ctx } = transferStore(); ctx.setAccountScope('alice'); await ctx.initLocalDB();
  await ctx.putMessage({ id: 'one', channelId: 'secret', text: 'enc::alice', timestamp: 1 });
  const exported = ctx.getAllLocalData();
  ctx.setAccountScope('bob');
  await expect(exported).rejects.toThrow('アカウント');
  ctx.setAccountScope('alice'); await ctx.initLocalDB();
  const restored = ctx.restoreAllLocalData({ accountId: 'alice', messages: [{ id: 'two', channelId: 'secret', timestamp: 2 }] });
  ctx.setAccountScope('bob');
  expect(await restored).toBe(false); expect(await ctx.getMessages('secret')).toHaveLength(0);
  (await ctx.initLocalDB()).close();
});

test('same-account migration preserves ciphertext and rolls back the whole database on invalid data', async () => {
  const { ctx, storage } = transferStore(); ctx.setAccountScope('alice');
  const bundle = { accountId: 'alice', messages: [{ id: 'one', channelId: 'room', timestamp: 1, text: 'preview', _originalText: 'enc::cipher', _decryptedFileUrl: 'blob:stale' }],
    settings: [{ key: 'draft', value: 'saved' }], e2eeKeys: { priv: 'private', pub: 'public' } };
  expect(await ctx.restoreAllLocalData(bundle)).toBe(true);
  const message = await ctx.getMessage('room', 'one');
  expect(message.text).toBe('enc::cipher'); expect(message._decryptedFileUrl).toBeUndefined();
  expect(storage.get('covo_e2ee_priv:alice')).toBe('private');
  const bad = { accountId: 'alice', messages: [{ id: 'two', channelId: 'room', timestamp: 2 }], settings: [{ key: 'invalid', value: () => {} }] };
  expect(await ctx.restoreAllLocalData(bad)).toBe(false);
  expect(await ctx.getMessage('room', 'two')).toBeNull();
  (await ctx.initLocalDB()).close();
});

test('approved legacy migration copies only its channel and never overwrites a recently synced message', async () => {
  const ctx = vm.createContext({ indexedDB: new IDBFactory(), IDBKeyRange, console, window: {}, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync('public/js/local_store.js', 'utf8').replace(/\bexport /g, ''), ctx);
  await ctx.putMessage({ id: 'old', channelId: 'approved', timestamp: 1, text: 'enc::old' });
  await ctx.putMessage({ id: 'edited', channelId: 'approved', timestamp: 2, text: 'enc::stale' });
  await ctx.putMessage({ id: 'private', channelId: 'unapproved', timestamp: 3, text: 'enc::other' });
  ctx.setAccountScope('alice');
  await ctx.putMessage({ id: 'edited', channelId: 'approved', timestamp: 2, text: 'enc::new' });
  expect(await ctx.importLegacyChannel('approved', 'bob')).toBe(0);
  expect(await ctx.importLegacyChannel('approved', 'alice')).toBe(1);
  expect((await ctx.getMessage('approved', 'edited')).text).toBe('enc::new');
  expect(await ctx.getMessages('unapproved')).toHaveLength(0);
  (await ctx.initLocalDB()).close();
});
