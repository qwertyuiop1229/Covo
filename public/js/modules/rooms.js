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

// ================= ROOMS MODULE ================
// =========================================================================
// Room Features (Server-based)
// =========================================================================
function loadServerRooms(serverId, _retry = 0) {
  if (loadServerRooms._unsub) { loadServerRooms._unsub(); }

  const roomsQuery = query(collection(db, `artifacts/${appId}/servers/${serverId}/rooms`));

  let hasLoaded = false;

  function renderRooms(snapshot) {
    hasLoaded = true;
    roomList.innerHTML = "";
    const currentRoomIds = new Set();
    const roomDocs = [];
    snapshot.forEach(docSnap => roomDocs.push(docSnap));
    roomDocs.sort((a, b) => (a.data().order || 0) - (b.data().order || 0));

    let categories = currentServerData?.categories || [];
    if (!Array.isArray(categories)) categories = Object.values(categories);
    categories.sort((a, b) => a.order - b.order);

    const renderSingleRoom = (docSnap) => {
      currentRoomIds.add(docSnap.id);
      const room = docSnap.data();
      roomNames[docSnap.id] = room.name;
      const div = document.createElement("div");
      // ライトモードはしっかり濃い text-slate-800、ホバー時も青色にならず洗練された濃色グレー。ダークモードのホバー時も安っぽくなく自然に調和し、透明感のある薄グレー背景(slate-600/30)とキリッとした枠線(slate-500/60)が浮かび上がる極上の共通大人デザイン
      div.className = "flex items-center justify-between py-1 px-2 mb-0.5 text-sm cursor-pointer group room-item-animate";
      div.id = `room-item-${docSnap.id}`;
      if (docSnap.id === currentRoomId) div.classList.add("active");
      div.addEventListener("click", () => selectRoom(docSnap.id, room.name));

      const nameDiv = document.createElement("div");
      nameDiv.className = "flex items-center gap-1.5 flex-1 truncate text-left";
      nameDiv.innerHTML = `<span class="room-hashtag text-lg font-normal transition-colors mr-1">#</span><span class="truncate">${escapeHtml(room.name)}</span>`;

      const rm = JSON.parse(localStorage.getItem('covo_last_read') || '{}');
      const lastRead = rm[docSnap.id] || 0;
      const lastMsgAt = typeof room.lastMessageAt === 'number' ? room.lastMessageAt : (room.lastMessageAt?.toMillis?.() || (room.lastMessageAt?.seconds ? room.lastMessageAt.seconds * 1000 : 0));
      const isNotCurrentOrHidden = (docSnap.id !== currentRoomId) || !document.hasFocus();
      const bySelf = room.lastMessageSender && room.lastMessageSender === userId;

      if (!isNotCurrentOrHidden && lastMsgAt > lastRead && !bySelf) {
        try {
          // Ensure the read timestamp is strictly greater than the message timestamp to prevent clock skew issues
          const newRead = Math.max(Date.now(), lastMsgAt) + 10000;
          rm[docSnap.id] = newRead;
          localStorage.setItem('covo_last_read', JSON.stringify(rm));
        } catch (e) { }
      }

      const isUnread = (lastMsgAt > lastRead) && isNotCurrentOrHidden && !bySelf;
      unreadCounts[docSnap.id] = isUnread ? 1 : 0;

      const rightContainer = document.createElement("div");
      rightContainer.className = "flex items-center gap-1";

      const badgeSpan = document.createElement("span");
      badgeSpan.className = "unread-badge mr-1";
      badgeSpan.id = `unread-badge-${docSnap.id}`;
      badgeSpan.style.display = isUnread ? "block" : "none";
      rightContainer.appendChild(badgeSpan);

      div.appendChild(nameDiv);
      div.appendChild(rightContainer);
      return div;
    };

    // 1. Categories and their rooms
    categories.forEach(cat => {
      const catRooms = roomDocs.filter(d => d.data().categoryId === cat.id);

      const catDiv = document.createElement("div");
      catDiv.className = "flex items-center px-1 mt-4 mb-1 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider select-none group";
      catDiv.innerHTML = `<i class="fas fa-chevron-down mr-1.5 text-[9px] transition-transform"></i>${escapeHtml(cat.name)}`;
      roomList.appendChild(catDiv);

      if (catRooms.length > 0) {
        const roomContainer = document.createElement("div");
        catRooms.forEach(d => {
          roomContainer.appendChild(renderSingleRoom(d));
        });
        roomList.appendChild(roomContainer);
      } else {
        // Empty category placeholder? (Optional: could hide or show something else)
      }
    });

    // 2. Uncategorized rooms
    const uncatRooms = roomDocs.filter(d => !d.data().categoryId);
    if (uncatRooms.length > 0) {
      if (categories.length > 0) {
        const uncatDiv = document.createElement("div");
        uncatDiv.className = "flex items-center px-1 mt-4 mb-1 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider select-none";
        uncatDiv.innerHTML = `<i class="fas fa-minus mr-1.5 text-[9px]"></i>その他`;
        roomList.appendChild(uncatDiv);
      }
      const roomContainer = document.createElement("div");
      uncatRooms.forEach(d => {
        roomContainer.appendChild(renderSingleRoom(d));
      });
      roomList.appendChild(roomContainer);
    }

    // covo_global_items は updateGlobalNotifUI や requestScanAllUnread で管理されるため、
    // ここでの boolean 保存(covo_server_unread)は廃止しました。
  }

  window.changeRoomOrder = async function (roomId, direction, currentOrder) {
    if (!currentServerId || !roomId) return;
    const newOrder = currentOrder + direction;
    try {

      await updateDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${roomId}`), { order: newOrder });

    } catch (e) { console.error(e); }
  };

  let isRoomsFirst = true;
  function onRoomsChanged(snapshot) {
    renderRooms(snapshot);
    if (!isRoomsFirst) {
      snapshot.docChanges().forEach(change => {
        if (change.type === "modified") {
          const room = change.doc.data();
          const lastMsgAt = typeof room.lastMessageAt === 'number' ? room.lastMessageAt : (room.lastMessageAt?.toMillis?.() || (room.lastMessageAt?.seconds ? room.lastMessageAt.seconds * 1000 : 0));
          const rm = JSON.parse(localStorage.getItem('covo_last_read') || '{}');
          const lastRead = rm[change.doc.id] || 0;
          const isNotCurrentOrHidden = (change.doc.id !== currentRoomId) || !document.hasFocus();
          if (lastMsgAt > lastRead && isNotCurrentOrHidden && room.lastMessageSender && room.lastMessageSender !== userId) {
            updateGlobalNotifUI();
            const serverName = currentServerData?.name || 'Covo';
            const roomName = room.name || 'room';
            let text = room.lastMessageText || '新着メッセージ';

            (async () => {
              try {
                if (typeof isEncrypted === 'function' && isEncrypted(text)) {
                  const _members = (currentServerData && currentServerData.joinedUsers) || [];
                  text = await decryptText(text, currentServerId, change.doc.id, _members);
                }
              } catch (e) { text = '（暗号化されたメッセージ）'; }
              if (typeof isEncrypted === 'function' && isEncrypted(text)) text = '（暗号化されたメッセージ）';

              const isMentioned = text && typeof text === "string" && (text.includes(`@${userNickname}`) || text.includes('@all'));
              if (isMentioned && !document.hasFocus()) {
                // Fallback mention toast when not focused is handled by showNotification title
              }

              const title = isMentioned ? `[@メンション] ${serverName} › #${roomName}` : `${serverName} › #${roomName}`;

              // In-app Notification
              if (typeof showInAppNotification === 'function') {
                showInAppNotification(serverName, roomName, "メンバー", text, currentServerId, currentServerData, change.doc.id, roomName);
              }
              // Push Notification
              if (!document.hasFocus()) {
                if (isTauri) {
                  if (typeof showNotification === 'function') showNotification(title, `メンバー: ${text}`, change.doc.id);
                } else if (!currentFcmToken) {
                  if (typeof showNotification === 'function') showNotification(title, `メンバー: ${text}`, change.doc.id);
                }
              }
            })();
          }
        }
      });
    }
    isRoomsFirst = false;
  }

  loadServerRooms._unsub = onSnapshot(roomsQuery, onRoomsChanged, async (error) => {
    console.error("loadServerRooms error:", error);
    if (_retry < 3 && currentServerId === serverId) {
      try { await auth.currentUser?.getIdToken(true); } catch (_) { }
      setTimeout(() => loadServerRooms(serverId, _retry + 1), 1200 * (_retry + 1));
    }
  });

  // Firebaseリスナー沈黙（ハング）対策のKickstart強制取得
  getDocs(roomsQuery).then(snap => {
    if (currentServerId === serverId && snap.size > 0 && roomList.children.length === 0) {
      renderRooms(snap);
    }
  }).catch(e => console.error("loadServerRooms kickstart error:", e));

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown-container")) {
      document.querySelectorAll(".dropdown-content").forEach(d => d.style.display = "none");
    }
    if (!e.target.closest("#pcNotifModal") && !e.target.closest("#serverListNotifBtn")) {
      const pm = document.getElementById('pcNotifModal');
      if (pm) pm.style.display = 'none';
    }
  });
}

