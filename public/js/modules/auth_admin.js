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

// ================= AUTH & ADMIN MODULE ================
// =========================================================================
// Initialization & Auth
// =========================================================================
function initializeFirebase() {
  try {
    if (!app) {
      app = initializeApp(firebaseConfig);
      try {
        initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider('6LfB3UAtAAAAAD_Yj4JaPVUfd0hvxrtEGvivvwuU'),
          isTokenAutoRefreshEnabled: true
        });
        console.log("🤖 [セキュリティ] ボット対策 (App Check) が正常に起動しました");
      } catch (e) {
        console.warn("AppCheckの起動が制限されています(VPN/広告ブロッカーの可能性)", e);
        setTimeout(() => {
          const toast = document.createElement('div');
          toast.className = 'fixed bottom-4 right-4 bg-red-600/90 text-white px-4 py-3 rounded-lg shadow-2xl z-[9999] text-sm max-w-sm flex flex-col gap-2 backdrop-blur animate-fade-in-up';
          toast.innerHTML = `
                    <div class="flex items-center gap-2 font-bold"><i class="fas fa-exclamation-triangle"></i> 通信セキュリティ確認に失敗しました</div>
                    <div class="text-xs text-red-100 leading-relaxed">
                        VPN、広告ブロッカー、またはブラウザのトラッキング防止機能（プライベートリレー等）により、通信の一部が制限されている可能性があります。<br>
                        一部の機能が使えない場合は、それらを一時的にオフにして再読み込みをお試しください。
                    </div>
                    <button class="bg-white/20 hover:bg-white/30 rounded py-1.5 mt-1 font-bold text-xs transition" onclick="this.parentElement.remove()">閉じる</button>
                `;
          document.body.appendChild(toast);
        }, 3000);
      }
      try {
        db = initializeFirestore(app, {
          localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({ forceOwnership: true }) }),
          experimentalForceLongPolling: true
        });
      } catch (e) {
        console.warn("IndexedDB cache failed, falling back to memory cache to speed up loading.", e);
        try {
          db = initializeFirestore(app, {
            localCache: memoryLocalCache(),
            experimentalForceLongPolling: true
          });
        } catch (e2) {
          db = getFirestore(app);
        }
      }
      auth = getAuth(app);
    }
    onIdTokenChanged(auth, async (user) => {
      if (user) {
        _cachedIdToken = await user.getIdToken();
      } else {
        _cachedIdToken = null;
      }
    });

    onAuthStateChanged(auth, async (user) => {
      // 再入防止: 前回の処理が終わっていない場合はスキップ
      if (_authHandlerBusy) return;
      _authHandlerBusy = true;
      loadingOverlay.classList.add("hidden");
      try {

        if (user) {
          // 同一ユーザーIDで既に初期化済みならスキップ（FCM再登録等の無駄な処理を防止）
          if (_lastAuthUserId === user.uid && userNickname) {
            _authHandlerBusy = false;
            return;
          }
          userId = user.uid;
          userAuthEmail = user.email;
          isAuthReady = true;

          // Firestoreに認証トークンが伝播するまで待つ（レースコンディション対策）
          await user.getIdToken();

          // 直列処理による遅延を防ぐため、初期化に必要なデータを一斉取得
          const adminDocRef = doc(db, `artifacts/${appId}/settings`, "adminList");
          const configRef = doc(db, `artifacts/${appId}/settings`, "allowedEmailsConfig");
          const listAdminRef = doc(db, `artifacts/${appId}/settings`, "listAdminList");
          const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile`, "nicknameDoc");

          const [adminSnap, configSnap, listAdminSnap, userProfileSnap] = await Promise.all([
            getDoc(adminDocRef).catch(e => { console.error("Admin check error:", e); return null; }),
            getDoc(configRef).catch(e => { console.error("allowedEmails check error:", e); return null; }),
            getDoc(listAdminRef).catch(e => { console.error("list admin check error:", e); return null; }),
            getDoc(userProfileRef).catch(e => { console.error("profile check error:", e); return null; })
          ]);

          isAdmin = false;
          if (adminSnap && adminSnap.exists()) {
            const data = adminSnap.data();
            const hasEmail = data.emails && data.emails.includes(user.email);
            const hasUid = data.admins && data.admins.includes(user.uid);
            isAdmin = hasEmail || hasUid;
          }

          // 非管理者は allowedEmails を確認してアクセス制御
          isListAdmin = false;
          if (!isAdmin) {
            if (configSnap && configSnap.exists() && configSnap.data().active) {
              const allowedRef = doc(db, `artifacts/${appId}/allowedEmails`, user.email);
              const allowedSnap = await getDoc(allowedRef).catch(e => null);
              if (!allowedSnap || !allowedSnap.exists()) {
                await signOut(auth);
                authMessage.textContent = "このメールアドレスはアクセスが許可されていません。管理者にお問い合わせください。";
                loadingOverlay.classList.add("hidden");
                return;
              }
            }

            // リスト管理者チェック
            if (listAdminSnap && listAdminSnap.exists()) {
              const data = listAdminSnap.data();
              const hasEmail = data.emails && data.emails.includes(user.email);
              const hasUid = data.admins && data.admins.includes(user.uid);
              isListAdmin = hasEmail || hasUid;
            }
          }

          // 管理者またはリスト管理者であれば「管理者設定」ボタンを表示
          if (isAdmin || isListAdmin) {
            if (adminPanelContainer) adminPanelContainer.classList.remove("hidden");
            const snavAdmin = document.getElementById("snav-admin-container");
            if (snavAdmin) snavAdmin.classList.remove("hidden");
            const mobileAdminSec = document.getElementById("mobileAdminRowSection");
            if (mobileAdminSec) {
              mobileAdminSec.style.display = "";
              mobileAdminSec.classList.remove("hidden");
            }
          } else {
            if (adminPanelContainer) adminPanelContainer.classList.add("hidden");
            const snavAdmin = document.getElementById("snav-admin-container");
            if (snavAdmin) snavAdmin.classList.add("hidden");
            const mobileAdminSec = document.getElementById("mobileAdminRowSection");
            if (mobileAdminSec) {
              mobileAdminSec.style.display = "none";
              mobileAdminSec.classList.add("hidden");
            }
          }



          if (userProfileSnap && userProfileSnap.exists() && userProfileSnap.data().nickname) {
            userNickname = userProfileSnap.data().nickname;
            userAvatarUrl = userProfileSnap.data().avatarUrl || null;

            // ★ 既存ユーザーのマイグレーション：ログイン時に必ずemailをルートに保存
            const userRef = doc(db, `artifacts/${appId}/users`, userId);
            setDoc(userRef, {
              email: user.email,
              nickname: userNickname,
              avatarUrl: userAvatarUrl
            }, { merge: true }).catch(console.error);

            headerTitle.textContent = `ニックネーム：${userNickname}${isAdmin ? " (管理者)" : ""}`;
            updateUserPanelUI();

            authContainer.classList.add("hidden");
            nicknameContainer.classList.add("hidden");
            appContainer.classList.add("hidden");
            document.getElementById("serverListScreen").classList.remove("hidden");
            showServerList();
            startPresenceSystem();
            initializeFCM();
            // E2EE: 鍵を自動初期化（無ければFirestoreかWeb Cryptoで自動生成・復元）。失敗してもアプリは継続
            // 続けて管理者ならエスクロー鍵（合鍵）も用意する
            ensureE2EEKeys().then(() => ensureEscrowKey()).catch(() => { });
            _lastAuthUserId = user.uid;
            // SW にuserIdを通知（自分のメッセージへの通知バグ防止）
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.ready.then(reg => {
                if (reg.active) reg.active.postMessage({ type: 'SET_USER_ID', userId: userId, appId: appId, idToken: _cachedIdToken });
              }).catch(() => { });
            }
            // FCMが有効な場合はFirestoreグローバルリスナーは不要（FCMが通知を担当）
            // Tauriのみ或いはFCMトークン取得失敗時はFirestoreリスナーをフォールバック
            setTimeout(() => setupGlobalNotificationListeners(), 2000);
            initCallListener();
            initFileShareListener();
            initReadStatesSync();
            setupGlobalRtdbListener();
          } else {
            authContainer.classList.add("hidden");
            appContainer.classList.add("hidden");
            document.getElementById("serverListScreen").classList.add("hidden");
            nicknameContainer.classList.remove("hidden");
            nicknameInput.value = "";
          }
        } else {
          // Cleanup on logout
          // SW にuserIdクリアを通知
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(reg => {
              if (reg.active) reg.active.postMessage({ type: 'CLEAR_USER_ID' });
            }).catch(() => { });
          }
          _lastAuthUserId = null;
          userId = null; userNickname = null; isAdmin = false; isListAdmin = false; isAuthReady = false;
          currentRoomId = null; currentServerId = null; currentServerData = null;
          headerTitle.textContent = "";
          currentRoomHeader.classList.add("hidden");
          clearMessagesDOM();
          messageInput.disabled = true;
          sendMessageButton.disabled = true;
          document.getElementById('callButton').disabled = true;
          stopPrewarmPC();
          if (_callId) endCall(false);
          if (_callIncomingUnsub) { _callIncomingUnsub(); _callIncomingUnsub = null; }
          stopPresenceSystem();
          if (serverListUnsubscribe) { serverListUnsubscribe(); serverListUnsubscribe = null; }

          authContainer.classList.remove("hidden");
          appContainer.classList.add("hidden");
          document.getElementById("serverListScreen").classList.add("hidden");
          nicknameContainer.classList.add("hidden");
          membersSidebar.classList.add("hidden");
        }
      } catch (authErr) {
        console.error('[Auth] onAuthStateChanged handler error:', authErr);
        if (typeof showEmergencyRecoveryPanel === 'function') showEmergencyRecoveryPanel(authErr.message || '認証初期化エラー', authErr);
      } finally {
        _authHandlerBusy = false;
        window.__app_fully_loaded__ = true;
        const _invoke = window.__TAURI__?.core?.invoke;
        if (_invoke) {
          _invoke('notify_app_loaded').catch(e => console.warn("Failed to notify Tauri:", e));
        }
      }
    });
  } catch (error) {
    console.error("Firebase Init Error:", error);
    authMessage.textContent = `エラー: ${error.message}`;
  }
}

function updateUserPanelUI() {
  if (userNickname) {
    userPanelName.textContent = userNickname;
    userPanelId.textContent = `#${userId.substring(0, 4)}`;

    if (userAvatarUrl) {
      __setAvatarImg(userPanelAvatar, userAvatarUrl, userNickname, { className: 'w-full h-full rounded-full object-cover', style: '' });
    } else {
      userPanelAvatar.innerHTML = userNickname.charAt(0).toUpperCase();
    }

    const stat = document.createElement('div');
    stat.id = 'userPanelStatus';
    stat.className = 'status-indicator status-online';
    userPanelAvatar.appendChild(stat);

    // サーバーリスト画面のアバターボタンも更新
    updateServerListUserBtn();
  }
}

// タブ切り替え処理
tabLogin.addEventListener("click", () => {
  tabLogin.classList.replace("text-gray-400", "text-gray-800");
  tabLogin.classList.replace("border-transparent", "border-gray-800");
  tabSignup.classList.replace("text-gray-800", "text-gray-400");
  tabSignup.classList.replace("border-gray-800", "border-transparent");
  loginFormArea.classList.remove("hidden");
  signupFormArea.classList.add("hidden");
  authMessage.textContent = "";
});

tabSignup.addEventListener("click", () => {
  tabSignup.classList.replace("text-gray-400", "text-gray-800");
  tabSignup.classList.replace("border-transparent", "border-gray-800");
  tabLogin.classList.replace("text-gray-800", "text-gray-400");
  tabLogin.classList.replace("border-gray-800", "border-transparent");
  signupFormArea.classList.remove("hidden");
  loginFormArea.classList.add("hidden");
  authMessage.textContent = "";
});

authButton.addEventListener("click", async () => {
  const email = (emailInput.value || "").trim();
  const password = passwordInput.value;
  authMessage.textContent = "";
  loadingOverlay.classList.remove("hidden");
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    const code = error.code || "";
    if (code === "auth/user-not-found") {
      authMessage.textContent = "このメールアドレスは登録されていません。";
    } else if (code === "auth/wrong-password") {
      authMessage.textContent = "パスワードが正しくありません。";
    } else if (code === "auth/invalid-credential") {
      authMessage.textContent = "メールアドレスまたはパスワードが正しくありません。";
    } else if (code === "auth/invalid-email") {
      authMessage.textContent = "メールアドレスの形式が正しくありません。";
    } else if (code === "auth/user-disabled") {
      authMessage.textContent = "このアカウントは無効になっています。管理者にお問い合わせください。";
    } else if (code === "auth/too-many-requests") {
      authMessage.textContent = "ログイン試行が多すぎます。しばらく待ってからお試しください。";
    } else {
      authMessage.textContent = "ログインに失敗しました。";
    }
  } finally {
    loadingOverlay.classList.add("hidden");
  }
});

// サインアップ処理（誰でも登録可能）
signupButton.addEventListener("click", async () => {
  const { createUserWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js");
  const email = (signupEmailInput.value || "").trim();
  const password = signupPasswordInput.value;
  authMessage.textContent = "";

  if (!email || !password) {
    authMessage.textContent = "メールアドレスとパスワードを入力してください。";
    return;
  }
  if (password.length < 6) {
    authMessage.textContent = "パスワードは6文字以上で設定してください。";
    return;
  }

  loadingOverlay.classList.remove("hidden");
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error("Signup error:", err);
    if (err.code === "auth/email-already-in-use") {
      authMessage.textContent = "このメールアドレスはすでに使われています。";
    } else if (err.code === "auth/invalid-email") {
      authMessage.textContent = "メールアドレスの形式が正しくありません。";
    } else if (err.code === "auth/weak-password") {
      authMessage.textContent = "パスワードが弱すぎます（6文字以上）。";
    } else {
      authMessage.textContent = "アカウント作成に失敗しました。もう一度お試しください。";
    }
  } finally {
    loadingOverlay.classList.add("hidden");
  }
});

// authEmail を保持するための変数
let userAuthEmail = "";

// --- 管理者パネルの処理 ---

// タブ切り替え
let adminCurrentTab = "allowed";
function switchAdminTab(tab) {
  adminCurrentTab = tab;
  const tabs = [
    { id: "adminTabAllowedBtn", content: "adminTabAllowedContent", key: "allowed" },
    { id: "adminTabAdminsBtn", content: "adminTabAdminsContent", key: "admins" },
    { id: "adminTabListAdminsBtn", content: "adminTabListAdminsContent", key: "listAdmins" },
  ];
  tabs.forEach(t => {
    const btn = document.getElementById(t.id);
    const cnt = document.getElementById(t.content);
    if (!btn || !cnt) return;
    if (t.key === tab) {
      btn.classList.replace("border-transparent", "border-gray-900");
      btn.classList.replace("text-gray-400", "text-gray-900");
      // also support dark mode replacements
      btn.classList.replace("dark:border-transparent", "dark:border-gray-300");
      btn.classList.replace("dark:text-gray-400", "dark:text-gray-200");
      cnt.classList.remove("hidden");
    } else {
      btn.classList.replace("border-gray-900", "border-transparent");
      btn.classList.replace("text-gray-900", "text-gray-400");
      btn.classList.replace("dark:border-gray-300", "dark:border-transparent");
      btn.classList.replace("dark:text-gray-200", "dark:text-gray-400");
      cnt.classList.add("hidden");
    }
  });
}
document.getElementById("adminTabAllowedBtn").addEventListener("click", () => switchAdminTab("allowed"));
document.getElementById("adminTabAdminsBtn").addEventListener("click", () => switchAdminTab("admins"));
document.getElementById("adminTabListAdminsBtn").addEventListener("click", () => switchAdminTab("listAdmins"));

// メールアドレスのアバター頭文字取得
window.loadAdminFeedbacks = async function () {
  const listEl = document.getElementById("adminFeedbacksList");
  if (!listEl) return;
  listEl.innerHTML = "<p class='text-xs text-gray-400 text-center py-4'>読み込み中...</p>";
  try {
    const { collection, query, orderBy, getDocs, doc, deleteDoc, updateDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const q = query(collection(db, `artifacts/${appId}/feedbacks`), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    listEl.innerHTML = "";
    if (snap.empty) {
      listEl.innerHTML = "<p class='text-xs text-gray-400 text-center py-4'>フィードバックはありません。</p>";
      return;
    }
    snap.forEach(d => {
      const fb = d.data();
      fb.id = d.id;
      const item = document.createElement("div");
      item.className = "p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm text-sm flex flex-col gap-2 relative group";

      const dt = fb.createdAt && typeof fb.createdAt.toDate === 'function' ? fb.createdAt.toDate().toLocaleString() : "不明";

      let catLabel = fb.category;
      let catColor = "text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-300";
      if (fb.category === 'bug') { catLabel = "バグ"; catColor = "text-red-600 bg-red-100 dark:bg-red-900/40 dark:text-red-400"; }
      if (fb.category === 'feature') { catLabel = "要望"; catColor = "text-blue-600 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-400"; }

      const isClosed = fb.status === 'closed';
      const titleEsc = escapeHtml(fb.content.substring(0, 50).replace(/\n/g, ' '));

      const detailsHtml = `
            <div class="mt-2 text-xs text-gray-500 dark:text-gray-400 border-t dark:border-gray-700 pt-2 hidden fb-details-area">
              <p><strong>Screen:</strong> ${escapeHtml(fb.screenSize || '不明')}</p>
              <p><strong>UserAgent:</strong> ${escapeHtml(fb.userAgent || '不明')}</p>
              <div class="mt-2 bg-gray-900 text-green-400 p-2 rounded-lg max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] break-all">${escapeHtml(fb.consoleLogs || 'ログなし')}</div>
            </div>
          `;

      item.innerHTML = `
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 cursor-pointer fb-toggle-details">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${catColor}">${catLabel}</span>
                <span class="text-xs text-gray-400 dark:text-gray-500">${dt}</span>
                ${isClosed ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold text-green-600 bg-green-100 dark:bg-green-900/40 dark:text-green-400">対応済</span>' : ''}
              </div>
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="fb-copy-btn text-xs px-2 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition" title="Markdown形式でコピー"><i class="fas fa-copy"></i></button>
                <button class="fb-issue-btn text-xs px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white rounded hover:bg-gray-700 dark:hover:bg-gray-600 transition" title="GitHub Issueを作成"><i class="fab fa-github"></i></button>
                <button class="fb-close-btn text-xs px-2 py-1 ${isClosed ? 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300' : 'bg-green-500 text-white'} rounded hover:opacity-80 transition">${isClosed ? '未対応に戻す' : '対応済にする'}</button>
                <button class="fb-del-btn text-xs px-2 py-1 bg-red-50 dark:bg-red-900/30 text-red-500 rounded hover:bg-red-100 dark:hover:bg-red-900/60 transition"><i class="fas fa-trash"></i></button>
              </div>
            </div>
            <p class="text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words mt-1 text-[13px] bg-gray-50 dark:bg-gray-900 p-2 rounded cursor-pointer fb-toggle-details">${escapeHtml(fb.content)}</p>
            <div class="text-[10px] text-gray-400 mt-1">By: ${escapeHtml(fb.email || fb.createdBy || '不明')}</div>
            ${detailsHtml}
          `;

      const markdownBody = `**投稿者**: ${fb.email || fb.createdBy}\n**日時**: ${dt}\n\n**内容**:\n${fb.content}\n\n---\n**環境情報**\n- Screen: ${fb.screenSize || '不明'}\n- UserAgent: ${fb.userAgent || '不明'}\n\n**Console Logs**\n\`\`\`text\n${fb.consoleLogs || 'ログなし'}\n\`\`\``;

      item.querySelectorAll(".fb-toggle-details").forEach(el => {
        el.addEventListener("click", () => {
          const area = item.querySelector(".fb-details-area");
          area.classList.toggle("hidden");
        });
      });

      item.querySelector(".fb-copy-btn").addEventListener("click", () => {
        navigator.clipboard.writeText(markdownBody).then(() => {
          alertMessage("Markdown形式でコピーしました", "success");
        }).catch(err => {
          console.error("Copy failed", err);
          alertMessage("コピーに失敗しました", "error");
        });
      });

      item.querySelector(".fb-issue-btn").addEventListener("click", () => {
        const issueTitle = `[${catLabel}] ${titleEsc}...`;
        const url = `https://github.com/qwertyuiop1229/Covo/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(markdownBody)}`;
        window.open(url, '_blank');
      });

      item.querySelector(".fb-close-btn").addEventListener("click", async () => {
        try {
          await updateDoc(doc(db, `artifacts/${appId}/feedbacks`, fb.id), { status: isClosed ? 'open' : 'closed' });
          loadAdminFeedbacks();
        } catch (e) { console.error(e); }
      });

      item.querySelector(".fb-del-btn").addEventListener("click", async () => {
        if (!confirm("本当に削除しますか？")) return;
        try {
          await deleteDoc(doc(db, `artifacts/${appId}/feedbacks`, fb.id));
          loadAdminFeedbacks();
        } catch (e) { console.error(e); }
      });

      listEl.appendChild(item);
    });
  } catch (e) {
    console.error("Feedbacks fetch error:", e);
    listEl.innerHTML = "<p class='text-xs text-red-400 text-center py-4'>エラーが発生しました</p>";
  }
};


// リストアイテムのDOMを生成（ユーザーネーム＆アイコン対応版）
function makeEmailListItem(email, isSelf, onRemove) {
  const div = document.createElement("div");
  div.className = "flex items-center gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700/50 transition-colors";

  const userData = window.__adminUsersByEmail && window.__adminUsersByEmail[email];
  // username: username → nickname → displayName の優先順で取得
  let username = userData?.username || userData?.nickname || userData?.displayName || (userData ? "未設定" : "未参加");
  // iconUrl: iconUrl → avatarUrl → photoURL の優先順で取得
  let iconUrl = userData?.iconUrl || userData?.avatarUrl || userData?.photoURL || null;

  const avatar = document.createElement("div");
  avatar.className = "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden shadow-sm transition-colors";
  if (iconUrl) {
    avatar.classList.add("bg-gray-300", "dark:bg-gray-700", "text-gray-700", "dark:text-gray-300");
    avatar.innerHTML = `<img src="${iconUrl}" class="w-full h-full object-cover" />`;
  } else {
    if (userData) {
      avatar.classList.add("bg-gray-300", "dark:bg-gray-700", "text-gray-700", "dark:text-gray-300");
      avatar.textContent = emailInitial(email);
    } else {
      avatar.classList.add("bg-gray-200", "dark:bg-gray-700/50", "text-gray-400", "dark:text-gray-500");
      avatar.innerHTML = `<i class="fas fa-question"></i>`;
    }
  }

  const textContainer = document.createElement("div");
  textContainer.className = "flex-1 flex flex-col min-w-0";

  const emailSpan = document.createElement("span");
  emailSpan.className = "text-sm text-gray-900 dark:text-gray-100 font-bold truncate transition-colors";
  emailSpan.textContent = email;

  const userSpan = document.createElement("span");
  userSpan.className = "text-[11px] text-gray-500 dark:text-gray-400 font-medium truncate mt-0.5 transition-colors";
  if (userData) {
    userSpan.textContent = `ユーザーネーム: ${username}`;
  } else {
    userSpan.textContent = `ステータス: 未参加`;
  }

  textContainer.appendChild(emailSpan);
  textContainer.appendChild(userSpan);

  div.appendChild(avatar);
  div.appendChild(textContainer);

  if (isSelf) {
    const badge = document.createElement("span");
    badge.className = "text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 font-semibold";
    badge.textContent = "あなた";
    div.appendChild(badge);
  } else {
    const btn = document.createElement("button");
    btn.className = "w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex-shrink-0";
    btn.innerHTML = `<i class="fas fa-times text-xs"></i>`;
    btn.addEventListener("click", onRemove);
    div.appendChild(btn);
  }
  return div;
}

function renderAllowedEmails(emails) {
  allowedEmailsList.innerHTML = "";
  if (emails.length === 0) {
    const empty = document.createElement("p");
    empty.className = "text-xs text-gray-400 text-center py-4";
    empty.textContent = "リストが空です。誰でも登録可能な状態です。";
    allowedEmailsList.appendChild(empty);
    return;
  }
  emails.forEach(e => {
    allowedEmailsList.appendChild(makeEmailListItem(e, false, () => removeAllowedEmail(e)));
  });
}

function renderAdminEmails(emails) {
  adminEmailsList.innerHTML = "";
  if (emails.length === 0) {
    const empty = document.createElement("p");
    empty.className = "text-xs text-gray-400 text-center py-4";
    empty.textContent = "管理者がいません。";
    adminEmailsList.appendChild(empty);
    return;
  }
  emails.forEach(e => {
    adminEmailsList.appendChild(makeEmailListItem(e, e === userAuthEmail, () => removeAdminEmail(e)));
  });
}

async function fetchAllAdminData() {
  window.__adminUsersByEmail = {};
  try {
    const uSnap = await getDocs(collection(db, `artifacts/${appId}/users`));
    const promises = [];
    uSnap.forEach(d => {
      const u = d.data();
      if (u.email) {
        // ルートのusersドキュメントに書いたnicknameとavatarUrlを優先的に使う
        const entry = { ...u, id: d.id };
        // nickname/avatarUrlが直接ある場合はusername/iconUrlにコピー
        if (u.nickname) entry.username = u.nickname;
        if (u.avatarUrl) entry.iconUrl = u.avatarUrl;
        window.__adminUsersByEmail[u.email] = entry;
        // profile/nicknameDocにしかデータがない古いユーザーへのフォールバック
        if (!u.nickname) {
          promises.push(
            getDoc(doc(db, `artifacts/${appId}/users/${d.id}/profile`, "nicknameDoc")).then(pSnap => {
              if (pSnap.exists()) {
                const pData = pSnap.data();
                if (pData.nickname) window.__adminUsersByEmail[u.email].username = pData.nickname;
                if (pData.avatarUrl) window.__adminUsersByEmail[u.email].iconUrl = pData.avatarUrl;
              }
            }).catch(() => { })
          );
        }
      }
    });
    await Promise.all(promises);
  } catch (e) { console.error('fetchAllAdminData error:', e); }
}

let unsubAllowedEmails = null;
let unsubAdminList = null;
let unsubListAdmin = null;

async function reloadAllowedEmailsList() {
  try {
    let q;
    if (isAdmin) {
      q = collection(db, `artifacts/${appId}/allowedEmails`);
    } else if (isListAdmin) {
      const userAuthId = auth.currentUser ? auth.currentUser.uid : "";
      q = query(collection(db, `artifacts/${appId}/allowedEmails`), where("addedBy", "==", userAuthId));
    } else {
      return;
    }

    // 旧ドキュメントからの移行処理 (全体管理者のみ)
    if (isAdmin) {
      try {
        const oldRef = doc(db, `artifacts/${appId}/settings`, "allowedEmails");
        const oldSnap = await getDoc(oldRef);
        if (oldSnap.exists()) {
          const data = oldSnap.data();
          if (data.emails && Array.isArray(data.emails)) {
            console.log("Migrating old allowedEmails to subcollection...");
            const promises = data.emails.map(e => {
              const ref = doc(db, `artifacts/${appId}/allowedEmails`, e);
              return setDoc(ref, { email: e, addedBy: "system_migration", addedAt: serverTimestamp() }, { merge: true });
            });
            await Promise.all(promises);
            await deleteDoc(oldRef); // 移行完了後に削除
            console.log("Migration complete!");
          }
        }
      } catch (e) {
        console.warn("Could not migrate old allowedEmails doc", e);
      }
    }

    if (unsubAllowedEmails) unsubAllowedEmails();
    unsubAllowedEmails = onSnapshot(q, async (snap) => {
      const emails = new Set();
      snap.forEach(d => emails.add(d.id));
      await fetchAllAdminData();
      renderAllowedEmails(Array.from(emails));
    });
  } catch (e) {
    console.error("Failed to load allowed emails:", e);
  }
}

async function loadAdminPanelData() {
  adminMessage.textContent = "読み込み中...";
  try {
    if (isAdmin) {
      await fetchAllAdminData();
      await reloadAllowedEmailsList();

      if (unsubAdminList) unsubAdminList();
      unsubAdminList = onSnapshot(doc(db, `artifacts/${appId}/settings`, "adminList"), (snap) => {
        renderAdminEmails(snap.exists() ? snap.data().emails || [] : []);
      });

      if (unsubListAdmin) unsubListAdmin();
      unsubListAdmin = onSnapshot(doc(db, `artifacts/${appId}/settings`, "listAdminList"), (snap) => {
        renderListAdminEmails(snap.exists() ? snap.data().emails || [] : []);
      });
    } else if (isListAdmin) {
      await reloadAllowedEmailsList();
    }
    adminMessage.textContent = "";
  } catch (e) {
    console.error(e);
    adminMessage.textContent = "データの取得に失敗しました。";
  }
}

openAdminModalButton.addEventListener("click", () => {
  if (!isAdmin && !isListAdmin) return;
  document.querySelectorAll(".admin-only-tab").forEach(el => {
    el.style.display = isAdmin ? "" : "none";
  });
  document.querySelectorAll(".admin-only-section").forEach(el => {
    el.classList.toggle("hidden", !isAdmin);
  });
  switchAdminTab("allowed");
  loadAdminPanelData();
  if (window.matchMedia('(max-width: 768px)').matches) {
    openMobileDetail('admin');
  } else {
    switchDiscordSettingsTab('admin');
  }
});

// 許可リスト追加
// ストレージ統計

async function loadStorageStats() {
  const kvBar = document.getElementById('kvUsageBar');
  const kvText = document.getElementById('kvUsageText');
  const kvCount = document.getElementById('kvFileCount');
  if (!kvText) return;
  kvText.textContent = '読み込み中...';
  try {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
    if (!idToken) { kvText.textContent = '認証エラー'; return; }
    const res = await fetch(`${WORKER_BASE_URL}/api/admin/storageStats?appId=${appId}`, {
      headers: { "Authorization": `Bearer ${idToken}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // KV（Cloudflare）
    const kvLimitBytes = 1 * 1024 * 1024 * 1024;
    const kvUsed = data.kv?.totalBytes || 0;
    const kvPct = Math.min((kvUsed / kvLimitBytes) * 100, 100);
    kvBar.style.width = kvPct + '%';
    kvText.textContent = formatBytes(kvUsed) + ' / 1 GB';
    kvCount.textContent = (data.kv?.fileCount || 0) + ' ファイル';
  } catch (e) {
    kvText.textContent = '取得に失敗しました';
    console.error('[storageStats] fetch error:', e);
  }
}

document.getElementById('refreshStorageStatsBtn').addEventListener('click', loadStorageStats);

async function cleanupFirestoreMessages() {
  let msgDeleted = 0;
  try {
    const kvWorkerPattern = new RegExp(WORKER_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/api/file/[A-Za-z0-9_]+');
    const serversSnap = await getDocs(collection(db, `artifacts/${appId}/servers`));
    for (const serverDoc of serversSnap.docs) {
      const roomsSnap = await getDocs(collection(db, `artifacts/${appId}/servers/${serverDoc.id}/rooms`));
      for (const roomDoc of roomsSnap.docs) {
        const msgsSnap = await getDocs(collection(db, `artifacts/${appId}/servers/${serverDoc.id}/rooms/${roomDoc.id}/messages`));
        for (const msgDoc of msgsSnap.docs) {
          const d = msgDoc.data();
          const hasKvFile = d.kvFileUrl || (d.text && kvWorkerPattern.test(d.text));
          // fileData が Cloudflare(KV) URL の画像・ファイル（新形式）も対象に含める
          const hasFileDataKv = d.fileData && d.fileData.indexOf('/api/file/') >= 0;
          const hasCloudinaryFile = d.fileData && d.fileData.includes('res.cloudinary.com');
          if (hasKvFile || hasFileDataKv || hasCloudinaryFile) {
            await deleteDoc(msgDoc.ref);
            msgDeleted++;
          }
        }
      }
    }
  } catch (e) {
    console.error('[bulkDelete] Message cleanup error:', e);
  }
  return msgDeleted;
}

document.getElementById('bulkDeleteMessagesBtn').addEventListener('click', async () => {
  const first = await showCustomConfirm('チャットの「添付ファイルのみ」を削除しますか？', '削除する', 'キャンセル', 'アイコンやスタンプ等のシステムファイルは保持されます。');
  if (!first) return;
  const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  if (!idToken) return;

  const btn = document.getElementById('bulkDeleteMessagesBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 削除中...';
  try {
    const res = await fetch(`${WORKER_BASE_URL}/api/admin/bulkDeleteFiles?appId=${appId}&deleteType=messages_only`, {
      method: 'DELETE',
      headers: { "Authorization": `Bearer ${idToken}` }
    });
    const data = await res.json();
    if (data.success) {
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> メッセージ削除中...';
      const msgDeleted = await cleanupFirestoreMessages();
      alertMessage(`削除完了: KV ${data.kvDeleted} ファイル、メッセージ ${msgDeleted} 件`, 'success');
      loadStorageStats();
    } else {
      alertMessage('削除に失敗しました: ' + data.error, 'error');
    }
  } catch (e) {
    console.error(e);
    alertMessage('通信エラーが発生しました', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-file-image"></i> 添付ファイルのみを一括削除';
  }
});

document.getElementById('bulkDeleteAllFilesBtn').addEventListener('click', async () => {
  const first = await showCustomConfirm('【警告】アイコンやスタンプも含めた全ファイルを完全に削除しますか？', '削除する', 'キャンセル', 'この操作は取り消せません。');
  if (!first) return;
  const second = await showCustomConfirm('本当によろしいですか？', '全て削除', 'キャンセル', 'ユーザーアイコンやサーバーアイコン等も無効になります。');
  if (!second) return;
  const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  if (!idToken) return;

  const btn = document.getElementById('bulkDeleteAllFilesBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 削除中...';
  try {
    const res = await fetch(`${WORKER_BASE_URL}/api/admin/bulkDeleteFiles?appId=${appId}&deleteType=all_danger`, {
      method: 'DELETE',
      headers: { "Authorization": `Bearer ${idToken}` }
    });
    const data = await res.json();
    if (data.success) {
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> メッセージ削除中...';
      const msgDeleted = await cleanupFirestoreMessages();
      alertMessage(`削除完了: KV ${data.kvDeleted} ファイル、メッセージ ${msgDeleted} 件`, 'success');
      loadStorageStats();
    } else {
      alertMessage('削除に失敗しました: ' + data.error, 'error');
    }
  } catch (e) {
    console.error(e);
    alertMessage('通信エラーが発生しました', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-skull-crossbones"></i> 全ファイルを一括削除 (危険)';
  }
});

addAllowedEmailButton.addEventListener("click", async () => {
  const email = newAllowedEmailInput.value.trim();
  if (!email) return;
  adminMessage.textContent = "追加中...";
  try {
    const ref = doc(db, `artifacts/${appId}/allowedEmails`, email);
    const snap = await getDoc(ref);
    if (snap.exists()) { adminMessage.textContent = "すでに追加されています。"; return; }

    await setDoc(ref, {
      email: email,
      addedBy: auth.currentUser.uid,
      addedAt: serverTimestamp()
    });

    await setDoc(doc(db, `artifacts/${appId}/settings`, "allowedEmailsConfig"), { active: true }, { merge: true });

    newAllowedEmailInput.value = "";
    adminMessage.textContent = "追加しました。";
  } catch (e) {
    console.error(e);
    adminMessage.textContent = "エラーが発生しました。";
  }
});

async function removeAllowedEmail(email) {
  if (!await showCustomConfirm(`「${email}」を許可リストから削除しますか？`, "削除")) return;
  adminMessage.textContent = "削除中...";
  try {
    const ref = doc(db, `artifacts/${appId}/allowedEmails`, email);
    await deleteDoc(ref);
    adminMessage.textContent = "削除しました。";
  } catch (e) {
    console.error(e);
    adminMessage.textContent = "エラーが発生しました。";
  }
}

// 管理者リスト追加
addAdminEmailButton.addEventListener("click", async () => {
  const email = newAdminEmailInput.value.trim();
  if (!email) return;
  adminMessage.textContent = "追加中...";
  try {
    const ref = doc(db, `artifacts/${appId}/settings`, "adminList");
    const snap = await getDoc(ref);
    const emails = snap.exists() ? snap.data().emails || [] : [];
    if (emails.includes(email)) { adminMessage.textContent = "すでに管理者です。"; return; }
    emails.push(email);
    await setDoc(ref, { emails }, { merge: true });
    newAdminEmailInput.value = "";
    renderAdminEmails(emails);
    adminMessage.textContent = "追加しました。";
  } catch (e) {
    console.error(e);
    adminMessage.textContent = "エラーが発生しました。";
  }
});

async function removeAdminEmail(email) {
  if (email === userAuthEmail) { adminMessage.textContent = "自分自身は削除できません。"; return; }
  if (!await showCustomConfirm(`「${email}」を管理者から削除しますか？`, "削除")) return;
  adminMessage.textContent = "削除中...";
  try {
    const ref = doc(db, `artifacts/${appId}/settings`, "adminList");
    await updateDoc(ref, { emails: arrayRemove(email) });
    const snap = await getDoc(ref);
    renderAdminEmails(snap.exists() ? snap.data().emails || [] : []);
    adminMessage.textContent = "削除しました。";
  } catch (e) {
    console.error(e);
    adminMessage.textContent = "エラーが発生しました。";
  }
}

// リスト管理者の render / add / remove
function renderListAdminEmails(emails) {
  listAdminEmailsList.innerHTML = "";
  if (emails.length === 0) {
    const empty = document.createElement("p");
    empty.className = "text-sm text-gray-400 text-center py-4";
    empty.textContent = "リスト管理者はいません";
    listAdminEmailsList.appendChild(empty);
    return;
  }
  emails.forEach(e => {
    listAdminEmailsList.appendChild(makeEmailListItem(e, false, () => removeListAdminEmail(e)));
  });
}

addListAdminEmailButton.addEventListener("click", async () => {
  const email = newListAdminEmailInput.value.trim();
  if (!email) return;
  adminMessage.textContent = "追加中...";
  try {
    const ref = doc(db, `artifacts/${appId}/settings`, "listAdminList");
    const snap = await getDoc(ref);
    const emails = snap.exists() ? snap.data().emails || [] : [];
    if (emails.includes(email)) { adminMessage.textContent = "すでにリスト管理者です。"; return; }
    emails.push(email);
    await setDoc(ref, { emails }, { merge: true });
    newListAdminEmailInput.value = "";
    renderListAdminEmails(emails);
    adminMessage.textContent = "追加しました。";
  } catch (e) {
    console.error(e);
    adminMessage.textContent = "エラーが発生しました。";
  }
});

async function removeListAdminEmail(email) {
  if (!await showCustomConfirm(`「${email}」をリスト管理者から削除しますか？`, "削除")) return;
  adminMessage.textContent = "削除中...";
  try {
    const ref = doc(db, `artifacts/${appId}/settings`, "listAdminList");
    await updateDoc(ref, { emails: arrayRemove(email) });
    const snap = await getDoc(ref);
    renderListAdminEmails(snap.exists() ? snap.data().emails || [] : []);
    adminMessage.textContent = "削除しました。";
  } catch (e) {
    console.error(e);
    adminMessage.textContent = "エラーが発生しました。";
  }
}

// ★ ショートカットから呼ばれるフォーカス関数
window.focusMessageInput = function () {
  if (currentRoomId) {
    messageInput.focus();
  } else {
    // ルームを開いていない場合は検索にフォーカス
    if (searchContainer.classList.contains("hidden")) {
      toggleSearchButton.click();
    } else {
      searchInput.focus();
    }
  }
};

// ============ Discord-style settings tab ============
window.switchDiscordSettingsTab = function (tab) {
  document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.settings-content-section').forEach(s => s.classList.remove('active'));

  const navBtnId = tab === 'admin' ? 'openAdminModalButton' : 'snav-' + tab;
  const nb = document.getElementById(navBtnId);
  if (nb) nb.classList.add('active');

  const smap = { profile: 'profileSection', settings: 'settingsSection', admin: 'adminNavSection', storage: 'storageSection', reports: 'reportsSection', appinfo: 'appinfoSection', admintools: 'admintoolsSection' };
  if (tab === 'appinfo') {
    const verEl = document.getElementById('appInfoVersion');
    if (verEl) {
      if (_appVersion) {
        verEl.textContent = 'v' + _appVersion;
      } else {
        verEl.textContent = '読込中…';
        fetch('/version.json', { cache: 'default' })
          .then(r => r.json())
          .then(d => { verEl.textContent = 'v' + (d.version || '—'); _appVersion = d.version; })
          .catch(() => { verEl.textContent = '—'; });
      }
    }
    updateE2EEStatusUI();
    updateLayoutDebugUI();
    if (typeof updateForceOverrideUI === 'function') updateForceOverrideUI();
    if (typeof fetchGitHubReleasesHistory === 'function') fetchGitHubReleasesHistory('settingsPastVersionsContainer');
  }
  const sec = document.getElementById(smap[tab] || 'profileSection');
  if (sec) sec.classList.add('active');
  if (tab === 'admin') {
    const container = document.getElementById('pcAdminContainer');
    const shared = document.getElementById('adminPanelSharedContent');
    if (container && shared) {
      container.appendChild(shared);
      shared.classList.remove('hidden');
    }
  }
  if (tab === 'storage') {
    const container = document.getElementById('pcStorageContainer');
    const shared = document.getElementById('storageSharedContent');
    if (container && shared) {
      container.appendChild(shared);
      shared.classList.remove('hidden');
    }
    if (typeof loadStorageStats === 'function') loadStorageStats();
  }
  if (tab === 'reports') {
    const container = document.getElementById('pcReportsContainer');
    const shared = document.getElementById('reportsSharedContent');
    if (container && shared) {
      container.appendChild(shared);
      shared.classList.remove('hidden');
    }
    if (typeof loadAdminFeedbacks === 'function') loadAdminFeedbacks();
  }
};

function switchSettingsTab(tab) { switchDiscordSettingsTab(tab === 'settings' ? 'settings' : 'profile'); }

function updateSettingsSidebar() {
  const sa = document.getElementById('sidebarAvatar');
  const sn = document.getElementById('sidebarName');
  if (!sa || !sn) return;
  sn.textContent = userNickname || '';
  __setAvatarImg(sa, userAvatarUrl, userNickname);
}

// ============ Mobile Bottom Nav ============
if (window.matchMedia('(max-width: 768px)').matches) {
  document.body.classList.add('has-mobile-nav');
  // ナビを .container の最下子要素として移動（position:fixed をやめ、自然なflexで配置）
  try {
    const _mnav = document.getElementById('mobileBottomNav');
    const _cont = document.querySelector('.container');
    if (_mnav && _cont && _mnav.parentElement !== _cont) {
      _cont.appendChild(_mnav);
    }
  } catch (_) { }
}

// ボトムナビ高さは :root の --mnav-total (= --mnav-h 44px + --mnav-safe) で一元管理。
// --mnav-safe = min(env(safe-area-inset-bottom), 10px) なので iPhone の34px全量ではなく
// 最大10pxだけホームインジケータ用に確保し、棒の無い端末では0になる。
// position:fixed;inset:0 のコンテナがviewport全体を覆うので body背景漏れも発生しない。

window.switchMobileTab = function (tab) {
  document.querySelectorAll('.mobile-nav-tab').forEach(t => t.classList.remove('active'));
  const tb = document.getElementById('mobileTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (tb) tb.classList.add('active');
  document.getElementById('mobileProfileScreen').classList.remove('active');
  document.getElementById('mobileNotifScreen').classList.remove('active');
  if (tab === 'notif') { document.getElementById('mobileNotifScreen').classList.add('active'); updateGlobalNotifUI(); requestScanAllUnread(); }
  else if (tab === 'you') { updateMobileProfileScreen(); document.getElementById('mobileProfileScreen').classList.add('active'); }
};


let _scanAllUnreadTimer = null;
function requestScanAllUnread() {
  if (_scanAllUnreadTimer) clearTimeout(_scanAllUnreadTimer);
  _scanAllUnreadTimer = setTimeout(() => {
    if (_scanUnreadBusy) {
      requestScanAllUnread();
      return;
    }
    scanAllUnreadAndRender();
  }, 500);
}

window.openNotifModal = function () {
  const pm = document.getElementById('pcNotifModal');
  pm.style.display = pm.style.display === 'none' ? 'flex' : 'none';
  if (pm.style.display !== 'none') requestScanAllUnread();
};

window.__globalRoomsCache = window.__globalRoomsCache || {};

function updateGlobalNotifUI() {
  try {
    let items = JSON.parse(localStorage.getItem('covo_global_items') || '[]');
    items = items.filter(it => it.serverId !== currentServerId);
    Object.keys(unreadCounts).forEach(rid => {
      if (rid === currentRoomId) {
        unreadCounts[rid] = 0;
        const badge = document.getElementById(`unread-badge-${rid}`);
        if (badge) badge.style.display = 'none';
      } else if (unreadCounts[rid] > 0) {
        items.push({
          serverId: currentServerId,
          serverName: currentServerData?.name || currentServerId,
          roomId: rid,
          roomName: roomNames[rid] || rid,
          lastAt: Date.now()
        });
      }
    });
    localStorage.setItem('covo_global_items', JSON.stringify(items));
    renderNotifList(items);

    if (isTauri && window.__TAURI__?.core?.invoke) {
      window.__TAURI__.core.invoke('set_badge', { hasUnread: items.length > 0 }).catch(() => { });
    }
  } catch (e) { }
  if (typeof updateServerCardDots === 'function') updateServerCardDots();
  if (typeof renderDiscordServerNav === 'function') renderDiscordServerNav();
}
window.goToRoom = function (rid) {
  const pModal = document.getElementById('pcNotifModal');
  if (pModal) pModal.style.display = 'none';
  switchMobileTab('home');
  const rItem = document.getElementById('room-item-' + rid);
  if (rItem) rItem.click();
};

// 全参加サーバーを横断して未読ルームを集計し、通知タブ(スマホ/PC)に一覧表示する。
// DBへのgetDocsを完全撤廃し、window.__globalRoomsCacheのリアルタイムオンメモリーデータを参照。
let _scanUnreadBusy = false;
async function scanAllUnreadAndRender() {
  if (_scanUnreadBusy || !userId) return;
  _scanUnreadBusy = true;
  try {
    const rm = (() => { try { return JSON.parse(localStorage.getItem('covo_last_read') || '{}'); } catch (e) { return {}; } })();
    let servers = (allServersCache && allServersCache.length)
      ? allServersCache.filter(s => (s.joinedUsers || []).includes(userId))
      : null;
    if (!servers) {
      const snap = await getDocs(query(collection(db, `artifacts/${appId}/servers`), where("joinedUsers", "array-contains", userId)));
      servers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const items = JSON.parse(localStorage.getItem('covo_global_items') || '[]').filter(it => it.serverId === currentServerId);

    for (const sv of servers) {
      if (sv.id === currentServerId) continue;

      let roomsData = window.__globalRoomsCache[sv.id];
      if (!roomsData) {
        // キャッシュが未登録の場合のみ初期1回取得し、以後はオンメモリ参照
        try {
          const roomsSnap = await getDocs(collection(db, `artifacts/${appId}/servers/${sv.id}/rooms`));
          roomsData = {};
          roomsSnap.forEach(rd => { roomsData[rd.id] = rd.data(); });
          window.__globalRoomsCache[sv.id] = roomsData;
        } catch (e) { continue; }
      }

      Object.keys(roomsData).forEach(rmId => {
        const room = roomsData[rmId];
        const lastAt = typeof room.lastMessageAt === 'number' ? room.lastMessageAt : (room.lastMessageAt?.toMillis?.() || (room.lastMessageAt?.seconds ? room.lastMessageAt.seconds * 1000 : 0));
        if (!lastAt) return;
        const lastRead = rm[rmId] || 0;
        const bySelf = room.lastMessageSender && room.lastMessageSender === userId;
        const isOpen = (sv.id === currentServerId && rmId === currentRoomId && document.hasFocus());
        if (lastAt > lastRead && !bySelf && !isOpen) {
          items.push({ serverId: sv.id, serverName: sv.name || sv.id, roomId: rmId, roomName: room.name || rmId, lastAt });
        }
      });
    }
    items.sort((a, b) => b.lastAt - a.lastAt);
    localStorage.setItem('covo_global_items', JSON.stringify(items));
    renderNotifList(items);

    if (isTauri && window.__TAURI__?.core?.invoke) {
      window.__TAURI__.core.invoke('set_badge', { hasUnread: items.length > 0 }).catch(() => { });
    }
  } catch (e) {
    console.warn('[Notif] 未読スキャン失敗:', e);
  } finally {
    _scanUnreadBusy = false;
  }
}

function renderNotifList(items) {
  let html = '';
  items.forEach(it => {
    const sName = escapeHtml(it.serverName);
    const rName = escapeHtml(it.roomName);
    html += `<div class="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:shadow-md transition-shadow group" onclick="goToServerRoom('${it.serverId}','${it.roomId}')">
           <div class="flex items-center gap-2 mb-1">
             <div class="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[10px] text-gray-500 font-bold flex-shrink-0">${sName.charAt(0).toUpperCase()}</div>
             <div class="text-xs text-gray-500 dark:text-gray-400 font-medium truncate flex-1">${sName}</div>
           </div>
           <div class="text-sm font-bold text-gray-900 dark:text-gray-100"># ${rName}</div>
           <div class="flex justify-between items-center mt-2">
             <div class="text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">未読メッセージ</div>
             <div class="text-xs font-bold text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">開く &rarr;</div>
           </div>
        </div>`;
  });
  const count = items.length;
  const mList = document.getElementById('mobileNotifList');
  const pList = document.getElementById('pcNotifList');
  if (mList) mList.innerHTML = html;
  if (pList) pList.innerHTML = html;
  const me = document.getElementById('mobileNotifEmpty');
  const pe = document.getElementById('pcNotifEmpty');
  if (me) me.style.display = count > 0 ? 'none' : 'block';
  if (pe) pe.style.display = count > 0 ? 'none' : 'block';
  // 通知タブのドット
  const mobileNotifTab = document.getElementById('mobileTabNotif');
  if (mobileNotifTab) {
    let nb = mobileNotifTab.querySelector('.mobile-notif-dot');
    if (count > 0) {
      if (!nb) { nb = document.createElement('span'); nb.className = 'mobile-notif-dot'; mobileNotifTab.appendChild(nb); }
      nb.style.display = 'block';
    } else if (nb) { nb.style.display = 'none'; }
  }
  const badge = document.getElementById('globalUnreadBadge');
  if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
  const headerBadges = document.querySelectorAll('.header-notif-badge');
  headerBadges.forEach(b => { b.style.display = count > 0 ? 'block' : 'none'; });
  if (isTauri && window.__TAURI__?.core?.invoke) {
    window.__TAURI__.core.invoke('set_badge', { hasUnread: count > 0 }).catch(console.error);
    document.title = 'Covo';
  } else {
    document.title = count > 0 ? `(新着あり) Covo` : 'Covo';
  }
  if ('setAppBadge' in navigator) {
    if (count > 0) navigator.setAppBadge(count).catch(e => console.warn('Badge error:', e));
    else navigator.clearAppBadge().catch(e => console.warn('Badge clear error:', e));
  }
  if (typeof updateServerCardDots === 'function') updateServerCardDots();
}

// 他サーバーのルームへ移動する（通知一覧から）
window.goToServerRoom = async function (serverId, roomId) {
  const pModal = document.getElementById('pcNotifModal');
  if (pModal) pModal.style.display = 'none';
  try {
    if (serverId && serverId !== currentServerId && typeof enterServer === 'function') {
      // サーバーデータを用意（キャッシュ優先、無ければ取得）
      let sv = (allServersCache || []).find(s => s.id === serverId);
      if (!sv) {
        const sd = await getDoc(doc(db, `artifacts/${appId}/servers`, serverId));
        if (sd.exists()) sv = { id: serverId, ...sd.data() };
      }
      if (sv) {
        await enterServer(serverId, sv);
        switchMobileTab('home');
        setTimeout(() => { const ri = document.getElementById('room-item-' + roomId); if (ri) ri.click(); }, 700);
        return;
      }
    }
  } catch (e) { console.warn('[Notif] サーバー移動失敗:', e); }
  // 同じサーバー内（またはフォールバック）
  switchMobileTab('home');
  const rItem = document.getElementById('room-item-' + roomId);
  if (rItem) rItem.click();
};

window.openMobileDetail = function (type) {
  const m = { profile: 'mobileDetailProfile', notif: 'mobileDetailNotif', admin: 'mobileDetailAdmin', storage: 'mobileDetailStorage', reports: 'mobileDetailReports', appinfo: 'mobileDetailAppInfo', admintools: 'mobileDetailAdminTools' };
  const el = document.getElementById(m[type]);
  if (el) {
    if (type === 'admin') {
      const container = document.getElementById('mobileAdminContainer');
      const shared = document.getElementById('adminPanelSharedContent');
      if (container && shared) {
        container.appendChild(shared);
        shared.classList.remove('hidden');
      }
    }
    if (type === 'storage') {
      const container = document.getElementById('mobileStorageContainer');
      const shared = document.getElementById('storageSharedContent');
      if (container && shared) {
        container.appendChild(shared);
        shared.classList.remove('hidden');
      }
      if (typeof loadStorageStats === 'function') loadStorageStats();
    }
    if (type === 'reports') {
      const container = document.getElementById('mobileReportsContainer');
      const shared = document.getElementById('reportsSharedContent');
      if (container && shared) {
        container.appendChild(shared);
        shared.classList.remove('hidden');
      }
      if (typeof loadAdminFeedbacks === 'function') loadAdminFeedbacks();
    }
    if (type === 'appinfo') {
      const verEl = document.getElementById('mobileAppInfoVersion');
      if (verEl) {
        if (_appVersion) {
          verEl.textContent = _appVersion;
        } else {
          fetch('/version.json', { cache: 'default' })
            .then(r => r.json())
            .then(d => {
              _appVersion = d.version || null;
              verEl.textContent = _appVersion || '—';
            })
            .catch(() => { verEl.textContent = '取得失敗'; });
        }
      }
      // スマホUI側のE2EE状態・レイアウト診断も更新
      updateE2EEStatusUI();
      updateLayoutDebugUI();
    }
    el.classList.add('active');
  }
};

window.closeMobileDetail = function (id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('closing');
    setTimeout(() => {
      el.classList.remove('active', 'closing');
    }, 200); // アニメーション時間に合わせて待機
  }
};

function updateMobileProfileScreen() {
  const ne = document.getElementById('mobileProfileName');
  const ae = document.getElementById('mobileProfileAvatar');
  const at = document.getElementById('mobileAvatarText');
  const ap = document.getElementById('mobileAvatarPreview');
  const ni = document.getElementById('mobileNicknameInput');
  if (ne) ne.textContent = userNickname || '';
  if (ae) __setAvatarImg(ae, userAvatarUrl, userNickname);
  if (at) at.textContent = (userNickname || '?').charAt(0).toUpperCase();
  if (ap) {
    if (isUsableAvatarUrl(userAvatarUrl)) {
      const _u = userAvatarUrl;
      try { ap.referrerPolicy = 'no-referrer'; } catch (_) { }
      try { ap.decoding = 'async'; } catch (_) { }
      ap.onerror = function () {
        ap.style.display = 'none';
      };
      ap.src = userAvatarUrl;
      ap.style.display = '';
    } else {
      ap.style.display = 'none';
    }
  }
  if (ni) ni.value = userNickname || '';
  if (isAdmin || isListAdmin) { const as2 = document.getElementById('mobileAdminRowSection'); if (as2) as2.style.display = ''; }
}

window.mobileProfileSave = async function () {
  const inp = document.getElementById('mobileNicknameInput');
  const msg = document.getElementById('mobileSettingsMessage');
  if (!inp || !inp.value.trim()) return;
  const pcIn = document.getElementById('settingsNicknameInput');
  if (pcIn) pcIn.value = inp.value.trim();
  document.getElementById('saveSettingsButton').click();
  if (msg) { msg.textContent = '保存しました'; msg.style.color = '#059669'; setTimeout(() => { msg.textContent = ''; }, 2000); }
};

const atm = document.getElementById('avatarUploadTriggerMobile');
if (atm) atm.addEventListener('click', () => document.getElementById('avatarUploadInput').click());

const tnsm = document.getElementById('toggleNotifSoundMobile');
const tnbm = document.getElementById('toggleBrowserNotifMobile');
const tnsp = document.getElementById('toggleNotifSound');
const tnbp = document.getElementById('toggleBrowserNotif');
if (tnsm && tnsp) { tnsm.checked = tnsp.checked; tnsm.addEventListener('change', () => { tnsp.checked = tnsm.checked; tnsp.dispatchEvent(new Event('change')); }); }
if (tnbm && tnbp) { tnbm.checked = tnbp.checked; tnbm.addEventListener('change', () => { tnbp.checked = tnbm.checked; tnbp.dispatchEvent(new Event('change')); }); }

// serverListUserBtn on mobile → go to "you" tab
document.getElementById('serverListUserBtn')?.addEventListener('click', (e) => {
  if (window.matchMedia('(max-width: 768px)').matches) { e.stopPropagation(); switchMobileTab('you'); }
}, true);

// ============ Server View Toggle ============
const viewToggleBtn = document.getElementById('viewToggleBtn');
const serverGridEl = document.getElementById('serverGrid');
let currentServerView = localStorage.getItem('covo_server_view') || 'grid';
function applyServerView(v) {
  if (v === 'list') { serverGridEl.classList.add('list-view'); viewToggleBtn.innerHTML = '<i class="fas fa-th"></i>'; viewToggleBtn.title = 'グリッド表示'; }
  else { serverGridEl.classList.remove('list-view'); viewToggleBtn.innerHTML = '<i class="fas fa-list"></i>'; viewToggleBtn.title = 'リスト表示'; }
}
if (viewToggleBtn && serverGridEl) {
  applyServerView(currentServerView);
  viewToggleBtn.addEventListener('click', () => { currentServerView = currentServerView === 'grid' ? 'list' : 'grid'; localStorage.setItem('covo_server_view', currentServerView); applyServerView(currentServerView); });
}


let pendingAvatarUrl = null;
async function startPresenceSystem() {
  _beaconSent = false;
  refreshCachedIdToken();
  if (_idTokenRefreshTimer) clearInterval(_idTokenRefreshTimer);
  _idTokenRefreshTimer = setInterval(refreshCachedIdToken, 50 * 60 * 1000);

  // RTDBの接続状態を監視し、接続・再接続のたびにonDisconnectの再設定とオンライン状態の送信を行う
  try {
    const { ref, onDisconnect: rtdbOnDisconnect, serverTimestamp, onValue } =
      await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
    const rtdb = await _getOrInitRTDB();

    const connectedRef = ref(rtdb, '.info/connected');
    onValue(connectedRef, async (snap) => {
      if (snap.val() === true) {
        _rtdbStatusRef = ref(rtdb, `status/${userId}`);
        _rtdbOnDisconnect = rtdbOnDisconnect(_rtdbStatusRef);
        // 接続が切れたらFirebaseサーバーが自動でofflineに書く（iOS強制終了・ネット切断も対応）
        await _rtdbOnDisconnect.set({
          state: 'offline',
          last_changed: serverTimestamp(),
          nickname: userNickname,
          avatarUrl: userAvatarUrl || null
        });
        console.log('🔌 [通信状態] サーバーとのリアルタイム接続が確立されました');

        // 接続直後は強制的にステータスを再送信する（バックグラウンド復帰時は離席中にする）
        _lastReportedStatusStr = null;
        const currentState = document.visibilityState === 'hidden' ? 'away' : 'online';
        await updateUserStatus(currentState);
        if (currentState === 'away') startOfflineTimer();
      }
    });
  } catch (e) {
    console.warn('[RTDB] presence setup failed:', e);
  }

  resetAwayTimer();
  // startHeartbeat() はRTDB onDisconnect経由のため不要
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("beforeunload", handlePageClose);
  window.addEventListener("pagehide", handlePageClose);
  window.addEventListener("freeze", handlePageClose);
  window.addEventListener("pageshow", handlePageShow);
  window.addEventListener("focus", handleWindowFocus);
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("online", _handleNetworkOnline);
  window.addEventListener("offline", _handleNetworkOffline);
  subscribeToUserStatus();
  clearAppBadgeFull();

  if (memberListRefreshInterval) clearInterval(memberListRefreshInterval);
  // リアルタイムリスナーで変更管理されているため、不要な定期的再描画・ポーリングを撤廃
  renderMembersList(cachedUsers);
}

const avatarUploadTrigger = document.getElementById("avatarUploadTrigger");
const avatarUploadInput = document.getElementById("avatarUploadInput");
const settingsAvatarPreview = document.getElementById("settingsAvatarPreview");

avatarUploadTrigger.addEventListener("click", () => avatarUploadInput.click());

// アバター調整モーダル
const avatarCropModal = document.getElementById('avatarCropModal');
const avatarCropCanvas = document.getElementById('avatarCropCanvas');
const avatarZoomSlider = document.getElementById('avatarZoomSlider');
// Retina/HiDPI対応: devicePixelRatioでcanvas解像度を上げる
const CROP_CSS_SIZE = 260;
const CROP_DPR = Math.min(window.devicePixelRatio || 1, 3);
avatarCropCanvas.width = CROP_CSS_SIZE * CROP_DPR;
avatarCropCanvas.height = CROP_CSS_SIZE * CROP_DPR;
avatarCropCanvas.style.width = CROP_CSS_SIZE + 'px';
avatarCropCanvas.style.height = CROP_CSS_SIZE + 'px';
const cropCtx = avatarCropCanvas.getContext('2d');
cropCtx.scale(CROP_DPR, CROP_DPR);
const CROP_SIZE = CROP_CSS_SIZE;

let cropImage = null, cropOffsetX = 0, cropOffsetY = 0, cropScale = 1, cropMinScale = 1;
let cropIsDragging = false, cropDragStartX = 0, cropDragStartY = 0;
let cropDragStartOffsetX = 0, cropDragStartOffsetY = 0;

function drawCropPreview() {
  cropCtx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
  cropCtx.save();
  cropCtx.beginPath();
  cropCtx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2, 0, Math.PI * 2);
  cropCtx.clip();
  cropCtx.drawImage(cropImage, cropOffsetX, cropOffsetY, cropImage.naturalWidth * cropScale, cropImage.naturalHeight * cropScale);
  cropCtx.restore();
}

function clampCropOffset() {
  const drawW = cropImage.naturalWidth * cropScale;
  const drawH = cropImage.naturalHeight * cropScale;
  // 円を常に画像で埋めるよう、オフセットを制限
  cropOffsetX = Math.min(0, Math.max(CROP_SIZE - drawW, cropOffsetX));
  cropOffsetY = Math.min(0, Math.max(CROP_SIZE - drawH, cropOffsetY));
}

function closeCropModal() {
  avatarCropModal.classList.add('hidden');
  cropImage = null;
  avatarUploadInput.value = '';
}

function openAvatarCropModal(objectUrl) {
  cropImage = new Image();
  cropImage.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    cropImage = null;
    alertMessage("画像の読み込みに失敗しました", "error");
  };
  cropImage.onload = () => {
    URL.revokeObjectURL(objectUrl);
    const scaleX = CROP_SIZE / cropImage.naturalWidth;
    const scaleY = CROP_SIZE / cropImage.naturalHeight;
    // 円を完全に埋めるスケールを最小値に設定（空白が出ない）
    cropMinScale = Math.max(scaleX, scaleY);
    cropScale = cropMinScale;
    avatarZoomSlider.min = cropMinScale;
    avatarZoomSlider.max = cropMinScale * 4;
    avatarZoomSlider.value = cropScale;
    cropOffsetX = (CROP_SIZE - cropImage.naturalWidth * cropScale) / 2;
    cropOffsetY = (CROP_SIZE - cropImage.naturalHeight * cropScale) / 2;
    document.getElementById('avatarUploadProgress').classList.add('hidden');
    avatarCropModal.classList.remove('hidden');
    drawCropPreview();
  };
  cropImage.src = objectUrl;
}

avatarCropCanvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  cropIsDragging = true;
  cropDragStartX = e.clientX; cropDragStartY = e.clientY;
  cropDragStartOffsetX = cropOffsetX; cropDragStartOffsetY = cropOffsetY;
  avatarCropCanvas.style.cursor = 'grabbing';
});
document.addEventListener('mousemove', (e) => {
  if (!cropIsDragging || !cropImage) return;
  cropOffsetX = cropDragStartOffsetX + (e.clientX - cropDragStartX);
  cropOffsetY = cropDragStartOffsetY + (e.clientY - cropDragStartY);
  clampCropOffset(); drawCropPreview();
});
document.addEventListener('mouseup', () => {
  if (cropIsDragging) { cropIsDragging = false; avatarCropCanvas.style.cursor = 'grab'; }
});

let lastTouchX = 0, lastTouchY = 0, lastPinchDist = 0;
avatarCropCanvas.addEventListener('touchstart', (e) => {
  e.preventDefault(); // iOSのスクロールを防ぐ
  if (e.touches.length === 1) { lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY; }
  lastPinchDist = 0;
}, { passive: false });
avatarCropCanvas.addEventListener('touchmove', (e) => {
  e.preventDefault(); // iOSのページスクロールを防ぐ（passive:falseが必須）
  if (!cropImage) return;
  if (e.touches.length === 1) {
    cropOffsetX += e.touches[0].clientX - lastTouchX;
    cropOffsetY += e.touches[0].clientY - lastTouchY;
    lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
    clampCropOffset(); drawCropPreview();
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (lastPinchDist > 0) {
      const ratio = dist / lastPinchDist;
      const newScale = Math.max(parseFloat(avatarZoomSlider.min), Math.min(parseFloat(avatarZoomSlider.max), cropScale * ratio));
      const cx = CROP_SIZE / 2, cy = CROP_SIZE / 2;
      cropOffsetX = cx - (cx - cropOffsetX) * (newScale / cropScale);
      cropOffsetY = cy - (cy - cropOffsetY) * (newScale / cropScale);
      cropScale = newScale; avatarZoomSlider.value = cropScale;
      clampCropOffset(); drawCropPreview();
    }
    lastPinchDist = dist;
  }
}, { passive: false });
avatarCropCanvas.addEventListener('touchend', () => { lastPinchDist = 0; }, { passive: true });

avatarCropCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!cropImage) return;
  const delta = e.deltaY > 0 ? -0.05 : 0.05;
  const newScale = Math.max(parseFloat(avatarZoomSlider.min), Math.min(parseFloat(avatarZoomSlider.max), cropScale + delta * cropScale));
  const rect = avatarCropCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  cropOffsetX = mx - (mx - cropOffsetX) * (newScale / cropScale);
  cropOffsetY = my - (my - cropOffsetY) * (newScale / cropScale);
  cropScale = newScale; avatarZoomSlider.value = cropScale;
  clampCropOffset(); drawCropPreview();
}, { passive: false });

avatarZoomSlider.addEventListener('input', () => {
  if (!cropImage) return;
  const newScale = parseFloat(avatarZoomSlider.value);
  const cx = CROP_SIZE / 2, cy = CROP_SIZE / 2;
  cropOffsetX = cx - (cx - cropOffsetX) * (newScale / cropScale);
  cropOffsetY = cy - (cy - cropOffsetY) * (newScale / cropScale);
  cropScale = newScale; clampCropOffset(); drawCropPreview();
});

document.getElementById('avatarCropCancel').addEventListener('click', closeCropModal);

document.getElementById('avatarCropConfirm').addEventListener('click', async () => {
  if (!cropImage) return;
  // 解像度を 400→640 に上げ、高品質リサイズ＋JPEG品質0.92で鮮明に保存する
  // （Cloudflare はファイルをそのまま保存するだけなので、画質はここの設定で決まる）
  const OUTPUT = 640;
  const offscreen = document.createElement('canvas');
  offscreen.width = OUTPUT; offscreen.height = OUTPUT;
  const offCtx = offscreen.getContext('2d');
  offCtx.imageSmoothingEnabled = true;
  offCtx.imageSmoothingQuality = 'high';
  const sf = OUTPUT / CROP_SIZE;
  offCtx.beginPath();
  offCtx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2);
  offCtx.clip();
  offCtx.drawImage(cropImage, cropOffsetX * sf, cropOffsetY * sf, cropImage.naturalWidth * cropScale * sf, cropImage.naturalHeight * cropScale * sf);

  offscreen.toBlob(async (blob) => {
    if (!blob) { alertMessage("クロップに失敗しました", "error"); return; }
    const progressDiv = document.getElementById('avatarUploadProgress');
    const progressFill = document.getElementById('avatarUploadProgressFill');
    const progressText = document.getElementById('avatarUploadProgressText');
    const confirmBtn = document.getElementById('avatarCropConfirm');
    const cancelBtn = document.getElementById('avatarCropCancel');
    progressDiv.classList.remove('hidden');
    progressFill.style.width = '0%';
    confirmBtn.disabled = true; cancelBtn.disabled = true;
    try {
      const fileUrl = await uploadToExternalService(
        new File([blob], 'avatar.jpg', { type: 'image/jpeg' }),
        (pct) => { progressFill.style.width = pct + '%'; progressText.textContent = `アップロード中... ${pct}%`; },
        'simplechat/avatars'
      );
      pendingAvatarUrl = fileUrl;
      settingsAvatarPreview.src = fileUrl;
      settingsAvatarPreview.classList.remove("hidden");
      document.getElementById("resetAvatarButton").classList.remove("hidden");
      avatarCropModal.classList.add('hidden');
      cropImage = null;
      alertMessage("アイコンを設定しました", "success");
    } catch (err) {
      console.error(err);
      alertMessage("アップロードに失敗しました: " + err.message, "error");
    } finally {
      confirmBtn.disabled = false; cancelBtn.disabled = false;
    }
  }, 'image/jpeg', 0.95);
});

avatarUploadInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const objectUrl = URL.createObjectURL(file);
  openAvatarCropModal(objectUrl);
  avatarUploadInput.value = '';
});

// Settings Modal Logic
const resetAvatarButton = document.getElementById("resetAvatarButton");

function openSettingsModal(tab) {
  if (!userNickname) return;
  switchDiscordSettingsTab(tab === "settings" ? "settings" : "profile");
  settingsNicknameInput.value = userNickname;
  settingsAvatarText.textContent = userNickname.charAt(0).toUpperCase();
  pendingAvatarUrl = null;
  if (isUsableAvatarUrl(userAvatarUrl)) {
    const _u = userAvatarUrl;
    try { settingsAvatarPreview.referrerPolicy = 'no-referrer'; } catch (_) { }
    try { settingsAvatarPreview.decoding = 'async'; } catch (_) { }
    settingsAvatarPreview.dataset.retries = '0';
    settingsAvatarPreview.onerror = function () {
      const r = parseInt(settingsAvatarPreview.dataset.retries || '0', 10);
      if (r < 2) {
        settingsAvatarPreview.dataset.retries = String(r + 1);
        setTimeout(() => {
          try {
            const sep = _u.indexOf('?') >= 0 ? '&' : '?';
            settingsAvatarPreview.src = _u + sep + '_r=' + Date.now();
          } catch (_) { }
        }, 800 * (r + 1));
      } else {
        try { settingsAvatarPreview.classList.add('hidden'); } catch (_) { }
      }
    };
    settingsAvatarPreview.src = userAvatarUrl;
    settingsAvatarPreview.classList.remove("hidden");
    resetAvatarButton.classList.remove("hidden");
  } else {
    settingsAvatarPreview.classList.add("hidden");
    resetAvatarButton.classList.add("hidden");
  }
  settingsMessage.textContent = "";
  updateSettingsSidebar();
  openModal(settingsModal);
}

// モーダルをアニメーション付きで開くヘルパー
function openModal(overlayEl) {
  overlayEl.classList.remove("hidden");
  const box = overlayEl.querySelector(".modal-box");
  if (box) {
    box.classList.remove("modal-opening");
    void box.offsetWidth; // reflow でアニメーションをリセット
    box.classList.add("modal-opening");
  }
}

// サーバーリスト画面のユーザーアバターボタン
function updateServerListUserBtn() {
  const btn = document.getElementById("serverListUserBtn");
  if (!btn || !userNickname) return;
  btn.title = `${userNickname} — プロフィール・設定`;
  __setAvatarImg(btn, userAvatarUrl, userNickname, { className: 'w-full h-full rounded-full object-cover', style: 'border-radius:50%' });
}
document.getElementById("serverListUserBtn").addEventListener("click", () => {
  openSettingsModal("profile");
});

userPanel.addEventListener("click", (e) => {
  if (e.target.closest('#openSettingsBtn')) return;
  // スマホでは PC用設定モーダルが非表示なので、スマホUIの「あなた」画面を開く
  if (window.matchMedia('(max-width: 768px)').matches) { switchMobileTab('you'); return; }
  openSettingsModal("profile");
});

document.getElementById("openSettingsBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  // スマホでは PC用設定モーダルが非表示なので、スマホUIの「あなた」画面を開く
  if (window.matchMedia('(max-width: 768px)').matches) { switchMobileTab('you'); return; }
  openSettingsModal("settings");
});

// アイコンリセットボタン
resetAvatarButton.addEventListener("click", async () => {
  loadingOverlay.classList.remove("hidden");
  try {
    const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile`, "nicknameDoc");
    await updateDoc(userProfileRef, { avatarUrl: null });
    // ★ ルートのusersにも同期
    const userRef = doc(db, `artifacts/${appId}/users`, userId);
    await setDoc(userRef, { avatarUrl: null }, { merge: true }).catch(console.error);
    userAvatarUrl = null;
    pendingAvatarUrl = null;
    settingsAvatarPreview.classList.add("hidden");
    settingsAvatarText.textContent = userNickname.charAt(0).toUpperCase();
    resetAvatarButton.classList.add("hidden");
    updateUserPanelUI();
    await updateUserStatus(document.visibilityState === 'hidden' ? 'offline' : 'online');
    settingsMessage.textContent = "アイコンをリセットしました";
    settingsMessage.className = "text-center mt-2 text-sm text-gray-600";
  } catch (e) {
    console.error(e);
    settingsMessage.textContent = "リセットに失敗しました";
    settingsMessage.className = "text-center mt-2 text-sm text-red-600";
  } finally {
    loadingOverlay.classList.add("hidden");
  }
});

closeSettingsButton.addEventListener("click", () => {
  settingsModal.classList.add("hidden");
});

// ★ モーダルの背景クリックで閉じる処理
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) {
    settingsModal.classList.add("hidden");
    closeCropModal(); // 設定モーダルを閉じたらクロップモーダルも閉じる
  }
});

saveSettingsButton.addEventListener("click", async () => {
  const newName = settingsNicknameInput.value.trim();
  if (newName.length < 1 || newName.length > 20) {
    settingsMessage.textContent = "1〜20文字で入力してください。";
    settingsMessage.className = "text-center mt-2 text-sm text-red-600";
    return;
  }
  loadingOverlay.classList.remove("hidden");
  try {
    const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile`, "nicknameDoc");
    const updateData = { nickname: newName, createdAt: serverTimestamp() };
    if (pendingAvatarUrl) { updateData.avatarUrl = pendingAvatarUrl; }
    await setDoc(userProfileRef, updateData, { merge: true });

    // ★ ユーザー一覧・管理者画面用にルートのusersにも同期
    const userRef = doc(db, `artifacts/${appId}/users`, userId);
    await setDoc(userRef, {
      email: userAuthEmail,
      nickname: newName,
      avatarUrl: pendingAvatarUrl || userAvatarUrl || null
    }, { merge: true }).catch(console.error);

    userNickname = newName;
    if (pendingAvatarUrl) { userAvatarUrl = pendingAvatarUrl; }

    // ★ヘッダータイトルの更新
    headerTitle.textContent = `${userNickname}${isAdmin ? " (管理者)" : ""}`;
    updateUserPanelUI();

    await updateUserStatus(document.visibilityState === 'hidden' ? 'offline' : 'online');

    settingsMessage.textContent = "保存しました";
    settingsMessage.className = "text-center mt-2 text-sm text-gray-600";
    closeCropModal();
    setTimeout(() => settingsModal.classList.add("hidden"), 1000);
  } catch (e) {
    settingsMessage.textContent = "エラーが発生しました";
    settingsMessage.className = "text-center mt-2 text-sm text-red-600";
  } finally {
    loadingOverlay.classList.add("hidden");
  }
});

logoutButtonInModal.addEventListener("click", async () => {
  if (!await showCustomConfirm("本当にログアウトしますか？", "ログアウト", "キャンセル")) return;
  closeCropModal();
  settingsModal.classList.add("hidden");
  loadingOverlay.classList.remove("hidden");
  try {
    await updateUserStatus('offline');
    await signOut(auth);
  } catch (error) {
    console.error("Logout Error:", error);
  } finally {
    loadingOverlay.classList.add("hidden");
  }
});


setNicknameButton.addEventListener("click", async () => {
  const nickname = (nicknameInput.value || "").trim();
  if (nickname.length < 1 || nickname.length > 20) {
    nicknameMessage.textContent = "1〜20文字で入力してください。";
    return;
  }
  loadingOverlay.classList.remove("hidden");
  try {
    const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile`, "nicknameDoc");
    await setDoc(userProfileRef, { nickname: nickname, createdAt: serverTimestamp() });

    // ★ ユーザー一覧・管理者画面用にルートのusersにも同期
    const userRef = doc(db, `artifacts/${appId}/users`, userId);
    await setDoc(userRef, { email: userAuthEmail, nickname: nickname }, { merge: true }).catch(console.error);

    userNickname = nickname;

    // ★ヘッダータイトルの更新
    headerTitle.textContent = `${userNickname}${isAdmin ? " (管理者)" : ""}`;
    updateUserPanelUI();

    nicknameContainer.classList.add("hidden");
    appContainer.classList.remove("hidden");
    loadRooms();
    startPresenceSystem();
    // ★ initializeFCM() は onAuthStateChanged で既に呼ばれるためここからは削除
  } catch (error) {
    nicknameMessage.textContent = `エラー: ${error.message}`;
  } finally {
    loadingOverlay.classList.add("hidden");
  }
});

