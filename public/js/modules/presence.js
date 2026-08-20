import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app-check.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  onIdTokenChanged,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  persistentMultipleTabManager,
  memoryLocalCache,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  query,
  where,
  serverTimestamp,
  orderBy,
  getDocs,
  writeBatch,
  limit,
  startAfter,
  startAt,
  arrayUnion,
  arrayRemove,
  increment,
  documentId,
  collectionGroup,
  deleteField
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
  getMessaging,
  getToken,
  onMessage,
  deleteToken
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging.js";

import { E2EE_PREFIX, E2EE_LS_PRIV, E2EE_LS_PUB, _e2ee, _subtleOK, _td, _te, initCryptoContext, __lsGet, __lsSet, __genUserKeyPair, __importPriv, __importPub, _ensureE2EEKeys, __ensureE2EEKeysImpl, __backupKeysToFirestore, __getUserPublicKey, __getEscrowPublicKey, _requestEscrowRescue, _ensureEscrowKey, _getOrCreateRoomKey, __getOrCreateRoomKeyImpl, _getRoomKeyWithWait, _rotateAllRoomKeys, __distributeRoomKeyVersion, _backfillRoomKeysForMembers, _encryptText, _isEncrypted, _decryptText, _decryptMessagesInPlace, _encryptFileE2EE, _decryptFileE2EE, _updateE2EEStatusUI } from '../crypto_helpers.js';
import { _abToB64, _b64ToAb, formatBytes, getMsgTimestamp, safeCopy, _execCopyFallback, emailInitial, processHeicFile } from '../utils.js';
import { escapeHtml, getEmojiHtml, _twemojiParse, escapeHtmlAndLinkUrls } from '../text_formatter.js';
import { alertMessage, openAvatarLightbox, playNotificationSound } from '../ui_helpers.js';
import { checkFileAllowed as _checkFileAllowed, _uploadToExternalService } from '../file_uploader.js';
import { _runShadowHunter, _updateLayoutDebugUI, __clearInspectHighlight, __showInspectHighlight, _inspectPoint, _lineColor as __lineColor, _appendConsoleLine as __appendConsoleLine } from '../debug_ui.js';

// ================= PRESENCE MODULE ================
// =========================================================================
// Presence System (Online/Offline Status)
// =========================================================================

function resetAwayTimer() {
  if (awayTimer) clearTimeout(awayTimer);
  awayTimer = setTimeout(() => {
    updateUserStatus('away');
  }, AWAY_TIMEOUT);
}

function stopAwayTimer() {
  if (awayTimer) {
    clearTimeout(awayTimer);
    awayTimer = null;
  }
}

let offlineTimer = null;
function startOfflineTimer() {
  if (offlineTimer) clearTimeout(offlineTimer);
  offlineTimer = setTimeout(() => {
    updateUserStatus('offline');
    sendOfflineBeacon();
  }, 15 * 60 * 1000);
}
function stopOfflineTimer() {
  if (offlineTimer) {
    clearTimeout(offlineTimer);
    offlineTimer = null;
  }
}

let _heartbeatInterval = null;

function startHeartbeat() {
  // RTDB onDisconnectを使用中のためハートビート不要
}

function stopHeartbeat() {
  if (_heartbeatInterval) { clearInterval(_heartbeatInterval); _heartbeatInterval = null; }
}


// ネット復帰: ステータスをリセット（バックグラウンド復帰時は離席中）
function _handleNetworkOnline() {
  _beaconSent = false;
  const currentState = document.visibilityState === 'hidden' ? 'away' : 'online';
  updateUserStatus(currentState);
  if (currentState === 'away') startOfflineTimer();
  refreshCachedIdToken();
}
// ネット切断: 即座にofflineビーコンを送る
function _handleNetworkOffline() {
  sendOfflineBeacon();
}