function updateUnreadBadge(roomId) {
  const badge = document.getElementById(`unread-badge-${roomId}`);
  if (!badge) return;
  const count = unreadCounts[roomId] || 0;
  badge.style.display = (count > 0 && roomId !== currentRoomId) ? "block" : "none";
}

function updateServerCardDots() {
  try {
    const items = JSON.parse(localStorage.getItem('covo_global_items') || '[]');
    document.querySelectorAll('.server-card[data-server-id]').forEach(card => {
      const sid = card.dataset.serverId;
      let dot = card.querySelector('.server-card-unread-dot');
      if (sid !== currentServerId && items.some(it => it.serverId === sid)) {
        if (!dot) { dot = document.createElement('span'); dot.className = 'server-card-unread-dot'; card.appendChild(dot); }
        dot.style.display = 'block';
      } else if (dot) {
        dot.style.display = 'none';
      }
    });
  } catch (e) { }
}

async function loadOlderMessages() {
  if (!hasMoreOlderMessages || isLoadingOlderMessages) return;
  if (allLoadedMessages.length === 0) return;
  isLoadingOlderMessages = true;
  const spinner = document.getElementById('topLoadingSpinner');
  const spinnerText = document.getElementById('topLoadingSpinnerText');
  if (spinnerText) spinnerText.textContent = "読み込み中...";
  if (spinner) spinner.style.display = 'flex';

  try {
    if (window.globalUseRtdb) {
      const { ref, get, query: rtdbQuery, limitToLast, orderByChild, endAt } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const rtdb = await _getOrInitRTDB();
      // Oldest message is at the end of the array (since we sort descending)
      const oldestMessage = allLoadedMessages[0];
      const rtdbTime = getMsgTimestamp(oldestMessage);

      const messagesRef = ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`);
      const q = rtdbQuery(messagesRef, orderByChild('timestamp'), endAt(rtdbTime, oldestMessage.id), limitToLast(21));
      const snapshot = await get(q);

      if (snapshot.exists()) {

        const data = snapshot.val();
        let docs = Object.keys(data).map(k => ({ ...data[k], id: k }));
        docs.sort((a, b) => getMsgTimestamp(b) - getMsgTimestamp(a)); // descending

        const _members = (currentServerData && currentServerData.joinedUsers) || [];
        await decryptMessagesInPlace(docs, currentServerId, currentRoomId, _members).catch(() => { });

        // endAt(..., id) に合致する基準メッセージ自体を除外
        docs = docs.filter(d => d.id !== oldestMessage.id);

        if (docs.length > 0) {
          allLoadedMessages = [...allLoadedMessages, ...docs];
          const seen = new Set();
          allLoadedMessages = allLoadedMessages.filter(m => {
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
          });
          allLoadedMessages.sort((a, b) => getMsgTimestamp(a) - getMsgTimestamp(b));
          lastMessagesData = [...allLoadedMessages];
          messagesIndexMap = {};
          lastMessagesData.forEach((m, i) => messagesIndexMap[m.id] = i);

          renderMessagesWithReadReceipts();

          rtdbMessagesLimit += docs.length; // keep limit expanded
        }
        if (docs.length < 20) {
          hasMoreOlderMessages = false;
        }
      } else {
        hasMoreOlderMessages = false;
      }

    } else {
      const oldestMessage = allLoadedMessages[0];
      if (!oldestMessage) throw new Error("No oldest message");
      const docRef = doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`, oldestMessage.id);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        hasMoreOlderMessages = false;
        throw new Error("Doc not found");
      }

      messageLimit += 20;
      const q = query(
        collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`),
        orderBy("timestamp", "desc"),
        startAfter(docSnap),
        limit(20)
      );
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        hasMoreOlderMessages = false;
      } else {
        const olderDocs = [];
        querySnapshot.forEach(d => {
          const data = d.data(); data.id = d.id;
          olderDocs.push(data);
        });
        const _members = (currentServerData && currentServerData.joinedUsers) || [];
        await decryptMessagesInPlace(olderDocs, currentServerId, currentRoomId, _members).catch(() => { });

        allLoadedMessages = [...allLoadedMessages, ...olderDocs];
        const seen = new Set();
        allLoadedMessages = allLoadedMessages.filter(m => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
        allLoadedMessages.sort((a, b) => getMsgTimestamp(a) - getMsgTimestamp(b));
        lastMessagesData = [...allLoadedMessages];
        renderMessagesWithReadReceipts();

        if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
        if (window.rtdbMessagesUnsub) { window.rtdbMessagesUnsub(); window.rtdbMessagesUnsub = null; }
        const newQ = query(
          collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`),
          orderBy("timestamp", "desc"),
          limit(messageLimit)
        );
        unsubscribeMessages = onSnapshot(newQ, async (snap) => {
          // Reduced for brevity in script, rely on main subscriber update
        });
      }
    }
  } catch (e) {
    console.error("Older messages load error", e);
  }

  isLoadingOlderMessages = false;
  if (spinner) spinner.style.display = 'none';
  allowPagination = true;
}

