const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, runTransaction, writeBatch } = require('firebase/firestore');
const fs = require('fs');

const PROJECT_ID = "demo-covo-security-test";
const APP_ID = "testApp";

let testEnv;

// ============================================================================
// セットアップ & クリーンアップ
// ============================================================================
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });
}, 30000);

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

const getDb = (auth) => {
  return testEnv.authenticatedContext(auth.uid, { email: auth.email }).firestore();
};

test('notification preferences are private to their owner and reject unrelated fields', async () => {
  const path = `artifacts/${APP_ID}/users/alice/notificationSettings/preferences`;
  const alice = getDb({ uid: 'alice' }), bob = getDb({ uid: 'bob' });
  await assertSucceeds(setDoc(doc(alice, path), { servers: { server: 'mentions' }, channels: {} }));
  await assertFails(getDoc(doc(bob, path)));
  await assertFails(setDoc(doc(bob, path), { channels: {} }));
  await assertFails(updateDoc(doc(alice, path), { admin: true }));
});

test('nonmembers cannot read or inject room activity or request room keys', async () => {
  const base = `artifacts/${APP_ID}/servers/activity`;
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), base), { createdBy: 'alice', joinedUsers: ['alice'], serverAdmins: [] });
    await setDoc(doc(context.firestore(), `${base}/rooms/general/readReceipts/alice`), { lastRead: 1 });
    await setDoc(doc(context.firestore(), `${base}/rooms/general/typing/alice`), { typing: true });
  });
  const outsider = getDb({ uid: 'mallory' }), alice = getDb({ uid: 'alice' });
  for (const path of ['readReceipts', 'typing']) {
    await assertFails(getDoc(doc(outsider, `${base}/rooms/general/${path}/alice`)));
    await assertFails(setDoc(doc(outsider, `${base}/rooms/general/${path}/mallory`), { value: 1 }));
    await assertSucceeds(setDoc(doc(alice, `${base}/rooms/general/${path}/alice`), { value: 1 }));
  }
  await assertFails(setDoc(doc(outsider, `${base}/rooms/general/rescueRequests/mallory`), { requestedAt: 1 }));
});

test('DM key delivery appends versions without granting peers destructive access to existing keys', async () => {
  const base = `artifacts/${APP_ID}/dm_channels/alice_bob`;
  const alice = getDb({ uid: 'alice' }), bob = getDb({ uid: 'bob' });
  await assertSucceeds(setDoc(doc(alice, base), { participants: ['alice', 'bob'] }));
  await assertFails(updateDoc(doc(alice, base), { sharedKey: 'plaintext' }));
  await assertFails(setDoc(doc(alice, `artifacts/${APP_ID}/dm_channels/alice_eve`), { participants: ['alice', 'eve'], sharedKey: 'plaintext' }));
  await assertFails(setDoc(doc(alice, `${base}/keys/mallory`), { wrappedKey: 'misdirected' }));
  await testEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), `${base}/keys/mallory`), { wrappedKey: 'legacy-misdirected' }));
  await assertFails(getDoc(doc(getDb({ uid: 'mallory' }), `${base}/keys/mallory`)));
  const key = doc(alice, `${base}/keys/bob`);
  await assertSucceeds(setDoc(key, { versions: { '1': 'original' }, wrappedKey: 'original' }));
  await assertFails(updateDoc(key, { 'versions.1': 'tampered' }));
  await assertFails(deleteDoc(key));
  await assertSucceeds(setDoc(key, { versions: { '2': 'new' }, latestVersion: '2', wrappedKey: 'new' }, { merge: true }));
  await assertFails(setDoc(key, { versions: { '3': 'new' } }));
  await assertSucceeds(updateDoc(doc(bob, key.path), { 'versions.1': 'recipient-recovery' }));
  const legacy = doc(alice, `${base}/keys/alice`);
  await assertSucceeds(setDoc(legacy, { wrappedKey: 'legacy' }));
  await assertFails(setDoc(doc(bob, legacy.path), { versions: { '2': 'drop-legacy' } }, { merge: true }));
  await assertSucceeds(setDoc(doc(bob, legacy.path), { versions: { '1': 'legacy', '2': 'next' } }, { merge: true }));
});

