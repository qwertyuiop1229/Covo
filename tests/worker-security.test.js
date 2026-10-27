function currentClientRequest(url, options = {}) { const headers = new Headers(options.headers); headers.set('X-Covo-Protocol', '2'); return new Request(url, { ...options, headers }); }
const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { TextEncoder, TextDecoder } = require('util');

function loadWorker(fetchImpl = jest.fn(), realMaintenance = false) {
  const context = vm.createContext({ Request, Response, Headers, URL, URLSearchParams, FormData, File, Blob, AbortSignal, AbortController, TextEncoder, TextDecoder, crypto: webcrypto, fetch: fetchImpl, console, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync('server/src/index.js', 'utf8').replace('export default {', 'const worker = {') + '\nglobalThis.worker = worker;', context);
  if(!realMaintenance)context.readMaintenanceState = async () => ({ enabled: false, revision: 0 });
  return context;
}

test('telemetry requires authentication, writes only RTDB, and retries are idempotent', async () => {
  let stored = null;
  const fetchImpl = jest.fn(async (url, options = {}) => {
    expect(url).toContain('/error_reports/err_test.json');
    expect(url).not.toContain('firestore.googleapis.com');
    if (options.method === 'PUT') { stored = JSON.parse(options.body); return new Response('{}'); }
    return new Response(JSON.stringify(stored), { headers: { ETag: '"v1"' } });
  });
  const ctx = loadWorker(fetchImpl);
  ctx.verifyFirebaseIdToken = async token => token === 'valid' ? { uid: 'alice', email: 'alice@test.invalid' } : null;
  ctx.getRTDBToken = async () => 'service-token';
  const env = { FIREBASE_APP_ID: 'testApp', FIREBASE_PROJECT_ID: 'test', SERVICE_ACCOUNT_JSON: '{}' };
  const body = { appId: 'testApp', signature: 'err_test', sessionId: 'a'.repeat(32), sequence: 3, payload: { message: 'failure', affectedEmails: ['forged@test.invalid'] } };
  const request = token => currentClientRequest('https://api.test/api/reportError', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  expect((await ctx.handleReportError(request('bad'), env)).status).toBe(401);
  expect(fetchImpl).not.toHaveBeenCalled();
  expect((await ctx.handleReportError(request('valid'), env)).status).toBe(200);
  expect(stored.count).toBe(3); expect(stored.affectedEmails).toEqual(['alice@test.invalid']);
  expect((await ctx.handleReportError(request('valid'), env)).status).toBe(200);
  expect(stored.count).toBe(3);
  body.sequence = 5;
  await ctx.handleReportError(request('valid'), env);
  expect(stored.count).toBe(5);
  expect(fetchImpl.mock.calls.filter(([, options]) => options.method === 'PUT')).toHaveLength(2);
});

test.each(['conflicting-owner', 'revoked-member', 'new-format'])('privileged message deletion checks authoritative ownership and scope: %s', async scenario => {
  const fetchImpl = jest.fn(async (url, options = {}) => {
    if (options.method === 'DELETE') return new Response('{}');
    if (url.includes('firestore.googleapis.com')) return new Response(JSON.stringify({ fields: { senderId: { stringValue: 'bob' } } }));
    return new Response(JSON.stringify({ senderId: 'alice', ...(scenario === 'new-format' ? { storageVersion: 2 } : {}) }), { headers: { ETag: '"original"' } });
  });
  const ctx = loadWorker(fetchImpl);
  ctx.verifyFirebaseIdToken = async () => ({ uid: 'alice' }); ctx.isAppAdmin = async () => false;
  ctx.isServerAdminCheck = async () => false; ctx.isServerMemberCheck = async () => scenario !== 'revoked-member';
  ctx.getFirestoreAdminToken = async () => 'fs-token'; ctx.getRTDBToken = async () => 'rtdb-token';
  const response = await ctx.handleAdminDeleteMessage(currentClientRequest('https://api.test/api/admin/deleteMessage', { method: 'DELETE', headers: { Authorization: 'Bearer token' }, body: JSON.stringify({ appId: 'testApp', serverId: 'server', roomId: 'room', messageId: 'message' }) }), { FIREBASE_APP_ID: 'testApp', FIREBASE_PROJECT_ID: 'test', SERVICE_ACCOUNT_JSON: '{}' });
  expect(response.status).toBe(scenario === 'new-format' ? 200 : 403);
  const deletes = fetchImpl.mock.calls.filter(([, options]) => options?.method === 'DELETE');
  expect(deletes).toHaveLength(scenario === 'new-format' ? 1 : 0);
  if (scenario === 'new-format') expect(fetchImpl.mock.calls.every(([url]) => !url.includes('firestore.googleapis.com'))).toBe(true);
});

test('CORS allows only configured origins and varies cached responses by origin', () => {
  const ctx = loadWorker();
  expect(ctx.getCorsHeaders(currentClientRequest('https://api.test', { headers: { Origin: 'https://evil.test' } }))['Access-Control-Allow-Origin']).toBeUndefined();
  const allowed = ctx.getCorsHeaders(currentClientRequest('https://api.test', { headers: { Origin: 'https://covo.app' } }));
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
  const response = await ctx.worker.fetch(currentClientRequest(`https://api.test/api/fetchOg?url=${encodeURIComponent(target)}`), {}, {});
  expect((await response.json()).success).toBe(false);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('notification without a DM or server scope fails before privileged notification APIs', async () => {
  const ctx = loadWorker();
  ctx.verifyFirebaseIdToken = async () => ({ uid: 'alice' });
  ctx.isAppAdmin = async () => false;
  const response = await ctx.worker.fetch(currentClientRequest('https://api.test/api/sendNotification', { method: 'POST', body: JSON.stringify({ receiverIds: ['bob'], title: 'test', senderId: 'alice', appId: 'testApp', idToken: 'test' }) }), { FIREBASE_APP_ID: 'testApp' }, {});
  expect(response.status).toBe(403);
});

test('OGP validates redirect destinations before making the next fetch', async () => {
  const fetchImpl = jest.fn(async () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } }));
  const ctx = loadWorker(fetchImpl);
  const response = await ctx.worker.fetch(currentClientRequest('https://api.test/api/fetchOg?url=https://example.com/page'), {}, {});
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
  const response = await ctx.worker.fetch(currentClientRequest('https://api.test/api/file/file1?serverId=attacker-server&appId=testApp', { method: 'DELETE', headers: { Authorization: 'Bearer test' } }), { FIREBASE_APP_ID: 'testApp', FILES: files }, {});
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
  const response = await ctx.worker.fetch(currentClientRequest('https://api.test/api/uploadFile', { method: 'POST', body: data }), { FIREBASE_APP_ID: 'testApp', FILES: files }, {});
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
  const response = await ctx.worker.fetch(currentClientRequest('https://api.test/api/syncRtdb', { method: 'POST', body: JSON.stringify({ appId: 'testApp', serverId: 'server1', userId: 'alice', idToken: 'test', rtdbUrl: 'https://evil.test' }) }), { FIREBASE_APP_ID: 'testApp', FIREBASE_PROJECT_ID: 'test', SERVICE_ACCOUNT_JSON: '{}' }, {});
  expect(response.status).toBe(200);
  const patch = fetchImpl.mock.calls.find(([, init]) => init?.method === 'PATCH');
  expect(patch[0]).toContain('test-default-rtdb.asia-southeast1.firebasedatabase.app');
  expect(JSON.parse(patch[1].body)).toMatchObject({ members: { alice: true, bob: true }, serverAdmins: {} });
});

test('pruning uses stored RTDB keys even if a message embeds a forged id', async () => {
  const messages = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`m${i}`, { id: 'victim', senderId: 'alice', timestamp: i + 1 }]));
  const fetchImpl = jest.fn(async (url, init) => new Response(JSON.stringify(url.includes('orderBy=%22isPinned%22') ? {} : (init?.method === 'DELETE' || url.endsWith('/documents:commit')) ? {} : url.includes('firestore.googleapis.com') ? { fields: { senderId: { stringValue: 'alice' }, timestamp: { integerValue: '1' } }, updateTime: '2026-10-23T00:00:00Z' } : url.includes('/m0.json') ? messages.m0 : messages), { headers: { ETag: '"v1"' } }));
  const ctx = loadWorker(fetchImpl);
  ctx.verifyFirebaseIdToken = async () => ({ uid: 'alice' });
  ctx.isAppAdmin = async () => false;
  ctx.isServerAdminCheck = async () => false;
  ctx.isServerMemberCheck = async () => true;
  ctx.getFirestoreAdminToken = async () => 'fs-token';
  ctx.getRTDBToken = async () => 'rtdb-token';
  const response = await ctx.worker.fetch(currentClientRequest('https://api.test/api/pruneChannelMessages', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ appId: 'testApp', serverId: 'server1', roomId: 'room1' }) }), { FIREBASE_APP_ID: 'testApp', FIREBASE_PROJECT_ID: 'test', SERVICE_ACCOUNT_JSON: '{}' }, {});
  expect((await response.json()).prunedCount).toBe(1);
  const deletions = fetchImpl.mock.calls.filter(([url, init]) => init?.method === 'DELETE' || url.endsWith('/documents:commit'));
  expect(deletions.length).toBe(2);
  expect(deletions.every(([url, init]) => { const target = url.endsWith('/documents:commit') ? JSON.parse(init.body).writes[0].delete : url; return target.includes('/m0') && !target.includes('victim'); })).toBe(true);
});

