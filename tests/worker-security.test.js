const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { TextEncoder, TextDecoder } = require('util');

function loadWorker(fetchImpl = jest.fn()) {
  const context = vm.createContext({ Request, Response, Headers, URL, FormData, File, Blob, AbortSignal, AbortController, TextEncoder, TextDecoder, crypto: webcrypto, fetch: fetchImpl, console, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync('server/src/index.js', 'utf8').replace('export default {', 'const worker = {') + '\nglobalThis.worker = worker;', context);
  return context;
}

test('CORS allows only configured origins and varies cached responses by origin', () => {
  const ctx = loadWorker();
  expect(ctx.getCorsHeaders(new Request('https://api.test', { headers: { Origin: 'https://evil.test' } }))['Access-Control-Allow-Origin']).toBeUndefined();
  const allowed = ctx.getCorsHeaders(new Request('https://api.test', { headers: { Origin: 'https://covo.app' } }));
  expect(allowed['Access-Control-Allow-Origin']).toBe('https://covo.app');
  expect(allowed.Vary).toBe('Origin');
});

test('RTDB base URL cannot smuggle a privileged path or query on the allowed origin', () => {
  const ctx = loadWorker();
  const origin = 'https://test-default-rtdb.asia-southeast1.firebasedatabase.app';
  expect(ctx.getRtdbBaseUrl({ FIREBASE_PROJECT_ID: 'test' }, `${origin}/artifacts/testApp/settings/adminList.json?ignored=1`)).toBe(origin);
});

test.each(['http://127.1/', 'http://2130706433/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://100.64.0.1/', 'http://10.1.2.3/'])('OGP blocks internal literal URL %s before fetching', async target => {
  const fetchImpl = jest.fn();
  const ctx = loadWorker(fetchImpl);
  const response = await ctx.worker.fetch(new Request(`https://api.test/api/fetchOg?url=${encodeURIComponent(target)}`), {}, {});
  expect((await response.json()).success).toBe(false);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('notification without a DM or server scope fails before privileged notification APIs', async () => {
  const ctx = loadWorker();
  ctx.verifyFirebaseIdToken = async () => ({ uid: 'alice' });
  ctx.isAppAdmin = async () => false;
  const response = await ctx.worker.fetch(new Request('https://api.test/api/sendNotification', { method: 'POST', body: JSON.stringify({ receiverIds: ['bob'], title: 'test', senderId: 'alice', appId: 'testApp', idToken: 'test' }) }), { FIREBASE_APP_ID: 'testApp' }, {});
  expect(response.status).toBe(403);
});

test('OGP validates redirect destinations before making the next fetch', async () => {
  const fetchImpl = jest.fn(async () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } }));
  const ctx = loadWorker(fetchImpl);
  const response = await ctx.worker.fetch(new Request('https://api.test/api/fetchOg?url=https://example.com/page'), {}, {});
  expect((await response.json()).success).toBe(false);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0][1].redirect).toBe('manual');
});

test.each(['isAppAdmin', 'isServerAdminCheck', 'isServerMemberCheck'])('%s never restores revoked rights from a stale D1 mirror', async helper => {
  const ctx = loadWorker(jest.fn(async () => new Response(JSON.stringify({ fields: { joinedUsers: { arrayValue: { values: [] } }, serverAdmins: { arrayValue: { values: [] } } } }))));
  ctx.getAdminTokenForFirestore = async () => 'admin-test';
  const DB = { prepare: jest.fn(() => ({ bind: () => ({ first: async () => ({ created_by: 'mallory', server_data: '{"serverAdmins":["mallory"]}', setting_data: '{"admins":["mallory"]}' }) }) })) };
  const args = helper === 'isAppAdmin' ? ['testApp', { uid: 'mallory' }, { DB, FIREBASE_PROJECT_ID: 'test' }] : ['testApp', 'server1', { uid: 'mallory' }, { DB, FIREBASE_PROJECT_ID: 'test' }];
  expect(await ctx[helper](...args)).toBe(false);
  expect(DB.prepare).not.toHaveBeenCalled();
});

test('file deletion checks stored server metadata, not only supplied admin serverId', async () => {
  const ctx = loadWorker();
  ctx.verifyFirebaseIdToken = async () => ({ uid: 'mallory' });
  ctx.isAppAdmin = async () => false;
  ctx.isServerAdminCheck = jest.fn(async () => true);
  const files = { getWithMetadata: async () => ({ value: new ArrayBuffer(1), metadata: { serverId: 'victim-server', uploaderId: 'alice' } }), delete: jest.fn() };
  const response = await ctx.worker.fetch(new Request('https://api.test/api/file/file1?serverId=attacker-server&appId=testApp', { method: 'DELETE', headers: { Authorization: 'Bearer test' } }), { FIREBASE_APP_ID: 'testApp', FILES: files }, {});
  expect(response.status).toBe(403);
  expect(files.delete).not.toHaveBeenCalled();
  expect(ctx.isServerAdminCheck).not.toHaveBeenCalled();
});

test('upload folder cannot bypass server membership check', async () => {
  const ctx = loadWorker();
  ctx.verifyFirebaseIdToken = async () => ({ uid: 'mallory' });
  ctx.isAppAdmin = async () => false;
  ctx.isServerMemberCheck = async () => false;
  const data = new FormData();
  data.set('file', new File(['asset'], 'pic.png', { type: 'image/png' }));
  data.set('uploaderId', 'mallory');
  data.set('idToken', 'test');
  data.set('folder', 'servericons');
  data.set('serverId', 'victim-server');
  const files = { put: jest.fn() };
  const response = await ctx.worker.fetch(new Request('https://api.test/api/uploadFile', { method: 'POST', body: data }), { FIREBASE_APP_ID: 'testApp', FILES: files }, {});
  expect(response.status).toBe(403);
  expect(files.put).not.toHaveBeenCalled();
});