function stopPresenceSystem() {
  stopAwayTimer();
  stopHeartbeat();
  _beaconSent = false;
  if (_idTokenRefreshTimer) { clearInterval(_idTokenRefreshTimer); _idTokenRefreshTimer = null; }
  _cachedIdToken = null;
  if (memberListRefreshInterval) {
    clearInterval(memberListRefreshInterval);
    memberListRefreshInterval = null;
  }
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("beforeunload", handlePageClose);
  window.removeEventListener("pagehide", handlePageClose);
  window.removeEventListener("freeze", handlePageClose);
  window.removeEventListener("pageshow", handlePageShow);
  window.removeEventListener("focus", handleWindowFocus);
  window.removeEventListener("blur", handleWindowBlur);
  window.removeEventListener("online", _handleNetworkOnline);
  window.removeEventListener("offline", _handleNetworkOffline);
  if (unsubscribeUserStatus) {
    unsubscribeUserStatus();
    unsubscribeUserStatus = null;
  }
  unsubscribeStatusArray.forEach(unsub => unsub());
  unsubscribeStatusArray = [];
}

function clearAppBadgeFull() {
  if ('clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch(() => { });
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      if (registration.active) {
        registration.active.postMessage({ type: 'CLEAR_BADGE' });
      }
    }).catch(() => { });
  }
}

const handleWindowFocus = () => {
  _beaconSent = false;
  stopOfflineTimer();
  updateUserStatus('online');
  resetAwayTimer();
  if (typeof currentRoomId !== 'undefined' && currentRoomId) {
    try {
      const rm = JSON.parse(localStorage.getItem('covo_last_read') || '{}');
      rm[currentRoomId] = Date.now() + 10000;
      localStorage.setItem('covo_last_read', JSON.stringify(rm));
    } catch (e) { }
    if (typeof unreadCounts !== 'undefined') unreadCounts[currentRoomId] = 0;
    const badge = document.getElementById(`unread-badge-${currentRoomId}`);
    if (badge) badge.style.display = 'none';
    updateGlobalNotifUI();
  }
  if (isTauri && window.__TAURI__?.core?.invoke) {
    let globalCount = 0;
    try { globalCount = JSON.parse(localStorage.getItem('covo_global_items') || '[]').length; } catch (e) { }
    window.__TAURI__.core.invoke('set_badge', { hasUnread: globalCount > 0 }).catch(console.error);
  }
  clearAppBadgeFull();
};

const handleWindowBlur = () => {
  updateUserStatus('away');
  stopAwayTimer();
  startOfflineTimer();
  if (isTauri && window.__TAURI__?.core?.invoke) {
    let globalCount = 0;
    try { globalCount = JSON.parse(localStorage.getItem('covo_global_items') || '[]').length; } catch (e) { }
    window.__TAURI__.core.invoke('set_badge', { hasUnread: globalCount > 0 }).catch(console.error);
  }
};

const handleVisibilityChange = () => {
  if (document.visibilityState === 'hidden') {
    updateUserStatus('away');
    stopAwayTimer();
    startOfflineTimer();
  } else {
    _beaconSent = false;
    stopOfflineTimer();
    updateUserStatus('online');
    resetAwayTimer();
    clearAppBadgeFull();
    if (typeof updateGlobalNotifUI === 'function') updateGlobalNotifUI();
    if (typeof requestScanAllUnread === 'function') requestScanAllUnread();
  }
};

const handlePageShow = (e) => {
  if (e.persisted) handleWindowFocus();
};

// タブ閉じ・ページ離脱時の確実なオフライン化
const handlePageClose = (e) => {
  // pagehideでpersisted=false(トゥルーな閉鎖)の場合は強制送信
  if (e && e.type === 'pagehide' && e.persisted === false) {
    _beaconSent = false; // 強制リセット
  }
  sendOfflineBeacon();
};

