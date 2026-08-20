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

// ================= SETTINGS UI MODULE ================
// === コンソールログの自動収集 ===
window._covoLogs = [];
const _orgLog = console.log, _orgWarn = console.warn, _orgErr = console.error;
const _pushLog = (type, args) => {
  try {
    const msg = Array.from(args).map(a => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object') {
        try { return JSON.stringify(a); } catch (err) { return String(a); }
      }
      return String(a);
    }).join(' ');
    window._covoLogs.push(`[${type}] ${msg}`);
    if (window._covoLogs.length > 50) window._covoLogs.shift();
  } catch (e) { }
};
console.log = function (...args) { _pushLog('INFO', args); _orgLog.apply(console, args); };
console.warn = function (...args) { _pushLog('WARN', args); _orgWarn.apply(console, args); };
console.error = function (...args) { _pushLog('ERR', args); _orgErr.apply(console, args); };

// === フィードバック機能 ===
window.openFeedbackModal = function () {
  document.getElementById('feedbackContent').value = '';
  document.getElementById('feedbackCategory').value = 'bug';
  document.getElementById('feedbackModal').classList.remove('hidden');
};

window.closeFeedbackModal = function () {
  document.getElementById('feedbackModal').classList.add('hidden');
};

window.submitFeedback = async function () {
  const btn = document.getElementById('feedbackSubmitBtn');
  const contentVal = document.getElementById('feedbackContent').value.trim();
  const categoryVal = document.getElementById('feedbackCategory').value;
  if (!contentVal) {
    alertMessage("内容を入力してください", "error");
    return;
  }
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 送信中...';
  try {
    const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    await addDoc(collection(db, `artifacts/${appId}/feedbacks`), {
      content: contentVal,
      category: categoryVal,
      createdBy: userId,
      email: auth.currentUser?.email || '不明',
      createdAt: serverTimestamp(),
      status: 'open',
      userAgent: navigator.userAgent,
      screenSize: `${window.innerWidth}x${window.innerHeight}`,
      consoleLogs: window._covoLogs.join('\n')
    });
    window.closeFeedbackModal();
    alertMessage("ご報告ありがとうございました。運営チームに送信されました。", "success");
  } catch (e) {
    console.error("Feedback submit error:", e);
    alertMessage("送信に失敗しました", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "送信";
  }
};

// =========================================================================
// Keyboard Shortcuts (Enter for Confirm, Shift for Cancel)
// =========================================================================
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    if (e.isComposing || e.keyCode === 229) return;
    if (
      !authContainer.classList.contains("hidden") &&
      (document.activeElement === emailInput || document.activeElement === passwordInput)
    ) {
      e.preventDefault(); authButton.click();
    } else if (
      !nicknameContainer.classList.contains("hidden") && document.activeElement === nicknameInput
    ) {
      e.preventDefault(); setNicknameButton.click();
    } else if (
      !createRoomPasswordModal.classList.contains("hidden") &&
      (document.activeElement === document.getElementById("modalNewRoomNameInput") || document.activeElement === newRoomPasswordInput)
    ) {
      e.preventDefault(); confirmCreateRoomButton.click();
    } else if (
      !joinRoomPasswordModal.classList.contains("hidden") && document.activeElement === joinRoomPasswordInput
    ) {
      e.preventDefault(); confirmJoinRoomButton.click();
    } else if (!deleteRoomConfirmModal.classList.contains("hidden")) {
      e.preventDefault(); confirmDeleteButton.click();
    } else if (
      !deleteRoomPasswordModal.classList.contains("hidden") && document.activeElement === deleteRoomPasswordInput
    ) {
      e.preventDefault(); confirmDeletePasswordButton.click();
    } else if (
      !settingsModal.classList.contains("hidden") && document.activeElement === settingsNicknameInput
    ) {
      e.preventDefault(); saveSettingsButton.click();
    }
  }

  if (e.key === "Shift") {
    if (!createRoomPasswordModal.classList.contains("hidden")) {
      cancelCreateRoomButton.click();
    } else if (!joinRoomPasswordModal.classList.contains("hidden")) {
      cancelJoinRoomButton.click();
    } else if (!deleteRoomConfirmModal.classList.contains("hidden")) {
      cancelDeleteButton.click();
    } else if (!deleteRoomPasswordModal.classList.contains("hidden")) {
      cancelDeletePasswordButton.click();
    } else if (!settingsModal.classList.contains("hidden")) {
      closeSettingsButton.click();
    }
  }
});


