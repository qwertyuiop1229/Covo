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
  deleteField,
  addDoc
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

// ================= SERVERS MODULE ================
// =========================================================================
// =========================================================================
// Server Features
// =========================================================================

const _invalidAvatars = new Set();

function isUsableAvatarUrl(url) {
  return !!url && url.indexOf('res.cloudinary.com') < 0 && !_invalidAvatars.has(url);
}

function __setAvatarImg(container, url, name, opts) {
  if (!container) return;
  opts = opts || {};
  const styleStr = opts.style || 'width:100%;height:100%;object-fit:cover;border-radius:50%';
  const className = opts.className || '';
  const initial = ((name || '?').charAt(0) || '?').toUpperCase();
  try { container.innerHTML = ''; } catch (_) { }
  // Cloudinary は廃止。旧Cloudinaryアイコンは表示せずデフォルト(イニシャル)に戻す。
  // ユーザーが新しくアイコンを設定すると Cloudflare(KV) に保存され、自然に移行する。
  if (!isUsableAvatarUrl(url)) { try { container.textContent = initial; } catch (_) { } return; }
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  img.loading = 'eager';
  img.referrerPolicy = 'no-referrer'; // CloudinaryのReferer制限を回避
  if (className) img.className = className;
  if (styleStr) img.style.cssText = styleStr;
  img.dataset.retries = '0';
  img.onerror = function () {
    const r = parseInt(img.dataset.retries || '0', 10);
    if (r < 2) {
      img.dataset.retries = String(r + 1);
      setTimeout(() => {
        try {
          const sep = url.indexOf('?') >= 0 ? '&' : '?';
          img.src = url + sep + '_r=' + Date.now();
        } catch (_) { }
      }, 800 * (r + 1));
    } else {
      _invalidAvatars.add(url);
      try { container.innerHTML = ''; container.textContent = initial; } catch (_) { }
    }
  };
  img.src = url;
  try { container.appendChild(img); } catch (_) { }
}

// HTMLエスケープ（XSS対策: innerHTML に埋め込む全ての文字列に適用する）

// PBKDF2 ハッシュ（SHA-256より総当たり耐性が大幅に高い）
async function hashPassword(password, serverId) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(serverId), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// サーバー一覧の表示
async function showServerList() {
  const serverListScreen = document.getElementById("serverListScreen");
  const serverGrid = document.getElementById("serverGrid");
  const empty = document.getElementById("serverListEmpty");

  updateServerListUserBtn();
  if (serverListUnsubscribe) { serverListUnsubscribe(); serverListUnsubscribe = null; }

  function appendServerCard(server, idx) {
    const card = document.createElement("div");
    card.className = "server-card anim-card";
    card.dataset.serverId = server.id;
    card.style.animationDelay = `${idx * 55}ms`;
    const isMine = server.serverAdmins && server.serverAdmins.includes(userId);
    const memberCount = Number.isFinite(server.memberCount) ? server.memberCount : (server.joinedUsers ? server.joinedUsers.length : 0);
    let hasUnread = false;
    try { const items = JSON.parse(localStorage.getItem('covo_global_items') || '[]'); hasUnread = items.some(it => it.serverId === server.id); } catch (e) { }
    const serverName = escapeHtml(server.name || server.id);
    const initial = (server.name || server.id).charAt(0).toUpperCase();
    // デフォルトアイコンの背景色を上品なCovoグレーに完全統一
    const bgColor = '#374151';
    const iconHtml = server.iconUrl ? `<img src="${escapeHtml(server.iconUrl)}" class="w-full h-full object-cover" />` : initial;

    card.innerHTML = `
            <div class="server-card-icon" style="background-color: ${server.iconUrl ? 'transparent' : bgColor}">${iconHtml}</div>
            <div class="server-card-info"><div class="server-card-name">${serverName}</div>
            <div class="server-card-meta"><i class="fas fa-users mr-1"></i>${memberCount} メンバー</div></div>
            ${isMine ? '<span class="server-card-admin-badge"><i class="fas fa-crown mr-1"></i>管理者</span>' : ''}
            ${isAdmin && !isMine && (server.joinedUsers || []).includes(userId) ? '<span class="server-card-admin-badge"><i class="fas fa-crown mr-1"></i>管理者</span>' : ''}
            ${hasUnread ? '<span class="server-card-unread-dot"></span>' : ''}
          `;
    let lpTimer, lpTriggered = false;
    card.addEventListener("click", () => { if (lpTriggered) { lpTriggered = false; return; } enterServer(server.id, server); });
    card.addEventListener("contextmenu", (e) => { e.preventDefault(); showServerContextMenu(server, e.clientX, e.clientY); });
    card.addEventListener("touchstart", (e) => {
      lpTriggered = false;
      lpTimer = setTimeout(() => {
        lpTriggered = true;
        const t = e.touches[0];
        showServerContextMenu(server, t.clientX, t.clientY);
      }, 300);
    }, { passive: true });
    card.addEventListener("touchend", () => clearTimeout(lpTimer), { passive: true });
    card.addEventListener("touchmove", () => clearTimeout(lpTimer), { passive: true });
    serverGrid.appendChild(card);
  }

  function appendSectionLabel(text) {
    const el = document.createElement("p");
    el.className = "server-section-label";
    el.textContent = text;
    serverGrid.appendChild(el);
  }

  window.renderServerList = function () {
    if (!allServersCache) return;
    if (document.body.classList.contains('discord-ui-mode')) {
      if (!currentServerId) {
        document.body.classList.add("discord-home-view");
        const appCont = document.getElementById("appContainer");
        if (appCont) appCont.classList.remove("hidden");
        const sls = document.getElementById("serverListScreen");
        if (sls) sls.classList.add("hidden");
      }
    }
    serverGrid.innerHTML = "";
    const servers = [...allServersCache];
    // 最近開いた順ソート
    try { const rm = JSON.parse(localStorage.getItem('covo_recent_servers') || '{}'); servers.sort((a, b) => (rm[b.id] || 0) - (rm[a.id] || 0)); } catch (e) { }

    if (!isAdmin) {
      if (servers.length === 0) {
        serverGrid.appendChild(Object.assign(document.createElement("div"), {
          className: "server-list-empty",
          style: "grid-column:1/-1",
          innerHTML: `<i class="fas fa-server" style="display:block;font-size:2.5rem;margin-bottom:1rem;color:#d1d5db"></i>
                  <p class="font-bold text-gray-500 mt-2">サーバーがありません</p>
                  <p class="text-sm mt-1">「参加」または「新規作成」からサーバーに参加しましょう</p>`
        }));
        return;
      }
      servers.forEach((s, i) => appendServerCard(s, i));
      return;
    }

    // 管理者：参加済み / 未参加 に分けて表示
    const joined = servers.filter(s => (s.joinedUsers || []).includes(userId));
    const notJoined = servers.filter(s => !(s.joinedUsers || []).includes(userId));

    if (joined.length === 0 && notJoined.length === 0) {
      serverGrid.appendChild(Object.assign(document.createElement("div"), {
        className: "server-list-empty",
        style: "grid-column:1/-1",
        innerHTML: `<i class="fas fa-server" style="display:block;font-size:2.5rem;margin-bottom:1rem;color:#d1d5db"></i>
                <p class="font-bold text-gray-500 mt-2">サーバーがありません</p>`
      }));
      if (typeof renderDiscordServerNav === 'function') renderDiscordServerNav();
      return;
    }

    if (joined.length > 0) {
      appendSectionLabel("参加済みのサーバー");
      joined.forEach((s, i) => appendServerCard(s, i));
    }
    if (notJoined.length > 0) {
      appendSectionLabel("未参加のサーバー");
      notJoined.forEach((s, i) => appendServerCard(s, joined.length + i));
    }
    if (typeof renderDiscordServerNav === 'function') renderDiscordServerNav();
  };



  // 管理者は全件取得、一般ユーザーは自分が参加しているサーバーのみをFirestore側でフィルタリング
  const serversQuery = isAdmin
    ? query(collection(db, `artifacts/${appId}/servers`))
    : query(collection(db, `artifacts/${appId}/servers`), where("joinedUsers", "array-contains", userId));

  serverListUnsubscribe = onSnapshot(serversQuery, (snapshot) => {
    const servers = [];
    snapshot.forEach(d => servers.push({ id: d.id, ...d.data() }));
    allServersCache = servers;
    window.renderServerList();

    // 初回ロード時、前回開いていたサーバーがあれば自動復帰 (Discordと同等のオートロード挙動)
    if (!window.hasAutoOpenedLastServer) {
      window.hasAutoOpenedLastServer = true;
      const lastServerId = localStorage.getItem('covo_last_opened_server');
      if (lastServerId) {
        const target = servers.find(s => s.id === lastServerId);
        if (target && (isAdmin || (target.joinedUsers || []).includes(userId))) {
          if (typeof enterServer === 'function') enterServer(lastServerId, target);
        }
      }
    }
  });
}

// サーバーに入る
async function enterServer(serverId, serverData) {
  if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
  if (unsubscribePinnedMessages) { unsubscribePinnedMessages(); unsubscribePinnedMessages = null; }
  if (readReceiptsUnsubscribe) { readReceiptsUnsubscribe(); readReceiptsUnsubscribe = null; }
  if (typingUnsubscribe) { typingUnsubscribe(); typingUnsubscribe = null; }
  currentServerId = serverId;
  currentServerData = serverData;

  // Self-heal RTDB membership via Worker to bypass strict RTDB rules
  if (serverData && (serverData.joinedUsers || []).includes(userId)) {
    try {
      auth.currentUser.getIdToken().then(idToken => {
        fetch(`${WORKER_BASE_URL}/api/syncRtdb`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serverId,
            userId,
            appId,
            idToken,
            rtdbUrl: typeof firebaseConfig !== 'undefined' ? firebaseConfig.databaseURL : undefined
          })
        }).catch(() => { });
      });
    } catch (e) { }
  }
  try {
    const rm = JSON.parse(localStorage.getItem('covo_recent_servers') || '{}');
    rm[serverId] = Date.now();
    localStorage.setItem('covo_recent_servers', JSON.stringify(rm));
    localStorage.setItem('covo_last_opened_server', serverId);
  } catch (e) { }
  // サーバーに入ったら未読フラグをクリア


  document.getElementById("serverListScreen").classList.add("hidden");
  appContainer.classList.remove("hidden");
  appContainer.style.animation = "fadeIn 0.2s ease both";
  if (document.body.classList.contains("discord-ui-mode")) {
    document.body.classList.remove("discord-home-view", "discord-dm-view", "discord-discover-view");
  }
  if (typeof renderDiscordServerNav === 'function') renderDiscordServerNav();

  // ニックネームヘッダーを表示
  const hdr = document.getElementById("globalAppHeader");
  const hdrTitle = document.getElementById("headerTitle");
  if (hdr) {
    hdrTitle.textContent = `ニックネーム：${userNickname || ""}${isAdmin ? "（管理者）" : ""}`;
    hdr.classList.add("server-mode");
  }

  // サーバーヘッダー更新
  document.getElementById("serverNameDisplay").textContent = serverData.name || serverId;
  const settingsBtn = document.getElementById("serverSettingsBtn");
  settingsBtn.classList.remove("hidden");

  // サーバー別ニックネームを読み込む（なければグローバルニックネームを使用）
  try {
    const profileSnap = await getDoc(doc(db, `artifacts/${appId}/servers/${serverId}/profiles`, userId));
    currentServerNickname = (profileSnap.exists() && profileSnap.data().nickname)
      ? profileSnap.data().nickname
      : null;
  } catch (e) { currentServerNickname = null; }

  // カスタムスタンプを読み込む
  if (typeof loadCurrentServerStamps === 'function') {
    loadCurrentServerStamps();
  }

  // ルームを読み込む
  loadServerRooms(serverId);
  if (localStorage.getItem("chatAppMembersCollapsed") !== "true") {
    membersSidebar.style.setProperty("display", "", "important");
    membersSidebar.classList.remove("hidden");
    membersSidebar.classList.add("md:flex");
  }
  // サーバーメンバーでメンバーリストを即時更新
  renderMembersList(cachedUsers);

  // サーバーに入室したタイミングで、対象メンバーを絞り込んでステータス監視を再設定
  subscribeToUserStatus();
}

// DM / フレンド画面を開く
window.openDmHomeView = function () {
  currentServerId = null;
  currentServerData = null;
  currentRoomId = null;
  currentServerNickname = null;
  if (typeof currentHomeViewMode !== 'undefined') currentHomeViewMode = 'dm';
  try { localStorage.removeItem('covo_last_opened_server'); } catch (e) { }

  if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
  if (unsubscribePinnedMessages) { unsubscribePinnedMessages(); unsubscribePinnedMessages = null; }
  if (readReceiptsUnsubscribe) { readReceiptsUnsubscribe(); readReceiptsUnsubscribe = null; }
  if (typingUnsubscribe) { typingUnsubscribe(); typingUnsubscribe = null; }
  if (loadServerRooms._unsub) { loadServerRooms._unsub(); loadServerRooms._unsub = null; }

  Object.values(unreadListeners).forEach(u => u());
  unreadListeners = {}; unreadCounts = {};

  const roomList = document.getElementById("roomList");
  if (roomList) roomList.innerHTML = "";
  clearMessagesDOM();
  const currentRoomHeader = document.getElementById("currentRoomHeader");
  if (currentRoomHeader) currentRoomHeader.classList.add("hidden");
  const messageInput = document.getElementById("messageInput");
  if (messageInput) messageInput.disabled = true;
  const sendMessageButton = document.getElementById("sendMessageButton");
  if (sendMessageButton) sendMessageButton.disabled = true;
  const membersSidebar = document.getElementById("membersSidebar");
  if (membersSidebar) membersSidebar.classList.add("hidden");

  document.body.classList.remove("in-chat-view", "discord-discover-view");
  document.body.classList.add("discord-home-view", "discord-dm-view");

  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.remove("mobile-hidden");
  const mobileBottomNav = document.getElementById("mobileBottomNav");
  if (mobileBottomNav) mobileBottomNav.style.display = "flex";

  const appContainer = document.getElementById("appContainer");
  if (appContainer) appContainer.classList.remove("hidden");
  const serverListScreen = document.getElementById("serverListScreen");
  if (serverListScreen) serverListScreen.classList.add("hidden");

  document.getElementById("globalAppHeader")?.classList.remove("server-mode");
  if (window.renderServerList) window.renderServerList();
  if (typeof renderDiscordServerNav === 'function') renderDiscordServerNav();
};

