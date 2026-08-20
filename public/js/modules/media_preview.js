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

// ================= MEDIA PREVIEW MODULE ================
// === Google / Apple Photosと同等の世界最高峰画像プレビュー (PhotoSwipe v5) ===
function ensurePhotoSwipeCSS() {
  if (!document.getElementById('pswp-css')) {
    const link = document.createElement('link');
    link.id = 'pswp-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/photoswipe@5.4.3/dist/photoswipe.css';
    document.head.appendChild(link);
  }
}

async function openPhotoSwipeModal(fileUrl, fileName) {
  ensurePhotoSwipeCSS();
  try {
    const PhotoSwipe = (await import('https://unpkg.com/photoswipe@5.4.3/dist/photoswipe.esm.js')).default;
    const tempImg = new Image();
    tempImg.src = fileUrl;
    await new Promise(res => {
      if (tempImg.complete) res();
      else tempImg.onload = tempImg.onerror = res;
    });

    const imgWidth = tempImg.naturalWidth || 1200;
    const imgHeight = tempImg.naturalHeight || 800;

    const pswp = new PhotoSwipe({
      dataSource: [{
        src: fileUrl,
        width: imgWidth,
        height: imgHeight,
        alt: fileName || '画像'
      }],
      bgOpacity: 0.9,
      wheelToZoom: true,
      closeOnVerticalDrag: true,
      // 1クリック / 1タップでの拡大率をダイナミックに引き上げる（画面フィットの2.5倍）
      secondaryZoomLevel: (zoomLevelObject) => Math.max(zoomLevelObject.fit * 2.5, 1.5),
      maxZoomLevel: 4,
      // 画像の周囲に適度な空白（余白）を確保するデザイン
      paddingFn: (viewportSize) => {
        const isMobile = viewportSize.x < 768;
        return {
          top: isMobile ? 40 : 60,
          bottom: isMobile ? 40 : 60,
          left: isMobile ? 16 : 40,
          right: isMobile ? 16 : 40
        };
      }
    });

    // UI登録イベントハンドラ内で右上ツールバーにダウンロードボタンを追加
    pswp.on('uiRegister', () => {
      pswp.ui.registerElement({
        name: 'download-button',
        ariaLabel: '画像をダウンロード',
        order: 8,
        isButton: true,
        html: '<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 32 32" width="32" height="32"><path d="M16 4v15m0 0l-6-6m6 6l6-6M6 26h20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
        onClick: (event, el) => {
          const ext = (fileName || '').split('.').pop() || 'png';
          downloadFile(fileUrl, fileName || `image_${Date.now()}.${ext}`, `image/${ext}`);
        }
      });
    });

    pswp.init();
  } catch (e) {
    console.error('[PhotoSwipe] ロードエラー:', e);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const pdfLb = document.getElementById('pdfLightbox');
    if (pdfLb && pdfLb.style.display === 'flex') closePdfLightbox();
  }
});



messageInput.addEventListener("keydown", (e) => {
  if (isMentionPopupOpen) {
    if (e.key === "ArrowDown" || e.key === "Tab") {
      e.preventDefault();
      mentionSelectedIndex++;
      renderMentionPopup();
      return;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      mentionSelectedIndex--;
      renderMentionPopup();
      return;
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (mentionUsers.length > 0) {
        selectMention(mentionUsers[mentionSelectedIndex].nickname);
      }
      return;
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMentionPopup();
      return;
    }
  }

  if (e.key === "Enter" && !e.shiftKey) {
    if (e.isComposing || e.keyCode === 229) return;
    e.preventDefault(); sendMessage();
  }
});

messageInput.addEventListener("input", (e) => {
  // メンション機能の判定
  const val = messageInput.value;
  const pos = messageInput.selectionStart;
  const beforeCursor = val.substring(0, pos);
  const match = beforeCursor.match(/[@＠]([^\s]*)$/);

  if (match) {
    const isStartOfWord = match.index === 0 || /\s/.test(beforeCursor.charAt(match.index - 1)) || /^[^\w\s]/.test(beforeCursor.charAt(match.index - 1));
    if (isStartOfWord) {
      openMentionPopup(match[1]);
    } else {
      closeMentionPopup();
    }
  } else {
    closeMentionPopup();
  }

  // 入力欄の自動拡張とタイピング状態の管理
  messageInput.style.height = "auto";
  messageInput.style.height = messageInput.scrollHeight + "px";
  if (!isCurrentlyTyping) {
    isCurrentlyTyping = true;
    setTypingStatus(true);
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isCurrentlyTyping = false;
    setTypingStatus(false);
  }, 3000);
});

messageInput.addEventListener("blur", () => {
  clearTimeout(typingTimeout);
  if (isCurrentlyTyping) {
    isCurrentlyTyping = false;
    setTypingStatus(false);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && isCurrentlyTyping) {
    clearTimeout(typingTimeout);
    isCurrentlyTyping = false;
    setTypingStatus(false);
  }
});

