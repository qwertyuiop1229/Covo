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
  vm.runInContext(source + '\nglobalThis.api = { _e2ee, initCryptoContext, _encryptText, _encryptFileE2EE, _decryptFileE2EE, __distributeRoomKeyVersion, __getOrCreateRoomKeyImpl };', ctx);
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