test('push notification opt-out is checked before presence or FCM delivery', async () => {
  const fetchImpl = jest.fn(async url => {
    if (url.includes('/notificationSettings/preferences')) return new Response(JSON.stringify({ fields: { channels: { mapValue: { fields: { 'server1:room1': { stringValue: 'none' } } } } } }));
    return new Response(JSON.stringify({ fields: { joinedUsers: { arrayValue: { values: [{ stringValue: 'alice' }, { stringValue: 'bob' }] } } } }));
  });
  const ctx = loadWorker(fetchImpl);
  ctx.verifyFirebaseIdToken = async () => ({ uid: 'alice' });
  ctx.isAppAdmin = async () => false;
  ctx.isServerMemberCheck = async () => true;
  ctx.getWorkerAuthToken = async () => 'worker';
  ctx.getFirestoreAdminToken = async () => 'service-oauth';
  ctx.getFCMToken = async () => 'fcm';
  ctx.getRTDBToken = async () => 'rtdb';
  const response = await ctx.worker.fetch(currentClientRequest('https://api.test/api/sendNotification', { method: 'POST', body: JSON.stringify({ appId: 'testApp', senderId: 'alice', receiverIds: ['bob'], title: 'message', body: 'new message', idToken: 'token', serverId: 'server1', roomId: 'room1' }) }), { FIREBASE_APP_ID: 'testApp', FIREBASE_PROJECT_ID: 'test', SERVICE_ACCOUNT_JSON: '{}' }, {});
  expect(response.status).toBe(200);
  expect(fetchImpl.mock.calls.some(([url]) => url.includes('/status/') || url.includes('fcm.googleapis.com'))).toBe(false);
});