// =========================================================================
// FCM Initialization (全プラットフォーム対応)
// =========================================================================
let fcmInitialized = false;
async function initializeFCM() {
  if (fcmInitialized) return;
  // Tauri 版は FCM/Service Worker を使わない:
  //   - WebView2 では Web Push の配信が安定しない
  //   - 代わりに dummyUnreadListener が Firestore 経由で新着を検知し、
  //     show_notification_window で独自UI（LINE風）の通知を出す
  if (isTauri) {
    fcmInitialized = true;

    if (window.__TAURI__?.notification?.onAction) {
      window.__TAURI__.notification.onAction((event) => {
        if (window.__TAURI__?.core?.invoke) {
          window.__TAURI__.core.invoke('show_main_window').catch(console.error);
        }
      }).catch(e => { /* ignore error as notification plugin might be missing some commands */ });
    }
    console.log('🔔 [通知] デスクトップ版: ネイティブ通知システムを使用します');
    return;
  }
  fcmInitialized = true;
  try {
    // Service Worker を明示的に登録
    if ('serviceWorker' in navigator) {
      const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
      console.log('⚙️ [システム] バックグラウンド処理(Service Worker)の登録が完了しました:', swRegistration);

      // ★ SWにuserIdとappIdを送る（SW側で自分のメッセージへの通知をスキップするため）
      const sendUserIdToSW = () => {
        const sw = navigator.serviceWorker.controller;
        if (sw && userId) {
          sw.postMessage({ type: 'SET_USER_ID', userId, appId, idToken: _cachedIdToken });
        }
      };
      // 即時送信 + コントローラー切り替わり時にも送信
      sendUserIdToSW();
      navigator.serviceWorker.addEventListener('controllerchange', sendUserIdToSW);

      // 通知クリック時: Tauri (Windows EXE) ではウィンドウをフォーカス
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NOTIFICATION_CLICKED') {
          if (window.__TAURI__) {
            try {
              window.__TAURI__.window.getCurrent().setFocus();
            } catch (e) {
              try { window.__TAURI__.invoke('tauri', { __tauriModule: 'Window', message: { cmd: 'setFocus' } }); } catch (_) { }
            }
          }
          if (event.data.data?.type === 'incoming_call') {
            handleCallNotificationClick(event.data.data);
          }
        }
        if (event.data && event.data.type === 'CALL_DECLINED_FROM_NOTIFICATION') {
          handleCallDeclinedFromNotification(event.data);
        }
      });
    }

    if (!messaging) messaging = getMessaging(app);

    // 通知権限の取得（ブラウザ通知トグルが有効な場合のみ）
    const browserEnabled = localStorage.getItem('simplechat_browser_notif') !== 'false';
    if (browserEnabled && 'Notification' in window) {
      if (Notification.permission === 'default') {
        console.log('📱 [通知] ブラウザ通知権限が未設定です。ユーザーアクションによる設定を待機します。');
        return; // Safari等でジェスチャー無しでリクエストするとブロックされるため、ここではリクエストしない
      }
      if (Notification.permission === 'granted') {
        try {
          // iOS 18+対策: SW が完全に有効化されるまで待つ
          const swReg = await navigator.serviceWorker.ready;
          const token = await getToken(messaging, {
            vapidKey: "BCe5ICJmyyuurq1DsPBXY6AsQcSsIDuXPieZ-c4L1_5zcNwyq2HC3DBhMBND0g9oTwPmEzUhiLqsAjLrnmVlxj0",
            serviceWorkerRegistration: swReg
          });
          if (token && userId) {
            console.log('📱 [通知] プッシュ通知用トークンを正常に取得しました:', token.substring(0, 20) + '...');
            currentFcmToken = token;
            const userRef = doc(db, `artifacts/${appId}/users`, userId);
            // トークンローテーション対応: 古いトークンを削除して新しいトークンを登録
            const prevToken = localStorage.getItem('covo_fcm_token');
            if (prevToken && prevToken !== token) {
              console.log('📱 [通知] プッシュ通知用トークンが更新されたため、古いものを削除しました');
              try { await updateDoc(userRef, { fcmTokens: arrayRemove(prevToken) }); } catch (_) { }
            }
            await setDoc(userRef, { fcmTokens: arrayUnion(token) }, { merge: true });
            localStorage.setItem('covo_fcm_token', token);

            // ★ FCMトークン週次リフレッシュ（トークン失効による通知停止を防ぐ）
            // 旧タイムスタンプを先に読んでから、今回の時刻を書き込む（順序が重要！）
            const lastRefreshed = parseInt(localStorage.getItem('covo_fcm_token_refreshed_at') || '0', 10);
            localStorage.setItem('covo_fcm_token_refreshed_at', Date.now().toString());
            const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
            if (lastRefreshed > 0 && Date.now() - lastRefreshed > SEVEN_DAYS) {
              console.log('📱 [通知] 定期的なプッシュ通知用トークンの更新を実行しました');
              try {
                const { deleteToken } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging.js');
                await deleteToken(messaging);
                fcmInitialized = false;
                await initializeFCM(); // 再初期化でトークン再取得
                return;
              } catch (_) { }
            }
          } else if (!token) {
            console.warn('FCM Token not obtained — push notifications may not work on this device');
          }
        } catch (tokenErr) {
          console.error('FCM Token error (push notifications disabled on this device):', tokenErr);
        }
      } else {
        console.log('📱 [通知] 通知権限が許可されていないため、プッシュ通知の登録をスキップしました (現在の状態: ' + permission + ')');
      }
    } else {
      console.log('📱 [通知] 通知設定がオフ、またはお使いのブラウザが通知に対応していません');
    }

    // フォアグラウンドメッセージ受信
    onMessage(messaging, (payload) => {
      const data = payload.data;
      if (data && data.serverId && data.serverId !== currentServerId) {
        showInAppNotification(
          data.serverName || data.serverId,
          data.roomName || data.roomId,
          data.senderName || 'メンバー',
          data.body || '新着メッセージ',
          data.serverId,
          null,
          data.roomId
        );
        try {
          let items = JSON.parse(localStorage.getItem('covo_global_items') || '[]');
          if (!items.find(it => it.roomId === data.roomId)) {
            items.push({
              serverId: data.serverId,
              serverName: data.serverName || data.serverId,
              roomId: data.roomId,
              roomName: data.roomName || data.roomId,
              lastAt: Date.now()
            });
            localStorage.setItem('covo_global_items', JSON.stringify(items));
          }
          if (typeof renderNotifList === 'function') renderNotifList(items);
        } catch (e) { }
      }
    });
  } catch (error) {
    console.error('FCM Initialization Error:', error);
  }
}