function subscribeToMessages() {
  if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
  if (window.rtdbMessagesUnsub) { window.rtdbMessagesUnsub(); window.rtdbMessagesUnsub = null; }

  allLoadedMessages = [];
  hasMoreOlderMessages = true;
  isLoadingOlderMessages = false;
  rtdbMessagesLimit = 20;
  const spinner = document.getElementById('topLoadingSpinner');
  if (spinner) spinner.style.display = 'none';

  subscribeToMessagesRTDB();
}

async function subscribeToMessagesRTDB() {
  const { ref, onChildAdded, onChildChanged, onChildRemoved, query: rtdbQuery, limitToLast, orderByChild, off, get } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
  const rtdb = await _getOrInitRTDB();
  const messagesRef = ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`);
  const q = rtdbQuery(messagesRef, orderByChild('timestamp'), limitToLast(rtdbMessagesLimit));

  let initialLoadTimeout = null;
  let buffer = [];
  let isInitialPhase = true;

  const processBuffer = async () => {
    if (buffer.length === 0) return;
    const docsToProcess = [...buffer];
    buffer = [];

    const _members = (currentServerData && currentServerData.joinedUsers) || [];
    await decryptMessagesInPlace(docsToProcess, currentServerId, currentRoomId, _members).catch(() => { });

    docsToProcess.forEach(msg => {
      const idx = allLoadedMessages.findIndex(m => m.id === msg.id);
      if (idx >= 0) allLoadedMessages[idx] = msg;
      else allLoadedMessages.push(msg);
    });

    // Sort descending (newest first) to match Firestore reversed array
    allLoadedMessages.sort((a, b) => getMsgTimestamp(a) - getMsgTimestamp(b));
    lastMessagesData = [...allLoadedMessages];
    messagesIndexMap = {};
    lastMessagesData.forEach((m, i) => messagesIndexMap[m.id] = i);

    renderPinnedMessages();
    renderMessagesWithReadReceipts();
    updateReadReceiptForCurrentUser();
  };

  const handleAdded = async (snapshot) => {
    const data = snapshot.val();
    data.id = snapshot.key;

    // Notification logic
    if (!isInitialPhase && data.senderId !== userId) {
      let bodyText = data.text;
      try {
        if (isEncrypted(bodyText)) {
          const _members = (currentServerData && currentServerData.joinedUsers) || [];
          bodyText = await decryptText(bodyText, currentServerId, currentRoomId, _members);
        }
      } catch (e) { }
      const isMentioned = bodyText && typeof bodyText === "string" && (bodyText.includes(`@${userNickname}`) || bodyText.includes('@all'));
      if (isMentioned && document.hasFocus()) {
        showMentionToast(data.senderNickname || "ユーザー");
      }
    }

    buffer.push(data);
    if (initialLoadTimeout) clearTimeout(initialLoadTimeout);
    initialLoadTimeout = setTimeout(() => {
      if (isInitialPhase) {
        isInitialPhase = false;
        isInitialMessageLoad = true;
        processBuffer().then(() => {
          messagesDisplay.scrollTop = 0;
          requestAnimationFrame(() => { messagesDisplay.scrollTop = 0; });
          isInitialMessageLoad = false;
          setTimeout(() => {
            allowPagination = true;
            if (messagesDisplay.scrollHeight <= messagesDisplay.clientHeight && hasMoreOlderMessages) {
              loadOlderMessages();
            }
          }, 500);
        });
      } else {
        const wasScrolledToBottom = (messagesDisplay.scrollTop <= 50);
        processBuffer().then(() => {
          if (wasScrolledToBottom) messagesDisplay.scrollTop = 0;
        });
      }
    }, 100);
  };

  const handleChanged = async (snapshot) => {
    const data = snapshot.val();
    data.id = snapshot.key;
    buffer.push(data);
    processBuffer();
  };

  const handleRemoved = (snapshot) => {
    allLoadedMessages = allLoadedMessages.filter(m => m.id !== snapshot.key);
    lastMessagesData = [...allLoadedMessages];
    renderMessagesWithReadReceipts();
  };

  onChildAdded(q, handleAdded);
  onChildChanged(q, handleChanged);
  onChildRemoved(q, handleRemoved);

  const typingRef = ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/typing`);
  if (window.typingUnsubscribe) { window.typingUnsubscribe(); }
  const { onValue } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
  const onTyping = onValue(typingRef, (snap) => {
    const now = Date.now();
    const others = [];
    snap.forEach((child) => {
      if (child.key !== userId) {
        const data = child.val();
        if (data && data.t && (now - data.t) < 10000) {
          others.push(data.n);
        }
      }
    });
    const indicator = document.getElementById('typingIndicator');
    if (others.length > 0) {
      indicator.textContent = others.join(', ') + ' が入力中...';
      indicator.classList.remove('hidden');
    } else {
      indicator.classList.add('hidden');
    }
  });
  window.typingUnsubscribe = () => off(typingRef, 'value', onTyping);

  const rrRef = ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/readReceipts`);
  if (window.readReceiptsUnsubscribe) { window.readReceiptsUnsubscribe(); }
  const onRR = onValue(rrRef, (snap) => {
    roomReadReceipts = {};
    snap.forEach((child) => {
      roomReadReceipts[child.key] = child.val();
    });
    renderMessagesWithReadReceipts();
  });
  window.readReceiptsUnsubscribe = () => off(rrRef, 'value', onRR);

  window.rtdbMessagesUnsub = () => {
    off(q);
    if (window.typingUnsubscribe) window.typingUnsubscribe();
    if (window.readReceiptsUnsubscribe) window.readReceiptsUnsubscribe();
  };

  membersSidebar.classList.remove("hidden");
}

// subscribeToMessagesFirestore removed (permanently using RTDB)
function selectRoom(roomId, roomName) {
  // スマホの場合、同じルームをタップしてもチャット画面に遷移（サイドバーを隠す）させる
  if (window.innerWidth < 768 && currentRoomId === roomId) {
    sidebar.classList.add("mobile-hidden");
    currentRoomHeader.classList.remove("hidden");
    return;
  }

  if (currentRoomId === roomId) return;
  currentRoomId = roomId;
  // 未読境界をリセットし、上書き前の「前回までの最終既読時刻」を捕まえる
  unreadBoundaryAt = 0;
  unreadBoundaryMessageId = null;
  try {
    const rm = JSON.parse(localStorage.getItem('covo_last_read') || '{}');
    // covo_last_read には「+60000/+10000」した先読み値が入るので、その分を引いて実際の既読時刻に戻す
    const prevRead = rm[roomId];
    if (typeof prevRead === 'number' && prevRead > 0) {
      unreadBoundaryAt = prevRead - 60000;
    }
    if (typeof updateLocalAndRemoteReadState === 'function') {
      updateLocalAndRemoteReadState(roomId, Date.now() + 60000);
    } else {
      rm[roomId] = Date.now() + 60000;
      localStorage.setItem('covo_last_read', JSON.stringify(rm));
    }
    const badge = document.getElementById('unread-badge-' + roomId);
    if (badge) badge.style.display = 'none';
  } catch (e) { }
  updateUserStatus('online'); // Sync room selection for notifications
  document.querySelectorAll('.room-item-animate').forEach(el => el.classList.remove('active'));
  const activeItem = document.getElementById('room-item-' + roomId);
  if (activeItem) activeItem.classList.add('active');
  currentRoomTitleText.textContent = roomName;
  currentRoomHeader.classList.remove("hidden");
  clearMessagesDOM();
  lastMessagesData = [];
  messageInput.disabled = false;
  fileAttachButton.disabled = false;
  { const sb = document.getElementById('stickerButton'); if (sb) sb.disabled = false; }
  { const pmb = document.getElementById('plusMenuButton'); if (pmb) pmb.disabled = false; }
  document.getElementById('callButton').disabled = false;
  { const fsb = document.getElementById('fileShareButton'); if (fsb) fsb.disabled = false; }
  prewarmPeerConnection();
  sendMessageButton.disabled = false;
  messageLimit = 20; // ルームに入り直したらリミットをリセット
  clearAttachedFile();
  cancelReply();

  // 未読バッジを確実かつ即座にクリア
  unreadCounts[roomId] = 0;
  const badgeElem = document.getElementById(`unread-badge-${roomId}`);
  if (badgeElem) badgeElem.style.display = 'none';
  updateGlobalNotifUI();
  updateUnreadBadge(roomId);
  if (isTauri && window.__TAURI__?.core?.invoke) {
    let globalCount = 0;
    try { globalCount = JSON.parse(localStorage.getItem('covo_global_items') || '[]').length; } catch (e) { }
    window.__TAURI__.core.invoke('set_badge', { hasUnread: globalCount > 0 }).catch(() => { });
  }

  // スマホ: サイドバーを隠してチャットを表示し、ボトムナビを隠す
  if (window.innerWidth < 768) {
    sidebar.classList.add("mobile-hidden");
    const bottomNav = document.getElementById("mobileBottomNav");
    if (bottomNav) bottomNav.style.display = "none";
    document.body.classList.add('in-chat-view');
    if (typeof updateMetaThemeColor === 'function') updateMetaThemeColor();
  }

  if (readReceiptsUnsubscribe) readReceiptsUnsubscribe();
  if (typingUnsubscribe) { typingUnsubscribe(); typingUnsubscribe = null; }
  clearTimeout(typingTimeout);
  isCurrentlyTyping = false;
  setTypingStatus(false);

  isInitialMessageLoad = true;
  allLoadedMessages = [];
  hasMoreOlderMessages = true;
  isLoadingOlderMessages = false;

  subscribeToMessages();


  // E2EE: 入室時にルーム鍵を準備し、まだ鍵を持たない参加メンバーへ自動補完 ＆ 復号エラー者の全自動レスキュー・自己治癒監視
  (async () => {
    try {
      if (typeof ensureE2EEKeys === 'function') await ensureE2EEKeys(); // 新規アカウントの公開鍵を確実化
      const members = (currentServerData && currentServerData.joinedUsers) || [];
      const key = await getOrCreateRoomKey(currentServerId, currentRoomId, members);
      if (key) {
        await backfillRoomKeysForMembers(currentServerId, currentRoomId, members);
        // 【完璧なP2Pレスキュー監視機構】復号化エラーで救済リクエストを出している人を自動検知して鍵を配布

        const resSnap = await getDocs(collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/rescueRequests`));
        if (!resSnap.empty) {
          const rawKey = await window.crypto.subtle.exportKey("raw", key.latest);
          for (const resDoc of resSnap.docs) {
            const reqUserId = resDoc.id;
            await _distributeRoomKeyVersion(currentServerId, currentRoomId, rawKey, [reqUserId], key.latestVersion);
            await deleteDoc(resDoc.ref);
          }
        }

      } else {
        // 新規アカウントが鍵を持たない場合、救済リクエスト後の鍵到着を監視して自動リロード（自己治癒）
        let retryCount = 0;
        const checkTimer = setInterval(async () => {
          retryCount++;
          if (retryCount > 15 || _e2ee.roomKeyCache[currentRoomId]) { clearInterval(checkTimer); return; }
          const arrived = await getOrCreateRoomKey(currentServerId, currentRoomId, members);
          if (arrived) {
            clearInterval(checkTimer);
            if (typeof renderMessagesWithReadReceipts === 'function') renderMessagesWithReadReceipts();
          }
        }, 2000);
      }
    } catch (e) { }
  })();

  const rrRef = collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/readReceipts`);
  readReceiptsUnsubscribe = onSnapshot(rrRef, (snap) => {
    roomReadReceipts = {};
    snap.forEach(d => roomReadReceipts[d.id] = d.data());
    renderMessagesWithReadReceipts();
  });

  const typingColRef = collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/typing`);
  typingUnsubscribe = onSnapshot(typingColRef, (snap) => {
    const now = Date.now();
    const others = snap.docs
      .filter(d => d.id !== userId)
      .filter(d => {
        const t = d.data().t;
        if (!t || !t.toDate) return true;
        return (now - t.toDate().getTime()) < 10000;
      })
      .map(d => d.data().n)
      .filter(Boolean);
    const indicator = document.getElementById('typingIndicator');
    if (others.length > 0) {
      indicator.textContent = others.join(', ') + ' が入力中...';
      indicator.classList.remove('hidden');
    } else {
      indicator.classList.add('hidden');
    }
  });

  membersSidebar.classList.remove("hidden");
}