test.each([200,403,503])('private notification preferences use service OAuth and fail closed on HTTP %s', async status => {
  const fetcher=jest.fn(async (url,options={})=>{
    if(url.includes('/notificationSettings/preferences')) {
      expect(options.headers.Authorization).toBe('Bearer service-oauth');
      return new Response(JSON.stringify({fields:{channels:{mapValue:{fields:{'server:room':{stringValue:'none'}}}}}}),{status});
    }
    throw Error('opt-out or unavailable preferences must stop downstream work');
  });
  const ctx=loadWorker(fetcher);ctx.verifyFirebaseIdToken=async()=>({uid:'alice'});ctx.isAppAdmin=async()=>true;
  ctx.getWorkerAuthToken=async()=>{throw Error('ordinary worker identity must not read private preferences');};
  ctx.getFirestoreAdminToken=jest.fn(async()=> 'service-oauth');ctx.getFCMToken=async()=> 'fcm';ctx.getRTDBToken=async()=> 'rtdb';
  const response=await ctx.worker.fetch(currentClientRequest('https://api.test/api/sendNotification',{method:'POST',body:JSON.stringify({appId:'testApp',senderId:'alice',receiverIds:['bob'],title:'new',body:'message',serverId:'server',roomId:'room',idToken:'valid'})}),{FIREBASE_APP_ID:'testApp',FIREBASE_PROJECT_ID:'test',SERVICE_ACCOUNT_JSON:'{}'},{});
  expect(response.status).toBe(status===200?200:502);expect(fetcher).toHaveBeenCalledTimes(1);
});

test.each(['pinned', 'conflict', 'rtdb-failure', 'firestore-failure'])('pruning protects attachments and reports failure accurately: %s', async scenario => {
  const messages = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`m${i}`, { senderId: 'alice', timestamp: i + 1, fileData: 'https://api.test/api/file/asset' }]));
  const fetchImpl = jest.fn(async (url, init = {}) => {
    if (init.method === 'DELETE' || url.endsWith('/documents:commit')) {
      const status = url.includes('firestore.googleapis.com') ? (scenario === 'firestore-failure' ? 503 : 200) : scenario === 'conflict' ? 412 : scenario === 'rtdb-failure' ? 503 : 200;
      return new Response('{}', { status });
    }
    if (url.includes('orderBy=%22isPinned%22')) return new Response('{}');
    if (url.includes('firestore.googleapis.com') && !init.method) return new Response(JSON.stringify({ fields: { senderId: { stringValue: 'alice' }, timestamp: { integerValue: '1' } }, updateTime: '2026-10-23T00:00:00Z' }));
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
  const response = await ctx.worker.fetch(currentClientRequest('https://api.test/api/pruneChannelMessages', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ appId: 'testApp', serverId: 'server1', roomId: 'room1' }) }), { FIREBASE_APP_ID: 'testApp', FIREBASE_PROJECT_ID: 'test', SERVICE_ACCOUNT_JSON: '{}', FILES: files }, {});
  const result = await response.json();
  expect(result.prunedCount).toBe(0);
  expect(files.delete).not.toHaveBeenCalled();
  if (scenario === 'pinned') expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  else expect(response.status).toBe(502);
  if (scenario === 'firestore-failure') expect(fetchImpl.mock.calls.find(([, init]) => init?.method === 'PUT')[1].headers['if-match']).toBe('null_etag');
});


function deletionContext(fetchImpl) {
  const ctx = loadWorker(fetchImpl);
  ctx.verifyFirebaseIdToken = async () => ({ uid: 'alice' });
  ctx.isAppAdmin = async () => false; ctx.isServerAdminCheck = async () => false; ctx.isServerMemberCheck = async () => true;
  ctx.getFirestoreAdminToken = async () => 'fs-token'; ctx.getRTDBToken = async () => 'rtdb-token';
  return ctx;
}
const deleteEnv = { FIREBASE_APP_ID: 'testApp', FIREBASE_PROJECT_ID: 'test', SERVICE_ACCOUNT_JSON: '{}' };
function deletionRequest(dm = false) {
  return currentClientRequest('https://api.test/api/admin/deleteMessage', { method: 'DELETE', headers: { Authorization: 'Bearer valid' },
    body: JSON.stringify({ appId: 'testApp', messageId: 'message', ...(dm ? { dmId: 'alice_bob' } : { serverId: 'server', roomId: 'room' }) }) });
}

test.each([false, true])('delete fails closed on failed or malformed reads (DM=%s)', async dm => {
  for (const response of [new Response('null', { status: 503 }), new Response('not-json'), new Response('null', { status: 403 })]) {
    const fetchImpl = jest.fn(async () => response);
    const ctx = deletionContext(fetchImpl);
    const result = await ctx.handleAdminDeleteMessage(deletionRequest(dm), deleteEnv);
    expect(result.status).toBe(500);
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  }
});

test.each([false, true])('delete requires the exact verified RTDB version and leaves D1 on conflict (DM=%s)', async dm => {
  const fetchImpl = jest.fn(async (_, init) => init?.method === 'DELETE' ? new Response('{}', { status: 412 }) :
    new Response(JSON.stringify({ senderId: 'alice', storageVersion: 2 }), { headers: { ETag: '"checked-version"' } }));
  const ctx = deletionContext(fetchImpl), DB = { prepare: jest.fn() };
  const result = await ctx.handleAdminDeleteMessage(deletionRequest(dm), { ...deleteEnv, DB });
  expect(result.status).toBe(409); expect(DB.prepare).not.toHaveBeenCalled();
  expect(fetchImpl.mock.calls.find(([, init]) => init?.method === 'DELETE')[1].headers['if-match']).toBe('"checked-version"');
});

