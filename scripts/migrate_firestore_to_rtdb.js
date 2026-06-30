const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getDatabase } = require('firebase-admin/database');
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
const APP_ID = "simplechat-65a0d";

initializeApp({
  credential: cert(serviceAccount),
  databaseURL: DATABASE_URL
});

const firestore = getFirestore();
const rtdb = getDatabase();

/**
 * オブジェクト内のFirestore Timestampを再帰的に探し、
 * RTDB用のミリ秒整数 (Unix Timestamp) に変換する
 */
function convertDataForRTDB(data) {
  if (data === null || typeof data !== 'object') {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => convertDataForRTDB(item));
  }

  const newData = {};
  for (const [key, value] of Object.entries(data)) {
    // Undefined は RTDB に保存できないためスキップ
    if (value === undefined) continue;

    let finalValue = value;

    // FirestoreのTimestamp型判定
    if (value && typeof value === 'object' && typeof value.toDate === 'function') {
      finalValue = value.toDate().getTime();
    } else if (value && typeof value === 'object' && typeof value.toMillis === 'function') {
      finalValue = value.toMillis();
    } else if (value && typeof value === 'object' && value._seconds !== undefined && value._nanoseconds !== undefined) {
      finalValue = value._seconds * 1000 + Math.floor(value._nanoseconds / 1000000);
    } else {
      finalValue = convertDataForRTDB(value);
    }
    
    // 🔴 RTDBはキーに "." を含められないため、"versions.1" 等を { versions: { "1": ... } } のように階層化して退避する
    if (key.includes('.')) {
      const parts = key.split('.');
      let current = newData;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = finalValue;
    } else {
      // 既に階層化でオブジェクトが作られている場合のマージ
      if (typeof newData[key] === 'object' && typeof finalValue === 'object' && !Array.isArray(finalValue)) {
         Object.assign(newData[key], finalValue);
      } else {
         newData[key] = finalValue;
      }
    }
  }

  return newData;
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
    await rtdb.ref(newRtdbPath).set(convertedData);
    count++;
    
    // ログ表示: 現在のドキュメントの処理中であることを明記
    process.stdout.write(`\r⏳ 進行状況: ${count} / ${snapshot.size} (Doc: ${docId})`);

    // サブコレクションの再帰的取得
    const subCollections = await doc.ref.listCollections();
    if (subCollections.length > 0) {
      process.stdout.write(`\n`); // サブコレクションがある場合は改行してログを崩さないようにする
      for (const subCol of subCollections) {
        await migrateCollection(subCol, `${newRtdbPath}/${subCol.id}`);
      }
    }
  }
  process.stdout.write(`\n`);
  console.log(`✅ [${collectionRef.path}] の移行完了`);
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
      if (collection.id === 'calls') {
        console.log(`\n⏭️  コレクション [${collection.id}] は一時的な通話データのためスキップします。`);
        continue;
      }
      
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
