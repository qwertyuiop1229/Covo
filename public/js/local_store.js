/**
 * Covo Local-first Storage Engine (local_store.js)
 * IndexedDB (covo_local_db) を用いたローカル永続化 & 通信量極小化モジュール
 */

let DB_NAME = "covo_local_db";
let _accountGeneration = 0;
let _accountUid = null;
export function setAccountScope(uid) {
  const next = uid ? `covo_local_db_user_${encodeURIComponent(uid)}` : 'covo_local_db_signed_out';
  if (next === DB_NAME) return;
  _accountGeneration++;
  _accountUid = uid || null;
  _dbInstance?.close();
  _dbInstance = null;
  _dbInitPromise = null;
  DB_NAME = next;
}
const DB_VERSION = 1;

export async function getSettingsByPrefix(prefix, { throwOnError = false } = {}) {
  const generation = _accountGeneration;
  const db = await initLocalDB();
  if (!db || generation !== _accountGeneration) {
    if (throwOnError) throw new Error('端末の保存領域を開けませんでした');
    return [];
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const request = tx.objectStore('settings').getAll(IDBKeyRange.bound(prefix, prefix + '\uffff'));
    request.onsuccess = () => resolve(request.result || []);
    const fail = () => throwOnError ? reject(new Error('端末の履歴を読み込めませんでした')) : resolve([]);
    request.onerror = fail;
    tx.onabort = fail;
  });
}

export async function deleteSetting(key) {
  const generation = _accountGeneration;
  const db = await initLocalDB();
  if (!db || generation !== _accountGeneration) return false;
  return new Promise(resolve => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

export async function getMessage(channelId, messageId) {
  const db = await initLocalDB();
  if (!db || !channelId || !messageId) return null;
  return new Promise(resolve => {
    const request = db.transaction('messages', 'readonly').objectStore('messages').get(messageId);
    request.onsuccess = () => {
      const message = request.result;
      if (!message || message.channelId !== channelId) { resolve(null); return; }
      delete message._decryptedFileUrl;
      delete message._decryptionFailed;
      resolve(message);
    };
    request.onerror = () => resolve(null);
  });
}

export async function getMessagesAfter(channelId, afterTs, afterId, limit = 30) {
  const db = await initLocalDB();
  if (!db || !channelId) return [];
  return new Promise(resolve => {
    const range = IDBKeyRange.bound([channelId, afterTs], [channelId, Number.MAX_SAFE_INTEGER]);
    const request = db.transaction('messages', 'readonly').objectStore('messages').index('channel_ts').openCursor(range, 'next');
    const result = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || result.length >= limit) { resolve(result); return; }
      if (cursor.value.timestamp > afterTs || String(cursor.primaryKey) > String(afterId)) {
        const record = { ...cursor.value };
        delete record._decryptedFileUrl;
        delete record._decryptionFailed;
        result.push(record);
      }
      cursor.continue();
    };
    request.onerror = () => resolve([]);
  });
}

export async function hasLegacyHistory() {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return false;
  const databases = await indexedDB.databases();
  return databases.some(database => database.name === 'covo_local_db');
}

