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

// ================= MESSAGES MODULE ================
async function sendMessage() {
  // Allow concurrent text sends (LINE style), but block if actively uploading a file to prevent overlapping logic.
  if (isSendingMessage && (attachedFile || attachedKvFile)) return;
  const text = messageInput.value.trim();
  if ((!text && !attachedFile && !attachedKvFile) || !currentRoomId) return;

  // Optimistic input clearing (LINE style)
  messageInput.value = "";
  messageInput.style.height = "auto";
  if (typeof toggleSendButtonState === 'function') toggleSendButtonState();

  // 共通のUI要素を取得 (finallyブロックでの参照エラー防止)
  const progressBar = document.getElementById("uploadProgressBar");
  const progressFill = document.getElementById("uploadProgressFill");
  const progressText = document.getElementById("uploadProgressText");

  // Only lock UI fully if a file is attached
  if (attachedFile || attachedKvFile) {
    isSendingMessage = true;
    messageInput.disabled = true;
    sendMessageButton.disabled = true;
    progressBar.classList.remove("hidden");
  }

  clearTimeout(typingTimeout);
  isCurrentlyTyping = false;
  setTypingStatus(false);

  try {
    // --- E2EE: 本文を暗号化（鍵が無い/失敗時はユーザーに警告確認を行う） ---
    let textToStore = text;
    if (text) {
      if (!_subtleOK) {
        console.warn("[E2EE] この環境は Web Crypto 非対応のため平文で送信します");
        if (!confirm("⚠️ セキュリティ保護警告: 現在のブラウザ環境はエンドツーエンド暗号化(WebCrypto API)に非対応です。平文で送信してもよろしいですか？")) {
          return;
        }
      } else {
        try {
          const members = (currentServerData && currentServerData.joinedUsers) || [];
          const overlayWasHidden = loadingOverlay.classList.contains("hidden");
          if (overlayWasHidden && !_e2ee.roomKeyCache[currentRoomId]) {
            loadingOverlay.classList.remove("hidden");
          }
          const roomKey = await getRoomKeyWithWait(currentServerId, currentRoomId, members, 2000);
          if (!roomKey) {
            console.warn(`[E2EE] ルーム鍵の取得に失敗 (server=${currentServerId}, room=${currentRoomId})`);
            loadingOverlay.classList.add("hidden");
            alertMessage("🔒 暗号化保護エラー: セキュリティ鍵の取得に失敗したため、平文での送信を強制遮断しました。自動で鍵の修復(レスキュー)を実行します。数秒後にもう一度お試しください。", "error");
            await requestEscrowRescue(currentServerId, currentRoomId);
            return;
          } else {
            const enc = await encryptText(text, roomKey);
            if (enc) {
              textToStore = enc; // 暗号化成功時のみ保存用テキストに代入
            } else {
              console.warn(`[E2EE] 本文の暗号化処理に失敗 (server=${currentServerId}, room=${currentRoomId})`);
              alertMessage("🔒 暗号化保護エラー: メッセージの暗号化処理に失敗したため、平文での送信を強制遮断しました。自動で鍵の修復を実行します。", "error");
              await requestEscrowRescue(currentServerId, currentRoomId);
              return;
            }
          }
        } catch (e) {
          console.error("[E2EE] 暗号化処理で例外が発生したため送信を遮断:", e);
          loadingOverlay.classList.add("hidden");
          alertMessage("🔒 暗号化保護エラー: 予期せぬ例外が発生したため平文での送信を強制遮断しました。自動で修復を実行します。", "error");
          await requestEscrowRescue(currentServerId, currentRoomId);
          return;
        }
      }
    }
    const data = { text: textToStore, senderId: userId, senderNickname: currentServerNickname || userNickname, timestamp: serverTimestamp() };
    if (attachedKvFile) {
      Object.assign(data, { kvFileUrl: attachedKvFile.url, fileName: attachedKvFile.name, fileType: attachedKvFile.type, fileSize: attachedKvFile.size });
    }
    if (attachedFile) {
      progressBar.classList.remove("hidden");
      progressFill.style.width = "0%";
      progressText.textContent = "アップロード中... 0%";
      try {
        let fileToUpload = attachedFile.file;
        let isFileEncrypted = false;

        // E2EE File Encryption
        if (_subtleOK) {
          const members = (currentServerData && currentServerData.joinedUsers) || [];
          const roomKey = await getRoomKeyWithWait(currentServerId, currentRoomId, members, 2000);
          if (roomKey) {
            const encBlob = await encryptFileE2EE(fileToUpload, roomKey);
            fileToUpload = new File([encBlob], attachedFile.name, { type: 'application/octet-stream' });
            isFileEncrypted = true;
          } else {
            console.warn("[E2EE] ルーム鍵が取得できないためファイルを平文でアップロードします");
            if (!confirm("⚠️ セキュリティ保護警告: ルームの暗号化鍵が取得できないため、ファイルを平文でアップロードします。よろしいですか？")) {
              return;
            }
          }
        }

        const fileUrl = await uploadToExternalService(
          fileToUpload,
          (pct) => {
            progressFill.style.width = pct + "%";
            progressText.textContent = pct >= 100 ? "送信中..." : `アップロード中... ${pct}%`;
          },
          "simplechat/messages"
        );
        Object.assign(data, {
          fileData: fileUrl,
          fileName: attachedFile.name,
          fileType: attachedFile.type,
          fileSize: attachedFile.size,
          isFileEncrypted: isFileEncrypted
        });
      } finally {
        // 進捗バーを確実に隠す（100%表示のまま固まって見えるのを防ぐ）
        progressBar.classList.add("hidden");
        progressFill.style.width = "0%";
      }
    }
    if (replyingToMessage) {
      data.replyTo = { messageId: replyingToMessage.id, senderNickname: replyingToMessage.senderNickname, text: replyingToMessage.text || "（ファイル）" };
    }
    const wasEncrypted = isEncrypted(textToStore);
    let newMessageId;

    const msgRef = await addDoc(collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`), data);
    try {
      const { ref, set } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const rtdb = await _getOrInitRTDB();
      const rtdbMsgRef = ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages/${msgRef.id}`);
      const rtdbData = { ...data, id: msgRef.id, timestamp: Date.now() }; // RTDB uses unix timestamp number
      await set(rtdbMsgRef, rtdbData);
    } catch (e) { console.error("RTDB Dual Write Failed in sendMessage", e); }
    newMessageId = msgRef.id; // 各メッセージ固有のID（通知tagに使用）
    // ルーム一覧プレビュー: 暗号化できた場合は本文を平文で残さず汎用文言にする
    try {
      await updateDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}`), {
        lastMessageAt: data.timestamp,
        lastMessageSender: userId,
        lastMessageText: wasEncrypted ? textToStore : (text || (attachedFile ? '（画像）' : attachedKvFile ? '（ファイル）' : ''))
      });
    } catch (updateErr) {
      console.warn("プレビュー情報の更新に失敗しました:", updateErr);
    }


    // FCMプッシュ通知（サーバーメンバー全員に送信）
    try {
      const serverSnap = await getDoc(doc(db, `artifacts/${appId}/servers`, currentServerId));
      if (serverSnap.exists()) {
        const serverData = serverSnap.data();
        const receiverIds = (serverData.joinedUsers || []).filter(id => id !== userId);
        if (receiverIds.length > 0) {
          const serverName = serverData.name || 'Covo';
          const roomName = roomNames[currentRoomId] || 'room';
          const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
          const notifPayload = JSON.stringify({
            receiverIds,
            title: `${serverName} › #${roomName}`,
            body: `${userNickname}: ${text || (attachedFile ? '（画像）' : attachedKvFile ? '（ファイル）' : '')}`,
            roomId: currentRoomId,
            messageId: newMessageId, // ★ メッセージ固有ID（1件ずつ独立した通知）
            appId: appId,
            senderId: userId,
            idToken
          });
          // sendBeaconはページを閉じても確実に届く（fetchより信頼性が高い）
          const beaconSent = navigator.sendBeacon
            ? navigator.sendBeacon(
              "https://simplechat-api.astro-fray-server.workers.dev/api/sendNotification",
              new Blob([notifPayload], { type: 'application/json' })
            )
            : false;
          if (!beaconSent) {
            fetch("https://simplechat-api.astro-fray-server.workers.dev/api/sendNotification", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: notifPayload,
              keepalive: true
            }).catch(e => console.error("Notification trigger error:", e));
          }
        }
      }
    } catch (notifyErr) {
      console.error("Failed to trigger notification:", notifyErr);
    }

    // messageInput.value cleared optimistically at the start
    clearAttachedFile(); cancelReply();

    // ★ メッセージ送信後にタイマーをリセット
    resetAwayTimer();

  } catch (e) {
    console.error(e);
    // 送信失敗時に入力テキストを復元
    if (typeof text !== 'undefined' && text) {
      const mi = document.getElementById("messageInput");
      if (mi && !mi.value) mi.value = text;
    }
    alertMessage("送信に失敗しました", "error");
  } finally {
    loadingOverlay.classList.add("hidden");
    progressBar.classList.add("hidden");
    progressFill.style.width = "0%";
    messageInput.disabled = false;
    sendMessageButton.disabled = false;
    isSendingMessage = false;
    setTimeout(() => messageInput.focus(), 10);
  }
}
clearFileButton.addEventListener("click", clearAttachedFile);
function clearAttachedFile() { attachedFile = null; attachedKvFile = null; updateFilePreview(); }


// --- 送信ボタン ---
const sendMessageButton = document.getElementById("sendMessageButton");
sendMessageButton.addEventListener("click", sendMessage);

// --- ファイル添付ボタン（画像→Cloudinary添付 / それ以外→catbox.moe URLリンク化） ---
const fileAttachButton = document.getElementById("fileAttachButton");
const fileAttachInput = document.getElementById("fileAttachInput");
fileAttachButton.disabled = true;
fileAttachButton.addEventListener("click", () => {
  if (!currentRoomId) return;
  fileAttachInput.click();
});

fileAttachInput.addEventListener("change", async (e) => {
  let f = e.target.files[0];
  if (!f) return;
  fileAttachInput.value = "";

  const btnIcon = fileAttachButton.querySelector("i");
  if (btnIcon) btnIcon.className = "fas fa-spinner fa-spin";
  f = await processHeicFile(f);
  if (btnIcon) btnIcon.className = "fas fa-plus";

  if (!checkFileAllowed(f)) return;
  // 画像・その他ファイルとも共通: ここではアップロードせず添付予約だけ。
  // 実際のCloudflare(KV)へのアップロードは「送信ボタンを押した時」に行う。
  const MAX = f.type.startsWith('video/') ? 100 * 1024 * 1024 : 25 * 1024 * 1024;
  if (f.size > MAX) { alertMessage(f.type.startsWith('video/') ? "動画は100MBまでです" : "ファイルは25MBまでです", "error"); return; }
  attachedFile = { file: f, name: f.name, type: f.type || 'application/octet-stream', size: f.size };
  updateFilePreview();
  messageInput.focus();
});

// --- ドラッグ＆ドロップ ---
const dropOverlay = document.getElementById("dropOverlay");
let dragCounter = 0;
window.addEventListener("dragenter", (e) => {
  e.preventDefault(); dragCounter++;
  if (currentRoomId) dropOverlay.classList.add("active");
});
window.addEventListener("dragleave", (e) => {
  e.preventDefault(); dragCounter--;
  if (dragCounter <= 0) { dragCounter = 0; dropOverlay.classList.remove("active"); }
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", async (e) => {
  e.preventDefault(); dragCounter = 0;
  dropOverlay.classList.remove("active");
  if (!currentRoomId) return;
  let f = e.dataTransfer.files[0];
  if (!f) return;
  f = await processHeicFile(f);
  if (!checkFileAllowed(f)) return;
  const MAX = f.type.startsWith('video/') ? 100 * 1024 * 1024 : 25 * 1024 * 1024;
  if (f.size > MAX) { alertMessage(f.type.startsWith('video/') ? "動画は100MBまでです" : "ファイルは25MBまでです", "error"); return; }
  attachedFile = { file: f, name: f.name, type: f.type || 'application/octet-stream', size: f.size };
  updateFilePreview();
});