test.each(['artifacts/testApp/vc_signaling/session', 'vc_signaling/session'])('VC endpoints are immutable at %s', async path => {
  const alice = getDb({ uid: 'alice' }), bob = getDb({ uid: 'bob' });
  await assertSucceeds(setDoc(doc(alice, path), { fromUid: 'alice', toUid: 'bob', offer: 'original' }));
  await assertSucceeds(updateDoc(doc(bob, path), { answer: 'accepted' }));
  await assertFails(updateDoc(doc(bob, path), { fromUid: 'mallory' }));
  await assertFails(updateDoc(doc(alice, path), { toUid: 'mallory' }));
  await assertFails(getDoc(doc(getDb({ uid: 'mallory' }), path)));
});

test('legacy DM migration atomically wraps both recipients and removes the plaintext, with rollback on rejected key changes', async () => {
  const path = `artifacts/${APP_ID}/dm_channels/alice_bob`;
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), path), { participants: ['alice', 'bob'], sharedKey: 'legacy' });
    await setDoc(doc(context.firestore(), `${path}/keys/bob`), { versions: { '2': 'keep' }, latestVersion: '2' });
  });
  const alice = getDb({ uid: 'alice' });
  await assertSucceeds(runTransaction(alice, async tx => {
    await tx.get(doc(alice, path));
    tx.set(doc(alice, `${path}/keys/alice`), { versions: { '1': 'wrapped-alice' } });
    tx.set(doc(alice, `${path}/keys/bob`), { versions: { '1': 'wrapped-bob' } }, { merge: true });
    tx.update(doc(alice, path), { sharedKey: deleteField() });
  }));
  expect((await getDoc(doc(alice, path))).data().sharedKey).toBeUndefined();
  expect((await getDoc(doc(alice, `${path}/keys/bob`))).data().versions['2']).toBe('keep');
  await testEnv.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), path), { sharedKey: 'legacy' }));
  const batch = writeBatch(alice);
  batch.update(doc(alice, `${path}/keys/bob`), { 'versions.2': 'tampered' });
  batch.update(doc(alice, path), { sharedKey: deleteField() });
  await assertFails(batch.commit());
  expect((await getDoc(doc(alice, path))).data().sharedKey).toBe('legacy');
});