test('legacy Firestore deletion uses updateTime precondition and does not delete RTDB after conflict', async () => {
  const fetchImpl = jest.fn(async (url, init) => {
    if (url.endsWith('/documents:commit')) return new Response('{}', { status: 409 });
    return url.includes('firestore.googleapis.com') ? new Response(JSON.stringify({ fields: { senderId: { stringValue: 'alice' } }, updateTime: '2026-10-23T00:00:00Z' })) :
      new Response(JSON.stringify({ senderId: 'alice' }), { headers: { ETag: '"rt"' } });
  });
  const result = await deletionContext(fetchImpl).handleAdminDeleteMessage(deletionRequest(), deleteEnv);
  expect(result.status).toBe(409);
  const deletions = fetchImpl.mock.calls.filter(([url, init]) => init?.method === 'DELETE' || url.endsWith('/documents:commit'));
  expect(deletions).toHaveLength(1); expect(JSON.parse(deletions[0][1].body).writes[0]).toEqual({ delete: 'projects/test/databases/(default)/documents/artifacts/testApp/servers/server/rooms/room/messages/message', currentDocument: { updateTime: '2026-10-23T00:00:00Z' } });
});

test('DM canonical sender cannot be bypassed with a conflicting legacy userId alias', async () => {
  const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ senderId: 'bob', userId: 'alice' }), { headers: { ETag: '"rt"' } }));
  const result = await deletionContext(fetchImpl).handleAdminDeleteMessage(deletionRequest(true), deleteEnv);
  expect(result.status).toBe(403); expect(fetchImpl).toHaveBeenCalledTimes(1);
});


function retentionFixture({ total = 1001, pinned = 0, scenario = '', legacy = false } = {}) {
  const messages = Object.fromEntries(Array.from({ length: total }, (_, i) => ['m' + String(i).padStart(5, '0'), {
    senderId: 'alice', timestamp: i + 1, storageVersion: legacy ? 1 : 2,
    text: 'enc::v1::' + 'x'.repeat(512), ...(i >= total - pinned ? { isPinned: true } : {})
  }]));
  const original = JSON.parse(JSON.stringify(messages)); let keyReads = 0;
  const files = { getWithMetadata: jest.fn(async () => ({ metadata: { uploaderId: 'alice', folder: 'attachments' } })), delete: jest.fn() };
  const responses = [];
  const fetchImpl = jest.fn(async (raw, init = {}) => {
    const url = new URL(raw); const isFs = url.hostname === 'firestore.googleapis.com';
    const respond = (value, status = 200) => { const body = JSON.stringify(value); responses.push({ bytes: Buffer.byteLength(body, 'utf8'), kind: isFs ? 'firestore' : url.searchParams.has('shallow') ? 'keys' : 'rtdb' }); return new Response(body, { status, headers: { ETag: '"fixture"' } }); };
    if (isFs) {
      if (scenario === 'mirror-network') throw Error('network lost');
      if (url.pathname.endsWith('/documents:commit')) { if (scenario === 'mirror-delete-network') throw Error('network lost'); return respond({}); }
      return respond({ fields: { senderId: { stringValue: scenario === 'mirror-owner' ? 'bob' : 'alice' }, timestamp: { integerValue: '1' }, isPinned: { booleanValue: scenario === 'mirror-pinned' } }, updateTime: '2026-10-23T00:00:00Z' });
    }
    const key = url.pathname.match(/\/(m[0-9]+)\.json$/)?.[1];
    if (key) {
      if (init.method === 'DELETE') { expect(init.headers['if-match']).toBe('"fixture"'); delete messages[key]; return respond(null); }
      if (init.method === 'PUT') { expect(init.headers['if-match']).toBe('null_etag'); messages[key] = JSON.parse(init.body); return respond(messages[key]); }
      return respond(messages[key] || null);
    }
    if (url.searchParams.has('shallow')) {
      if (++keyReads === 2 && scenario === 'concurrent-prune') delete messages.m00000;
      return respond(Object.fromEntries(Object.keys(messages).map(key => [key, true])));
    }
    if (url.searchParams.get('orderBy') === '"isPinned"') return respond(Object.fromEntries(Object.entries(messages).filter(([, m]) => m.isPinned).slice(0, Number(url.searchParams.get('limitToFirst')))));
    const limit = Number(url.searchParams.get('limitToFirst'));
    if (limit) return respond(Object.fromEntries(Object.entries(messages).slice(0, limit)));
    throw Error('unexpected request ' + raw);
  });
  const ctx = deletionContext(fetchImpl);
  const run = () => ctx.handlePruneChannelMessages(currentClientRequest('https://api.test/api/pruneChannelMessages', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify({ appId: 'testApp', serverId: 'server', roomId: 'room' }) }), { ...deleteEnv, FILES: files });
  return { messages, original, files, fetchImpl, run, responses };
}

test.each(['mirror-network', 'mirror-delete-network', 'mirror-owner', 'mirror-pinned'])('retention restores legacy RTDB body and preserves files on %s', async scenario => {
  const f = retentionFixture({ scenario, legacy: true });
  f.messages.m00000.fileData = '/api/file/asset';
  const result = await f.run(); const body = await result.json();
  expect(result.status).toBe(502); expect(body.prunedCount).toBe(0); expect(body.failedDeletes).toBe(1);
  expect(Object.keys(f.messages)).toHaveLength(1001); expect(f.messages.m00000.senderId).toBe('alice');
  expect(f.files.delete).not.toHaveBeenCalled();
});

test('a plain link in a pruned message never deletes an attachment used elsewhere', async () => {
  const f = retentionFixture(); f.messages.m00000.text = 'link /api/file/asset'; f.messages.m00000.fileData = 42;
  const result = await f.run(); expect((await result.json()).prunedCount).toBe(1);
  expect(f.files.getWithMetadata).not.toHaveBeenCalled(); expect(f.files.delete).not.toHaveBeenCalled();
});