// --- 拡張メニューとメンション機能 ---
const plusMenuButton = document.getElementById("plusMenuButton");
const plusMenuPopup = document.getElementById("plusMenuPopup");
const menuMentionBtn = document.getElementById("menuMentionBtn");
const mentionPopup = document.getElementById("mentionPopup");
let mentionSearchString = "";
let isMentionPopupOpen = false;
let mentionSelectedIndex = 0;
let mentionUsers = [];

function getRecentlyMentioned() {
  try {
    const data = localStorage.getItem("recentlyMentioned");
    return data ? JSON.parse(data) : [];
  } catch (e) { return []; }
}
function addRecentlyMentioned(nickname) {
  if (nickname === "all") return;
  let recent = getRecentlyMentioned();
  recent = recent.filter(n => n !== nickname);
  recent.unshift(nickname);
  if (recent.length > 20) recent = recent.slice(0, 20);
  localStorage.setItem("recentlyMentioned", JSON.stringify(recent));
}

function renderMentionPopup() {
  if (!isMentionPopupOpen) {
    mentionPopup.classList.add("hidden");
    return;
  }
  mentionPopup.innerHTML = "";
  mentionPopup.classList.remove("hidden");

  const serverMemberIds = currentServerData?.joinedUsers || [];
  let users = cachedUsers.filter(u => u.id !== userId && serverMemberIds.includes(u.id));

  // 最近メンションした順に並び替え
  const recent = getRecentlyMentioned();
  users.sort((a, b) => {
    const idxA = recent.indexOf(a.nickname);
    const idxB = recent.indexOf(b.nickname);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.nickname.localeCompare(b.nickname);
  });

  // 先頭に @all を追加
  mentionUsers = [{ id: 'all', nickname: 'all', desc: '全員に通知' }, ...users];

  // 絞り込み
  if (mentionSearchString) {
    mentionUsers = mentionUsers.filter(u => u.nickname.toLowerCase().startsWith(mentionSearchString.toLowerCase()));
  }

  if (mentionUsers.length === 0) {
    mentionPopup.innerHTML = '<div class="p-3 text-sm text-gray-500 text-center">ユーザーがいません</div>';
    return;
  }

  if (mentionSelectedIndex >= mentionUsers.length) mentionSelectedIndex = 0;
  if (mentionSelectedIndex < 0) mentionSelectedIndex = mentionUsers.length - 1;

  mentionUsers.forEach((u, index) => {
    const opt = document.createElement("div");
    opt.className = "mention-option" + (index === mentionSelectedIndex ? " active" : "");

    const iconHTML = u.id === 'all'
      ? `<div class="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs flex-shrink-0"><i class="fas fa-users"></i></div>`
      : (u.avatarUrl
        ? `<img src="${u.avatarUrl}" class="w-6 h-6 rounded-full object-cover flex-shrink-0">`
        : `<div class="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 text-xs flex-shrink-0"><i class="fas fa-user"></i></div>`);

    const nameHTML = `<span class="font-medium">${escapeHtml(u.nickname)}</span>` +
      (u.desc ? `<span class="mention-option-sub ml-2">${u.desc}</span>` : ``);

    opt.innerHTML = `${iconHTML} <div class="flex-1 overflow-hidden overflow-ellipsis whitespace-nowrap">${nameHTML}</div>`;

    opt.addEventListener("click", () => {
      selectMention(u.nickname);
    });
    opt.addEventListener("mouseenter", () => {
      const oldActive = mentionPopup.querySelector(".active");
      if (oldActive) oldActive.classList.remove("active");
      opt.classList.add("active");
      mentionSelectedIndex = index;
    });
    mentionPopup.appendChild(opt);

    if (index === mentionSelectedIndex) {
      opt.scrollIntoView({ block: "nearest" });
    }
  });
}

function selectMention(nickname) {
  const pos = messageInput.selectionStart;
  const val = messageInput.value;
  const beforeCursor = val.substring(0, pos);
  const afterCursor = val.substring(pos);

  const lastAtMatch = beforeCursor.match(/[@＠]([^\s]*)$/);
  let newBefore = beforeCursor;
  if (lastAtMatch) {
    newBefore = beforeCursor.substring(0, lastAtMatch.index) + "@" + nickname + " ";
  } else {
    newBefore = beforeCursor + (beforeCursor.length > 0 && !beforeCursor.endsWith(" ") ? " " : "") + "@" + nickname + " ";
  }

  messageInput.value = newBefore + afterCursor;
  messageInput.selectionStart = messageInput.selectionEnd = newBefore.length;

  addRecentlyMentioned(nickname);
  closeMentionPopup();
  messageInput.focus();
}

function openMentionPopup(searchStr = "") {
  if (!currentRoomId) return;
  isMentionPopupOpen = true;
  mentionSearchString = searchStr;
  renderMentionPopup();
}

function closeMentionPopup() {
  isMentionPopupOpen = false;
  mentionPopup.classList.add("hidden");
}

if (plusMenuButton) {
  plusMenuButton.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!currentRoomId) return;
    plusMenuPopup.classList.toggle("hidden");
  });
}

const menuAttachBtn = document.getElementById("menuAttachBtn");
if (menuAttachBtn) {
  menuAttachBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    plusMenuPopup.classList.add("hidden");
    fileAttachInput.click();
  });
}

if (menuMentionBtn) {
  menuMentionBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    plusMenuPopup.classList.add("hidden");
    openMentionPopup("");
    messageInput.focus();
  });
}

document.addEventListener("click", (e) => {
  if (plusMenuPopup && e.target !== plusMenuButton && !plusMenuButton.contains(e.target)) {
    plusMenuPopup.classList.add("hidden");
  }
  if (mentionPopup && !mentionPopup.contains(e.target)) {
    closeMentionPopup();
  }
});