// ビーコン送信済みフラグ（visibilitychange:hidden → pagehide/freeze の重複送信防止）
let _beaconSent = false;
// Worker認証用: Firebase IDトークンをキャッシュ（sendBeaconは同期のため事前取得が必要）
let _cachedIdToken = null;
let _idTokenRefreshTimer = null;

async function refreshCachedIdToken() {
  try {
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');
    const user = getAuth().currentUser;
    if (user) {
      _cachedIdToken = await user.getIdToken(false);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
          if (reg.active) reg.active.postMessage({ type: 'CACHE_AUTH_TOKEN', idToken: _cachedIdToken, userId: userId, appId: appId });
        }).catch(() => { });
      }
    }
  } catch (e) { }
}

// sendBeacon（ページアンロード・タスクキル時に最も信頼性が高い）+ fallback fetch
function sendOfflineBeacon() {
  if (!userId || _beaconSent || !_cachedIdToken) return;
  _beaconSent = true;
  const url = 'https://simplechat-api.astro-fray-server.workers.dev/api/setOffline';
  const data = JSON.stringify({ userId, appId, idToken: _cachedIdToken || '' });
  try {
    // sendBeacon はブラウザがバックグラウンドで送信完了を保証する
    if (navigator.sendBeacon) {
      const blob = new Blob([data], { type: 'text/plain' }); // text/plainはシンプルリクエスト→プリフライト不要→credentials=includeでも届く
      navigator.sendBeacon(url, blob);
      return;
    }
  } catch (_) { }
  // フォールバック: keepalive fetch
  try {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data,
      keepalive: true,
      credentials: 'omit'
    }).catch(() => { });
  } catch (e) { }
}

let _lastReportedStatusStr = null;
// RTDB presence管理
let _rtdb = null;
let _rtdbStatusRef = null;
let _rtdbOnDisconnect = null;

async function _getOrInitRTDB() {
  if (_rtdb) return _rtdb;
  const { getDatabase } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
  _rtdb = getDatabase(app);
  return _rtdb;
}

// =========================================================================
// RTDB Database Toggle Logic
// =========================================================================
// トグルは廃止され、RTDBによる同期が恒久的に有効化されました。
window.globalUseRtdb = true;
let rtdbGlobalSettingUnsub = null;
async function setupGlobalRtdbListener() {
  // no-op: 常に true
}

// Initialize toggle when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {

  // Force migration to Modern UI
  if (!localStorage.getItem('covo_modern_ui_migrated_v2')) {
    localStorage.setItem('covo_discord_ui', 'true');
    localStorage.setItem('covo_modern_ui_migrated_v2', '1');
  }

  // Just in case, the Auth observer handles actual db fetching
});

async function updateUserStatus(state) {
  if (!userId || !userNickname) return;

  // 差分チェック（同じ状態ならスキップ）
  const currentStatusStr = JSON.stringify({ state, roomId: currentRoomId, nickname: userNickname, avatarUrl: userAvatarUrl });
  if (_lastReportedStatusStr === currentStatusStr) return;
  _lastReportedStatusStr = currentStatusStr;

  try {
    const { ref, set, serverTimestamp, onDisconnect: rtdbOnDisconnect } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
    const rtdb = await _getOrInitRTDB();
    const statusRef = ref(rtdb, `status/${userId}`);
    _rtdbStatusRef = statusRef;

    const payload = {
      state: state,
      last_changed: serverTimestamp(),
      nickname: userNickname,
      avatarUrl: userAvatarUrl || null
    };
    if (state === 'online') {
      payload.currentRoomId = currentRoomId || null;
    }
    await set(statusRef, payload);

    // onDisconnectペイロードの動的更新
    if (_rtdbOnDisconnect) {
      try { await _rtdbOnDisconnect.cancel(); } catch (e) { }
    }
    _rtdbOnDisconnect = rtdbOnDisconnect(statusRef);
    await _rtdbOnDisconnect.set({
      state: state === 'online' ? 'offline' : state,
      last_changed: serverTimestamp(),
      nickname: userNickname,
      avatarUrl: userAvatarUrl || null
    });

  } catch (error) {
    console.error('[RTDB] Status update error:', error);
  }
}