let floatingDateTimer = null;
messagesDisplay.addEventListener("scroll", async () => {
  if (!allowPagination) return;

  const floatingContainer = document.getElementById('floatingDateContainer');
  const floatingBadge = document.getElementById('floatingDateBadge');
  if (floatingContainer && floatingBadge) {
    const viewTop = messagesDisplay.scrollTop + messagesDisplay.clientHeight;
    const dividers = Array.from(messagesDisplay.querySelectorAll('.date-divider'));

    // 1. チャット内ディバイダーは一切いじらない（そのまま残す）
    dividers.forEach(div => {
      const inner = div.querySelector('.date-divider-inner');
      if (inner) inner.style.opacity = '1';
    });

    // 2. viewTop（画面最上部）の直下に存在する「現在の日付」と、衝突しつつある「押し出し日付」を特定する
    // DOMツリー上は上が最新(offsetTop小)、下が過去(offsetTop大)。
    // viewTop以下のうち最もoffsetTopが大きいもの（画面最上部に位置するもの）が activeDivider となる
    let activeDivider = null;
    let pushingDivider = null;

    for (let i = 0; i < dividers.length; i++) {
      const top = dividers[i].offsetTop;
      if (top <= viewTop) {
        if (!activeDivider || top > activeDivider.offsetTop) {
          activeDivider = dividers[i];
        }
      }
    }

    // 次に、activeDivider の1つ新しい側（offsetTopが小さい側＝下から昇ってくる側）のディバイダーが、
    // viewTopから下方向へ 38px 以内（バッジの高さ付近）にめり込んでいるかを判定する
    if (activeDivider) {
      for (let j = 0; j < dividers.length; j++) {
        const top = dividers[j].offsetTop;
        if (top < activeDivider.offsetTop && top > viewTop - 38) {
          pushingDivider = dividers[j];
          break;
        }
      }
    }

    if (activeDivider && messagesDisplay.scrollTop > 50) {
      const text = activeDivider.textContent.trim();
      if (text) {
        if (floatingBadge.textContent !== text) {
          floatingBadge.textContent = text;
        }

        // ★PC・スマホ両方でチャット内の日付バッジとミリ単位で座標を完全一致させる神業
        const activeInner = activeDivider.querySelector('.date-divider-inner');
        if (activeInner) {
          const rect = activeInner.getBoundingClientRect();
          const containerRect = floatingContainer.getBoundingClientRect();
          const offsetLeft = rect.left - containerRect.left;
          floatingBadge.style.position = 'absolute';
          floatingBadge.style.left = `${offsetLeft}px`;
          floatingBadge.style.width = `${rect.width}px`;
        }

        // 押し出しアニメーション（Sticky Pushing Replacement Effect）の計算
        if (pushingDivider) {
          const diff = viewTop - pushingDivider.offsetTop; // 0px 〜 38px
          const translateY = -(diff); // ぶつかり始め(0px)から上に押し出されていく(-38px)
          floatingContainer.style.transform = `translateY(${translateY}px)`;
        } else {
          floatingContainer.style.transform = `translateY(0px)`;
        }

        floatingContainer.classList.remove('opacity-0');
        floatingContainer.classList.add('opacity-100');

        if (floatingDateTimer) clearTimeout(floatingDateTimer);
        floatingDateTimer = setTimeout(() => {
          floatingContainer.classList.add('opacity-0');
          floatingContainer.classList.remove('opacity-100');
          setTimeout(() => { floatingContainer.style.transform = `translateY(0px)`; }, 300);
        }, 1400);
      } else {
        floatingContainer.classList.add('opacity-0');
        floatingContainer.classList.remove('opacity-100');
      }
    } else {
      floatingContainer.classList.add('opacity-0');
      floatingContainer.classList.remove('opacity-100');
    }
  }

  const jumpModeExitBtn = document.getElementById("jumpModeExitBtn");
  if (messagesDisplay.scrollTop <= 20) {
    jumpModeExitBtn.classList.add("opacity-0", "pointer-events-none", "translate-y-2");
    jumpModeExitBtn.classList.remove("opacity-90", "pointer-events-auto", "translate-y-0");

    // ジャンプ中かつ未来の追加ログがない（自力で最新部までスクロール到達した）場合は自動で通常ビューに切り替え
    if (isJumpView && !hasMoreJumpNewer) {
      window.exitJumpMode();
    }
  } else if (isJumpView || messagesDisplay.scrollTop > 300) {
    jumpModeExitBtn.classList.remove("opacity-0", "pointer-events-none", "translate-y-2");
    jumpModeExitBtn.classList.add("opacity-90", "pointer-events-auto", "translate-y-0");
  }

  const scrollDistanceToTop = messagesDisplay.scrollHeight - messagesDisplay.clientHeight - messagesDisplay.scrollTop;

  // 過去への読み込み (scrollTop大 = 上スクロール)
  if (scrollDistanceToTop < 300) {
    if (!isJumpView && !isLoadingOlderMessages && hasMoreOlderMessages) {
      await loadOlderMessages();
    } else if (isJumpView && !isLoadingJumpOlder && hasMoreJumpOlder) {
      await loadJumpOlderMessages();
    }
  }

  // ジャンプ中のみ、未来への読み込み (scrollTop小 = 下スクロール)
  if (isJumpView && messagesDisplay.scrollTop < 300 && !isLoadingJumpNewer && hasMoreJumpNewer) {
    await loadJumpNewerMessages();
  }
});