// 探索・発見画面を開く
window.openDiscoverView = function () {
  currentServerId = null;
  currentServerData = null;
  currentRoomId = null;
  currentServerNickname = null;
  if (typeof currentHomeViewMode !== 'undefined') currentHomeViewMode = 'discover';
  try { localStorage.removeItem('covo_last_opened_server'); } catch (e) { }

  if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
  if (unsubscribePinnedMessages) { unsubscribePinnedMessages(); unsubscribePinnedMessages = null; }
  if (readReceiptsUnsubscribe) { readReceiptsUnsubscribe(); readReceiptsUnsubscribe = null; }
  if (typingUnsubscribe) { typingUnsubscribe(); typingUnsubscribe = null; }
  if (loadServerRooms._unsub) { loadServerRooms._unsub(); loadServerRooms._unsub = null; }

  Object.values(unreadListeners).forEach(u => u());
  unreadListeners = {}; unreadCounts = {};

  const roomList = document.getElementById("roomList");
  if (roomList) roomList.innerHTML = "";
  clearMessagesDOM();
  const currentRoomHeader = document.getElementById("currentRoomHeader");
  if (currentRoomHeader) currentRoomHeader.classList.add("hidden");
  const messageInput = document.getElementById("messageInput");
  if (messageInput) messageInput.disabled = true;
  const sendMessageButton = document.getElementById("sendMessageButton");
  if (sendMessageButton) sendMessageButton.disabled = true;
  const membersSidebar = document.getElementById("membersSidebar");
  if (membersSidebar) membersSidebar.classList.add("hidden");

  document.body.classList.remove("in-chat-view", "discord-dm-view");
  document.body.classList.add("discord-home-view", "discord-discover-view");

  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.remove("mobile-hidden");
  const mobileBottomNav = document.getElementById("mobileBottomNav");
  if (mobileBottomNav) mobileBottomNav.style.display = "flex";

  const appContainer = document.getElementById("appContainer");
  if (appContainer) appContainer.classList.remove("hidden");
  const serverListScreen = document.getElementById("serverListScreen");
  if (serverListScreen) serverListScreen.classList.add("hidden");

  document.getElementById("globalAppHeader")?.classList.remove("server-mode");
  if (window.renderServerList) window.renderServerList();
  if (typeof renderDiscordServerNav === 'function') renderDiscordServerNav();
};

// サーバーを出てリストに戻る
window.leaveServerView = function (mode) {
  if (mode === 'discover' || (typeof currentHomeViewMode !== 'undefined' && currentHomeViewMode === 'discover')) {
    window.openDiscoverView();
  } else {
    window.openDmHomeView();
  }
};

// サーバー存在確認
async function checkServerIdAvailable(serverId) {
  const snap = await getDoc(doc(db, `artifacts/${appId}/servers`, serverId));
  return !snap.exists();
}

// サーバー作成
async function createServer(name, customId, password) {
  const passwordHash = await hashPassword(password, customId);
  let iconUrl = null;
  if (window.pendingNewServerIconBlob) {
    try {
      iconUrl = await uploadToExternalService(
        new File([window.pendingNewServerIconBlob], 'server_icon.jpg', { type: 'image/jpeg' }),
        (pct) => { },
        'simplechat/servericons'
      );
    } catch (e) { console.error(e); }
    window.pendingNewServerIconBlob = null;
  }
  const serverData = {
    name,
    serverId: customId,
    iconUrl,
    joinedUsers: [userId],
    serverAdmins: [userId],
    createdBy: userId,
    createdAt: serverTimestamp(),
    memberCount: 1
  };
  await setDoc(doc(db, `artifacts/${appId}/servers`, customId), serverData);

  // 新しい形式：パスワードハッシュを secrets/auth に保存
  await setDoc(doc(db, `artifacts/${appId}/servers/${customId}/secrets`, 'auth'), {
    passwordHash
  });

  // プロフィール作成
  await setDoc(doc(db, `artifacts/${appId}/servers/${customId}/profiles`, userId), {
    nickname: userNickname,
    avatarUrl: userAvatarUrl || null,
    joinedAt: serverTimestamp()
  });

  // 最初のルームを作成
  const newRoomRef = await addDoc(collection(db, `artifacts/${appId}/servers/${customId}/rooms`), {
    name: "一般",
    createdAt: serverTimestamp(),
    createdBy: userId
  });
  try {
    const b64 = await crypto.subtle.exportKey("raw", await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])).then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))));
    await updateDoc(newRoomRef, { sharedKey: b64, currentKeyVersion: 1 });
  } catch (e) { console.error("E2EE key gen failed", e); }
  try {
    const b64 = await crypto.subtle.exportKey("raw", await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])).then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))));
    await updateDoc(newRoomRef, { sharedKey: b64, currentKeyVersion: 1 });
  } catch (e) { console.error("E2EE key gen failed", e); }

  enterServer(customId, serverData);
}

// パスワードでサーバー参加
async function joinServerByPassword(serverId, password) {
  const serverSnap = await getDoc(doc(db, `artifacts/${appId}/servers`, serverId));
  if (!serverSnap.exists()) throw new Error("サーバーが見つかりません");

  const serverData = serverSnap.data();
  if (serverData.joinedUsers && serverData.joinedUsers.includes(userId)) {
    // 既に参加済み
    enterServer(serverId, serverData);
    return;
  }

  const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  const hash = await hashPassword(password, serverId);

  const res = await fetch(`${WORKER_BASE_URL}/api/joinServer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      serverId,
      password: hash,
      userId,
      appId,
      idToken,
      rtdbUrl: firebaseConfig.databaseURL
    })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "サーバーに参加できませんでした");
  }

  await setDoc(doc(db, `artifacts/${appId}/servers/${serverId}/profiles`, userId), {
    nickname: userNickname,
    avatarUrl: userAvatarUrl || null,
    joinedAt: serverTimestamp()
  });
  enterServer(serverId, { ...serverData, joinedUsers: [...(serverData.joinedUsers || []), userId] });
}

// 招待コードでサーバー参加
async function joinServerByInviteCode(code) {
  code = code.toUpperCase().trim();

  // inviteIndex からサーバーIDを逆引き（全サーバー一覧取得不要）
  const indexSnap = await getDoc(doc(db, `artifacts/${appId}/inviteIndex`, code));
  if (!indexSnap.exists()) throw new Error("招待コードが見つかりません");
  const foundServerId = indexSnap.data().serverId;

  const serverSnap = await getDoc(doc(db, `artifacts/${appId}/servers`, foundServerId));
  if (!serverSnap.exists()) throw new Error("サーバーが見つかりません");
  const serverData = serverSnap.data();

  if (serverData.joinedUsers && serverData.joinedUsers.includes(userId)) {
    enterServer(foundServerId, serverData);
    return;
  }

  const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  const res = await fetch(`${WORKER_BASE_URL}/api/joinServer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      serverId: foundServerId,
      inviteCode: code,
      userId,
      appId,
      idToken,
      rtdbUrl: firebaseConfig.databaseURL
    })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "招待コードが無効か、使用期限/上限に達しています");
  }

  await setDoc(doc(db, `artifacts/${appId}/servers/${foundServerId}/profiles`, userId), {
    nickname: userNickname,
    avatarUrl: userAvatarUrl || null,
    joinedAt: serverTimestamp()
  });
  enterServer(foundServerId, { ...serverData, joinedUsers: [...(serverData.joinedUsers || []), userId] });
}

// 管理者向け：パスワードなしでサーバーに参加
async function adminJoinServer(serverId, serverData) {
  const list = document.getElementById("adminJoinList");
  if ((serverData.joinedUsers || []).includes(userId)) {
    document.getElementById("adminJoinModal").classList.add("hidden");
    enterServer(serverId, serverData);
    return;
  }
  loadingOverlay.classList.remove("hidden");
  try {
    await updateDoc(doc(db, `artifacts/${appId}/servers`, serverId), {
      joinedUsers: arrayUnion(userId),
      memberCount: (serverData.memberCount || 0) + 1
    });
    await setDoc(doc(db, `artifacts/${appId}/servers/${serverId}/profiles`, userId), {
      nickname: userNickname,
      avatarUrl: userAvatarUrl || null,
      joinedAt: serverTimestamp()
    });
    document.getElementById("adminJoinModal").classList.add("hidden");
    enterServer(serverId, { ...serverData, joinedUsers: [...(serverData.joinedUsers || []), userId] });
  } catch (e) {
    console.error("adminJoinServer error:", e);
    alertMessage("参加に失敗しました", "error");
  } finally {
    loadingOverlay.classList.add("hidden");
  }
}

// 管理者向け参加モーダルを開く
function openAdminJoinModal() {
  const list = document.getElementById("adminJoinList");
  const notJoined = allServersCache.filter(s => !(s.joinedUsers || []).includes(userId));
  list.innerHTML = "";
  if (notJoined.length === 0) {
    list.innerHTML = `<p style="text-align:center;color:#9ca3af;padding:2rem 0;font-size:0.875rem">未参加のサーバーはありません</p>`;
  } else {
    notJoined.forEach(s => {
      const memberCount = Number.isFinite(s.memberCount) ? s.memberCount : (s.joinedUsers ? s.joinedUsers.length : 0);
      const item = document.createElement("button");
      item.className = "admin-join-item";
      item.innerHTML = `
              <div class="admin-join-icon"><i class="fas fa-server"></i></div>
              <div style="flex:1;min-width:0">
                <div class="admin-join-name">${escapeHtml(s.name || s.id)}</div>
                <div class="admin-join-meta"><i class="fas fa-users" style="margin-right:3px"></i>${memberCount} メンバー</div>
              </div>
              <span class="admin-join-badge">参加</span>
            `;
      item.addEventListener("click", () => adminJoinServer(s.id, s));
      list.appendChild(item);
    });
  }
  openModal(document.getElementById("adminJoinModal"));
}

// =========================================================================
// Server UI イベントハンドラー
// =========================================================================

// サーバー一覧へ戻るボタン
document.getElementById("backToServerListBtn").addEventListener("click", () => {
  leaveServerView();
});

// サーバー作成ボタン
document.getElementById("createServerBtn").addEventListener("click", () => {
  document.getElementById("newServerName").value = "";
  document.getElementById("newServerId").value = "";
  document.getElementById("newServerPassword").value = "";
  document.getElementById("newServerPasswordConfirm").value = "";
  document.getElementById("createServerMessage").textContent = "";
  document.getElementById("serverIdAvailability").textContent = "";
  openModal(document.getElementById("createServerModal"));
});

document.getElementById("cancelCreateServerBtn").addEventListener("click", () => {
  document.getElementById("createServerModal").classList.add("hidden");
});

// サーバーID リアルタイムバリデーション
let serverIdCheckTimer = null;
document.getElementById("newServerId").addEventListener("input", (e) => {
  const val = e.target.value;
  const availEl = document.getElementById("serverIdAvailability");
  // 英数字・ハイフンのみ
  if (!/^[a-z0-9-]*$/i.test(val)) {
    availEl.textContent = "英数字とハイフンのみ使えます";
    availEl.className = "text-xs mt-1 ml-1 text-red-500";
    return;
  }
  if (val.length < 3) {
    availEl.textContent = "3文字以上必要です";
    availEl.className = "text-xs mt-1 ml-1 text-gray-400";
    return;
  }
  clearTimeout(serverIdCheckTimer);
  serverIdCheckTimer = setTimeout(async () => {
    const available = await checkServerIdAvailable(val.toLowerCase());
    if (available) {
      availEl.textContent = "✓ 使用可能";
      availEl.className = "text-xs mt-1 ml-1 text-gray-600";
    } else {
      availEl.textContent = "✗ このIDは使われています";
      availEl.className = "text-xs mt-1 ml-1 text-red-500";
    }
  }, 500);
});

