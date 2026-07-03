const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getDatabase } = require('firebase-admin/database');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error("❌ serviceAccountKey.json not found.");
  process.exit(1);
}

const serviceAccount = require(SERVICE_ACCOUNT_PATH);
const DATABASE_URL = "https://simplechat-65a0d-default-rtdb.asia-southeast1.firebasedatabase.app";
const APP_ID = "simplechat-65a0d";

initializeApp({
  credential: cert(serviceAccount),
  databaseURL: DATABASE_URL
});

const firestore = getFirestore();
const rtdb = getDatabase();

async function cleanupFirestore(collectionName) {
  const colRef = firestore.collection('artifacts').doc(APP_ID).collection(collectionName);
  const snap = await colRef.get();
  
  if (snap.empty) {
    console.log(`✅ Firestore: No documents found in ${collectionName}.`);
    return;
  }
  
  console.log(`🧹 Firestore: Found ${snap.size} documents in ${collectionName}. Deleting...`);
  
  let deletedCount = 0;
  for (const doc of snap.docs) {
    // Delete subcollections (candidates)
    const subCollections = await doc.ref.listCollections();
    for (const sub of subCollections) {
      const subSnap = await sub.get();
      for (const subDoc of subSnap.docs) {
        await subDoc.ref.delete();
      }
    }
    // Delete parent doc
    await doc.ref.delete();
    deletedCount++;
  }
  console.log(`✅ Firestore: Deleted ${deletedCount} documents from ${collectionName}.`);
}

async function cleanupRTDB(nodeName) {
  const path = `artifacts/${APP_ID}/${nodeName}`;
  const ref = rtdb.ref(path);
  const snap = await ref.once('value');
  
  if (!snap.exists()) {
    console.log(`✅ RTDB: No data found at ${path}.`);
    return;
  }
  
  const count = Object.keys(snap.val()).length;
  console.log(`🧹 RTDB: Found ${count} nodes at ${path}. Deleting...`);
  await ref.remove();
  console.log(`✅ RTDB: Deleted ${nodeName} from RTDB.`);
}

async function runCleanup() {
  console.log("🚀 Starting WebRTC garbage cleanup...");
  
  try {
    await cleanupFirestore('calls');
    await cleanupFirestore('fileshares');
    
    await cleanupRTDB('calls');
    await cleanupRTDB('fileshares');
    
    console.log("\n🎉 Cleanup complete! The database is now free of WebRTC garbage data.");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error during cleanup:", err);
    process.exit(1);
  }
}

runCleanup();