async function loadJumpOlderMessages() {
  if (isLoadingJumpOlder || !hasMoreJumpOlder || !jumpViewMessages.length) return;
  isLoadingJumpOlder = true;
  try {
    const oldestMsg = jumpViewMessages[0];
    if (!oldestMsg || !oldestMsg.timestamp) { hasMoreJumpOlder = false; return; }
    const q = query(
      collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`),
      orderBy("timestamp", "desc"),
      startAfter(oldestMsg.timestamp),
      limit(20)
    );
    const snap = await getDocs(q);
    if (snap.empty || snap.docs.length < 20) hasMoreJumpOlder = false;
    if (!snap.empty) {
      const fetched = [];
      snap.forEach(doc => fetched.push({ id: doc.id, ...doc.data() }));
      fetched.reverse();
      const _members = (currentServerData && currentServerData.joinedUsers) || [];
      await decryptMessagesInPlace(fetched, currentServerId, currentRoomId, _members).catch(() => { });

      jumpViewMessages = [...fetched, ...jumpViewMessages];
      allLoadedMessages = [...jumpViewMessages];
      lastMessagesData = [...allLoadedMessages];
      messagesIndexMap = {};
      lastMessagesData.forEach((m, i) => messagesIndexMap[m.id] = i);
      renderMessagesWithReadReceipts();
    }
  } catch (e) { console.error("loadJumpOlderMessages error:", e); }
  finally { isLoadingJumpOlder = false; }
}

async function loadJumpNewerMessages() {
  if (isLoadingJumpNewer || !hasMoreJumpNewer || !jumpViewMessages.length) return;
  isLoadingJumpNewer = true;
  try {
    const newestMsg = jumpViewMessages[jumpViewMessages.length - 1];
    if (!newestMsg || !newestMsg.timestamp) { hasMoreJumpNewer = false; return; }
    const q = query(
      collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`),
      orderBy("timestamp", "asc"),
      startAfter(newestMsg.timestamp),
      limit(20)
    );
    const snap = await getDocs(q);
    if (snap.empty || snap.docs.length < 20) hasMoreJumpNewer = false;
    if (!snap.empty) {
      const fetched = [];
      snap.forEach(doc => fetched.push({ id: doc.id, ...doc.data() }));
      const _members = (currentServerData && currentServerData.joinedUsers) || [];
      await decryptMessagesInPlace(fetched, currentServerId, currentRoomId, _members).catch(() => { });

      const oldScrollHeight = messagesDisplay.scrollHeight;
      const oldScrollTop = messagesDisplay.scrollTop;

      jumpViewMessages = [...jumpViewMessages, ...fetched];
      allLoadedMessages = [...jumpViewMessages];
      lastMessagesData = [...allLoadedMessages];
      messagesIndexMap = {};
      lastMessagesData.forEach((m, i) => messagesIndexMap[m.id] = i);
      renderMessagesWithReadReceipts();

      messagesDisplay.scrollTop = oldScrollTop + (messagesDisplay.scrollHeight - oldScrollHeight);
    }
  } catch (e) { console.error("loadJumpNewerMessages error:", e); }
  finally { isLoadingJumpNewer = false; }
}