document.getElementById("confirmCreateServerBtn").addEventListener("click", async () => {
  const name = document.getElementById("newServerName").value.trim();
  const rawId = document.getElementById("newServerId").value.trim().toLowerCase();
  const pass = document.getElementById("newServerPassword").value;
  const passConfirm = document.getElementById("newServerPasswordConfirm").value;
  const msgEl = document.getElementById("createServerMessage");

  if (!name) { msgEl.textContent = "サーバー名を入力してください"; return; }
  if (!rawId || rawId.length < 3) { msgEl.textContent = "サーバーID（3文字以上）を入力してください"; return; }
  if (!/^[a-z0-9-]+$/.test(rawId)) { msgEl.textContent = "IDは英数字とハイフンのみ使えます"; return; }
  if (!pass) { msgEl.textContent = "パスワードを入力してください"; return; }
  if (pass !== passConfirm) { msgEl.textContent = "パスワードが一致しません"; return; }

  loadingOverlay.classList.remove("hidden");
  try {
    // 作成上限チェック（全体管理者は無制限、それ以外は同時に2つまで）
    if (!isAdmin) {
      const myServersSnap = await getDocs(
        query(collection(db, `artifacts/${appId}/servers`), where("joinedUsers", "array-contains", userId))
      );
      const myCreated = myServersSnap.docs.filter(d => d.data().createdBy === userId).length;
      if (myCreated >= 2) {
        msgEl.textContent = "サーバーは同時に2つまで作成できます";
        loadingOverlay.classList.add("hidden");
        return;
      }
    }
    const available = await checkServerIdAvailable(rawId);
    if (!available) { msgEl.textContent = "このIDは既に使われています"; loadingOverlay.classList.add("hidden"); return; }
    await createServer(name, rawId, pass);
    document.getElementById("createServerModal").classList.add("hidden");
  } catch (e) {
    console.error(e);
    msgEl.textContent = "作成に失敗しました: " + e.message;
  } finally {
    loadingOverlay.classList.add("hidden");
  }
});

// サーバー参加ボタン
document.getElementById("joinServerBtn").addEventListener("click", () => {
  if (isAdmin) {
    openAdminJoinModal();
    return;
  }
  document.getElementById("joinServerId").value = "";
  document.getElementById("joinServerPassword").value = "";
  document.getElementById("joinInviteCode").value = "";
  document.getElementById("joinServerMessage").textContent = "";
  openModal(document.getElementById("joinServerModal"));
});

document.getElementById("cancelAdminJoinBtn").addEventListener("click", () => {
  document.getElementById("adminJoinModal").classList.add("hidden");
});

document.getElementById("cancelJoinServerBtn").addEventListener("click", () => {
  document.getElementById("joinServerModal").classList.add("hidden");
});

// 参加モーダルのタブ切り替え
document.getElementById("joinTabPassword").addEventListener("click", () => {
  document.getElementById("joinTabPassword").classList.add("active");
  document.getElementById("joinTabCode").classList.remove("active");
  document.getElementById("joinByPasswordSection").classList.remove("hidden");
  document.getElementById("joinByCodeSection").classList.add("hidden");
});
document.getElementById("joinTabCode").addEventListener("click", () => {
  document.getElementById("joinTabCode").classList.add("active");
  document.getElementById("joinTabPassword").classList.remove("active");
  document.getElementById("joinByCodeSection").classList.remove("hidden");
  document.getElementById("joinByPasswordSection").classList.add("hidden");
});

document.getElementById("confirmJoinServerBtn").addEventListener("click", async () => {
  const msgEl = document.getElementById("joinServerMessage");
  msgEl.textContent = "";
  loadingOverlay.classList.remove("hidden");
  try {
    const isCodeTab = !document.getElementById("joinByCodeSection").classList.contains("hidden");
    if (isCodeTab) {
      const code = document.getElementById("joinInviteCode").value.trim();
      if (!code) { msgEl.textContent = "招待コードを入力してください"; return; }
      await joinServerByInviteCode(code);
    } else {
      const serverId = document.getElementById("joinServerId").value.trim().toLowerCase();
      const password = document.getElementById("joinServerPassword").value;
      if (!serverId) { msgEl.textContent = "サーバーIDを入力してください"; return; }
      if (!password) { msgEl.textContent = "パスワードを入力してください"; return; }
      await joinServerByPassword(serverId, password);
    }
    document.getElementById("joinServerModal").classList.add("hidden");
  } catch (e) {
    console.error(e);
    msgEl.textContent = e.message || "参加に失敗しました";
  } finally {
    loadingOverlay.classList.add("hidden");
  }
});

// サーバー設定モーダル
const serverSettingsModal = document.getElementById("serverSettingsModal");
document.getElementById("serverSettingsBtn").addEventListener("click", openServerSettings);
document.getElementById("closeServerSettingsBtn").addEventListener("click", () => serverSettingsModal.classList.add("hidden"));

// サーバー設定のタブ
let currentSsTab = "rooms";
window.switchSsTab = function (tab) {
  currentSsTab = tab;
  ["rooms", "members", "invites", "stamps", "danger"].forEach(t => {
    const tabBtn = document.getElementById(`ssTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (tabBtn) tabBtn.classList.toggle("active", t === tab);
    const sec = document.getElementById(`ss${t.charAt(0).toUpperCase() + t.slice(1)}Section`);
    if (sec) {
      if (t === tab) {
        sec.classList.remove("hidden");
        sec.classList.add("active");
      } else {
        sec.classList.add("hidden");
        sec.classList.remove("active");
      }
    }
  });
}


async function openServerSettings() {
  if (!currentServerId) return;
  document.getElementById("serverSettingsTitle").textContent = currentServerData?.name || currentServerId;
  document.getElementById("serverSettingsMessage").textContent = "";

  const isOwner = currentServerData?.createdBy === userId ||
    (currentServerData?.serverAdmins && currentServerData.serverAdmins.includes(userId));
  const hasAdminRights = isOwner || isAdmin;

  // サーバーアイコン設定の表示・更新
  const iconWrapper = document.getElementById("serverIconSettingsWrapper");
  const iconPreview = document.getElementById("serverIconSettingsPreview");
  if (iconWrapper && iconPreview) {
    // 全体コンテナは常に表示するが、管理者以外はホバーエフェクトとクリックを無効化
    if (hasAdminRights || isListAdmin) {
      iconWrapper.classList.add("cursor-pointer", "group");
      iconWrapper.dataset.canEdit = "true";
    } else {
      iconWrapper.classList.remove("cursor-pointer", "group");
      iconWrapper.dataset.canEdit = "false";
    }
    if (currentServerData?.iconUrl) {
      iconPreview.innerHTML = `<img src="${currentServerData.iconUrl}" class="w-full h-full object-cover" />`;
      iconPreview.style.backgroundColor = "transparent";
    } else {
      const initial = (currentServerData?.name || currentServerId).charAt(0).toUpperCase();
      iconPreview.textContent = initial;
      iconPreview.style.backgroundColor = '#374151';
    }
  }

  // 削除ボタンは管理者向け
  const deleteBtn = document.getElementById("deleteServerBtn");
  if (deleteBtn) {
    deleteBtn.style.display = hasAdminRights ? "" : "none";
  }

  // タブの表示制御
  const tabs = ["ssTabRooms", "ssTabMembers", "ssTabInvites", "ssTabDanger"];
  tabs.forEach(tabId => {
    const el = document.getElementById(tabId);
    if (el) el.style.display = hasAdminRights ? "" : "none";
  });

  openModal(serverSettingsModal);

  if (hasAdminRights) {
    switchSsTab("rooms");
    await loadServerSettingsRooms();
  } else {
    switchSsTab("stamps");
    await loadServerStampsForAdmin();
  }
}

async function loadServerSettingsRooms() {
  const listEl = document.getElementById("serverRoomsList");
  listEl.innerHTML = "<p class='text-xs text-gray-400'>読み込み中...</p>";
  let roomsData = [];
  try {

    const snap = await getDocs(collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms`));
    let idx = 0;
    snap.forEach(d => { roomsData.push({ id: d.id, ...d.data(), order: typeof d.data().order === 'number' ? d.data().order : (idx++) * 10 }); });

  } catch (e) { console.error(e); }

  roomsData.sort((a, b) => a.order - b.order);

  // DB上のorder値が重複または未設定の状態を防ぐため、整流されたorder値を確保
  roomsData.forEach((r, i) => { r.order = i * 10; });

  let categories = [];
  if (typeof currentServerData !== 'undefined' && currentServerData && currentServerData.categories) {
    categories = currentServerData.categories;
    if (!Array.isArray(categories)) categories = Object.values(categories);
    categories.sort((a, b) => a.order - b.order);
  }

  const catList = document.getElementById("newRoomCategoryList");
  if (catList) {
    catList.innerHTML = `<li class="px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm text-gray-700 border-b border-gray-100 last:border-0 cat-select-option" data-val="">カテゴリーなし</li>`;
    categories.forEach(cat => {
      const li = document.createElement("li");
      li.className = "px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm text-gray-700 border-b border-gray-100 last:border-0 cat-select-option truncate";
      li.dataset.val = cat.id;
      li.textContent = cat.name;
      catList.appendChild(li);
    });

    document.querySelectorAll('.cat-select-option').forEach(el => {
      el.addEventListener('click', (e) => {
        const val = e.target.dataset.val;
        const label = e.target.textContent;
        document.getElementById('newRoomCategorySelect').value = val;
        document.getElementById('newRoomCategoryLabel').textContent = label;
        const dd = document.getElementById('newRoomCategoryDropdown');
        dd.classList.add('opacity-0');
        document.getElementById('newRoomCategoryIcon').classList.remove('rotate-180');
        setTimeout(() => dd.classList.add('hidden'), 200);
      });
    });
  }

  // メモリ上の最新リストを使ってDOMを構築・即時更新する関数
  window.toggleCategory = function (catId) {
    if (!currentServerData) return;
    let cats = currentServerData.categories || {};
    if (Array.isArray(cats)) {
      let newCats = {};
      cats.forEach(c => { newCats[c.id] = c; });
      cats = newCats;
    }
    if (cats[catId]) {
      cats[catId].isExpanded = !(cats[catId].isExpanded !== false);
      import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js").then(module => {
        const { doc, updateDoc } = module;
        updateDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}`), { categories: cats });
      });
      const btn = document.querySelector(`div[onclick="toggleCategory('${catId}')"] i`);
      if (btn) {
        btn.style.transform = cats[catId].isExpanded ? "rotate(0deg)" : "rotate(-90deg)";
      }
      const container = document.getElementById(`cat-rooms-${catId}`);
      if (container) {
        container.style.display = cats[catId].isExpanded ? "block" : "none";
      }
    }
  };

  const createCategoryBtn = document.getElementById("createCategoryBtn");
  if (createCategoryBtn) {
    createCategoryBtn.addEventListener("click", async () => {
      const name = prompt("カテゴリー名を入力してください");
      if (!name) return;
      loadingOverlay.classList.remove("hidden");
      try {
        const { doc, updateDoc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        const serverRef = doc(db, `artifacts/${appId}/servers/${currentServerId}`);
        const snap = await getDoc(serverRef);
        if (snap.exists()) {
          const data = snap.data();
          let cats = data.categories || [];
          if (!Array.isArray(cats)) cats = Object.values(cats);
          const newId = "cat_" + Date.now();
          cats.push({ id: newId, name: name, order: cats.length, isExpanded: true });
          await updateDoc(serverRef, { categories: cats });
          alert("カテゴリーを作成しました");
        }
      } catch (e) {
        console.error("カテゴリー作成エラー", e);
        alert("エラーが発生しました");
      }
      loadingOverlay.classList.add("hidden");
    });
  }
  function renderRoomsListUI() {
    listEl.innerHTML = "";

    const renderRoomItem = (room, index, arr) => {
      const item = document.createElement("div");
      item.className = "flex items-center justify-between p-3 bg-[#2b2d31] border border-[#1e1f22] rounded-lg group transition-all ml-4 mb-2 min-w-0";
      const nameSpan = document.createElement("span");
      nameSpan.className = "text-sm font-medium text-gray-300 flex items-center gap-2 truncate";
      nameSpan.innerHTML = `<i class="fas fa-hashtag text-gray-500 text-xs"></i> ${escapeHtml(room.name)}`;

      const btnsContainer = document.createElement("div");
      btnsContainer.className = "flex items-center gap-1.5";

      // Order Up
      const upBtn = document.createElement("button");
      upBtn.className = `room-order-btn p-1.5 rounded-lg text-xs font-bold transition-all ${index === 0 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-white/10'}`;
      upBtn.disabled = index === 0;
      upBtn.innerHTML = `<i class="fas fa-arrow-up"></i>`;
      upBtn.addEventListener("click", async () => {
        if (index === 0) return;
        listEl.querySelectorAll(".room-order-btn, .del-room-btn").forEach(b => { b.disabled = true; b.style.opacity = "0.5"; });
        upBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;

        const prev = arr[index - 1];
        const tempOrder = room.order;
        room.order = prev.order;
        prev.order = tempOrder;

        await updateRoomOrderBoth(room.id, room.order);
        await updateRoomOrderBoth(prev.id, prev.order);
        renderRoomsListUI();
        if (typeof loadServerRooms === 'function') loadServerRooms(currentServerId);
      });

      // Order Down
      const downBtn = document.createElement("button");
      downBtn.className = `room-order-btn p-1.5 rounded-lg text-xs font-bold transition-all ${index === arr.length - 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-white/10'}`;
      downBtn.disabled = index === arr.length - 1;
      downBtn.innerHTML = `<i class="fas fa-arrow-down"></i>`;
      downBtn.addEventListener("click", async () => {
        if (index === arr.length - 1) return;
        listEl.querySelectorAll(".room-order-btn, .del-room-btn").forEach(b => { b.disabled = true; b.style.opacity = "0.5"; });
        downBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;

        const next = arr[index + 1];
        const tempOrder = room.order;
        room.order = next.order;
        next.order = tempOrder;

        await updateRoomOrderBoth(room.id, room.order);
        await updateRoomOrderBoth(next.id, next.order);
        renderRoomsListUI();
        if (typeof loadServerRooms === 'function') loadServerRooms(currentServerId);
      });

      // Custom Category Dropdown (Style matched to stampAdminServerSelectContainer)
      const catContainer = document.createElement("div");
      catContainer.className = "relative ml-2";

      const catBtn = document.createElement("button");
      catBtn.type = "button";
      catBtn.className = "w-28 bg-[#1e1f22] border border-[#2b2d31] hover:bg-[#2b2d31] rounded-lg p-1.5 flex items-center justify-between shadow-sm focus:outline-none transition-all text-gray-300 text-xs";

      const currentCat = (typeof categories !== 'undefined') ? categories.find(c => c.id === room.categoryId) : null;
      const catLabel = document.createElement("span");
      catLabel.className = "truncate mr-1 text-[11px] font-bold";
      catLabel.textContent = currentCat ? currentCat.name : "カテゴリなし";

      const catIcon = document.createElement("i");
      catIcon.className = "fas fa-chevron-down text-gray-500 transition-transform duration-200 text-[10px] room-cat-icon";

      catBtn.appendChild(catLabel);
      catBtn.appendChild(catIcon);

      const catDropdown = document.createElement("div");
      catDropdown.className = "room-cat-dropdown absolute z-50 w-36 right-0 mt-1 bg-[#1e1f22] border border-[#2b2d31] rounded-lg shadow-2xl max-h-40 overflow-y-auto hidden opacity-0 transition-opacity duration-200 origin-top";

      const catList = document.createElement("ul");
      catList.className = "py-1";

      const createOption = (val, text) => {
        const li = document.createElement("li");
        li.className = "px-3 py-2 hover:bg-[#2b2d31] hover:text-white cursor-pointer text-[11px] font-bold text-gray-300 transition-colors truncate";
        li.textContent = text;
        li.addEventListener("click", async (e) => {
          e.stopPropagation();
          catDropdown.classList.add("hidden");
          catDropdown.classList.remove("opacity-100");
          catDropdown.classList.add("opacity-0");
          catIcon.classList.remove("rotate-180");
          if (room.categoryId === val || (room.categoryId === null && val === "none")) return;

          catLabel.textContent = text;
          const newCat = val === "none" ? null : val;
          try {
            const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
            await updateDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${room.id}`), { categoryId: newCat });
            room.categoryId = newCat;
            loadServerSettingsRooms();
            if (typeof loadServerRooms === 'function') loadServerRooms(currentServerId);
          } catch (err) {
            console.error(err);
            alertMessage("カテゴリの変更に失敗しました", "error");
          }
        });
        return li;
      };

      catList.appendChild(createOption("none", "カテゴリなし"));
      if (typeof categories !== 'undefined') {
        categories.forEach(c => catList.appendChild(createOption(c.id, c.name)));
      }

      catDropdown.appendChild(catList);
      catContainer.appendChild(catBtn);
      catContainer.appendChild(catDropdown);

      catBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isHidden = catDropdown.classList.contains("hidden");
        document.querySelectorAll('.room-cat-dropdown').forEach(d => {
          d.classList.add("hidden");
          d.classList.remove("opacity-100");
          d.classList.add("opacity-0");
        });
        document.querySelectorAll('.room-cat-icon').forEach(i => i.classList.remove("rotate-180"));

        if (isHidden) {
          catDropdown.classList.remove("hidden");
          void catDropdown.offsetWidth;
          catDropdown.classList.remove("opacity-0");
          catDropdown.classList.add("opacity-100");
          catIcon.classList.add("rotate-180");
        }
      });

      document.addEventListener("click", (e) => {
        if (document.body.contains(catContainer) && !catContainer.contains(e.target)) {
          catDropdown.classList.add("hidden");
          catDropdown.classList.remove("opacity-100");
          catDropdown.classList.add("opacity-0");
          catIcon.classList.remove("rotate-180");
        }
      });

      // Delete
      const delBtn = document.createElement("button");
      delBtn.className = "del-room-btn text-red-500 hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded-lg text-xs transition-all ml-2";
      delBtn.dataset.roomId = room.id;
      delBtn.dataset.roomName = room.name;
      delBtn.innerHTML = `<i class="fas fa-trash"></i>`;
      delBtn.addEventListener("click", async () => {
        if (!await showCustomConfirm(`「${delBtn.dataset.roomName}」を削除しますか？`, "削除")) return;
        loadingOverlay.classList.remove("hidden");
        try {
          await deleteRoomCascade(currentServerId, delBtn.dataset.roomId);
          if (currentRoomId === delBtn.dataset.roomId) {
            currentRoomId = null;
            currentRoomHeader.classList.add("hidden");
            clearMessagesDOM();
            messageInput.disabled = true;
            sendMessageButton.disabled = true;
          }
          roomsData = roomsData.filter(r => r.id !== delBtn.dataset.roomId);
          renderRoomsListUI();
          if (typeof loadServerRooms === 'function') loadServerRooms(currentServerId);
        } catch (e) { alertMessage("削除に失敗しました", "error"); }
        finally { loadingOverlay.classList.add("hidden"); }
      });

      btnsContainer.appendChild(upBtn);
      btnsContainer.appendChild(downBtn);
      btnsContainer.appendChild(catContainer);
      btnsContainer.appendChild(delBtn);
      item.appendChild(nameSpan);
      item.appendChild(btnsContainer);
      return item;
    };

    // Render categories and rooms inside them
    categories.forEach((cat) => {
      const catDiv = document.createElement("div");
      catDiv.className = "mb-4";

      const catHeader = document.createElement("div");
      catHeader.className = "flex items-center justify-between mb-2 p-2 bg-[#1e1f22] rounded-lg";
      catHeader.innerHTML = `
            <span class="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <i class="fas fa-folder-open text-[10px]"></i> ${escapeHtml(cat.name)}
            </span>
            <div class="flex gap-1">
              <button class="cat-del-btn text-gray-500 hover:text-red-400 p-1" data-cat-id="${cat.id}"><i class="fas fa-trash text-sm"></i></button>
            </div>
          `;
      catDiv.appendChild(catHeader);

      // delete cat
      catHeader.querySelector('.cat-del-btn').addEventListener("click", async (e) => {
        const cid = e.currentTarget.dataset.catId;
        if (await showCustomConfirm(`カテゴリー「${cat.name}」を削除しますか？（中のルームは「カテゴリーなし」に移動します）`, "削除")) {
          const newCats = categories.filter(c => c.id !== cid);
          await updateDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}`), { categories: newCats });
          for (let r of roomsData.filter(r => r.categoryId === cid)) {
            await updateDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${r.id}`), { categoryId: null });
            r.categoryId = null;
          }
          loadServerSettingsRooms();
          if (typeof loadServerRooms === 'function') loadServerRooms(currentServerId);
        }
      });

      const catRooms = roomsData.filter(r => r.categoryId === cat.id);
      catRooms.sort((a, b) => a.order - b.order);
      catRooms.forEach((r, i) => {
        catDiv.appendChild(renderRoomItem(r, i, catRooms));
      });
      if (catRooms.length === 0) {
        const emptySpan = document.createElement("div");
        emptySpan.className = "text-xs text-gray-600 italic ml-4 mb-2";
        emptySpan.textContent = "ルームがありません";
        catDiv.appendChild(emptySpan);
      }
      listEl.appendChild(catDiv);
    });

    // Uncategorized rooms
    const uncategorized = roomsData.filter(r => !r.categoryId);
    uncategorized.sort((a, b) => a.order - b.order);

    if (uncategorized.length > 0) {
      const uncatDiv = document.createElement("div");
      uncatDiv.className = "mb-4";
      uncatDiv.innerHTML = `<span class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-2 block">カテゴリーなし</span>`;
      uncategorized.forEach((r, i) => {
        uncatDiv.appendChild(renderRoomItem(r, i, uncategorized));
      });
      listEl.appendChild(uncatDiv);
    }
  }

  renderRoomsListUI();
}

async function updateRoomOrderBoth(roomId, newOrder) {
  try {

    await updateDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${roomId}`), { order: newOrder });

  } catch (e) { console.error(e); }
}

document.getElementById('newRoomCategoryCustomBtn')?.addEventListener('click', (e) => {
  const dd = document.getElementById('newRoomCategoryDropdown');
  const icon = document.getElementById('newRoomCategoryIcon');
  if (dd.classList.contains('hidden')) {
    dd.classList.remove('hidden');
    setTimeout(() => { dd.classList.remove('opacity-0'); icon.classList.add('rotate-180'); }, 10);
  } else {
    dd.classList.add('opacity-0');
    icon.classList.remove('rotate-180');
    setTimeout(() => dd.classList.add('hidden'), 200);
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#newRoomCategorySelectContainer')) {
    const dd = document.getElementById('newRoomCategoryDropdown');
    if (dd && !dd.classList.contains('hidden')) {
      dd.classList.add('opacity-0');
      document.getElementById('newRoomCategoryIcon')?.classList.remove('rotate-180');
      setTimeout(() => dd.classList.add('hidden'), 200);
    }
  }
});

document.getElementById("createRoomInServerBtn").addEventListener("click", async () => {
  const name = document.getElementById("newRoomNameInput").value.trim();
  const categoryId = document.getElementById("newRoomCategorySelect").value || null;
  if (!name) return;
  loadingOverlay.classList.remove("hidden");
  try {
    const newRoomRef = await addDoc(collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms`), {
      name, categoryId, createdAt: serverTimestamp(), createdBy: userId
    });
    try {
      const b64 = await crypto.subtle.exportKey("raw", await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])).then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))));
      await updateDoc(newRoomRef, { sharedKey: b64, currentKeyVersion: 1 });
    } catch (e) { console.error("E2EE key gen failed", e); }
    document.getElementById("newRoomNameInput").value = "";
    await loadServerSettingsRooms();
    alertMessage("ルームを作成しました", "success");
  } catch (e) { alertMessage("作成に失敗しました", "error"); }
  finally { loadingOverlay.classList.add("hidden"); }
});

