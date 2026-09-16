/**
 * Covo Local-first Storage Engine (local_store.js)
 * IndexedDB (covo_local_db) を用いたローカル永続化 & 通信量極小化モジュール
 */

const DB_NAME = "covo_local_db";
const DB_VERSION = 1;

let _dbInstance = null;
let _dbInitPromise = null;

/**
 * IndexedDB の初期化 & 接続取得
 * @returns {Promise<IDBDatabase>}
 */
export async function initLocalDB() {
  if (_dbInstance) return _dbInstance;
  if (_dbInitPromise) return _dbInitPromise;

  _dbInitPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      console.warn("[LocalStore] IndexedDB is not supported in this environment");
      return resolve(null);
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = req.result;

      // 1. messages: メッセージ履歴
      if (!db.objectStoreNames.contains("messages")) {
        const msgStore = db.createObjectStore("messages", { keyPath: "id" });
        msgStore.createIndex("channelId", "channelId", { unique: false });
        msgStore.createIndex("timestamp", "timestamp", { unique: false });
        msgStore.createIndex("channel_ts", ["channelId", "timestamp"], { unique: false });
      }

      // 2. channels: チャンネル/DMメタ情報・最終同期・最終既読
      if (!db.objectStoreNames.contains("channels")) {
        db.createObjectStore("channels", { keyPath: "id" });
      }

      // 3. friends: フレンドリスト・関係性キャッシュ
      if (!db.objectStoreNames.contains("friends")) {
        const friendStore = db.createObjectStore("friends", { keyPath: "uid" });
        friendStore.createIndex("status", "status", { unique: false });
      }

      // 4. settings: 設定・ローカルキー・キャッシュ
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };

    req.onsuccess = () => {
      _dbInstance = req.result;
      _dbInstance.onversionchange = () => {
        _dbInstance.close();
        _dbInstance = null;
        _dbInitPromise = null;
      };
      resolve(_dbInstance);
    };

    req.onerror = () => {
      console.error("[LocalStore] Failed to open IndexedDB:", req.error);
      resolve(null);
    };

    req.onblocked = () => {
      console.warn("[LocalStore] IndexedDB open blocked by another tab");
    };
  });

  return _dbInitPromise;
}

/**
 * 単一メッセージの保存 / 更新
 * @param {Object} msg - メッセージオブジェクト
 */
function _extractMsgTimestamp(obj) {
  if (!obj) return Date.now();
  const ts = obj.timestamp ?? obj.createdAt;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const parsed = new Date(ts).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  if (ts && typeof ts === 'object') {
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (ts.seconds != null) return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1000000);
    if (ts._seconds != null) return ts._seconds * 1000 + Math.floor((ts._nanoseconds || 0) / 1000000);
  }
  return Date.now();
}

export async function putMessage(msg) {
  if (!msg || !msg.id || !msg.channelId) return;
  const db = await initLocalDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("messages", "readwrite");
      const store = tx.objectStore("messages");
      const cleanMsg = { ...msg };
      cleanMsg.timestamp = _extractMsgTimestamp(cleanMsg);
      store.put(cleanMsg);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        console.warn("[LocalStore] putMessage failed:", tx.error);
        resolve(false);
      };
    } catch (e) {
      console.warn("[LocalStore] Transaction error in putMessage:", e);
      resolve(false);
    }
  });
}

/**
 * メッセージの一括保存 / 更新 (Delta Sync用トランザクション)
 * @param {Array<Object>} msgs - メッセージ配列
 */
export async function upsertMessagesBatch(msgs) {
  if (!Array.isArray(msgs) || msgs.length === 0) return;
  const db = await initLocalDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("messages", "readwrite");
      const store = tx.objectStore("messages");
      for (const msg of msgs) {
        if (!msg || !msg.id || !msg.channelId) continue;
        const cleanMsg = { ...msg };
        cleanMsg.timestamp = _extractMsgTimestamp(cleanMsg);
        store.put(cleanMsg);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        console.warn("[LocalStore] upsertMessagesBatch error:", tx.error);
        resolve(false);
      };
    } catch (e) {
      console.warn("[LocalStore] upsertMessagesBatch exception:", e);
      resolve(false);
    }
  });
}

/**
 * 指定チャンネルのメッセージを取得（古い方へ遡るページネーション対応）
 * @param {string} channelId - ルームまたはDMのID (例: serverId_roomId または dm_dmId)
 * @param {number|null} beforeTs - 指定日時以前のメッセージ（nullの場合は最新から）
 * @param {number} limit - 取得件数 (デフォルト: 50)
 * @returns {Promise<Array<Object>>} メッセージ配列 (timestamp昇順)
 */
