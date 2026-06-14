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

});