// メンバー管理タブ
document.getElementById("ssMembersSection").parentElement; // (reference check)
async function loadServerSettingsMembers() {
  if (currentSsTab !== "members") return;
  const listEl = document.getElementById("serverMembersManageList");
  listEl.innerHTML = "<p class='text-xs text-gray-400'>読み込み中...</p>";
  const serverSnap = await getDoc(doc(db, `artifacts/${appId}/servers`, currentServerId));
  const serverData = serverSnap.data();
  const rawMembers = serverData.joinedUsers || [];
  const members = [...new Set(rawMembers)];
  const admins = serverData.serverAdmins || [];

  listEl.innerHTML = "";

  const profileSnaps = await Promise.all(
    members.map(uid => getDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/profiles`, uid)).catch(() => null))
  );

  members.forEach((uid, index) => {
    const profileSnap = profileSnaps[index];
    const profile = (profileSnap && profileSnap.exists()) ? profileSnap.data() : { nickname: uid.substring(0, 8) };
    const isAdmin_ = admins.includes(uid);
    const item = document.createElement("div");
    item.className = "flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg mb-2";
    const displayName = profile.nickname || uid.substring(0, 8);
    const initial = escapeHtml((profile.nickname || '?').charAt(0).toUpperCase());
    item.innerHTML = `
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-full bg-gray-700 text-white flex items-center justify-center text-sm font-bold">${initial}</div>
              <div>
                <div class="text-sm font-medium text-gray-800">${escapeHtml(displayName)}</div>
                ${isAdmin_ ? '<span class="text-xs text-amber-600 font-bold"><i class="fas fa-crown mr-1"></i>管理者</span>' : ''}
              </div>
            </div>
            <div class="flex gap-2">
              ${uid !== userId ? `<button class="toggle-admin-btn text-xs px-2 py-1 rounded-lg border transition-all ${isAdmin_ ? 'border-amber-300 text-amber-600 hover:bg-amber-50' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}">${isAdmin_ ? '管理者解除' : '管理者に設定'}</button>` : ''}
              ${uid !== userId ? `<button class="kick-btn text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg text-xs transition-all"><i class="fas fa-times"></i></button>` : ''}
            </div>`;
    // data-uid はサニタイズ不要な UID だが innerHTML の外で設定して安全に
    if (uid !== userId) {
      const tb = item.querySelector(".toggle-admin-btn");
      const kb = item.querySelector(".kick-btn");
      if (tb) { tb.dataset.uid = uid; tb.dataset.isAdmin = String(isAdmin_); }
      if (kb) { kb.dataset.uid = uid; }
    }
    listEl.appendChild(item);
  });

  // イベント
  listEl.querySelectorAll(".toggle-admin-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const targetUid = btn.dataset.uid;
      const wasAdmin = btn.dataset.isAdmin === "true";
      try {
        await updateDoc(doc(db, `artifacts/${appId}/servers`, currentServerId), {
          serverAdmins: wasAdmin ? arrayRemove(targetUid) : arrayUnion(targetUid)
        });
        await loadServerSettingsMembers();
      } catch (e) { alertMessage("操作に失敗しました", "error"); }
    });
  });
  listEl.querySelectorAll(".kick-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!await showCustomConfirm("このメンバーをキックしますか？", "キック")) return;
      const targetUid = btn.dataset.uid;
      try {
        await updateDoc(doc(db, `artifacts/${appId}/servers`, currentServerId), {
          joinedUsers: arrayRemove(targetUid),
          serverAdmins: arrayRemove(targetUid),
          memberCount: Math.max(0, ((await getDoc(doc(db, `artifacts/${appId}/servers`, currentServerId))).data().memberCount || 1) - 1)
        });
        try {
          const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
          const rtdb = await _getOrInitRTDB();
          await remove(ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/members/${targetUid}`));
        } catch (rtdbErr) { console.warn("RTDB kick sync failed:", rtdbErr); }
        await loadServerSettingsMembers();
        // Forward Secrecy: メンバーキック時に全ルームの鍵をローテーション
        if (typeof rotateAllRoomKeys === 'function') {
          const svSnap = await getDoc(doc(db, `artifacts/${appId}/servers`, currentServerId));
          if (svSnap.exists() && svSnap.data().joinedUsers) {
            await rotateAllRoomKeys(currentServerId, svSnap.data().joinedUsers);
          }
        }
      } catch (e) { alertMessage("キックに失敗しました", "error"); }
    });
  });
}
document.getElementById("ssTabMembers").addEventListener("click", loadServerSettingsMembers);

