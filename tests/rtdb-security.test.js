const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { ref, set, update, remove } = require('firebase/database');

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

describe.each([['server', message], ['DM', dmMessage]])('%s message boundaries', (_, path) => {
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
    await assertSucceeds(set(ref(db('alice'), path), { senderId: 'alice', text: 'enc::v1::iv::new', timestamp: 2 }));
    await assertFails(set(ref(db('bob'), `${path}spoof`), { senderId: 'alice', text: 'spoof' }));
  });
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
