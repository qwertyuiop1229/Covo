const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { ref, set, update, remove, get } = require('firebase/database');

let env;
const app = 'artifacts/testApp';
const server = `${app}/servers/server1`;
const message = `${server}/rooms/general/messages/msg1`;
const dmMessage = `${app}/dm_messages/alice_bob/msg1`;
const db = uid => env.authenticatedContext(uid).database();
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-covo-security-test', database: { rules: fs.readFileSync('database.rules.json', 'utf8') } });
});
afterAll(async () => { if (env) await env.cleanup(); });
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async c => {
    await set(ref(c.database(), server), { createdBy: 'owner', serverAdmins: { mod: true }, members: { alice: true, bob: true } });
    for (const path of [message, dmMessage]) await set(ref(c.database(), path), { senderId: 'alice', text: 'enc::v1::iv::cipher', timestamp: 1, isPinned: false, reactions: { alice: 'A' } });
  });
});

test('maintenance blocks every user data path including atomic bypass attempts, while global admins can repair', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await set(ref(context.database(), 'maintenance'), { enabled: true, appId: 'testApp' });
    await set(ref(context.database(), `${app}/settings/adminList/admins`), { global: true, intruder: false });
  });
  for (const uid of ['alice','owner','mod','intruder']) {
    await assertFails(get(ref(db(uid), message)));
    await assertFails(update(ref(db(uid), message), { text: 'enc::v1::changed' }));
    await assertFails(set(ref(db(uid), `status/${uid}`), { state: 'online' }));
    await assertFails(update(ref(db(uid)), { 'maintenance/enabled': false, [`${message}/text`]: 'bypass' }));
  }
  await assertSucceeds(get(ref(env.unauthenticatedContext().database(), 'maintenance')));
  await assertFails(set(ref(db('global'), 'maintenance/enabled'), false));
  await assertFails(set(ref(db('global'), `${app}/settings/adminList/admins/outsider`), true));
  await assertSucceeds(get(ref(db('global'), message)));
  await assertSucceeds(remove(ref(db('global'), message)));
}, 30000);

describe.each([['server', message], ['DM', dmMessage]])('%s message boundaries', (_, path) => {
  test('new single-store records cannot have their storage version changed or removed', async () => {
    await assertSucceeds(remove(ref(db('alice'), path)));
    await assertSucceeds(set(ref(db('alice'), path), { senderId: 'alice', text: 'enc::v1::iv::new', timestamp: 2, storageVersion: 2, clientProtocol: 2 }));
    await assertFails(update(ref(db('alice'), path), { storageVersion: 1 }));
    await assertFails(remove(ref(db('alice'), `${path}/storageVersion`)));
    await assertFails(update(ref(db('alice'), path), { clientProtocol: 1 }));
    await assertFails(remove(ref(db('alice'), `${path}/clientProtocol`)));
    await assertSucceeds(update(ref(db('alice'), path), { text: 'enc::v1::iv::edited' }));
  });
  test('sender edits content, participant reacts and pins with proper scope', async () => {
    await assertSucceeds(update(ref(db('alice'), path), { text: 'enc::v1::iv::updated' }));
    await assertSucceeds(set(ref(db('bob'), `${path}/reactions/bob`), 'B'));
    await assertSucceeds(remove(ref(db('bob'), `${path}/reactions/bob`)));
    await assertSucceeds(update(ref(db(path === message ? 'mod' : 'bob'), path), { isPinned: true }));
  });
  test('reactions and pins never authorize rewriting another sender or text', async () => {
    await assertFails(update(ref(db('bob'), path), { text: 'tampered', isPinned: true }));
    await assertFails(update(ref(db('bob'), path), { text: 'tampered', reactions: { bob: 'B' } }));
    await assertFails(update(ref(db('bob'), path), { senderId: 'bob' }));
    await assertFails(update(ref(db('alice'), path), { userId: 'bob' }));
    await assertFails(remove(ref(db('bob'), `${path}/reactions/alice`)));
    await assertFails(set(ref(db('mallory'), `${path}/reactions/mallory`), 'M'));
    await assertFails(remove(ref(db('bob'), path)));
  });
  test('sender can delete and create encrypted messages', async () => {
    await assertSucceeds(remove(ref(db('alice'), path)));
    await assertSucceeds(set(ref(db('alice'), path), { senderId: 'alice', text: 'enc::v1::iv::new', timestamp: 2, storageVersion: 2, clientProtocol: 2 }));
    await assertFails(set(ref(db('bob'), `${path}spoof`), { senderId: 'alice', text: 'spoof' }));
  });
});

test('one atomic receipt update cannot mark another user read', async () => {
  await assertSucceeds(update(ref(db('alice')), {
    [`${server}/rooms/general/readReceipts/alice`]: { lastReadMessageId: 'msg1', lastReadAt: 100 },
    [`${app}/users/alice/readStates/general`]: { lastReadAt: 100 }
  }));
  await assertFails(update(ref(db('alice')), {
    [`${server}/rooms/general/readReceipts/bob`]: { lastReadMessageId: 'msg1', lastReadAt: 100 },
    [`${app}/users/alice/readStates/general`]: { lastReadAt: 100 }
  }));
});