window.toggleReaction = async function (messageId, emoji) {
  if (!currentServerId || !currentRoomId || !userId) return;

  const msgRef = doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`, messageId);
  const msgSnap = await getDoc(msgRef);
  if (!msgSnap.exists()) return;
  const msgData = msgSnap.data();
  const currentReactions = msgData.reactions || {};
  const hasReactedWithSameEmoji = currentReactions[userId] === emoji;
  try {
    if (hasReactedWithSameEmoji) {
      await updateDoc(msgRef, { [`reactions.${userId}`]: deleteField() });
      try {
        const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
        const rtdb = await _getOrInitRTDB();
        await remove(ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages/${messageId}/reactions/${userId}`));
      } catch (e) { }
    } else {
      await updateDoc(msgRef, { [`reactions.${userId}`]: emoji });
      try {
        const { ref, update } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
        const rtdb = await _getOrInitRTDB();
        await update(ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages/${messageId}/reactions`), { [userId]: emoji });
      } catch (e) { }
    }
  } catch (e) {
    console.error("Failed to toggle reaction", e);
  }
};

function updateReactionsUI(container, msg) {
  let reactionsContainer = container.querySelector('.reactions-container');
  if (!reactionsContainer) {
    reactionsContainer = document.createElement('div');
    reactionsContainer.className = 'reactions-container';
    const timestampSpan = container.querySelector('.msg-timestamp');
    if (timestampSpan) {
      container.insertBefore(reactionsContainer, timestampSpan);
    } else {
      container.appendChild(reactionsContainer);
    }
  }
  const reactions = msg.reactions || {};
  const reactionCounts = Object.create(null);
  const myReactions = new Set();
  for (const [uid, emoji] of Object.entries(reactions)) {
    if (typeof emoji !== 'string') continue;
    if (!reactionCounts[emoji]) reactionCounts[emoji] = 0;
    reactionCounts[emoji]++;
    if (uid === userId) myReactions.add(emoji);
  }
  reactionsContainer.innerHTML = '';
  for (const [emoji, count] of Object.entries(reactionCounts)) {
    if (count === 0) continue;
    const badge = document.createElement('div');
    badge.className = 'reaction-badge';
    if (myReactions.has(emoji)) badge.classList.add('reacted-by-me');
    badge.innerHTML = getEmojiHtml(emoji, 'emoji-wrapper') + `<span>${count}</span>`;
    badge.onclick = (e) => {
      e.stopPropagation();
      window.showReactionUsers(reactions);
    };
    reactionsContainer.appendChild(badge);
  }
  if (Object.keys(reactionCounts).length === 0) {
    reactionsContainer.remove();
  } else {
    _twemojiParse(reactionsContainer);
  }
}

window.showReactionUsers = function (reactionsObj) {
  const modal = document.getElementById('reactionUsersModal');
  const listEl = document.getElementById('reactionUsersList');
  listEl.innerHTML = '';

  const reactionsArray = Object.entries(reactionsObj || {});
  if (reactionsArray.length === 0) return;

  reactionsArray.forEach(([uid, emoji]) => {
    if (typeof emoji !== 'string') return;
    const user = (cachedUsers || []).find(u => u.id === uid) || {};
    const nickname = user.nickname || "ユーザー";
    const avatarUrl = user.avatarUrl;

    const row = document.createElement('div');
    row.className = "flex items-center gap-3 p-2 bg-gray-50 rounded-lg";

    const avatarDiv = document.createElement('div');
    avatarDiv.className = "w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500 overflow-hidden flex-shrink-0";
    if (avatarUrl) {
      __setAvatarImg(avatarDiv, avatarUrl, nickname);
    } else {
      avatarDiv.textContent = nickname.charAt(0).toUpperCase();
    }

    const nameDiv = document.createElement('div');
    nameDiv.className = "text-sm font-bold text-gray-700 flex-1 truncate";
    nameDiv.textContent = nickname;

    const emojiDiv = document.createElement('div');
    emojiDiv.className = "flex items-center justify-center w-8 h-8 text-2xl flex-shrink-0 reaction-modal-emoji";
    emojiDiv.innerHTML = getEmojiHtml(emoji, 'emoji-wrapper');

    row.appendChild(avatarDiv);
    row.appendChild(nameDiv);
    row.appendChild(emojiDiv);
    listEl.appendChild(row);
  });

  _twemojiParse(listEl);
  openModal(modal);
};

window.renderPdfCanvas = async function (url, canvas, hintW, hintH) {
  if (!window.pdfjsLib || !canvas) return;
  try {
    const container = canvas.parentElement;
    const containerW = (container && container.clientWidth > 0) ? container.clientWidth : (hintW || 128);
    const containerH = (container && container.clientHeight > 0) ? container.clientHeight : (hintH || 160);

    const loadingTask = window.pdfjsLib.getDocument({ url, withCredentials: false });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);

    // コンテナに収まるようにスケールを計算（contain挙動）
    const rawViewport = page.getViewport({ scale: 1 });
    const scaleW = containerW / rawViewport.width;
    const scaleH = containerH / rawViewport.height;
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(scaleW, scaleH) * dpr;
    const viewport = page.getViewport({ scale });

    // canvasの実ピクセルサイズを設定（高DPI対応）
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    const renderContext = {
      canvasContext: canvas.getContext('2d'),
      viewport: viewport
    };
    await page.render(renderContext).promise;

    // レンダリング成功後、デフォルトのPDFアイコンを非表示にしてcanvasをフェードイン
    if (container) {
      const icon = container.querySelector('.default-pdf-icon');
      if (icon) icon.style.display = 'none';
    }
    canvas.style.opacity = '1';
  } catch (e) {
    console.warn("PDF thumbnail render error:", e.message || e);
    // エラー時はcanvasを非表示（デフォルトアイコンがそのまま見える）
    if (canvas) canvas.style.display = 'none';
  }
};

function createMessageElement(message, messageId, readByCount = 0) {
  if (message.isGap) {
    const gapRow = document.createElement("div");
    gapRow.className = "w-full flex justify-center py-6 opacity-60 select-none flipped";
    gapRow.innerHTML = `<span class="text-xs text-gray-500 bg-gray-100 px-4 py-1.5 rounded-full shadow-inner"><i class="fas fa-history mr-1.5"></i>${escapeHtml(message.text)}</span>`;
    return gapRow;
  }

  const isMyMessage = message.senderId === userId;
  const messageRow = document.createElement("div");
  messageRow.className = "message-row relative w-full mb-4 group flipped";

  const replyIconBg = document.createElement("div");
  replyIconBg.className = "swipe-reply-icon-bg absolute top-1/2 -translate-y-1/2 flex items-center justify-center opacity-0 pointer-events-none z-0";
  replyIconBg.style.width = "40px";
  replyIconBg.style.height = "40px";
  replyIconBg.style.borderRadius = "50%";
  replyIconBg.style.background = "#3b82f6";
  replyIconBg.style.right = "20px";
  replyIconBg.innerHTML = '<i class="fas fa-reply text-white shadow-sm"></i>';
  messageRow.appendChild(replyIconBg);

  const messageRowInner = document.createElement("div");
  messageRowInner.className = "message-row-inner w-full flex " + (isMyMessage ? "justify-end" : "justify-start items-start gap-1.5");
  messageRowInner.style.willChange = "transform";
  messageRow.appendChild(messageRowInner);

  // 相手メッセージ: アバター（左・上端揃え）＋バブル（右）を横並び
  if (!isMyMessage) {
    const senderUser = cachedUsers.find(u => u.id === message.senderId);
    const avatarDiv = document.createElement("div");
    avatarDiv.className = "msg-avatar z-10";
    if (senderUser?.avatarUrl) {
      __setAvatarImg(avatarDiv, senderUser.avatarUrl, message.senderNickname, { style: '' });
      avatarDiv.addEventListener("click", () => openAvatarLightbox(senderUser.avatarUrl));
    } else {
      avatarDiv.textContent = (message.senderNickname || "?").charAt(0).toUpperCase();
    }
    messageRowInner.appendChild(avatarDiv);
  }

  const bubbleContainer = document.createElement("div");
  bubbleContainer.className = `flex flex-col z-10 w-fit max-w-[85%] ${isMyMessage ? 'items-end' : 'items-start'}`;

  if (message.replyTo && message.replyTo.messageId) {
    const replyQuoteDiv = document.createElement("div");
    // reply-quote クラスを使って ::before の矢印アイコンをCSSで表示
    replyQuoteDiv.className = `reply-quote ${isMyMessage ? 'my-reply' : ''}`;
    replyQuoteDiv.dataset.replyToId = message.replyTo.messageId;

    const nicknameSpan = document.createElement('span');
    nicknameSpan.className = 'reply-quote-nickname';
    nicknameSpan.textContent = message.replyTo.senderNickname || '不明';

    const textSpan = document.createElement('span');
    textSpan.className = 'reply-quote-text';
    const replyText = message.replyTo._decryptedErrorText || message.replyTo.text || '（ファイル）';
    textSpan.textContent = replyText.length > 40 ? replyText.slice(0, 40) + '…' : replyText;

    replyQuoteDiv.appendChild(nicknameSpan);
    replyQuoteDiv.appendChild(textSpan);
    bubbleContainer.appendChild(replyQuoteDiv);
  }

  const messageElement = document.createElement("div");
  messageElement.className = `message-bubble ${isMyMessage ? "my-message" : "other-message"} flex flex-col w-fit relative`;
  messageElement.style.touchAction = "pan-y";
  messageElement.style.maxWidth = "100%"; // 75% max-width override
  messageElement.dataset.messageId = messageId;


  const senderNicknameSpan = document.createElement("span");
  senderNicknameSpan.className = `text-xs text-gray-600 mb-1 ${isMyMessage ? "text-right" : "text-left"}`;
  senderNicknameSpan.textContent = message.senderNickname || "不明なユーザー";
  messageElement.appendChild(senderNicknameSpan);

  // スタンプメッセージ（絵文字をTwemojiで大きく表示。吹き出し背景なし）
  if (message.sticker) {
    messageElement.classList.add("sticker-bubble");
    const stickerDiv = document.createElement("div");
    stickerDiv.className = "sticker-content";
    stickerDiv.innerHTML = getEmojiHtml(message.sticker, 'sk-em');
    messageElement.appendChild(stickerDiv);
    _twemojiParse(stickerDiv);
  }
  if (message.text) {
    const messageTextSpan = document.createElement("span");
    messageTextSpan.className = `message-content text-gray-900 text-left`;
    const textToDisplay = message._decryptedErrorText || message.text;
    messageTextSpan.innerHTML = escapeHtmlAndLinkUrls(textToDisplay);
    // 自分がメンションされていたらハイライト (自分が送信したメッセージは除く)
    if (message.senderId !== userId && (message.text.includes(`@${userNickname}`) || message.text.includes('@all'))) {
      messageElement.classList.add("mention-highlight");
    }
    messageElement.appendChild(messageTextSpan);
  }
  if (message.fileData && message.fileName) {
    const setMediaSrc = (element, propName, url) => {
      if (message.isFileEncrypted) {
        if (message._decryptedFileUrl) {
          if (propName) element[propName] = message._decryptedFileUrl;
          if (element.tagName === 'IMG') element.style.opacity = '1';
          if (element.tagName === 'CANVAS') window.renderPdfCanvas(message._decryptedFileUrl, element);
        } else {
          if (element.tagName === 'IMG') element.style.opacity = '0.3';
          (async () => {
            try {
              const members = (currentServerData && currentServerData.joinedUsers) || [];
              const roomKey = await getOrCreateRoomKey(currentServerId, currentRoomId, members);
              if (!roomKey) throw new Error("No key");
              const res = await fetch(message.fileData);
              const buf = await res.arrayBuffer();
              const dec = await decryptFileE2EE(buf, roomKey, currentServerId, currentRoomId);
              const blob = new Blob([dec], { type: message.fileType });
              message._decryptedFileUrl = URL.createObjectURL(blob);
              if (propName) element[propName] = message._decryptedFileUrl;
              if (element.tagName === 'IMG') element.style.opacity = '1';
              if (element.tagName === 'CANVAS') window.renderPdfCanvas(message._decryptedFileUrl, element);
            } catch (e) {
              if (element.tagName === 'IMG') element.alt = "復号化エラー";
            }
          })();
        }
      } else {
        if (propName) element[propName] = url || message.fileData;
        if (element.tagName === 'CANVAS') window.renderPdfCanvas(url || message.fileData, element);
      }
    };

    if (message.fileType && message.fileType.startsWith('image/')) {
      const img = document.createElement('img');
      img.className = 'mt-2 rounded-lg max-w-full h-auto cursor-pointer object-contain transition-opacity';
      img.style.maxHeight = '250px';
      img.loading = 'lazy';
      setMediaSrc(img, 'src');
      img.addEventListener("click", () => {
        const url = message._decryptedFileUrl || message.fileData;
        openPhotoSwipeModal(url, message.fileName);
      });
      messageElement.appendChild(img);
    } else if (message.fileType && message.fileType.startsWith('video/')) {
      const video = document.createElement('video');
      video.controls = true;
      video.className = 'mt-2 rounded-lg max-w-full h-auto';
      video.style.maxHeight = '250px';
      setMediaSrc(video, 'src');
      messageElement.appendChild(video);
    } else if (message.fileType === 'application/pdf') {
      // Teams風PDFカードを作成
      const pdfWrapper = document.createElement('div');
      pdfWrapper.className = 'mt-2 cursor-pointer inline-block';

      const thumbContainer = document.createElement('div');
      thumbContainer.className = 'relative w-32 h-40 rounded-lg border border-gray-200 bg-gray-50 flex flex-col items-center justify-center overflow-hidden shadow-sm';
      thumbContainer.style.flexShrink = '0';

      // PDFバッジ（右上）
      const badge = document.createElement('div');
      badge.className = 'absolute top-1 right-1 bg-red-500 text-white rounded shadow-sm z-20 flex items-center gap-0.5 pointer-events-none';
      badge.style.cssText = 'font-size:10px;font-weight:700;padding:2px 5px;';
      badge.innerHTML = '<i class="fas fa-file-pdf"></i> PDF';
      thumbContainer.appendChild(badge);

      // デフォルトアイコン（canvas読み込み成功時に非表示）
      const iconDiv = document.createElement('div');
      iconDiv.className = 'absolute inset-0 flex flex-col items-center justify-center gap-1 z-10 default-pdf-icon pointer-events-none';
      iconDiv.innerHTML = '<i class="fas fa-file-pdf text-red-400 text-3xl opacity-40"></i>';
      thumbContainer.appendChild(iconDiv);

      // サムネイルcanvas
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.className = 'absolute inset-0 z-0 pdf-thumb-canvas';
      thumbCanvas.style.cssText = 'width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.3s;';
      thumbContainer.appendChild(thumbCanvas);

      pdfWrapper.appendChild(thumbContainer);

      // ファイル名ラベル
      const pdfLabel = document.createElement('div');
      pdfLabel.className = 'text-xs text-gray-500 mt-1 flex items-center gap-1';
      const labelIcon = document.createElement('i');
      labelIcon.className = 'fas fa-file-pdf text-red-500 flex-shrink-0';
      const safeName = document.createElement('span');
      safeName.className = 'truncate';
      safeName.style.maxWidth = '128px';
      safeName.textContent = message.fileName;
      pdfLabel.appendChild(labelIcon);
      pdfLabel.appendChild(safeName);
      pdfWrapper.appendChild(pdfLabel);

      // クリックでPDFプレビュー
      pdfWrapper.addEventListener('click', () => {
        const url = message._decryptedFileUrl || message.fileData;
        openPdfLightbox(url, message.fileName);
      });

      messageElement.appendChild(pdfWrapper);

      // DOMに追加されてからサムネイルを描画（clientWidth/Height が確定するのを待つ）
      const renderThumb = () => {
        // 暗号化ファイルの場合はまず復号する
        if (message.isFileEncrypted) {
          if (message._decryptedFileUrl) {
            window.renderPdfCanvas(message._decryptedFileUrl, thumbCanvas, 128, 160);
          } else {
            (async () => {
              try {
                const members = (currentServerData && currentServerData.joinedUsers) || [];
                const roomKey = await getOrCreateRoomKey(currentServerId, currentRoomId, members);
                if (!roomKey) return;
                const res = await fetch(message.fileData);
                const buf = await res.arrayBuffer();
                const dec = await decryptFileE2EE(buf, roomKey, currentServerId, currentRoomId);
                const blob = new Blob([dec], { type: 'application/pdf' });
                message._decryptedFileUrl = URL.createObjectURL(blob);
                window.renderPdfCanvas(message._decryptedFileUrl, thumbCanvas, 128, 160);
              } catch (e) {
                console.error('PDF decrypt error for thumb:', e);
              }
            })();
          }
        } else if (message.fileData && message.fileData.startsWith('http')) {
          // 非暗号化の場合、Cloudinaryのimage/uploadは直接URL、rawはCORSが厳しいので試みる
          window.renderPdfCanvas(message.fileData, thumbCanvas, 128, 160);
        }
      };

      // requestAnimationFrameでDOMレイアウト確定後に実行
      requestAnimationFrame(() => requestAnimationFrame(renderThumb));
      // (新しいPDFレンダリングはrequestAnimationFrame上で実行済み)

    } else {
      const fileAttachmentDiv = document.createElement("div");
      fileAttachmentDiv.className = `mt-2 p-2 rounded-lg border border-gray-300 ${isMyMessage ? "bg-gray-200" : "bg-gray-100"} flex items-center space-x-2 cursor-pointer`;
      fileAttachmentDiv.style.color = "#333";
      const fnSpan = document.createElement("span");
      fnSpan.className = "flex-1 text-sm font-semibold truncate";
      fnSpan.textContent = message.fileName;
      const arrSpan = document.createElement("span");
      arrSpan.textContent = "▼";
      fileAttachmentDiv.appendChild(fnSpan);
      fileAttachmentDiv.appendChild(arrSpan);
      // ダウンロード＆復号をトリガー
      setMediaSrc(fileAttachmentDiv, null);
      fileAttachmentDiv.addEventListener("click", () => {
        const url = message._decryptedFileUrl || message.fileData;
        downloadFile(url, message.fileName, message.fileType);
      });
      messageElement.appendChild(fileAttachmentDiv);
    }
  }
  // KV ファイル添付カード
  if (message.kvFileUrl && message.fileName) {
    const kvDiv = document.createElement("div");
    kvDiv.className = `mt-2 p-2.5 rounded-xl border ${isMyMessage ? "border-gray-400 bg-gray-300" : "border-gray-200 bg-gray-50"} flex items-center gap-2.5 cursor-pointer select-none`;
    const iconWrap = document.createElement("div");
    iconWrap.className = "flex-shrink-0 w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center";
    iconWrap.innerHTML = '<i class="fas fa-paperclip text-gray-500 text-sm"></i>';
    const infoDiv = document.createElement("div");
    infoDiv.className = "flex-1 min-w-0";
    const nameSpan = document.createElement("div");
    nameSpan.className = "text-sm font-semibold text-gray-800 truncate";
    nameSpan.textContent = message.fileName;
    const metaSpan = document.createElement("div");
    metaSpan.className = "text-xs text-gray-400";
    if (message.fileSize) {
      metaSpan.textContent = message.fileSize >= 1048576
        ? `${(message.fileSize / 1048576).toFixed(1)} MB`
        : `${(message.fileSize / 1024).toFixed(1)} KB`;
    }
    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(metaSpan);
    const dlIcon = document.createElement("div");
    dlIcon.className = "flex-shrink-0 text-gray-400";
    dlIcon.innerHTML = '<i class="fas fa-download text-sm"></i>';
    kvDiv.appendChild(iconWrap);
    kvDiv.appendChild(infoDiv);
    kvDiv.appendChild(dlIcon);
    kvDiv.addEventListener("click", () => {
      downloadFile(message.kvFileUrl, message.fileName, message.fileType || 'application/octet-stream');
    });
    messageElement.appendChild(kvDiv);
  }

  updateReactionsUI(messageElement, message);

  const timestampSpan = document.createElement("span");
  timestampSpan.className = "msg-timestamp text-[10px] text-gray-500 whitespace-nowrap";
  // Firestoreタイムスタンプ・D1シム・数値のいずれにも対応
  const _getDate = (ts) => {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (typeof ts === 'number') return new Date(ts);
    return null;
  };
  const _tsDate = _getDate(message.timestamp) || _getDate(message.createdAt);
  if (_tsDate) {
    timestampSpan.textContent = `${String(_tsDate.getHours()).padStart(2, "0")}:${String(_tsDate.getMinutes()).padStart(2, "0")}`;
  } else {
    timestampSpan.textContent = "送信中...";
  }

  const metaContainer = document.createElement("div");
  metaContainer.className = "flex flex-col mb-1 select-none " + (isMyMessage ? "items-end" : "items-start");

  let readSpan = null;
  if (isMyMessage) {
    readSpan = document.createElement("span");
    readSpan.className = "read-receipt text-[10px] text-gray-500 whitespace-nowrap";
    if (readByCount > 0) {
      readSpan.textContent = `既読${readByCount > 1 ? `（${readByCount}）` : ""}`;
    } else {
      readSpan.style.display = "none";
    }
    metaContainer.appendChild(readSpan);
  }
  metaContainer.appendChild(timestampSpan);

  const bubbleRowWrapper = document.createElement("div");
  bubbleRowWrapper.className = "flex items-end gap-1.5 w-full";
  if (isMyMessage) {
    bubbleRowWrapper.classList.add("justify-end");
    bubbleRowWrapper.appendChild(metaContainer);
    bubbleRowWrapper.appendChild(messageElement);
  } else {
    bubbleRowWrapper.classList.add("justify-start");
    bubbleRowWrapper.appendChild(messageElement);
    bubbleRowWrapper.appendChild(metaContainer);
  }

  bubbleContainer.appendChild(bubbleRowWrapper);
  messageRowInner.appendChild(bubbleContainer);

  return messageRow;
}

window.jumpToUnloadedMessage = jumpToUnloadedMessage;
async function jumpToUnloadedMessage(msgId) {
  if (!msgId) return;
  const modal = document.getElementById("messagePreviewModal");
  if (modal) modal.classList.add("hidden");

  let existingEl = document.querySelector(`.message-bubble[data-message-id="${msgId}"]`);
  if (existingEl) {
    doJumpHighlight(existingEl);
    return;
  }

  const spinner = document.getElementById('topLoadingSpinner');
  const spinnerText = document.getElementById('topLoadingSpinnerText');
  if (spinnerText) spinnerText.textContent = "過去ログをロード中...";
  if (spinner) spinner.style.display = 'flex';

  const _exitBtn = document.getElementById('jumpModeExitBtn');
  _exitBtn.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
  _exitBtn.classList.add('opacity-90', 'pointer-events-auto', 'translate-y-0');

  try {
    const docRef = doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`, msgId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      alertMessage("メッセージが見つかりません。", "error");
      if (spinner) spinner.style.display = 'none';
      return;
    }
    const targetMsg = { id: docSnap.id, ...docSnap.data() };

    // ターゲットメッセージの周辺（過去15件・未来15件）のみを最小限フェッチ（極小リード数）
    const fetchLimit = 15;
    const qPast = query(
      collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`),
      orderBy("timestamp", "desc"),
      startAt(targetMsg.timestamp),
      limit(fetchLimit)
    );
    const qFuture = query(
      collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`),
      orderBy("timestamp", "asc"),
      startAfter(targetMsg.timestamp),
      limit(fetchLimit)
    );

    const [snapPast, snapFuture] = await Promise.all([getDocs(qPast), getDocs(qFuture)]);

    const pastMsgs = [];
    snapPast.forEach(doc => pastMsgs.push({ id: doc.id, ...doc.data() }));
    pastMsgs.reverse(); // descをascに戻す

    const futureMsgs = [];
    snapFuture.forEach(doc => futureMsgs.push({ id: doc.id, ...doc.data() }));

    hasMoreJumpOlder = snapPast.docs.length === fetchLimit;
    hasMoreJumpNewer = snapFuture.docs.length === fetchLimit;

    const combinedMsgs = [...pastMsgs, ...futureMsgs];

    const _members = (currentServerData && currentServerData.joinedUsers) || [];
    for (let i = 0; i < combinedMsgs.length; i++) {
      if (combinedMsgs[i].text && isEncrypted(combinedMsgs[i].text)) {
        combinedMsgs[i].text = await decryptText(combinedMsgs[i].text, currentServerId, currentRoomId, _members).catch(() => combinedMsgs[i].text);
      }
    }

    // 常時リアルタイムリスナーは稼働させたまま、画面用配列をジャンプ先ログへスッ切り替え
    isJumpView = true;
    jumpViewMessages = combinedMsgs;
    allLoadedMessages = [...jumpViewMessages];
    lastMessagesData = [...allLoadedMessages];
    messagesIndexMap = {};
    lastMessagesData.forEach((m, i) => messagesIndexMap[m.id] = i);

    messagesDisplay.style.transition = 'none';
    messagesDisplay.style.opacity = '0';
    if (spinner) spinner.style.display = 'none';

    renderMessagesWithReadReceipts();

  } catch (e) {
    console.error("Jump fetch error:", e);
  }

  setTimeout(() => {
    let el2 = document.querySelector(`.message-bubble[data-message-id="${msgId}"]`);
    if (el2) {
      // 画面非表示の間に一瞬で位置を確定させ、カクつきを完全になくす
      el2.scrollIntoView({ behavior: 'auto', block: 'center' });
      setTimeout(() => {
        messagesDisplay.style.transition = 'opacity 0.3s ease';
        messagesDisplay.style.opacity = '1';
        allowPagination = true;
        // 美しいハイライトアニメーションのみを発火
        const isStamp = el2.querySelector('img[alt^="stamp_"]');
        if (isStamp) {
          isStamp.classList.add('stamp-jump-anim');
          setTimeout(() => isStamp.classList.remove('stamp-jump-anim'), 1200);
        } else {
          el2.classList.add('message-highlight');
          setTimeout(() => el2.classList.remove('message-highlight'), 1200);
        }
      }, 50);
    } else {
      alertMessage("ジャンプできませんでした。", "warning");
      messagesDisplay.style.transition = 'opacity 0.3s ease';
      messagesDisplay.style.opacity = '1';
      allowPagination = true;
    }
  }, 400);
}