// 招待コードタブ
document.getElementById("ssTabInvites").addEventListener("click", loadInviteCodes);
async function loadInviteCodes() {
  if (currentSsTab !== "invites") return;
  const listEl = document.getElementById("inviteCodesList");
  listEl.innerHTML = "";
  const snap = await getDocs(collection(db, `artifacts/${appId}/servers/${currentServerId}/inviteCodes`));
  snap.forEach(d => {
    const inv = d.data();
    if (inv.disabled) return;
    const item = document.createElement("div");
    item.className = "invite-code-item";
    const uses = Number.isFinite(inv.uses) ? inv.uses : 0;
    const maxUsesLabel = inv.maxUses > 0 ? inv.maxUses : '∞';
    const expLabel = inv.expiresAt ? '・' + new Date(inv.expiresAt.toDate()).toLocaleDateString() + 'まで' : '';
    item.innerHTML = `
            <div class="flex-1">
              <div class="invite-code-text">${escapeHtml(d.id)}</div>
              <div class="invite-code-meta">${uses}/${maxUsesLabel}回使用${escapeHtml(expLabel)}</div>
            </div>
            <button class="copy-invite-btn text-gray-400 hover:text-gray-700 p-1 rounded" title="コピー"><i class="fas fa-copy"></i></button>
            <button class="disable-invite-btn text-red-400 hover:text-red-600 p-1 rounded" title="無効化"><i class="fas fa-ban"></i></button>`;
    item.querySelector(".copy-invite-btn").dataset.code = d.id;
    item.querySelector(".disable-invite-btn").dataset.code = d.id;
    listEl.appendChild(item);
  });
  listEl.querySelectorAll(".copy-invite-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.code);
      alertMessage("コピーしました", "success");
    });
  });
  listEl.querySelectorAll(".disable-invite-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!await showCustomConfirm("このコードを無効化しますか？", "無効化")) return;
      await Promise.all([
        updateDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/inviteCodes`, btn.dataset.code), { disabled: true }),
        deleteDoc(doc(db, `artifacts/${appId}/inviteIndex`, btn.dataset.code)),
      ]);
      await loadInviteCodes();
    });
  });
}

// カスタムスタンプ管理タブ
async function loadServerStampsForAdmin() {
  // 移行済みのため空
}

window.openStampAdminModal = async function () {
  const modal = document.getElementById('stampAdminModal');
  modal.classList.remove('hidden');
  const selContainer = document.getElementById('stampAdminServerSelectContainer');
  const hiddenSel = document.getElementById('stampAdminServerSelect');
  const label = document.getElementById('saCustomSelectLabel');
  const list = document.getElementById('saCustomSelectList');

  list.innerHTML = '<li class="px-4 py-3 text-sm text-gray-500">読み込み中...</li>';
  label.textContent = "読み込み中...";

  if (isAdmin) {
    selContainer.classList.remove('hidden');
    try {
      const snap = await getDocs(collection(db, `artifacts/${appId}/servers`));
      list.innerHTML = '';
      snap.forEach(doc => {
        const li = document.createElement('li');
        const sName = doc.data().name || "名称未設定サーバー";
        li.className = "px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm font-medium text-gray-700 transition-colors border-b border-gray-100 last:border-0";
        li.textContent = sName;
        li.onclick = () => {
          hiddenSel.value = doc.id;
          label.textContent = sName;
          document.getElementById('saCustomSelectDropdown').classList.add('hidden', 'opacity-0');
          document.getElementById('saCustomSelectIcon').classList.remove('rotate-180');
          saLoadStamps(doc.id);
        };
        if (doc.id === currentServerId) {
          hiddenSel.value = doc.id;
          label.textContent = sName;
        }
        list.appendChild(li);
      });
    } catch (e) { list.innerHTML = '<li class="px-4 py-3 text-sm text-red-500">エラー</li>'; }
  } else {
    selContainer.classList.add('hidden');
    hiddenSel.value = currentServerId;
    label.textContent = currentServerData?.name || "現在のサーバー";
  }
  await saLoadStamps(hiddenSel.value || currentServerId);
};

window.saLoadStamps = async function (targetServerId) {
  if (!targetServerId) return;
  const listEl = document.getElementById('saStampsList');
  const existingGroupList = document.getElementById('saExistingGroupList');
  if (existingGroupList) {
    existingGroupList.innerHTML = '';
    document.getElementById('saSelectedExistingGroupId').value = '';
    document.getElementById('saExistingGroupLabel').textContent = 'グループを選択';
  }
  listEl.innerHTML = '<p class="text-sm text-gray-500 col-span-2 text-center py-4">読み込み中...</p>';
  try {
    const [snapStamps, snapGroups] = await Promise.all([
      getDocs(collection(db, `artifacts/${appId}/servers/${targetServerId}/stamps`)).catch(() => ({ empty: true, forEach: () => { } })),
      getDocs(collection(db, `artifacts/${appId}/servers/${targetServerId}/stampGroups`)).catch(() => ({ empty: true, forEach: () => { } }))
    ]);
    listEl.innerHTML = '';
    if (snapStamps.empty && snapGroups.empty) {
      listEl.innerHTML = '<p class="text-sm text-gray-500 col-span-2 text-center py-4">登録されているスタンプはありません。</p>';
      if (existingGroupList) existingGroupList.innerHTML = '<li class="px-4 py-3 text-sm text-gray-500 text-center">グループがありません</li>';
      return;
    }
    let hasAdminRights = isAdmin;
    try {
      const targetServerSnap = await getDoc(doc(db, `artifacts/${appId}/servers/${targetServerId}`));
      if (targetServerSnap.exists()) {
        const d = targetServerSnap.data();
        hasAdminRights = hasAdminRights || d.createdBy === userId || (d.serverAdmins && d.serverAdmins.includes(userId));
      }
    } catch (e) { }
    const renderGroup = (id, name, thumbUrl, stampsList, isLegacy) => {
      const div = document.createElement('div');
      div.className = "flex flex-col gap-3 p-4 bg-white rounded-xl border border-gray-200 transition-shadow hover:shadow-md";
      const stampsHtml = stampsList.map((s, index) => `
            <div class="relative group inline-block">
              <img src="${escapeHtml(s.url)}" class="w-10 h-10 object-contain bg-gray-50 rounded border border-gray-100" title="${escapeHtml(s.name)}" />
              ${hasAdminRights ? `<button class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow hover:bg-red-600 z-10 text-[10px]" title="このスタンプを削除" onclick="saDeleteIndividualStamp('${targetServerId}', '${id}', ${isLegacy}, ${index}, '${escapeHtml(s.url)}')"><i class="fas fa-times"></i></button>` : ''}
            </div>
          `).join("");
      div.innerHTML = `
            <div class="flex items-center justify-between border-b pb-3 border-gray-100">
              <div class="flex items-center gap-3">
                <img src="${escapeHtml(thumbUrl)}" class="w-8 h-8 object-contain rounded bg-gray-50 border border-gray-200" />
                <span class="font-bold text-gray-800 text-sm">${escapeHtml(name)} ${isLegacy ? '<span class="text-xs text-gray-400 font-normal">(レガシー)</span>' : ''}</span>
              </div>
              ${hasAdminRights ? `<button class="bg-red-50 hover:bg-red-100 text-red-500 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors" onclick="saDeleteGroup('${targetServerId}', '${id}', ${isLegacy})">グループごと削除</button>` : ''}
            </div>
            <div class="flex flex-wrap gap-3 pt-1 max-h-32 overflow-y-auto">${stampsHtml}</div>
          `;
      listEl.appendChild(div);
    };
    snapGroups.forEach(doc => {
      renderGroup(doc.id, doc.data().name, doc.data().thumbnailUrl, doc.data().stamps || [], false);
      if (existingGroupList) {
        const li = document.createElement('li');
        li.className = "px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm font-medium text-gray-700 transition-colors flex items-center gap-3 border-b border-gray-100 last:border-0";
        li.innerHTML = `<img src="${escapeHtml(doc.data().thumbnailUrl)}" class="w-6 h-6 object-contain rounded border border-gray-200"/><span>${escapeHtml(doc.data().name)}</span>`;
        li.onclick = () => {
          document.getElementById('saSelectedExistingGroupId').value = doc.id;
          document.getElementById('saExistingGroupLabel').textContent = doc.data().name;
          document.getElementById('saExistingGroupDropdown').classList.add('hidden', 'opacity-0');
          document.getElementById('saExistingGroupIcon').classList.remove('rotate-180');
        };
        existingGroupList.appendChild(li);
      }
    });
    snapStamps.forEach(doc => renderGroup(doc.id, doc.data().name, doc.data().thumbnailUrl || doc.data().url, doc.data().stamps || [{ name: doc.data().name, url: doc.data().url }], true));
  } catch (e) { listEl.innerHTML = '<p class="text-sm text-red-500 col-span-2 text-center py-4">読み込みエラーが発生しました。</p>'; }
};

window.saDeleteIndividualStamp = async function (targetServerId, groupId, isLegacy, stampIndex, stampUrl) {
  if (!await showCustomConfirm("このスタンプを一つ削除しますか？", "削除確認")) return;
  try {
    if (stampUrl) {
      const m = stampUrl.match(/\/api\/file\/([A-Za-z0-9_]+)/);
      if (m) {
        const fileKey = m[1];
        const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
        const params = `userId=${encodeURIComponent(userId)}&idToken=${encodeURIComponent(idToken)}&forceDelete=1`;
        fetch(`${WORKER_BASE_URL}/api/file/${fileKey}?${params}`, { method: 'DELETE' }).catch(e => console.warn('KV delete error', e));
      }
    }
    const path = isLegacy ? `artifacts/${appId}/servers/${targetServerId}/stamps/${groupId}` : `artifacts/${appId}/servers/${targetServerId}/stampGroups/${groupId}`;
    const docRef = doc(db, path);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (isLegacy) {
        await deleteDoc(docRef);
      } else {
        const stamps = data.stamps || [];
        if (stamps.length > 0 && stampIndex >= 0 && stampIndex < stamps.length) {
          stamps.splice(stampIndex, 1);
          if (stamps.length === 0) {
            await deleteDoc(docRef);
          } else {
            await updateDoc(docRef, { stamps: stamps });
          }
        }
      }
    }
    alertMessage("スタンプを一つ削除しました", "success");
    await saLoadStamps(targetServerId);
    if (typeof loadCurrentServerStamps === 'function' && targetServerId === currentServerId) loadCurrentServerStamps();
  } catch (e) {
    console.error(e);
    alertMessage("削除に失敗しました", "error");
  }
};

window.saDeleteGroup = async function (targetServerId, groupId, isLegacy) {
  if (!await showCustomConfirm("このスタンプを削除しますか？", "削除確認")) return;
  try {
    const path = isLegacy ? `artifacts/${appId}/servers/${targetServerId}/stamps/${groupId}` : `artifacts/${appId}/servers/${targetServerId}/stampGroups/${groupId}`;
    await deleteDoc(doc(db, path));
    alertMessage("削除しました", "success");
    await saLoadStamps(targetServerId);
  } catch (e) { alertMessage("削除に失敗しました", "error"); }
};

setTimeout(() => {
  document.getElementById('saCustomSelectBtn')?.addEventListener('click', (e) => {
    const dd = document.getElementById('saCustomSelectDropdown');
    const icon = document.getElementById('saCustomSelectIcon');
    if (dd.classList.contains('hidden')) {
      dd.classList.remove('hidden');
      setTimeout(() => { dd.classList.remove('opacity-0'); icon.classList.add('rotate-180'); }, 10);
    } else {
      dd.classList.add('opacity-0');
      icon.classList.remove('rotate-180');
      setTimeout(() => dd.classList.add('hidden'), 200);
    }
  });
  document.getElementById('saExistingGroupBtn')?.addEventListener('click', (e) => {
    const dd = document.getElementById('saExistingGroupDropdown');
    const icon = document.getElementById('saExistingGroupIcon');
    if (dd.classList.contains('hidden')) {
      dd.classList.remove('hidden');
      setTimeout(() => { dd.classList.remove('opacity-0'); icon.classList.add('rotate-180'); }, 10);
    } else {
      dd.classList.add('opacity-0');
      icon.classList.remove('rotate-180');
      setTimeout(() => dd.classList.add('hidden'), 200);
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#stampAdminServerSelectContainer')) {
      const dd1 = document.getElementById('saCustomSelectDropdown');
      if (dd1 && !dd1.classList.contains('hidden')) {
        dd1.classList.add('opacity-0');
        document.getElementById('saCustomSelectIcon')?.classList.remove('rotate-180');
        setTimeout(() => dd1.classList.add('hidden'), 200);
      }
    }
    if (!e.target.closest('#saSectionExisting')) {
      const dd2 = document.getElementById('saExistingGroupDropdown');
      if (dd2 && !dd2.classList.contains('hidden')) {
        dd2.classList.add('opacity-0');
        document.getElementById('saExistingGroupIcon')?.classList.remove('rotate-180');
        setTimeout(() => dd2.classList.add('hidden'), 200);
      }
    }
  });
  const tabNew = document.getElementById('saTabNew');
  const tabEx = document.getElementById('saTabExisting');
  const secNew = document.getElementById('saSectionNew');
  const secEx = document.getElementById('saSectionExisting');
  if (tabNew && tabEx && secNew && secEx) {
    tabNew.onclick = () => {
      tabNew.className = "py-2 px-4 text-sm font-bold border-b-2 border-gray-800 text-gray-800 focus:outline-none transition-colors";
      tabEx.className = "py-2 px-4 text-sm font-bold border-b-2 border-transparent text-gray-500 hover:text-gray-700 focus:outline-none transition-colors";
      secNew.classList.remove('hidden');
      secNew.classList.add('block');
      secEx.classList.add('hidden');
      secEx.classList.remove('block');
    };
    tabEx.onclick = () => {
      tabEx.className = "py-2 px-4 text-sm font-bold border-b-2 border-gray-800 text-gray-800 focus:outline-none transition-colors";
      tabNew.className = "py-2 px-4 text-sm font-bold border-b-2 border-transparent text-gray-500 hover:text-gray-700 focus:outline-none transition-colors";
      secEx.classList.remove('hidden');
      secEx.classList.add('block');
      secNew.classList.add('hidden');
      secNew.classList.remove('block');
    };
  }

  document.getElementById("saUploadBtn")?.addEventListener("click", async () => {
    const targetServerId = document.getElementById('stampAdminServerSelect').value;
    if (!targetServerId) return alertMessage("サーバーが選択されていません", "error");
    const nameInput = document.getElementById("saNewGroupName");
    const thumbInput = document.getElementById("saNewGroupThumb");
    const filesInput = document.getElementById("saNewGroupFiles");
    const name = nameInput.value.trim();
    const thumbFile = thumbInput.files[0];
    const stampFiles = Array.from(filesInput.files);
    if (!name || !thumbFile || stampFiles.length === 0) {
      return alertMessage("グループ名、アイコン画像、および1枚以上のスタンプ画像を選択してください", "warning");
    }
    const btn = document.getElementById("saUploadBtn");
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>処理中...';
    btn.disabled = true;
    try {
      const uploadImage = async (file, checkSquare = true) => {
        if (file.size > 2 * 1024 * 1024) throw new Error("画像は2MB以下にしてください");
        const img = new Image();
        const objUrl = URL.createObjectURL(file);
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = objUrl; });
        if (checkSquare && img.width !== img.height) {
          URL.revokeObjectURL(objUrl);
          throw new Error("スタンプ画像とアイコン画像は完全な正方形である必要があります");
        }
        const canvas = document.createElement("canvas");
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 128, 128);
        URL.revokeObjectURL(objUrl);
        const blob = await new Promise(res => canvas.toBlob(res, "image/png", 0.9));
        const stampFile = new File([blob], "stamp.png", { type: "image/png" });
        return await uploadToExternalService(stampFile, () => { }, 'stamps');
      };
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>アイコンをアップロード中...';
      const thumbUrl = await uploadImage(thumbFile, true);
      const uploadedStamps = [];
      for (let i = 0; i < stampFiles.length; i++) {
        btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>スタンプアップロード中... (${i + 1}/${stampFiles.length})`;
        const url = await uploadImage(stampFiles[i], true);
        uploadedStamps.push({ name: `${name}_${i + 1}`, url });
      }
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>保存中...';
      await addDoc(collection(db, `artifacts/${appId}/servers/${targetServerId}/stampGroups`), {
        name: name,
        thumbnailUrl: thumbUrl,
        stamps: uploadedStamps,
        createdBy: userId,
        createdAt: serverTimestamp()
      });
      nameInput.value = ""; thumbInput.value = ""; filesInput.value = "";
      alertMessage("スタンプを追加しました", "success");
      await saLoadStamps(targetServerId);
      if (typeof loadCurrentServerStamps === 'function' && targetServerId === currentServerId) loadCurrentServerStamps();
    } catch (e) {
      console.error(e);
      alertMessage(e.message || "アップロードに失敗しました", "error");
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  });

  document.getElementById("saAppendBtn")?.addEventListener("click", async () => {
    const targetServerId = document.getElementById('stampAdminServerSelect').value;
    const groupId = document.getElementById('saSelectedExistingGroupId').value;
    if (!targetServerId) return alertMessage("サーバーが選択されていません", "error");
    if (!groupId) return alertMessage("対象グループを選択してください", "warning");
    const filesInput = document.getElementById("saAppendFiles");
    const stampFiles = Array.from(filesInput.files);
    if (stampFiles.length === 0) return alertMessage("追加するスタンプ画像を選択してください", "warning");

    const btn = document.getElementById("saAppendBtn");
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>追加中...';
    btn.disabled = true;

    try {
      const uploadedStamps = [];
      for (let i = 0; i < stampFiles.length; i++) {
        btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>画像アップロード中... (${i + 1}/${stampFiles.length})`;
        if (stampFiles[i].size > 2 * 1024 * 1024) throw new Error("画像は2MB以下にしてください");
        const img = new Image();
        const objUrl = URL.createObjectURL(stampFiles[i]);
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = objUrl; });
        if (img.width !== img.height) {
          URL.revokeObjectURL(objUrl);
          throw new Error("スタンプ画像は完全な正方形である必要があります");
        }
        const canvas = document.createElement("canvas");
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 128, 128);
        URL.revokeObjectURL(objUrl);
        const blob = await new Promise(res => canvas.toBlob(res, "image/png", 0.9));
        const stampFile = new File([blob], "stamp.png", { type: "image/png" });
        const url = await uploadToExternalService(stampFile, () => { }, 'stamps');
        const sName = stampFiles[i].name.replace(/\.[^/.]+$/, "");
        uploadedStamps.push({ name: sName, url });
      }

      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>保存中...';
      const groupRef = doc(db, `artifacts/${appId}/servers/${targetServerId}/stampGroups`, groupId);
      await updateDoc(groupRef, {
        stamps: arrayUnion(...uploadedStamps)
      });

      filesInput.value = "";
      alertMessage("既存グループにスタンプを追加しました", "success");
      await saLoadStamps(targetServerId);
      if (typeof loadCurrentServerStamps === 'function' && targetServerId === currentServerId) loadCurrentServerStamps();
    } catch (e) {
      console.error(e);
      alertMessage(e.message || "追加に失敗しました", "error");
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  });
}, 1000);

document.getElementById("createInviteCodeBtn").addEventListener("click", async () => {
  const expiryDays = parseInt(document.getElementById("inviteExpiry").value);
  const maxUses = parseInt(document.getElementById("inviteMaxUses").value);
  const _codeChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const _codeBytes = new Uint8Array(8);
  crypto.getRandomValues(_codeBytes);
  const code = Array.from(_codeBytes).map(b => _codeChars[b % 36]).join('');
  const inviteData = {
    createdBy: userId,
    createdAt: serverTimestamp(),
    uses: 0,
    maxUses,
    disabled: false
  };
  if (expiryDays > 0) {
    const exp = new Date();
    exp.setDate(exp.getDate() + expiryDays);
    inviteData.expiresAt = exp;
  } else {
    inviteData.expiresAt = null;
  }
  try {
    await Promise.all([
      setDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/inviteCodes`, code), inviteData),
      setDoc(doc(db, `artifacts/${appId}/inviteIndex`, code), { serverId: currentServerId }),
    ]);
    await loadInviteCodes();
    alertMessage(`招待コード ${code} を作成しました`, "success");
  } catch (e) { alertMessage("作成に失敗しました", "error"); }
});