// ブラウザ通知トグル ON/OFF: トークンを Firestore から削除/再登録することで
// サーバーが push を送らなくする（SW がそもそも呼ばれない = 確実にオフになる）
async function setBrowserPushEnabled(enabled) {
  if (isTauri) return;
  if (enabled) {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    // 再度トークンを取得して Firestore に登録
    fcmInitialized = false;
    await initializeFCM();
  } else {
    // トークンを削除して通知をブロック
    try {
      if (currentFcmToken && userId) {
        const userRef = doc(db, `artifacts/${appId}/users`, userId);
        await updateDoc(userRef, { fcmTokens: arrayRemove(currentFcmToken) });
      }
      if (messaging) {
        try { await deleteToken(messaging); } catch (e) { console.warn('deleteToken failed', e); }
      }
      currentFcmToken = null;
      console.log('📱 [通知] プッシュ通知が無効化されました (トークン削除済)');
    } catch (e) {
      console.error('Failed to disable push:', e);
    }
  }
}

// =========================================================================
// Sidebar Resizing Feature - ★改善版に置き換え
// =========================================================================
function initializeResizer() {
  // --- Left Sidebar ---
  const sidebar = document.getElementById("sidebar");
  const resizer = document.getElementById("resizer");
  const toggleLeftBtn = document.getElementById("toggleLeftSidebarBtn");
  const LEFT_WIDTH_KEY = "chatAppSidebarWidth";
  const LEFT_COLLAPSED_KEY = "chatAppSidebarCollapsed";

  const savedLeftWidth = localStorage.getItem(LEFT_WIDTH_KEY);
  if (savedLeftWidth && sidebar) {
    sidebar.style.width = savedLeftWidth;
  }

  const isLeftCollapsed = localStorage.getItem(LEFT_COLLAPSED_KEY) === "true";
  if (isLeftCollapsed && window.innerWidth >= 768 && sidebar) {
    sidebar.classList.add("hidden");
    sidebar.classList.remove("md:flex");
  }

  let isResizingLeft = false;
  if (resizer) {
    resizer.addEventListener("mousedown", (e) => {
      isResizingLeft = true;
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleLeftMouseMove);
      document.addEventListener("mouseup", handleLeftMouseUp);
    });
  }

  function handleLeftMouseMove(e) {
    if (isResizingLeft && sidebar) {
      const maxAllowed = Math.min(600, window.innerWidth - 120);
      const newWidth = Math.max(180, Math.min(maxAllowed, e.clientX));
      sidebar.style.width = `${newWidth}px`;
    }
  }

  function handleLeftMouseUp() {
    isResizingLeft = false;
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", handleLeftMouseMove);
    document.removeEventListener("mouseup", handleLeftMouseUp);
    if (sidebar) localStorage.setItem(LEFT_WIDTH_KEY, sidebar.style.width);
  }

  if (toggleLeftBtn && sidebar) {
    toggleLeftBtn.addEventListener("click", () => {
      const isHidden = sidebar.classList.contains("hidden") || sidebar.style.display === "none";
      if (isHidden) {
        sidebar.classList.remove("hidden");
        sidebar.classList.add("md:flex");
        localStorage.setItem(LEFT_COLLAPSED_KEY, "false");
      } else {
        sidebar.classList.add("hidden");
        sidebar.classList.remove("md:flex");
        localStorage.setItem(LEFT_COLLAPSED_KEY, "true");
      }
    });
  }

  // --- Right Sidebar (Members) ---
  const membersSidebar = document.getElementById("membersSidebar");
  const resizerRight = document.getElementById("resizerRight");
  const toggleMembersBtn = document.getElementById("toggleMembersSidebarBtn");
  const RIGHT_WIDTH_KEY = "chatAppMembersWidth";
  const RIGHT_COLLAPSED_KEY = "chatAppMembersCollapsed";

  const savedRightWidth = localStorage.getItem(RIGHT_WIDTH_KEY);
  if (savedRightWidth && membersSidebar) membersSidebar.style.width = savedRightWidth;

  const isRightCollapsed = localStorage.getItem(RIGHT_COLLAPSED_KEY) === "true";
  if (isRightCollapsed && window.innerWidth >= 768 && membersSidebar) {
    membersSidebar.style.setProperty("display", "none", "important");
    membersSidebar.classList.add("hidden");
    membersSidebar.classList.remove("md:flex");
  }

  let isResizingRight = false;
  if (resizerRight) {
    resizerRight.addEventListener("mousedown", (e) => {
      isResizingRight = true;
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleRightMouseMove);
      document.addEventListener("mouseup", handleRightMouseUp);
    });
  }

  function handleRightMouseMove(e) {
    if (isResizingRight && membersSidebar) {
      const newWidth = Math.max(150, Math.min(500, window.innerWidth - e.clientX));
      membersSidebar.style.width = `${newWidth}px`;
    }
  }

  function handleRightMouseUp() {
    isResizingRight = false;
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", handleRightMouseMove);
    document.removeEventListener("mouseup", handleRightMouseUp);
    if (membersSidebar) localStorage.setItem(RIGHT_WIDTH_KEY, membersSidebar.style.width);
  }

  if (toggleMembersBtn && membersSidebar) {
    toggleMembersBtn.addEventListener("click", () => {
      const isHidden = membersSidebar.style.display === "none" || membersSidebar.classList.contains("hidden");
      if (isHidden) {
        membersSidebar.style.setProperty("display", "", "important");
        membersSidebar.classList.remove("hidden");
        membersSidebar.classList.add("md:flex");
        localStorage.setItem(RIGHT_COLLAPSED_KEY, "false");
      } else {
        membersSidebar.style.setProperty("display", "none", "important");
        membersSidebar.classList.add("hidden");
        membersSidebar.classList.remove("md:flex");
        localStorage.setItem(RIGHT_COLLAPSED_KEY, "true");
      }
    });
  }
}