function renderMessagesWithReadReceipts() {
  const filteredMessages = lastMessagesData.filter(msg => {
    if (!searchQuery) return true;
    return (msg.text && msg.text.toLowerCase().includes(searchQuery)) ||
      (msg.senderNickname && msg.senderNickname.toLowerCase().includes(searchQuery));
  });

  // 既存のDOMとの差分同期（innerHTML = "" や remove によるカクつき・アニメーション再発火防止）
  const existingRows = Array.from(messagesDisplay.querySelectorAll('.message-row'));
  const existingRowsMap = new Map();
  existingRows.forEach(row => {
    const bubble = row.querySelector('.message-bubble');
    if (bubble && bubble.dataset.messageId) {
      existingRowsMap.set(bubble.dataset.messageId, row);
    }
  });

  const existingDividers = Array.from(messagesDisplay.querySelectorAll('.date-divider'));
  const existingDividersMap = new Map();
  existingDividers.forEach(div => {
    const inner = div.querySelector('.date-divider-inner');
    if (inner) {
      existingDividersMap.set(inner.textContent.trim(), div);
    }
  });

  // DOM順序を新しい順にする（scaleY(-1)で反転表示するため）
  const reversedMessages = [...filteredMessages].reverse();

  const getDayString = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const today = new Date();
    const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    if (isToday) return null;
    const yday = new Date(today); yday.setDate(today.getDate() - 1);
    const isYday = d.getDate() === yday.getDate() && d.getMonth() === yday.getMonth() && d.getFullYear() === yday.getFullYear();
    if (isYday) return "昨日";
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`;
  };

  // 1. まず表示するべき全DOM要素をリスト化する（既存要素は再利用し、位置も維持する）
  const expectedElements = [];

  reversedMessages.forEach((msg, i) => {
    const idx = messagesIndexMap[msg.id];
    const readCount = computeReadByCount(msg, idx);

    let row = existingRowsMap.get(msg.id);
    if (row) {
      const readSpan = row.querySelector('.read-receipt');
      if (readSpan) {
        if (readCount > 0) {
          readSpan.textContent = `既読${readCount > 1 ? `（${readCount}）` : ""}`;
          readSpan.style.display = "";
        } else {
          readSpan.style.display = "none";
        }
      }
      const timestampSpan = row.querySelector('.msg-timestamp');
      if (timestampSpan) {
        // Firestoreタイムスタンプ・D1シム・数値のいずれにも対応
        const _getDateU = (ts) => {
          if (!ts) return null;
          if (typeof ts.toDate === 'function') return ts.toDate();
          if (typeof ts === 'number') return new Date(ts);
          return null;
        };
        const _tsDU = _getDateU(msg.timestamp) || _getDateU(msg.createdAt);
        if (_tsDU) {
          timestampSpan.textContent = `${String(_tsDU.getHours()).padStart(2, "0")}:${String(_tsDU.getMinutes()).padStart(2, "0")}`;
        } else {
          timestampSpan.textContent = "送信中...";
        }
      }
      const textSpan = row.querySelector('.message-content');
      if (textSpan && msg.text) {
        textSpan.innerHTML = escapeHtmlAndLinkUrls(msg.text);
      }
      const bubbleElement = row.querySelector('.message-bubble');
      if (bubbleElement) updateReactionsUI(bubbleElement, msg);

      existingRowsMap.delete(msg.id);
    } else {
      row = createMessageElement(msg, msg.id, readCount);
    }
    expectedElements.push(row);

    const currentDay = getDayString(msg.timestamp);
    const nextMsgDay = (i < reversedMessages.length - 1) ? getDayString(reversedMessages[i + 1].timestamp) : null;
    if (currentDay && currentDay !== nextMsgDay) {
      let div = existingDividersMap.get(currentDay);
      if (div) {
        existingDividersMap.delete(currentDay);
      } else {
        div = document.createElement("div");
        div.className = "date-divider flipped";
        div.innerHTML = `<div class="date-divider-inner">${currentDay}</div>`;
      }
      expectedElements.push(div);
    }
  });

  // 2. 実際のDOMとexpectedElementsを先頭から順に照合。同一要素ならinsertBefore等の再配置を一切スキップ！
  // これにより既存要素のLayout Thrashingやアニメーション再発火（パッとなる現象）が100%根絶される
  let currentChild = messagesDisplay.firstElementChild;
  for (const expectedEl of expectedElements) {
    if (currentChild === expectedEl) {
      currentChild = currentChild.nextElementSibling;
    } else {
      messagesDisplay.insertBefore(expectedEl, currentChild);
    }
  }

  // 3. 削除された不要なメッセージや古くなったディバイダーを取り除く
  existingRowsMap.forEach(row => row.remove());
  existingDividersMap.forEach(div => div.remove());

  // スピナーや終端メッセージは過去のメッセージの「さらに上」（DOM上は最後尾）に配置
  const spinner = document.getElementById('topLoadingSpinner');
  if (spinner) {

    spinner.style.display = isLoadingOlderMessages ? 'flex' : 'none';
  }

  // 未読の境界線（検索中は出さない。filteredMessages は時系列昇順の filteredMessages を使う）
  if (!searchQuery) {
    const boundaryId = resolveUnreadBoundaryMessageId(filteredMessages);
    renderUnreadDivider(boundaryId);
  } else {
    const existing = messagesDisplay.querySelector('.unread-divider');
    if (existing) existing.remove();
  }
}

// 入室時に確定した未読境界(unreadBoundaryAt)を元に、最初の未読メッセージIDを返す。
// 一度決まったら unreadBoundaryMessageId に固定し、既読更新で線が消えないようにする。
function resolveUnreadBoundaryMessageId(chronologicalMessages) {
  // 既に確定済みで、その行がまだ存在するなら使い回す
  if (unreadBoundaryMessageId && chronologicalMessages.some(m => m.id === unreadBoundaryMessageId)) {
    return unreadBoundaryMessageId;
  }
  if (!unreadBoundaryAt) return null;
  for (const msg of chronologicalMessages) {
    // 自分の発言は未読の起点にしない
    if (msg.senderId === userId) continue;
    const ts = (msg.timestamp && msg.timestamp.toMillis) ? msg.timestamp.toMillis() : 0;
    if (ts && ts > unreadBoundaryAt) {
      unreadBoundaryMessageId = msg.id;
      return unreadBoundaryMessageId;
    }
  }
  return null;
}

// 区切り線を、境界メッセージの「視覚的に直上」に配置する。
// 表示は scaleY(-1) で反転しているため、DOM上は境界行の直後に入れると視覚的に直上になる。
function renderUnreadDivider(boundaryMessageId) {
  const existing = messagesDisplay.querySelector('.unread-divider');
  if (existing) existing.remove();
  if (!boundaryMessageId) return;
  const boundaryBubble = messagesDisplay.querySelector(`.message-bubble[data-message-id="${boundaryMessageId}"]`);
  if (!boundaryBubble) return;
  const boundaryRow = boundaryBubble.closest('.message-row');
  if (!boundaryRow) return;
  const divider = document.createElement('div');
  divider.className = 'unread-divider flipped';
  divider.innerHTML = '<span>ここから未読</span>';
  messagesDisplay.insertBefore(divider, boundaryRow.nextSibling);
}

function computeReadByCount(message, msgIndex) {
  let count = 0;
  // タイムスタンプをmsに変換するヘルパー（Firestoreオブジェクト・数値・シムすべて対応）
  const toMs = (ts) => {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    return 0;
  };
  Object.entries(roomReadReceipts).forEach(([rid, receipt]) => {
    if (!rid || rid === message.senderId) return;
    if (receipt.lastReadMessageId && messagesIndexMap[receipt.lastReadMessageId] >= msgIndex) count++;
    else if (receipt.lastReadAt && message.timestamp && toMs(receipt.lastReadAt) >= toMs(message.timestamp)) count++;
  });
  return count;
}

async function updateReadReceiptForCurrentUser() {
  if (!currentRoomId || !userId) return;
  // バックグラウンド・最小化・非フォーカス時は既読にしない
  if (document.visibilityState === 'hidden' || !document.hasFocus()) return;
  // 読んでいるたびに covo_last_read を更新（60秒バッファ切れによる誤未読ドット防止）
  if (typeof updateLocalAndRemoteReadState === 'function') {
    updateLocalAndRemoteReadState(currentRoomId, Date.now() + 10000);
  } else {
    try {
      const rm = JSON.parse(localStorage.getItem('covo_last_read') || '{}');
      rm[currentRoomId] = Date.now() + 10000;
      localStorage.setItem('covo_last_read', JSON.stringify(rm));
    } catch (e) { }
  }
  const lastMsgId = lastMessagesData.length ? lastMessagesData[lastMessagesData.length - 1].id : null;
  if (lastMsgId === _lastSentReadMessageId) return;
  _lastSentReadMessageId = lastMsgId;
  try {
    const { ref, set } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
    const rtdb = await _getOrInitRTDB();
    const myReceiptRef = ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/readReceipts/${userId}`);
    await set(myReceiptRef, { lastReadAt: Date.now(), lastReadMessageId: lastMsgId });
  } catch (error) { }
}