// その他タブ
document.getElementById("renameServerBtn").addEventListener("click", async () => {
  const name = document.getElementById("renameServerInput").value.trim();
  if (!name) return;
  try {
    await updateDoc(doc(db, `artifacts/${appId}/servers`, currentServerId), { name });
    document.getElementById("serverNameDisplay").textContent = name;
    document.getElementById("serverSettingsTitle").textContent = name;
    currentServerData = { ...currentServerData, name };
    alertMessage("サーバー名を変更しました", "success");
  } catch (e) { alertMessage("変更に失敗しました", "error"); }
});

document.getElementById("changeServerPasswordBtn").addEventListener("click", async () => {
  const newPass = document.getElementById("changeServerPasswordInput").value;
  if (!newPass || newPass.length < 4) { alertMessage("パスワードは4文字以上にしてください", "error"); return; }
  try {
    const hash = await hashPassword(newPass, currentServerId);
    await setDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/secrets`, 'auth'), { passwordHash: hash }, { merge: true });
    await updateDoc(doc(db, `artifacts/${appId}/servers`, currentServerId), { passwordHash: deleteField() });
    document.getElementById("changeServerPasswordInput").value = "";
    alertMessage("パスワードを変更しました", "success");
  } catch (e) { alertMessage("変更に失敗しました", "error"); }
});

document.getElementById("deleteServerBtn").addEventListener("click", async () => {
  if (!await showCustomConfirm(`「${currentServerData?.name || currentServerId}」を削除しますか？`, "削除する", "キャンセル", "この操作は取り消せません。")) return;
  const canDelete = currentServerData?.createdBy === userId ||
    (currentServerData?.serverAdmins && currentServerData.serverAdmins.includes(userId)) || isAdmin;
  if (!canDelete) { alertMessage("削除できるのはサーバーオーナーのみです", "error"); return; }
  loadingOverlay.classList.remove("hidden");
  try {
    await deleteServerCascade(currentServerId);
    serverSettingsModal.classList.add("hidden");
    leaveServerView();
    alertMessage("サーバーを削除しました", "success");
  } catch (e) { console.error("deleteServer error:", e); alertMessage("削除に失敗しました", "error"); }
  finally { loadingOverlay.classList.add("hidden"); }
});

let isSendingMessage = false;
// ===== サーバーカードコンテキストメニュー =====
let serverCtxData = null;

function showServerContextMenu(server, x, y) {
  serverCtxData = server;
  const menu = document.getElementById("serverContextMenu");
  const isSvAdmin = server.serverAdmins && server.serverAdmins.includes(userId);
  const isOwner = server.createdBy === userId;
  const isJoined = server.joinedUsers && server.joinedUsers.includes(userId);
  // 権限ごとに表示切り替え
  document.getElementById("serverCtxSettings").style.display = (isAdmin || isSvAdmin) ? "" : "none";
  document.getElementById("serverCtxLeave").style.display = (isJoined && !isOwner && !isAdmin) ? "" : "none";
  document.getElementById("serverCtxDeleteSep").style.display = (isAdmin || isOwner) ? "" : "none";
  document.getElementById("serverCtxDelete").style.display = (isAdmin || isOwner) ? "" : "none";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.classList.remove("hidden");
  requestAnimationFrame(() => {
    const r = menu.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) menu.style.left = `${x - r.width}px`;
    if (r.bottom > window.innerHeight - 8) menu.style.top = `${y - r.height}px`;
  });
}

document.getElementById("serverCtxEnter").addEventListener("click", () => {
  if (serverCtxData) enterServer(serverCtxData.id, serverCtxData);
  document.getElementById("serverContextMenu").classList.add("hidden");
});

document.getElementById("serverCtxSettings").addEventListener("click", async () => {
  const sv = serverCtxData;
  document.getElementById("serverContextMenu").classList.add("hidden");
  if (!sv) return;
  await enterServer(sv.id, sv);
  setTimeout(() => openServerSettings(), 600);
});

document.getElementById("serverCtxLeave").addEventListener("click", async () => {
  const sv = serverCtxData;
  document.getElementById("serverContextMenu").classList.add("hidden");
  if (!sv) return;
  if (!await showCustomConfirm(`「${sv.name || sv.id}」を退出しますか？`, "退出する", "キャンセル")) return;
  loadingOverlay.classList.remove("hidden");
  try {
    await updateDoc(doc(db, `artifacts/${appId}/servers`, sv.id), {
      joinedUsers: arrayRemove(userId),
      serverAdmins: arrayRemove(userId),
      memberCount: increment(-1)
    });
    try {
      const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const rtdb = await _getOrInitRTDB();
      await remove(ref(rtdb, `artifacts/${appId}/servers/${sv.id}/members/${userId}`));
    } catch (rtdbErr) { console.warn("RTDB leave sync failed:", rtdbErr); }
    alertMessage("サーバーを退出しました", "success");
  } catch (e) { alertMessage("退出に失敗しました: " + e.message, "error"); }
  finally { loadingOverlay.classList.add("hidden"); }
});

document.getElementById("serverCtxDelete").addEventListener("click", async () => {
  const sv = serverCtxData;
  document.getElementById("serverContextMenu").classList.add("hidden");
  if (!sv) return;
  if (!await showCustomConfirm(`「${sv.name || sv.id}」を削除しますか？`, "削除する", "キャンセル", "この操作は取り消せません。")) return;
  loadingOverlay.classList.remove("hidden");
  try {
    await deleteServerCascade(sv.id);
    alertMessage("サーバーを削除しました", "success");
  } catch (e) { alertMessage("削除に失敗しました: " + e.message, "error"); }
  finally { loadingOverlay.classList.add("hidden"); }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#serverContextMenu")) {
    document.getElementById("serverContextMenu").classList.add("hidden");
  }
});

// 他サーバーのメッセージを監視するグローバルリスナー
let globalNotifListeners = {};

async function setupGlobalNotificationListeners() {
  Object.values(globalNotifListeners).forEach(unsub => unsub());
  globalNotifListeners = {};
  if (!isTauri && currentFcmToken) {
    console.log('🔔 [通知] FCM(プッシュ通知)が有効なため、バックグラウンド監視を最適化しました');
    return;
  }

  try {
    const serversSnap = await getDocs(
      query(collection(db, `artifacts/${appId}/servers`), where("joinedUsers", "array-contains", userId))
    );
    for (const serverDoc of serversSnap.docs) {
      const svId = serverDoc.id;
      const svData = serverDoc.data();
      if (svId === currentServerId) continue;

      const roomsQuery = collection(db, `artifacts/${appId}/servers/${svId}/rooms`);
      let isFirst = true;
      let roomLastNotifTs = {};

      window.__globalRoomsCache = window.__globalRoomsCache || {};
      window.__globalRoomsCache[svId] = window.__globalRoomsCache[svId] || {};

      const unsub = onSnapshot(roomsQuery, snapshot => {
        if (isFirst) {
          isFirst = false;
          snapshot.forEach(doc => {
            const d = doc.data();
            window.__globalRoomsCache[svId][doc.id] = d;
            roomLastNotifTs[doc.id] = typeof d.lastMessageAt === 'number' ? d.lastMessageAt : (d.lastMessageAt?.toMillis?.() || (d.lastMessageAt?.seconds ? d.lastMessageAt.seconds * 1000 : 0));
          });
          return;
        }
        let hasNewMessage = false;
        let newItemsToNotif = [];
        snapshot.docChanges().forEach(change => {
          if (change.type === "modified" || change.type === "added") {
            const roomData = change.doc.data();
            const rmId = change.doc.id;
            window.__globalRoomsCache[svId][rmId] = roomData;
            const rmName = roomData.name || rmId;
            const ts = typeof roomData.lastMessageAt === 'number' ? roomData.lastMessageAt : (roomData.lastMessageAt?.toMillis?.() || (roomData.lastMessageAt?.seconds ? roomData.lastMessageAt.seconds * 1000 : 0));
            const prevTs = roomLastNotifTs[rmId] || 0;

            if (ts > prevTs) {
              roomLastNotifTs[rmId] = ts;
              hasNewMessage = true;
              if (roomData.lastMessageSender && roomData.lastMessageSender !== userId) {
                newItemsToNotif.push({ serverId: svId, serverName: svData.name || svId, roomId: rmId, roomName: rmName, lastAt: ts });
                (async () => {
                  let body = roomData.lastMessageText || '新着メッセージ';
                  try {
                    if (typeof isEncrypted === 'function' && isEncrypted(body)) {
                      const _members = (svData && svData.joinedUsers) || [];
                      body = await decryptText(body, svId, rmId, _members);
                    }
                  } catch (e) { body = '（暗号化されたメッセージ）'; }
                  if (typeof isEncrypted === 'function' && isEncrypted(body)) body = '（暗号化されたメッセージ）';
                  showInAppNotification(
                    svData.name || svId, rmName,
                    'メンバー',
                    body,
                    svId, svData, rmId, rmName
                  );
                  // Push Notification for other servers
                  if (!document.hasFocus()) {
                    if (isTauri) {
                      if (typeof showNotification === 'function') showNotification(`${svData.name || svId} › #${rmName}`, `メンバー: ${body}`, rmId);
                    } else if (!currentFcmToken) {
                      if (typeof showNotification === 'function') showNotification(`${svData.name || svId} › #${rmName}`, `メンバー: ${body}`, rmId);
                    }
                  }
                })();
              }
            }
          }
        });
        // バッジ更新のために即座に更新するか、未読再スキャンをトリガー
        if (hasNewMessage) {
          if (newItemsToNotif.length > 0) {
            try {
              let items = JSON.parse(localStorage.getItem('covo_global_items') || '[]');
              newItemsToNotif.forEach(ni => {
                const idx = items.findIndex(it => it.serverId === ni.serverId && it.roomId === ni.roomId);
                if (idx > -1) items[idx].lastAt = ni.lastAt;
                else items.push(ni);
              });
              items.sort((a, b) => b.lastAt - a.lastAt);
              localStorage.setItem('covo_global_items', JSON.stringify(items));
              if (typeof renderNotifList === 'function') renderNotifList(items);
              if (isTauri && window.__TAURI__?.core?.invoke) {
                window.__TAURI__.core.invoke('set_badge', { hasUnread: items.length > 0 }).catch(() => { });
              }
            } catch (e) { console.error(e); }
          } else if (typeof scanAllUnreadAndRender === 'function') {
            scanAllUnreadAndRender();
          }
        }
      });
      globalNotifListeners[svId] = unsub;
    }
  } catch (e) { console.error("globalNotifListeners error:", e); }
}

