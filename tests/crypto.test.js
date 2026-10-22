const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { TextEncoder, TextDecoder } = require('util');

function loadCrypto() {
  const writes = [];
  const ctx = vm.createContext({
    window: { crypto: webcrypto }, location: { protocol: 'https:' }, console,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, DataView, Blob, CryptoKey: class CryptoKey {}, setTimeout, clearTimeout,
    _abToB64: ab => Buffer.from(ab).toString('base64'), _b64ToAb: str => Uint8Array.from(Buffer.from(str, 'base64')).buffer,
    doc: (_, path) => path, collection: (_, path) => path, query: path => path, limit: () => 1,
    getDoc: async path => ({ exists: () => !path.includes('/roomKeys/') && path.endsWith('/rooms/room1'), data: () => ({ currentKeyVersion: 1 }) }),
    getDocs: async () => ({ empty: true }), serverTimestamp: () => 123,
    setDoc: async (path, data) => { writes.push({ path, data }); }, updateDoc: async () => {},
    LocalStore: { putMessage: async () => {} }
  });
  const source = fs.readFileSync('public/js/crypto_helpers.js', 'utf8').replace(/^import[^\n]*\n/gm, '').replace(/\bexport /g, '');
  vm.runInContext(source + '\nglobalThis.api = { migrateLegacyDmSharedKey, observeRoomKeyVersion, roomKeyVersionIsCurrent, roomKeyScope, _getOrCreateRoomKey, _backfillDmKeysForParticipant, setCryptoAccount, __lsGet, __lsSet, __ensureE2EEKeysImpl, _e2ee, initCryptoContext, _encryptText, _encryptFileE2EE, _decryptFileE2EE, __distributeRoomKeyVersion, __getOrCreateRoomKeyImpl };', ctx);
  ctx.api.initCryptoContext({ getDb: () => ({}), getAppId: () => 'testApp', getUserId: () => 'alice', getIsAdmin: () => false });
  return { ctx, api: ctx.api, writes };
}

test.each(['1', '254', '255', '1790000000000'])('file encryption preserves version %s, round-trips and rejects tampering', async version => {
  const { api, ctx } = loadCrypto();
  const key = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  ctx.CryptoKey = key.constructor;
  const keys = { latest: key, latestVersion: version, [version]: key };
  const cipher = await api._encryptFileE2EE(new Blob(['機密メッセージ']), keys);
  const buffer = await cipher.arrayBuffer();
  expect(await (await api._decryptFileE2EE(buffer, keys)).text()).toBe('機密メッセージ');
  const modified = new Uint8Array(buffer.slice(0));
  modified[modified.length - 1] ^= 1;
  await expect(api._decryptFileE2EE(modified, keys)).rejects.toThrow();
});

test('rooms with identical IDs in different servers cannot share cached keys or pending initialization', async () => {
  const { api } = loadCrypto();
  const first = { latestVersion: '1' }, second = { latestVersion: '2' };
  api._e2ee.roomKeyCache[api.roomKeyScope('first', 'same')] = first;
  api._e2ee._roomKeyPromises[api.roomKeyScope('second', 'same')] = Promise.resolve(second);
  expect(await api._getOrCreateRoomKey('first', 'same', [])).toBe(first);
  expect(await api._getOrCreateRoomKey('second', 'same', [])).toBe(second);
  expect(api.roomKeyScope('a_b', 'c')).not.toBe(api.roomKeyScope('a', 'b_c'));
});

test('key rotation invalidates stale cached keys and pending work without affecting another server', () => {
  const { api } = loadCrypto();
  const scope = api.roomKeyScope('first', 'same'), other = api.roomKeyScope('second', 'same');
  api._e2ee.roomKeyCache[scope] = { latestVersion: '1' };
  api._e2ee.roomKeyCache[other] = { latestVersion: '1' };
  api._e2ee._roomKeyPromises[scope] = Promise.resolve(null);
  api.observeRoomKeyVersion('first', 'same', 2);
  expect(api._e2ee.roomKeyCache[scope]).toBeUndefined();
  expect(api._e2ee._roomKeyPromises[scope]).toBeUndefined();
  expect(api._e2ee.roomKeyCache[other]).toBeDefined();
  expect(api.roomKeyVersionIsCurrent('first', 'same', { latestVersion: '1' })).toBe(false);
  expect(api.roomKeyVersionIsCurrent('first', 'same', { latestVersion: '2' })).toBe(true);
});

test('DM backfill keeps six existing versions intact and only appends the missing version', async () => {
  const { api, ctx, writes } = loadCrypto();
  const pair = await webcrypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  const publicKeyJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const key = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const versions = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [String(i + 1), 'existing-' + (i + 1)]));
  ctx.getDoc = async path => ({ exists: () => true, data: () => path.includes('/keys/') ? { versions, latestVersion: '6', wrappedKey: 'existing-6' } : { publicKeyJwk } });
  api._e2ee.dmKeyCache.alice_bob = { ...Object.fromEntries(Array.from({ length: 7 }, (_, i) => [String(i + 1), key])), latest: key, latestVersion: '7' };
  await api._backfillDmKeysForParticipant('alice_bob', 'bob', true);
  const delivered = writes.find(write => write.path.endsWith('/keys/bob'));
  expect(Object.keys(delivered.data.versions)).toHaveLength(7);
  for (const [version, original] of Object.entries(versions)) expect(delivered.data.versions[version]).toBe(original);
  const unwrapped = await webcrypto.subtle.decrypt({ name: 'RSA-OAEP' }, pair.privateKey, Buffer.from(delivered.data.versions['7'], 'base64'));
  expect(Buffer.from(unwrapped)).toEqual(Buffer.from(await webcrypto.subtle.exportKey('raw', key)));
});