export async function getMessages(channelId, beforeTs = null, limit = 50) {
  if (!channelId) return [];
  const db = await initLocalDB();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("messages", "readonly");
      const store = tx.objectStore("messages");
      const index = store.index("channel_ts");

      const upper = beforeTs != null ? beforeTs : Number.MAX_SAFE_INTEGER;
      const range = IDBKeyRange.bound([channelId, 0], [channelId, upper], false, beforeTs != null);
      const req = index.openCursor(range, "prev"); // 新しい順に探索

      const results = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          // 画面表示用に timestamp 昇順 (古い順) に並び替えて返却
          results.reverse();
          resolve(results);
        }
      };
      req.onerror = () => {
        console.warn("[LocalStore] getMessages failed:", req.error);
        resolve([]);
      };
    } catch (e) {
      console.warn("[LocalStore] getMessages exception:", e);
      resolve([]);
    }
  });
}

/**
 * 指定チャンネルのローカル保存されている最新メッセージ日時を取得
 * @param {string} channelId - ルームまたはDMのID
 * @returns {Promise<number>} 最新タイムスタンプ (存在しない場合は 0)
 */
export async function getLatestMessageTimestamp(channelId) {
  if (!channelId) return 0;
  const db = await initLocalDB();
  if (!db) return 0;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("messages", "readonly");
      const store = tx.objectStore("messages");
      const index = store.index("channel_ts");
      const range = IDBKeyRange.bound([channelId, 0], [channelId, Number.MAX_SAFE_INTEGER]);
      const req = index.openCursor(range, "prev"); // 最も新しい1件

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && cursor.value && typeof cursor.value.timestamp === 'number') {
          resolve(cursor.value.timestamp);
        } else {
          resolve(0);
        }
      };
      req.onerror = () => resolve(0);
    } catch (e) {
      resolve(0);
    }
  });
}

/**
 * 指定チャンネルのローカル保存されている最古メッセージ日時を取得
 * @param {string} channelId - ルームまたはDMのID
 * @returns {Promise<number|null>} 最古タイムスタンプ
 */