// ============================================================================
// テストスイート
// ============================================================================
describe('Firestore Security Rules Testing', () => {

  // ★これでJestが「テストがある」と必ず認識します
  it('【環境確認】Jestが正しく動いているか (Must Pass)', () => {
    expect(true).toBe(true);
  });

  // -----------------------------------------------------------------------
  describe('認可境界の回帰検証', () => {
    it('メンバーの反応と鍵の追加を許可し、他人の反応・鍵・本文の破壊を拒否すること', async () => {
      const base = `artifacts/${APP_ID}/servers/safe`;
      await testEnv.withSecurityRulesDisabled(async c => {
        await setDoc(doc(c.firestore(), base), { createdBy: 'owner', joinedUsers: ['alice', 'bob', 'mod'], serverAdmins: ['mod'] });
        await setDoc(doc(c.firestore(), `${base}/rooms/room1`), { currentKeyVersion: 1 });
        await setDoc(doc(c.firestore(), `${base}/rooms/room1/messages/msg1`), { senderId: 'alice', text: 'cipher', reactions: { alice: 'A' } });
        await setDoc(doc(c.firestore(), `${base}/rooms/room1/roomKeys/alice`), { versions: { '1': 'original' }, latestVersion: '1' });
      });
      const bob = getDb({ uid: 'bob' });
      const mod = getDb({ uid: 'mod' });
      const msg = doc(bob, `${base}/rooms/room1/messages/msg1`);
      await assertSucceeds(updateDoc(msg, { 'reactions.bob': 'B' }));
      await assertFails(updateDoc(msg, { 'reactions.alice': 'B' }));
      await assertFails(updateDoc(doc(mod, msg.path), { isPinned: true, reactions: {} }));
      await assertFails(getDoc(doc(getDb({ uid: 'mallory' }), msg.path)));
      await assertFails(setDoc(doc(mod, `${base}/rooms/room1/messages/spoof`), { senderId: 'alice', text: 'spoof' }));
      const key = doc(bob, `${base}/rooms/room1/roomKeys/alice`);
      await assertSucceeds(setDoc(key, { versions: { '2': 'new' }, latestVersion: '2' }, { merge: true }));
      await assertFails(updateDoc(key, { 'versions.1': 'tampered' }));
      await assertFails(deleteDoc(key));
      await assertFails(updateDoc(doc(bob, `${base}/rooms/room1`), { sharedKey: 'plaintext' }));
      await assertFails(updateDoc(doc(bob, `${base}/rooms/room1`), { currentKeyVersion: 999 }));
      await assertFails(updateDoc(doc(mod, base), { serverAdmins: ['owner', 'mod', 'bob'] }));
      await assertSucceeds(updateDoc(doc(mod, base), { name: 'Renamed' }));
    });

    it('DM参加者をすり替えずメタ情報と相手用の鍵を更新できること', async () => {
      const alice = getDb({ uid: 'alice' });
      const bob = getDb({ uid: 'bob' });
      const path = `artifacts/${APP_ID}/dm_channels/alice_bob`;
      await assertSucceeds(setDoc(doc(alice, path), { participants: ['alice', 'bob'] }));
      await assertSucceeds(updateDoc(doc(bob, path), { lastMessageAt: 123 }));
      await assertSucceeds(setDoc(doc(alice, `${path}/keys/bob`), { wrappedKey: 'cipher' }));
      await assertFails(updateDoc(doc(alice, path), { participants: ['alice', 'mallory'] }));
      await assertFails(setDoc(doc(alice, `artifacts/${APP_ID}/dm_channels/bob_mallory`), { participants: ['alice', 'bob'] }));
      await assertFails(getDoc(doc(getDb({ uid: 'mallory' }), `${path}/keys/bob`)));
    });

    it.each([
      ['device_transfers/code1', { uid: 'alice' }],
      ['p2p_log_sync/sync1', { requesterUid: 'alice', targetUid: 'bob' }],
      ['calls/call1', { caller: { uid: 'alice' }, calleeUid: 'bob' }],
      ['fileshares/share1', { sender: { uid: 'alice' }, receiverUid: 'bob' }]
    ])('%s の子コレクションを無関係なユーザーへ公開しないこと', async (relative, data) => {
      const path = `artifacts/${APP_ID}/${relative}`;
      const alice = getDb({ uid: 'alice' });
      const mallory = getDb({ uid: 'mallory' });
      await assertSucceeds(setDoc(doc(alice, path), data));
      await assertSucceeds(setDoc(doc(alice, `${path}/candidates/c1`), { candidate: 'ice' }));
      await assertFails(getDoc(doc(mallory, `${path}/candidates/c1`)));
      await assertFails(setDoc(doc(mallory, `${path}/candidates/c2`), { candidate: 'injected' }));
    });

    it('移行セッションとリカバリー索引の所有者を奪取できないこと', async () => {
      const alice = getDb({ uid: 'alice' });
      const bob = getDb({ uid: 'bob' });
      const path = `artifacts/${APP_ID}/device_transfers/code1`;
      await assertSucceeds(setDoc(doc(alice, path), { uid: 'alice' }));
      await assertFails(updateDoc(doc(bob, path), { uid: 'bob' }));
      const recovery = `artifacts/${APP_ID}/recovery_index/hash1`;
      await assertSucceeds(setDoc(doc(alice, recovery), { userId: 'alice' }));
      await assertFails(setDoc(doc(bob, recovery), { userId: 'bob' }));
    });
  });

  // -----------------------------------------------------------------------
  // 【脆弱性1】退出ロジックの欠陥 (Server Leave)
  // -----------------------------------------------------------------------
  describe('脆弱性1: サーバー退出時の破壊行為防止', () => {
    const serverId = "server1";
    const serverPath = `artifacts/${APP_ID}/servers/${serverId}`;
    
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, serverPath), {
          joinedUsers: ['alice', 'bob', 'admin'],
          serverAdmins: ['admin'],
          memberCount: 3,
          createdBy: 'admin'
        });
      });
    });

    it('【正常系】Aliceが自分自身のみを配列から削除して退出できること (Must Pass)', async () => {
      const aliceDb = getDb({ uid: 'alice' });
      const ref = doc(aliceDb, serverPath);
      await assertSucceeds(updateDoc(ref, {
        joinedUsers: ['bob', 'admin'],
        serverAdmins: ['admin'],
        memberCount: 2
      }));
    });

    it('【異常系】Aliceが退出時にBob等も一緒に削除しようとすると弾かれること (Must Fail)', async () => {
      const aliceDb = getDb({ uid: 'alice' });
      const ref = doc(aliceDb, serverPath);
      await assertFails(updateDoc(ref, {
        joinedUsers: ['admin'],
        serverAdmins: ['admin'],
        memberCount: 1
      }));
    });
  });

  // -----------------------------------------------------------------------
  // 【脆弱性2】サーバー作成時の強制参加スパム (Forced Join)
  // -----------------------------------------------------------------------
  describe('脆弱性2: サーバー作成時の他者強制参加防止', () => {
    const newServerId = "newServer";
    const serverPath = `artifacts/${APP_ID}/servers/${newServerId}`;

    it('【正常系】Aliceが自分だけを参加者としてサーバーを作成できること (Must Pass)', async () => {
      const aliceDb = getDb({ uid: 'alice' });
      await assertSucceeds(setDoc(doc(aliceDb, serverPath), {
        createdBy: 'alice',
        serverAdmins: ['alice'],
        joinedUsers: ['alice'],
        memberCount: 1
      }));
    });

    it('【異常系】Aliceが他人のUID(Bob)を勝手に追加して作成しようとすると弾かれること (Must Fail)', async () => {
      const aliceDb = getDb({ uid: 'alice' });
      await assertFails(setDoc(doc(aliceDb, serverPath), {
        createdBy: 'alice',
        serverAdmins: ['alice'],
        joinedUsers: ['alice', 'bob'],
        memberCount: 2
      }));
    });
  });

  // -----------------------------------------------------------------------
  // 【脆弱性3】E2EEルームキーの暗号化DoS (Room Keys)
  // -----------------------------------------------------------------------
  describe('脆弱性3: E2EEルームキーの不正上書き/削除防止', () => {
    const serverId = "server1";
    const roomId = "room1";
    const keyId = "bob_key";
    const keyPath = `artifacts/${APP_ID}/servers/${serverId}/rooms/${roomId}/roomKeys/${keyId}`;

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, `artifacts/${APP_ID}/servers/${serverId}`), {
          joinedUsers: ['alice', 'bob'],
          serverAdmins: ['alice']
        });
        await setDoc(doc(db, keyPath), {
          keyData: 'encrypted_data_for_bob'
        });
      });
    });

    it('【正常系】参加メンバー(Bob)が新しいメンバー(Charlie)用の鍵を作成(create)できること (Must Pass)', async () => {
      const bobDb = getDb({ uid: 'bob' });
      const newKeyPath = `artifacts/${APP_ID}/servers/${serverId}/rooms/${roomId}/roomKeys/charlie_key`;
      await assertSucceeds(setDoc(doc(bobDb, newKeyPath), {
        keyData: 'encrypted_data_for_charlie'
      }));
    });

    it('【異常系】一般メンバー(Bob)が既存の鍵を削除(delete)・上書き(update)しようとすると弾かれること (Must Fail)', async () => {
      const bobDb = getDb({ uid: 'bob' });
      const ref = doc(bobDb, keyPath);
      await assertFails(updateDoc(ref, { keyData: 'malicious_garbage_data' }));
      await assertFails(deleteDoc(ref));
    });
  });

  // -----------------------------------------------------------------------
  // 【脆弱性5】P2Pシグナリングのなりすまし (Signaling Spoofing)
  // -----------------------------------------------------------------------
  describe('脆弱性5: P2PシグナリングID改ざん防止', () => {
    const shareId = "share1";
    const sharePath = `artifacts/${APP_ID}/fileshares/${shareId}`;

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, sharePath), {
          sender: { uid: 'alice' },
          receiverUid: 'bob',
          status: 'init'
        });
      });
    });

    it('【正常系】Aliceが自分とBob間のシグナリングデータを更新(SDP追加など)できること (Must Pass)', async () => {
      const aliceDb = getDb({ uid: 'alice' });
      const ref = doc(aliceDb, sharePath);
      await assertSucceeds(updateDoc(ref, { status: 'connecting', sdp: 'dummy_sdp_data' }));
    });

    it('【異常系】Aliceが更新時に送信者(sender)をCharlieにすり替えようとすると弾かれること (Must Fail)', async () => {
      const aliceDb = getDb({ uid: 'alice' });
      const ref = doc(aliceDb, sharePath);
      await assertFails(updateDoc(ref, { sender: { uid: 'charlie' }, status: 'connecting' }));
    });
    
    it('【異常系】Bobが更新時に受信者(receiverUid)を自分以外にすり替えようとすると弾かれること (Must Fail)', async () => {
      const bobDb = getDb({ uid: 'bob' });
      const ref = doc(bobDb, sharePath);
      await assertFails(updateDoc(ref, { receiverUid: 'charlie' }));
    });
  });

  // -----------------------------------------------------------------------
  // 【新セキュリティ検証】メッセージ削除・改ざん防止と権限階層の検証 (Discord標準)
  // -----------------------------------------------------------------------
  describe('メッセージセキュリティ: 他人の発言削除・本文改ざん防止', () => {
    const serverId = "server1";
    const roomId = "room1";
    const msgId = "msg_alice_1";
    const msgPath = `artifacts/${APP_ID}/servers/${serverId}/rooms/${roomId}/messages/${msgId}`;

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, `artifacts/${APP_ID}/settings/adminList`), {
          admins: ['super_admin'],
          emails: ['superadmin@covo.app']
        });
        await setDoc(doc(db, `artifacts/${APP_ID}/settings/listAdminList`), {
          admins: ['list_admin'],
          emails: ['listadmin@covo.app']
        });
        await setDoc(doc(db, `artifacts/${APP_ID}/servers/${serverId}`), {
          joinedUsers: ['alice', 'bob', 'moderator', 'list_admin', 'super_admin'],
          serverAdmins: ['moderator'],
          createdBy: 'owner_user'
        });
        await setDoc(doc(db, msgPath), {
          senderId: 'alice',
          text: 'Hello from Alice',
          createdAt: 1000,
          timestamp: 1000,
          isPinned: false
        });
      });
    });

    it('【正常系】送信者本人 (Alice) は自分のメッセージを削除できること (Must Pass)', async () => {
      const aliceDb = getDb({ uid: 'alice' });
      await assertSucceeds(deleteDoc(doc(aliceDb, msgPath)));
    });

    it('【正常系】サーバーモデレーター (moderator) は他人の不適切メッセージを削除できること (Must Pass)', async () => {
      const modDb = getDb({ uid: 'moderator' });
      await assertSucceeds(deleteDoc(doc(modDb, msgPath)));
    });

    it('【正常系】全体管理者 (super_admin) は他人のメッセージを削除できること (Must Pass)', async () => {
      const adminDb = getDb({ uid: 'super_admin' });
      await assertSucceeds(deleteDoc(doc(adminDb, msgPath)));
    });

    it('【異常系】一般メンバー (Bob) がAliceのメッセージを削除しようとすると弾かれること (Must Fail)', async () => {
      const bobDb = getDb({ uid: 'bob' });
      await assertFails(deleteDoc(doc(bobDb, msgPath)));
    });

    it('【異常系】リスト管理者 (list_admin) がAliceのメッセージを削除しようとすると弾かれること (Must Fail)', async () => {
      const listAdminDb = getDb({ uid: 'list_admin' });
      await assertFails(deleteDoc(doc(listAdminDb, msgPath)));
    });

    it('【異常系】モデレーターや一般ユーザーが他人のメッセージ本文を改ざんしようとすると弾かれること (Must Fail)', async () => {
      const modDb = getDb({ uid: 'moderator' });
      await assertFails(updateDoc(doc(modDb, msgPath), {
        text: 'Tampered malicious message by moderator'
      }));
    });
  });

  // -----------------------------------------------------------------------
  // 【新セキュリティ検証】サーバー・ルーム・管理者昇格の保護 (Discord標準)
  // -----------------------------------------------------------------------
  describe('サーバー・ルーム保護: オーナーシップ保護と権限昇格防止', () => {
    const serverId = "server1";
    const serverPath = `artifacts/${APP_ID}/servers/${serverId}`;
    const roomPath = `artifacts/${APP_ID}/servers/${serverId}/rooms/room1`;

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, `artifacts/${APP_ID}/settings/adminList`), {
          admins: ['super_admin']
        });
        await setDoc(doc(db, serverPath), {
          joinedUsers: ['owner_user', 'moderator', 'regular_user'],
          serverAdmins: ['moderator'],
          createdBy: 'owner_user',
          name: 'Original Server'
        });
        await setDoc(doc(db, roomPath), {
          name: 'General',
          createdBy: 'owner_user'
        });
      });
    });

    it('【正常系】サーバーオーナー (owner_user) はサーバーを削除できること (Must Pass)', async () => {
      const ownerDb = getDb({ uid: 'owner_user' });
      await assertSucceeds(deleteDoc(doc(ownerDb, serverPath)));
    });

    it('【正常系】全体管理者 (super_admin) はサーバーを削除できること (Must Pass)', async () => {
      const adminDb = getDb({ uid: 'super_admin' });
      await assertSucceeds(deleteDoc(doc(adminDb, serverPath)));
    });

    it('【異常系】モデレーター (moderator) や一般ユーザーがサーバー自体を削除しようとすると弾かれること (Must Fail)', async () => {
      const modDb = getDb({ uid: 'moderator' });
      await assertFails(deleteDoc(doc(modDb, serverPath)));
    });

    it('【異常系】一般ユーザー (regular_user) がルームを作成・削除しようとすると弾かれること (Must Fail)', async () => {
      const userDb = getDb({ uid: 'regular_user' });
      const newRoomPath = `artifacts/${APP_ID}/servers/${serverId}/rooms/hack_room`;
      await assertFails(setDoc(doc(userDb, newRoomPath), { name: 'Hack' }));
      await assertFails(deleteDoc(doc(userDb, roomPath)));
    });

    it('【異常系】一般ユーザーやリスト管理者が全体管理者リスト (adminList) を書き換えて特権奪取しようとすると弾かれること (Must Fail)', async () => {
      const userDb = getDb({ uid: 'regular_user' });
      const adminListPath = `artifacts/${APP_ID}/settings/adminList`;
      await assertFails(setDoc(doc(userDb, adminListPath), { admins: ['regular_user'] }));
    });
    it('【正常系】シグナリング送信者本人がOffer/Answerを送信・更新できること (Must Pass)', async () => {
      const aliceDb = getDb({ uid: 'alice' });
      const sigPath = `artifacts/${APP_ID}/vc_signaling/alice_bob_test`;
      await assertSucceeds(setDoc(doc(aliceDb, sigPath), {
        fromUid: 'alice',
        toUid: 'bob',
        type: 'offer',
        sdp: 'dummy_sdp'
      }));
      await assertSucceeds(setDoc(doc(aliceDb, sigPath), {
        fromUid: 'alice',
        toUid: 'bob',
        type: 'offer',
        sdp: 'updated_sdp'
      }));
    });
    it('【異常系】シグナリング送信者が他人になりすましてOfferを作成・更新しようとすると弾かれること (Must Fail)', async () => {
      const aliceDb = getDb({ uid: 'alice' });
      const sigPath = `artifacts/${APP_ID}/vc_signaling/spoof_test`;
      await assertFails(setDoc(doc(aliceDb, sigPath), {
        fromUid: 'charlie',
        toUid: 'bob',
        type: 'offer'
      }));
    });
    });
    });