test('moderator cannot bypass message rules through a room or server update', async () => {
  await assertFails(update(ref(db('mod'), server), { 'rooms/general/messages/msg1/text': 'tampered' }));
  await assertFails(update(ref(db('mod'), `${server}/rooms/general`), { 'messages/msg1/text': 'tampered' }));
  await assertSucceeds(remove(ref(db('mod'), message)));
});

test.each([
  ['calls/call1', { caller: { uid: 'alice' }, calleeUid: 'bob' }, { caller: { uid: 'mallory' } }],
  ['fileshares/share1', { sender: { uid: 'alice' }, receiverUid: 'bob' }, { sender: { uid: 'mallory' } }],
  ['p2p_log_sync/sync1', { requesterUid: 'alice', targetUid: 'bob' }, { requesterUid: 'mallory' }],
  ['device_transfers/code1', { uid: 'alice' }, { uid: 'mallory' }]
])('session %s cannot be claimed or reassigned', async (path, original, forged) => {
  await assertSucceeds(set(ref(db('alice'), `${app}/${path}`), original));
  await assertFails(update(ref(db('mallory'), `${app}/${path}`), forged));
  await assertFails(update(ref(db('alice'), `${app}/${path}`), forged));
  await assertSucceeds(update(ref(db('alice'), `${app}/${path}`), { status: 'connected' }));
});


test.each([
  server + '/members/mallory', server + '/serverAdmins/mallory',
  app + '/settings/adminList/admins/mallory', 'artifacts/simplechat-65a0d/settings/adminList/admins/mallory'
])('false role flags never authorize reads or writes: %s', async rolePath => {
  await env.withSecurityRulesDisabled(c => set(ref(c.database(), rolePath), false));
  const attacker = db('mallory');
  await assertFails(get(ref(attacker, message)));
  await assertFails(get(ref(attacker, dmMessage)));
  await assertFails(update(ref(attacker, message), { isPinned: true }));
  await assertFails(set(ref(attacker, server + '/rooms/general/readReceipts/mallory'), { lastReadAt: 100 }));
  await assertFails(set(ref(attacker, 'status/alice'), { state: 'offline' }));
  await assertSucceeds(get(ref(db('alice'), message)));
});


test('real RTDB REST ETags reject stale deletes and accept only the current version', async () => {
  const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  if (!host) throw Error('RTDB Emulator is required');
  const url = 'http://' + host + '/' + message + '.json?ns=demo-covo-security-test';
  const headers = { Authorization: 'Bearer owner', 'X-Firebase-ETag': 'true' };
  const first = await fetch(url, { headers }); expect(first.status).toBe(200); const stale = first.headers.get('ETag'); expect(stale).toBeTruthy();
  await update(ref(db('alice'), message), { text: 'enc::v1::iv::new-version' });
  const rejected = await fetch(url, { method: 'DELETE', headers: { Authorization: 'Bearer owner', 'if-match': stale } });
  expect(rejected.status).toBe(412); expect((await get(ref(db('alice'), message))).exists()).toBe(true);
  const current = await fetch(url, { headers });
  const removed = await fetch(url, { method: 'DELETE', headers: { Authorization: 'Bearer owner', 'if-match': current.headers.get('ETag') } });
  expect(removed.status).toBe(200); expect((await get(ref(db('alice'), message))).exists()).toBe(false);
});


describe.each([['server', message], ['DM', dmMessage]])('%s retired message format', (_, path) => {
  test('legacy create including partial child and multipath writes cannot allocate a body', async () => {
    const fresh = path + '_old';
    await assertFails(set(ref(db('alice'), fresh), { senderId: 'alice', text: 'legacy' }));
    await assertFails(update(ref(db('alice'), fresh), { senderId: 'alice', text: 'legacy' }));
    await assertFails(set(ref(db('alice'), fresh + '/text'), 'legacy'));
    await assertFails(update(ref(db('alice')), { [fresh]: { senderId: 'alice', text: 'legacy' } }));
    await assertFails(set(ref(db('alice'), fresh), { senderId: 'alice', text: 'legacy', storageVersion: 1 }));
    await assertFails(set(ref(db('alice'), fresh), { senderId: 'alice', text: 'legacy', storageVersion: 2 }));
    await assertSucceeds(set(ref(db('alice'), fresh), { senderId: 'alice', text: 'enc::iv::cipher', timestamp: 2, storageVersion: 2, clientProtocol: 2 }));
    await assertFails(set(ref(db('mallory'), fresh + '_spoof'), { senderId: 'mallory', text: 'cipher', storageVersion: 2, clientProtocol: 2 }));
  });
});


test('deleted-channel tombstones block queued bodies and late key writes for members and admins',async()=>{
  await env.withSecurityRulesDisabled(async c=>{await update(ref(c.database(),server),{'rooms/general':null,'deletedChannels/general':true});});
  for(const uid of ['alice','owner','mod']){
    await assertFails(set(ref(db(uid),message),{senderId:uid,text:'enc::v1::iv::cipher',timestamp:2,storageVersion:2,clientProtocol:2}));
    await assertFails(set(ref(db(uid),server+'/rooms/general/roomKeys/'+uid),{wrappedKey:'late'}));
  }
});