test('retention deduplicates attachment references and reports actual successful deletes', async () => {
  const f = retentionFixture(); f.messages.m00000.kvFileUrl = '/api/file/asset'; f.messages.m00000.fileData = '/api/file/asset';
  const result = await f.run(); const body = await result.json();
  expect(body.deletedFiles).toBe(1); expect(f.files.delete).toHaveBeenCalledTimes(1); expect(Object.keys(f.messages)).toHaveLength(1000);
});

test.each([[999,0,0], [1000,0,0], [1001,0,1], [1010,10,0], [1010,1010,0], [1011,10,1], [1201,0,100]])('retention counts correctly: total=%i, pinned=%i, expected deletion=%i', async (total, pinned, expected) => {
  const f = retentionFixture({ total, pinned }); const result = await f.run(); const body = await result.json();
  expect(result.status).toBe(200); expect(body.prunedCount).toBe(expected);
  expect(Object.keys(f.messages)).toHaveLength(total - expected);
  expect(Object.values(f.messages).filter(m => m.isPinned)).toHaveLength(pinned);
  expect(body.remainingExcess || 0).toBe(Math.max(0, total - pinned - 1000 - expected));
  if (total <= 1000) expect(f.fetchImpl).toHaveBeenCalledTimes(1);
});

test('a concurrently pruned tail does not spend stale excess on retained messages', async () => {
  const f = retentionFixture({ scenario: 'concurrent-prune' }); const result = await f.run(); const body = await result.json();
  expect(body.reason).toBe('channel-changed'); expect(body.prunedCount).toBe(0);
  expect(f.fetchImpl.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  expect(Object.keys(f.messages)).toHaveLength(1000);
});


test('concurrent telemetry deliveries sum independent users once and tolerate stale sequences', async () => {
  let stored = null, revision = 0, conflicts = 0;
  const fetchImpl = jest.fn(async (_, init = {}) => {
    if (init.method === 'PUT') {
      if (init.headers['if-match'] !== String(revision)) { conflicts++; return new Response('{}', { status: 412 }); }
      stored = JSON.parse(init.body); revision++; return new Response('{}');
    }
    return new Response(JSON.stringify(stored), { headers: { ETag: String(revision) } });
  });
  const ctx = loadWorker(fetchImpl); ctx.verifyFirebaseIdToken = async token => ({ uid: token, email: token + '@test.invalid' }); ctx.getRTDBToken = async () => 'service';
  const send = (uid, sequence) => ctx.handleReportError(currentClientRequest('https://api.test/api/reportError', { method: 'POST', headers: { Authorization: 'Bearer ' + uid }, body: JSON.stringify({ appId: 'testApp', signature: 'race', sessionId: 'b'.repeat(32), sequence, payload: { message: 'failure' } }) }), deleteEnv);
  await Promise.all([send('alice', 3), send('bob', 2)]);
  expect(conflicts).toBeGreaterThan(0); expect(stored.count).toBe(5);
  await send('alice', 1); await send('bob', 2); expect(stored.count).toBe(5);
  await send('alice', 5); expect(stored.count).toBe(7);
});

test('same-millisecond telemetry cursor eviction always retains the currently acknowledged session', async () => {
  const now = 1800000000000;
  let stored = { count: 128, deliveryCursors: Object.fromEntries(Array.from({ length: 128 }, (_, i) => ['older_' + i, { sequence: 1, at: now }])) };
  const fetchImpl = jest.fn(async (_, init = {}) => { if (init.method === 'PUT') { stored = JSON.parse(init.body); return new Response('{}'); } return new Response(JSON.stringify(stored), { headers: { ETag: 'v' } }); });
  const ctx = loadWorker(fetchImpl); ctx.Date = class extends Date { static now() { return now; } };
  ctx.verifyFirebaseIdToken = async () => ({ uid: 'alice' }); ctx.getRTDBToken = async () => 'service';
  const send = () => ctx.handleReportError(currentClientRequest('https://api.test/api/reportError', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify({ appId: 'testApp', signature: 'ties', sessionId: 'c'.repeat(32), sequence: 1, payload: { message: 'failure' } }) }), deleteEnv);
  await send(); await send(); expect(stored.count).toBe(129); expect(Object.keys(stored.deliveryCursors)).toHaveLength(128);
  expect(stored.deliveryCursors['alice_' + 'c'.repeat(32)].sequence).toBe(1);
});


test.each([
  ['POST', '/api/uploadFile'], ['POST', '/api/sendNotification'], ['POST', '/api/reportError'],
  ['POST', '/api/syncRtdb'], ['POST', '/api/signup'], ['POST', '/api/emergencyPasswordReset'],
  ['DELETE', '/api/file/existing'], ['DELETE', '/api/admin/deleteMessage'], ['POST', '/api/d1/messages']
])('old client %s %s is rejected before any fetch, database operation, or persistent audit', async (method, path) => {
  const fetcher = jest.fn(); const ctx = loadWorker(fetcher);
  const DB = { prepare: jest.fn() }, FILES = { put: jest.fn(), delete: jest.fn() }, waitUntil = jest.fn();
  const response = await ctx.worker.fetch(new Request('https://api.test' + path, { method, body: '{}' }), { DB, FILES }, { waitUntil });
  expect(response.status).toBe(426); expect((await response.json()).code).toBe('UPDATE_REQUIRED');
  expect(fetcher).not.toHaveBeenCalled(); expect(DB.prepare).not.toHaveBeenCalled();
  expect(FILES.put).not.toHaveBeenCalled(); expect(FILES.delete).not.toHaveBeenCalled(); expect(waitUntil).not.toHaveBeenCalled();
});