// The caller must verify current server/DM membership against the server before invoking this.
// Only the approved channel's history is copied; legacy settings and private keys stay untouched.
export async function importLegacyChannel(channelId, ownerId) {
  if (!ownerId || _accountUid !== ownerId || !await hasLegacyHistory()) return 0;
  const generation = _accountGeneration;
  const legacy = await new Promise((resolve, reject) => {
    const request = indexedDB.open('covo_local_db');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    if (!legacy.objectStoreNames.contains('messages')) return 0;
    const records = await new Promise(resolve => {
      const store = legacy.transaction('messages', 'readonly').objectStore('messages');
      const request = store.index('channelId').getAll(IDBKeyRange.only(channelId));
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
    let copied = 0;
    for (let i = 0; i < records.length; i += 100) {
      if (generation !== _accountGeneration || ownerId !== _accountUid) return copied;
      const batch = records.slice(i, i + 100);
      // A recently synced/edited record always wins over an old cache entry.
      const existing = await Promise.all(batch.map(record => getMessage(channelId, record.id)));
      if (generation !== _accountGeneration) return copied;
      const missing = batch.filter((_, index) => !existing[index]);
      if (missing.length && !await upsertMessagesBatch(missing)) throw new Error('旧履歴をコピーできませんでした');
      copied += missing.length;
    }
    return copied;
  } finally { legacy.close(); }
}

let _dbInstance = null;
let _dbInitPromise = null;

/**
 * IndexedDB の初期化 & 接続取得
 * @returns {Promise<IDBDatabase>}
 */
export async function initLocalDB() {
  if (_dbInstance) {
    try {
      if (!_dbInstance.objectStoreNames || _dbInstance.objectStoreNames.length === 0) {
        throw new Error("Connection closed");
      }
      return _dbInstance;
    } catch (_) {
      _dbInstance = null;
      _dbInitPromise = null;
    }
  }
  if (_dbInitPromise) return _dbInitPromise;
  _dbInitPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      console.warn("[LocalStore] IndexedDB is not supported in this environment");
      return resolve(null);
    }
    const generation = _accountGeneration;
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
      if (generation !== _accountGeneration) { req.result.close(); resolve(null); return; }
      _dbInstance = req.result;
      const opened = _dbInstance;
      _dbInstance.onversionchange = () => {
        try { opened.close(); } catch (_) {}
        if (generation !== _accountGeneration) return;
        _dbInstance = null;
        _dbInitPromise = null;
      };
      _dbInstance.onclose = () => {
        if (generation !== _accountGeneration) return;
        _dbInstance = null;
        _dbInitPromise = null;
      };
      resolve(_dbInstance);
    };
    req.onerror = () => {
      if (generation !== _accountGeneration) { resolve(null); return; }
      console.warn("[LocalStore] Failed to open IndexedDB:", req.error);
      _dbInstance = null;
      _dbInitPromise = null;
      resolve(null);
    };
    req.onblocked = () => {
      if (generation !== _accountGeneration) { resolve(null); return; }
      console.warn("[LocalStore] IndexedDB open blocked by another tab");
      _dbInstance = null;
      _dbInitPromise = null;
      resolve(null);
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
      delete cleanMsg._decryptedFileUrl;
      delete cleanMsg._decryptionFailed;
      // 🔒 E2EE保護: 復号済みメッセージであっても永続化時には元の暗号文を保持し、P2P同期での平文漏洩を防止
      if (cleanMsg._originalText) {
        cleanMsg.text = cleanMsg._originalText;
      }
      if (cleanMsg.replyTo && cleanMsg.replyTo._originalText) {
        cleanMsg.replyTo = { ...cleanMsg.replyTo, text: cleanMsg.replyTo._originalText };
      }
      // 再読込時に未復号の暗号文が復号済みと誤認されないようフラグをリセット
      if (typeof cleanMsg.text === 'string' && (cleanMsg.text.startsWith('enc::') || cleanMsg._originalText)) {
        cleanMsg._decrypted = false;
      }
      cleanMsg.timestamp = _extractMsgTimestamp(cleanMsg);
      store.put(cleanMsg);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        resolve(false);
      };
    } catch (e) {
      if (String(e?.message || '').includes('closing') || e?.name === 'InvalidStateError') {
        _dbInstance = null;
        _dbInitPromise = null;
      }
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
        delete cleanMsg._decryptedFileUrl;
        delete cleanMsg._decryptionFailed;
        // 🔒 E2EE保護: 復号済みメッセージであっても永続化時には元の暗号文を保持
        if (cleanMsg._originalText) {
          cleanMsg.text = cleanMsg._originalText;
        }
        if (cleanMsg.replyTo && cleanMsg.replyTo._originalText) {
          cleanMsg.replyTo = { ...cleanMsg.replyTo, text: cleanMsg.replyTo._originalText };
        }
        // 再読込時に未復号の暗号文が復号済みと誤認されないようフラグをリセット
        if (typeof cleanMsg.text === 'string' && (cleanMsg.text.startsWith('enc::') || cleanMsg._originalText)) {
          cleanMsg._decrypted = false;
        }
        cleanMsg.timestamp = _extractMsgTimestamp(cleanMsg);
        store.put(cleanMsg);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        resolve(false);
      };
    } catch (e) {
      if (String(e?.message || '').includes('closing') || e?.name === 'InvalidStateError') {
        _dbInstance = null;
        _dbInitPromise = null;
      }
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
export async function getMessages(channelId, beforeTs = null, limit = 50, beforeId = null) {
  if (!channelId) return [];
  const db = await initLocalDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction("messages", "readonly");
      const store = tx.objectStore("messages");
      const index = store.index("channel_ts");
      const upper = beforeTs != null ? beforeTs : Number.MAX_SAFE_INTEGER;
      const range = IDBKeyRange.bound([channelId, 0], [channelId, upper], false, beforeTs != null && beforeId == null);
      const req = index.openCursor(range, "prev"); // 新しい順に探索
      const results = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && results.length < limit) {
          if (beforeId != null && cursor.value.timestamp === beforeTs && String(cursor.primaryKey) >= String(beforeId)) {
            if (String(cursor.primaryKey) > String(beforeId) && typeof cursor.continuePrimaryKey === 'function') {
              cursor.continuePrimaryKey(cursor.key, beforeId);
            } else {
              cursor.continue();
            }
            return;
          }
          const record = { ...cursor.value };
          delete record._decryptedFileUrl;
          delete record._decryptionFailed;
          results.push(record);
          cursor.continue();
        } else {
          // 画面表示用に timestamp 昇順 (古い順) に並び替えて返却
          results.reverse();
          resolve(results);
        }
      };
      req.onerror = () => {
        resolve([]);
      };
    } catch (e) {
      if (String(e?.message || '').includes('closing') || e?.name === 'InvalidStateError') {
        _dbInstance = null;
        _dbInitPromise = null;
      }
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
  if (!friend) return;
  const uid = friend.uid || friend.targetUid || friend.id;
  if (!uid) return;
  const db = await initLocalDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction("friends", "readwrite");
      tx.objectStore("friends").put({ ...friend, uid });
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
        if (!f) continue;
        const uid = f.uid || f.targetUid || f.id;
        if (uid) store.put({ ...f, uid });
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
  const owner = _accountUid, generation = _accountGeneration;
  if (!owner) throw new Error('移行にはログインが必要です');
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

  if (owner !== _accountUid || generation !== _accountGeneration) throw new Error('集約中にアカウントが変更されました');
  // localStorage 内の E2EE 秘密鍵・公開鍵も移行パッケージに同梱
  let e2eeKeys = null;
  try {
    const priv = localStorage.getItem(`covo_e2ee_priv:${_accountUid || 'signed_out'}`);
    const pub = localStorage.getItem(`covo_e2ee_pub:${_accountUid || 'signed_out'}`);
    if (priv && pub) {
      e2eeKeys = { priv, pub };
    }
  } catch (e) {}

  return {
    version: 1,
    accountId: owner,
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
  const owner = _accountUid, generation = _accountGeneration;
  if (!owner || !bundle || typeof bundle !== 'object' || bundle.accountId !== owner) return false;
  const active = () => owner === _accountUid && generation === _accountGeneration;
  const db = await initLocalDB();
  if (!db || !active()) return false;
  try {
    const restored = await new Promise((resolve, reject) => {
      const tx = db.transaction(['messages', 'channels', 'friends', 'settings'], 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onabort = () => resolve(false);
      tx.onerror = () => resolve(false);
      try {
        for (const message of bundle.messages || []) {
          if (!message?.id || !message.channelId) continue;
          const clean = { ...message, timestamp: _extractMsgTimestamp(message) };
          delete clean._decryptedFileUrl; delete clean._decryptionFailed;
          if (clean._originalText) clean.text = clean._originalText;
          if (clean.replyTo?._originalText) clean.replyTo = { ...clean.replyTo, text: clean.replyTo._originalText };
          if (typeof clean.text === 'string' && clean.text.startsWith('enc::')) clean._decrypted = false;
          tx.objectStore('messages').put(clean);
        }
        for (const channel of bundle.channels || []) if (channel?.id) tx.objectStore('channels').put(channel);
        for (const friend of bundle.friends || []) {
          const uid = friend?.uid || friend?.targetUid || friend?.id;
          if (uid) tx.objectStore('friends').put({ ...friend, uid });
        }
        for (const setting of bundle.settings || []) {
          if (!setting?.key) continue;
          if (setting.key.startsWith('outbox:') && setting.value?.ownerId !== owner) continue;
          tx.objectStore('settings').put(setting);
        }
      } catch (error) { tx.abort(); reject(error); }
    });
    if (!restored || !active()) return false;
    if (bundle.e2eeKeys?.priv && bundle.e2eeKeys?.pub) {
      localStorage.setItem('covo_e2ee_priv:' + owner, bundle.e2eeKeys.priv);
      localStorage.setItem('covo_e2ee_pub:' + owner, bundle.e2eeKeys.pub);
    }
    return active();
  } catch (error) {
    console.error('[LocalStore] restoreAllLocalData failed:', error);
    return false;
  }
}

/**
 * 全ローカルデータの消去 (ログアウト時・アカウント切替・キャッシュ完全クリア用)
 * @returns {Promise<boolean>}
 */
export async function clearAllLocalData() {
  if (typeof caches !== 'undefined' && caches.delete) {
    caches.delete('covo_media_cache_v1').catch(() => {});
  }
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
    setAccountScope,
    getMessage,
    getMessagesAfter,
    getSettingsByPrefix,
    deleteSetting,
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