function showMentionToast(fromNickname) {
  const box = document.createElement("div");
  box.className = "fixed top-4 right-4 bg-indigo-600 text-white px-4 py-3 rounded-xl shadow-lg z-[9999] text-sm font-medium mention-toast";
  box.style.cssText += "animation: slideUpFade 0.22s ease both;";
  box.innerHTML = `<span class="mention-toast-badge">@メンション</span><span>${escapeHtml(fromNickname)}さんにメンションされました</span>`;
  document.body.appendChild(box);
  setTimeout(() => {
    box.style.animation = "fadeIn 0.2s ease reverse forwards";
    setTimeout(() => box.remove(), 200);
  }, 3500);
}

function showCustomConfirm(message, okText = "確認", cancelText = "キャンセル", subMessage = "") {
  return new Promise(resolve => {
    const modal = document.getElementById("customConfirmModal");
    document.getElementById("customConfirmMessage").textContent = message;
    document.getElementById("customConfirmOk").textContent = okText;
    document.getElementById("customConfirmCancel").textContent = cancelText;
    const subEl = document.getElementById("customConfirmSub");
    if (subMessage) { subEl.textContent = subMessage; subEl.classList.remove("hidden"); }
    else { subEl.classList.add("hidden"); }

    openModal(modal);

    const okBtn = document.getElementById("customConfirmOk");
    const cancelBtn = document.getElementById("customConfirmCancel");

    function onOk() { cleanup(); resolve(true); }
    function onCancel() { cleanup(); resolve(false); }
    function cleanup() {
      modal.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
    }
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}

function showCustomAlert(message) {
  return new Promise(resolve => {
    const modal = document.getElementById("customAlertModal");
    const msgEl = document.getElementById("customAlertMessage");
    if (msgEl) msgEl.textContent = message;
    if (modal) modal.classList.remove("hidden");
    const okBtn = document.getElementById("customAlertOk");
    function onOk() {
      if (modal) modal.classList.add("hidden");
      if (okBtn) okBtn.removeEventListener("click", onOk);
      resolve();
    }
    if (okBtn) okBtn.addEventListener("click", onOk);
    else resolve();
  });
}

// === Discord風UIモード制御JSロジック ===
window.setDiscordUIMode = function (enabled) {
  localStorage.setItem('covo_discord_ui_mode', enabled ? 'true' : 'false');
  document.body.classList.toggle('discord-ui-mode', enabled);
  const pcToggle = document.getElementById('toggleDiscordUI');
  const mobileToggle = document.getElementById('toggleDiscordUIMobile');
  if (pcToggle) pcToggle.checked = enabled;
  if (mobileToggle) mobileToggle.checked = enabled;

  if (enabled) {
    if (!currentServerId) {
      const mode = typeof currentHomeViewMode !== 'undefined' ? currentHomeViewMode : 'dm';
      if (mode === 'discover') {
        document.body.classList.add("discord-home-view", "discord-discover-view");
        document.body.classList.remove("discord-dm-view");
      } else {
        document.body.classList.add("discord-home-view", "discord-dm-view");
        document.body.classList.remove("discord-discover-view");
      }
      const appCont = document.getElementById("appContainer");
      if (appCont) appCont.classList.remove("hidden");
    } else {
      document.body.classList.remove("discord-home-view", "discord-dm-view", "discord-discover-view");
    }
    renderDiscordServerNav();
  } else {
    document.body.classList.remove("discord-home-view", "discord-dm-view", "discord-discover-view");
    if (!currentServerId) {
      const appCont = document.getElementById("appContainer");
      if (appCont) appCont.classList.add("hidden");
      const sls = document.getElementById("serverListScreen");
      if (sls) sls.classList.remove("hidden");
    }
  }
};

window.renderDiscordServerNav = function () {
  const navList = document.getElementById("discordServerNavList");
  const homeGrid = document.getElementById("discordHomeServerGrid");
  const homeBtn = document.getElementById("discordHomeBtn") || document.querySelector(".discord-home-btn");
  const discoverBtn = document.getElementById("discordDiscoverBtn");
  if (!navList) return;
  navList.innerHTML = "";
  if (homeGrid) homeGrid.innerHTML = "";

  const mode = typeof currentHomeViewMode !== 'undefined' ? currentHomeViewMode : 'dm';
  if (!currentServerId) {
    if (mode === 'discover') {
      if (homeBtn) homeBtn.classList.remove("active");
      if (discoverBtn) discoverBtn.classList.add("active");
    } else {
      if (homeBtn) homeBtn.classList.add("active");
      if (discoverBtn) discoverBtn.classList.remove("active");
    }
  } else {
    if (homeBtn) homeBtn.classList.remove("active");
    if (discoverBtn) discoverBtn.classList.remove("active");
  }

  if (typeof allServersCache !== 'undefined' && allServersCache) {
    const servers = [...allServersCache];
    // 順序を一定に固定するため、過去のアクセス順ソート処理を完全排除

    // 未読情報の取得
    let globalItems = [];
    try { globalItems = JSON.parse(localStorage.getItem('covo_global_items') || '[]'); } catch (e) { }

    const joinedServers = servers.filter(server => {
      if (!isAdmin) return (server.joinedUsers || []).includes(userId);
      return (server.joinedUsers || []).includes(userId);
    });
    const unjoinedServers = isAdmin ? servers.filter(server => !(server.joinedUsers || []).includes(userId)) : [];

    const renderServer = (server) => {
      const isMine = server.serverAdmins && server.serverAdmins.includes(userId);
      const hasUnread = globalItems.some(it => it.serverId === server.id);
      const isActive = currentServerId === server.id;

      // 1. 左側サーバーナビゲーションへの追加
      const item = document.createElement("div");
      item.className = `discord-server-item group ${isActive ? 'active' : ''} ${hasUnread ? 'has-unread' : ''}`;
      item.title = server.name || server.id;

      const pill = document.createElement("div");
      pill.className = "discord-server-pill";
      item.appendChild(pill);

      const icon = document.createElement("div");
      icon.className = "discord-server-icon";
      if (server.iconUrl) {
        icon.className += " custom-bg";
        icon.innerHTML = `<img src="${escapeHtml(server.iconUrl)}" class="w-full h-full object-cover" />`;
      } else {
        icon.textContent = (server.name || server.id).charAt(0).toUpperCase();
      }
      item.appendChild(icon);

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        if (currentServerId !== server.id) {
          enterServer(server.id, server);
        }
      });
      navList.appendChild(item);

      // 2. ディスカバリー画面 (homeGrid) への美しいカード追加
      if (homeGrid) {
        const card = document.createElement("div");
        card.className = "discord-server-card p-5 rounded-2xl flex items-center gap-4 cursor-pointer transition-all shadow-md group";

        const cardIcon = document.createElement("div");
        cardIcon.className = "discord-card-icon w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0 overflow-hidden transition-all duration-300 group-hover:rounded-2xl";
        if (server.iconUrl) {
          cardIcon.innerHTML = `<img src="${escapeHtml(server.iconUrl)}" class="w-full h-full object-cover" />`;
        } else {
          cardIcon.textContent = (server.name || server.id).charAt(0).toUpperCase();
        }
        card.appendChild(cardIcon);

        const cardInfo = document.createElement("div");
        cardInfo.className = "flex-1 min-w-0";
        cardInfo.innerHTML = `
              <div class="font-bold text-base truncate mb-1">${escapeHtml(server.name || server.id)}</div>
              <div class="text-xs text-gray-400 flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                <span>${(server.joinedUsers || []).length} 名のメンバー</span>
              </div>
            `;
        card.appendChild(cardInfo);

        const enterBtn = document.createElement("button");
        enterBtn.className = "discord-card-btn font-bold px-5 py-2 rounded-xl text-sm shadow transition-all opacity-90 group-hover:opacity-100";
        enterBtn.textContent = "開く";
        card.appendChild(enterBtn);

        card.addEventListener("click", (e) => {
          e.stopPropagation();
          if (currentServerId !== server.id) {
            enterServer(server.id, server);
          }
        });
        homeGrid.appendChild(card);
      }
    };

    joinedServers.forEach(server => renderServer(server));

    if (isAdmin && unjoinedServers.length > 0) {
      // nav separator
      const navSep = document.createElement("div");
      navSep.className = "w-8 h-0.5 bg-gray-700/50 my-2 mx-auto rounded-full";
      navList.appendChild(navSep);

      // home grid separator
      if (homeGrid) {
        const homeSep = document.createElement("div");
        homeSep.className = "col-span-full border-t border-gray-200 dark:border-gray-800 my-4 flex justify-center";
        homeSep.innerHTML = `<span class="bg-gray-50 dark:bg-gray-900 px-4 text-xs font-bold text-gray-400 -mt-2">未参加のサーバー</span>`;
        homeGrid.appendChild(homeSep);
      }
      unjoinedServers.forEach(server => renderServer(server));
    }

    if (joinedServers.length === 0 && unjoinedServers.length === 0 && homeGrid) {
      homeGrid.innerHTML = `<div class="text-gray-400 font-medium col-span-full py-8 text-center">サーバーがありません。上のボタンから参加しましょう。</div>`;
    }

    // ホーム画面右側の全体メンバーリスト描画（安全なアバター表示）
    const homeMembersSidebar = document.getElementById("discordHomeMembers");
    if (homeMembersSidebar && typeof cachedUsers !== 'undefined' && cachedUsers && cachedUsers.length > 0) {
      const onlines = cachedUsers.filter(u => u.status === 'online' || u.status === 'away');
      const offlines = cachedUsers.filter(u => !u.status || u.status === 'offline');
      
      const formatLastSeen = (u) => {
        if (u.status === 'online') return 'オンライン';
        if (u.status === 'away') return '離席中';
        if (u.lastSeen) {
          try {
            const diff = Date.now() - (u.lastSeen.toDate ? u.lastSeen.toDate().getTime() : u.lastSeen);
            const m = Math.floor(diff / 60000);
            const h = Math.floor(diff / 3600000);
            const d = Math.floor(diff / 86400000);
            if (d > 0) return `${d}日前`;
            if (h > 0) return `${h}時間前`;
            if (m > 0) return `${m}分前`;
            return 'たった今';
          } catch(e) {}
        }
        return 'オフライン';
      };

      const createMemberEl = (u) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-200/50 dark:hover:bg-white/5 cursor-pointer transition-colors';
        const av = document.createElement('div');
        av.className = 'avatar-placeholder relative w-8 h-8 rounded-full flex-shrink-0';
        __setAvatarImg(av, u.avatarUrl, u.nickname || u.email || 'User');
        const stat = document.createElement('div');
        stat.className = `status-indicator ${u.status === 'away' ? 'status-away' : (u.status === 'online' ? 'status-online' : 'status-offline')}`;
        av.appendChild(stat);
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'flex-1 min-w-0 leading-tight';
        nameDiv.innerHTML = `
          <div class="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">${escapeHtml(u.nickname || u.email || 'User')}</div>
          <div class="text-[10px] text-gray-400 font-medium mt-0.5">${formatLastSeen(u)}</div>
        `;
        row.appendChild(av);
        row.appendChild(nameDiv);
        return row;
      };

      homeMembersSidebar.innerHTML = `
        <div class="p-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">ONLINE — ${onlines.length}</div>
        <div id="discordHomeOnlineList" class="space-y-0.5 px-2 pb-3"></div>
        <div class="p-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">OFFLINE — ${offlines.length}</div>
        <div id="discordHomeOfflineList" class="space-y-0.5 px-2 pb-6"></div>
      `;

      const onlineList = document.getElementById("discordHomeOnlineList");
      const offlineList = document.getElementById("discordHomeOfflineList");
      if (onlineList) onlines.forEach(u => onlineList.appendChild(createMemberEl(u)));
      if (offlineList) offlines.forEach(u => offlineList.appendChild(createMemberEl(u)));
    }
  }
};