window.exitJumpMode = function () {
  const jumpModeExitBtn = document.getElementById('jumpModeExitBtn');
  jumpModeExitBtn.classList.add("opacity-0", "pointer-events-none", "translate-y-2");
  jumpModeExitBtn.classList.remove("opacity-90", "pointer-events-auto", "translate-y-0");

  if (isJumpView) {
    isJumpView = false;
    if (window.globalUseRtdb) {
      allLoadedMessages = [];
      lastMessagesData = [];
      messagesIndexMap = {};
      messagesDisplay.innerHTML = '';
      if (typeof subscribeToMessagesRTDB === 'function') {
        if (typeof unsubscribeMessages === 'function') { unsubscribeMessages(); unsubscribeMessages = null; }
        subscribeToMessagesRTDB();
      }
    } else {
      // Firestoreリード数完全ゼロ！常時稼働のonSnapshotが維持していた最新キャッシュへ一瞬で復帰
      allLoadedMessages = [...realTimeMessagesCache];
      lastMessagesData = [...allLoadedMessages];
      messagesIndexMap = {};
      lastMessagesData.forEach((m, i) => messagesIndexMap[m.id] = i);

      renderMessagesWithReadReceipts();
      messagesDisplay.scrollTop = 0;
    }
  } else {
    messagesDisplay.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

// PCでのマウスホイールによるスクロール方向逆転の修正
messagesDisplay.addEventListener("wheel", (e) => {
  // flipped (scaleY(-1)) されているため、デフォルトのスクロール方向が逆になる。
  // これをキャンセルし、自力で正しい方向にスクロール位置を加算・減算する。
  e.preventDefault();
  messagesDisplay.scrollTop -= e.deltaY;
}, { passive: false });

// 旧ルーム作成ボタンは無効化（サーバー設定から管理）

function handleDeleteRoomClick(id, name) {
  pendingRoomDelete = { roomId: id, roomName: name };
  deleteRoomConfirmModal.classList.remove("hidden");
  roomToDeleteNameSpan.textContent = name;
}
confirmDeleteButton.addEventListener("click", async () => {
  deleteRoomConfirmModal.classList.add("hidden");
  await deleteRoomAndMessages(pendingRoomDelete.roomId);
});
cancelDeleteButton.addEventListener("click", () => deleteRoomConfirmModal.classList.add("hidden"));

async function deleteRoomAndMessages(roomId) {
  if (!currentServerId) return;
  if (currentRoomId === roomId) {
    currentRoomId = null;
    updateUserStatus('online');
    currentRoomHeader.classList.add("hidden");
    clearMessagesDOM();
    messageInput.disabled = true;
    sendMessageButton.disabled = true;
    if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
    if (unsubscribePinnedMessages) { unsubscribePinnedMessages(); unsubscribePinnedMessages = null; }
    if (readReceiptsUnsubscribe) { readReceiptsUnsubscribe(); readReceiptsUnsubscribe = null; }
    if (typingUnsubscribe) { typingUnsubscribe(); typingUnsubscribe = null; }
  }

  try {
    const batch = writeBatch(db);

    // 1. messages サブコレクションの全削除
    const messagesRef = collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${roomId}/messages`);
    const messagesSnap = await getDocs(messagesRef);
    messagesSnap.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    // 2. readReceipts サブコレクションの全削除
    const readReceiptsRef = collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${roomId}/readReceipts`);
    const readReceiptsSnap = await getDocs(readReceiptsRef);
    readReceiptsSnap.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    // 3. ルーム本体の削除
    const roomRef = doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms`, roomId);
    batch.delete(roomRef);

    await batch.commit();
    try {
      const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const rtdb = await _getOrInitRTDB();
      await remove(ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${roomId}`));
    } catch (err) { console.error("RTDB Room Delete Failed", err); }
    console.log(`Successfully deleted room and all its subcollections for ${roomId}.`);
  } catch (error) {
    console.error("Error during room deletion process:", error);
    throw error;
  }
}
const executeDeleteRoom = async () => {
  if (!pendingRoomDelete) return;
  loadingOverlay.classList.remove("hidden");
  try {
    await deleteRoomAndMessages(pendingRoomDelete.roomId);
    alertMessage(`ルーム「${pendingRoomDelete.roomName}」を削除しました。`, "success");
  } catch (error) {
    alertMessage("ルームの削除に失敗しました。", "error");
  } finally {
    loadingOverlay.classList.add("hidden");
    pendingRoomDelete = null;
  }
};