async function setTypingStatus(isTyping) {
  if (!currentRoomId || !userId || !appId) return;
  try {
    const { ref, set, remove, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
    const rtdb = await _getOrInitRTDB();
    const typingRef = ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/typing/${userId}`);
    if (isTyping) {
      await set(typingRef, { n: userNickname, t: serverTimestamp() });
    } else {
      await remove(typingRef);
    }
  } catch (e) { }
}

document.addEventListener("visibilitychange", () => { if (!document.hidden && document.hasFocus()) updateReadReceiptForCurrentUser(); });
window.addEventListener("focus", () => { if (!document.hidden) updateReadReceiptForCurrentUser(); });

let longPressTimer;
let longPressTriggered = false;
let ignoreNextContextMenuClick = false;
let msgTouchStartX = 0, msgTouchStartY = 0;
let swipeTargetRow = null;
let swipeCurrentX = 0;
messagesDisplay.addEventListener("touchstart", (e) => {
  const bubble = e.target.closest(".message-bubble");
  const row = e.target.closest(".message-row");
  const targetBubble = bubble || (row && row.querySelector(".message-bubble"));
  if (!targetBubble) return;
  const touch = e.touches[0];
  msgTouchStartX = touch.clientX;
  msgTouchStartY = touch.clientY;
  swipeTargetRow = row;
  swipeCurrentX = 0;
  const clientX = touch.clientX;
  const clientY = touch.clientY;
  longPressTriggered = false;
  longPressTimer = setTimeout(() => {
    longPressTriggered = true;
    showContextMenu(targetBubble, clientX, clientY);
    if (window.getSelection) window.getSelection().removeAllRanges();
  }, 300);
}, { passive: false });

messagesDisplay.addEventListener("touchend", (e) => {
  clearTimeout(longPressTimer);
  if (longPressTriggered) {
    longPressTriggered = false;
    ignoreNextContextMenuClick = true;
    setTimeout(() => ignoreNextContextMenuClick = false, 500);
    if (e.cancelable) e.preventDefault();
  }
  if (swipeTargetRow) {
    const innerRow = swipeTargetRow.querySelector(".message-row-inner");
    if (innerRow) {
      innerRow.style.transition = "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";
      innerRow.style.transform = "translateX(0)";
      setTimeout(() => { innerRow.style.transition = ""; }, 400);

      if (Math.abs(swipeCurrentX) > 50) {
        const bubble = innerRow.querySelector(".message-bubble");
        const msgId = bubble ? bubble.dataset.messageId : null;
        if (msgId) {
          const msgData = lastMessagesData.find(m => m.id === msgId);
          if (msgData) {
            replyingToMessage = msgData;
            replyingToNickname.textContent = msgData.senderNickname;
            replyingToText.textContent = msgData.text || (msgData.fileName ? "ファイル" : "...");
            replyingToContainer.classList.remove("hidden");
            const input = document.getElementById("messageInput");
            if (input && !input.disabled) {
              input.focus();
              setTimeout(() => input.focus(), 50);
            }
          }
        }
      }
      const replyBg = swipeTargetRow.querySelector(".swipe-reply-icon-bg");
      if (replyBg) {
        replyBg.style.transition = "opacity 0.2s ease-out, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";
        replyBg.style.opacity = "0";
        replyBg.style.transform = "translateY(-50%) scale(0.5)";
        setTimeout(() => { replyBg.style.transition = ""; }, 400);
      }
    }
  }
  if (swipeTargetRow) swipeTargetRow.dataset.sDir = ""; swipeTargetRow = null;
  swipeCurrentX = 0;
});
messagesDisplay.addEventListener("touchmove", (e) => {
  const touch = e.touches[0];
  const deltaX = touch.clientX - msgTouchStartX;
  const deltaY = touch.clientY - msgTouchStartY;

  if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
    clearTimeout(longPressTimer);
    if (messageContextMenu.classList.contains("hidden")) {
      longPressTriggered = false;
    }
  }

  if (swipeTargetRow) {
    if (!swipeTargetRow.dataset.sDir) {
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 5) swipeTargetRow.dataset.sDir = 'h';
      else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 5) swipeTargetRow.dataset.sDir = 'v';
    }
    if (swipeTargetRow.dataset.sDir === 'h') {
      if (e.cancelable) e.preventDefault(); // Lock horizontal swipe for iOS Safari
      const innerRow = swipeTargetRow.querySelector(".message-row-inner");
      const replyBg = swipeTargetRow.querySelector(".swipe-reply-icon-bg");
      if (innerRow) {
        let tx = deltaX;
        // 全てのメッセージで左にスワイプ（LINE風）のみ許可
        if (tx > 0) tx = 0;

        // 画面にちょっと見切れるくらいまでスムーズにスライドさせる
        if (tx < -120) tx = -120 + (tx + 120) * 0.3;
        innerRow.style.transform = `translateX(${tx}px)`;
        swipeCurrentX = tx;

        if (replyBg) {
          const absTx = Math.abs(tx);
          const progress = Math.min(absTx / 60, 1);
          replyBg.style.opacity = progress;
          replyBg.style.transform = `translateY(-50%) scale(${0.5 + 0.5 * progress})`;
          if (absTx > 60) {
            if (progress > 0.99 && !replyBg.dataset.vibrated) {
              if (navigator.vibrate) navigator.vibrate(10);
              replyBg.dataset.vibrated = "true";
            }
          } else {
            replyBg.dataset.vibrated = "";
          }
        }
      }
    }
  }
}, { passive: false });
messagesDisplay.addEventListener("touchcancel", () => { clearTimeout(longPressTimer); longPressTriggered = false; if (swipeTargetRow) swipeTargetRow.dataset.sDir = ""; swipeTargetRow = null; swipeCurrentX = 0; });

const DEFAULT_REACTIONS = ['🥰', '😆', '😲', '😢', '🥺', '🙇'];

function showContextMenu(bubble, clientX, clientY) {
  const msgData = lastMessagesData.find(m => m.id === bubble.dataset.messageId);
  if (!msgData) return;
  selectedMessageForContext = msgData;

  const reactionBar = document.getElementById('reactionPickerBar');
  if (reactionBar) {
    reactionBar.innerHTML = '';
    DEFAULT_REACTIONS.forEach(emoji => {
      const btn = document.createElement('div');
      btn.className = 'reaction-btn';
      btn.innerHTML = emoji;
      btn.onclick = (e) => {
        if (ignoreNextContextMenuClick) { e.preventDefault(); e.stopPropagation(); return; }
        window.toggleReaction(msgData.id, emoji);
        messageContextMenu.classList.add("hidden");
      };
      reactionBar.appendChild(btn);
    });
    const moreBtn = document.createElement('div');
    moreBtn.className = 'reaction-more-btn';
    moreBtn.innerHTML = '<i class="fas fa-ellipsis-h"></i>';
    moreBtn.onclick = (e) => {
      if (ignoreNextContextMenuClick) { e.preventDefault(); e.stopPropagation(); return; }
      e.stopPropagation();
      messageContextMenu.classList.add("hidden");
      window._reactionTargetMessageId = msgData.id;
      window.toggleStickerPicker();
    };
    reactionBar.appendChild(moreBtn);
    _twemojiParse(reactionBar);
  }

  const fileUrl = msgData._decryptedFileUrl || msgData.fileData || msgData.kvFileUrl;
  if (fileUrl) {
    if (downloadMessageButton) downloadMessageButton.style.display = 'block';
  } else {
    if (downloadMessageButton) downloadMessageButton.style.display = 'none';
  }

  messageContextMenu.classList.remove("hidden");

  let menuWidth = messageContextMenu.offsetWidth;
  let menuHeight = messageContextMenu.offsetHeight;

  let safeLeft = parseFloat(clientX) || 0;
  let safeTop = parseFloat(clientY) || 0;

  // 画面外に見切れないように位置を調整
  if (safeLeft + menuWidth > window.innerWidth) {
    safeLeft = window.innerWidth - menuWidth - 5;
  }
  if (safeTop + menuHeight > window.innerHeight) {
    safeTop = window.innerHeight - menuHeight - 5;
  }

  // 最終安全装置：左上が見切れないようにする
  safeLeft = Math.max(5, safeLeft);
  safeTop = Math.max(5, safeTop);

  messageContextMenu.style.left = `${safeLeft}px`;
  messageContextMenu.style.top = `${safeTop}px`;

  messageContextMenu.style.pointerEvents = "none";
  setTimeout(() => {
    messageContextMenu.style.pointerEvents = "auto";
  }, 400);
}

messagesDisplay.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  // スマホやタッチパネルPCでの長押しによって合成された contextmenu イベント (clientX/Y が 0 になる) を無視する
  if (e.clientX === 0 && e.clientY === 0) return;

  const bubble = e.target.closest(".message-bubble");
  const row = e.target.closest(".message-row");
  const targetBubble = bubble || (row && row.querySelector(".message-bubble"));
  if (targetBubble) {
    showContextMenu(targetBubble, e.clientX, e.clientY);
  } else {
    messageContextMenu.classList.add("hidden");
  }
});
document.addEventListener("click", (e) => {
  if (ignoreNextContextMenuClick) return;
  if (!messageContextMenu.contains(e.target)) messageContextMenu.classList.add("hidden");
});

replyMessageButton.addEventListener("click", (e) => {
  if (ignoreNextContextMenuClick) { e.preventDefault(); e.stopPropagation(); return; }
  if (selectedMessageForContext) {
    replyingToMessage = selectedMessageForContext;
    replyingToNickname.textContent = selectedMessageForContext.senderNickname;
    replyingToText.textContent = selectedMessageForContext.text || (selectedMessageForContext.fileName ? "ファイル" : "...");
    replyingToContainer.classList.remove("hidden");
  }
  messageContextMenu.classList.add("hidden");
});

downloadMessageButton.addEventListener("click", async (e) => {
  if (ignoreNextContextMenuClick) { e.preventDefault(); e.stopPropagation(); return; }
  messageContextMenu.classList.add("hidden");
  if (!selectedMessageForContext) return;
  const fileUrl = selectedMessageForContext._decryptedFileUrl || selectedMessageForContext.fileData || selectedMessageForContext.kvFileUrl;
  if (fileUrl) {
    try {
      if (fileUrl.startsWith('blob:')) {
        const a = document.createElement('a');
        a.href = fileUrl;
        a.download = selectedMessageForContext.fileName || 'download';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      } else {
        const res = await fetch(fileUrl, { mode: 'cors' });
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = selectedMessageForContext.fileName || 'download';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      }
    } catch (err) {
      console.error("Direct download failed:", err);
      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = selectedMessageForContext.fileName || 'download';
      a.target = '_blank';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  }
});

copyMessageButton.addEventListener("click", async (e) => {
  if (ignoreNextContextMenuClick) { e.preventDefault(); e.stopPropagation(); return; }
  messageContextMenu.classList.add("hidden");
  if (!selectedMessageForContext) return;

  const fileUrl = selectedMessageForContext._decryptedFileUrl || selectedMessageForContext.fileData || selectedMessageForContext.kvFileUrl;
  if (fileUrl && (fileUrl.startsWith('http') || fileUrl.startsWith('blob:'))) {
    try {
      const res = await fetch(fileUrl, { mode: 'cors' });
      const blob = await res.blob();
      if (navigator.clipboard && navigator.clipboard.write) {
        try {
          let copyBlob = blob;
          let type = blob.type || selectedMessageForContext.fileType || 'application/octet-stream';
          const item = new ClipboardItem({ [type]: copyBlob });
          await navigator.clipboard.write([item]);
          alertMessage("ファイルをクリップボードにコピーしました", "success");
          return;
        } catch (err) {
          console.warn("ClipboardItem write failed, trying fallback...", err);
        }
      }
      if (navigator.canShare && navigator.share) {
        const file = new File([blob], selectedMessageForContext.fileName || "attachment", { type: blob.type || 'application/octet-stream' });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: selectedMessageForContext.fileName });
            return;
          } catch (shareErr) {
            if (shareErr.name === 'AbortError' || shareErr.message.includes('Share canceled')) {
              return; // ユーザーキャンセル時は後続のURLコピーを出さない
            }
            console.warn("Share failed with error:", shareErr);
          }
        }
      }
      copyToClipboard(fileUrl);
      alertMessage("ファイルのURLをクリップボードにコピーしました（ブラウザ制限のためURLをコピーしました）", "success");
    } catch (err) {
      console.error("Copy file error:", err);
      if (selectedMessageForContext.text) {
        copyToClipboard(selectedMessageForContext.text);
        alertMessage("テキストをコピーしました", "success");
      } else {
        alertMessage("コピーに失敗しました", "error");
      }
    }
  } else if (selectedMessageForContext.text) {
    copyToClipboard(selectedMessageForContext.text);
    alertMessage("コピーしました", "success");
  }
});

deleteMessageButton.addEventListener("click", async (e) => {
  if (ignoreNextContextMenuClick) { e.preventDefault(); e.stopPropagation(); return; }
  messageContextMenu.classList.add("hidden");
  if (!selectedMessageForContext) return;
  const canDelete = selectedMessageForContext.senderId === userId || isAdmin ||
    (currentServerData && currentServerData.serverAdmins && currentServerData.serverAdmins.includes(userId));
  if (!canDelete) { alertMessage("権限がありません", "warning"); return; }

  const msgToDelete = selectedMessageForContext;
  const isServerAdmin = !!(currentServerData && currentServerData.serverAdmins && currentServerData.serverAdmins.includes(userId));
  const forceDelete = (isAdmin || isServerAdmin) && msgToDelete.senderId !== userId;

  // 1. KV ファイル削除（先行・失敗でメッセージ削除中止）
  // 1a. kvFileUrl フィールド（新形式）
  if (msgToDelete.kvFileUrl) {
    const m = msgToDelete.kvFileUrl.match(/\/api\/file\/([A-Za-z0-9_]+)/);
    if (m) {
      const fileKey = m[1];
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
      const params = `userId=${encodeURIComponent(userId)}&idToken=${encodeURIComponent(idToken)}${forceDelete ? '&forceDelete=1' : ''}`;
      try {
        const res = await fetch(`${WORKER_BASE_URL}/api/file/${fileKey}?${params}`, { method: 'DELETE' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error('[deleteMessage] KV file delete failed (kvFileUrl):', fileKey, err);
          alertMessage('添付ファイルの削除に失敗しました。メッセージは削除されませんでした。', 'error');
          return;
        }
        console.log('[deleteMessage] KV file deleted (kvFileUrl):', fileKey);
      } catch (e) {
        console.error('[deleteMessage] KV file delete error (kvFileUrl):', fileKey, e);
        alertMessage('添付ファイルの削除に失敗しました。メッセージは削除されませんでした。', 'error');
        return;
      }
    }
  }
  // 1b. テキスト内の旧形式KV URL
  if (msgToDelete.text) {
    const kvPattern = new RegExp(WORKER_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/api/file/([A-Za-z0-9_]+)', 'g');
    const kvMatches = [...msgToDelete.text.matchAll(kvPattern)];
    for (const match of kvMatches) {
      const fileKey = match[1];
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
      const params = `userId=${encodeURIComponent(userId)}&idToken=${encodeURIComponent(idToken)}${forceDelete ? '&forceDelete=1' : ''}`;
      try {
        const res = await fetch(`${WORKER_BASE_URL}/api/file/${fileKey}?${params}`, { method: 'DELETE' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error('[deleteMessage] KV file delete failed (text URL):', fileKey, err);
          alertMessage('添付ファイルの削除に失敗しました。メッセージは削除されませんでした。', 'error');
          return;
        }
        console.log('[deleteMessage] KV file deleted (text URL):', fileKey);
      } catch (e) {
        console.error('[deleteMessage] KV file delete error (text URL):', fileKey, e);
        alertMessage('添付ファイルの削除に失敗しました。メッセージは削除されませんでした。', 'error');
        return;
      }
    }
  }

  // 1c. fileData が Cloudflare(KV) URL の場合（画像・その他ファイルの新形式）。
  //     画像送信もKVに移行したため、ここで実ファイルを削除しないとCloudflareに残ってしまう。
  if (msgToDelete.fileData && msgToDelete.fileData.indexOf('/api/file/') >= 0) {
    const m = msgToDelete.fileData.match(/\/api\/file\/([A-Za-z0-9_]+)/);
    if (m) {
      const fileKey = m[1];
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
      const params = `userId=${encodeURIComponent(userId)}&idToken=${encodeURIComponent(idToken)}${forceDelete ? '&forceDelete=1' : ''}`;
      try {
        const res = await fetch(`${WORKER_BASE_URL}/api/file/${fileKey}?${params}`, { method: 'DELETE' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error('[deleteMessage] KV file delete failed (fileData):', fileKey, err);
          alertMessage('添付ファイルの削除に失敗しました。メッセージは削除されませんでした。', 'error');
          return;
        }
        console.log('[deleteMessage] KV file deleted (fileData):', fileKey);
      } catch (e) {
        console.error('[deleteMessage] KV file delete error (fileData):', fileKey, e);
        alertMessage('添付ファイルの削除に失敗しました。メッセージは削除されませんでした。', 'error');
        return;
      }
    }
  }

  // 3. Firestore / D1 メッセージ削除
  try {

    await deleteDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`, msgToDelete.id));
    try {
      const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const rtdb = await _getOrInitRTDB();
      await remove(ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages/${msgToDelete.id}`));
    } catch (err) { console.error("RTDB Dual Delete Failed", err); }
    try {
      const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const rtdb = await _getOrInitRTDB();
      await remove(ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages/${msgToDelete.id}`));
    } catch (e) { console.error("RTDB Delete Failed", e); }

    allLoadedMessages = allLoadedMessages.filter(m => m.id !== msgToDelete.id);
    lastMessagesData = [...allLoadedMessages];
    messagesIndexMap = {};
    lastMessagesData.forEach((m, i) => messagesIndexMap[m.id] = i);
    renderMessagesWithReadReceipts();
    renderPinnedMessages();
    alertMessage("削除しました", "success");
  } catch (e) {
    console.error('[deleteMessage] delete failed:', msgToDelete.id, e);
    alertMessage("削除に失敗しました", "error");
  }
});

