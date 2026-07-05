import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { _abToB64, _b64ToAb } from './utils.js';

let _getDb = () => null;
let _getUserId = () => null;
let _getAppId = () => null;
let _getAuth = () => null;

export function initCryptoContext(deps) {
  if (deps.getDb) _getDb = deps.getDb;
  if (deps.getUserId) _getUserId = deps.getUserId;
  if (deps.getAppId) _getAppId = deps.getAppId;
  if (deps.getAuth) _getAuth = deps.getAuth;
}

export const E2EE_PREFIX = "enc::v";       // 暗号文の目印（過去の平文と区別する）
    export const E2EE_LS_PRIV = "covo_e2ee_priv"; // localStorageキー（秘密鍵JWK）
    export const E2EE_LS_PUB  = "covo_e2ee_pub";  // localStorageキー（公開鍵JWK）

    export const _e2ee = {
      ready: false,
      privateKey: null,   // CryptoKey (RSA-OAEP decrypt)
      publicKey: null,    // CryptoKey (RSA-OAEP encrypt)
      publicKeyJwk: null, // JWK (Firestore保存・他者配布用)
      mem: {},            // localStorage不可時のメモリ退避
      roomKeyCache: {},   // roomId -> CryptoKey(AES-GCM) 復号済みキャッシュ
      pubKeyCache: {},    // _getUserId() -> CryptoKey(public) インポート済みキャッシュ
      _initPromise: null,
      _roomKeyPromises: {},
      _rescueRequestFlags: {}, // roomId -> timestamp 救済リクエストのデバウンス用
    };

    export const _subtleOK = !!(window.crypto && window.crypto.subtle);
    // Tauriデスクトップ(http://tauri.localhost等)で意図せずhttpsへ強制転送されERR_CONNECTION_REFUSEDで全ユーザーが詰む致命的バグを完全解消
    if (location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1' && !location.hostname.endsWith('.localhost') && !window.__TAURI__) {
      location.href = location.href.replace('http:', 'https:');
    }
    export const _td = new TextDecoder(), _te = new TextEncoder();


    // localStorage 安全アクセス（プライベートブラウズ等で例外でも落ちない）
    export function __lsGet(key) {
      try { const v = localStorage.getItem(key); if (v != null) return v; } catch (e) {}
      return (key in _e2ee.mem) ? _e2ee.mem[key] : null;
    }
    export function __lsSet(key, val) {
      _e2ee.mem[key] = val; // 常にメモリにも保持
      try { localStorage.setItem(key, val); } catch (e) {}
    }

    export async function __genUserKeyPair() {
      return await window.crypto.subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        true, ["encrypt", "decrypt"]
      );
    }
    export async function __importPriv(jwk) {
      return await window.crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]);
    }
    export async function __importPub(jwk) {
      return await window.crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]);
    }

    // ユーザー鍵の初期化：ローカル→Firestore→新規生成 の順で自動復元/作成
    export async function _ensureE2EEKeys() {
      if (!_subtleOK || !_getUserId()) return false;
      if (_e2ee.ready) return true;
      if (_e2ee._initPromise) return _e2ee._initPromise;
      _e2ee._initPromise = (async () => {
        const res = await __ensureE2EEKeysImpl();
        if (!res) _e2ee._initPromise = null;
        return res;
      })();
      return _e2ee._initPromise;
    }
    export async function __ensureE2EEKeysImpl() {
      try {
        // 1) ローカル(JWK)から復元
        const privStr = __lsGet(E2EE_LS_PRIV);
        const pubStr = __lsGet(E2EE_LS_PUB);
        if (privStr && pubStr) {
          const privJwk = JSON.parse(privStr), pubJwk = JSON.parse(pubStr);
          _e2ee.privateKey = await __importPriv(privJwk);
          _e2ee.publicKey = await __importPub(pubJwk);
          _e2ee.publicKeyJwk = pubJwk;
          _e2ee.ready = true;
          // Firestoreに公開鍵が無ければバックアップ（端末間共有のため）
          __backupKeysToFirestore(privJwk, pubJwk).catch(() => {});
          return true;
        }

        // 2) Firestore/D1の本人専用ドキュメントから復元
        try {
          
            const privRef = doc(_getDb(), `artifacts/${_getAppId()}/users/${_getUserId()}/private/keys`);
            const privSnap = await getDoc(privRef);
            if (privSnap.exists() && privSnap.data().privateKeyJwk) {
              const privJwk = privSnap.data().privateKeyJwk;
              const pubJwk = privSnap.data().publicKeyJwk;
              _e2ee.privateKey = await __importPriv(privJwk);
              _e2ee.publicKey = await __importPub(pubJwk);
              _e2ee.publicKeyJwk = pubJwk;
              __lsSet(E2EE_LS_PRIV, JSON.stringify(privJwk));
              __lsSet(E2EE_LS_PUB, JSON.stringify(pubJwk));
              _e2ee.ready = true;
              return true;
            }
          
        } catch (e) {
          console.warn("[E2EE] 鍵の復元チェック中に通信エラーが発生しました。個人鍵の上書き自爆を防止するため処理を中断します:", e);
          return false;
        }

        // 3) 新規生成して保存（ローカル＋Firestoreバックアップ）
        const pair = await __genUserKeyPair();
        const privJwk = await window.crypto.subtle.exportKey("jwk", pair.privateKey);
        const pubJwk = await window.crypto.subtle.exportKey("jwk", pair.publicKey);
        _e2ee.privateKey = pair.privateKey;
        _e2ee.publicKey = pair.publicKey;
        _e2ee.publicKeyJwk = pubJwk;
        __lsSet(E2EE_LS_PRIV, JSON.stringify(privJwk));
        __lsSet(E2EE_LS_PUB, JSON.stringify(pubJwk));
        _e2ee.ready = true;
        await __backupKeysToFirestore(privJwk, pubJwk);
        return true;
      } catch (e) {
        console.warn("[E2EE] 鍵初期化に失敗（平文モードで継続）:", e);
        return false;
      }
    }

    export async function __backupKeysToFirestore(privJwk, pubJwk) {
      if (!_getUserId()) return;
      
      // 公開鍵を users/{uid} に（全員が読めてOK）
      try {
        await setDoc(doc(_getDb(), `artifacts/${_getAppId()}/users/${_getUserId()}`), { publicKeyJwk: pubJwk }, { merge: true });
      } catch (e) {}
      // 秘密鍵を本人専用サブドキュメントに（ルールで本人のみ読み書き）
      try {
        await setDoc(doc(_getDb(), `artifacts/${_getAppId()}/users/${_getUserId()}/private/keys`),
          { privateKeyJwk: privJwk, publicKeyJwk: pubJwk, updatedAt: serverTimestamp() }, { merge: true });
      } catch (e) {}
    }

    // 指定ユーザーの公開鍵(CryptoKey)を取得（キャッシュ付き）。無ければnull。
    export async function __getUserPublicKey(uid) {
      if (_e2ee.pubKeyCache[uid]) return _e2ee.pubKeyCache[uid];
      
      try {
        const snap = await getDoc(doc(_getDb(), `artifacts/${_getAppId()}/users/${uid}`));
        const jwk = snap.exists() ? snap.data().publicKeyJwk : null;
        if (!jwk) return null;
        const key = await __importPub(jwk);
        _e2ee.pubKeyCache[uid] = key;
        return key;
      } catch (e) { return null; }
    }

    // 全体管理者のエスクロー公開鍵を取得（合鍵）。無ければnull。
    export async function __getEscrowPublicKey() {
      
      try {
        const snap = await getDoc(doc(_getDb(), `artifacts/${_getAppId()}/settings/escrowKey`));
        const jwk = snap.exists() ? snap.data().publicKeyJwk : null;
        if (!jwk) return null;
        return await __importPub(jwk);
      } catch (e) { return null; }
    }

    export async function _requestEscrowRescue(serverId, roomId) {
      if (!_getUserId()) return;
      const now = Date.now();
      if (_e2ee._rescueRequestFlags && _e2ee._rescueRequestFlags[roomId] && (now - _e2ee._rescueRequestFlags[roomId] < 60000)) {
        return; // 1分以内の連続リクエストはスキップ
      }
      if (_e2ee._rescueRequestFlags) {
        _e2ee._rescueRequestFlags[roomId] = now;
      }
      try {
        
          await setDoc(doc(_getDb(), `artifacts/${_getAppId()}/servers/${serverId}/rooms/${roomId}/rescueRequests/${_getUserId()}`), {
            userId: _getUserId(), requestedAt: serverTimestamp()
          }, { merge: true });
          console.log(`[E2EE] Firestore救済リクエストを発行しました (room=${roomId})`);
          delete _e2ee.roomKeyCache[roomId];
        
      } catch (e) { console.warn("[E2EE] 救済リクエスト発行に失敗:", e); }
    }

    // 管理者が初回ログイン時にエスクロー鍵ペア(合鍵)を生成する。
    // 公開鍵を settings/escrowKey（全員読取可）に、秘密鍵を管理者本人の private に保存。
    // 既に存在すれば何もしない。管理者以外・失敗時は黙ってスキップ（アプリは止めない）。
    export async function _ensureEscrowKey() {
      if (!_subtleOK || !_getUserId() || !isAdmin) return;
      try {
        

        const escrowRef = doc(_getDb(), `artifacts/${_getAppId()}/settings/escrowKey`);
        const snap = await getDoc(escrowRef);
        if (snap.exists() && snap.data().publicKeyJwk) return; // 既に存在
        const pair = await __genUserKeyPair();
        const pubJwk = await window.crypto.subtle.exportKey("jwk", pair.publicKey);
        const privJwk = await window.crypto.subtle.exportKey("jwk", pair.privateKey);
        // 管理者本人の private に秘密鍵を保管（本人のみ読める）
        await setDoc(doc(_getDb(), `artifacts/${_getAppId()}/users/${_getUserId()}/private/escrowKey`),
          { privateKeyJwk: privJwk, publicKeyJwk: pubJwk, updatedAt: serverTimestamp() }, { merge: true });
        // 公開鍵を全体設定に（合鍵の公開部分）
        await setDoc(escrowRef, { publicKeyJwk: pubJwk, createdBy: _getUserId(), updatedAt: serverTimestamp() }, { merge: true });
        console.log("[E2EE] エスクロー鍵を生成しました");
      } catch (e) {
        console.warn("[E2EE] エスクロー鍵の生成に失敗（スキップ）:", e);
      }
    }

    // ルーム共通鍵(AES-GCM)を取得。無ければ生成し、全メンバー＋エスクローへ配布。
    // 取得・生成いずれも失敗したら null（呼び出し側は平文で送る）。
    export async function _getOrCreateRoomKey(serverId, roomId, memberIds) {
      if (!_subtleOK) return null;
      if (_e2ee.roomKeyCache[roomId]) return _e2ee.roomKeyCache[roomId];
      if (_e2ee._roomKeyPromises[roomId]) return _e2ee._roomKeyPromises[roomId];
      _e2ee._roomKeyPromises[roomId] = (async () => {
        const res = await __getOrCreateRoomKeyImpl(serverId, roomId, memberIds);
        if (!res) delete _e2ee._roomKeyPromises[roomId];
        return res;
      })();
      return _e2ee._roomKeyPromises[roomId];
    }
    export async function __getOrCreateRoomKeyImpl(serverId, roomId, memberIds) {
      if (!_subtleOK) return null;

      try {
        // 1) 共有ルームキー (Shared Room Key) がすでにルームドキュメントに存在するかチェック
        const rSnap = await getDoc(doc(_getDb(), `artifacts/${_getAppId()}/servers/${serverId}/rooms/${roomId}`));
        let roomData = null;
        if (rSnap.exists()) {
          roomData = rSnap.data();
          if (roomData.sharedKey) {
             try {
                // 共有キーが存在する場合はインポートして利用
                const raw = _b64ToAb(roomData.sharedKey);
                const key = await window.crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
                const keysObj = { "1": key, latest: key, latestVersion: "1" };
                _e2ee.roomKeyCache[roomId] = keysObj;
                return keysObj;
             } catch(e) {
                console.warn("[SharedKey] 共有キーのインポートに失敗:", e);
             }
          }
        }

        // 2) 共有ルームキーが存在しない場合、過去のE2EE（レガシー）鍵を探す
        const ok = await _ensureE2EEKeys();
        if (ok) {
          let legacyKey = null;
          const myWrapSnap = await getDoc(doc(_getDb(), `artifacts/${_getAppId()}/servers/${serverId}/rooms/${roomId}/roomKeys/${_getUserId()}`));
          if (myWrapSnap.exists()) {
            const data = myWrapSnap.data();
            let wrappedStr = data.wrappedKey;
            if (data.versions && data.latestVersion && data.versions[data.latestVersion]) {
              wrappedStr = data.versions[data.latestVersion];
            } else if (data[`versions.${data.latestVersion}`]) {
              wrappedStr = data[`versions.${data.latestVersion}`];
            }
            if (wrappedStr) {
               try {
                 const raw = await window.crypto.subtle.decrypt({ name: "RSA-OAEP" }, _e2ee.privateKey, _b64ToAb(wrappedStr));
                 legacyKey = await window.crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
               } catch(e) {}
            }
          }
          
          // 管理者エスクローからの復旧
          if (!legacyKey && isAdmin) {
             const escWrapSnap = await getDoc(doc(_getDb(), `artifacts/${_getAppId()}/servers/${serverId}/rooms/${roomId}/roomKeys/__escrow__`));
             if (escWrapSnap.exists()) {
               try {
                 const escPrivSnap = await getDoc(doc(_getDb(), `artifacts/${_getAppId()}/users/${_getUserId()}/private/escrowKey`));
                 if (escPrivSnap.exists() && escPrivSnap.data().privateKeyJwk) {
                   const escrowPrivKey = await __importPriv(escPrivSnap.data().privateKeyJwk);
                   const data = escWrapSnap.data();
                   let wrappedStr = data.wrappedKey;
                   if (data.versions && data.latestVersion && data.versions[data.latestVersion]) wrappedStr = data.versions[data.latestVersion];
                   else if (data[`versions.${data.latestVersion}`]) wrappedStr = data[`versions.${data.latestVersion}`];
                   if (wrappedStr) {
                     const raw = await window.crypto.subtle.decrypt({ name: "RSA-OAEP" }, escrowPrivKey, _b64ToAb(wrappedStr));
                     legacyKey = await window.crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
                   }
                 }
               } catch(e) {}
             }
          }

          // レガシーキーが復元できた場合、それを共有キーとして保存してアップグレード
          if (legacyKey) {
             console.log(`[SharedKey] レガシーE2EEキーを復元しました。共有キーとしてアップグレードします (room=${roomId})`);
             try {
                const raw = await window.crypto.subtle.exportKey("raw", legacyKey);
                const b64 = _abToB64(raw);
                await updateDoc(doc(_getDb(), `artifacts/${_getAppId()}/servers/${serverId}/rooms/${roomId}`), { sharedKey: b64, currentKeyVersion: 1 });
                const keysObj = { "1": legacyKey, latest: legacyKey, latestVersion: "1" };
                _e2ee.roomKeyCache[roomId] = keysObj;
                return keysObj;
             } catch(e) {
                console.warn("[SharedKey] 共有キーへのアップグレードに失敗:", e);
             }
          }
        }

        // 3) それでもキーがない場合、もし過去メッセージが存在するなら上書きを避けるためブロック
        let hasExistingData = false;
        if (roomData && roomData.currentKeyVersion > 1) hasExistingData = true;
        const msgsSnap = await getDocs(query(collection(_getDb(), `artifacts/${_getAppId()}/servers/${serverId}/rooms/${roomId}/messages`), limit(1)));
        if (!msgsSnap.empty) hasExistingData = true;
        
        if (hasExistingData) {
          console.warn(`[SharedKey] ルーム(room=${roomId})には既に過去ログが存在します。手元に鍵がないため、新規生成による上書き破壊をブロックしました。`);
          await _requestEscrowRescue(serverId, roomId);
          return null;
        }

        // 4) 完全に新規の場合、新しい共有ルームキーを生成してドキュメントに保存
        const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
        const raw = await window.crypto.subtle.exportKey("raw", key);
        const b64 = _abToB64(raw);
        await updateDoc(doc(_getDb(), `artifacts/${_getAppId()}/servers/${serverId}/rooms/${roomId}`), { sharedKey: b64, currentKeyVersion: 1 });
        
        const keysObj = { "1": key, latest: key, latestVersion: "1" };
        _e2ee.roomKeyCache[roomId] = keysObj;
        return keysObj;

      } catch (e) {
        console.error(`[SharedKey] ルーム鍵の取得・生成処理に失敗 (room=${roomId}):`, e);
        return null;
      }
    }

    export async function _getRoomKeyWithWait(serverId, roomId, memberIds, maxWaitMs = 1500) {
      if (!_subtleOK) return null;
      if (_e2ee.roomKeyCache[roomId]) return _e2ee.roomKeyCache[roomId];
      const deadline = Date.now() + maxWaitMs;
      let attempt = 0;
      while (true) {
        const keyObj = await _getOrCreateRoomKey(serverId, roomId, memberIds);
        if (keyObj) return keyObj;
        if (Date.now() >= deadline) return null; 
        const delay = Math.min(150 * Math.pow(2, attempt++), 500);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    // Forward Secrecy: ルーム鍵のローテーション
    export async function _rotateAllRoomKeys(serverId, remainingMembers) {
       if (!_subtleOK) return;
       try {
         

         const roomsSnap = await getDocs(collection(_getDb(), `artifacts/${_getAppId()}/servers/${serverId}/rooms`));
         const promises = [];
         roomsSnap.forEach(roomSnap => {
            const roomId = roomSnap.id;
            promises.push((async () => {
               const roomRef = roomSnap.ref;
               let nextVer = Date.now(); // 同時ローテーション時の競合上書きを防ぐためタイムスタンプ一意バージョン
               const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
               const raw = await window.crypto.subtle.exportKey("raw", key);
               await __distributeRoomKeyVersion(serverId, roomId, raw, remainingMembers, nextVer);
               await updateDoc(roomRef, { currentKeyVersion: nextVer });
               delete _e2ee.roomKeyCache[roomId];
            })());
         });
         await Promise.all(promises);
         console.log(`[E2EE] All room keys rotated for server ${serverId}`);
       } catch(e) {
         console.error("[E2EE] rotateAllRoomKeys failed:", e);
       }
    }

    export async function __distributeRoomKeyVersion(serverId, roomId, rawKey, memberIds, version) {
      const ids = Array.from(new Set([...(memberIds || []), _getUserId()]));
      const isD1 = false;
      const writes = [];
      const d1Keys = [];
      for (const uid of ids) {
        const pub = (uid === _getUserId()) ? _e2ee.publicKey : await __getUserPublicKey(uid);
        if (!pub) continue; 
        try {
          const wrapped = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, rawKey);
          if (isD1) {
            d1Keys.push({ userId: uid, keyData: { [`versions.${version}`]: _abToB64(wrapped), latestVersion: version, wrappedKey: _abToB64(wrapped), updatedAt: Date.now() } });
          } else {
            writes.push(setDoc(
              doc(_getDb(), `artifacts/${_getAppId()}/servers/${serverId}/rooms/${roomId}/roomKeys/${uid}`),
              { 
                 [`versions.${version}`]: _abToB64(wrapped),
                 latestVersion: version,
                 wrappedKey: _abToB64(wrapped), // fallback
                 updatedAt: serverTimestamp() 
              }, { merge: true }
            ));
          }
        } catch (e) {}
      }
      const escrowPub = await __getEscrowPublicKey();
      if (escrowPub) {
        try {
          const wrapped = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, escrowPub, rawKey);
          if (isD1) {
            d1Keys.push({ userId: "__escrow__", keyData: { [`versions.${version}`]: _abToB64(wrapped), latestVersion: version, wrappedKey: _abToB64(wrapped), updatedAt: Date.now() } });
          } else {
            writes.push(setDoc(
              doc(_getDb(), `artifacts/${_getAppId()}/servers/${serverId}/rooms/${roomId}/roomKeys/__escrow__`),
              { 
                 [`versions.${version}`]: _abToB64(wrapped),
                 latestVersion: version,
                 wrappedKey: _abToB64(wrapped),
                 updatedAt: serverTimestamp() 
              }, { merge: true }
            ));
          }
        } catch (e) {}
      }
      if (isD1 && d1Keys.length > 0) {
        await saveD1RoomKeys(serverId, roomId, d1Keys);
      } else {
        await Promise.all(writes);
      }
    }


    export async function _backfillRoomKeysForMembers(serverId, roomId, memberIds) {
      if (!_subtleOK || !_getUserId()) return;
      try {
        const isD1 = false;
        const roomKeyObj = _e2ee.roomKeyCache[roomId];
        if (!roomKeyObj) return; 
        for (const ver in roomKeyObj) {
          if (ver === 'latest' || ver === 'latestVersion') continue;
          const rawKey = await window.crypto.subtle.exportKey("raw", roomKeyObj[ver]);
          const ids = Array.from(new Set(memberIds || []));
          const d1Keys = [];
          for (const uid of ids) {
            try {
              const pub = (uid === _getUserId()) ? _e2ee.publicKey : await __getUserPublicKey(uid);
              if (!pub) continue; 
              const wrapped = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, rawKey);
              if (isD1) {
                d1Keys.push({ userId: uid, keyData: { [`versions.${ver}`]: _abToB64(wrapped), updatedAt: Date.now() } });
              } else {
                await setDoc(
                  doc(_getDb(), `artifacts/${_getAppId()}/servers/${serverId}/rooms/${roomId}/roomKeys/${uid}`),
                  { [`versions.${ver}`]: _abToB64(wrapped), updatedAt: serverTimestamp() }, 
                  { merge: true }
                );
              }
            } catch (e) { }
          }
          if (isD1 && d1Keys.length > 0) {
            await saveD1RoomKeys(serverId, roomId, d1Keys);
          }
        }
      } catch (e) {}
    }

    export async function _encryptText(plaintext, roomKeyObj) {
      if (!_subtleOK || !roomKeyObj || !roomKeyObj.latest || typeof plaintext !== "string" || plaintext.length === 0) return null;
      try {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const ct = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, roomKeyObj.latest, _te.encode(plaintext));
        return `enc::v${roomKeyObj.latestVersion}::` + _abToB64(iv.buffer) + "::" + _abToB64(ct);
      } catch (e) {
        console.warn("[E2EE] 暗号化失敗（平文で送信）:", e);
        return null;
      }
    }

    export function _isEncrypted(text) {
      return typeof text === "string" && text.startsWith(E2EE_PREFIX);
    }

    export async function _decryptText(text, serverId, roomId, memberIds) {
      if (!_isEncrypted(text)) return text; 
      if (!_subtleOK) return "（復号化エラー：この環境では暗号化メッセージを表示できません）";
      try {
        const roomKeyObj = await _getOrCreateRoomKey(serverId, roomId, memberIds || []);
        if (!roomKeyObj) return "（復号化エラー：鍵が見つかりません）";
        
        const parts = text.split("::"); 
        if (parts.length !== 4) return "（復号化エラー：メッセージを解読できません）";
        const version = parts[1].replace('v', '');
        let keyToUse = roomKeyObj[version];
        const iv = new Uint8Array(_b64ToAb(parts[2]));
        const ctBuf = _b64ToAb(parts[3]);

        if (keyToUse) {
          try {
            const pt = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, keyToUse, ctBuf);
            return _td.decode(pt);
          } catch(e) { /* 指定バージョンで失敗した場合は下部の総当たりフォールバックへ */ }
        }

        // 【キー総当たりフォールバック復号】ローテーション競合等でバージョン番号がずれているメッセージを救済
        for (const ver in roomKeyObj) {
          if (ver === 'latest' || ver === 'latestVersion' || ver === version) continue;
          try {
            const pt = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, roomKeyObj[ver], ctBuf);
            return _td.decode(pt);
          } catch(e) {}
        }

        // それでも復号できない場合は、鍵が根本から違っているか欠落しているため自動救済トリガーを発行
        await _requestEscrowRescue(serverId, roomId);
        return `（復号化エラー：バージョン${version}の鍵が一致しません。自動復旧を待機中です…）`;
      } catch (e) {
        return "（復号化エラー：メッセージを解読できません）";
      }
    }

    export async function _decryptMessagesInPlace(messages, serverId, roomId, memberIds) {
      if (!_subtleOK || !Array.isArray(messages)) return;
      for (const m of messages) {
        if (!m || typeof m.text !== "string") continue;
        if (m._decrypted) continue;            

        if (!m._originalText && _isEncrypted(m.text)) {
          m._originalText = m.text;
        }
        const textToDecrypt = m._originalText || m.text;

        if (!_isEncrypted(textToDecrypt)) { m._decrypted = true; continue; } 
        try {
          const decrypted = await _decryptText(textToDecrypt, serverId, roomId, memberIds);
          if (decrypted && decrypted.startsWith("（復号化エラー：")) {
            m._decryptedErrorText = decrypted;
            m._decrypted = false;
          } else {
            m.text = decrypted;
            m._decryptedErrorText = null;
            m._decrypted = true;
          }
        } catch (e) {
          m.text = "（復号化エラー：メッセージを解読できません）";
          m._decrypted = false;
        }
      }
    }

    // --- ファイルのE2EE暗号化/復号化 ---
    export async function _encryptFileE2EE(file, roomKeyObj) {
      if (!_subtleOK || !roomKeyObj || !roomKeyObj.latest) throw new Error("Key not found");
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const buffer = await file.arrayBuffer();
      const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, roomKeyObj.latest, buffer);
      
      const verNum = parseInt(roomKeyObj.latestVersion);
      let header;
      if (verNum < 255) {
        header = new Uint8Array([verNum]);
      } else {
        header = new Uint8Array(9);
        header[0] = 255;
        const dv = new DataView(header.buffer);
        dv.setFloat64(1, Number(verNum), false);
      }
      return new Blob([header, iv, ciphertext]);
    }

    export async function _decryptFileE2EE(encryptedBuffer, roomKeyObj, serverId = null, roomId = null) {
      if (!_subtleOK || !roomKeyObj) throw new Error("Key not found");
      const data = encryptedBuffer instanceof Uint8Array ? encryptedBuffer : new Uint8Array(encryptedBuffer instanceof ArrayBuffer ? encryptedBuffer : encryptedBuffer.buffer, encryptedBuffer.byteOffset || 0, encryptedBuffer.byteLength || encryptedBuffer.length);
      if (data.length === 0) throw new Error("Empty buffer");
      const firstByte = data[0];
      let version, iv, ciphertext;
      if (firstByte < 255) {
        version = firstByte.toString();
        iv = data.subarray(1, 13);
        ciphertext = data.subarray(13);
      } else {
        const headerBuf = data.subarray(1, 9);
        const dv = new DataView(headerBuf.buffer, headerBuf.byteOffset, headerBuf.byteLength);
        version = dv.getFloat64(0, false).toString();
        iv = data.subarray(9, 21);
        ciphertext = data.subarray(21);
      }
      let keyToUse = roomKeyObj[version];
      
      if (keyToUse) {
        try {
          const plaintext = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, keyToUse, ciphertext);
          return new Blob([plaintext]);
        } catch(e){}
      }
      for (const ver in roomKeyObj) {
        if (ver === 'latest' || ver === 'latestVersion' || ver === version) continue;
        try {
          const pt = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, roomKeyObj[ver], ciphertext);
          return new Blob([pt]);
        } catch(e){}
      }
      if (serverId && roomId) {
        await _requestEscrowRescue(serverId, roomId);
      }
      throw new Error(`Missing or mismatched key for version ${version}`);
    }

    // 設定>アプリ情報 の「メッセージの暗号化」状態表示を更新する。
    // ユーザーが自分で暗号化が効いているか確認できるようにする（実機での動作確認用）。
    export async function _updateE2EEStatusUI() {
      // PC設定モーダルとスマホUIの両方を同時に更新する
      const els = [document.getElementById('appInfoE2EE'), document.getElementById('mobileAppInfoE2EE')].filter(Boolean);
      if (!els.length) return;
      const set = (text, color) => { els.forEach(el => { el.textContent = text; el.style.color = color; }); };
      if (!_subtleOK) {
        set('利用できません（端末非対応）', '#dc2626'); // 赤
        return;
      }
      set('確認中…', '#6b7280');
      try {
        const ok = await _ensureE2EEKeys();
        if (ok && _e2ee.ready) {
          set('有効（自動暗号化）', '#0d9488'); // ティール (Covoスタイル)
        } else {
          set('準備中…（まだ鍵がありません）', '#d97706'); // オレンジ
        }
      } catch (e) {
        set('準備中…', '#d97706');
      }
    }