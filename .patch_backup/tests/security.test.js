const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');
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
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

const getDb = (auth) => {
  return testEnv.authenticatedContext(auth.uid, { email: auth.email }).firestore();
};

// ============================================================================
// テストスイート
// ============================================================================
describe('Firestore Security Rules Testing', () => {

  // ★これでJestが「テストがある」と必ず認識します
  it('【環境確認】Jestが正しく動いているか (Must Pass)', () => {
    expect(true).toBe(true);
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
  });

});