messagesDisplay.addEventListener("dblclick", (e) => {
  const bubble = e.target.closest(".message-bubble");
  const row = e.target.closest(".message-row");
  const targetBubble = bubble || (row && row.querySelector(".message-bubble"));
  if (targetBubble) {
    const m = lastMessagesData.find(msg => msg.id === targetBubble.dataset.messageId);
    if (m) {
      replyingToMessage = m;
      replyingToNickname.textContent = m.senderNickname;
      replyingToText.textContent = m.text || (m.fileName ? "ファイル" : "...");
      replyingToContainer.classList.remove("hidden");
      messageInput.focus();
    }
  }
});
cancelReplyButton.addEventListener("click", cancelReply);
function cancelReply() { replyingToMessage = null; replyingToContainer.classList.add("hidden"); }
messagesDisplay.addEventListener("click", (e) => {
  const q = e.target.closest(".reply-quote");
  if (q) {
    const replyId = q.dataset.replyToId;
    const el = messagesDisplay.querySelector(`.message-bubble[data-message-id="${replyId}"]`);
    if (el) {
      doJumpHighlight(el);
    } else {
      jumpToUnloadedMessage(replyId);
    }
  }
});

async function showUnloadedMessagePreview(msgId) {
  let msgData = lastMessagesData.find(m => m.id === msgId);
  if (!msgData) {
    try {
      const docRef = doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`, msgId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        msgData = { id: docSnap.id, ...docSnap.data() };
      } else {
        alertMessage("メッセージが見つかりません。", "error");
        return;
      }
    } catch (e) {
      console.error(e);
      alertMessage("メッセージの読み込みに失敗しました。", "error");
      return;
    }
  }

  if (msgData.text && isEncrypted(msgData.text)) {
    try {
      const _members = (currentServerData && currentServerData.joinedUsers) || [];
      msgData.text = await decryptText(msgData.text, currentServerId, currentRoomId, _members);
    } catch (e) {
      console.error("Preview decryption error:", e);
    }
  }

  let pTextHtml = "";
  if (msgData.customEmojiUrl) {
    pTextHtml = `<img src="${escapeHtml(msgData.customEmojiUrl)}" class="h-16 w-16 object-contain mt-1" />`;
  } else if (msgData.fileName) {
    pTextHtml = `<div class="flex items-center gap-2 mt-1"><i class="fas fa-file text-gray-400 text-lg"></i><span class="text-xs text-gray-500">${escapeHtml(msgData.fileName)}</span></div>`;
  } else {
    pTextHtml = escapeHtml(msgData.text || "...");
  }

  const pName = msgData.senderNickname || "ユーザー";

  const modal = document.getElementById("messagePreviewModal");
  document.getElementById("previewModalName").textContent = pName;
  document.getElementById("previewModalText").innerHTML = pTextHtml;

  const avatarEl = document.getElementById("previewModalAvatar");
  avatarEl.innerHTML = "";
  avatarEl.style.backgroundImage = "";
  const senderUser = cachedUsers.find(u => u.id === msgData.senderId);
  if (senderUser?.avatarUrl) {
    __setAvatarImg(avatarEl, senderUser.avatarUrl, pName, { style: '' });
  } else {
    avatarEl.textContent = pName.charAt(0).toUpperCase();
  }

  modal.querySelector('.modal-box').dataset.msgId = msgId;
  modal.classList.remove("hidden");
}



function doJumpHighlight(el) {
  const container = messagesDisplay;
  if (container) {
    const row = el.closest('.message-row') || el;
    // scrollIntoViewを使用して、どの画面サイズ・環境でも確実に中央にスクロールさせる
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ハイライトアニメーション（少し遅延させてスクロール後に発火）
  setTimeout(() => {
    const isStamp = el.querySelector('img[alt^="stamp_"]');
    if (isStamp) {
      isStamp.classList.add('stamp-jump-anim');
      setTimeout(() => isStamp.classList.remove('stamp-jump-anim'), 1200);
    } else {
      el.classList.add('message-highlight');
      setTimeout(() => el.classList.remove('message-highlight'), 1200);
    }
  }, 200);
}

// iOS/Safari 判定
const _isIOSSafari = (() => {
  const ua = navigator.userAgent;
  // iPhone/iPod の判定
  const isIPhone = /iPhone|iPod/.test(ua) && !window.MSStream;
  // iPad は iOS13+ から「Macintosh」として UA を返すためタッチポイント数で判定
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  // iOS/iPadOS デバイスのみを対象とする（デスクトップ Safari は除外）
  return isIPhone || isIPad;
})();

function downloadFile(fileData, fileName, mimeType) {
  if (isTauri && window.__TAURI__?.plugin?.shell) {
    window.__TAURI__.plugin.shell.open(fileData).catch(e => {
      console.warn('Tauri open failed', e);
      window.open(fileData, '_blank');
    });
    return;
  }

  const tryShareOrDownloadBlob = async (blob) => {
    if (navigator.canShare && navigator.share) {
      try {
        const file = new File([blob], fileName, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: fileName,
          });
          return;
        }
      } catch (e) {
        console.warn("Share failed", e);
      }
    }
    // Fallback: download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  if (fileData && fileData.startsWith('blob:')) {
    fetch(fileData)
      .then(res => res.blob())
      .then(blob => tryShareOrDownloadBlob(blob))
      .catch(() => window.open(fileData, '_blank'));
    return;
  }

  if (fileData && fileData.startsWith('http')) {
    if (fileData.includes('res.cloudinary.com')) {
      // Cloudinary URL はブラウザからの直接アクセスが制限される場合があるため
      // Cloudflare Worker プロキシ経由でダウンロードする
      const proxyUrl = `${WORKER_BASE_URL}/api/download?url=${encodeURIComponent(fileData)}&name=${encodeURIComponent(fileName)}`;
      if (_isIOSSafari && (!navigator.share)) {
        // iOS Safari かつ Share 非対応の場合
        window.open(proxyUrl, '_blank');
        return;
      }
      fetch(proxyUrl)
        .then(res => {
          if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
          return res.blob();
        })
        .then(blob => tryShareOrDownloadBlob(blob))
        .catch(() => window.open(fileData, '_blank'));
      return;
    }
    // 非Cloudinary HTTP URL
    if (_isIOSSafari && (!navigator.share)) {
      window.open(fileData, '_blank');
      return;
    }
    fetch(fileData, { mode: 'cors' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => tryShareOrDownloadBlob(blob))
      .catch(() => window.open(fileData, '_blank'));
    return;
  }
  // base64フォールバック（旧データ互換）
  try {
    const parts = fileData.split(';base64,');
    const byteCharacters = atob(parts[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (e) { console.error(e); }
}

function closePdfLightbox() {
  const lightbox = document.getElementById('pdfLightbox');
  const iframe = document.getElementById('pdfLightboxIframe');
  if (lightbox) lightbox.style.display = 'none';
  if (iframe) iframe.src = '';
}

// PDFライトボックスを開く
function openPdfLightbox(url, fileName) {
  const lightbox = document.getElementById('pdfLightbox');
  const iframe = document.getElementById('pdfLightboxIframe');
  const nameEl = document.getElementById('pdfLightboxName');
  const dlBtn = document.getElementById('pdfLightboxDownload');
  const closeBtn = document.getElementById('pdfLightboxClose');

  nameEl.textContent = fileName;

  // iOS Safari は iframe PDF 表示が不安定 → 直接タブで開く
  if (_isIOSSafari) {
    window.open(url, '_blank');
    return;
  }

  iframe.src = '';
  lightbox.style.display = 'flex';

  // エラーUI準備（再表示時に重複しないよう既存を削除）
  const contentArea = lightbox.querySelector('div:last-child');
  contentArea.style.position = 'relative';
  const existingErr = contentArea.querySelector('.pdf-error-msg');
  if (existingErr) existingErr.remove();

  // safeUrl: XSS対策としてinlineイベントハンドラではなくdata属性経由で開く
  const errorMsg = document.createElement('div');
  errorMsg.className = 'pdf-error-msg';
  errorMsg.style.cssText = 'display:none;position:absolute;inset:0;background:#1f2937;color:white;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:1;';
  const openBtn = document.createElement('button');
  openBtn.className = 'px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg';
  openBtn.textContent = '別タブで開く';
  openBtn.addEventListener('click', () => window.open(url, '_blank', 'noopener,noreferrer'));
  errorMsg.innerHTML = `<i class="fas fa-exclamation-circle text-red-400 text-4xl"></i><p class="text-sm text-gray-300">このPDFはプレビューできません</p>`;
  errorMsg.appendChild(openBtn);
  contentArea.appendChild(errorMsg);

  const isRaw = url.includes('/raw/upload/');

  dlBtn.onclick = () => downloadFile(url, fileName, 'application/pdf');

  let timeoutId = null;
  closeBtn.onclick = () => {
    if (timeoutId) clearTimeout(timeoutId);
    errorMsg.remove();
    closePdfLightbox();
  };

  if (url.startsWith('blob:')) {
    console.info(`[PDF] blob URL detected. Loading directly.`);
    iframe.onload = () => {
      if (timeoutId) clearTimeout(timeoutId);
      iframe.style.opacity = '1';
    };
    iframe.src = url;
    return;
  }

  // 常にWorkerプロキシ経由（raw/image両方）
  // Cloudinaryは直接アクセスも401になる場合があるためWorker経由で統一
  const previewSrc = `${WORKER_BASE_URL}/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(fileName)}&preview=1`;

  // 両タイプともWorkerプロキシ経由でfetch事前チェック
  // → iframe.onloadは401でも発火するため直接iframeに渡すと失敗を検知できない
  console.info(`[PDF] ${isRaw ? 'raw/upload' : 'image/upload'}型 → Workerプロキシ経由でアクセスチェック中`);
  fetch(previewSrc)
    .then(async res => {
      console.info(`[PDF] Workerレスポンス: HTTP ${res.status} ${res.statusText}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        if (res.status === 401) {
          console.warn('[PDF] 401 Unauthorized: Cloudinaryがこのファイルへのアクセスを制限しています。');
          console.warn('[PDF] 原因:', errBody.reason || 'アップロードプリセットのアクセス設定が原因の可能性があります。Cloudinaryダッシュボードでプリセットのaccess_modeをpublicに変更してください。');
        } else {
          console.error(`[PDF] エラー (HTTP ${res.status}):`, errBody);
        }
        errorMsg.style.display = 'flex';
      } else {
        console.info('[PDF] アクセス成功 → iframeで表示します');
        iframe.src = previewSrc;
      }
    })
    .catch(err => {
      console.error('[PDF] fetchネットワークエラー:', err);
      errorMsg.style.display = 'flex';
    });
}