// Rust側(Tauri)から呼べるようにwindowにエクスポート
window.blockingUpdateCheck = blockingUpdateCheck;
window.sendOfflineBeacon = sendOfflineBeacon;
window.updateUserStatus = updateUserStatus;

// 通話関数をグローバルに公開（type="module" スコープから onclick で呼ぶため）
window.openCallPicker = openCallPicker;
window.closeCallPicker = closeCallPicker;
function setCallReconnectStatus(isReconnecting) {
  const lbl = document.getElementById('callStatusLabel');
  if (!lbl) return;
  if (isReconnecting) {
    lbl.textContent = '再接続中...';
    lbl.classList.add('reconnecting');
  } else {
    lbl.textContent = '通話中';
    lbl.classList.remove('reconnecting');
  }
}

function setCallConnectionType(type) {
  const el = document.getElementById('callConnectionType');
  if (!el) return;
  if (!type) { el.style.display = 'none'; el.className = ''; el.innerHTML = ''; return; }
  el.className = type;
  el.style.display = 'inline-flex';
  el.textContent = type === 'turn' ? 'TURN中継' : 'P2P直接接続';
}

function showCallEndedReason(reason) {
  const msgs = {
    declined: '通話が拒否されました',
    remoteEnded: '相手が通話を終了しました',
    callerCancelled: '発信者がキャンセルしました',
    connectionLost: '接続が切れました',
    turnDisconnected: '中継サーバー経由の接続が切れました（制限の可能性）',
    micDenied: 'マイクへのアクセスが拒否されました',
  };
  const msg = msgs[reason] || reason;
  const toast = document.getElementById('callEndedToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3700);
}

window.acceptCall = acceptCall;
window.declineCall = declineCall;
window.endCall = endCall;
window.toggleMute = toggleMute;

// ダークサーバーリストテーマ
function setDarkServerTheme(isDark) {
  localStorage.setItem('covo_dark_server', isDark ? 'true' : 'false');
  document.body.classList.toggle('dark-server-theme', isDark);
  document.documentElement.classList.toggle('dark-server-theme', isDark);
  if (typeof updateMetaThemeColor === 'function') updateMetaThemeColor();
  const pcToggle = document.getElementById('toggleDarkServer');
  const mobileToggle = document.getElementById('toggleDarkServerMobile');
  if (pcToggle) pcToggle.checked = isDark;
  if (mobileToggle) mobileToggle.checked = isDark;
}
function loadDarkServerTheme() {
  const isDark = localStorage.getItem('covo_dark_server') === 'true';
  document.body.classList.toggle('dark-server-theme', isDark);
  document.documentElement.classList.toggle('dark-server-theme', isDark);
  if (typeof updateMetaThemeColor === 'function') updateMetaThemeColor();
  const pcToggle = document.getElementById('toggleDarkServer');
  const mobileToggle = document.getElementById('toggleDarkServerMobile');
  if (pcToggle) pcToggle.checked = isDark;
  if (mobileToggle) mobileToggle.checked = isDark;
}
window.setDarkServerTheme = setDarkServerTheme;
window.prewarmPeerConnection = prewarmPeerConnection;
window.stopPrewarmPC = stopPrewarmPC;

let unsubscribeStatusArray = [];

function getTimestampMs(obj) {
  if (!obj || !obj.last_changed) return 0;
  if (typeof obj.last_changed === 'number') return obj.last_changed; // RTDB
  if (obj.last_changed.toDate) return obj.last_changed.toDate().getTime(); // Firestore
  return 0;
}

function subscribeToUserStatus() {
  // 旧リスナーをクリーンアップ
  if (unsubscribeUserStatus) { unsubscribeUserStatus(); unsubscribeUserStatus = null; }
  unsubscribeStatusArray.forEach(unsub => unsub());
  unsubscribeStatusArray = [];

  const memberIds = currentServerData?.joinedUsers || [];
  if (memberIds.length === 0) {
    cachedUsers = [];
    renderMembersList(cachedUsers);
    return;
  }

  const usersMap = new Map();

  // 1. Firestoreフォールバック（過去にログインしたユーザーや旧バージョンのステータス）
  for (let i = 0; i < memberIds.length; i += 30) {
    const chunk = memberIds.slice(i, i + 30);
    const statusQuery = query(collection(db, `artifacts/${appId}/status`), where(documentId(), "in", chunk));
    const unsub = onSnapshot(statusQuery, (snapshot) => {
      let changed = false;
      snapshot.forEach((doc) => {
        const fsData = doc.data();
        const existing = usersMap.get(doc.id) || { id: doc.id };

        const fsTime = getTimestampMs(fsData);
        const rtdbTime = existing._rtdbTime || 0;

        if (fsTime >= rtdbTime) {
          // Firestoreの方が新しい（旧アプリで更新を続けている場合）
          usersMap.set(doc.id, {
            ...existing,
            ...fsData,
            _fsTime: fsTime,
            _fsData: fsData
          });
        } else {
          // RTDBの方が新しい
          usersMap.set(doc.id, {
            ...fsData,
            ...existing,
            _fsTime: fsTime,
            _fsData: fsData
          });
        }
        changed = true;
      });
      if (changed) {
        cachedUsers = Array.from(usersMap.values());
        renderMembersList(cachedUsers);
      }
    });
    unsubscribeStatusArray.push(unsub);
  }

  // 2. RTDBでリアルタイムなステータスを監視
  import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js').then(({ ref, onValue, off }) => {
    _getOrInitRTDB().then(rtdb => {
      memberIds.forEach(uid => {
        const statusRef = ref(rtdb, `status/${uid}`);
        const callback = (snapshot) => {
          const data = snapshot.val();
          const existing = usersMap.get(uid) || { id: uid };

          if (data) {
            const rtdbTime = getTimestampMs(data);
            const fsTime = existing._fsTime || 0;
            const fsData = existing._fsData || {};

            if (rtdbTime >= fsTime) {
              // RTDBの方が新しい
              usersMap.set(uid, { ...existing, ...data, _rtdbTime: rtdbTime });
            } else {
              // Firestoreの方が新しい（旧アプリを使っている）
              usersMap.set(uid, { ...existing, ...data, ...fsData, _rtdbTime: rtdbTime });
            }
          } else {
            // RTDBにデータがない場合、Firestore(既存)のstateを優先。なければoffline
            usersMap.set(uid, { id: uid, state: 'offline', ...existing, _rtdbTime: 0 });
          }
          cachedUsers = Array.from(usersMap.values());
          renderMembersList(cachedUsers);
        };
        onValue(statusRef, callback);
        unsubscribeStatusArray.push(() => off(statusRef, 'value', callback));
      });
    });
  }).catch(e => console.error('[RTDB] subscribeToUserStatus error:', e));
}

