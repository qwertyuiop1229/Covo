const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// サービスアカウントキーのパス
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error("❌ エラー: serviceAccountKey.json がプロジェクトのルートディレクトリに見つかりません。");
  console.error("Firebase Console (プロジェクト設定 > サービスアカウント) から新しい秘密鍵を生成し、プロジェクトの直下 (package.jsonと同じ階層) に配置してください。");
  process.exit(1);
}

const serviceAccount = require(SERVICE_ACCOUNT_PATH);

// RTDBのURL (index.html から抽出したURL)
const DATABASE_URL = "https://simplechat-65a0d-default-rtdb.asia-southeast1.firebasedatabase.app";
const APP_ID = "simplechat";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DATABASE_URL
});

const firestore = admin.firestore();
const rtdb = admin.database();

/**
 * オブジェクト内のFirestore Timestampを再帰的に探し、
 * RTDB用のミリ秒整数 (Unix Timestamp) に変換する
 */
function convertDataForRTDB(data) {
  if (data === null || data === undefined) return data;
  
  // FirestoreのTimestampオブジェクトの判定
  if (data && typeof data.toDate === 'function' && typeof data.toMillis === 'function') {
    return data.toMillis();
  }
  // 念のため、Admin SDK特有の Timestamp 構造 (_seconds, _nanoseconds) のチェック
  if (data && typeof data === 'object' && '_seconds' in data && '_nanoseconds' in data) {
    return (data._seconds * 1000) + Math.floor(data._nanoseconds / 1000000);
  }
  // 配列の場合
  if (Array.isArray(data)) {
    return data.map(item => convertDataForRTDB(item));
  }
  // オブジェクトの場合
  if (typeof data === 'object') {
    const converted = {};
    for (const [key, value] of Object.entries(data)) {
      // Undefined は RTDB に保存できないためスキップ (エラーになる)
      if (value !== undefined) {
        converted[key] = convertDataForRTDB(value);
      }
    }
    return converted;
  }
  
  return data;
}

/**
 * 特定のコレクションを再帰的に取得し、RTDBに書き込む
 */
async function migrateCollection(collectionRef, rtdbPath) {
  const snapshot = await collectionRef.get();
  
  if (snapshot.empty) {
    return;
  }

  console.log(`\n📂 コレクション [${collectionRef.path}] の移行を開始... (${snapshot.size} ドキュメント)`);
  
  let count = 0;
  for (const doc of snapshot.docs) {
    const docData = doc.data();
    const docId = doc.id;
    const newRtdbPath = `${rtdbPath}/${docId}`;
    
    // データ変換 (タイムスタンプなど)
    const convertedData = convertDataForRTDB(docData);
    
    // RTDBに書き込み (暗号化文字列等もそのまま保持される)
    // set ではなく update を使うことで、意図しないデータの完全な上書きを回避しつつ安全に結合する
    // ただし、今回は新規移行であるため set でも可。
    await rtdb.ref(newRtdbPath).set(convertedData);
    count++;
    process.stdout.write(`\r⏳ 進行状況: ${count} / ${snapshot.size}`);

    // サブコレクションの再帰的取得
    const subCollections = await doc.ref.listCollections();
    for (const subCol of subCollections) {
      await migrateCollection(subCol, `${newRtdbPath}/${subCol.id}`);
    }
  }
  console.log(`\n✅ [${collectionRef.path}] の移行完了`);
}

async function runMigration() {
  console.log("🚀 Firestore から Realtime Database への完全移行スクリプトを開始します...");
  console.log(`対象 APP_ID: ${APP_ID}`);
  console.log(`RTDB URL: ${DATABASE_URL}\n`);

  try {
    // 移行のルートとなるアーティファクトドキュメントを取得
    const artifactsRef = firestore.collection('artifacts').doc(APP_ID);
    
    // アプリケーション直下のコレクションをリストアップして全て移行する
    const rootCollections = await artifactsRef.listCollections();
    
    if (rootCollections.length === 0) {
      console.log("⚠️ 移行対象のコレクションが見つかりませんでした。");
    }

    for (const collection of rootCollections) {
      const rtdbBasePath = `artifacts/${APP_ID}/${collection.id}`;
      await migrateCollection(collection, rtdbBasePath);
    }

    console.log("\n🎉 全てのデータの移行が完了しました！エラーは発生していません。");
    console.log("アプリを再読み込みし、RTDB同期モードでデータが正しく表示されるかご確認ください。");
    process.exit(0);

  } catch (error) {
    console.error("\n❌ 移行中にエラーが発生しました:", error);
    process.exit(1);
  }
}

runMigration();