test.each(['1', '3', '', '2junk'])('unsupported protocol %s cannot reach handlers', async protocol => {
  const ctx = loadWorker(); ctx.handleReportError = jest.fn();
  const response = await ctx.worker.fetch(new Request('https://api.test/api/reportError', { method: 'POST', headers: { 'X-Covo-Protocol': protocol }, body: '{}' }), {}, {});
  expect(response.status).toBe(426); expect(ctx.handleReportError).not.toHaveBeenCalled();
});

test('protocol-2 marker never bypasses authentication', async () => {
  const fetcher = jest.fn(), ctx = loadWorker(fetcher);
  ctx.verifyFirebaseIdToken = async () => null;
  const response = await ctx.worker.fetch(currentClientRequest('https://api.test/api/reportError', { method: 'POST', body: JSON.stringify({ appId: 'testApp', signature: 'failure', sessionId: 'a'.repeat(32), sequence: 1, payload: { message: 'test' } }) }), { FIREBASE_APP_ID: 'testApp' }, {});
  expect(response.status).toBe(401); expect(fetcher).not.toHaveBeenCalled();
});

test('beacon compatibility accepts only a bounded versioned offline envelope and leaves its body readable', async () => {
  const ctx = loadWorker();
  const request = body => new Request('https://api.test/api/setOffline', { method: 'POST', body });
  const current = request(JSON.stringify({ clientProtocol: 2, idToken: 'token' }));
  expect(await ctx.supportsMutationProtocol(current, '/api/setOffline')).toBe(true);
  expect((await current.json()).idToken).toBe('token');
  for (const body of ['{}', '{', JSON.stringify({ clientProtocol: 2, padding: 'x'.repeat(8192) })]) expect(await ctx.supportsMutationProtocol(request(body), '/api/setOffline')).toBe(false);
  expect(await ctx.supportsMutationProtocol(currentClientRequest('https://api.test/api/setOffline', { method: 'POST', headers: {}, body: '{}' }), '/api/setOffline')).toBe(true);
  expect(await ctx.supportsMutationProtocol(new Request('https://api.test/api/reportError', { method: 'POST', body: '{"clientProtocol":2}' }), '/api/reportError')).toBe(false);
});

test('CORS preflight and health remain available to unsupported clients', async () => {
  const ctx = loadWorker();
  const preflight = await ctx.worker.fetch(new Request('https://api.test/api/uploadFile', { method: 'OPTIONS', headers: { Origin: 'https://covo.app' } }), {}, {});
  expect(preflight.status).toBe(204); expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('X-Covo-Protocol');
  expect((await ctx.worker.fetch(new Request('https://api.test/api/health'), {}, {})).status).toBe(200);
});

test.each(['http://localhost:5000', 'https://simplechat-65a0d.web.app', 'https://tauri.localhost', 'https://evil.test'])('protocol preflight preserves origin restrictions without database access: %s', async origin => {
  const fetcher = jest.fn();
  const ctx = loadWorker(fetcher);
  const response = await ctx.worker.fetch(new Request('https://api.test/api/syncRtdb', {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-covo-protocol' }
  }), {}, {});
  expect(response.status).toBe(204);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin === 'https://evil.test' ? null : origin);
  const allowedHeaders = response.headers.get('Access-Control-Allow-Headers').toLowerCase().split(/\s*,\s*/);
  expect(allowedHeaders).toEqual(expect.arrayContaining(['content-type', 'authorization', 'x-covo-protocol']));
  expect(response.headers.get('Vary')).toBe('Origin');
  expect(fetcher).not.toHaveBeenCalled();
});


test.each(['accepted','project-not-found','unregistered'])('notification %s reports actual FCM acceptance without leaking tokens', async scenario => {
  const calls=[];
  const fetcher=jest.fn(async (url, options={})=>{
    calls.push([url,options]);
    if(url.includes('/notificationSettings/preferences'))return new Response('{}',{status:404});
    if(url.includes('/status/'))return new Response('null');
    if(url.includes('fcm.googleapis.com'))return new Response(JSON.stringify(scenario==='accepted'?{}:{error:{code:404,status:'NOT_FOUND',details:[{errorCode:scenario==='unregistered'?'UNREGISTERED':'PROJECT_NOT_FOUND'}]}}));
    if(url.includes('/users/bob'))return new Response(JSON.stringify({fields:{fcmTokens:{arrayValue:{values:[{stringValue:'PRIVATE_FCM_TOKEN'}]}}}}));
    if(url.endsWith('/documents:commit'))return new Response('{}');
    throw Error('unexpected request');
  });
  const ctx=loadWorker(fetcher);ctx.verifyFirebaseIdToken=async()=>({uid:'alice'});ctx.isAppAdmin=async()=>true;
  ctx.getWorkerAuthToken=async()=> 'worker';ctx.getFirestoreAdminToken=async()=> 'service-oauth';ctx.getFCMToken=async()=> 'fcm';ctx.getRTDBToken=async()=> 'rtdb';
  const response=await ctx.worker.fetch(currentClientRequest('https://api.test/api/sendNotification',{method:'POST',body:JSON.stringify({appId:'testApp',senderId:'alice',receiverIds:['bob'],title:'new',body:'message',serverId:'server',roomId:'room',idToken:'valid'})}),{FIREBASE_APP_ID:'testApp',FIREBASE_PROJECT_ID:'test',SERVICE_ACCOUNT_JSON:'{}'},{});
  const result=await response.json();expect(JSON.stringify(result)).not.toContain('PRIVATE_FCM_TOKEN');
  expect(response.status).toBe(scenario==='project-not-found'?502:200);expect(result.acceptedTokens).toBe(scenario==='accepted'?1:0);
  expect(result.expiredTokens).toBe(scenario==='unregistered'?1:0);
  const fcm=JSON.parse(calls.find(([url])=>url.includes('fcm.googleapis.com'))[1].body).message;
  expect(fcm.webpush.headers.TTL).toBe('86400');expect(new URL(fcm.webpush.fcm_options.link).searchParams.get('ownerId')).toBe('bob');
  expect(calls.some(([url])=>url.endsWith('/documents:commit'))).toBe(scenario==='unregistered');
});