function renderMembersList(users) {
  if (!membersList) return;
  membersList.innerHTML = "";

  // サーバーメンバーのみ表示（currentServerData がない場合は全員）
  const serverMemberIds = currentServerData?.joinedUsers || null;
  const filtered = serverMemberIds
    ? users.filter(u => serverMemberIds.includes(u.id))
    : users;

  const processedUsers = filtered.map(u => {
    let computedState = u.state || 'offline';

    // RTDB形式(Unix ms整数)とFirestore形式(Timestampオブジェクト)の両方に対応
    // onDisconnect後はRTDBが即座に反映するため、35分は保守的なフォールバック
    if (computedState === 'online' || computedState === 'away') {
      let timeDiff = null;
      if (typeof u.last_changed === 'number') {
        timeDiff = Date.now() - u.last_changed; // RTDB: Unix ms
      } else if (u.last_changed && u.last_changed.toDate) {
        timeDiff = Date.now() - u.last_changed.toDate().getTime(); // Firestore Timestamp
      }
      if (timeDiff !== null) {
        if (computedState === 'away' && timeDiff > 15 * 60 * 1000) {
          computedState = 'offline';
        } else if (timeDiff > 35 * 60 * 1000) {
          computedState = 'offline';
        }
      }
    }

    // update own UI status indicator here
    if (u.id === userId) {
      const statusElement = document.getElementById('userPanelStatus');
      if (statusElement) statusElement.className = `status-indicator status-${computedState}`;
    }
    return { ...u, computedState };
  });

  const onlineMembers = processedUsers.filter(u => u.computedState === 'online');
  const awayMembers = processedUsers.filter(u => u.computedState === 'away');
  const offlineMembers = processedUsers.filter(u => u.computedState === 'offline');

  onlineMembers.sort((a, b) => (a.nickname || "").localeCompare(b.nickname || ""));
  awayMembers.sort((a, b) => (a.nickname || "").localeCompare(b.nickname || ""));
  offlineMembers.sort((a, b) => (a.nickname || "").localeCompare(b.nickname || ""));

  const createGroup = (title, members) => {
    if (members.length === 0) return;

    const titleDiv = document.createElement("div");
    titleDiv.className = "member-group-title";
    titleDiv.textContent = `${title} — ${members.length}`;
    membersList.appendChild(titleDiv);

    members.forEach((member, idx) => {
      const item = document.createElement("div");
      item.className = "member-item";

      const avatar = document.createElement("div");
      avatar.className = "avatar-placeholder";
      if (isUsableAvatarUrl(member.avatarUrl)) {
        const avatarImg = document.createElement("img");
        avatarImg.alt = member.nickname || "";
        avatarImg.referrerPolicy = 'no-referrer';
        avatarImg.decoding = 'async';
        avatarImg.dataset.retries = '0';
        const _u = member.avatarUrl;
        avatarImg.onerror = function () {
          _invalidAvatars.add(member.avatarUrl);
          try { avatarImg.remove(); avatar.insertBefore(document.createTextNode((member.nickname || " ").charAt(0).toUpperCase()), avatar.firstChild); } catch (_) { }
        };
        avatarImg.src = member.avatarUrl;
        avatar.appendChild(avatarImg);
        avatar.style.cursor = "pointer";
        avatar.addEventListener("click", () => openAvatarLightbox(member.avatarUrl));
      } else {
        avatar.textContent = (member.nickname || " ").charAt(0).toUpperCase();
      }

      const statusDot = document.createElement("div");
      statusDot.className = `status-indicator status-${member.computedState}`;
      avatar.appendChild(statusDot);

      const info = document.createElement("div");
      info.className = "member-info";

      const name = document.createElement("div");
      name.className = "member-name";
      name.textContent = member.nickname || "不明なユーザー";
      info.appendChild(name);

      if (member.computedState === 'away' || member.computedState === 'offline') {
        const statusText = document.createElement("div");
        statusText.className = "member-status-text";
        statusText.textContent = formatTimeAgo(member.last_changed);
        info.appendChild(statusText);
      }

      item.appendChild(avatar);
      item.appendChild(info);
      membersList.appendChild(item);
    });
  };

  createGroup("Online", onlineMembers);
  createGroup("Away", awayMembers);
  createGroup("Offline", offlineMembers);
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return "";
  let past;
  if (typeof timestamp === 'number') {
    past = new Date(timestamp);
  } else if (timestamp.toDate) {
    past = timestamp.toDate();
  } else {
    return "";
  }

  const now = new Date();
  const diffInSeconds = Math.floor((now - past) / 1000);

  if (diffInSeconds < 60) return `数秒前`;
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}分前`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}時間前`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}日前`;
}