// =========================================================================
// カスケード削除ユーティリティ
// =========================================================================

// コレクション内の全ドキュメントをバッチ削除（500件制限をページングで回避）
async function batchDeleteCollection(colRef) {
  let hasMore = true;
  while (hasMore) {
    const snap = await getDocs(query(colRef, limit(490)));
    if (snap.empty) break;
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    hasMore = snap.docs.length === 490;
  }
}

// ルームと配下の全データ（messages, readReceipts）を削除
async function deleteRoomCascade(serverId, roomId) {
  const base = `artifacts/${appId}/servers/${serverId}/rooms/${roomId}`;
  await batchDeleteCollection(collection(db, `${base}/messages`));
  await batchDeleteCollection(collection(db, `${base}/readReceipts`));
  await deleteDoc(doc(db, `artifacts/${appId}/servers/${serverId}/rooms`, roomId));
  try {
    const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
    const rtdb = await _getOrInitRTDB();
    await remove(ref(rtdb, `artifacts/${appId}/servers/${serverId}/rooms/${roomId}`));
  } catch (err) { console.error("RTDB Room Delete Failed", err); }
}

// サーバーと配下の全データ（rooms, messages, readReceipts, profiles, inviteCodes, secrets）を削除
async function deleteServerCascade(serverId) {
  const base = `artifacts/${appId}/servers/${serverId}`;
  // 全ルームを取得して配下も削除
  const roomsSnap = await getDocs(collection(db, `${base}/rooms`));
  for (const roomDoc of roomsSnap.docs) {
    const rb = `${base}/rooms/${roomDoc.id}`;
    await batchDeleteCollection(collection(db, `${rb}/messages`));
    await batchDeleteCollection(collection(db, `${rb}/readReceipts`));
    await deleteDoc(roomDoc.ref);
  }
  await batchDeleteCollection(collection(db, `${base}/profiles`));
  await batchDeleteCollection(collection(db, `${base}/inviteCodes`));
  await batchDeleteCollection(collection(db, `${base}/secrets`));
  await deleteDoc(doc(db, `artifacts/${appId}/servers`, serverId));
  try {
    const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
    const rtdb = await _getOrInitRTDB();
    await remove(ref(rtdb, `artifacts/${appId}/servers/${serverId}`));
  } catch (err) { console.error("RTDB Server Delete Failed", err); }
}

// ===== アプリ内通知スタック =====