// 既存のrenderServerList実行時に連動させるためのフックを強化
const _origRenderServerList = window.renderServerList;
window.renderServerList = function () {
  if (_origRenderServerList) _origRenderServerList.apply(this, arguments);
  if (typeof renderDiscordServerNav === 'function') renderDiscordServerNav();
};

// サーバーアイコン変更用JS (Moved from global scope)
// サーバーアイコン変更用JSロジック
const serverIconUploadInput = document.getElementById("serverIconUploadInput");
const newServerIconUploadInput = document.getElementById("newServerIconUploadInput");
const serverIconCropModal = document.getElementById("serverIconCropModal");
const serverIconCropCanvas = document.getElementById("serverIconCropCanvas");
const serverIconZoomSlider = document.getElementById("serverIconZoomSlider");
let sIconImage = null, sIconScale = 1, sIconMinScale = 1;
let sIconOffsetX = 0, sIconOffsetY = 0, sIconIsDragging = false;
let sIconDragStartX = 0, sIconDragStartY = 0, sIconDragStartOffsetX = 0, sIconDragStartOffsetY = 0;
let isNewServerIconCrop = false;
window.pendingNewServerIconBlob = null;
const SICON_SIZE = 240;

if (document.getElementById("serverIconSettingsWrapper") && serverIconUploadInput) {
  document.getElementById("serverIconSettingsWrapper").addEventListener("click", () => {
    if (document.getElementById("serverIconSettingsWrapper").dataset.canEdit === "false") return;
    isNewServerIconCrop = false;
    serverIconUploadInput.click();
  });
}
window.openNewServerIconPicker = function () {
  const newFileInput = document.getElementById("newServerIconUploadInput");
  if (newFileInput) { isNewServerIconCrop = true; newFileInput.click(); }
};

function handleSIconFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  const objectUrl = URL.createObjectURL(file);
  sIconImage = new Image();
  sIconImage.onerror = () => { URL.revokeObjectURL(objectUrl); sIconImage = null; alertMessage("画像の読み込みに失敗しました", "error"); };
  sIconImage.onload = () => {
    URL.revokeObjectURL(objectUrl);
    const scaleX = SICON_SIZE / sIconImage.naturalWidth;
    const scaleY = SICON_SIZE / sIconImage.naturalHeight;
    sIconMinScale = Math.max(scaleX, scaleY);
    sIconScale = sIconMinScale;
    serverIconZoomSlider.min = sIconMinScale;
    serverIconZoomSlider.max = sIconMinScale * 4;
    serverIconZoomSlider.value = sIconScale;
    sIconOffsetX = (SICON_SIZE - sIconImage.naturalWidth * sIconScale) / 2;
    sIconOffsetY = (SICON_SIZE - sIconImage.naturalHeight * sIconScale) / 2;
    document.getElementById('serverIconUploadProgress').classList.add('hidden');
    serverIconCropModal.classList.remove('hidden');
    drawSIconPreview();
  };
  e.target.value = '';
  if (sIconImage) sIconImage.src = objectUrl;
}

if (serverIconUploadInput) serverIconUploadInput.addEventListener("change", handleSIconFileChange);
if (newServerIconUploadInput) newServerIconUploadInput.addEventListener("change", handleSIconFileChange);

function clampSIconOffset() {
  if (!sIconImage) return;
  const maxW = sIconImage.naturalWidth * sIconScale;
  const maxH = sIconImage.naturalHeight * sIconScale;
  if (maxW <= SICON_SIZE) sIconOffsetX = (SICON_SIZE - maxW) / 2;
  else sIconOffsetX = Math.min(0, Math.max(SICON_SIZE - maxW, sIconOffsetX));
  if (maxH <= SICON_SIZE) sIconOffsetY = (SICON_SIZE - maxH) / 2;
  else sIconOffsetY = Math.min(0, Math.max(SICON_SIZE - maxH, sIconOffsetY));
}

function drawSIconPreview() {
  if (!sIconImage) return;
  const ctx = serverIconCropCanvas.getContext('2d');
  ctx.clearRect(0, 0, SICON_SIZE, SICON_SIZE);
  ctx.drawImage(sIconImage, sIconOffsetX, sIconOffsetY, sIconImage.naturalWidth * sIconScale, sIconImage.naturalHeight * sIconScale);
}

serverIconCropCanvas.addEventListener('mousedown', (e) => {
  e.preventDefault(); sIconIsDragging = true;
  sIconDragStartX = e.clientX; sIconDragStartY = e.clientY;
  sIconDragStartOffsetX = sIconOffsetX; sIconDragStartOffsetY = sIconOffsetY;
  serverIconCropCanvas.style.cursor = 'grabbing';
});
document.addEventListener('mousemove', (e) => {
  if (!sIconIsDragging || !sIconImage) return;
  sIconOffsetX = sIconDragStartOffsetX + (e.clientX - sIconDragStartX);
  sIconOffsetY = sIconDragStartOffsetY + (e.clientY - sIconDragStartY);
  clampSIconOffset(); drawSIconPreview();
});
document.addEventListener('mouseup', () => {
  if (sIconIsDragging) { sIconIsDragging = false; serverIconCropCanvas.style.cursor = 'grab'; }
});

// タッチドラッグ対応（スマホ・タブレット）
serverIconCropCanvas.addEventListener('touchstart', (e) => {
  e.preventDefault(); // スクロール防止
  if (e.touches.length !== 1) return;
  sIconIsDragging = true;
  sIconDragStartX = e.touches[0].clientX;
  sIconDragStartY = e.touches[0].clientY;
  sIconDragStartOffsetX = sIconOffsetX;
  sIconDragStartOffsetY = sIconOffsetY;
}, { passive: false });
document.addEventListener('touchmove', (e) => {
  if (!sIconIsDragging || !sIconImage) return;
  if (e.touches.length !== 1) return;
  e.preventDefault(); // スクロール防止
  sIconOffsetX = sIconDragStartOffsetX + (e.touches[0].clientX - sIconDragStartX);
  sIconOffsetY = sIconDragStartOffsetY + (e.touches[0].clientY - sIconDragStartY);
  clampSIconOffset(); drawSIconPreview();
}, { passive: false });
document.addEventListener('touchend', () => {
  if (sIconIsDragging) { sIconIsDragging = false; }
}, { passive: true });

serverIconZoomSlider.addEventListener('input', () => {
  if (!sIconImage) return;
  const newScale = parseFloat(serverIconZoomSlider.value);
  const cx = SICON_SIZE / 2, cy = SICON_SIZE / 2;
  sIconOffsetX = cx - (cx - sIconOffsetX) * (newScale / sIconScale);
  sIconOffsetY = cy - (cy - sIconOffsetY) * (newScale / sIconScale);
  sIconScale = newScale; clampSIconOffset(); drawSIconPreview();
});

document.getElementById('serverIconCropCancel').addEventListener('click', () => {
  serverIconCropModal.classList.add('hidden'); sIconImage = null;
  if (serverIconUploadInput) serverIconUploadInput.value = '';
  const newFileInput = document.getElementById("newServerIconUploadInput");
  if (newFileInput) newFileInput.value = '';
});

document.getElementById('serverIconCropConfirm').addEventListener('click', async () => {
  if (!sIconImage) return;
  if (!isNewServerIconCrop && !currentServerId) return;

  // 元画像サイズを考慮した最適な出力解像度（最大1024px）
  const maxOutputSize = 1024;
  const OUTPUT = Math.min(maxOutputSize, Math.max(
    sIconImage.naturalWidth * sIconScale,
    sIconImage.naturalHeight * sIconScale,
    640 // 最低限640px
  ));
  const offscreen = document.createElement('canvas');
  offscreen.width = OUTPUT; offscreen.height = OUTPUT;
  const offCtx = offscreen.getContext('2d');
  offCtx.imageSmoothingEnabled = true; offCtx.imageSmoothingQuality = 'high';
  const sf = OUTPUT / SICON_SIZE;
  offCtx.drawImage(sIconImage, sIconOffsetX * sf, sIconOffsetY * sf, sIconImage.naturalWidth * sIconScale * sf, sIconImage.naturalHeight * sIconScale * sf);

  // WebP対応確認（非対応の場合はJPEGにフォールバック）
  const supportsWebp = offscreen.toDataURL('image/webp').startsWith('data:image/webp');
  const mimeType = supportsWebp ? 'image/webp' : 'image/jpeg';
  const quality = 0.95;
  const ext = supportsWebp ? 'webp' : 'jpg';

  offscreen.toBlob(async (blob) => {
    if (!blob) { alertMessage("クロップに失敗しました", "error"); return; }

    if (isNewServerIconCrop) {
      window.pendingNewServerIconBlob = blob;
      const previewContent = document.getElementById("newServerIconPreviewContent");
      const previewWrapper = document.getElementById("newServerIconPreviewWrapper");
      if (previewContent && previewWrapper) {
        const tempUrl = URL.createObjectURL(blob);
        previewContent.innerHTML = `<img src="${tempUrl}" class="w-full h-full object-cover" />`;
        previewWrapper.className = previewWrapper.className.replace("rounded-full", "rounded-2xl");
      }
      serverIconCropModal.classList.add('hidden');
      sIconImage = null;
      alertMessage("サーバーアイコンのプレビューを設定しました", "success");
      return;
    }

    const progressDiv = document.getElementById('serverIconUploadProgress');
    const progressFill = document.getElementById('serverIconUploadProgressFill');
    const progressText = document.getElementById('serverIconUploadProgressText');
    const confirmBtn = document.getElementById('serverIconCropConfirm');
    const cancelBtn = document.getElementById('serverIconCropCancel');
    progressDiv.classList.remove('hidden'); progressFill.style.width = '0%';
    confirmBtn.disabled = true; cancelBtn.disabled = true;
    try {
      const fileUrl = await uploadToExternalService(
        new File([blob], `server_icon.${ext}`, { type: mimeType }),
        (pct) => { progressFill.style.width = pct + '%'; progressText.textContent = `アップロード中... ${pct}%`; },
        'simplechat/servericons'
      );

      await updateDoc(doc(db, `artifacts/${appId}/servers`, currentServerId), { iconUrl: fileUrl });

      if (currentServerData) currentServerData.iconUrl = fileUrl;
      if (window.__globalRoomsCache && window.__globalRoomsCache[currentServerId]) {
        window.__globalRoomsCache[currentServerId].iconUrl = fileUrl;
      }
      const iconPreview = document.getElementById("serverIconSettingsPreview");
      if (iconPreview) {
        iconPreview.innerHTML = `<img src="${fileUrl}" class="w-full h-full object-cover" />`;
        iconPreview.style.backgroundColor = "transparent";
      }
      if (typeof renderServerList === 'function') renderServerList();
      if (typeof renderDiscordServerNav === 'function') renderDiscordServerNav();
      serverIconCropModal.classList.add('hidden');
      sIconImage = null;
      alertMessage("サーバーアイコンを更新しました", "success");
    } catch (err) {
      console.error(err); alertMessage("アップロードに失敗しました: " + err.message, "error");
    } finally { confirmBtn.disabled = false; cancelBtn.disabled = false; }
  }, mimeType, quality);
});