// =========================================================================
// PWA & Settings Management
// =========================================================================

let deferredPrompt;
const pwaBanner = document.getElementById('pwaInstallBanner');
const pwaInstallBtn = document.getElementById('pwaInstallButton');
const pwaCloseBtn = document.getElementById('pwaInstallClose');

const isMobileDevice = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

window.addEventListener('beforeinstallprompt', (e) => {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  // スマホのみバナー表示
  if (!isStandalone && !isTauri && isMobileDevice) {
    e.preventDefault();
    deferredPrompt = e;
    pwaBanner.classList.add('show');
  }
});

pwaInstallBtn.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      pwaBanner.classList.remove('show');
    }
    deferredPrompt = null;
  } else if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
    // iOS Safariの場合
    showCustomAlert("Safariの「共有」ボタンから「ホーム画面に追加」を選択してください。\n追加すると通知を受け取れるようになります。");
  }
});

pwaCloseBtn.addEventListener('click', () => {
  pwaBanner.classList.remove('show');
});

// iOS向けヒント表示（スマホのみ）
if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream && !window.navigator.standalone && !isTauri) {
  document.getElementById('pwaInstallHint').textContent = "共有ボタンから「ホーム画面に追加」してください";
  pwaBanner.classList.add('show');
}


function initSettings() {
  const toggleNotifSound = document.getElementById('toggleNotifSound');
  const toggleBrowserNotif = document.getElementById('toggleBrowserNotif');
  const toggleDesktopNotif = document.getElementById('toggleDesktopNotif');
  const toggleAutoStart = document.getElementById('toggleAutoStart');

  // 初期値の読み込み
  toggleNotifSound.checked = localStorage.getItem('simplechat_sound') !== 'false';
  toggleBrowserNotif.checked = localStorage.getItem('simplechat_browser_notif') !== 'false';
  loadDarkServerTheme();

  if (isTauri) {
    // Windows版: ブラウザ通知行を非表示、デスクトップ通知・自動起動・ショートカットを表示
    document.getElementById('desktopSettingsContainer').classList.remove('hidden');
    document.getElementById('desktopNotifRow').classList.remove('hidden');
    document.getElementById('shortcutInfoContainer').classList.remove('hidden');
    document.getElementById('browserNotifRow').classList.add('hidden');
    // デスクトップショートカット作成ボタン（Tauri専用）
    const pcRow = document.getElementById('pcCreateShortcutRow');
    if (pcRow) pcRow.style.setProperty('display', 'flex', 'important');
    const mobileRow = document.getElementById('mobileCreateShortcutBtn');
    if (mobileRow) mobileRow.style.display = 'flex';

    // ログフォルダボタンをdesktopSettingsContainer内に動的追加する代わりに、
    // notifPositionContainerが削除されたため openLogDirBtn は追加しない

    // バージョン表示
    (async () => {
      try {
        const app = window.__TAURI__?.app;
        const verSpan = document.getElementById('installedVersion');
        if (!verSpan) return;
        if (app?.getVersion) {
          const v = await app.getVersion();
          verSpan.textContent = 'v' + v;
        } else if (window.__TAURI__?.core?.invoke) {
          const v = await window.__TAURI__.core.invoke('plugin:app|version').catch(() => null);
          verSpan.textContent = v ? ('v' + v) : '不明';
        } else {
          verSpan.textContent = 'Tauri 不検知';
        }
      } catch (e) {
        const el = document.getElementById('installedVersion');
        if (el) el.textContent = 'エラー: ' + (e?.message || e);
      }
    })();

    toggleDesktopNotif.checked = localStorage.getItem('simplechat_desktop_notif') !== 'false';
    if (isTauri && toggleDesktopNotif.checked) {
      const tauriNotif = window.__TAURI__?.notification;
      if (tauriNotif && tauriNotif.requestPermission) {
        tauriNotif.requestPermission();
      } else if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
      }
    }

    if (window.__TAURI__?.autostart) {
      window.__TAURI__.autostart.isEnabled().then(enabled => {
        toggleAutoStart.checked = enabled;
      }).catch(console.error);
    }

    // ショートカットキー入力欄の初期化
    const shortcutInput = document.getElementById('shortcutKeyInput');
    const shortcutDisplay = document.getElementById('shortcutKeyDisplay');
    const savedKey = localStorage.getItem('simplechat_shortcut_key') || 'S';
    shortcutInput.value = savedKey.toUpperCase();
    shortcutDisplay.textContent = savedKey.toUpperCase();

    shortcutInput.addEventListener('input', (e) => {
      const val = e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
      e.target.value = val;
      if (val.length === 1) {
        localStorage.setItem('simplechat_shortcut_key', val);
        shortcutDisplay.textContent = val;
        if (window.__TAURI__?.core?.invoke) {
          window.__TAURI__.core.invoke('update_shortcut_key', { key: val }).catch(console.error);
        }
      }
    });

    shortcutInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.preventDefault();
    });
  }
  // Web/PWA版: ブラウザ通知行はデフォルトで表示済み。他のTauri専用UIは hidden のまま。

  // Event Listeners
  toggleNotifSound.addEventListener('change', (e) => {
    localStorage.setItem('simplechat_sound', e.target.checked);
  });

  toggleBrowserNotif.addEventListener('change', (e) => {
    localStorage.setItem('simplechat_browser_notif', e.target.checked);
    setBrowserPushEnabled(e.target.checked).catch(console.error);
  });

  toggleDesktopNotif.addEventListener('change', (e) => {
    localStorage.setItem('simplechat_desktop_notif', e.target.checked);
    if (isTauri && e.target.checked) {
      const tauriNotif = window.__TAURI__?.notification;
      if (tauriNotif && tauriNotif.requestPermission) {
        tauriNotif.requestPermission();
      } else if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
      }
    }
  });

  toggleAutoStart.addEventListener('change', async (e) => {
    if (!window.__TAURI__?.autostart) return;
    try {
      if (e.target.checked) {
        await window.__TAURI__.autostart.enable();
      } else {
        await window.__TAURI__.autostart.disable();
      }
    } catch (err) {
      console.error("Autostart toggle failed", err);
      e.target.checked = !e.target.checked;
    }
  });

  const closeBehaviorSelect = document.getElementById('closeBehaviorSelect');
  if (closeBehaviorSelect) {
    const saved = localStorage.getItem('covo_close_behavior') || 'minimize';
    closeBehaviorSelect.value = saved;
    const labelEl = document.getElementById('closeBehaviorSelectedLabel');
    if (labelEl) {
      const opt = document.querySelector(`.covo-select-option[data-value="${saved}"]`);
      if (opt) {
        document.querySelectorAll('#closeBehaviorDropdown .covo-select-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        labelEl.textContent = opt.textContent;
      }
    }
    if (window.__TAURI__?.core) {
      window.__TAURI__.core.invoke('set_close_behavior', { behavior: saved }).catch(console.error);
    }
  }
}