messageInput.addEventListener("paste", async (e) => {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === 'file') {
      let f = items[i].getAsFile();
      if (!f) return;
      f = await processHeicFile(f);
      if (!checkFileAllowed(f)) return;
      const MAX = f.type.startsWith('video/') ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
      if (f.size > MAX) { alertMessage(f.type.startsWith('video/') ? "動画は100MBまでです" : "ファイルは10MBまでです", "error"); return; }
      attachedFile = { file: f, name: f.name || `paste_${Date.now()}`, type: f.type, size: f.size };
      updateFilePreview();
      e.preventDefault();
      return;
    }
  }
});
function updateFilePreview() {
  const progressBar = document.getElementById("uploadProgressBar");
  const progressFill = document.getElementById("uploadProgressFill");
  const filePreviewImage = document.getElementById("filePreviewImage");

  if (filePreviewImage) {
    filePreviewImage.classList.add("hidden");
    if (filePreviewImage.src && filePreviewImage.src.startsWith("blob:")) {
      URL.revokeObjectURL(filePreviewImage.src);
    }
    filePreviewImage.src = "";
  }

  if (attachedFile) {
    const sizeStr = attachedFile.size >= 1024 * 1024
      ? `${(attachedFile.size / (1024 * 1024)).toFixed(1)} MB`
      : `${(attachedFile.size / 1024).toFixed(1)} KB`;
    filePreviewName.textContent = `${attachedFile.name} (${sizeStr})`;

    if (filePreviewImage && attachedFile.type && attachedFile.type.startsWith("image/")) {
      filePreviewImage.src = URL.createObjectURL(attachedFile.file);
      filePreviewImage.classList.remove("hidden");
    }

    filePreviewContainer.classList.remove("hidden");
    progressBar.classList.add("hidden");
    progressFill.style.width = "0%";
  } else if (attachedKvFile) {
    const sizeStr = attachedKvFile.size >= 1024 * 1024
      ? `${(attachedKvFile.size / (1024 * 1024)).toFixed(1)} MB`
      : `${(attachedKvFile.size / 1024).toFixed(1)} KB`;
    filePreviewName.innerHTML = `<i class="fas fa-paperclip mr-1 text-gray-400"></i>${escapeHtml(attachedKvFile.name)} (${escapeHtml(sizeStr)})`;
    filePreviewContainer.classList.remove("hidden");
    progressBar.classList.add("hidden");
    progressFill.style.width = "0%";
  } else {
    filePreviewContainer.classList.add("hidden");
    progressBar.classList.add("hidden");
    progressFill.style.width = "0%";
  }
}

// ===== インアプリブラウザ (In-App Browser) 制御 =====
let currentInAppBrowserUrl = '';

window.openInAppBrowser = function (url) {
  if (!url) return;
  currentInAppBrowserUrl = url;

  // 判定: Windows版 (Tauri) または iOS PWA / スタンドアロン表示時
  const isTauri = !!window.__TAURI__;
  const isPwa = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

  if (isTauri || isPwa) {
    const modal = document.getElementById('inAppBrowserModal');
    const iframe = document.getElementById('inAppBrowserIframe');
    const urlDisplay = document.getElementById('inAppBrowserUrlDisplay');

    if (modal && iframe && urlDisplay) {
      urlDisplay.textContent = url;
      iframe.src = url;
      modal.classList.remove('hidden');
      return;
    }
  }

  // 通常のWebブラウザでタブとして開いている場合は新しいタブで開く
  window.open(url, '_blank', 'noopener,noreferrer');
};

window.closeInAppBrowser = function () {
  const modal = document.getElementById('inAppBrowserModal');
  const iframe = document.getElementById('inAppBrowserIframe');
  if (modal) modal.classList.add('hidden');
  if (iframe) iframe.src = 'about:blank';
  currentInAppBrowserUrl = '';
};

window.reloadInAppBrowser = function () {
  const iframe = document.getElementById('inAppBrowserIframe');
  if (iframe && currentInAppBrowserUrl) {
    iframe.src = currentInAppBrowserUrl;
  }
};

window.copyInAppBrowserUrl = function () {
  if (!currentInAppBrowserUrl) return;
  safeCopy(currentInAppBrowserUrl);
  alertMessage('リンクをコピーしました', 'success');
};

window.openInAppBrowserInExternal = function () {
  if (!currentInAppBrowserUrl) return;
  if (window.__TAURI__?.core) {
    window.__TAURI__.core.invoke('plugin:shell|open', { path: currentInAppBrowserUrl }).catch(() => {
      window.open(currentInAppBrowserUrl, '_blank');
    });
  } else {
    window.open(currentInAppBrowserUrl, '_blank', 'noopener,noreferrer');
  }
};

// チャット内のURLリンククリックをインターセプト
document.addEventListener('click', (e) => {
  const anchor = e.target.closest('#messagesDisplay a, #pinnedMessagesArea a');
  if (anchor && anchor.href && !anchor.href.startsWith('javascript:')) {
    e.preventDefault();
    e.stopPropagation();
    window.openInAppBrowser(anchor.href);
  }
});
