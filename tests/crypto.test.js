const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { TextEncoder, TextDecoder } = require('util');

function loadCrypto() {
  const writes = [];
  const ctx = vm.createContext({
    window: { crypto: webcrypto }, location: { protocol: 'https:' }, console, withReadDeadline:promise=>promise,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, DataView, Blob, CryptoKey: class CryptoKey {}, setTimeout, clearTimeout,
    _abToB64: ab => Buffer.from(ab).toString('base64'), _b64ToAb: str => Uint8Array.from(Buffer.from(str, 'base64')).buffer,
    doc: (_, path) => path, collection: (_, path) => path, query: path => path, limit: () => 1,
    getDoc: async path => ({ exists: () => !path.includes('/roomKeys/') && path.endsWith('/rooms/room1'), data: () => ({ currentKeyVersion: 1 }) }),
    getDocs: async () => ({ empty: true }), serverTimestamp: () => 123,
    setDoc: async (path, data) => { writes.push({ path, data }); }, updateDoc: async () => {},
    LocalStore: { putMessage: async () => {} }
  });
  const source = fs.readFileSync('public/js/crypto_helpers.js', 'utf8').replace(/^import[^\n]*\n/gm, '').replace(/\bexport /g, '');
  vm.runInContext(source + '\nglobalThis.api = { _decryptText, _decryptMessagesInPlace, _getRoomKeyWithWait, migrateLegacyDmSharedKey, observeRoomKeyVersion, roomKeyVersionIsCurrent, roomKeyScope, _getOrCreateRoomKey, _backfillDmKeysForParticipant, setCryptoAccount, __lsGet, __lsSet, __ensureE2EEKeysImpl, _e2ee, initCryptoContext, _encryptText, _encryptFileE2EE, _decryptFileE2EE, __distributeRoomKeyVersion, __getOrCreateRoomKeyImpl };', ctx);
  ctx.api.initCryptoContext({ getDb: () => ({}), getAppId: () => 'testApp', getUserId: () => 'alice', getIsAdmin: () => false });
  return { ctx, api: ctx.api, writes };
}

test('maintenance starts no key lookup or rescue writes and failed rescue remains retryable', async () => {
  const {ctx,api,writes}=loadCrypto();ctx.window.covoMaintenanceBlocked=true;
  const read=jest.fn();ctx.getDoc=read;
  await ctx._requestEscrowRescue('server1','room1');await ctx._requestDmKeyRescue('alice_bob','bob');
  expect(await api._getOrCreateRoomKey('server1','room1',[])).toBeNull();expect(read).not.toHaveBeenCalled();expect(writes).toEqual([]);
  ctx.window.covoMaintenanceBlocked=false;
  ctx.setDoc=jest.fn(async()=>{throw Object.assign(Error('maintenance'),{code:'covo/maintenance'});});
  await ctx._requestEscrowRescue('server1','room1');
  ctx.setDoc=jest.fn(async()=>{});await ctx._requestEscrowRescue('server1','room1');expect(ctx.setDoc).toHaveBeenCalledTimes(1);
});

test('a late rescue response cannot clear another account keys and failures do not flood writes', async () => {
  const {ctx,api}=loadCrypto();let owner='alice',finish;
  api.initCryptoContext({getUserId:()=>owner});api.setCryptoAccount(owner);
  ctx.setDoc=()=>new Promise(resolve=>{finish=resolve;});
  const pending=ctx._requestEscrowRescue('server1','room1');
  owner='bob';api.setCryptoAccount(owner);const scope=api.roomKeyScope('server1','room1');api._e2ee.roomKeyCache[scope]={latest:'BOB_KEY'};
  finish();await pending;expect(api._e2ee.roomKeyCache[scope].latest).toBe('BOB_KEY');
  ctx.setDoc=jest.fn(async()=>{throw Error('offline');});
  await ctx._requestEscrowRescue('server1','room1');await ctx._requestEscrowRescue('server1','room1');expect(ctx.setDoc).toHaveBeenCalledTimes(1);
});

for (const kind of ['room','dm']) test(`a ${kind} batch finishing decryption after account change cannot mutate or persist the old message`, async () => {
  const {ctx,api}=loadCrypto();let owner='alice',finish;
  api.initCryptoContext({getUserId:()=>owner});api.setCryptoAccount(owner);
  ctx.LocalStore.putMessage=jest.fn(async()=>{});
  ctx.waitDecrypt=()=>new Promise(resolve=>{finish=resolve;});
  vm.runInContext(`_getOrCreateRoomKey=async()=>({});_getDmKeyWithWait=async()=>({});_decryptText=waitDecrypt;_decryptDmText=waitDecrypt;`,ctx);
  const record={id:'private',text:'enc::v1::iv::cipher'};
  const work=kind==='room' ? ctx._decryptMessagesInPlace([record],'server','room',['alice']) : ctx._decryptDmMessagesInPlace([record],'alice_bob',['alice','bob']);
  await new Promise(setImmediate);owner='bob';api.setCryptoAccount(owner);finish('private plaintext');await work;
  expect(record.text).toBe('enc::v1::iv::cipher');expect(ctx.LocalStore.putMessage).not.toHaveBeenCalled();
});