export async function getOldestMessageTimestamp(channelId) {
  if (!channelId) return null;
  const db = await initLocalDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("messages", "readonly");
      const store = tx.objectStore("messages");
      const index = store.index("channel_ts");
      const range = IDBKeyRange.bound([channelId, 0], [channelId, Number.MAX_SAFE_INTEGER]);
      const req = index.openCursor(range, "next"); // 最も古い1件

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && cursor.value && typeof cursor.value.timestamp === 'number') {
          resolve(cursor.value.timestamp);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * 単一メッセージの削除
 * @param {string} id - メッセージID
 */
export async function deleteMessage(id) {
  if (!id) return;
  const db = await initLocalDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("messages", "readwrite");
      tx.objectStore("messages").delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * 指定チャンネルのメッセージ全削除
 * @param {string} channelId
 */
export async function clearMessagesForChannel(channelId) {
  if (!channelId) return;
  const db = await initLocalDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("messages", "readwrite");
      const store = tx.objectStore("messages");
      const index = store.index("channelId");
      const req = index.openKeyCursor(IDBKeyRange.only(channelId));
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * チャンネル情報の保存 / 更新
 * @param {Object} channel
 */
export async function putChannel(channel) {
  if (!channel || !channel.id) return;
  const db = await initLocalDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("channels", "readwrite");
      tx.objectStore("channels").put(channel);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * チャンネル情報の取得
 * @param {string} id
 */
export async function getChannel(id) {
  if (!id) return null;
  const db = await initLocalDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("channels", "readonly");
      const req = tx.objectStore("channels").get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * 全チャンネル情報の取得
 */
export async function getAllChannels() {
  const db = await initLocalDB();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("channels", "readonly");
      const req = tx.objectStore("channels").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

/**
 * フレンド情報の保存
 * @param {Object} friend
 */
export async function putFriend(friend) {
  if (!friend || !friend.uid) return;
  const db = await initLocalDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("friends", "readwrite");
      tx.objectStore("friends").put(friend);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * フレンド一覧の一括保存
 * @param {Array<Object>} friends
 */
export async function putFriendsBatch(friends) {
  if (!Array.isArray(friends) || friends.length === 0) return;
  const db = await initLocalDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("friends", "readwrite");
      const store = tx.objectStore("friends");
      for (const f of friends) {
        if (f && f.uid) store.put(f);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * 全フレンドの取得
 */
export async function getAllFriends() {
  const db = await initLocalDB();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("friends", "readonly");
      const req = tx.objectStore("friends").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

/**
 * 設定値の保存
 * @param {string} key
 * @param {*} value
 */
export async function putSetting(key, value) {
  if (!key) return;
  const db = await initLocalDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("settings", "readwrite");
      tx.objectStore("settings").put({ key, value, updatedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * 設定値の取得
 * @param {string} key
 */
export async function getSetting(key) {
  if (!key) return null;
  const db = await initLocalDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("settings", "readonly");
      const req = tx.objectStore("settings").get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * 【要件 E & F】P2P端末移行 & 過去ログ補完用の全データ抽出
 * @returns {Promise<Object>}
 */
export async function getAllLocalData() {
  const db = await initLocalDB();
  if (!db) return { messages: [], channels: [], friends: [], settings: [], e2eeKeys: null };

  const fetchStore = (storeName) => new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });

  const [messages, channels, friends, settings] = await Promise.all([
    fetchStore("messages"),
    fetchStore("channels"),
    fetchStore("friends"),
    fetchStore("settings")
  ]);

  // localStorage 内の E2EE 秘密鍵・公開鍵も移行パッケージに同梱
  let e2eeKeys = null;
  try {
    const priv = localStorage.getItem("covo_e2ee_priv");
    const pub = localStorage.getItem("covo_e2ee_pub");
    if (priv && pub) {
      e2eeKeys = { priv, pub };
    }
  } catch (e) {}

  return {
    version: 1,
    exportedAt: Date.now(),
    messages,
    channels,
    friends,
    settings,
    e2eeKeys
  };
}

/**
 * 【要件 E】新端末側での全データ復元
 * @param {Object} bundle - getAllLocalData() でエクスポートされたデータ
 * @returns {Promise<boolean>}
 */
export async function restoreAllLocalData(bundle) {
  if (!bundle || typeof bundle !== 'object') return false;
  const db = await initLocalDB();
  if (!db) return false;

  try {
    // 1. messages 復元
    if (Array.isArray(bundle.messages) && bundle.messages.length > 0) {
      await upsertMessagesBatch(bundle.messages);
    }

    // 2. channels 復元
    if (Array.isArray(bundle.channels) && bundle.channels.length > 0) {
      const tx = db.transaction("channels", "readwrite");
      const store = tx.objectStore("channels");
      for (const ch of bundle.channels) {
        if (ch && ch.id) store.put(ch);
      }
      await new Promise(r => { tx.oncomplete = r; tx.onerror = r; });
    }

    // 3. friends 復元
    if (Array.isArray(bundle.friends) && bundle.friends.length > 0) {
      await putFriendsBatch(bundle.friends);
    }

    // 4. settings 復元
    if (Array.isArray(bundle.settings) && bundle.settings.length > 0) {
      const tx = db.transaction("settings", "readwrite");
      const store = tx.objectStore("settings");
      for (const st of bundle.settings) {
        if (st && st.key) store.put(st);
      }
      await new Promise(r => { tx.oncomplete = r; tx.onerror = r; });
    }

    // 5. E2EE 鍵の復元
    if (bundle.e2eeKeys && bundle.e2eeKeys.priv && bundle.e2eeKeys.pub) {
      try {
        localStorage.setItem("covo_e2ee_priv", bundle.e2eeKeys.priv);
        localStorage.setItem("covo_e2ee_pub", bundle.e2eeKeys.pub);
      } catch (e) {}
    }

    return true;
  } catch (e) {
    console.error("[LocalStore] restoreAllLocalData failed:", e);
    return false;
  }
}

/**
 * 全ローカルデータの消去 (ログアウト時・アカウント切替・キャッシュ完全クリア用)
 * @returns {Promise<boolean>}
 */
export async function clearAllLocalData() {
  const db = await initLocalDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const stores = ["messages", "channels", "friends", "settings"];
      const tx = db.transaction(stores, "readwrite");
      for (const storeName of stores) {
        if (db.objectStoreNames.contains(storeName)) {
          tx.objectStore(storeName).clear();
        }
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        console.warn("[LocalStore] clearAllLocalData error:", tx.error);
        resolve(false);
      };
    } catch (e) {
      console.warn("[LocalStore] clearAllLocalData exception:", e);
      resolve(false);
    }
  });
}

// グローバル公開 (Vanilla JSスクリプトから直接利用可能)
if (typeof window !== 'undefined') {
  window.LocalStore = {
    initLocalDB,
    putMessage,
    upsertMessagesBatch,
    getMessages,
    getLatestMessageTimestamp,
    getOldestMessageTimestamp,
    deleteMessage,
    clearMessagesForChannel,
    putChannel,
    getChannel,
    getAllChannels,
    putFriend,
    putFriendsBatch,
    getAllFriends,
    putSetting,
    getSetting,
    getAllLocalData,
    restoreAllLocalData,
    clearAllLocalData
  };
}