// ===== テーマ切り替えロジック (Light, Dark Navy, Discord Dark) =====
window.setAppTheme = function (theme) {
  document.body.classList.remove('dark-server-theme', 'discord-dark-theme');
  localStorage.setItem('covo_app_theme', theme);

  if (theme === 'dark-navy') {
    document.body.classList.add('dark-server-theme');
  } else if (theme === 'discord-dark') {
    document.body.classList.add('discord-dark-theme');
  }
  updateThemeSelectorUI(theme);
};

window.updateThemeSelectorUI = function (theme) {
  const t = theme || localStorage.getItem('covo_app_theme') || (localStorage.getItem('covo_dark_server_theme') === 'true' ? 'dark-navy' : 'light');
  const btnLight = document.getElementById('themeBtnLight');
  const btnNavy = document.getElementById('themeBtnDarkNavy');
  const btnDiscord = document.getElementById('themeBtnDiscordDark');

  [btnLight, btnNavy, btnDiscord].forEach(b => {
    if (b) {
      b.classList.remove('ring-2', 'ring-indigo-500', 'border-indigo-500');
    }
  });

  if (t === 'discord-dark' && btnDiscord) {
    btnDiscord.classList.add('ring-2', 'ring-indigo-500', 'border-indigo-500');
  } else if (t === 'dark-navy' && btnNavy) {
    btnNavy.classList.add('ring-2', 'ring-indigo-500', 'border-indigo-500');
  } else if (btnLight) {
    btnLight.classList.add('ring-2', 'ring-indigo-500', 'border-indigo-500');
  }
};