async function showInAppNotification(serverName, roomName, senderName, text, serverId, serverData, roomId) {
  if (document.hasFocus() && roomId === currentRoomId) return;

  // 1. 本文が暗号化されている場合は、非同期で確実に復号を実行
  if (typeof isEncrypted === 'function' && isEncrypted(text)) {
    try {
      const memberIds = serverData?.joinedUsers || [];
      text = await decryptText(text, serverId, roomId, memberIds);
    } catch (e) { text = '（暗号化されたメッセージ）'; }
  }

  // 2. スタンプおよび添付ファイル(画像・動画・外部ストレージ等)のスマートな表現へ変換
  let displayBody = text;
  if (text.includes("firebase-storage") || text.includes("cloudinary") || text.includes("r2.cloudflarestorage") || text.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov)/i)) {
    displayBody = `📎 添付ファイルが送信されました`;
  } else if (text.startsWith("[STAMP]") || text.includes("/stamps/")) {
    displayBody = `🌟 スタンプが送信されました`;
  }

  // 3. 通知スタックの重複あふれガード（DOMメモリリークおよび画面圧迫の防止）
  const stack = document.getElementById("notifStack");
  if (stack && stack.children.length >= 4) {
    try { stack.removeChild(stack.firstChild); } catch (e) { }
  }

  const soundEnabled = localStorage.getItem('simplechat_sound') !== 'false';
  if (soundEnabled) {
    playNotificationSound();
    if (isTauri && window.__TAURI__?.core?.invoke) {
      window.__TAURI__.core.invoke('set_badge', { hasUnread: !document.hasFocus() }).catch(console.error);
    }
  }

  const notif = document.createElement("div");
  // ライトモード＆ダークモード両対応の最高峰リッチデザイン（エレガントなシャドウ＆ぼかし背景）
  notif.className = "bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700/80 overflow-hidden w-80 backdrop-blur-md transition-all";
  notif.style.cssText = "border-left:4px solid #6366f1; pointer-events:auto; animation:slideUpFade 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;";
  const meta = escapeHtml(`${serverName} · #${roomName}`);
  const body = escapeHtml(`${senderName}: ${displayBody}`);
  notif.innerHTML = `
          <div class="notif-row flex items-center gap-3.5 px-4 py-3.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
            <div class="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 shadow-inner">
              <i class="fas fa-bell text-indigo-500 dark:text-indigo-400 text-base animate-pulse"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[11px] font-bold text-gray-400 dark:text-gray-400 truncate tracking-wide">${meta}</div>
              <div class="text-sm text-slate-900 dark:text-slate-100 font-bold truncate leading-snug mt-0.5">${body}</div>
            </div>
            <button class="notif-x w-6 h-6 flex items-center justify-center text-gray-300 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-300 flex-shrink-0 transition-colors">
              <i class="fas fa-times text-xs"></i>
            </button>
          </div>`;
  const navData = { serverId, serverData, roomId, roomName };
  function dismissNotif() {
    notif.style.animation = "fadeIn 0.2s ease reverse forwards";
    setTimeout(() => notif.remove(), 200);
  }
  notif.querySelector(".notif-row").addEventListener("click", async (e) => {
    if (e.target.closest(".notif-x")) return;
    dismissNotif();
    if (currentServerId !== navData.serverId) {
      await enterServer(navData.serverId, navData.serverData);
      setTimeout(() => selectRoom(navData.roomId, navData.roomName), 600);
    } else {
      selectRoom(navData.roomId, navData.roomName);
    }
  });
  notif.querySelector(".notif-x").addEventListener("click", (e) => {
    e.stopPropagation();
    dismissNotif();
  });
  stack.appendChild(notif);
  setTimeout(dismissNotif, 6000);
}

// ===== グローバル右クリック無効 =====
document.addEventListener("contextmenu", (e) => {
  // 入力欄では標準の右クリックメニュー（コピペ等）を許可する
  const tag = e.target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;

  if (!e.target.closest(".message-bubble") && !e.target.closest(".server-card") && !e.target.closest(".message-row")) {
    e.preventDefault();
  }
});

// --- スマホ用メンバー一覧（ボトムシート） ---
function openBottomSheet() {
  if (window.innerWidth >= 768) return; // PCでは何もしない
  bottomSheetOverlay.classList.add("show");
  membersSidebar.classList.add("bottom-sheet-open");
  membersSidebar.style.transform = ""; // JSのインラインスタイルをリセット
}

function closeBottomSheet() {
  bottomSheetOverlay.classList.remove("show");
  membersSidebar.classList.remove("bottom-sheet-open");
  membersSidebar.style.transform = "";
}

currentRoomTitleText.addEventListener("click", openBottomSheet);
bottomSheetOverlay.addEventListener("click", closeBottomSheet);

// スワイプダウンで閉じる処理
let touchStartY = 0;
let touchCurrentY = 0;
let isDraggingSheet = false;

membersSidebar.addEventListener("touchstart", (e) => {
  if (window.innerWidth >= 768) return;
  // メンバーリストが一番上にある時だけスワイプを検知
  if (membersList.scrollTop === 0) {
    touchStartY = e.touches[0].clientY;
    isDraggingSheet = true;
    membersSidebar.style.transition = "none"; // ドラッグ中はアニメーションを切る
  }
}, { passive: true });

membersSidebar.addEventListener("touchmove", (e) => {
  if (!isDraggingSheet) return;
  e.preventDefault(); // ページ全体のスクロールを防ぐ
  touchCurrentY = e.touches[0].clientY;
  const deltaY = touchCurrentY - touchStartY;
  if (deltaY > 0) {
    // 下に引っ張っている時
    membersSidebar.style.transform = `translateY(${deltaY}px)`;
  }
}, { passive: false });

membersSidebar.addEventListener("touchend", () => {
  if (!isDraggingSheet) return;
  isDraggingSheet = false;
  membersSidebar.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)";

  const deltaY = touchCurrentY - touchStartY;
  if (deltaY > 100) {
    // 100px以上下にスワイプしたら閉じる
    closeBottomSheet();
  } else {
    // 元に戻す
    membersSidebar.style.transform = "translateY(0)";
  }
  touchStartY = 0;
  touchCurrentY = 0;
});

// --- ピン留め機能 ---
pinMessageButton.addEventListener("click", async (e) => {
  if (ignoreNextContextMenuClick) { e.preventDefault(); e.stopPropagation(); return; }
  if (selectedMessageForContext) {

    const msgRef = doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`, selectedMessageForContext.id);
    const isPinned = !selectedMessageForContext.isPinned;
    await updateDoc(msgRef, { isPinned: isPinned });
    try {
      const { ref, update } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const rtdb = await _getOrInitRTDB();
      await update(ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages/${selectedMessageForContext.id}`), { isPinned: isPinned });
    } catch (e) { console.error("RTDB Pin Failed", e); }
    alertMessage(isPinned ? "ピン留めしました" : "ピン留めを解除しました", "success");
  }
  messageContextMenu.classList.add("hidden");
});

let isPinnedMessagesExpanded = false;
let isPinnedMessagesMinimized = false;

function renderPinnedMessages() {
  const pinnedMessages = currentPinnedMessages;
  pinnedMessagesArea.innerHTML = "";

  // If no pins or it's manually minimized by user, we show the floating minimized icon (or hide if no pins)
  if (pinnedMessages.length === 0) {
    pinnedMessagesArea.classList.add("hidden");
    document.getElementById("minimizedPinIcon")?.remove();
    return;
  }

  pinnedMessagesArea.classList.remove("hidden");

  // Restore minimized state from session
  if (sessionStorage.getItem(`minimized_pins_${currentRoomId}`) === "true") {
    isPinnedMessagesMinimized = true;
  } else {
    isPinnedMessagesMinimized = false;
  }

  if (isPinnedMessagesMinimized) {
    pinnedMessagesArea.classList.add("hidden");
    // Show floating icon
    let floatIcon = document.getElementById("minimizedPinIcon");
    if (!floatIcon) {
      floatIcon = document.createElement("div");
      floatIcon.id = "minimizedPinIcon";
      floatIcon.className = "absolute top-4 right-4 z-[60] bg-white dark:bg-gray-800 shadow-lg rounded-full w-10 h-10 flex items-center justify-center cursor-pointer border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all";
      floatIcon.innerHTML = `<i class="fas fa-bullhorn"></i><div class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">${pinnedMessages.length}</div>`;
      floatIcon.onclick = () => {
        sessionStorage.removeItem(`minimized_pins_${currentRoomId}`);
        isPinnedMessagesMinimized = false;
        renderPinnedMessages();
      };
      document.querySelector(".relative.flex-1").appendChild(floatIcon);
    } else {
      floatIcon.querySelector("div").textContent = pinnedMessages.length;
    }
    return;
  } else {
    document.getElementById("minimizedPinIcon")?.remove();
  }

  // LINE-style Announcement Banner
  const container = document.createElement("div");
  container.className = "w-full bg-white dark:bg-[#202225] border-b border-gray-200 dark:border-[#1e1f22] shadow-sm flex flex-col transition-all duration-300";

  // Main visible header (shows the latest pin)
  const latestMsg = pinnedMessages[pinnedMessages.length - 1];
  const headerRow = document.createElement("div");
  headerRow.className = "flex items-center px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2b2d31] transition-colors relative";

  const iconWrap = document.createElement("div");
  iconWrap.className = "text-gray-400 dark:text-gray-500 mr-3";
  iconWrap.innerHTML = '<i class="fas fa-bullhorn"></i>';

  const contentWrap = document.createElement("div");
  contentWrap.className = "flex-1 flex flex-col min-w-0 mr-2";

  const msgLine = document.createElement("div");
  msgLine.className = "truncate text-sm text-gray-800 dark:text-gray-200";
  msgLine.innerHTML = `<span class="font-bold mr-1">${escapeHtml(latestMsg.senderNickname)}:</span>${escapeHtml(latestMsg._decryptedErrorText || latestMsg.text || (latestMsg.fileType?.startsWith('image') ? "画像" : "ファイル"))}`;

  contentWrap.appendChild(msgLine);

  // Action buttons
  const actionsWrap = document.createElement("div");
  actionsWrap.className = "flex items-center gap-1 text-gray-400";

  const expandBtn = document.createElement("div");
  expandBtn.className = "w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors";
  expandBtn.innerHTML = `<i class="fas fa-chevron-${isPinnedMessagesExpanded ? 'up' : 'down'} transition-transform duration-300"></i>`;

  const closeBtn = document.createElement("div");
  closeBtn.className = "w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ml-1";
  closeBtn.innerHTML = `<i class="fas fa-times"></i>`;

  // Events
  msgLine.onclick = (e) => {
    e.stopPropagation();
    jumpToMsg(latestMsg.id);
  };

  expandBtn.onclick = (e) => {
    e.stopPropagation();
    isPinnedMessagesExpanded = !isPinnedMessagesExpanded;
    renderPinnedMessages();
  };

  closeBtn.onclick = (e) => {
    e.stopPropagation();
    sessionStorage.setItem(`minimized_pins_${currentRoomId}`, "true");
    isPinnedMessagesMinimized = true;
    renderPinnedMessages();
  };

  // If only 1 message, no expand button needed
  if (pinnedMessages.length > 1) {
    actionsWrap.appendChild(expandBtn);
  }
  actionsWrap.appendChild(closeBtn);

  headerRow.appendChild(iconWrap);
  headerRow.appendChild(contentWrap);
  headerRow.appendChild(actionsWrap);
  container.appendChild(headerRow);

  // Expanded List
  if (isPinnedMessagesExpanded && pinnedMessages.length > 1) {
    const listWrap = document.createElement("div");
    listWrap.className = "border-t border-gray-100 dark:border-[#2b2d31] bg-gray-50 dark:bg-[#1e1f22] overflow-y-auto max-h-64";

    pinnedMessages.forEach((msg, idx) => {
      // Skip the latest one if we want, but LINE shows all in the list
      const itemRow = document.createElement("div");
      itemRow.className = "flex items-center px-4 py-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-[#2b2d31] transition-colors border-b border-gray-100 dark:border-gray-800 last:border-0";

      const itemText = document.createElement("div");
      itemText.className = "flex-1 truncate text-sm text-gray-700 dark:text-gray-300";
      itemText.innerHTML = `<span class="font-bold mr-1 text-gray-900 dark:text-gray-100">${escapeHtml(msg.senderNickname)}:</span>${escapeHtml(msg._decryptedErrorText || msg.text || (msg.fileType?.startsWith('image') ? "画像" : "ファイル"))}`;

      itemRow.appendChild(itemText);
      itemRow.onclick = () => jumpToMsg(msg.id);
      listWrap.appendChild(itemRow);
    });
    container.appendChild(listWrap);
  }

  pinnedMessagesArea.appendChild(container);
}

function jumpToMsg(id) {
  const el = messagesDisplay.querySelector(`.message-bubble[data-message-id="${id}"]`);
  if (el) {
    doJumpHighlight(el);
  } else {
    jumpToUnloadedMessage(id);
  }
}