test('legacy DM shared key is removed only in the transaction that delivers both encrypted copies', async () => {
  const { api, ctx } = loadCrypto();
  const pair = await webcrypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  const publicKeyJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  api._e2ee.publicKey = pair.publicKey; api._e2ee.privateKey = pair.privateKey;
  const raw = webcrypto.getRandomValues(new Uint8Array(32)), legacy = Buffer.from(raw).toString('base64');
  ctx.getDoc = async () => ({ exists: () => true, data: () => ({ publicKeyJwk }) });
  const transaction = { get: async path => ({ exists: () => !path.includes('/keys/'), data: () => ({ sharedKey: legacy }) }), set: jest.fn(), update: jest.fn() };
  ctx.runTransaction = async (_, work) => work(transaction); ctx.deleteField = () => 'delete-field';
  expect(await api.migrateLegacyDmSharedKey('alice_bob', legacy, ['alice', 'bob'])).toBe(true);
  expect(transaction.set).toHaveBeenCalledTimes(2);
  for (const [, data] of transaction.set.mock.calls) {
    expect(data.versions['1']).not.toBe(legacy);
    const decrypted = await webcrypto.subtle.decrypt({ name: 'RSA-OAEP' }, pair.privateKey, Buffer.from(data.versions['1'], 'base64'));
    expect(Buffer.from(decrypted)).toEqual(Buffer.from(raw));
  }
  expect(transaction.update.mock.calls[0][1]).toEqual({ sharedKey: 'delete-field' });
  transaction.set.mockClear(); transaction.update.mockClear(); api._e2ee.pubKeyCache = {};
  ctx.getDoc = async () => ({ exists: () => false });
  expect(await api.migrateLegacyDmSharedKey('alice_bob', legacy, ['alice', 'bob'])).toBe(false);
  expect(transaction.set).not.toHaveBeenCalled(); expect(transaction.update).not.toHaveBeenCalled();
});

test('room legacy migration cannot report success when wrapped-key persistence was rejected', async () => {
  const { api, ctx } = loadCrypto();
  const pair = await webcrypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  api._e2ee.publicKey = pair.publicKey; api._e2ee.privateKey = pair.privateKey;
  ctx.setDoc = async () => { throw new Error('permission-denied'); };
  ctx.getDoc = async () => ({ exists: () => false });
  await expect(api.__distributeRoomKeyVersion('server', 'room', new Uint8Array(32).buffer, ['alice'], '1', true)).rejects.toThrow('確認');
});

test('missing keys never yield plaintext for text or attachments', async () => {
  const { api } = loadCrypto();
  expect(await api._encryptText('secret', null)).toBeNull();
  await expect(api._encryptFileE2EE(new Blob(['secret']), null)).rejects.toThrow();
});

test('new room with version 1 generates a key and stores wrapped versions as nested fields', async () => {
  const { api, writes } = loadCrypto();
  const pair = await webcrypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  api._e2ee.ready = true;
  api._e2ee.privateKey = pair.privateKey;
  api._e2ee.publicKey = pair.publicKey;
  const keys = await api.__getOrCreateRoomKeyImpl('server1', 'room1', ['alice']);
  expect(keys.latestVersion).toBe('1');
  const ownWrite = writes.find(w => w.path.endsWith('/roomKeys/alice'));
  expect(ownWrite.data.versions['1']).toBeTruthy();
  expect(Object.keys(ownWrite.data).some(k => k.startsWith('versions.'))).toBe(false);
  const raw = await webcrypto.subtle.decrypt({ name: 'RSA-OAEP' }, pair.privateKey, Buffer.from(ownWrite.data.versions['1'], 'base64'));
  expect(Buffer.from(raw)).toEqual(Buffer.from(await webcrypto.subtle.exportKey('raw', keys.latest)));
});


test('private keys and memory caches do not carry over to another signed-in account', () => {
  const { api } = loadCrypto();
  let owner = 'alice';
  api.initCryptoContext({ getUserId: () => owner });
  api.setCryptoAccount(owner);
  api.__lsSet('covo_e2ee_priv', 'alice-only');
  api._e2ee.ready = true;
  api._e2ee.roomKeyCache.room = {};
  owner = 'bob'; api.setCryptoAccount(owner);
  expect(api.__lsGet('covo_e2ee_priv')).toBeNull();
  expect(api._e2ee.ready).toBe(false);
  expect(api._e2ee.roomKeyCache.room).toBeUndefined();
});

test('an old personal key read completing after account switch does not install or publish keys', async () => {
  const { api, ctx, writes } = loadCrypto();
  let owner = 'alice', finish;
  api.initCryptoContext({ getUserId: () => owner });
  api.setCryptoAccount(owner);
  ctx.getDoc = () => new Promise(resolve => { finish = resolve; });
  ctx.withReadDeadline = promise => promise;
  const pending = api.__ensureE2EEKeysImpl();
  owner = 'bob'; api.setCryptoAccount(owner);
  finish({ exists: () => false });
  expect(await pending).toBe(false);
  expect(api._e2ee.privateKey).toBeNull();
  expect(writes).toHaveLength(0);
});