async function encryptedRoomFixture(versions = ['1', '2']) {
  const loaded = loadCrypto(), { api, ctx } = loaded;
  const pair = await webcrypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  Object.assign(api._e2ee, { ready: true, privateKey: pair.privateKey, publicKey: pair.publicKey });
  const keys = {}, wrapped = {};
  for (const version of versions) {
    keys[version] = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    wrapped[version] = Buffer.from(await webcrypto.subtle.encrypt({ name: 'RSA-OAEP' }, pair.publicKey, await webcrypto.subtle.exportKey('raw', keys[version]))).toString('base64');
  }
  ctx.getDoc = async path => ({ exists: () => true, data: () => path.includes('/roomKeys/') ? { versions: wrapped, latestVersion: '1' } : { currentKeyVersion: 2 } });
  api.observeRoomKeyVersion('server', 'room', 2);
  return { ...loaded, keys };
}

test('room metadata selects the current send key while preserving decryptability of old messages and replies', async () => {
  const { api, keys } = await encryptedRoomFixture();
  const oldCipher = await api._encryptText('以前の本文', { latest: keys['1'], latestVersion: '1' });
  const newCipher = await api._encryptText('新しい本文', { latest: keys['2'], latestVersion: '2' });
  const send = await api._getOrCreateRoomKey('server', 'room', ['alice']);
  expect(send?.latestVersion).toBe('2');
  const messages = [{ text: newCipher, replyTo: { text: oldCipher } }, { text: oldCipher }];
  await api._decryptMessagesInPlace(messages, 'server', 'room', ['alice']);
  expect(messages.map(message => message.text)).toEqual(['新しい本文', '以前の本文']);
  expect(messages[0].replyTo.text).toBe('以前の本文');
});

test('missing current key does not block historical text or attachments and never permits sending with an old key', async () => {
  const { api, keys } = await encryptedRoomFixture(['1']);
  const cipher = await api._encryptText('履歴を復号', { latest: keys['1'], latestVersion: '1' });
  const file = await api._encryptFileE2EE(new Blob(['保存済み添付']), { latest: keys['1'], latestVersion: '1' });
  const history = await api._getOrCreateRoomKey('server', 'room', ['alice'], true);
  expect(history?.['1']).toBeDefined();
  expect(await api._getOrCreateRoomKey('server', 'room', ['alice'])).toBeNull();
  expect(await api._decryptText(cipher, 'server', 'room', ['alice'])).toBe('履歴を復号');
  expect(await (await api._decryptFileE2EE(await file.arrayBuffer(), history)).text()).toBe('保存済み添付');
  expect(await api._encryptText('送信不可', history)).toBeNull();
  await expect(api._encryptFileE2EE(new Blob(['送信不可']), history)).rejects.toThrow('Key');
});

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
  const first = { latestVersion: '1', latest: {} }, second = { latestVersion: '2', latest: {} };
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

test('a legacy v1 wrapper is never relabelled as the current v2 sending key', async () => {
  const {api,ctx}=loadCrypto();
  const pair=await webcrypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
  const raw=webcrypto.getRandomValues(new Uint8Array(32));
  const wrappedKey=Buffer.from(await webcrypto.subtle.encrypt({name:'RSA-OAEP'},pair.publicKey,raw)).toString('base64');
  api._e2ee.ready=true;api._e2ee.publicKey=pair.publicKey;api._e2ee.privateKey=pair.privateKey;
  ctx.getDoc=async path=>({exists:()=>true,data:()=>path.endsWith('/rooms/room1')?{currentKeyVersion:2}:{wrappedKey,latestVersion:'1'}});
  const keys=await api.__getOrCreateRoomKeyImpl('server1','room1',['alice']);
  expect(keys['1']).toBeTruthy();expect(keys['2']).toBeUndefined();expect(keys.latest).toBeFalsy();
  expect(await api._encryptText('must not send with an old key',keys)).toBeNull();
});

test('a rejected new-room key save cannot produce a sending key or populate the cache',async()=>{
  const {api,ctx}=loadCrypto();
  const pair=await webcrypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
  api._e2ee.ready=true;api._e2ee.privateKey=pair.privateKey;api._e2ee.publicKey=pair.publicKey;
  ctx.setDoc=async()=>{throw Error('permission-denied');};
  expect(await api.__getOrCreateRoomKeyImpl('server1','room1',['alice'])).toBeNull();
  expect(api._e2ee.roomKeyCache[api.roomKeyScope('server1','room1')]).toBeUndefined();
});

test('server rescue refreshes a stale recipient public key once for all historical versions',async()=>{
  const {api,ctx,writes}=loadCrypto();
  const pair=await webcrypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
  const jwk=await webcrypto.subtle.exportKey('jwk',pair.publicKey);
  const key=await webcrypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
  api._e2ee.pubKeyCache.bob={stale:true};api._e2ee.roomKeyCache[api.roomKeyScope('server1','room1')]={'1':key,'2':key,latest:key,latestVersion:'2'};
  ctx.getDoc=jest.fn(async()=>({exists:()=>true,data:()=>({publicKeyJwk:jwk})}));
  await ctx._backfillRoomKeysForMembers('server1','room1',['bob'],true);
  expect(ctx.getDoc).toHaveBeenCalledTimes(1);expect(writes).toHaveLength(2);
  for(const write of writes){const wrapped=Object.values(write.data.versions)[0];expect(Buffer.from(await webcrypto.subtle.decrypt({name:'RSA-OAEP'},pair.privateKey,Buffer.from(wrapped,'base64')))).toEqual(Buffer.from(await webcrypto.subtle.exportKey('raw',key)));}
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