// --- 検索機能 ---
toggleSearchButton.addEventListener("click", () => {
  searchContainer.classList.toggle("hidden");
  if (!searchContainer.classList.contains("hidden")) {
    searchInput.focus();
    // 検索開始時は全メッセージを読み込む
    messageLimit = 9999;
    subscribeToMessages();
  } else {
    searchQuery = ""; searchInput.value = "";
    // 検索終了時は通常の20件に戻す
    messageLimit = 20;
    subscribeToMessages();
  }
});
closeSearchBtn.addEventListener("click", () => {
  searchContainer.classList.add("hidden");
  searchQuery = ""; searchInput.value = "";
  // 通常の20件に戻す
  messageLimit = 20;
  subscribeToMessages();
});
searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value.toLowerCase();
  renderMessagesWithReadReceipts();
});

// --- スマホ用戻るボタン ---
mobileBackButton.addEventListener("click", () => {
  sidebar.classList.remove("mobile-hidden");
  currentRoomHeader.classList.add("hidden");
  // ボトムナビを再表示
  const bottomNav = document.getElementById("mobileBottomNav");
  if (bottomNav) bottomNav.style.display = "flex";
  document.body.classList.remove('in-chat-view');
  if (typeof updateMetaThemeColor === 'function') updateMetaThemeColor();

  // ルーム退出処理（開いている判定を解除する）
  currentRoomId = null;
  if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
  if (unsubscribePinnedMessages) { unsubscribePinnedMessages(); unsubscribePinnedMessages = null; }
  if (readReceiptsUnsubscribe) { readReceiptsUnsubscribe(); readReceiptsUnsubscribe = null; }
  if (typingUnsubscribe) { typingUnsubscribe(); typingUnsubscribe = null; }
  clearMessagesDOM();
  lastMessagesData = [];
  messageInput.disabled = true;
  fileAttachButton.disabled = true;
  { const sb = document.getElementById('stickerButton'); if (sb) sb.disabled = true; }
  { const pmb = document.getElementById('plusMenuButton'); if (pmb) pmb.disabled = true; }
  sendMessageButton.disabled = true;
  if (typeof clearAttachedFile === 'function') clearAttachedFile();
  if (typeof cancelReply === 'function') cancelReply();
});