test('persistent audit rows are sampled without losing recent in-memory records or issuing a write per request', async () => {
  const ctx=loadWorker();const pending=[];const inserts=[];
  const DB={prepare:sql=>({run:async()=>{},bind:(...values)=>({run:async()=>{inserts.push({sql,values});}})})};
  const request=new Request('https://api.test/api/syncRtdb');
  for(let i=0;i<20;i++)ctx.recordApiAuditLog(request,new URL(request.url),new Response('{}'),Date.now(),{DB},{waitUntil:promise=>pending.push(promise)});
  await Promise.all(pending);expect(inserts).toHaveLength(1);expect(vm.runInContext('_cfApiLogs.length',ctx)).toBe(20);
  expect(inserts[0].values.at(-1)).toContain('sampled');
});


test('a failed FCM network request becomes a bounded rejection without a retry or invalid-token cleanup', async () => {
  const fetcher=jest.fn(async()=>{throw Error('network failed');});const ctx=loadWorker(fetcher);
  const response=await ctx.sendFcmRequest('https://fcm.googleapis.com/test',{method:'POST',body:'{}'});
  expect(response.status).toBe(503);expect((await response.json()).error.status).toBe('UNAVAILABLE');expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});

test('maintenance rejects normal API users before privileged work and does not expose admin identities', async () => {
  const fetcher = jest.fn(), ctx = loadWorker(fetcher);
  ctx.readMaintenanceState = async () => ({ enabled: true, revision: 3 });
  ctx.verifyFirebaseIdToken = async () => ({ uid: 'member' }); ctx.isAppAdmin = async () => false;
  const env = { FIREBASE_APP_ID: 'testApp' };
  const response = await ctx.worker.fetch(currentClientRequest('https://api.test/api/syncRtdb', { method: 'POST', body: JSON.stringify({ idToken: 'valid' }) }), env, {});
  expect(response.status).toBe(503); expect((await response.json()).code).toBe('MAINTENANCE'); expect(fetcher).not.toHaveBeenCalled();
  const metadata = await ctx.handleMaintenanceStatus(new Request('https://api.test/api/maintenance'), env);
  expect(await metadata.json()).toEqual({ enabled: true, revision: 3, adminAllowed: false });
  expect(metadata.headers.get('Cache-Control')).toBe('no-store'); expect(fetcher).not.toHaveBeenCalled();
});

test('maintenance setting is restricted to global admins, including while the app is closed', async () => {
  const ctx = loadWorker(); ctx.verifyFirebaseIdToken = async () => ({ uid: 'server-owner' }); ctx.isAppAdmin = async () => false;
  const prepare = jest.fn();
  const response = await ctx.handleSetMaintenance(new Request('https://api.test/api/setMaintenance', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify({ enabled: false, revision: 0 }) }), { DB: { prepare }, FIREBASE_APP_ID: 'testApp' });
  expect(response.status).toBe(403); expect(prepare).not.toHaveBeenCalled();
});

function maintenanceDatabase() {
  const state = { enabled: 0, revision: 0, lock: 0 };
  return { state, prepare(sql) {
    let values = [];
    return { bind(...args) { values = args; return this; }, async first() {
      if (sql.startsWith('SELECT')) return { ...state, locked_until:state.lock };
      if (sql.includes('RETURNING')) {
        if (values[2] !== state.revision || state.lock >= values[3]) return null;
        state.lock = values[0]; return { revision: state.revision };
      }
      throw Error('Unexpected SQL');
    }, async run() {
      if (sql.includes('SET enabled = ?, revision')) { state.enabled = values[0]; state.revision++; state.lock = 0; }
      else if (sql.includes('SET enabled = 1, revision')) { state.enabled = 1; state.revision++; state.lock = values[0]; }
      else if (sql.includes('SET enabled = ?')) state.enabled = values[0];
      else if (sql.includes('SET locked_until = 0')) state.lock = 0;
      return { success: true };
    } };
  } };
}
test.each([false,true])('maintenance mirrors must complete before success; mirror failure=%s', async failure => {
  const ctx = loadWorker(), DB = maintenanceDatabase();
  ctx.verifyFirebaseIdToken = async () => ({ uid: 'global' }); ctx.isAppAdmin = async () => true;
  ctx.ensureMaintenanceAdmin = jest.fn(async () => {});
  ctx.writeMaintenanceMirrors = jest.fn(async (_, enabled) => { if (failure) throw Error('mirror unavailable'); });
  const env = { DB, FIREBASE_APP_ID: 'testApp' };
  const request = revision => new Request('https://api.test/api/setMaintenance', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify({ enabled: false, revision }) });
  const response = await ctx.handleSetMaintenance(request(0), env);
  expect(response.status).toBe(failure ? 503 : 200); expect(DB.state.enabled).toBe(failure ? 1 : 0); expect(DB.state.revision).toBe(1);
  const duplicate = await ctx.handleSetMaintenance(request(0), env); expect(duplicate.status).toBe(409);
  expect(ctx.writeMaintenanceMirrors.mock.calls.length).toBe(failure ? 2 : 1);
});