// 初期テーマの復元
(function initTheme() {
  const savedTheme = localStorage.getItem('covo_app_theme') || (localStorage.getItem('covo_dark_server_theme') === 'true' ? 'dark-navy' : 'light');
  window.setAppTheme(savedTheme);
})();

// ===== 独自カスタムドロップダウン制御 =====
window.toggleCustomDropdown = function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  const isOpen = el.classList.contains('open');
  document.querySelectorAll('.covo-custom-select').forEach(s => s.classList.remove('open'));
  if (!isOpen) {
    el.classList.add('open');
  }
};

window.selectCloseBehaviorOption = function (val, label) {
  const hiddenInput = document.getElementById('closeBehaviorSelect');
  const labelEl = document.getElementById('closeBehaviorSelectedLabel');
  if (hiddenInput) hiddenInput.value = val;
  if (labelEl) labelEl.textContent = label;

  document.querySelectorAll('#closeBehaviorDropdown .covo-select-option').forEach(o => {
    if (o.getAttribute('data-value') === val) {
      o.classList.add('selected');
    } else {
      o.classList.remove('selected');
    }
  });

  localStorage.setItem('covo_close_behavior', val);
  if (window.__TAURI__?.core) {
    window.__TAURI__.core.invoke('set_close_behavior', { behavior: val }).catch(console.error);
  }

  document.querySelectorAll('.covo-custom-select').forEach(s => s.classList.remove('open'));
};

// ドロップダウン外クリックで閉じる
document.addEventListener('click', (e) => {
  if (!e.target.closest('.covo-custom-select')) {
    document.querySelectorAll('.covo-custom-select').forEach(s => s.classList.remove('open'));
  }
});

// ===== グローバル Esc キーでモーダルを閉じる =====
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    // ドロップダウンが開いていればまず閉じる
    const openSelects = document.querySelectorAll('.covo-custom-select.open');
    if (openSelects.length > 0) {
      openSelects.forEach(s => s.classList.remove('open'));
      return;
    }
    const openModals = document.querySelectorAll('.modal:not(.hidden), [id$="Modal"]:not(.hidden), #avatarLightbox[style*="flex"], #imageLightbox[style*="flex"]');
    if (openModals.length > 0) {
      const topModal = openModals[openModals.length - 1];
      if (topModal.id === 'avatarLightbox' || topModal.id === 'imageLightbox') {
        topModal.style.display = 'none';
      } else {
        topModal.classList.add('hidden');
        if (topModal.style.display === 'flex') topModal.style.display = 'none';
      }
    }
  }
});