test('RTDB sync publishes authoritative membership atomically and removes stale moderators', async () => {
  const fetchImpl = jest.fn(async (_, init) => new Response(JSON.stringify(init?.method === 'PATCH' ? {} : {
    fields: { name: { stringValue: 'Server' }, createdBy: { stringValue: 'alice' }, joinedUsers: { arrayValue: { values: [{ stringValue: 'alice' }, { stringValue: 'bob' }] } }, serverAdmins: { arrayValue: { values: [] } } }
  })));
  const ctx = loadWorker(fetchImpl);
  ctx.verifyFirebaseIdToken = async () => ({ uid: 'alice' });
  ctx.getFirestoreAdminToken = async () => 'fs-token';
  ctx.getRTDBToken = async () => 'rtdb-token';
  const response = await ctx.worker.fetch(new Request('https://api.test/api/syncRtdb', { method: 'POST', body: JSON.stringify({ appId: 'testApp', serverId: 'server1', userId: 'alice', idToken: 'test', rtdbUrl: 'https://evil.test' }) }), { FIREBASE_APP_ID: 'testApp', FIREBASE_PROJECT_ID: 'test', SERVICE_ACCOUNT_JSON: '{}' }, {});
  expect(response.status).toBe(200);
  const patch = fetchImpl.mock.calls.find(([, init]) => init?.method === 'PATCH');
  expect(patch[0]).toContain('test-default-rtdb.asia-southeast1.firebasedatabase.app');
  expect(JSON.parse(patch[1].body)).toMatchObject({ members: { alice: true, bob: true }, serverAdmins: {} });
});

test('pruning uses stored RTDB keys even if a message embeds a forged id', async () => {
  const messages = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`m${i}`, { id: 'victim', senderId: 'alice', timestamp: i + 1 }]));
  const fetchImpl = jest.fn(async (url, init) => new Response(JSON.stringify(init?.method === 'DELETE' ? {} : url.includes('/m0.json') ? messages.m0 : messages), { headers: { ETag: '"v1"' } }));
  const ctx = loadWorker(fetchImpl);
  ctx.verifyFirebaseIdToken = async () => ({ uid: 'alice' });
  ctx.isAppAdmin = async () => false;
  ctx.isServerAdminCheck = async () => false;
  ctx.isServerMemberCheck = async () => true;
  ctx.getFirestoreAdminToken = async () => 'fs-token';
  ctx.getRTDBToken = async () => 'rtdb-token';
  const response = await ctx.worker.fetch(new Request('https://api.test/api/pruneChannelMessages', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ appId: 'testApp', serverId: 'server1', roomId: 'room1' }) }), { FIREBASE_APP_ID: 'testApp', FIREBASE_PROJECT_ID: 'test', SERVICE_ACCOUNT_JSON: '{}' }, {});
  expect((await response.json()).prunedCount).toBe(1);
  const deletions = fetchImpl.mock.calls.filter(([, init]) => init?.method === 'DELETE');
  expect(deletions.length).toBe(2);
  expect(deletions.every(([url]) => url.includes('/m0') && !url.includes('victim'))).toBe(true);
});

test.each(['pinned', 'conflict', 'rtdb-failure', 'firestore-failure'])('pruning protects attachments and reports failure accurately: %s', async scenario => {
  const messages = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`m${i}`, { senderId: 'alice', timestamp: i + 1, fileData: 'https://api.test/api/file/asset' }]));
  const fetchImpl = jest.fn(async (url, init = {}) => {
    if (init.method === 'DELETE') {
      const status = url.includes('firestore.googleapis.com') ? (scenario === 'firestore-failure' ? 503 : 200) : scenario === 'conflict' ? 412 : scenario === 'rtdb-failure' ? 503 : 200;
      return new Response('{}', { status });
    }
    if (init.method === 'PUT') return new Response('{}');
    if (url.includes('/m0.json')) return new Response(JSON.stringify({ ...messages.m0, isPinned: scenario === 'pinned' }), { headers: { ETag: '"latest"' } });
    return new Response(JSON.stringify(messages));
  });
  const ctx = loadWorker(fetchImpl);
  ctx.verifyFirebaseIdToken = async () => ({ uid: 'alice' });
  ctx.isAppAdmin = async () => false;
  ctx.isServerAdminCheck = async () => false;
  ctx.isServerMemberCheck = async () => true;
  ctx.getFirestoreAdminToken = async () => 'fs-token';
  ctx.getRTDBToken = async () => 'rtdb-token';
  const files = { getWithMetadata: jest.fn(), delete: jest.fn() };
  const response = await ctx.worker.fetch(new Request('https://api.test/api/pruneChannelMessages', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ appId: 'testApp', serverId: 'server1', roomId: 'room1' }) }), { FIREBASE_APP_ID: 'testApp', FIREBASE_PROJECT_ID: 'test', SERVICE_ACCOUNT_JSON: '{}', FILES: files }, {});
  const result = await response.json();
  expect(result.prunedCount).toBe(0);
  expect(files.delete).not.toHaveBeenCalled();
  if (scenario === 'pinned') expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  else expect(response.status).toBe(502);
  if (scenario === 'firestore-failure') expect(fetchImpl.mock.calls.find(([, init]) => init?.method === 'PUT')[1].headers['if-match']).toBe('null_etag');
});