test('worker identity tokens are shared by concurrent requests and failed credentials are not cached', async () => {
  const fetcher = jest.fn(async () => new Response(JSON.stringify({ idToken: 'INTERNAL_TOKEN', expiresIn: '3600' })));
  const ctx = loadWorker(fetcher), env = { FIREBASE_PROJECT_ID: 'test', WORKER_AUTH_EMAIL: 'worker@test.invalid', WORKER_AUTH_PASSWORD: 'test-password', FIREBASE_API_KEY: 'test' };
  expect(await Promise.all([ctx.getWorkerAuthToken(env), ctx.getWorkerAuthToken(env)])).toEqual(['INTERNAL_TOKEN','INTERNAL_TOKEN']);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  const rejected = loadWorker(jest.fn(async () => new Response('{}', { status: 400 })));
  expect(await rejected.getWorkerAuthToken(env)).toBeNull(); expect(await rejected.getWorkerAuthToken(env)).toBeNull();
});

test('OAuth token cache is scoped by account and scope and removes a failed request', async () => {
  const ctx = loadWorker(); ctx._requestGoogleOAuthToken = jest.fn(async () => ({ access_token: 'INTERNAL_OAUTH', expires_in: 3600 }));
  const account = JSON.stringify({ client_email: 'service@test.invalid' });
  await Promise.all([ctx._getGoogleOAuthToken(account, 'scope-a'), ctx._getGoogleOAuthToken(account, 'scope-a')]);
  expect(ctx._requestGoogleOAuthToken).toHaveBeenCalledTimes(1);
  await ctx._getGoogleOAuthToken(account, 'scope-b'); expect(ctx._requestGoogleOAuthToken).toHaveBeenCalledTimes(2);
  ctx._requestGoogleOAuthToken.mockRejectedValueOnce(new Error('unavailable'));
  await expect(ctx._getGoogleOAuthToken(account, 'scope-c')).rejects.toThrow();
  await ctx._getGoogleOAuthToken(account, 'scope-c'); expect(ctx._requestGoogleOAuthToken).toHaveBeenCalledTimes(4);
});


test.each(['success','rtdb-failure','foreign-document'])('channel deletion is authorized, scoped and reports partial failure: %s',async scenario=>{
  let listed=false;
  const fetcher=jest.fn(async(url,options={})=>{
    if(url.includes('firebasedatabase.app'))return new Response('{}',{status:scenario==='rtdb-failure'?503:200});
    if(url.endsWith(':commit'))return new Response('{}');
    if(options.method==='DELETE')return new Response('{}');
    if(url.includes('/messages?pageSize=')){const docs=listed?[]:[{name:'projects/test/databases/(default)/documents/artifacts/testApp/servers/'+(scenario==='foreign-document'?'victim':'server')+'/rooms/room/messages/one',updateTime:'2026-10-27T00:00:00Z'}];listed=true;return new Response(JSON.stringify({documents:docs}));}
    return new Response('{}');
  });
  const ctx=loadWorker(fetcher);ctx.verifyFirebaseIdToken=async()=>({uid:'alice'});ctx.isServerAdminCheck=async()=>true;
  ctx.getFirestoreAdminToken=async()=> 'oauth';ctx.getRTDBToken=async()=> 'rtdb';
  const request=currentClientRequest('https://api.test/api/deleteChannel',{method:'POST',headers:{Authorization:'Bearer valid'},body:JSON.stringify({appId:'testApp',serverId:'server',roomId:'room'})});
  const response=await ctx.worker.fetch(request,{FIREBASE_APP_ID:'testApp',FIREBASE_PROJECT_ID:'test',SERVICE_ACCOUNT_JSON:'{}'},{});
  expect(response.status).toBe(scenario==='success'?200:503);
  const rootDelete=fetcher.mock.calls.filter(([url,options])=>url.endsWith('/rooms/room')&&options.method==='DELETE');expect(rootDelete).toHaveLength(scenario==='success'?1:0);
  const patch=fetcher.mock.calls.find(([url])=>url.includes('firebasedatabase.app'));
  expect(patch[1].method).toBe('PATCH');expect(JSON.parse(patch[1].body)).toEqual({'rooms/room':null,'deletedChannels/room':true});
  if(scenario==='foreign-document')expect(fetcher.mock.calls.some(([url])=>url.endsWith(':commit'))).toBe(false);
});

test('a forged channel deletion cannot reach privileged data or request another app',async()=>{
  const fetcher=jest.fn(),ctx=loadWorker(fetcher);ctx.verifyFirebaseIdToken=async()=>({uid:'member'});ctx.isServerAdminCheck=async()=>false;
  const env={FIREBASE_APP_ID:'testApp'};
  const request=appId=>new Request('https://api.test/api/deleteChannel',{method:'POST',headers:{Authorization:'Bearer valid'},body:JSON.stringify({appId,serverId:'server',roomId:'room',userId:'owner',isAdmin:true})});
  expect((await ctx.handleDeleteChannel(request('testApp'),env)).status).toBe(403);expect((await ctx.handleDeleteChannel(request('foreign'),env)).status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
});

test('maintenance remains blocked while the release mirrors are being committed',async()=>{
  const ctx=loadWorker(jest.fn(),true),DB=maintenanceDatabase();DB.state.enabled=1;
  ctx.verifyFirebaseIdToken=async()=>({uid:'admin'});ctx.isAppAdmin=async()=>true;ctx.ensureMaintenanceAdmin=async()=>{};
  ctx.writeMaintenanceMirrors=async()=>{expect(await ctx.readMaintenanceState({DB,FIREBASE_APP_ID:'testApp'})).toMatchObject({enabled:true,transitioning:true});};
  const request=new Request('https://api.test/api/setMaintenance',{method:'POST',headers:{Authorization:'Bearer valid'},body:JSON.stringify({enabled:false,revision:0})});
  expect((await ctx.handleSetMaintenance(request,{DB,FIREBASE_APP_ID:'testApp'})).status).toBe(200);
  expect(await ctx.readMaintenanceState({DB,FIREBASE_APP_ID:'testApp'})).toEqual({enabled:false,revision:1});
});
