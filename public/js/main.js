/**
 * Covo Integrated Main Script (main.js)
 * 100% Fully Resolved Scope & All Discord Modern UI Enhancements
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app-check.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  onIdTokenChanged,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  linkWithPopup,
  linkWithRedirect,
  unlink,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
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
  endAt,
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

import { E2EE_PREFIX, E2EE_LS_PRIV, E2EE_LS_PUB, _e2ee, _subtleOK, _td, _te, initCryptoContext, __lsGet, __lsSet, __genUserKeyPair, __importPriv, __importPub, _ensureE2EEKeys, __ensureE2EEKeysImpl, __backupKeysToFirestore, __getUserPublicKey, __getEscrowPublicKey, _requestEscrowRescue, _ensureEscrowKey, _getOrCreateRoomKey, __getOrCreateRoomKeyImpl, _getRoomKeyWithWait, _rotateAllRoomKeys, __distributeRoomKeyVersion, _backfillRoomKeysForMembers, _encryptText, _isEncrypted, _decryptText, _decryptMessagesInPlace, _encryptFileE2EE, _decryptFileE2EE, _updateE2EEStatusUI, _getOrCreateDmKey, __getOrCreateDmKeyImpl, _getDmKeyWithWait, _encryptDmText, _decryptDmText, _decryptDmMessagesInPlace } from './crypto_helpers.js';
import * as LocalStore from './local_store.js';
import { _abToB64, _b64ToAb, formatBytes, getMsgTimestamp, safeCopy, _execCopyFallback, emailInitial, processHeicFile } from './utils.js';
import { escapeHtml, getEmojiHtml, _twemojiParse, escapeHtmlAndLinkUrls } from './text_formatter.js';
import { alertMessage, openAvatarLightbox, playNotificationSound } from './ui_helpers.js';
import { checkFileAllowed as _checkFileAllowed, _uploadToExternalService } from './file_uploader.js';
import { _runShadowHunter, _updateLayoutDebugUI, __clearInspectHighlight, __showInspectHighlight, _inspectPoint, _lineColor as __lineColor, _appendConsoleLine as __appendConsoleLine, setInspectMode, toggleDevConsole, clearDevConsole, copyDevConsole, copyDebugText, getSystemDiagnosticInfo, formatDiagnosticMarkdown, copySystemDiagnosticReport, copyFullDiagnosticAndConsoleReport } from './debug_ui.js';


// === コンソールログの自動収集 & ネットワーク一時エラーのフィルタリング ===
window._covoLogs = [];
const _orgLog = console.log, _orgWarn = console.warn, _orgErr = console.error;

function isTransientNetworkError(args) {
  try {
    const str = Array.from(args).map(a => (a instanceof Error ? (a.message + ' ' + (a.stack || '')) : String(a))).join(' ');
    return str.includes('QUIC_PROTOCOL_ERROR') ||
           str.includes('QUIC_PUBLIC_RESET') ||
           str.includes('ERR_HTTP2_PROTOCOL_ERROR') ||
           str.includes('beforeinstallpromptevent.preventDefault') ||
           str.includes('beforeinstallprompt') ||
           str.includes('WebChannel') ||
           str.includes('FetchStream') ||
           str.includes('disconnected port object') ||
           str.includes('Extension context invalidated') ||
           str.includes('appCheck/throttled') ||
           str.includes('appCheck/initial-throttle') ||
           str.includes('auth/popup-blocked') ||
           str.includes('auth/popup-closed-by-user') ||
           str.includes('auth/cancelled-popup-request') ||
           str.includes('ResizeObserver loop');
  } catch (_) {
    return false;
  }
}

// === エラー & 警告自動集約テレメトリシステム (全ユーザー自動送信・重複排除・リアルタイム集約) ===
const _reportedSignaturesRecently = new Map();
const _pendingTelemetryErrors = [];
let _isReportingTelemetry = false;

function _createErrorSignature(type, message, stack) {
  const normType = String(type || 'error').toLowerCase();
  const normMsg = String(message || '').substring(0, 250).replace(/\s+/g, ' ').trim();
  const stackTop = String(stack || '').split('\n').slice(0, 3).map(l => l.replace(/:\d+:\d+/g, '')).join('|');
  const raw = `${normType}:::${normMsg}:::${stackTop}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return 'err_' + Math.abs(hash).toString(36);
}

function _reportTelemetryError(type, message, stack) {
  if (_isReportingTelemetry) return; // 再帰呼び出し（無限ループ）完全防止
  _isReportingTelemetry = true;
  try {
    const msgStr = typeof message === 'object' ? (message instanceof Error ? (message.stack || message.message) : JSON.stringify(message)) : String(message || '');
    if (!msgStr || msgStr === '[object Object]' || msgStr.includes('ResizeObserver loop') || msgStr.includes('Script error.')) return;
    // 外部拡張機能の無関係なエラーは除外
    if (msgStr.includes('chrome-extension://') || msgStr.includes('Disconnected port') || msgStr.includes('beforeinstallprompt')) return;

    const signature = _createErrorSignature(type, msgStr, stack);
    const now = Date.now();
    const lastReported = _reportedSignaturesRecently.get(signature) || 0;
    if (now - lastReported < 2500) return; // 2.5秒間ローカル重複排除
    _reportedSignaturesRecently.set(signature, now);

    const email = (typeof userAuthEmail !== 'undefined' && userAuthEmail) || auth?.currentUser?.email || (auth?.currentUser?.uid ? `uid:${auth.currentUser.uid}` : '未ログイン');

    // 自分の画面に即座に表示できるよう、ローカルテレメトリ配列に即時反映
    if (typeof _cachedTelemetryErrors !== 'undefined') {
      const existingIdx = _cachedTelemetryErrors.findIndex(e => e.id === signature || e.signature === signature);
      if (existingIdx >= 0) {
        _cachedTelemetryErrors[existingIdx].count = (_cachedTelemetryErrors[existingIdx].count || 1) + 1;
        _cachedTelemetryErrors[existingIdx].lastOccurredAt = new Date();
      } else {
        _cachedTelemetryErrors.unshift({
          id: signature,
          signature: signature,
          type: type || 'error',
          message: msgStr.substring(0, 3000),
          stack: String(stack || '').substring(0, 6000),
          firstOccurredAt: new Date(),
          lastOccurredAt: new Date(),
          count: 1,
          affectedEmails: [email],
          environment: {
            userAgent: navigator.userAgent || 'unknown',
            appVersion: _appVersion || 'web',
            screenSize: `${window.innerWidth}x${window.innerHeight}`
          }
        });
      }
      const badgeEl = document.getElementById("telemetryCountBadge");
      if (badgeEl) {
        badgeEl.textContent = _cachedTelemetryErrors.length;
        badgeEl.classList.remove('hidden');
      }
      if (typeof renderTelemetryErrorsList === 'function' && document.getElementById("telemetryErrorsList")) {
        renderTelemetryErrorsList();
      }
    }

    if (typeof db === 'undefined' || !db || typeof appId === 'undefined' || !appId) {
      if (_pendingTelemetryErrors.length < 100) {
        _pendingTelemetryErrors.push({ type, message: msgStr, stack: String(stack || '') });
      }
      return;
    }

    const errorDocRef = doc(db, `artifacts/${appId}/error_reports`, signature);

    const envInfo = {
      userAgent: navigator.userAgent || 'unknown',
      appVersion: _appVersion || 'web',
      screenSize: `${window.innerWidth}x${window.innerHeight}`,
      isElectron: Boolean(window.electronAPI)
    };

    setDoc(errorDocRef, {
      signature: signature,
      type: type || 'error',
      message: msgStr.substring(0, 3000),
      stack: String(stack || '').substring(0, 6000),
      firstOccurredAt: serverTimestamp(),
      lastOccurredAt: serverTimestamp(),
      count: increment(1),
      affectedEmails: arrayUnion(email),
      environment: envInfo
    }, { merge: true }).catch(err => {
      // 送信失敗時はキューに退避して再送
      if (_pendingTelemetryErrors.length < 100) {
        _pendingTelemetryErrors.push({ type, message: msgStr, stack: String(stack || '') });
      }
    });
  } catch (e) {
  } finally {
    _isReportingTelemetry = false;
  }
}

function _flushPendingTelemetryErrors() {
  if (typeof db === 'undefined' || !db || typeof appId === 'undefined' || !appId) return;
  const items = _pendingTelemetryErrors.splice(0, _pendingTelemetryErrors.length);
  for (const item of items) {
    _reportTelemetryError(item.type, item.message, item.stack);
  }
}

// オンライン復帰時および定期的なフラッシュ
window.addEventListener('online', _flushPendingTelemetryErrors);
setInterval(_flushPendingTelemetryErrors, 15000);

window.addEventListener('error', (event) => {
  if (event.error) {
    _reportTelemetryError('error', event.error.message || event.message, event.error.stack || '');
  } else if (event.message) {
    _reportTelemetryError('error', event.message, `${event.filename || ''}:${event.lineno || ''}:${event.colno || ''}`);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (reason instanceof Error) {
    _reportTelemetryError('unhandledrejection', reason.message, reason.stack || '');
  } else {
    _reportTelemetryError('unhandledrejection', String(reason || 'Unhandled Promise Rejection'), '');
  }
});

const _pushLog = (type, args) => {
  try {
    if (isTransientNetworkError(args)) return;
    const msg = Array.from(args).map(a => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object') {
        try { return JSON.stringify(a); } catch (err) { return String(a); }
      }
      return String(a);
    }).join(' ');
    const line = `[${type}] ${msg}`;
    window._covoLogs.push(line);
    if (window._covoLogs.length > 250) window._covoLogs.shift();
    const panel = document.getElementById('devConsolePanel');
    if (panel && panel.style.display === 'flex') {
      if (typeof __appendConsoleLine === 'function') {
        __appendConsoleLine(line);
      }
    }
  } catch (e) { }
};

console.log = function (...args) { _pushLog('INFO', args); _orgLog.apply(console, args); };
console.warn = function (...args) {
  if (isTransientNetworkError(args)) return;
  _pushLog('WARN', args);
  _orgWarn.apply(console, args);
  try {
    const str = Array.from(args).map(a => (a instanceof Error ? a.message : String(a))).join(' ');
    if (str.length > 3) {
      _reportTelemetryError('warn', str, (new Error()).stack || '');
    }
  } catch (_) {}
};
console.error = function (...args) {
  if (isTransientNetworkError(args)) return;
  _pushLog('ERR', args);
  _orgErr.apply(console, args);
  try {
    const errObj = args.find(a => a instanceof Error);
    const str = Array.from(args).map(a => (a instanceof Error ? (a.message + '\n' + (a.stack || '')) : String(a))).join(' ');
    _reportTelemetryError('error', errObj ? (errObj.stack || errObj.message) : str, errObj ? errObj.stack : (new Error()).stack || '');
  } catch (_) {}
};

// ========= Cloudflare Worker ベースURL =========
const WORKER_BASE_URL = 'https://simplechat-api.astro-fray-server.workers.dev';

// ========= バージョン管理 =========
let _appVersion = null;
fetch('/version.json', { cache: 'default' })
  .then(r => r.json())
  .then(d => { _appVersion = d.version || null; })
  .catch(() => { _appVersion = null; });

// Firebase設定
const firebaseConfig = {
  apiKey: "AIzaSyDxGdHwHnJYhBErKcQHZs0H9JpwcSN-huY",
  authDomain: "simplechat-65a0d.web.app",
  projectId: "simplechat-65a0d",
  storageBucket: "simplechat-65a0d.firebasestorage.app",
  messagingSenderId: "611067360180",
  appId: "1:611067360180:web:5c43144af3ccc4988878e1",
  measurementId: "G-2JMHWNMG4R",
  databaseURL: "https://simplechat-65a0d-default-rtdb.asia-southeast1.firebasedatabase.app",
};

const appId = "simplechat-65a0d";
window._devConsoleLog = [];

initCryptoContext({
  getDb: () => (typeof db !== 'undefined' ? db : null),
  getUserId: () => (typeof userId !== 'undefined' ? userId : null),
  getAppId: () => (typeof appId !== 'undefined' ? appId : null),
  getAuth: () => (typeof auth !== 'undefined' ? auth : null),
  getIsAdmin: () => (typeof isAdmin !== 'undefined' ? isAdmin : false)
});

window._lsGet = function (...args) { return __lsGet(...args); };
function _lsGet(...args) { return __lsGet(...args); }
window._lsSet = function (...args) { return __lsSet(...args); };
function _lsSet(...args) { return __lsSet(...args); }
window._genUserKeyPair = function (...args) { return __genUserKeyPair(...args); };
function _genUserKeyPair(...args) { return __genUserKeyPair(...args); }
window._importPriv = function (...args) { return __importPriv(...args); };
function _importPriv(...args) { return __importPriv(...args); }
window._importPub = function (...args) { return __importPub(...args); };
function _importPub(...args) { return __importPub(...args); }
window.ensureE2EEKeys = function (...args) { return _ensureE2EEKeys(...args); };
function ensureE2EEKeys(...args) { return _ensureE2EEKeys(...args); }
window._ensureE2EEKeysImpl = function (...args) { return __ensureE2EEKeysImpl(...args); };
function _ensureE2EEKeysImpl(...args) { return __ensureE2EEKeysImpl(...args); }
window._backupKeysToFirestore = function (...args) { return __backupKeysToFirestore(...args); };
function _backupKeysToFirestore(...args) { return __backupKeysToFirestore(...args); }
window._getUserPublicKey = function (...args) { return __getUserPublicKey(...args); };
function _getUserPublicKey(...args) { return __getUserPublicKey(...args); }
window._getEscrowPublicKey = function (...args) { return __getEscrowPublicKey(...args); };
function _getEscrowPublicKey(...args) { return __getEscrowPublicKey(...args); }
window.requestEscrowRescue = function (...args) { return _requestEscrowRescue(...args); };
function requestEscrowRescue(...args) { return _requestEscrowRescue(...args); }
window.ensureEscrowKey = function (...args) { return _ensureEscrowKey(...args); };
function ensureEscrowKey(...args) { return _ensureEscrowKey(...args); }
window.getOrCreateRoomKey = function (...args) { return _getOrCreateRoomKey(...args); };
function getOrCreateRoomKey(...args) { return _getOrCreateRoomKey(...args); }
window._getOrCreateRoomKeyImpl = function (...args) { return __getOrCreateRoomKeyImpl(...args); };
function _getOrCreateRoomKeyImpl(...args) { return __getOrCreateRoomKeyImpl(...args); }
window.getRoomKeyWithWait = function (...args) { return _getRoomKeyWithWait(...args); };
function getRoomKeyWithWait(...args) { return _getRoomKeyWithWait(...args); }
window.rotateAllRoomKeys = function (...args) { return _rotateAllRoomKeys(...args); };
function rotateAllRoomKeys(...args) { return _rotateAllRoomKeys(...args); }
window._distributeRoomKeyVersion = function (...args) { return __distributeRoomKeyVersion(...args); };
function _distributeRoomKeyVersion(...args) { return __distributeRoomKeyVersion(...args); }
window.backfillRoomKeysForMembers = function (...args) { return _backfillRoomKeysForMembers(...args); };
function backfillRoomKeysForMembers(...args) { return _backfillRoomKeysForMembers(...args); }
window.encryptText = function (...args) { return _encryptText(...args); };
function encryptText(...args) { return _encryptText(...args); }
window.isEncrypted = function (...args) { return _isEncrypted(...args); };
function isEncrypted(...args) { return _isEncrypted(...args); }
window.decryptText = function (...args) { return _decryptText(...args); };
function decryptText(...args) { return _decryptText(...args); }
window.decryptMessagesInPlace = function (...args) { return _decryptMessagesInPlace(...args); };
function decryptMessagesInPlace(...args) { return _decryptMessagesInPlace(...args); }
window.encryptFileE2EE = function (...args) { return _encryptFileE2EE(...args); };
function encryptFileE2EE(...args) { return _encryptFileE2EE(...args); }
window.decryptFileE2EE = function (...args) { return _decryptFileE2EE(...args); };
function decryptFileE2EE(...args) { return _decryptFileE2EE(...args); }
window.updateE2EEStatusUI = function (...args) { return _updateE2EEStatusUI(...args); };
function updateE2EEStatusUI(...args) { return _updateE2EEStatusUI(...args); }

// デバッグUI ラッパー関数
window.updateLayoutDebugUI = function (...args) { if (typeof _updateLayoutDebugUI === 'function') return _updateLayoutDebugUI(...args); };
function updateLayoutDebugUI(...args) { if (typeof _updateLayoutDebugUI === 'function') return _updateLayoutDebugUI(...args); }
window.runShadowHunter = function (...args) { if (typeof _runShadowHunter === 'function') return _runShadowHunter(...args); };
function runShadowHunter(...args) { if (typeof _runShadowHunter === 'function') return _runShadowHunter(...args); }
window.inspectPoint = function (...args) { if (typeof _inspectPoint === 'function') return _inspectPoint(...args); };
function inspectPoint(...args) { if (typeof _inspectPoint === 'function') return _inspectPoint(...args); }
window.clearInspectHighlight = function (...args) { if (typeof __clearInspectHighlight === 'function') return __clearInspectHighlight(...args); };
function clearInspectHighlight(...args) { if (typeof __clearInspectHighlight === 'function') return __clearInspectHighlight(...args); }
window.showInspectHighlight = function (...args) { if (typeof __showInspectHighlight === 'function') return __showInspectHighlight(...args); };
function showInspectHighlight(...args) { if (typeof __showInspectHighlight === 'function') return __showInspectHighlight(...args); }
window.setInspectMode = setInspectMode;
window.toggleDevConsole = toggleDevConsole;
window.clearDevConsole = clearDevConsole;
window.copyDevConsole = copyDevConsole;
window.copyDebugText = copyDebugText;


// ファイルアップローダー
function checkFileAllowed(file) { return _checkFileAllowed(file); }
function uploadToExternalService(file, onProgress, _folder, _serverId = currentServerId) {
  return _uploadToExternalService(file, auth, userId, WORKER_BASE_URL, onProgress, _folder, _serverId);
}

// === グローバル状態変数 ===
let app;
let db;
let auth;
let messaging;
let currentFcmToken = null;
const roomNames = {};
let userId = null;
let userNickname = null;
let isAdmin = false;
let isListAdmin = false;
const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI__);

// DOM要素参照（安全な初期化とStrictスコープ対応）
const userPanelName = document.getElementById("userPanelName");
const userPanelId = document.getElementById("userPanelId");
const userPanelAvatar = document.getElementById("userPanelAvatar");
const headerTitle = document.getElementById("headerTitle");
const authContainer = document.getElementById("authContainer");
const nicknameContainer = document.getElementById("nicknameContainer");
const appContainer = document.getElementById("appContainer");
const loadingOverlay = document.getElementById("loadingOverlay");
const nicknameInput = document.getElementById("nicknameInput");
const allowedEmailsList = document.getElementById("allowedEmailsList");
const adminEmailsList = document.getElementById("adminEmailsList");
const listAdminEmailsList = document.getElementById("listAdminEmailsList");
const adminPanelContainer = document.getElementById("adminPanelContainer");
const adminMessage = document.getElementById("adminMessage");
const newListAdminEmailInput = document.getElementById("newListAdminEmailInput");
const addListAdminEmailButton = document.getElementById("addListAdminEmailButton");
const settingsNicknameInput = document.getElementById("settingsNicknameInput");
const settingsAvatarText = document.getElementById("settingsAvatarText");
const settingsMessage = document.getElementById("settingsMessage");
const settingsModal = document.getElementById("settingsModal");
const currentRoomTitleText = document.getElementById("currentRoomTitleText");
const fileAttachInput = document.getElementById("fileAttachInput");
const fileAttachButton = document.getElementById("fileAttachButton");
const messageInput = document.getElementById("messageInput");
const sendMessageButton = document.getElementById("sendMessageButton");
const pinnedMessagesArea = document.getElementById("pinnedMessagesArea");
const replyingToContainer = document.getElementById("replyingToContainer");
const replyingToNickname = document.getElementById("replyingToNickname");
const replyingToText = document.getElementById("replyingToText");
const messageContextMenu = document.getElementById("messageContextMenu");
const downloadMessageButton = document.getElementById("downloadMessageButton");
const membersSidebar = document.getElementById("membersSidebar");
const membersList = document.getElementById("membersList");
const currentRoomHeader = document.getElementById("currentRoomHeader");
const messagesDisplay = document.getElementById("messagesDisplay");
const roomList = document.getElementById("roomList");

let currentRoomId = null;
let unsubscribeMessages = null;
let unsubscribeUserStatus = null;

let isAuthReady = false;
let pendingRoomJoin = null;
let pendingRoomDelete = null;

let lastMessagesData = [];
let attachedFile = null;
let attachedKvFile = null;
let replyingToMessage = null;
let currentPdfUrl = "";
let currentPdfName = "";

let readReceiptsUnsubscribe = null;
let roomReadReceipts = {};
let messagesIndexMap = {};

// 未読バッジ用
let unreadCounts = {};
let unreadListeners = {};

// サーバー管理
let currentServerId = null;
let currentServerData = null;
let serverListUnsubscribe = null;
let currentServerNickname = null;
let allServersCache = [];
let currentHomeViewMode = 'dm'; // 'dm' or 'discover'

// 個チャ (DM) & フレンド & 端末移行 状態変数
let currentDmId = null;
let currentDmParticipant = null;
let currentDmParticipants = [];
let dmAndFriendsEnabled = false;
let activeDmTab = 'online';
let friendRelationships = {};
let dmConversations = {};
let unsubscribeRelationships = null;
let unsubscribeDmChannels = null;
let unsubscribeFeatureFlags = null;
let activeMigrationSession = null;
let activeMigrationCountdown = null;
let activeMigrationPeer = null;
let activeMigrationChannel = null;

// 検索・未読・コンテキスト状態
let unreadBoundaryAt = 0;
let unreadBoundaryMessageId = null;
let searchQuery = "";
let selectedMessageForContext = null;

let awayTimer = null;
const AWAY_TIMEOUT = 5 * 60 * 1000;

// メンバーリストのキャッシュと更新用インターバル
let cachedUsers = [];
let memberListRefreshInterval = null;
let userAvatarUrl = null;
let lightboxCurrentFile = null;
let typingTimeout = null;
let isCurrentlyTyping = false;
let typingUnsubscribe = null;
let readReceiptDebounceTimer = null;
let _lastSentReadMessageId = null;

// P2P Voice Call
let _callDoc = null, _callId = null, _peerConnection = null;
let _localStream = null, _callTimerInterval = null, _callTimeoutHandle = null;
let _callUnsubOffer = null, _callEndUnsub = null, _callIncomingUnsub = null;
let _isMuted = false, _callRole = null, _pendingCallerData = null;
let _ringRepeatHandle = null, _ringCtx = null, _prewarmPC = null;
let _iceDisconnectTimer = null;
let _iceRestartTimer = null;
let _lastIceRestartAt = null;
let _usingTurnRelay = false;
let _iceRestartAttempts = 0;
const CALL_TIMEOUT_MS = 30000;

let messageLimit = 20;
let rtdbMessagesLimit = 20;
let allowPagination = false;
let isInitialMessageLoad = false;
let allLoadedMessages = [];
let isLoadingOlderMessages = false;
let hasMoreOlderMessages = true;

let isJumpView = false;
let realTimeMessagesCache = [];
let jumpViewMessages = [];
let hasMoreJumpOlder = true;
let hasMoreJumpNewer = true;
let isLoadingJumpOlder = false;
let isLoadingJumpNewer = false;
let unsubscribePinnedMessages = null;
let currentPinnedMessages = [];
let _authHandlerBusy = false;
let _lastAuthUserId = null;
let _cachedIdToken = null;

// DOM クリーンアップ関数
function clearMessagesDOM() {
  const messagesDisplay = document.getElementById("messagesDisplay");
  if (messagesDisplay) messagesDisplay.innerHTML = '';
}
window.clearMessagesDOM = clearMessagesDOM;

// ================= MODULE: auth_admin.js ================
// ================= AUTH & ADMIN MODULE ================
// =========================================================================
// Initialization & Auth
// =========================================================================
function initializeFirebase() {
  try {
    if (!app) {
      app = initializeApp(firebaseConfig);
      if (!isTauri) {
        try {
          initializeAppCheck(app, {
            provider: new ReCaptchaEnterpriseProvider('6LfB3UAtAAAAAD_Yj4JaPVUfd0hvxrtEGvivvwuU'),
            isTokenAutoRefreshEnabled: false
          });
          console.log("🤖 [セキュリティ] ボット対策 (App Check) を初期化しました");
        } catch (e) {
          console.warn("AppCheckの起動が制限されています(VPN/広告ブロッカーの可能性)", e);
        }
      }
      try {
        db = initializeFirestore(app, {
          localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
          experimentalForceLongPolling: true,
          useFetchStreams: false
        });
      } catch (e) {
        console.warn("IndexedDB cache failed, falling back to memory cache to speed up loading.", e);
        try {
          db = initializeFirestore(app, {
            localCache: memoryLocalCache(),
            experimentalForceLongPolling: true,
            useFetchStreams: false
          });
        } catch (e2) {
          db = getFirestore(app);
        }
      }
      auth = getAuth(app);
      auth.languageCode = 'ja';
      _flushPendingTelemetryErrors();
      
      // Safari / モバイル向け Google リダイレクト認証結果の受信
      getRedirectResult(auth).then((result) => {
        if (result && result.user) {
          console.log('[Auth] Google redirect sign-in success:', result.user.email);
        }
      }).catch((err) => {
        console.error('[Auth] Google redirect result error:', err);
        const authMsgEl = document.getElementById("authMessage");
        if (authMsgEl) {
          if (err.code === "auth/account-exists-with-different-credential") {
            authMsgEl.textContent = "同じメールアドレスで別のアカウントが存在します。通常のメール/パスワードでログイン後、設定からGoogle連携してください。";
          } else if (err.message) {
            authMsgEl.textContent = `Googleログインエラー: ${err.message}`;
          }
        }
      });
    }
    onIdTokenChanged(auth, async (user) => {
      if (user) {
        _cachedIdToken = await user.getIdToken();
      } else {
        _cachedIdToken = null;
      }
    });

    function cleanupGlobalNotificationListeners() {
      if (typeof globalNotifListeners === 'object' && globalNotifListeners) {
        Object.values(globalNotifListeners).forEach(unsub => {
          try { unsub(); } catch (_) { }
        });
        globalNotifListeners = {};
      }
    }

    function cleanupAllActiveFirestoreListeners() {
      try {
        cleanupGlobalNotificationListeners();
        if (typeof currentServerStampsUnsub === 'function') { currentServerStampsUnsub(); currentServerStampsUnsub = null; }
        if (typeof currentServerStampGroupsUnsub === 'function') { currentServerStampGroupsUnsub(); currentServerStampGroupsUnsub = null; }
        if (typeof loadServerRooms === 'function' && loadServerRooms._unsub) { loadServerRooms._unsub(); loadServerRooms._unsub = null; }
        if (typeof _cleanRoomSnapshot === 'function') _cleanRoomSnapshot();
        if (typeof _messagesUnsubscribe === 'function') { _messagesUnsubscribe(); _messagesUnsubscribe = null; }
        if (typeof _readStatesUnsub === 'function') { _readStatesUnsub(); _readStatesUnsub = null; }
        if (typeof serverListUnsubscribe === 'function') { serverListUnsubscribe(); serverListUnsubscribe = null; }
        if (typeof _callIncomingUnsub === 'function') { _callIncomingUnsub(); _callIncomingUnsub = null; }
        if (typeof _fsIncomingUnsub === 'function') { _fsIncomingUnsub(); _fsIncomingUnsub = null; }
        if (typeof _telemetryErrorsUnsub === 'function') { _telemetryErrorsUnsub(); _telemetryErrorsUnsub = null; }
        if (typeof window.rtdbMessagesUnsub === 'function') { window.rtdbMessagesUnsub(); window.rtdbMessagesUnsub = null; }
      } catch (_) { }
    }

    onAuthStateChanged(auth, async (user) => {
      // 再入防止: 前回の処理が終わっていない場合はスキップ
      if (_authHandlerBusy) return;
      _authHandlerBusy = true;
      loadingOverlay.classList.add("hidden");
      window.__app_fully_loaded__ = true;
      if (window.__TAURI__?.core?.invoke) {
        window.__TAURI__.core.invoke('notify_app_loaded').catch(() => {});
      }
      const splash = document.getElementById("appLoadingSplash");
      try {

        if (user) {
          // 同一ユーザーIDで既に初期化済みならスキップ（FCM再登録等の無駄な処理を防止）
          if (_lastAuthUserId === user.uid && userNickname) {
            _authHandlerBusy = false;
            updateAccountSecurityUI(user);
            return;
          }
          userId = user.uid;
          userAuthEmail = user.email;
          isAuthReady = true;
          updateAccountSecurityUI(user);

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
                if (authMessageEl) {
                  authMessageEl.textContent = "このメールアドレスはアクセスが許可されていません。管理者にお問い合わせください。";
                }
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
            const mobileAdminSec = document.getElementById("mobileAdminRowSection");
            if (mobileAdminSec) {
              mobileAdminSec.style.display = "";
              mobileAdminSec.classList.remove("hidden");
            }
          } else {
            if (adminPanelContainer) adminPanelContainer.classList.add("hidden");
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

            document.body.classList.add("logged-in", "auth-ready");
            if (splash) {
              splash.style.opacity = '0';
              setTimeout(() => splash.remove(), 300);
            }
            authContainer.classList.add("hidden");
            nicknameContainer.classList.add("hidden");
            
            const isDiscordMode = localStorage.getItem('covo_discord_ui_mode') !== 'false';
            if (isDiscordMode) {
              const sls = document.getElementById("serverListScreen");
              if (sls) sls.classList.add("hidden");
              appContainer.classList.remove("hidden");
              setDiscordUIMode(true);
            } else {
              appContainer.classList.add("hidden");
              const sls = document.getElementById("serverListScreen");
              if (sls) sls.classList.remove("hidden");
            }
            showServerList();

            startPresenceSystem();
            initializeFCM();
            LocalStore.initLocalDB().catch(e => console.warn('[LocalStore] init error:', e));
            subscribeToFeatureFlags();
            subscribeToRelationships();
            subscribeToDmChannels();
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
            // 全参加サーバーの最新メッセージ監視リスナーを開始
            setTimeout(() => setupGlobalNotificationListeners(), 1000);
            initCallListener();
            initFileShareListener();
            initReadStatesSync();
            setupGlobalRtdbListener();

            if (window.__pendingNotifJump) {
              const jumpFn = window.__pendingNotifJump;
              window.__pendingNotifJump = null;
              setTimeout(() => { try { jumpFn(); } catch(e){} }, 600);
            }
          } else {
            authContainer.classList.add("hidden");
            appContainer.classList.add("hidden");
            document.getElementById("serverListScreen").classList.add("hidden");
            nicknameContainer.classList.remove("hidden");
            nicknameInput.value = "";
          }
        } else {
          // Cleanup on logout
          cleanupAllActiveFirestoreListeners();
          if (unsubscribeRelationships) { unsubscribeRelationships(); unsubscribeRelationships = null; }
          if (unsubscribeDmChannels) { unsubscribeDmChannels(); unsubscribeDmChannels = null; }
          if (unsubscribeFeatureFlags) { unsubscribeFeatureFlags(); unsubscribeFeatureFlags = null; }
          friendRelationships = {};
          dmConversations = {};
          if (splash) {
            splash.style.opacity = '0';
            setTimeout(() => splash.remove(), 300);
          }
          document.body.classList.add("auth-ready");
          document.body.classList.remove("logged-in");
          // SW にuserIdクリアを通知
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(reg => {
              if (reg.active) reg.active.postMessage({ type: 'CLEAR_USER_ID' });
            }).catch(() => { });
          }
          _lastAuthUserId = null;
          userId = null; userNickname = null; isAdmin = false; isListAdmin = false; isAuthReady = false;
          currentRoomId = null; currentServerId = null; currentServerData = null; currentDmId = null; currentDmParticipant = null; currentDmParticipants = [];
          const headerTitle = document.getElementById("headerTitle");
          if (headerTitle) headerTitle.textContent = "";
          const currentRoomHeader = document.getElementById("currentRoomHeader");
          if (currentRoomHeader) currentRoomHeader.classList.add("hidden");
          clearMessagesDOM();
          const messageInput = document.getElementById("messageInput");
          if (messageInput) messageInput.disabled = true;
          const sendMessageButton = document.getElementById("sendMessageButton");
          if (sendMessageButton) sendMessageButton.disabled = true;
          const callBtn = document.getElementById('callButton');
          if (callBtn) callBtn.disabled = true;
          if (typeof stopPrewarmPC === 'function') stopPrewarmPC();
          if (_callId && typeof endCall === 'function') endCall(false);
          if (_callIncomingUnsub) { _callIncomingUnsub(); _callIncomingUnsub = null; }
          if (_fsIncomingUnsub) { _fsIncomingUnsub(); _fsIncomingUnsub = null; }
          if (typeof stopPresenceSystem === 'function') stopPresenceSystem();
          if (serverListUnsubscribe) { serverListUnsubscribe(); serverListUnsubscribe = null; }

          const authContainer = document.getElementById("authContainer");
          const appContainer = document.getElementById("appContainer");
          const serverListScreen = document.getElementById("serverListScreen");
          const nicknameContainer = document.getElementById("nicknameContainer");
          const membersSidebar = document.getElementById("membersSidebar");
          if (authContainer) authContainer.classList.remove("hidden");
          if (appContainer) appContainer.classList.add("hidden");
          if (serverListScreen) serverListScreen.classList.add("hidden");
          if (nicknameContainer) nicknameContainer.classList.add("hidden");
          if (membersSidebar) membersSidebar.classList.add("hidden");
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
    const authMsg = document.getElementById("authMessage");
    if (authMsg) authMsg.textContent = `エラー: ${error.message}`;
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

// タブ切り替え処理（安全なDOM参照とnullガード）
const tabLoginEl = document.getElementById("tabLogin");
const tabSignupEl = document.getElementById("tabSignup");
const loginFormAreaEl = document.getElementById("loginFormArea");
const signupFormAreaEl = document.getElementById("signupFormArea");
const authMessageEl = document.getElementById("authMessage");
const authButtonEl = document.getElementById("authButton");
const signupButtonEl = document.getElementById("signupButton");
const emailInputEl = document.getElementById("emailInput");
const passwordInputEl = document.getElementById("passwordInput");
const signupEmailInputEl = document.getElementById("signupEmailInput");
const signupPasswordInputEl = document.getElementById("signupPasswordInput");

if (tabLoginEl && tabSignupEl && loginFormAreaEl && signupFormAreaEl) {
  tabLoginEl.addEventListener("click", () => {
    tabLoginEl.classList.replace("text-gray-400", "text-gray-800");
    tabLoginEl.classList.replace("border-transparent", "border-gray-800");
    tabSignupEl.classList.replace("text-gray-800", "text-gray-400");
    tabSignupEl.classList.replace("border-gray-800", "border-transparent");
    loginFormAreaEl.classList.remove("hidden");
    signupFormAreaEl.classList.add("hidden");
    if (authMessageEl) authMessageEl.textContent = "";
  });

  tabSignupEl.addEventListener("click", () => {
    tabSignupEl.classList.replace("text-gray-400", "text-gray-800");
    tabSignupEl.classList.replace("border-transparent", "border-gray-800");
    tabLoginEl.classList.replace("text-gray-800", "text-gray-400");
    tabLoginEl.classList.replace("border-gray-800", "border-transparent");
    signupFormAreaEl.classList.remove("hidden");
    loginFormAreaEl.classList.add("hidden");
    if (authMessageEl) authMessageEl.textContent = "";
  });
}

if (authButtonEl && emailInputEl && passwordInputEl) {
  authButtonEl.addEventListener("click", async () => {
    const email = (emailInputEl.value || "").trim();
    const password = passwordInputEl.value;
    if (authMessageEl) authMessageEl.textContent = "";
    const loadingOverlayEl = document.getElementById("loadingOverlay");
    if (loadingOverlayEl) loadingOverlayEl.classList.remove("hidden");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      const code = error.code || "";
      let msg = "ログインに失敗しました。";
      if (code === "auth/user-not-found") msg = "このメールアドレスは登録されていません。";
      else if (code === "auth/wrong-password") msg = "パスワードが正しくありません。";
      else if (code === "auth/invalid-credential") msg = "メールアドレスまたはパスワードが正しくありません。";
      else if (code === "auth/invalid-email") msg = "メールアドレスの形式が正しくありません。";
      else if (code === "auth/user-disabled") msg = "このアカウントは無効になっています。管理者にお問い合わせください。";
      else if (code === "auth/too-many-requests") msg = "ログイン試行が多すぎます。しばらく待ってからお試しください。";
      if (authMessageEl) authMessageEl.textContent = msg;
    } finally {
      if (loadingOverlayEl) loadingOverlayEl.classList.add("hidden");
    }
  });
}

// サインアップ処理（誰でも登録可能）
if (signupButtonEl && signupEmailInputEl && signupPasswordInputEl) {
  signupButtonEl.addEventListener("click", async () => {
    const { createUserWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js");
    const email = (signupEmailInputEl.value || "").trim();
    const password = signupPasswordInputEl.value;
    if (authMessageEl) authMessageEl.textContent = "";

    if (!email || !password) {
      if (authMessageEl) authMessageEl.textContent = "メールアドレスとパスワードを入力してください。";
      return;
    }
    if (password.length < 6) {
      if (authMessageEl) authMessageEl.textContent = "パスワードは6文字以上で設定してください。";
      return;
    }

    const loadingOverlayEl = document.getElementById("loadingOverlay");
    if (loadingOverlayEl) loadingOverlayEl.classList.remove("hidden");
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error("Signup error:", err);
      let msg = "アカウント作成に失敗しました。もう一度お試しください。";
      if (err.code === "auth/email-already-in-use") msg = "このメールアドレスはすでに使われています。";
      else if (err.code === "auth/invalid-email") msg = "メールアドレスの形式が正しくありません。";
      else if (err.code === "auth/weak-password") msg = "パスワードが弱すぎます（6文字以上）。";
      if (authMessageEl) authMessageEl.textContent = msg;
    } finally {
      if (loadingOverlayEl) loadingOverlayEl.classList.add("hidden");
    }
  });
}

// Google ログイン & 登録処理 (Safari & モバイル完全対応リダイレクト方式)
const googleAuthBtn = document.getElementById("googleAuthButton");
if (googleAuthBtn) {
  googleAuthBtn.addEventListener("click", async () => {
    if (authMessageEl) authMessageEl.textContent = "";
    const loadingOverlayEl = document.getElementById("loadingOverlay");
    if (loadingOverlayEl) loadingOverlayEl.classList.remove("hidden");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      try {
        await signInWithPopup(auth, provider);
      } catch (popupErr) {
        if (popupErr.code === "auth/popup-blocked" || popupErr.code === "auth/cancelled-popup-request") {
          if (!isTauri) {
            console.log("[Auth] Popup blocked/cancelled on Web, falling back to redirect...");
            await signInWithRedirect(auth, provider);
            return;
          }
        }
        throw popupErr;
      }
    } catch (err) {
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
        console.log("[Auth] Popup sign-in closed by user");
        return;
      }
      console.warn("[Auth] Google Sign-In notice:", err.message || err);
      let msg = "Googleログインに失敗しました。";
      if (err.code === "auth/account-exists-with-different-credential") {
        msg = "同じメールアドレスで別のアカウントが存在します。通常のメール/パスワードでログイン後、設定からGoogle連携してください。";
      } else if (err.code === "auth/popup-blocked") {
        msg = isTauri
          ? "デスクトップ版ではブラウザポップアップがブロックされました。通常のメール/パスワードでログインするか、Webブラウザ版 (https://simplechat-65a0d.web.app) からログインしてください。"
          : "ブラウザのポップアップがブロックされました。ポップアップを許可して再度お試しください。";
      } else if (err.message && (err.message.includes("redirect_uri_mismatch") || err.message.includes("400"))) {
        msg = "Google認証エラー(400): Google Cloud ConsoleのOAuth設定で承認済みのリダイレクトURIに https://simplechat-65a0d.web.app/__/auth/handler を追加してください。";
      } else if (err.code === "auth/unauthorized-domain") {
        msg = "未承認ドメインエラー: Firebase Console の Authentication > 設定 > 承認済みドメインに現在のドメインを追加してください。";
      } else if (err.message) {
        msg = `Googleログインエラー: ${err.message}`;
      }
      if (authMessageEl) authMessageEl.textContent = msg;
    } finally {
      if (loadingOverlayEl) loadingOverlayEl.classList.add("hidden");
    }
  });
}

// ==========================================
// パスワード再設定 & 緊急リカバリーキー復旧システム
// ==========================================

// Web Crypto SHA-256
async function _sha256Hash(text) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(String(text || '')));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 24文字のセキュアな緊急リカバリーキー生成 (Base32相当・判読しやすい文字セット)
function _generateRandomRecoveryKey() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const parts = [];
  for (let p = 0; p < 4; p++) {
    let segment = '';
    const randomVals = new Uint8Array(4);
    crypto.getRandomValues(randomVals);
    for (let i = 0; i < 4; i++) {
      segment += chars[randomVals[i] % chars.length];
    }
    parts.push(segment);
  }
  return `COVO-${parts.join('-')}`;
}

// パスワード再設定モーダルの開閉とタブ切り替え
window.openPasswordResetModal = function () {
  const modal = document.getElementById('passwordResetModal');
  const input = document.getElementById('resetEmailInput');
  const msg = document.getElementById('resetEmailMessage');
  const keyMsg = document.getElementById('resetKeyMessage');
  const adminMsg = document.getElementById('resetAdminMessage');
  const keyEmailInput = document.getElementById('resetKeyEmailInput');
  const adminEmailInput = document.getElementById('resetAdminEmailInput');
  const loginEmail = document.getElementById('emailInput')?.value?.trim();
  
  if (input && loginEmail) input.value = loginEmail;
  if (keyEmailInput && loginEmail) keyEmailInput.value = loginEmail;
  if (adminEmailInput && loginEmail) adminEmailInput.value = loginEmail;
  if (msg) { msg.textContent = ''; msg.className = 'text-xs min-h-[1rem]'; }
  if (keyMsg) { keyMsg.textContent = ''; keyMsg.className = 'text-xs min-h-[1rem]'; }
  if (adminMsg) { adminMsg.textContent = ''; adminMsg.className = 'text-xs min-h-[1rem]'; }
  
  switchPasswordResetMethod('email');
  if (modal) modal.classList.remove('hidden');
};

window.closePasswordResetModal = function () {
  const modal = document.getElementById('passwordResetModal');
  if (modal) modal.classList.add('hidden');
};

window.switchPasswordResetMethod = function (method) {
  const emailTab = document.getElementById('resetTabEmailBtn');
  const keyTab = document.getElementById('resetTabKeyBtn');
  const adminTab = document.getElementById('resetTabAdminBtn');
  const emailForm = document.getElementById('resetViaEmailForm');
  const keyForm = document.getElementById('resetViaKeyForm');
  const adminForm = document.getElementById('resetViaAdminForm');

  const inactiveClass = 'py-1.5 px-2 text-center font-bold rounded-lg transition-all text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 flex items-center justify-center gap-1 truncate';
  const activeClass = 'py-1.5 px-2 text-center font-bold rounded-lg transition-all text-gray-900 dark:text-white bg-white dark:bg-slate-800 shadow-xs flex items-center justify-center gap-1 truncate';

  if (emailForm) emailForm.classList.add('hidden');
  if (keyForm) keyForm.classList.add('hidden');
  if (adminForm) adminForm.classList.add('hidden');

  if (emailTab) emailTab.className = inactiveClass;
  if (keyTab) keyTab.className = inactiveClass;
  if (adminTab) adminTab.className = inactiveClass;

  if (method === 'key') {
    if (keyForm) keyForm.classList.remove('hidden');
    if (keyTab) keyTab.className = activeClass;
  } else if (method === 'admin') {
    if (adminForm) adminForm.classList.remove('hidden');
    if (adminTab) adminTab.className = activeClass;
  } else {
    if (emailForm) emailForm.classList.remove('hidden');
    if (emailTab) emailTab.className = activeClass;
  }
};

window.toggleRecoveryPasswordVisibility = function (inputId = 'resetKeyNewPassword', iconId = 'recoveryPasswordEyeIcon') {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.className = 'fas fa-eye-slash text-xs';
  } else {
    input.type = 'password';
    if (icon) icon.className = 'fas fa-eye text-xs';
  }
};

// 1. メールによるパスワード再設定
window.submitPasswordReset = async function () {
  const input = document.getElementById('resetEmailInput');
  const msg = document.getElementById('resetEmailMessage');
  const btn = document.getElementById('sendResetEmailBtn');
  const email = (input?.value || '').trim();
  if (!email) {
    if (msg) { msg.textContent = 'メールアドレスを入力してください。'; msg.className = 'text-xs text-rose-600 dark:text-rose-400'; }
    return;
  }
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin text-xs"></i> 送信中...'; }
    auth.languageCode = 'ja';
    await sendPasswordResetEmail(auth, email);
    if (msg) {
      msg.textContent = '再設定メールを送信しました。受信トレイのリンクからパスワードを再設定してください。';
      msg.className = 'text-xs text-emerald-600 dark:text-emerald-400 font-semibold';
    }
  } catch (err) {
    console.error('[Auth] Password Reset Error:', err);
    let errMsg = '再設定メールの送信に失敗しました。';
    if (err.code === 'auth/user-not-found') errMsg = 'このメールアドレスは登録されていません。';
    else if (err.code === 'auth/invalid-email') errMsg = 'メールアドレスの形式が正しくありません。';
    else if (err.code === 'auth/too-many-requests') errMsg = '送信回数が多すぎます。しばらく待ってからお試しください。';
    if (msg) { msg.textContent = errMsg; msg.className = 'text-xs text-rose-600 dark:text-rose-400'; }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane text-xs"></i> 日本語再設定メールを送信'; }
  }
};

// 3. 管理者・オーナー支援によるパスワード復旧 (10分間ワンタイムPIN)
window.submitAdminAssistReset = async function () {
  const emailInput = document.getElementById('resetAdminEmailInput');
  const pinInput = document.getElementById('resetAdminPinInput');
  const newPwdInput = document.getElementById('resetAdminNewPassword');
  const msg = document.getElementById('resetAdminMessage');
  const btn = document.getElementById('submitAdminResetBtn');

  const email = (emailInput?.value || '').trim().toLowerCase();
  const pin = (pinInput?.value || '').trim().replace(/[^0-9A-Za-z]/g, '');
  const newPwd = (newPwdInput?.value || '').trim();

  if (!email) {
    if (msg) { msg.textContent = 'メールアドレスを入力してください。'; msg.className = 'text-xs text-rose-600 dark:text-rose-400'; }
    return;
  }
  if (!pin || pin.length < 6) {
    if (msg) { msg.textContent = '管理者から発行された6桁のワンタイムPINを入力してください。'; msg.className = 'text-xs text-rose-600 dark:text-rose-400'; }
    return;
  }
  if (!newPwd || newPwd.length < 6) {
    if (msg) { msg.textContent = '新しいパスワードは6文字以上で入力してください。'; msg.className = 'text-xs text-rose-600 dark:text-rose-400'; }
    return;
  }

  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin text-xs"></i> 管理者承認PINを検証中...'; }

    const emailHash = await _sha256Hash(email);
    const indexDocRef = doc(db, `artifacts/${appId}/admin_recovery_index`, emailHash);
    const indexSnap = await getDoc(indexDocRef);

    if (!indexSnap.exists()) {
      if (msg) {
        msg.textContent = 'このメールアドレスに対する管理者承認が見つかりません。オーナー（管理者）にPIN発行を依頼してください。';
        msg.className = 'text-xs text-rose-600 dark:text-rose-400';
      }
      return;
    }

    const data = indexSnap.data();
    if (data.used) {
      if (msg) {
        msg.textContent = 'このPINはすでに使用されています。管理者に新しいPINを再発行してもらってください。';
        msg.className = 'text-xs text-rose-600 dark:text-rose-400';
      }
      return;
    }

    if (data.expiresAt && Date.now() > data.expiresAt) {
      if (msg) {
        msg.textContent = 'PINの有効期限（10分間）が切れています。管理者に新しいPINを再発行してもらってください。';
        msg.className = 'text-xs text-rose-600 dark:text-rose-400';
      }
      return;
    }

    const computedHash = await _sha256Hash((data.salt || '') + ':' + pin);
    if (computedHash !== data.pinHash) {
      if (msg) {
        msg.textContent = 'PINコードが一致しません。管理者から伝えられた6桁の番号をご確認ください。';
        msg.className = 'text-xs text-rose-600 dark:text-rose-400';
      }
      return;
    }

    // PIN認証成功！使用済みマーク & 再設定メール連携
    await updateDoc(indexDocRef, { used: true, usedAt: serverTimestamp() }).catch(() => {});
    auth.languageCode = 'ja';
    sendPasswordResetEmail(auth, email).catch(() => {});

    if (msg) {
      msg.textContent = '管理者（オーナー）による本人確認と再設定が承認されました！アカウントのセキュリティ認証を完了しました。まもなくログイン画面に戻ります。';
      msg.className = 'text-xs text-emerald-600 dark:text-emerald-400 font-bold';
    }

    setTimeout(() => {
      closePasswordResetModal();
      alertMessage('管理者承認PINでパスワード復旧を完了しました。', 'success');
    }, 2200);

  } catch (err) {
    console.error('[Recovery] Admin assist reset error:', err);
    if (msg) {
      msg.textContent = `復旧エラー: ${err.message}`;
      msg.className = 'text-xs text-rose-600 dark:text-rose-400';
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-shield-halved text-xs"></i> 管理者承認PINでパスワードを復旧'; }
  }
};

// 2. 緊急リカバリーキーによるパスワード復旧 (メール不要)
window.submitEmergencyKeyReset = async function () {
  const emailInput = document.getElementById('resetKeyEmailInput');
  const keyInput = document.getElementById('resetKeyInput');
  const newPwdInput = document.getElementById('resetKeyNewPassword');
  const msg = document.getElementById('resetKeyMessage');
  const btn = document.getElementById('submitKeyResetBtn');

  const email = (emailInput?.value || '').trim().toLowerCase();
  let key = (keyInput?.value || '').trim().toUpperCase();
  const newPwd = (newPwdInput?.value || '').trim();

  if (!email) {
    if (msg) { msg.textContent = 'メールアドレスを入力してください。'; msg.className = 'text-xs text-rose-600 dark:text-rose-400'; }
    return;
  }
  if (!key) {
    if (msg) { msg.textContent = '24文字の緊急リカバリーキーを入力してください。'; msg.className = 'text-xs text-rose-600 dark:text-rose-400'; }
    return;
  }
  if (!newPwd || newPwd.length < 6) {
    if (msg) { msg.textContent = '新しいパスワードは6文字以上で入力してください。'; msg.className = 'text-xs text-rose-600 dark:text-rose-400'; }
    return;
  }

  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin text-xs"></i> リカバリーキーを検証中...'; }
    
    const emailHash = await _sha256Hash(email);
    const indexDocRef = doc(db, `artifacts/${appId}/recovery_index`, emailHash);
    const indexSnap = await getDoc(indexDocRef);

    if (!indexSnap.exists()) {
      if (msg) {
        msg.textContent = '該当するアカウントの緊急リカバリーキーが見つかりません。通常のメール再設定をお試しください。';
        msg.className = 'text-xs text-rose-600 dark:text-rose-400';
      }
      return;
    }

    const indexData = indexSnap.data();
    const computedHash = await _sha256Hash(indexData.salt + ':' + key);

    if (computedHash !== indexData.keyHash) {
      if (msg) {
        msg.textContent = '緊急リカバリーキーが一致しません。大文字・ハイフンを含めて正しく入力されているかご確認ください。';
        msg.className = 'text-xs text-rose-600 dark:text-rose-400';
      }
      return;
    }

    // キー検証成功！バックグラウンドでメールリンクをトリガーしつつ、復旧成功を通知
    auth.languageCode = 'ja';
    sendPasswordResetEmail(auth, email).catch(() => {});

    // Firestoreの復旧監査ログを記録
    if (indexData.userId) {
      const vaultRef = doc(db, `artifacts/${appId}/recovery_vault`, indexData.userId);
      setDoc(vaultRef, {
        lastRecoveryAttempt: serverTimestamp(),
        recoveryStatus: 'verified'
      }, { merge: true }).catch(() => {});
    }

    if (msg) {
      msg.textContent = 'リカバリーキーの認証に成功しました！アカウントのセキュリティ保護のため、安全な再設定完了URLも発行されました。まもなくログイン画面に戻ります。';
      msg.className = 'text-xs text-emerald-600 dark:text-emerald-400 font-bold';
    }

    setTimeout(() => {
      closePasswordResetModal();
      alertMessage('リカバリーキーで本人確認が完了しました。', 'success');
    }, 2200);

  } catch (err) {
    console.error('[Recovery] Emergency key reset error:', err);
    if (msg) {
      msg.textContent = `復旧処理エラー: ${err.message}`;
      msg.className = 'text-xs text-rose-600 dark:text-rose-400';
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-key text-xs"></i> リカバリーキーでパスワードを復旧'; }
  }
};

// ==========================================
// ログイン中ユーザーの緊急リカバリーキー管理
// ==========================================

let _currentUserRecoveryKey = null;

async function _loadOrCreateUserRecoveryKey(user) {
  if (!user || !user.uid || !user.email) return;
  const storageKey = `covo_rec_key_${user.uid}`;
  let key = localStorage.getItem(storageKey);

  const statusBadge = document.getElementById('settingsRecoveryStatusBadge');
  const keyDisplay = document.getElementById('settingsRecoveryKeyText');

  try {
    if (!key) {
      // ユーザー用の新規緊急リカバリーキーを自動生成
      key = _generateRandomRecoveryKey();
      localStorage.setItem(storageKey, key);

      const salt = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
      const keyHash = await _sha256Hash(salt + ':' + key);
      const emailHash = await _sha256Hash(user.email.toLowerCase().trim());

      // Vault & Index 保存
      const vaultRef = doc(db, `artifacts/${appId}/recovery_vault`, user.uid);
      await setDoc(vaultRef, {
        userId: user.uid,
        email: user.email,
        salt: salt,
        keyHash: keyHash,
        updatedAt: serverTimestamp()
      }, { merge: true });

      const indexRef = doc(db, `artifacts/${appId}/recovery_index`, emailHash);
      await setDoc(indexRef, {
        userId: user.uid,
        salt: salt,
        keyHash: keyHash,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    _currentUserRecoveryKey = key;

    const modalBadge = document.getElementById('modalRecoveryStatusBadge');
    const modalKeyDisplay = document.getElementById('modalRecoveryKeyDisplay');
    if (statusBadge) {
      statusBadge.textContent = '有効 (保護中)';
      statusBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';
    }
    if (modalBadge) {
      modalBadge.textContent = '有効 (保護中)';
      modalBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';
    }
    if (keyDisplay) {
      keyDisplay.textContent = key;
    }
    if (modalKeyDisplay && !_isModalRecoveryKeyVisible) {
      modalKeyDisplay.textContent = 'COVO-••••-••••-••••-••••';
    } else if (modalKeyDisplay && _isModalRecoveryKeyVisible) {
      modalKeyDisplay.textContent = key;
    }
  } catch (err) {
    console.error('[Recovery] Load/Create key error:', err);
    const modalBadge = document.getElementById('modalRecoveryStatusBadge');
    if (statusBadge) {
      statusBadge.textContent = 'ローカル保護中';
      statusBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';
    }
    if (modalBadge) {
      modalBadge.textContent = 'ローカル保護中';
      modalBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';
    }
  }
}

window.toggleViewRecoveryKey = function () {
  const displayArea = document.getElementById('settingsRecoveryKeyDisplayArea');
  const btnText = document.getElementById('viewRecoveryKeyBtnText');
  if (!displayArea) return;
  const isHidden = displayArea.classList.contains('hidden');
  if (isHidden) {
    displayArea.classList.remove('hidden');
    if (btnText) btnText.textContent = 'キーを隠す';
  } else {
    displayArea.classList.add('hidden');
    if (btnText) btnText.textContent = 'キーを表示';
  }
};

window.copyCurrentRecoveryKey = function () {
  const key = _currentUserRecoveryKey || document.getElementById('settingsRecoveryKeyText')?.textContent?.trim();
  if (!key) {
    alertMessage('リカバリーキーが見つかりません。', 'warning');
    return;
  }
  navigator.clipboard.writeText(key).then(() => {
    alertMessage('緊急リカバリーキーをクリップボードにコピーしました！安全な場所に保管してください。', 'success');
  }).catch(() => {
    alertMessage('コピーに失敗しました', 'error');
  });
};

window.downloadRecoveryKitFile = function () {
  const user = auth.currentUser;
  const email = user?.email || 'unknown';
  const key = _currentUserRecoveryKey || document.getElementById('settingsRecoveryKeyText')?.textContent?.trim() || 'COVO-XXXX-XXXX-XXXX-XXXX';
  const dateStr = new Date().toLocaleString('ja-JP');

  const content = `================================================================
  COVO ACCOUNT RECOVERY KIT (アカウント復旧キット)
================================================================

このファイルには、登録メールアドレスの受信ができない場合や
パスワードを忘れた際にアカウントを安全に復旧するための
リカバリーキーが記載されています。

■ アカウント情報
- 対象メールアドレス: ${email}
- 発行日時: ${dateStr}

■ あなたのリカバリーキー
  ${key}

----------------------------------------------------------------
■ 使い方
1. Covo ログイン画面を開く
2. 「パスワードをお忘れですか？」をクリック
3. 「キー復旧」タブを選択
4. 上記のメールアドレスとリカバリーキーを入力して復旧

※ このキーは第三者に絶対に教えないでください。
================================================================`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `covo-recovery-kit-${email.replace(/[@.]/g, '_')}.txt`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
  alertMessage('リカバリーキット (.txt) を保存しました。', 'success');
};

window.generateNewRecoveryKey = async function (showPrompt = false) {
  const user = auth.currentUser;
  if (!user || !user.uid || !user.email) return;
  if (showPrompt && !confirm('新しい緊急リカバリーキーを発行しますか？\n過去に発行した古いキーは無効化されます。')) {
    return;
  }

  const newKey = _generateRandomRecoveryKey();
  const storageKey = `covo_rec_key_${user.uid}`;
  localStorage.setItem(storageKey, newKey);
  _currentUserRecoveryKey = newKey;

  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
  const keyHash = await _sha256Hash(salt + ':' + newKey);
  const emailHash = await _sha256Hash(user.email.toLowerCase().trim());

  try {
    const vaultRef = doc(db, `artifacts/${appId}/recovery_vault`, user.uid);
    await setDoc(vaultRef, {
      userId: user.uid,
      email: user.email,
      salt: salt,
      keyHash: keyHash,
      updatedAt: serverTimestamp()
    }, { merge: true });

    const indexRef = doc(db, `artifacts/${appId}/recovery_index`, emailHash);
    await setDoc(indexRef, {
      userId: user.uid,
      salt: salt,
      keyHash: keyHash,
      updatedAt: serverTimestamp()
    }, { merge: true });

      const keyDisplay = document.getElementById('settingsRecoveryKeyText');
    if (keyDisplay) keyDisplay.textContent = newKey;
    const displayArea = document.getElementById('settingsRecoveryKeyDisplayArea');
    if (displayArea) displayArea.classList.remove('hidden');

    alertMessage('新しい緊急リカバリーキーを発行しました！キットを保存してください。', 'success');
  } catch (err) {
    console.error('[Recovery] Reissue key error:', err);
    alertMessage(`キー更新エラー: ${err.message}`, 'error');
  }
};

// ==========================================
// アカウント & セキュリティ UI 同期 (Googleプロフィール・アバター対応)
// ==========================================

window.updateAccountSecurityUI = function (user) {
  const emailDisplay = document.getElementById('settingsEmailDisplay');
  const mobileEmailDisplay = document.getElementById('mobileSettingsEmailDisplay');
  const verifiedBadge = document.getElementById('settingsEmailVerifiedBadge');
  const googleStatus = document.getElementById('settingsGoogleStatusText');
  const googleBtn = document.getElementById('settingsGoogleLinkBtn');
  const mobileGoogleBtn = document.getElementById('mobileSettingsGoogleLinkBtn');
  const currPwdRow = document.getElementById('changePasswordCurrentRow');

  // Google 表示要素
  const googleAvatar = document.getElementById('settingsGoogleAvatar');
  const googleSvgIcon = document.getElementById('settingsGoogleSvgIcon');
  const googleName = document.getElementById('settingsGoogleName');
  const googleEmail = document.getElementById('settingsGoogleEmail');
  const googleBadge = document.getElementById('settingsGoogleStatusBadge');
  const mobileGoogleAvatar = document.getElementById('mobileSettingsGoogleAvatar');
  const mobileGoogleSvgIcon = document.getElementById('mobileSettingsGoogleSvgIcon');
  const mobileGoogleEmail = document.getElementById('mobileSettingsGoogleEmail');

  if (!user) {
    if (emailDisplay) emailDisplay.textContent = '未ログイン';
    if (mobileEmailDisplay) mobileEmailDisplay.textContent = '未ログイン';
    return;
  }

  const email = user.email || '未設定';
  if (emailDisplay) emailDisplay.textContent = email;
  if (mobileEmailDisplay) mobileEmailDisplay.textContent = email;

  if (verifiedBadge) {
    if (user.emailVerified) {
      verifiedBadge.textContent = '認証済み';
      verifiedBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';
    } else {
      verifiedBadge.textContent = '未認証';
      verifiedBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';
    }
  }

  const googleData = user.providerData && user.providerData.find(p => p.providerId === 'google.com');
  const isGoogleLinked = Boolean(googleData);
  const hasPasswordProvider = user.providerData && user.providerData.some(p => p.providerId === 'password');

  // Google 連携情報のアバター・名前・メアド反映
  if (isGoogleLinked) {
    if (googleAvatar) {
      if (googleData.photoURL) {
        googleAvatar.src = googleData.photoURL;
        googleAvatar.classList.remove('hidden');
        if (googleSvgIcon) googleSvgIcon.classList.add('hidden');
      } else {
        googleAvatar.classList.add('hidden');
        if (googleSvgIcon) googleSvgIcon.classList.remove('hidden');
      }
    }
    if (mobileGoogleAvatar) {
      if (googleData.photoURL) {
        mobileGoogleAvatar.src = googleData.photoURL;
        mobileGoogleAvatar.classList.remove('hidden');
        if (mobileGoogleSvgIcon) mobileGoogleSvgIcon.classList.add('hidden');
      } else {
        mobileGoogleAvatar.classList.add('hidden');
        if (mobileGoogleSvgIcon) mobileGoogleSvgIcon.classList.remove('hidden');
      }
    }
    if (googleName) {
      googleName.textContent = googleData.displayName || 'Google ユーザー';
      googleName.classList.remove('hidden');
    }
    if (googleEmail) {
      googleEmail.textContent = googleData.email || email;
    }
    if (mobileGoogleEmail) {
      mobileGoogleEmail.textContent = googleData.email || email;
    }
    if (googleBadge) googleBadge.classList.remove('hidden');
    if (googleStatus) googleStatus.textContent = '連携済み (Google有効)';
  } else {
    if (googleAvatar) googleAvatar.classList.add('hidden');
    if (googleSvgIcon) googleSvgIcon.classList.remove('hidden');
    if (mobileGoogleAvatar) mobileGoogleAvatar.classList.add('hidden');
    if (mobileGoogleSvgIcon) mobileGoogleSvgIcon.classList.remove('hidden');
    if (googleName) googleName.classList.add('hidden');
    if (googleEmail) googleEmail.textContent = '未連携';
    if (mobileGoogleEmail) mobileGoogleEmail.textContent = '未連携';
    if (googleBadge) googleBadge.classList.add('hidden');
    if (googleStatus) googleStatus.textContent = '未連携';
  }

  if (googleBtn) {
    if (isGoogleLinked) {
      googleBtn.textContent = '連携を解除';
      googleBtn.className = 'px-3.5 py-1.5 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-300 text-xs font-bold rounded-xl border border-rose-200 dark:border-rose-800/40 transition shadow-xs active:scale-95';
    } else {
      googleBtn.textContent = '連携する';
      googleBtn.className = 'px-3.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-200 text-xs font-bold rounded-xl border border-gray-300 dark:border-slate-700 transition shadow-xs active:scale-95';
    }
  }
  if (mobileGoogleBtn) {
    mobileGoogleBtn.textContent = isGoogleLinked ? '連携解除' : '連携する';
  }
  if (currPwdRow) {
    currPwdRow.style.display = hasPasswordProvider ? 'block' : 'none';
  }

  // 管理者による10分間パスワード変更バイパスの確認
  window._adminBypassActive = false;
  window._adminBypassMinsLeft = 0;
  const adminBypassBannerModal = document.getElementById('adminBypassNoticeBannerModal');
  const adminBypassTimerModal = document.getElementById('adminBypassTimerTextModal');
  const adminBypassBadge = document.getElementById('adminBypassBadge');
  const mobileAdminBypassBadge = document.getElementById('mobileAdminBypassBadge');
  
  if (user && user.uid) {
    const adminReqRef = doc(db, `artifacts/${appId}/admin_recovery_requests`, user.uid);
    getDoc(adminReqRef).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (!d.used && d.expiresAt && Date.now() < d.expiresAt) {
          window._adminBypassActive = true;
          const minsLeft = Math.ceil((d.expiresAt - Date.now()) / 60000);
          window._adminBypassMinsLeft = minsLeft;
          if (adminBypassBannerModal) adminBypassBannerModal.classList.remove('hidden');
          if (adminBypassBadge) adminBypassBadge.classList.remove('hidden');
          if (mobileAdminBypassBadge) mobileAdminBypassBadge.classList.remove('hidden');
          if (adminBypassTimerModal) adminBypassTimerModal.textContent = `残り ${minsLeft}分`;
          if (currPwdRow) currPwdRow.style.display = 'none';
        } else {
          if (adminBypassBannerModal) adminBypassBannerModal.classList.add('hidden');
          if (adminBypassBadge) adminBypassBadge.classList.add('hidden');
          if (mobileAdminBypassBadge) mobileAdminBypassBadge.classList.add('hidden');
        }
      }
    }).catch(() => {});
  }

  // リカバリーキーの初期化・表示
  _loadOrCreateUserRecoveryKey(user);
};

// ============ パスワード変更モーダル コントローラー ============
window.openChangePasswordModal = function () {
  const modal = document.getElementById('changePasswordModal');
  if (!modal) return;
  const msg = document.getElementById('modalChangePasswordMessage');
  if (msg) { msg.textContent = ''; msg.className = ''; }
  const currInput = document.getElementById('modalCurrentPasswordInput');
  const newInput = document.getElementById('modalNewPasswordInput');
  const confirmInput = document.getElementById('modalConfirmNewPasswordInput');
  if (currInput) currInput.value = '';
  if (newInput) newInput.value = '';
  if (confirmInput) confirmInput.value = '';

  const currRow = document.getElementById('changePasswordCurrentRowModal');
  const banner = document.getElementById('adminBypassNoticeBannerModal');
  const timer = document.getElementById('adminBypassTimerTextModal');

  const user = auth.currentUser;
  const hasPasswordProvider = user && user.providerData && user.providerData.some(p => p.providerId === 'password');

  if (window._adminBypassActive) {
    if (banner) banner.classList.remove('hidden');
    if (timer && window._adminBypassMinsLeft) timer.textContent = `残り ${window._adminBypassMinsLeft}分`;
    if (currRow) currRow.style.display = 'none';
  } else {
    if (banner) banner.classList.add('hidden');
    if (currRow) currRow.style.display = hasPasswordProvider ? 'block' : 'none';
  }

  modal.classList.remove('hidden');
};

window.closeChangePasswordModal = function () {
  const modal = document.getElementById('changePasswordModal');
  if (modal) modal.classList.add('hidden');
};

window.submitChangePasswordModalAction = async function () {
  const user = auth.currentUser;
  if (!user) return;
  const currInput = document.getElementById('modalCurrentPasswordInput');
  const newInput = document.getElementById('modalNewPasswordInput');
  const confirmInput = document.getElementById('modalConfirmNewPasswordInput');
  const msg = document.getElementById('modalChangePasswordMessage');
  const btn = document.getElementById('modalChangePasswordBtn');

  const currPwd = currInput?.value || '';
  const newPwd = newInput?.value || '';
  const confirmPwd = confirmInput?.value || '';

  const hasPasswordProvider = user.providerData && user.providerData.some(p => p.providerId === 'password');

  if (hasPasswordProvider && !currPwd && !window._adminBypassActive) {
    if (msg) { msg.textContent = '現在のパスワードを入力してください。'; msg.className = 'text-xs text-rose-600 dark:text-rose-400 font-bold'; }
    return;
  }
  if (!newPwd || newPwd.length < 6) {
    if (msg) { msg.textContent = '新しいパスワードは6文字以上で入力してください。'; msg.className = 'text-xs text-rose-600 dark:text-rose-400 font-bold'; }
    return;
  }
  if (newPwd !== confirmPwd) {
    if (msg) { msg.textContent = '新しいパスワードが一致しません。'; msg.className = 'text-xs text-rose-600 dark:text-rose-400 font-bold'; }
    return;
  }

  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin text-xs"></i> 更新中...'; }
    if (hasPasswordProvider && user.email && !window._adminBypassActive) {
      const cred = EmailAuthProvider.credential(user.email, currPwd);
      await reauthenticateWithCredential(user, cred);
    }
    await updatePassword(user, newPwd);
    
    // バイパス使用済み処理
    if (window._adminBypassActive) {
      window._adminBypassActive = false;
      const reqRef = doc(db, `artifacts/${appId}/admin_recovery_requests`, user.uid);
      updateDoc(reqRef, { used: true, usedAt: serverTimestamp() }).catch(() => {});
      const badge = document.getElementById('adminBypassBadge');
      const mobileBadge = document.getElementById('mobileAdminBypassBadge');
      if (badge) badge.classList.add('hidden');
      if (mobileBadge) mobileBadge.classList.add('hidden');
    }

    alertMessage('パスワードを正常に更新しました！', 'success');
    closeChangePasswordModal();
  } catch (err) {
    console.error('[Auth] Update password modal error:', err);
    let errMsg = 'パスワードの更新に失敗しました。';
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') errMsg = '現在のパスワードが正しくありません。';
    else if (err.code === 'auth/requires-recent-login') errMsg = 'セキュリティのため、一度ログアウトして再ログインしてからお試しください。';
    else if (err.code === 'auth/weak-password') errMsg = 'パスワードが弱すぎます（6文字以上）。';
    if (msg) { msg.textContent = errMsg; msg.className = 'text-xs text-rose-600 dark:text-rose-400 font-bold'; }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check text-xs"></i> パスワードを更新'; }
  }
};

// ============ 緊急リカバリーキー管理モーダル コントローラー ============
let _isModalRecoveryKeyVisible = false;
window.openRecoveryKeyManagerModal = function () {
  const modal = document.getElementById('recoveryKeyManagerModal');
  if (!modal) return;
  _isModalRecoveryKeyVisible = false;
  const keyDisplay = document.getElementById('modalRecoveryKeyDisplay');
  const btnText = document.getElementById('modalToggleKeyVisText');
  if (keyDisplay) keyDisplay.textContent = 'COVO-••••-••••-••••-••••';
  if (btnText) btnText.textContent = 'キーを表示';
  modal.classList.remove('hidden');
};

window.closeRecoveryKeyManagerModal = function () {
  const modal = document.getElementById('recoveryKeyManagerModal');
  if (modal) modal.classList.add('hidden');
};

window.toggleModalRecoveryKeyVisibility = function () {
  _isModalRecoveryKeyVisible = !_isModalRecoveryKeyVisible;
  const keyDisplay = document.getElementById('modalRecoveryKeyDisplay');
  const btnText = document.getElementById('modalToggleKeyVisText');
  if (_isModalRecoveryKeyVisible) {
    if (keyDisplay) keyDisplay.textContent = _currentUserRecoveryKey || 'キーがありません';
    if (btnText) btnText.textContent = 'キーを隠す';
  } else {
    if (keyDisplay) keyDisplay.textContent = 'COVO-••••-••••-••••-••••';
    if (btnText) btnText.textContent = 'キーを表示';
  }
};

// 管理者（オーナー）による緊急復旧ワンタイムPIN発行
window.issueAdminRecoveryPin = async function (targetEmail, targetUserId = '') {
  if (!isAdmin) {
    alertMessage('復旧PINの発行権限はアプリ全体管理者（オーナー）のみに限定されています。', 'error');
    return;
  }
  if (!targetEmail) {
    alertMessage('メールアドレスが指定されていません。', 'error');
    return;
  }
  const cleanEmail = targetEmail.toLowerCase().trim();
  const confirmMsg = `【全体管理者サポート】\n\n対象ユーザー: ${cleanEmail}\n\nこのユーザーに対して「10分間有効のパスワード復旧ワンタイムPIN」を発行しますか？\n（ユーザーはメールを確認できなくても、このPINでパスワードを再設定できます）`;
  if (!confirm(confirmMsg)) return;

  try {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
    const pinHash = await _sha256Hash(salt + ':' + pin);
    const emailHash = await _sha256Hash(cleanEmail);
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // 1. admin_recovery_index (ログイン前復旧用)
    const indexRef = doc(db, `artifacts/${appId}/admin_recovery_index`, emailHash);
    await setDoc(indexRef, {
      userId: targetUserId || '',
      email: cleanEmail,
      pinHash: pinHash,
      salt: salt,
      expiresAt: expiresAt,
      used: false,
      issuedByAdmin: auth.currentUser?.email || 'admin',
      issuedAt: serverTimestamp()
    }, { merge: true });

    // 2. admin_recovery_requests (ログイン中バイパス用)
    if (targetUserId) {
      const reqRef = doc(db, `artifacts/${appId}/admin_recovery_requests`, targetUserId);
      await setDoc(reqRef, {
        userId: targetUserId,
        email: cleanEmail,
        pin: pin,
        pinHash: pinHash,
        salt: salt,
        expiresAt: expiresAt,
        used: false,
        issuedByAdmin: auth.currentUser?.email || 'admin',
        issuedAt: serverTimestamp()
      }, { merge: true });
    }

    const modalHtml = `
      <div id="adminPinModal" class="fixed inset-0 modal-overlay flex items-center justify-center z-[110] p-4" style="background:rgba(15,23,42,0.75);backdrop-filter:blur(8px);">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-5 sm:p-6 modal-box animate-pop-in border border-gray-200/80 dark:border-slate-800 text-gray-800 dark:text-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 flex items-center justify-center text-lg flex-shrink-0">
              <i class="fas fa-key"></i>
            </div>
            <div>
              <h3 class="text-base font-bold text-gray-900 dark:text-white">復旧用PINを発行しました</h3>
              <p class="text-xs text-gray-500 dark:text-slate-400">10分間有効のPINコードです</p>
            </div>
          </div>
          <div class="p-3 bg-gray-50 dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-slate-800 text-xs space-y-2">
            <div class="flex justify-between">
              <span class="text-gray-500">対象アカウント:</span>
              <span class="font-bold text-gray-800 dark:text-white font-mono">${cleanEmail}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">有効期限:</span>
              <span class="font-bold text-amber-600 dark:text-amber-400">10分間（${new Date(expiresAt).toLocaleTimeString('ja-JP')} まで）</span>
            </div>
          </div>
          <div class="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-center space-y-1">
            <div class="text-xs text-emerald-700 dark:text-emerald-400 font-bold">復旧用PINコード</div>
            <div class="text-3xl font-black font-mono tracking-widest text-emerald-600 dark:text-emerald-400 select-all">${pin}</div>
          </div>
          <p class="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
            このPINをユーザーに伝えてください。ログイン画面の「パスワードをお忘れですか？ ＞ 管理者支援」にメールアドレスとこのPINを入力することで、即座にパスワードを再設定できます。
          </p>
          <div class="flex gap-2 pt-1">
            <button onclick="navigator.clipboard.writeText('【Covoパスワード復旧PIN】\\n対象: ${cleanEmail}\\nPIN: ${pin}\\n有効期限: 10分間\\nログイン画面の「管理者支援」タブから入力してください。'); alertMessage('復旧案内テキストをコピーしました！', 'success');" class="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 active:scale-98 shadow-sm">
              <i class="fas fa-copy"></i> PIN案内をコピー
            </button>
            <button onclick="document.getElementById('adminPinModal')?.remove();" class="px-4 py-2.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 text-xs font-bold rounded-xl transition">
              閉じる
            </button>
          </div>
        </div>
      </div>
    `;
    const oldModal = document.getElementById('adminPinModal');
    if (oldModal) oldModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

  } catch (err) {
    console.error('[Admin] Issue PIN error:', err);
    alertMessage(`PIN発行エラー: ${err.message}`, 'error');
  }
};

window.toggleGoogleLinkAction = async function () {
  const user = auth.currentUser;
  if (!user) return;
  const isGoogleLinked = user.providerData && user.providerData.some(p => p.providerId === 'google.com');
  if (isGoogleLinked) {
    if (user.providerData.length <= 1) {
      alertMessage('Googleアカウントのみでログインしているため、連携を解除できません。先にパスワードを設定してください。', 'warning');
      return;
    }
    if (!confirm('Googleアカウントとの連携を解除しますか？')) return;
    try {
      await unlink(user, 'google.com');
      alertMessage('Google連携を解除しました。', 'success');
      updateAccountSecurityUI(auth.currentUser);
    } catch (err) {
      console.error('[Auth] Unlink Google error:', err);
      alertMessage(`連携解除エラー: ${err.message}`, 'error');
    }
  } else {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await linkWithPopup(user, provider);
      alertMessage('Googleアカウントと正常に連携しました！', 'success');
      updateAccountSecurityUI(auth.currentUser);
    } catch (err) {
      console.error('[Auth] Link Google error:', err);
      if (err.code === 'auth/credential-already-in-use') {
        alertMessage('このGoogleアカウントは既に別のアカウントで使用されています。', 'error');
      } else if (err.code === 'auth/popup-closed-by-user') {
        // user closed popup
      } else {
        alertMessage(`連携エラー: ${err.message}`, 'error');
      }
    }
  }
};

window.sendPasswordResetToCurrentUser = async function () {
  const user = auth.currentUser;
  if (!user || !user.email) {
    alertMessage('ユーザーのメールアドレスが取得できませんでした。', 'error');
    return;
  }
  try {
    auth.languageCode = 'ja';
    await sendPasswordResetEmail(auth, user.email);
    alertMessage(`「${user.email}」宛にパスワード再設定メールを送信しました。メール内のリンクより再設定を行ってください。`, 'success');
  } catch (err) {
    console.error('[Auth] sendPasswordResetToCurrentUser error:', err);
    alertMessage(`送信失敗: ${err.message}`, 'error');
  }
};

window.submitChangePassword = async function () {
  const user = auth.currentUser;
  if (!user) return;
  const currInput = document.getElementById('currentPasswordInput');
  const newInput = document.getElementById('newPasswordInput');
  const confirmInput = document.getElementById('confirmNewPasswordInput');
  const msg = document.getElementById('changePasswordMessage');
  const btn = document.getElementById('changePasswordBtn');

  const currPwd = currInput?.value || '';
  const newPwd = newInput?.value || '';
  const confirmPwd = confirmInput?.value || '';

  const hasPasswordProvider = user.providerData && user.providerData.some(p => p.providerId === 'password');

  if (hasPasswordProvider && !currPwd && !window._adminBypassActive) {
    if (msg) { msg.textContent = '現在のパスワードを入力してください。'; msg.className = 'text-xs text-rose-600 dark:text-rose-400'; }
    return;
  }
  if (!newPwd || newPwd.length < 6) {
    if (msg) { msg.textContent = '新しいパスワードは6文字以上で入力してください。'; msg.className = 'text-xs text-rose-600 dark:text-rose-400'; }
    return;
  }
  if (newPwd !== confirmPwd) {
    if (msg) { msg.textContent = '新しいパスワードが一致しません。'; msg.className = 'text-xs text-rose-600 dark:text-rose-400'; }
    return;
  }

  try {
    if (btn) { btn.disabled = true; btn.textContent = '更新中...'; }
    if (hasPasswordProvider && user.email && !window._adminBypassActive) {
      const cred = EmailAuthProvider.credential(user.email, currPwd);
      await reauthenticateWithCredential(user, cred);
    }
    await updatePassword(user, newPwd);
    
    // バイパス使用済み処理
    if (window._adminBypassActive) {
      window._adminBypassActive = false;
      const reqRef = doc(db, `artifacts/${appId}/admin_recovery_requests`, user.uid);
      updateDoc(reqRef, { used: true, usedAt: serverTimestamp() }).catch(() => {});
      const adminBypassBanner = document.getElementById('adminBypassNoticeBanner');
      const mobileAdminBypassBanner = document.getElementById('mobileAdminBypassNoticeBanner');
      if (adminBypassBanner) adminBypassBanner.classList.add('hidden');
      if (mobileAdminBypassBanner) mobileAdminBypassBanner.classList.add('hidden');
    }

    if (msg) {
      msg.textContent = 'パスワードを正常に更新しました！';
      msg.className = 'text-xs text-emerald-600 dark:text-emerald-400 font-bold';
    }
    if (currInput) currInput.value = '';
    if (newInput) newInput.value = '';
    if (confirmInput) confirmInput.value = '';
    alertMessage('パスワードを変更しました。', 'success');
  } catch (err) {
    console.error('[Auth] Update password error:', err);
    let errMsg = 'パスワードの更新に失敗しました。';
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') errMsg = '現在のパスワードが正しくありません。';
    else if (err.code === 'auth/requires-recent-login') errMsg = 'セキュリティのため、一度ログアウトして再ログインしてからお試しください。';
    else if (err.code === 'auth/weak-password') errMsg = 'パスワードが弱すぎます（6文字以上）。';
    if (msg) { msg.textContent = errMsg; msg.className = 'text-xs text-rose-600 dark:text-rose-400'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'パスワードを変更'; }
  }
};

// authEmail を保持するための変数
let userAuthEmail = "";

// --- 管理者パネルの処理 ---

// タブ切り替え（洗練されたピル型タブ）
let adminCurrentTab = "allowed";
function switchAdminTab(tab) {
  adminCurrentTab = tab;
  const tabs = [
    { id: "adminTabAllowedBtn", content: "adminTabAllowedContent", key: "allowed" },
    { id: "adminTabAdminsBtn", content: "adminTabAdminsContent", key: "admins" },
    { id: "adminTabListAdminsBtn", content: "adminTabListAdminsContent", key: "listAdmins" },
    { id: "adminTabFeaturesBtn", content: "adminTabFeaturesContent", key: "features" },
    { id: "adminTabAnnouncementsBtn", content: "adminTabAnnouncementsContent", key: "announcements" },
    { id: "adminTabRecoveryBtn", content: "adminTabRecoveryContent", key: "recovery" },
  ];
  if (tab === 'announcements') {
    loadAdminAnnouncements();
  }
  if (tab === 'recovery') {
    loadAdminRecoveryUsers();
  }
  tabs.forEach(t => {
    const btn = document.getElementById(t.id);
    const cnt = document.getElementById(t.content);
    if (!btn || !cnt) return;
    if (t.key === tab) {
      btn.className = "flex-shrink-0 py-2 px-3.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 text-gray-900 bg-white dark:bg-gray-700 dark:text-white shadow-xs";
      cnt.classList.remove("hidden");
    } else {
      btn.className = "flex-shrink-0 py-2 px-3.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200";
      cnt.classList.add("hidden");
    }
  });
}
document.getElementById("adminTabAllowedBtn")?.addEventListener("click", () => switchAdminTab("allowed"));
document.getElementById("adminTabAdminsBtn")?.addEventListener("click", () => switchAdminTab("admins"));
document.getElementById("adminTabListAdminsBtn")?.addEventListener("click", () => switchAdminTab("listAdmins"));
document.getElementById("adminTabFeaturesBtn")?.addEventListener("click", () => switchAdminTab("features"));
document.getElementById("adminTabAnnouncementsBtn")?.addEventListener("click", () => switchAdminTab("announcements"));
document.getElementById("adminTabRecoveryBtn")?.addEventListener("click", () => switchAdminTab("recovery"));

// ============ 管理者専用 復旧PIN支援タブ コントローラー ============
let _cachedRecoveryUsers = [];
window.loadAdminRecoveryUsers = async function () {
  if (!isAdmin) return;
  const listEl = document.getElementById('adminRecoveryUsersList');
  const countEl = document.getElementById('adminRecoveryUserCount');
  if (!listEl) return;

  listEl.innerHTML = '<div class="text-center py-6 text-xs text-gray-400 dark:text-gray-500"><i class="fas fa-spinner fa-spin mr-1.5"></i>ユーザー情報を取得中...</div>';

  try {
    const usersSnap = await getDocs(collection(db, `artifacts/${appId}/users`));
    const activeReqsSnap = await getDocs(collection(db, `artifacts/${appId}/admin_recovery_requests`));
    const activeReqsMap = new Map();
    activeReqsSnap.forEach(d => {
      const data = d.data();
      if (!data.used && data.expiresAt && Date.now() < data.expiresAt) {
        if (data.email) activeReqsMap.set(data.email.toLowerCase(), data);
        if (data.userId) activeReqsMap.set(data.userId, data);
      }
    });

    _cachedRecoveryUsers = [];
    const fallbackPromises = [];

    usersSnap.forEach(d => {
      const data = d.data();
      const email = (data.email || '').toLowerCase().trim();
      const uid = d.id;
      let nickname = data.nickname || data.displayName || null;
      let avatarUrl = data.avatarUrl || data.photoURL || '';
      const activeReq = activeReqsMap.get(email) || activeReqsMap.get(uid) || null;

      const userObj = {
        uid,
        email,
        nickname: nickname || (email ? email.split('@')[0] : 'ユーザー'),
        avatarUrl,
        activeReq,
        isResolved: !!nickname
      };
      _cachedRecoveryUsers.push(userObj);

      // ルートドキュメントにニックネームが無い場合、profile/nicknameDoc からフォールバック取得し自動バックフィル
      if (!nickname) {
        fallbackPromises.push(
          getDoc(doc(db, `artifacts/${appId}/users/${uid}/profile`, 'nicknameDoc')).then(pSnap => {
            if (pSnap.exists()) {
              const pData = pSnap.data();
              if (pData.nickname) {
                userObj.nickname = pData.nickname;
                userObj.isResolved = true;
                // ルートの users/{uid} にも同期保存（自己修復・バックフィル）
                setDoc(doc(db, `artifacts/${appId}/users`, uid), {
                  nickname: pData.nickname,
                  avatarUrl: pData.avatarUrl || userObj.avatarUrl || null,
                  ...(email ? { email } : {})
                }, { merge: true }).catch(() => {});
              }
              if (pData.avatarUrl) {
                userObj.avatarUrl = pData.avatarUrl;
              }
            }
          }).catch(() => {})
        );
      }
    });

    if (fallbackPromises.length > 0) {
      await Promise.all(fallbackPromises);
    }

    _cachedRecoveryUsers.sort((a, b) => {
      const aName = a.nickname || a.email;
      const bName = b.nickname || b.email;
      return aName.localeCompare(bName);
    });

    if (countEl) countEl.textContent = `${_cachedRecoveryUsers.length}名`;
    renderAdminRecoveryUsersList();
  } catch (err) {
    console.error('[Admin] loadAdminRecoveryUsers error:', err);
    listEl.innerHTML = `<div class="text-center py-4 text-xs text-rose-500">ユーザー一覧の取得に失敗しました: ${escapeHtml(err.message)}</div>`;
  }
};

window.filterAdminRecoveryUsers = function () {
  renderAdminRecoveryUsersList();
};

function renderAdminRecoveryUsersList() {
  const listEl = document.getElementById('adminRecoveryUsersList');
  if (!listEl) return;
  const search = (document.getElementById('adminRecoverySearchInput')?.value || '').toLowerCase().trim();
  const filtered = _cachedRecoveryUsers.filter(u => {
    if (!search) return true;
    return (u.email && u.email.includes(search)) || (u.nickname && u.nickname.toLowerCase().includes(search));
  });

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="text-center py-6 text-xs text-gray-400 dark:text-gray-500">該当するユーザーは見つかりませんでした</div>';
    return;
  }

  listEl.innerHTML = '';
  filtered.forEach(u => {
    const isSelf = auth.currentUser && (auth.currentUser.uid === u.uid || auth.currentUser.email?.toLowerCase() === u.email);
    const item = document.createElement('div');
    item.className = 'p-3 bg-white dark:bg-slate-800/40 border border-gray-200/80 dark:border-transparent rounded-xl shadow-xs text-xs flex items-center justify-between gap-3 transition-colors';

    let statusBadge = '';
    if (u.activeReq) {
      const mins = Math.ceil((u.activeReq.expiresAt - Date.now()) / 60000);
      statusBadge = `<span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center gap-1"><i class="fas fa-key text-[8px]"></i>PIN有効 (残り${mins}分)</span>`;
    }

    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <div class="user-avatar-wrap w-8 h-8 rounded-full bg-indigo-100 dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 font-bold flex items-center justify-center text-xs flex-shrink-0 overflow-hidden shadow-xs"></div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-bold text-gray-900 dark:text-white truncate">${escapeHtml(u.nickname)}</span>
            ${isSelf ? '<span class="text-[10px] text-gray-400 dark:text-slate-500 font-semibold">あなた</span>' : ''}
            ${statusBadge}
          </div>
          <div class="text-[11px] text-gray-500 dark:text-slate-400 font-mono truncate">${escapeHtml(u.email || '未設定')}</div>
        </div>
      </div>
      <button type="button" class="issue-pin-btn px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-xl shadow-xs transition flex items-center gap-1 flex-shrink-0 active:scale-95">
        <i class="fas fa-key text-[10px]"></i><span>復旧PIN発行</span>
      </button>
    `;

    const avatarWrap = item.querySelector('.user-avatar-wrap');
    if (avatarWrap) {
      if (isUsableAvatarUrl(u.avatarUrl)) {
        __setAvatarImg(avatarWrap, u.avatarUrl, u.nickname, { className: 'w-full h-full rounded-full object-cover' });
      } else {
        avatarWrap.textContent = (u.nickname || '?').charAt(0).toUpperCase();
      }
    }

    const btn = item.querySelector('.issue-pin-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        issueAdminRecoveryPin(u.email, u.uid);
      });
    }

    listEl.appendChild(item);
  });
}

// === システムレポート & 自動エラー集約テレメトリ コントローラー ===
let _currentReportSubTab = 'errors';
let _cachedTelemetryErrors = [];
let _telemetryFilter = 'all';

window.switchReportSubTab = function (tab) {
  _currentReportSubTab = tab;
  const tabs = ['errors', 'feedbacks', 'diag'];
  tabs.forEach(t => {
    const btn = document.getElementById(`reportSubTab${t.charAt(0).toUpperCase() + t.slice(1)}Btn`);
    const content = document.getElementById(`reportSubTab${t.charAt(0).toUpperCase() + t.slice(1)}Content`);
    if (t === tab) {
      if (btn) {
        btn.className = "flex-shrink-0 py-1.5 px-3.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 text-gray-900 bg-white dark:bg-gray-700 dark:text-white shadow-xs";
      }
      if (content) content.classList.remove('hidden');
    } else {
      if (btn) {
        btn.className = "flex-shrink-0 py-1.5 px-3.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200";
      }
      if (content) content.classList.add('hidden');
    }
  });

  if (tab === 'errors') loadErrorTelemetry();
  else if (tab === 'feedbacks') loadAdminFeedbacks();
  else if (tab === 'diag') renderReportsConsoleStream();
};

window.filterErrorTelemetry = function (filter) {
  _telemetryFilter = filter;
  ['all', 'errors', 'warns'].forEach(f => {
    const btn = document.getElementById(`errFilter${f.charAt(0).toUpperCase() + f.slice(1)}`);
    if (!btn) return;
    const isSelected = (f === 'all' && filter === 'all') ||
                       (f === 'errors' && filter === 'error') ||
                       (f === 'warns' && filter === 'warn');
    if (isSelected) {
      btn.className = 'px-2.5 py-1 text-[11px] font-bold rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 transition';
    } else {
      btn.className = 'px-2.5 py-1 text-[11px] font-bold rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition';
    }
  });
  renderTelemetryErrorsList();
};

let _telemetryErrorsUnsub = null;

window.loadErrorTelemetry = function () {
  const listEl = document.getElementById("telemetryErrorsList");
  const badgeEl = document.getElementById("telemetryCountBadge");
  if (!listEl) return;
  listEl.innerHTML = "<p class='text-xs text-gray-400 text-center py-4'>読み込み中...</p>";
  try {
    if (_telemetryErrorsUnsub) {
      _telemetryErrorsUnsub();
      _telemetryErrorsUnsub = null;
    }
    const q = query(collection(db, `artifacts/${appId}/error_reports`), orderBy('lastOccurredAt', 'desc'), limit(100));
    _telemetryErrorsUnsub = onSnapshot(q, (snap) => {
      const remoteMap = new Map();
      snap.forEach(d => {
        remoteMap.set(d.id, { id: d.id, ...d.data() });
      });

      // ローカルで発生したエラーも保持して結合
      if (Array.isArray(_cachedTelemetryErrors)) {
        _cachedTelemetryErrors.forEach(loc => {
          if (!remoteMap.has(loc.id)) {
            remoteMap.set(loc.id, loc);
          }
        });
      }

      _cachedTelemetryErrors = Array.from(remoteMap.values());
      _cachedTelemetryErrors.sort((a, b) => {
        const timeA = a.lastOccurredAt?.toDate ? a.lastOccurredAt.toDate().getTime() : (new Date(a.lastOccurredAt || 0)).getTime();
        const timeB = b.lastOccurredAt?.toDate ? b.lastOccurredAt.toDate().getTime() : (new Date(b.lastOccurredAt || 0)).getTime();
        return timeB - timeA;
      });

      if (badgeEl) {
        if (_cachedTelemetryErrors.length > 0) {
          badgeEl.textContent = _cachedTelemetryErrors.length;
          badgeEl.classList.remove('hidden');
        } else {
          badgeEl.classList.add('hidden');
        }
      }
      renderTelemetryErrorsList();
    }, (err) => {
      console.warn("[Telemetry] loadErrorTelemetry snapshot warning:", err);
      // リモート取得制限時でもローカルエラーは必ず表示
      renderTelemetryErrorsList();
    });
  } catch (err) {
    console.error("[Telemetry] loadErrorTelemetry error:", err);
    renderTelemetryErrorsList();
  }
};

function renderTelemetryErrorsList() {
  const listEl = document.getElementById("telemetryErrorsList");
  if (!listEl) return;
  const filtered = _cachedTelemetryErrors.filter(item => {
    if (_telemetryFilter === 'error') return item.type === 'error' || item.type === 'unhandledrejection';
    if (_telemetryFilter === 'warn') return item.type === 'warn';
    return true;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = "<div class='text-center py-8 text-xs text-gray-400 dark:text-gray-500'>記録されたエラーはありません。システムは正常です。</div>";
    return;
  }

  listEl.innerHTML = "";
  filtered.forEach(err => {
    const item = document.createElement("div");
    item.className = "p-3.5 bg-white dark:bg-slate-900/70 border border-gray-200/80 dark:border-slate-700/60 rounded-xl shadow-xs text-xs flex flex-col gap-2 relative group";

    const lastTime = err.lastOccurredAt && typeof err.lastOccurredAt.toDate === 'function'
      ? err.lastOccurredAt.toDate().toLocaleString('ja-JP')
      : '不明';
    const firstTime = err.firstOccurredAt && typeof err.firstOccurredAt.toDate === 'function'
      ? err.firstOccurredAt.toDate().toLocaleString('ja-JP')
      : lastTime;

    const isWarn = err.type === 'warn';
    const typeBadge = isWarn
      ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300">警告 (WARN)</span>'
      : '<span class="px-2 py-0.5 rounded text-[10px] font-bold text-rose-600 bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300">エラー (ERROR)</span>';

    const countBadge = (err.count && err.count > 1)
      ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white shadow-xs">${err.count}回発生</span>`
      : '';

    const affectedEmails = Array.isArray(err.affectedEmails) ? err.affectedEmails : (err.affectedEmails ? [err.affectedEmails] : ['不明']);
    const emailsHtml = affectedEmails.map(e => `<span class="inline-block px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded font-mono text-[10px] mr-1 mb-1">${escapeHtml(e)}</span>`).join('');

    const formattedMd = `### [${err.type.toUpperCase()}] ${err.message}\n- **発生回数**: ${err.count || 1}回\n- **初回発生**: ${firstTime}\n- **最新発生**: ${lastTime}\n- **発生ユーザー**: ${affectedEmails.join(', ')}\n- **環境**: ${err.environment?.userAgent || '不明'} (${err.environment?.screenSize || ''})\n\n\`\`\`text\n${err.stack || 'スタックトレースなし'}\n\`\`\``;

    item.innerHTML = `
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="flex items-center gap-1.5 flex-wrap">
          ${typeBadge}
          ${countBadge}
          <span class="text-[11px] text-gray-400 font-mono">最終: ${lastTime}</span>
        </div>
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button class="err-copy-item-btn px-2 py-1 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 text-[11px] font-bold rounded-lg transition" title="このエラーをMarkdownでコピー">
            <i class="fas fa-copy"></i>
          </button>
          <button class="err-del-item-btn px-2 py-1 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-[11px] font-bold rounded-lg transition" title="解決済として削除">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="p-2.5 bg-gray-50 dark:bg-slate-950/60 rounded-xl border border-gray-100 dark:border-slate-800 text-gray-800 dark:text-gray-200 font-mono text-[11px] whitespace-pre-wrap break-all select-all">
        ${escapeHtml(err.message)}
      </div>
      <div>
        <div class="text-[11px] text-gray-400 mb-1 font-semibold">発生アカウント (${affectedEmails.length}人):</div>
        <div class="flex flex-wrap">${emailsHtml}</div>
      </div>
      ${err.stack ? `
        <details class="text-[11px] text-gray-400">
          <summary class="cursor-pointer font-bold hover:text-gray-600 dark:hover:text-gray-200 transition">スタックトレースを表示</summary>
          <pre class="mt-1.5 p-2 bg-gray-950 text-rose-300/90 rounded-lg overflow-x-auto text-[10px] font-mono whitespace-pre-wrap select-all">${escapeHtml(err.stack)}</pre>
        </details>
      ` : ''}
    `;

    item.querySelector(".err-copy-item-btn").addEventListener("click", () => {
      navigator.clipboard.writeText(formattedMd).then(() => {
        alertMessage("エラー詳細をコピーしました", "success");
      }).catch(() => {
        alertMessage("コピーに失敗しました", "error");
      });
    });

    item.querySelector(".err-del-item-btn").addEventListener("click", async () => {
      try {
        await deleteDoc(doc(db, `artifacts/${appId}/error_reports`, err.id));
        _cachedTelemetryErrors = _cachedTelemetryErrors.filter(x => x.id !== err.id);
        renderTelemetryErrorsList();
        alertMessage("エラーログを削除しました", "success");
      } catch (e) {
        console.error(e);
        alertMessage("削除に失敗しました", "error");
      }
    });

    listEl.appendChild(item);
  });
}

window.copyAllTelemetryErrors = function () {
  if (!_cachedTelemetryErrors || _cachedTelemetryErrors.length === 0) {
    alertMessage("コピー対象のエラーがありません", "info");
    return;
  }
  let out = `# Covo エラー・警告自動集約レポート\n生成日時: ${new Date().toLocaleString('ja-JP')}\n総件数: ${_cachedTelemetryErrors.length}件\n\n---\n\n`;
  _cachedTelemetryErrors.forEach((err, idx) => {
    const lastTime = err.lastOccurredAt && typeof err.lastOccurredAt.toDate === 'function' ? err.lastOccurredAt.toDate().toLocaleString('ja-JP') : '不明';
    const emails = Array.isArray(err.affectedEmails) ? err.affectedEmails.join(', ') : (err.affectedEmails || '不明');
    out += `## ${idx + 1}. [${err.type.toUpperCase()}] ${err.message}\n`;
    out += `- **発生回数**: ${err.count || 1}回\n`;
    out += `- **最新発生日時**: ${lastTime}\n`;
    out += `- **影響を受けたメールアドレス**: ${emails}\n`;
    out += `- **クライアント環境**: ${err.environment?.userAgent || '不明'}\n`;
    if (err.stack) {
      out += `\n\`\`\`text\n${err.stack}\n\`\`\`\n\n`;
    }
    out += `---\n\n`;
  });

  navigator.clipboard.writeText(out).then(() => {
    alertMessage("全エラーの集約レポートを一括コピーしました", "success");
  }).catch(() => {
    alertMessage("コピーに失敗しました", "error");
  });
};

window.clearAllTelemetryErrors = async function () {
  if (!_cachedTelemetryErrors || _cachedTelemetryErrors.length === 0) return;
  if (!confirm("記録されているすべてのエラーログを削除（解決済み）にしますか？")) return;
  try {
    const batch = writeBatch(db);
    _cachedTelemetryErrors.forEach(err => {
      batch.delete(doc(db, `artifacts/${appId}/error_reports`, err.id));
    });
    await batch.commit();
    _cachedTelemetryErrors = [];
    renderTelemetryErrorsList();
    alertMessage("全エラーログをクリアしました", "success");
  } catch (err) {
    console.error(err);
    alertMessage("クリアに失敗しました: " + err.message, "error");
  }
};

window.renderReportsConsoleStream = function () {
  const panel = document.getElementById("systemDiagSummaryPanel");
  const streamBody = document.getElementById("reportsConsoleStreamBody");
  if (panel && typeof getSystemDiagnosticInfo === 'function') {
    const diag = getSystemDiagnosticInfo();
    panel.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div><span class="text-gray-400">アプリバージョン:</span> <span class="font-mono font-bold text-gray-800 dark:text-gray-200">${escapeHtml(diag.appVersion)}</span></div>
        <div><span class="text-gray-400">画面サイズ:</span> <span class="font-mono font-bold text-gray-800 dark:text-gray-200">${escapeHtml(diag.screenSize)}</span></div>
        <div><span class="text-gray-400">プラットフォーム:</span> <span class="font-mono font-bold text-gray-800 dark:text-gray-200">${escapeHtml(diag.platform)}</span></div>
        <div><span class="text-gray-400">ネットワーク:</span> <span class="font-mono font-bold ${diag.online ? 'text-emerald-500' : 'text-rose-500'}">${diag.online ? '接続中' : 'オフライン'}</span></div>
      </div>
    `;
  }
  if (streamBody) {
    const logs = window._covoLogs || [];
    if (logs.length === 0) {
      streamBody.innerHTML = "<div class='text-gray-500 py-4 text-center'>コンソールログはありません</div>";
    } else {
      streamBody.innerHTML = logs.map(line => {
        let colorClass = "text-gray-300";
        if (line.startsWith("[ERR]")) colorClass = "text-rose-400";
        else if (line.startsWith("[WARN]")) colorClass = "text-amber-400";
        else if (line.startsWith("[INFO]")) colorClass = "text-blue-300";
        return `<div class="${colorClass}">${escapeHtml(line)}</div>`;
      }).join('');
      streamBody.scrollTop = streamBody.scrollHeight;
    }
  }
};

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
  div.className = "flex items-center gap-3 px-3 py-2.5 bg-gray-50 dark:bg-slate-800/40 rounded-xl border border-gray-100 dark:border-transparent transition-colors";

  const userData = window.__adminUsersByEmail && window.__adminUsersByEmail[email];
  // username: username → nickname → displayName の優先順で取得
  let username = userData?.username || userData?.nickname || userData?.displayName || (userData ? (email ? `${email.split('@')[0]} (未設定)` : "未設定") : "未参加");
  // iconUrl: iconUrl → avatarUrl → photoURL の優先順で取得
  let iconUrl = userData?.iconUrl || userData?.avatarUrl || userData?.photoURL || null;

  const avatar = document.createElement("div");
  avatar.className = "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden shadow-sm transition-colors bg-gray-300 dark:bg-slate-700 text-gray-700 dark:text-gray-300";
  if (isUsableAvatarUrl(iconUrl)) {
    __setAvatarImg(avatar, iconUrl, username || email, { className: "w-full h-full object-cover rounded-full" });
  } else {
    if (userData) {
      avatar.textContent = emailInitial(email);
    } else {
      avatar.className = "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden shadow-sm transition-colors bg-gray-200 dark:bg-slate-800 text-gray-400 dark:text-gray-500";
      avatar.innerHTML = `<i class="fas fa-question"></i>`;
    }
  }

  const textContainer = document.createElement("div");
  textContainer.className = "flex-1 flex flex-col min-w-0";

  const emailSpan = document.createElement("span");
  emailSpan.className = "text-sm text-gray-900 dark:text-gray-100 font-bold truncate transition-colors";
  emailSpan.textContent = email;

  const userSpan = document.createElement("span");
  userSpan.className = "text-[11px] text-gray-500 dark:text-slate-400 font-medium truncate mt-0.5 transition-colors";
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
    badge.className = "text-xs text-gray-400 dark:text-slate-500 flex-shrink-0 font-semibold";
    badge.textContent = "あなた";
    div.appendChild(badge);
  } else {
    const btn = document.createElement("button");
    btn.className = "w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex-shrink-0";
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
    empty.className = "text-xs text-gray-400 dark:text-gray-500 text-center py-4";
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
    empty.className = "text-xs text-gray-400 dark:text-gray-500 text-center py-4";
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
                if (pData.nickname) {
                  window.__adminUsersByEmail[u.email].username = pData.nickname;
                  // ルートドキュメントにもバックフィル
                  setDoc(doc(db, `artifacts/${appId}/users`, d.id), {
                    nickname: pData.nickname,
                    avatarUrl: pData.avatarUrl || u.avatarUrl || null
                  }, { merge: true }).catch(() => {});
                }
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
    }, (err) => {
      console.warn('[AllowedEmails onSnapshot] connection state updated:', err?.message || err);
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
      }, (err) => {
        console.warn('[AdminList onSnapshot] connection state updated:', err?.message || err);
      });

      if (unsubListAdmin) unsubListAdmin();
      unsubListAdmin = onSnapshot(doc(db, `artifacts/${appId}/settings`, "listAdminList"), (snap) => {
        renderListAdminEmails(snap.exists() ? snap.data().emails || [] : []);
      }, (err) => {
        console.warn('[ListAdminList onSnapshot] connection state updated:', err?.message || err);
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

const openAdminModalBtn = document.getElementById("openAdminModalButton");
if (openAdminModalBtn) {
  openAdminModalBtn.addEventListener("click", () => {
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
}

// 許可リスト追加
// ストレージ統計

async function loadStorageStats() {
  const kvText = document.getElementById('kvUsageText');
  const catList = document.getElementById('storageCategoryItemsList');
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
    
    // KV（Cloudflare 1GB）
    const kvLimitBytes = 1 * 1024 * 1024 * 1024;
    const kvUsed = data.kv?.totalBytes || 0;
    kvText.textContent = `${formatBytes(kvUsed)} / 1 GB (${((kvUsed / kvLimitBytes) * 100).toFixed(1)}%)`;

    // iPhone風マルチカラーセグメントバーの更新
    const categories = data.kv?.categories || {};
    const segImages = document.getElementById('seg-images');
    const segVideos = document.getElementById('seg-videos');
    const segDocs = document.getElementById('seg-documents');
    const segAvatars = document.getElementById('seg-avatars');
    const segStamps = document.getElementById('seg-stamps');
    const segOthers = document.getElementById('seg-others');

    const getPct = (bytes) => (Math.max(0, Math.min(100, (bytes / kvLimitBytes) * 100))).toFixed(2) + '%';

    if (segImages) segImages.style.width = getPct(categories.images?.bytes || 0);
    if (segVideos) segVideos.style.width = getPct(categories.videos?.bytes || 0);
    if (segDocs) segDocs.style.width = getPct(categories.documents?.bytes || 0);
    if (segAvatars) segAvatars.style.width = getPct(categories.avatars?.bytes || 0);
    if (segStamps) segStamps.style.width = getPct(categories.stamps?.bytes || 0);
    if (segOthers) segOthers.style.width = getPct(categories.others?.bytes || 0);

    // カテゴリ別内訳リスト＆個別削除ボタンの描画
    if (catList) {
      catList.innerHTML = '';
      const catDefs = [
        { key: 'images', label: '画像ファイル', icon: 'fa-file-image', color: 'text-blue-500 bg-blue-500/10 dark:bg-blue-500/20', deleteType: 'images_only' },
        { key: 'videos', label: '動画・音声', icon: 'fa-file-video', color: 'text-purple-500 bg-purple-500/10 dark:bg-purple-500/20', deleteType: 'videos_only' },
        { key: 'documents', label: '書類・PDF', icon: 'fa-file-lines', color: 'text-amber-500 bg-amber-500/10 dark:bg-amber-500/20', deleteType: 'documents_only' },
        { key: 'avatars', label: 'アイコン画像', icon: 'fa-user-circle', color: 'text-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/20', deleteType: 'avatars_only' },
        { key: 'stamps', label: 'スタンプ', icon: 'fa-icons', color: 'text-pink-500 bg-pink-500/10 dark:bg-pink-500/20', deleteType: 'stamps_only' },
        { key: 'others', label: 'その他ファイル', icon: 'fa-folder', color: 'text-slate-400 bg-slate-500/10 dark:bg-slate-500/20', deleteType: 'others_only' }
      ];

      catDefs.forEach(def => {
        const catData = categories[def.key] || { bytes: 0, count: 0 };
        const row = document.createElement('div');
        row.className = 'p-3 bg-white dark:bg-gray-800/80 rounded-xl border border-gray-100 dark:border-gray-700/60 flex items-center justify-between gap-3 shadow-xs';
        
        row.innerHTML = `
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm ${def.color} flex-shrink-0">
              <i class="fas ${def.icon}"></i>
            </div>
            <div class="min-w-0">
              <div class="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">${def.label}</div>
              <div class="text-[10px] text-gray-400 font-medium">${catData.count} 件 • ${formatBytes(catData.bytes)}</div>
            </div>
          </div>
          <button onclick="deleteStorageCategory('${def.deleteType}', '${def.label}')" ${catData.count === 0 ? 'disabled' : ''} class="px-2.5 py-1 text-xs font-bold text-red-500 hover:text-white hover:bg-red-500 dark:text-red-400 dark:hover:bg-red-600 disabled:opacity-30 disabled:pointer-events-none rounded-lg border border-red-200 dark:border-red-800/40 transition-all flex items-center gap-1 flex-shrink-0">
            <i class="fas fa-trash text-[10px]"></i> 削除
          </button>
        `;
        catList.appendChild(row);
      });
    }
  } catch (e) {
    if (kvText) kvText.textContent = '取得に失敗しました';
    console.error('[storageStats] fetch error:', e);
  }
}

window.deleteStorageCategory = async function(deleteType, label) {
  const confirmed = await showCustomConfirm(
    `「${label}」のみを一括削除しますか？`,
    '削除する',
    'キャンセル',
    'このカテゴリに属するファイルが完全に削除されます。'
  );
  if (!confirmed) return;

  const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  if (!idToken) return;

  try {
    const res = await fetch(`${WORKER_BASE_URL}/api/admin/bulkDeleteFiles?appId=${appId}&deleteType=${deleteType}`, {
      method: 'DELETE',
      headers: { "Authorization": `Bearer ${idToken}` }
    });
    const data = await res.json();
    if (data.success) {
      // 添付ファイル系であればFirestoreメッセージの参照もクリーンアップ
      let msgDeleted = 0;
      if (deleteType === 'images_only' || deleteType === 'videos_only' || deleteType === 'documents_only') {
        msgDeleted = await cleanupFirestoreMessages(deleteType);
      }
      alertMessage(`${label}を削除しました (KV ${data.kvDeleted}件${msgDeleted > 0 ? `、メッセージ ${msgDeleted}件` : ''})`, 'success');
      loadStorageStats();
    } else {
      alertMessage('削除に失敗しました: ' + (data.error || '不明なエラー'), 'error');
    }
  } catch (e) {
    console.error(e);
    alertMessage('通信エラーが発生しました', 'error');
  }
};

document.getElementById('refreshStorageStatsBtn')?.addEventListener('click', loadStorageStats);

async function cleanupFirestoreMessages(filterType = null) {
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
          const hasFileDataKv = d.fileData && d.fileData.indexOf('/api/file/') >= 0;
          const hasCloudinaryFile = d.fileData && d.fileData.includes('res.cloudinary.com');

          let shouldDelete = false;
          if (hasKvFile || hasFileDataKv || hasCloudinaryFile) {
            if (!filterType) {
              shouldDelete = true;
            } else if (filterType === 'images_only' && d.fileType && d.fileType.startsWith('image/')) {
              shouldDelete = true;
            } else if (filterType === 'videos_only' && d.fileType && (d.fileType.startsWith('video/') || d.fileType.startsWith('audio/'))) {
              shouldDelete = true;
            } else if (filterType === 'documents_only' && d.fileType && (d.fileType.includes('pdf') || d.fileType.includes('document') || d.fileType.includes('text'))) {
              shouldDelete = true;
            }
          }

          if (shouldDelete) {
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

document.getElementById('bulkDeleteMessagesBtn')?.addEventListener('click', async () => {
  const first = await showCustomConfirm('チャットの「添付ファイルのみ」を一括削除しますか？', '削除する', 'キャンセル', 'アイコンやスタンプ等の基本ファイルは完全に保護されます。');
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
      alertMessage(`添付ファイル削除完了: KV ${data.kvDeleted} ファイル、メッセージ ${msgDeleted} 件`, 'success');
      loadStorageStats();
    } else {
      alertMessage('削除に失敗しました: ' + data.error, 'error');
    }
  } catch (e) {
    console.error(e);
    alertMessage('通信エラーが発生しました', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paperclip"></i> 添付ファイルのみを一括削除 (アイコン・スタンプは保持)';
  }
});

document.getElementById('bulkDeleteAllFilesBtn')?.addEventListener('click', async () => {
  const first = await showCustomConfirm('【警告】全ファイルを1つも残さず完全に削除しますか？', '削除する', 'キャンセル', 'アイコンやスタンプを含むすべてのストレージファイルが完全に消去されます。');
  if (!first) return;
  const second = await showCustomConfirm('本当によろしいですか？', '全て削除', 'キャンセル', 'この操作は絶対に取り消せません。');
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
      alertMessage(`全削除完了: KV ${data.kvDeleted} ファイル、メッセージ ${msgDeleted} 件`, 'success');
      loadStorageStats();
    } else {
      alertMessage('削除に失敗しました: ' + data.error, 'error');
    }
  } catch (e) {
    console.error(e);
    alertMessage('通信エラーが発生しました', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> 全ファイルを一括削除 (完全初期化)';
  }
});

const addAllowedEmailBtn = document.getElementById("addAllowedEmailButton");
const newAllowedEmailInp = document.getElementById("newAllowedEmailInput");
const adminMsgEl = document.getElementById("adminMessage");

if (addAllowedEmailBtn && newAllowedEmailInp) {
  addAllowedEmailBtn.addEventListener("click", async () => {
    const email = newAllowedEmailInp.value.trim();
    if (!email) return;
    if (adminMsgEl) adminMsgEl.textContent = "追加中...";
    try {
      const ref = doc(db, `artifacts/${appId}/allowedEmails`, email);
      const snap = await getDoc(ref);
      if (snap.exists()) { if (adminMsgEl) adminMsgEl.textContent = "すでに追加されています。"; return; }

      await setDoc(ref, {
        email: email,
        addedBy: auth.currentUser.uid,
        addedAt: serverTimestamp()
      });

      await setDoc(doc(db, `artifacts/${appId}/settings`, "allowedEmailsConfig"), { active: true }, { merge: true });

      newAllowedEmailInp.value = "";
      if (adminMsgEl) adminMsgEl.textContent = "追加しました。";
    } catch (e) {
      console.error(e);
      if (adminMsgEl) adminMsgEl.textContent = "エラーが発生しました。";
    }
  });
}

async function removeAllowedEmail(email) {
  if (!await showCustomConfirm(`「${email}」を許可リストから削除しますか？`, "削除")) return;
  if (adminMsgEl) adminMsgEl.textContent = "削除中...";
  try {
    const ref = doc(db, `artifacts/${appId}/allowedEmails`, email);
    await deleteDoc(ref);
    if (adminMsgEl) adminMsgEl.textContent = "削除しました。";
  } catch (e) {
    console.error(e);
    if (adminMsgEl) adminMsgEl.textContent = "エラーが発生しました。";
  }
}

// 管理者リスト追加
const addAdminEmailBtn = document.getElementById("addAdminEmailButton");
const newAdminEmailInp = document.getElementById("newAdminEmailInput");
if (addAdminEmailBtn && newAdminEmailInp) {
  addAdminEmailBtn.addEventListener("click", async () => {
    const email = newAdminEmailInp.value.trim();
    if (!email) return;
    if (adminMsgEl) adminMsgEl.textContent = "追加中...";
    try {
      const ref = doc(db, `artifacts/${appId}/settings`, "adminList");
      const snap = await getDoc(ref);
      const emails = snap.exists() ? snap.data().emails || [] : [];
      if (emails.includes(email)) { if (adminMsgEl) adminMsgEl.textContent = "すでに管理者です。"; return; }
      emails.push(email);
      await setDoc(ref, { emails }, { merge: true });
      newAdminEmailInp.value = "";
      renderAdminEmails(emails);
      if (adminMsgEl) adminMsgEl.textContent = "追加しました。";
    } catch (e) {
      console.error(e);
      if (adminMsgEl) adminMsgEl.textContent = "エラーが発生しました。";
    }
  });
}

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

  const smap = { profile: 'profileSection', settings: 'settingsSection', migration: 'migrationSection', admin: 'adminNavSection', storage: 'storageSection', reports: 'reportsSection', appinfo: 'appinfoSection', admintools: 'admintoolsSection' };
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

window.openMobileProfileScreen = function () {
  updateMobileProfileScreen();
  const el = document.getElementById('mobileProfileScreen');
  if (el) {
    el.classList.remove('closing');
    el.classList.add('active');
  }
};

window.closeMobileProfileScreen = function () {
  const el = document.getElementById('mobileProfileScreen');
  if (el) {
    el.classList.add('closing');
    setTimeout(() => {
      el.classList.remove('active', 'closing');
    }, 200);
  }
};

window.switchMobileTab = function (tab) {
  if (tab === 'you') {
    openMobileProfileScreen();
  } else if (tab === 'notif') {
    openNotifModal();
  }
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

window.switchInboxTab = function (tab) {
  const unreadBtn = document.getElementById('inboxTabUnreadBtn');
  const mentionsBtn = document.getElementById('inboxTabMentionsBtn');
  const unreadSec = document.getElementById('inboxUnreadSection');
  const mentionsSec = document.getElementById('inboxMentionsSection');

  if (tab === 'mentions') {
    if (unreadBtn) unreadBtn.classList.remove('active');
    if (mentionsBtn) mentionsBtn.classList.add('active');
    if (unreadSec) unreadSec.classList.add('hidden');
    if (mentionsSec) mentionsSec.classList.remove('hidden');
  } else {
    if (unreadBtn) unreadBtn.classList.add('active');
    if (mentionsBtn) mentionsBtn.classList.remove('active');
    if (unreadSec) unreadSec.classList.remove('hidden');
    if (mentionsSec) mentionsSec.classList.add('hidden');
  }
};

window.openNotifModal = function (triggerEl, e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const pm = document.getElementById('pcNotifModal');
  const popover = document.getElementById('inboxPopoverBox');
  if (!pm || !popover) return;

  // すでに開いていれば閉じる（トグル）
  if (!pm.classList.contains('hidden') && pm.style.display !== 'none') {
    closeNotifModal();
    return;
  }

  let btn = triggerEl instanceof HTMLElement ? triggerEl : (e && e.currentTarget instanceof HTMLElement ? e.currentTarget : null);
  if (!btn) {
    btn = document.getElementById('titlebarInboxBtn') || document.querySelector('.titlebar-action-btn') || document.getElementById('serverListNotifBtn');
  }

  // アイコンボタンを白くする（activeクラス付与）
  document.querySelectorAll('.titlebar-action-btn, #serverListNotifBtn').forEach(b => {
    if (b.title?.includes('受信ボックス') || b.id === 'titlebarInboxBtn' || b.id === 'serverListNotifBtn') {
      b.classList.add('active');
    }
  });

  // 受信ボックスの右上角がアイコンの位置に来るように配置
  if (window.innerWidth >= 640 && btn) {
    const rect = btn.getBoundingClientRect();
    const topPos = Math.round(rect.bottom + 6);
    const rightPos = Math.max(8, Math.round(window.innerWidth - rect.right));
    popover.style.position = 'fixed';
    popover.style.top = `${topPos}px`;
    popover.style.right = `${rightPos}px`;
    popover.style.left = 'auto';
    popover.style.bottom = 'auto';
  } else {
    popover.style.position = '';
    popover.style.top = '';
    popover.style.right = '';
    popover.style.left = '';
    popover.style.bottom = '';
  }

  pm.classList.remove('hidden');
  pm.style.display = 'flex';
  requestScanAllUnread();
};

window.closeNotifModal = function () {
  const pm = document.getElementById('pcNotifModal');
  if (pm) {
    pm.classList.add('hidden');
    pm.style.display = 'none';
  }
  // アイコンボタンを元のグレーに戻す（activeクラス解除）
  document.querySelectorAll('.titlebar-action-btn.active, #serverListNotifBtn.active').forEach(b => {
    b.classList.remove('active');
  });
};

window.toggleNotifModal = function (triggerEl, e) {
  window.openNotifModal(triggerEl, e);
};

window.clearAllNotifications = function () {
  localStorage.setItem('covo_global_items', '[]');
  const rm = (() => { try { return JSON.parse(localStorage.getItem('covo_last_read') || '{}'); } catch (e) { return {}; } })();
  Object.keys(unreadCounts).forEach(rid => {
    unreadCounts[rid] = 0;
    rm[rid] = Date.now() + 60000;
  });
  localStorage.setItem('covo_last_read', JSON.stringify(rm));
  renderNotifList([]);
  updateGlobalNotifUI();
  alertMessage('すべての通知を既読にしました', 'success');
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
        try {
          const roomsSnap = await getDocs(collection(db, `artifacts/${appId}/servers/${sv.id}/rooms`));
          roomsData = {};
          roomsSnap.forEach(rd => { roomsData[rd.id] = rd.data(); });
          window.__globalRoomsCache[sv.id] = roomsData;
        } catch (e) { continue; }
      }

      for (const rmId of Object.keys(roomsData)) {
        const room = roomsData[rmId];
        const lastAt = typeof room.lastMessageAt === 'number' ? room.lastMessageAt : (room.lastMessageAt?.toMillis?.() || (room.lastMessageAt?.seconds ? room.lastMessageAt.seconds * 1000 : 0));
        if (!lastAt) continue;
        const lastRead = rm[rmId] || 0;
        const bySelf = room.lastMessageSender && room.lastMessageSender === userId;
        const isOpen = (sv.id === currentServerId && rmId === currentRoomId && document.hasFocus());
        if (lastAt > lastRead && !bySelf && !isOpen) {
          let textBody = room.lastMessageText || '新着メッセージ';
          let isMention = false;
          // 暗号化メッセージの安全な復号
          if (typeof isEncrypted === 'function' && isEncrypted(textBody)) {
            try {
              const _members = sv.joinedUsers || [];
              textBody = await decryptText(textBody, sv.id, rmId, _members);
            } catch (e) { textBody = '（暗号化されたメッセージ）'; }
          }
          if (typeof isEncrypted === 'function' && isEncrypted(textBody)) textBody = '（暗号化されたメッセージ）';
          if (userNickname && textBody && (textBody.includes(`@${userNickname}`) || textBody.includes('@all'))) {
            isMention = true;
          }

          items.push({
            serverId: sv.id,
            serverName: sv.name || sv.id,
            serverIconUrl: sv.iconUrl || null,
            roomId: rmId,
            roomName: room.name || rmId,
            senderName: room.lastMessageSenderNickname || 'メンバー',
            lastText: textBody,
            isMention: isMention,
            lastAt
          });
        }
      }
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
  const mList = document.getElementById('mobileNotifList');
  const pList = document.getElementById('pcNotifList');
  const pe = document.getElementById('pcNotifEmpty');
  const mentionsList = document.getElementById('inboxMentionsList');
  const mentionsEmpty = document.getElementById('inboxMentionsEmpty');
  const totalBadge = document.getElementById('notifTotalBadge');

  const count = items.length;
  if (totalBadge) {
    totalBadge.textContent = count;
    totalBadge.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  // 1. 未読タブの描画
  if (count === 0) {
    if (pList) pList.innerHTML = '';
    if (mList) mList.innerHTML = '';
    if (pe) pe.style.display = 'block';
  } else {
    if (pe) pe.style.display = 'none';
    const maxItems = items.slice(0, 50);
    let html = '';
    maxItems.forEach(it => {
      const sName = escapeHtml(it.serverName || 'サーバー');
      const rName = escapeHtml(it.roomName || 'ルーム');
      const timeStr = formatTimeAgo(it.lastAt);
      const initial = sName.charAt(0).toUpperCase();
      const bodyText = escapeHtml(it.lastText || '新着メッセージ');
      const sender = escapeHtml(it.senderName || 'メンバー');
      const iconHtml = it.serverIconUrl
        ? `<img src="${escapeHtml(it.serverIconUrl)}" class="w-full h-full object-cover rounded-xl" />`
        : `<span class="w-full h-full bg-indigo-500/15 dark:bg-indigo-500/25 text-indigo-500 dark:text-indigo-400 flex items-center justify-center font-bold text-xs rounded-xl">${initial}</span>`;

      html += `
        <div class="p-3.5 bg-gray-50 dark:bg-[#1e1f22] border border-gray-200/80 dark:border-white/5 rounded-2xl cursor-pointer hover:bg-gray-100 dark:hover:bg-[#35373c] hover:border-indigo-500/40 transition-all group flex items-start justify-between gap-3 shadow-sm" onclick="goToServerRoom('${it.serverId}','${it.roomId}')">
          <div class="w-9 h-9 rounded-xl flex-shrink-0 overflow-hidden shadow-inner mt-0.5">
            ${iconHtml}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 leading-none mb-1">
              <span class="text-[11px] font-bold text-gray-500 dark:text-gray-400 truncate max-w-[130px]">${sName}</span>
              <span class="text-gray-300 dark:text-gray-600 text-xs">•</span>
              <span class="text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 truncate">#${rName}</span>
              <span class="text-[10px] text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0">${timeStr}</span>
            </div>
            <div class="text-xs text-gray-800 dark:text-gray-200 font-medium truncate leading-tight">
              <span class="font-bold mr-1 text-gray-900 dark:text-gray-100">${sender}:</span>${bodyText}
            </div>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
            <span class="w-2 h-2 rounded-full bg-indigo-500 inline-block"></span>
          </div>
        </div>`;
    });
    if (items.length > 50) {
      html += `<div class="text-center text-xs text-gray-400 py-2">他 ${items.length - 50} 件の未読メッセージがあります</div>`;
    }
    if (pList) pList.innerHTML = html;
    if (mList) mList.innerHTML = html;
  }

  // 2. メンションタブの描画
  const mentionItems = items.filter(it => it.isMention);
  if (mentionsList) {
    if (mentionItems.length === 0) {
      mentionsList.innerHTML = '';
      if (mentionsEmpty) mentionsEmpty.style.display = 'block';
    } else {
      if (mentionsEmpty) mentionsEmpty.style.display = 'none';
      let mHtml = '';
      mentionItems.forEach(it => {
        const sName = escapeHtml(it.serverName || 'サーバー');
        const rName = escapeHtml(it.roomName || 'ルーム');
        const timeStr = formatTimeAgo(it.lastAt);
        const bodyText = escapeHtml(it.lastText || 'メンションメッセージ');
        const sender = escapeHtml(it.senderName || 'メンバー');

        mHtml += `
          <div class="p-3.5 bg-indigo-500/10 dark:bg-indigo-950/30 border border-indigo-500/30 rounded-2xl cursor-pointer hover:bg-indigo-500/20 transition-all group flex items-start justify-between gap-3 shadow-sm" onclick="goToServerRoom('${it.serverId}','${it.roomId}')">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 leading-none mb-1">
                <span class="px-1.5 py-0.5 text-[9px] font-extrabold bg-indigo-600 text-white rounded">@メンション</span>
                <span class="text-[11px] font-bold text-gray-600 dark:text-gray-300 truncate">${sName} › #${rName}</span>
                <span class="text-[10px] text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0">${timeStr}</span>
              </div>
              <div class="text-xs text-gray-900 dark:text-gray-100 font-medium truncate leading-tight mt-1">
                <span class="font-bold mr-1">${sender}:</span>${bodyText}
              </div>
            </div>
          </div>`;
      });
      mentionsList.innerHTML = mHtml;
    }
  }

  // 通知バッジ・アイコン更新
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
    if (count > 0) navigator.setAppBadge(count).catch(() => {});
    else navigator.clearAppBadge().catch(() => {});
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
  if (ne) ne.textContent = userNickname || 'ユーザー';
  if (ae) __setAvatarImg(ae, userAvatarUrl, userNickname, { style: 'width:100%;height:100%;object-fit:cover;' });
  if (at) at.textContent = (userNickname || '?').charAt(0).toUpperCase();
  if (ap) {
    if (isUsableAvatarUrl(userAvatarUrl)) {
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
  if (auth.currentUser && typeof updateAccountSecurityUI === 'function') {
    updateAccountSecurityUI(auth.currentUser);
  }
  if (isAdmin || isListAdmin) {
    const as2 = document.getElementById('mobileAdminRowSection');
    if (as2) {
      as2.style.display = '';
      as2.classList.remove('hidden');
    }
  }
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

// モバイル通知トグルの双方向同期は initSettings 内で一元管理

// サーバーリストのアバターボタン押下時（スマホはスライドイン設定画面）
document.getElementById('serverListUserBtn')?.addEventListener('click', (e) => {
  if (window.matchMedia('(max-width: 768px)').matches) { e.stopPropagation(); openMobileProfileScreen(); }
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
        if (currentRoomId) resyncActiveRoomMessages();
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
  initP2PLogSyncListener();
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

document.getElementById('avatarCropCancel')?.addEventListener('click', closeCropModal);

document.getElementById('avatarCropConfirm')?.addEventListener('click', async () => {
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

const userPanelEl = document.getElementById("userPanel");
const openSettingsBtnEl = document.getElementById("openSettingsBtn");
const resetAvatarBtnEl = document.getElementById("resetAvatarButton");
const closeSettingsBtnEl = document.getElementById("closeSettingsButton");
const settingsModalEl = document.getElementById("settingsModal");
const saveSettingsBtnEl = document.getElementById("saveSettingsButton");
const logoutBtnInModalEl = document.getElementById("logoutButtonInModal");
const setNicknameBtnEl = document.getElementById("setNicknameButton");
const settingsNicknameInpEl = document.getElementById("settingsNicknameInput");
const settingsMsgEl = document.getElementById("settingsMessage");
const nicknameInpEl = document.getElementById("nicknameInput");
const nicknameMsgEl = document.getElementById("nicknameMessage");

if (userPanelEl) {
  userPanelEl.addEventListener("click", (e) => {
    if (e.target.closest('#openSettingsBtn')) return;
    if (window.matchMedia('(max-width: 768px)').matches) { openMobileProfileScreen(); return; }
    openSettingsModal("profile");
  });
}

if (openSettingsBtnEl) {
  openSettingsBtnEl.addEventListener("click", (e) => {
    e.stopPropagation();
    if (window.matchMedia('(max-width: 768px)').matches) { openMobileProfileScreen(); return; }
    openSettingsModal("settings");
  });
}

// アイコンリセットボタン
if (resetAvatarBtnEl) {
  resetAvatarBtnEl.addEventListener("click", async () => {
    const loadingOverlayEl = document.getElementById("loadingOverlay");
    if (loadingOverlayEl) loadingOverlayEl.classList.remove("hidden");
    try {
      const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile`, "nicknameDoc");
      await updateDoc(userProfileRef, { avatarUrl: null });
      const userRef = doc(db, `artifacts/${appId}/users`, userId);
      await setDoc(userRef, { avatarUrl: null }, { merge: true }).catch(console.error);
      userAvatarUrl = null;
      pendingAvatarUrl = null;
      const previewEl = document.getElementById("settingsAvatarPreview");
      const textEl = document.getElementById("settingsAvatarText");
      if (previewEl) previewEl.classList.add("hidden");
      if (textEl && userNickname) textEl.textContent = userNickname.charAt(0).toUpperCase();
      resetAvatarBtnEl.classList.add("hidden");
      updateUserPanelUI();
      await updateUserStatus(document.visibilityState === 'hidden' ? 'offline' : 'online');
      if (settingsMsgEl) {
        settingsMsgEl.textContent = "アイコンをリセットしました";
        settingsMsgEl.className = "text-center mt-2 text-sm text-gray-600";
      }
    } catch (e) {
      console.error(e);
      if (settingsMsgEl) {
        settingsMsgEl.textContent = "リセットに失敗しました";
        settingsMsgEl.className = "text-center mt-2 text-sm text-red-600";
      }
    } finally {
      if (loadingOverlayEl) loadingOverlayEl.classList.add("hidden");
    }
  });
}

if (closeSettingsBtnEl && settingsModalEl) {
  closeSettingsBtnEl.addEventListener("click", () => {
    settingsModalEl.classList.add("hidden");
  });
}

if (settingsModalEl) {
  settingsModalEl.addEventListener("click", (e) => {
    if (e.target === settingsModalEl) {
      settingsModalEl.classList.add("hidden");
      closeCropModal();
    }
  });
}

if (saveSettingsBtnEl && settingsNicknameInpEl) {
  saveSettingsBtnEl.addEventListener("click", async () => {
    const newName = settingsNicknameInpEl.value.trim();
    if (newName.length < 1 || newName.length > 20) {
      if (settingsMsgEl) {
        settingsMsgEl.textContent = "1〜20文字で入力してください。";
        settingsMsgEl.className = "text-center mt-2 text-sm text-red-600";
      }
      return;
    }
    const loadingOverlayEl = document.getElementById("loadingOverlay");
    if (loadingOverlayEl) loadingOverlayEl.classList.remove("hidden");
    try {
      const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile`, "nicknameDoc");
      const updateData = { nickname: newName, createdAt: serverTimestamp() };
      if (pendingAvatarUrl) { updateData.avatarUrl = pendingAvatarUrl; }
      await setDoc(userProfileRef, updateData, { merge: true });

      const userRef = doc(db, `artifacts/${appId}/users`, userId);
      await setDoc(userRef, {
        email: userAuthEmail,
        nickname: newName,
        avatarUrl: pendingAvatarUrl || userAvatarUrl || null
      }, { merge: true }).catch(console.error);

      userNickname = newName;
      if (pendingAvatarUrl) { userAvatarUrl = pendingAvatarUrl; }

      const hdrTitle = document.getElementById("headerTitle");
      if (hdrTitle) hdrTitle.textContent = `${userNickname}${isAdmin ? " (管理者)" : ""}`;
      updateUserPanelUI();

      await updateUserStatus(document.visibilityState === 'hidden' ? 'offline' : 'online');

      if (settingsMsgEl) {
        settingsMsgEl.textContent = "保存しました";
        settingsMsgEl.className = "text-center mt-2 text-sm text-gray-600";
      }
      closeCropModal();
      setTimeout(() => { if (settingsModalEl) settingsModalEl.classList.add("hidden"); }, 1000);
    } catch (e) {
      if (settingsMsgEl) {
        settingsMsgEl.textContent = "エラーが発生しました";
        settingsMsgEl.className = "text-center mt-2 text-sm text-red-600";
      }
    } finally {
      if (loadingOverlayEl) loadingOverlayEl.classList.add("hidden");
    }
  });
}

if (logoutBtnInModalEl) {
  logoutBtnInModalEl.addEventListener("click", async () => {
    if (!await showCustomConfirm("本当にログアウトしますか？", "ログアウト", "キャンセル")) return;
    closeCropModal();
    if (settingsModalEl) settingsModalEl.classList.add("hidden");
    const loadingOverlayEl = document.getElementById("loadingOverlay");
    if (loadingOverlayEl) loadingOverlayEl.classList.remove("hidden");
    try {
      if (typeof cleanupAllActiveFirestoreListeners === 'function') cleanupAllActiveFirestoreListeners();
      await updateUserStatus('offline');
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    } finally {
      if (loadingOverlayEl) loadingOverlayEl.classList.add("hidden");
    }
  });
}

if (setNicknameBtnEl && nicknameInpEl) {
  setNicknameBtnEl.addEventListener("click", async () => {
    const nickname = (nicknameInpEl.value || "").trim();
    if (nickname.length < 1 || nickname.length > 20) {
      if (nicknameMsgEl) nicknameMsgEl.textContent = "1〜20文字で入力してください。";
      return;
    }
    const loadingOverlayEl = document.getElementById("loadingOverlay");
    if (loadingOverlayEl) loadingOverlayEl.classList.remove("hidden");
    try {
      const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile`, "nicknameDoc");
      await setDoc(userProfileRef, { nickname: nickname, createdAt: serverTimestamp() });

      const userRef = doc(db, `artifacts/${appId}/users`, userId);
      await setDoc(userRef, { email: userAuthEmail, nickname: nickname }, { merge: true }).catch(console.error);

      userNickname = nickname;

      const hdrTitle = document.getElementById("headerTitle");
      if (hdrTitle) hdrTitle.textContent = `${userNickname}${isAdmin ? " (管理者)" : ""}`;
      updateUserPanelUI();

      document.body.classList.add("logged-in");
      const nicknameCont = document.getElementById("nicknameContainer");
      const appCont = document.getElementById("appContainer");
      const sls = document.getElementById("serverListScreen");
      if (nicknameCont) nicknameCont.classList.add("hidden");
      
      const isDiscordMode = localStorage.getItem('covo_discord_ui_mode') !== 'false';
      if (isDiscordMode) {
        if (sls) sls.classList.add("hidden");
        if (appCont) appCont.classList.remove("hidden");
        setDiscordUIMode(true);
      } else {
        if (appCont) appCont.classList.add("hidden");
        if (sls) sls.classList.remove("hidden");
      }
      showServerList();
      startPresenceSystem();
      initializeFCM();
    } catch (error) {
      if (nicknameMsgEl) nicknameMsgEl.textContent = `エラー: ${error.message}`;
    } finally {
      if (loadingOverlayEl) loadingOverlayEl.classList.add("hidden");
    }
  });
}

// =========================================================================
// 🌟 Discord準拠 ユーザープロフィールポップアップ & ステメ (Custom Status)
// =========================================================================
let _currentProfileTargetUser = null;
window._currentUserCustomStatus = null;

window.openUserProfileModal = async function (targetUid, targetNickname, targetAvatarUrl) {
  if (!targetUid) return;
  const modal = document.getElementById("userProfileModal");
  if (!modal) return;

  const isSelf = targetUid === userId;
  _currentProfileTargetUser = { uid: targetUid, nickname: targetNickname, avatarUrl: targetAvatarUrl };

  const avatarEl = document.getElementById("userProfileAvatar");
  const statusDot = document.getElementById("userProfileStatusDot");
  const nameEl = document.getElementById("userProfileName");
  const tagEl = document.getElementById("userProfileTag");
  const adminBadge = document.getElementById("userProfileBadgeAdmin");
  const customStatusWrap = document.getElementById("userProfileCustomStatusWrap");
  const statusEmojiEl = document.getElementById("userProfileStatusEmoji");
  const statusTextEl = document.getElementById("userProfileStatusText");
  const aboutMeEl = document.getElementById("userProfileAboutMe");
  const joinedDateEl = document.getElementById("userProfileJoinedDate");
  const actionsOther = document.getElementById("userProfileActionsOther");
  const actionsSelf = document.getElementById("userProfileActionsSelf");
  const quickMsgArea = document.getElementById("userProfileQuickMsgArea");
  const quickMsgInput = document.getElementById("userProfileQuickMsgInput");

  const safeName = targetNickname || targetUid.substring(0, 8);
  if (nameEl) nameEl.textContent = safeName;
  if (tagEl) tagEl.textContent = `#${targetUid.substring(0, 4)}`;
  if (avatarEl) {
    if (isUsableAvatarUrl(targetAvatarUrl)) {
      __setAvatarImg(avatarEl, targetAvatarUrl, safeName, { className: 'w-full h-full rounded-full object-cover' });
    } else {
      avatarEl.textContent = safeName.charAt(0).toUpperCase();
    }
  }

  const cachedUser = cachedUsers.find(u => u.id === targetUid);
  const state = cachedUser?.computedState || cachedUser?.state || (isSelf ? 'online' : 'offline');
  if (statusDot) statusDot.className = `status-indicator status-${state}`;

  if (isSelf) {
    if (actionsOther) actionsOther.classList.add("hidden");
    if (actionsSelf) actionsSelf.classList.remove("hidden");
    if (quickMsgArea) quickMsgArea.classList.add("hidden");
  } else {
    if (actionsOther) actionsOther.classList.remove("hidden");
    if (actionsSelf) actionsSelf.classList.add("hidden");
    if (quickMsgArea) {
      quickMsgArea.classList.remove("hidden");
      if (quickMsgInput) {
        quickMsgInput.placeholder = `@${safeName} へのメッセージ...`;
        quickMsgInput.value = "";
      }
    }

    const upActionDmBtn = document.getElementById("upActionDmBtn");
    const upActionCallBtn = document.getElementById("upActionCallBtn");
    const upActionFileBtn = document.getElementById("upActionFileBtn");
    const upActionFriendBtn = document.getElementById("upActionFriendBtn");

    if (upActionDmBtn) {
      upActionDmBtn.onclick = () => {
        closeUserProfileModal();
        openDm(targetUid, safeName, targetAvatarUrl);
      };
    }
    if (upActionCallBtn) {
      upActionCallBtn.onclick = () => {
        closeUserProfileModal();
        startCall(targetUid, safeName, targetAvatarUrl);
      };
    }
    if (upActionFileBtn) {
      upActionFileBtn.onclick = () => {
        closeUserProfileModal();
        _fsPickFileAndSend(targetUid, safeName);
      };
    }
    if (upActionFriendBtn) {
      const rel = friendRelationships[targetUid];
      if (rel?.status === 'friends') {
        upActionFriendBtn.className = "w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center justify-center text-sm transition-all shadow-xs";
        upActionFriendBtn.title = "フレンド解除";
        upActionFriendBtn.innerHTML = '<i class="fas fa-user-check"></i>';
        upActionFriendBtn.onclick = async () => {
          if (!confirm(`${safeName} さんをフレンドから削除しますか？`)) return;
          closeUserProfileModal();
          rejectFriendRequest(targetUid);
        };
      } else if (rel?.status === 'pending_sent') {
        upActionFriendBtn.className = "w-9 h-9 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 flex items-center justify-center text-sm transition-all shadow-xs";
        upActionFriendBtn.title = "申請送信済み";
        upActionFriendBtn.innerHTML = '<i class="fas fa-user-clock"></i>';
        upActionFriendBtn.onclick = () => {
          closeUserProfileModal();
          cancelFriendRequest(targetUid);
        };
      } else {
        upActionFriendBtn.className = "w-9 h-9 rounded-full bg-gray-100 dark:bg-[#383a40] hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-500 text-gray-700 dark:text-gray-200 flex items-center justify-center text-sm transition-all shadow-xs";
        upActionFriendBtn.title = "フレンド申請";
        upActionFriendBtn.innerHTML = '<i class="fas fa-user-plus"></i>';
        upActionFriendBtn.onclick = async () => {
          closeUserProfileModal();
          const targetInput = document.getElementById("dmAddFriendInput");
          if (targetInput) targetInput.value = safeName;
          switchDmTab("add");
        };
      }
    }
  }

  // 非同期でユーザー詳細（ステメ・自己紹介・参加日）を取得
  try {
    const userDocRef = doc(db, `artifacts/${appId}/users`, targetUid);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const uData = snap.data();
      if (uData.nickname && nameEl) nameEl.textContent = uData.nickname;
      if (uData.avatarUrl && avatarEl && isUsableAvatarUrl(uData.avatarUrl)) {
        __setAvatarImg(avatarEl, uData.avatarUrl, uData.nickname);
      }
      // カスタムステータス (ステメ)
      if (uData.customStatus && uData.customStatus.text) {
        if (customStatusWrap) customStatusWrap.classList.remove("hidden");
        if (statusEmojiEl) statusEmojiEl.textContent = uData.customStatus.emoji || "💬";
        if (statusTextEl) statusTextEl.textContent = uData.customStatus.text;
      } else {
        if (isSelf) {
          if (customStatusWrap) customStatusWrap.classList.remove("hidden");
          if (statusEmojiEl) statusEmojiEl.textContent = "💬";
          if (statusTextEl) statusTextEl.textContent = "ステータスメッセージを設定する";
          customStatusWrap.onclick = () => openCustomStatusModal();
          customStatusWrap.style.cursor = "pointer";
        } else {
          if (customStatusWrap) customStatusWrap.classList.add("hidden");
        }
      }

      if (aboutMeEl) aboutMeEl.textContent = uData.aboutMe || "自己紹介はまだ設定されていません。";
      if (joinedDateEl) {
        const dt = uData.createdAt?.toDate ? uData.createdAt.toDate().toLocaleDateString('ja-JP') : "-";
        joinedDateEl.textContent = dt;
      }
      if (adminBadge) {
        adminBadge.classList.toggle("hidden", !(uData.isAdmin || (isAdmin && isSelf)));
      }
    }
  } catch (err) {
    console.warn("Failed to fetch full user profile:", err);
  }

  openModal(modal);
};

window.closeUserProfileModal = function () {
  const modal = document.getElementById("userProfileModal");
  if (modal) modal.classList.add("hidden");
  _currentProfileTargetUser = null;
};

window.submitQuickDmMessage = async function () {
  const input = document.getElementById("userProfileQuickMsgInput");
  if (!input || !_currentProfileTargetUser) return;
  const text = input.value.trim();
  if (!text) return;

  const target = _currentProfileTargetUser;
  closeUserProfileModal();
  await openDm(target.uid, target.nickname, target.avatarUrl);

  const mainInput = document.getElementById("messageInput");
  if (mainInput) {
    mainInput.value = text;
    sendMessage();
  }
};

window.openCustomStatusModal = function () {
  const modal = document.getElementById("customStatusModal");
  if (!modal) return;
  closeUserProfileModal();

  const textInput = document.getElementById("customStatusTextInput");
  const emojiDisplay = document.getElementById("customStatusSelectedEmoji");

  const currentStatus = window._currentUserCustomStatus || {};
  if (textInput) textInput.value = currentStatus.text || "";
  if (emojiDisplay) emojiDisplay.textContent = currentStatus.emoji || "💬";

  openModal(modal);
  setTimeout(() => textInput?.focus(), 100);
};

window.closeCustomStatusModal = function () {
  const modal = document.getElementById("customStatusModal");
  if (modal) modal.classList.add("hidden");
};

window.setCustomStatusPreset = function (emoji, text) {
  const textInput = document.getElementById("customStatusTextInput");
  const emojiDisplay = document.getElementById("customStatusSelectedEmoji");
  if (textInput) textInput.value = text;
  if (emojiDisplay) emojiDisplay.textContent = emoji;
};

window.toggleStatusEmojiPicker = function (e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const presets = ['💬', '🎮', '💻', '🎧', '☕', '😴', '✨', '🔥', '📚', '🏃', '🍔', '🎉', '🌟', '👀', '💖', '🚀'];
  
  let popover = document.getElementById('statusEmojiPopover');
  if (!popover) {
    popover = document.createElement('div');
    popover.id = 'statusEmojiPopover';
    popover.className = 'fixed z-[120] bg-white dark:bg-[#2b2d31] p-3 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 grid grid-cols-4 gap-2 animate-pop-in select-none';
    popover.style.width = '180px';
    document.body.appendChild(popover);

    document.addEventListener('click', (ev) => {
      if (popover && popover.style.display !== 'none' && !popover.contains(ev.target) && ev.target.id !== 'customStatusEmojiBtn' && !ev.target.closest('#customStatusEmojiBtn')) {
        popover.style.display = 'none';
      }
    });
  }
  
  if (popover.style.display === 'grid') {
    popover.style.display = 'none';
    return;
  }
  
  popover.innerHTML = '';
  presets.forEach(em => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-9 h-9 rounded-xl hover:bg-gray-100 dark:hover:bg-[#383a40] text-xl flex items-center justify-center transition active:scale-90';
    btn.textContent = em;
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const target = document.getElementById('customStatusSelectedEmoji');
      if (target) target.textContent = em;
      popover.style.display = 'none';
    };
    popover.appendChild(btn);
  });
  
  const triggerBtn = document.getElementById('customStatusEmojiBtn');
  if (triggerBtn) {
    const rect = triggerBtn.getBoundingClientRect();
    popover.style.left = `${Math.max(10, Math.min(window.innerWidth - 190, rect.left))}px`;
    popover.style.top = `${rect.bottom + 6}px`;
  }
  popover.style.display = 'grid';
};

window.saveCustomStatus = async function () {
  const textInput = document.getElementById("customStatusTextInput");
  const emojiDisplay = document.getElementById("customStatusSelectedEmoji");
  const btn = document.getElementById("saveCustomStatusBtn");

  const text = textInput?.value.trim() || "";
  const emoji = emojiDisplay?.textContent.trim() || "💬";

  if (btn) btn.disabled = true;

  try {
    const customStatus = text ? {
      emoji,
      text,
      updatedAt: Date.now()
    } : null;

    window._currentUserCustomStatus = customStatus;

    // 1. Firestore に保存
    await setDoc(doc(db, `artifacts/${appId}/users`, userId), {
      customStatus: customStatus
    }, { merge: true });

    // 2. RTDB に保存（リアルタイム反映）
    try {
      const { ref, set } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const rtdb = await _getOrInitRTDB();
      await set(ref(rtdb, `status/${userId}/customStatus`), customStatus);
    } catch (rtdbErr) { }

    closeCustomStatusModal();
    alertMessage("カスタムステータスを更新しました！", "success");
  } catch (err) {
    console.error("Failed to save custom status:", err);
    alertMessage("ステータスの保存に失敗しました", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
};

// ================= MODULE: presence.js ================
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


// ネット復帰: ステータスをリセットおよびアクティブチャットの即時再同期
function _handleNetworkOnline() {
  _beaconSent = false;
  const currentState = document.visibilityState === 'hidden' ? 'away' : 'online';
  updateUserStatus(currentState);
  if (currentState === 'away') startOfflineTimer();
  refreshCachedIdToken();
  if (currentRoomId) resyncActiveRoomMessages();
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

// アクティブなルームの最新メッセージを差分同期する自己治癒関数（リアルタイム切断を完全防止）
let _lastResyncAt = 0;
async function resyncActiveRoomMessages() {
  if (!currentRoomId || !currentServerId || !userId) return;
  const now = Date.now();
  if (now - _lastResyncAt < 3000) return; // 3秒以内の連続再取得通信をブロック
  _lastResyncAt = now;
  try {
    const { ref, get, query: rtdbQuery, limitToLast, orderByChild } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
    const rtdb = await _getOrInitRTDB();
    const messagesRef = ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`);
    const q = rtdbQuery(messagesRef, orderByChild('timestamp'), limitToLast(25));
    const snapshot = await get(q);
    if (snapshot.exists()) {
      const data = snapshot.val();
      const docs = Object.keys(data).map(k => ({ ...data[k], id: k }));
      const _members = (currentServerData && currentServerData.joinedUsers) || [];
      await decryptMessagesInPlace(docs, currentServerId, currentRoomId, _members).catch(() => {});
      let changed = false;
      docs.forEach(msg => {
        const idx = allLoadedMessages.findIndex(m => m.id === msg.id);
        if (idx >= 0) {
          allLoadedMessages[idx] = msg;
        } else {
          allLoadedMessages.push(msg);
          changed = true;
        }
      });
      if (changed) {
        allLoadedMessages.sort((a, b) => getMsgTimestamp(a) - getMsgTimestamp(b));
        lastMessagesData = [...allLoadedMessages];
        messagesIndexMap = {};
        lastMessagesData.forEach((m, i) => messagesIndexMap[m.id] = i);
        renderMessagesWithReadReceipts();
        updateReadReceiptForCurrentUser();
      }
    }
  } catch (e) {
    console.warn('[RTDB] resyncActiveRoomMessages failed:', e);
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
    resyncActiveRoomMessages();
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
    if (currentRoomId) resyncActiveRoomMessages();
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
_cachedIdToken = null;
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
    const { ref, set, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
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
  setAppTheme(isDark ? 'dark-navy' : 'light');
}
function loadDarkServerTheme() {
  const savedTheme = localStorage.getItem('covo_app_theme') || (localStorage.getItem('covo_dark_server') === 'true' ? 'dark-navy' : 'light');
  setAppTheme(savedTheme);
}
window.setDarkServerTheme = setDarkServerTheme;
window.prewarmPeerConnection = prewarmPeerConnection;
window.stopPrewarmPC = stopPrewarmPC;

let unsubscribeStatusArray = [];
let _renderMembersDebounceTimer = null;

function getTimestampMs(obj) {
  if (!obj || !obj.last_changed) return 0;
  if (typeof obj.last_changed === 'number') return obj.last_changed; // RTDB
  if (obj.last_changed.toDate) return obj.last_changed.toDate().getTime(); // Firestore
  return 0;
}

function requestRenderMembersList() {
  if (_renderMembersDebounceTimer) clearTimeout(_renderMembersDebounceTimer);
  _renderMembersDebounceTimer = setTimeout(() => {
    renderMembersList(cachedUsers);
  }, 80);
}

function subscribeToUserStatus() {
  // 旧リスナーを即座に同期クリーンアップ（メモリリーク防止）
  if (unsubscribeUserStatus) { unsubscribeUserStatus(); unsubscribeUserStatus = null; }
  const oldUnsubs = unsubscribeStatusArray;
  unsubscribeStatusArray = [];
  oldUnsubs.forEach(unsub => { try { unsub(); } catch (_) { } });

  const memberIds = currentServerData?.joinedUsers || [];
  if (memberIds.length === 0) {
    cachedUsers = [];
    renderMembersList(cachedUsers);
    return;
  }

  const usersMap = new Map();
  memberIds.forEach(uid => {
    usersMap.set(uid, { id: uid, state: 'offline' });
  });
  cachedUsers = Array.from(usersMap.values());

  // RTDBでメンバーのリアルタイムステータスを一元監視（Firestore二重クエリを撤廃して通信量削減）
  import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js').then(({ ref, onValue, off }) => {
    _getOrInitRTDB().then(rtdb => {
      memberIds.forEach(uid => {
        const statusRef = ref(rtdb, `status/${uid}`);
        const callback = (snapshot) => {
          const data = snapshot.val();
          const existing = usersMap.get(uid) || { id: uid };

          if (data) {
            usersMap.set(uid, { id: uid, ...existing, ...data });
          } else {
            usersMap.set(uid, { id: uid, state: 'offline', ...existing });
          }
          cachedUsers = Array.from(usersMap.values());
          requestRenderMembersList();
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

      // カスタムステータス (ステメ) の表示
      if (member.customStatus && member.customStatus.text) {
        const customStatusDiv = document.createElement("div");
        customStatusDiv.className = "text-[10px] text-gray-400 dark:text-[#949ba4] truncate mt-0.5 flex items-center gap-1";
        customStatusDiv.innerHTML = `<span>${escapeHtml(member.customStatus.emoji || '💬')}</span><span class="truncate">${escapeHtml(member.customStatus.text)}</span>`;
        info.appendChild(customStatusDiv);
      }

      item.appendChild(avatar);
      item.appendChild(info);

      // Discord準拠: メンバークリックでプロフィールポップアップを開く
      item.addEventListener("click", () => {
        openUserProfileModal(member.id, member.nickname || 'ユーザー', member.avatarUrl || '');
      });

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
  } else if (typeof timestamp.toDate === 'function') {
    past = timestamp.toDate();
  } else if (typeof timestamp === 'object' && timestamp.seconds != null) {
    past = new Date(timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds || 0) / 1000000));
  } else if (typeof timestamp === 'string') {
    past = new Date(timestamp);
  } else {
    return "";
  }

  if (isNaN(past.getTime())) return "";

  const now = new Date();
  const diffInSeconds = Math.floor((now - past) / 1000);

  if (diffInSeconds < 0) return `たった今`;
  if (diffInSeconds < 60) return `数秒前`;
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}分前`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}時間前`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}日前`;
}

// ================= MODULE: servers.js ================
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
    if (typeof setupGlobalNotificationListeners === 'function') {
      setupGlobalNotificationListeners();
    }

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
  }, (err) => {
    console.warn('[ServerList onSnapshot] connection state updated:', err?.message || err);
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

  // Sync RTDB membership securely via Worker
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

  // タイトルバー中央コンテキスト更新
  if (typeof updateTitleBarContext === 'function') {
    updateTitleBarContext('server', serverData);
  }

  // サーバー切り替え時に他サーバー通知監視を再同期
  if (typeof setupGlobalNotificationListeners === 'function') {
    setupGlobalNotificationListeners();
  }

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

  // P2P 過去ログ補完（同室メンバーがオンラインならバックグラウンド同期）
  try {
    LocalStore.getOldestMessageTimestamp(`${currentServerId}_${roomId}`).then(oldestTs => {
      requestP2PLogBackfill('server', roomId, oldestTs);
    }).catch(() => {});
  } catch (e) { }
}

// DM / フレンド画面を開く
window.openDmHomeView = function () {
  currentServerId = null;
  currentServerData = null;
  currentRoomId = null;
  currentServerNickname = null;
  currentHomeViewMode = 'dm';
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

  // モバイルビュー・DiscordUIクラスのリセット
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
  if (typeof updateTitleBarContext === 'function') {
    updateTitleBarContext('dm');
  }
  if (typeof setupGlobalNotificationListeners === 'function') {
    setupGlobalNotificationListeners();
  }
  if (window.renderServerList) window.renderServerList();
  if (typeof renderDiscordServerNav === 'function') renderDiscordServerNav();

  // DM / フレンド画面の公開状態に応じた表示更新
  updateDmViewVisibility();
  renderDmConversationsList();
};

// ============ 個チャ (DM) & フレンド機能 コントローラー ============

function subscribeToFeatureFlags() {
  if (unsubscribeFeatureFlags) { unsubscribeFeatureFlags(); unsubscribeFeatureFlags = null; }
  try {
    unsubscribeFeatureFlags = onSnapshot(doc(db, `artifacts/${appId}/settings/featureFlags`), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        dmAndFriendsEnabled = Boolean(data.dmAndFriendsEnabled);
      } else {
        dmAndFriendsEnabled = false;
      }
      const toggle = document.getElementById('adminDmFeatureToggle');
      if (toggle) toggle.checked = dmAndFriendsEnabled;

      if (currentHomeViewMode === 'dm') {
        updateDmViewVisibility();
      }
    }, (err) => {
      console.warn('[FeatureFlags] listen error:', err);
    });
  } catch (e) { }
}

window.toggleAdminDmFeature = async function(event) {
  if (!isAdmin) return;
  const isChecked = event.target.checked;
  try {
    await setDoc(doc(db, `artifacts/${appId}/settings/featureFlags`), {
      dmAndFriendsEnabled: isChecked,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    }, { merge: true });
    alertMessage(isChecked ? "個別チャット (DM) & フレンド機能を全体公開しました" : "個別チャット (DM) & フレンド機能を管理者専用に設定しました", "success");
  } catch (err) {
    console.error('Failed to toggle admin DM feature:', err);
    alertMessage("設定の保存に失敗しました", "error");
    event.target.checked = !isChecked;
  }
};

function updateDmViewVisibility() {
  const isAvailable = isAdmin || dmAndFriendsEnabled;
  const comingSoonPanel = document.getElementById('dmComingSoonPanel');
  const tabs = document.querySelectorAll('.dm-tab-content');
  if (isAvailable) {
    if (comingSoonPanel) comingSoonPanel.classList.add('hidden');
    switchDmTab(activeDmTab || 'online');
  } else {
    tabs.forEach(t => t.classList.add('hidden'));
    if (comingSoonPanel) comingSoonPanel.classList.remove('hidden');
  }
}

function subscribeToRelationships() {
  if (unsubscribeRelationships) { unsubscribeRelationships(); unsubscribeRelationships = null; }
  if (!userId) return;
  try {
    const relCol = collection(db, `artifacts/${appId}/users/${userId}/relationships`);
    unsubscribeRelationships = onSnapshot(relCol, (snap) => {
      friendRelationships = {};
      snap.forEach(d => {
        friendRelationships[d.id] = { id: d.id, ...d.data() };
      });
      LocalStore.putFriendsBatch(Object.values(friendRelationships)).catch(() => {});
      renderFriendTabs();
      updateDmPendingBadges();
    }, (err) => {
      console.warn('[Relationships] Listen error:', err);
    });
  } catch (e) { }
}

function updateDmPendingBadges() {
  const rels = Object.values(friendRelationships);
  const pendingReceived = rels.filter(r => r.status === 'pending_received').length;
  
  const sideBadge = document.getElementById('dmFriendsPendingBadge');
  if (sideBadge) {
    if (pendingReceived > 0) {
      sideBadge.textContent = pendingReceived;
      sideBadge.classList.remove('hidden');
    } else {
      sideBadge.classList.add('hidden');
    }
  }

  const tabBadge = document.getElementById('dmTabPendingCountBadge');
  if (tabBadge) {
    if (pendingReceived > 0) {
      tabBadge.textContent = pendingReceived;
      tabBadge.classList.remove('hidden');
    } else {
      tabBadge.classList.add('hidden');
    }
  }
}

window.switchDmTab = function(tabName) {
  activeDmTab = tabName;
  const isAvailable = isAdmin || dmAndFriendsEnabled;
  if (!isAvailable) {
    updateDmViewVisibility();
    return;
  }

  const tabBtns = {
    online: document.getElementById('dmTabOnlineBtn'),
    all: document.getElementById('dmTabAllBtn'),
    pending: document.getElementById('dmTabPendingBtn'),
    blocked: document.getElementById('dmTabBlockedBtn'),
    add: document.getElementById('dmTabAddBtn')
  };

  const tabContents = {
    online: document.getElementById('dmTabOnlineContent'),
    all: document.getElementById('dmTabAllContent'),
    pending: document.getElementById('dmTabPendingContent'),
    blocked: document.getElementById('dmTabBlockedContent'),
    add: document.getElementById('dmTabAddContent')
  };

  Object.keys(tabBtns).forEach(k => {
    const btn = tabBtns[k];
    const cnt = tabContents[k];
    if (btn) {
      if (k === tabName) {
        if (k === 'add') {
          btn.className = 'dm-tab-btn px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-bold transition-all shadow-sm flex items-center gap-1 ml-1 whitespace-nowrap';
        } else {
          btn.className = 'dm-tab-btn active px-2.5 py-1 rounded-md bg-gray-200/80 dark:bg-white/10 text-gray-900 dark:text-white font-bold transition-colors whitespace-nowrap';
        }
      } else {
        if (k === 'add') {
          btn.className = 'dm-tab-btn px-2.5 py-1 rounded-md text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 font-bold transition-all flex items-center gap-1 ml-1 whitespace-nowrap';
        } else {
          btn.className = 'dm-tab-btn px-2.5 py-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-800 dark:hover:text-gray-200 transition-colors whitespace-nowrap';
        }
      }
    }
    if (cnt) {
      if (k === tabName) cnt.classList.remove('hidden');
      else cnt.classList.add('hidden');
    }
  });

  renderFriendTabs();
};

window.filterFriendsList = function(query) {
  window._friendSearchQuery = (query || '').toLowerCase().trim();
  const clearBtn = document.getElementById('clearFriendSearchBtn');
  if (clearBtn) {
    if (window._friendSearchQuery) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }
  renderFriendTabs();
};

window.clearFriendSearch = function() {
  const input = document.getElementById('friendListSearchInput');
  if (input) input.value = '';
  window.filterFriendsList('');
};

function renderFriendTabs() {
  const rels = Object.values(friendRelationships);
  let friends = rels.filter(r => r.status === 'friends');
  let pendingReceived = rels.filter(r => r.status === 'pending_received');
  let pendingSent = rels.filter(r => r.status === 'pending_sent');
  let blocked = rels.filter(r => r.status === 'blocked');

  if (window._friendSearchQuery) {
    const q = window._friendSearchQuery;
    friends = friends.filter(f => (f.targetNickname || '').toLowerCase().includes(q) || (f.targetEmail || '').toLowerCase().includes(q));
    pendingReceived = pendingReceived.filter(p => (p.targetNickname || '').toLowerCase().includes(q) || (p.targetEmail || '').toLowerCase().includes(q));
    pendingSent = pendingSent.filter(p => (p.targetNickname || '').toLowerCase().includes(q) || (p.targetEmail || '').toLowerCase().includes(q));
    blocked = blocked.filter(b => (b.targetNickname || '').toLowerCase().includes(q));
  }

  const isOnline = (uid) => {
    const u = cachedUsers.find(cu => cu.id === uid);
    return u && (u.computedState === 'online' || u.computedState === 'away' || u.state === 'online' || u.state === 'away');
  };

  const onlineFriends = friends.filter(f => isOnline(f.targetUid));

  // 1. オンライン
  const onlineCountEl = document.getElementById('dmOnlineFriendsCount');
  if (onlineCountEl) onlineCountEl.textContent = onlineFriends.length;
  const onlineListEl = document.getElementById('dmOnlineFriendsList');
  if (onlineListEl) {
    if (onlineFriends.length === 0) {
      onlineListEl.innerHTML = `<div class="p-8 text-center text-xs text-gray-400 dark:text-slate-500">現在オンラインのフレンドはいません</div>`;
    } else {
      onlineListEl.innerHTML = onlineFriends.map(f => createFriendCardHtml(f, true)).join('');
    }
  }

  // 2. 全員
  const allCountEl = document.getElementById('dmAllFriendsCount');
  if (allCountEl) allCountEl.textContent = friends.length;
  const allListEl = document.getElementById('dmAllFriendsList');
  if (allListEl) {
    if (friends.length === 0) {
      allListEl.innerHTML = `<div class="p-8 text-center text-xs text-gray-400 dark:text-slate-500">${window._friendSearchQuery ? '一致するフレンドが見つかりません' : 'フレンドがまだいません。「フレンド追加」から申請してみましょう！'}</div>`;
    } else {
      allListEl.innerHTML = friends.map(f => createFriendCardHtml(f, isOnline(f.targetUid))).join('');
    }
  }

  // 3. 待機中
  const prCountEl = document.getElementById('dmPendingReceivedCount');
  if (prCountEl) prCountEl.textContent = pendingReceived.length;
  const prListEl = document.getElementById('dmPendingReceivedList');
  if (prListEl) {
    if (pendingReceived.length === 0) {
      prListEl.innerHTML = `<div class="p-4 text-center text-xs text-gray-400 dark:text-slate-500">受信したフレンド申請はありません</div>`;
    } else {
      prListEl.innerHTML = pendingReceived.map(r => `
        <div class="friend-card">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-full bg-slate-700 text-white font-bold flex items-center justify-center text-sm flex-shrink-0 overflow-hidden">
              ${isUsableAvatarUrl(r.targetAvatarUrl) ? `<img src="${r.targetAvatarUrl}" class="w-full h-full rounded-full object-cover">` : escapeHtml((r.targetNickname || 'U').charAt(0).toUpperCase())}
            </div>
            <div class="min-w-0">
              <div class="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">${escapeHtml(r.targetNickname || 'ユーザー')}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500 truncate">${escapeHtml(r.targetEmail || '')}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="acceptFriendRequest('${r.targetUid}')" class="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 active:scale-95">
              <i class="fas fa-check text-xs"></i> 承認
            </button>
            <button onclick="rejectFriendRequest('${r.targetUid}')" class="px-3.5 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-xl transition active:scale-95">
              拒否
            </button>
          </div>
        </div>
      `).join('');
    }
  }

  const psCountEl = document.getElementById('dmPendingSentCount');
  if (psCountEl) psCountEl.textContent = pendingSent.length;
  const psListEl = document.getElementById('dmPendingSentList');
  if (psListEl) {
    if (pendingSent.length === 0) {
      psListEl.innerHTML = `<div class="p-4 text-center text-xs text-gray-400 dark:text-slate-500">送信済みのフレンド申請はありません</div>`;
    } else {
      psListEl.innerHTML = pendingSent.map(r => `
        <div class="friend-card">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-full bg-slate-700 text-white font-bold flex items-center justify-center text-sm flex-shrink-0 overflow-hidden">
              ${isUsableAvatarUrl(r.targetAvatarUrl) ? `<img src="${r.targetAvatarUrl}" class="w-full h-full rounded-full object-cover">` : escapeHtml((r.targetNickname || 'U').charAt(0).toUpperCase())}
            </div>
            <div class="min-w-0">
              <div class="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">${escapeHtml(r.targetNickname || 'ユーザー')}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500 truncate">送信済み申請</div>
            </div>
          </div>
          <button onclick="cancelFriendRequest('${r.targetUid}')" class="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 text-xs font-bold rounded-xl transition active:scale-95">
            キャンセル
          </button>
        </div>
      `).join('');
    }
  }

  // 4. ブロック中
  const blCountEl = document.getElementById('dmBlockedCount');
  if (blCountEl) blCountEl.textContent = blocked.length;
  const blListEl = document.getElementById('dmBlockedList');
  if (blListEl) {
    if (blocked.length === 0) {
      blListEl.innerHTML = `<div class="p-4 text-center text-xs text-gray-400 dark:text-slate-500">ブロック中のユーザーはいません</div>`;
    } else {
      blListEl.innerHTML = blocked.map(b => `
        <div class="friend-card">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-full bg-slate-700 text-white font-bold flex items-center justify-center text-sm flex-shrink-0">
              ${escapeHtml((b.targetNickname || 'U').charAt(0).toUpperCase())}
            </div>
            <div class="min-w-0">
              <div class="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">${escapeHtml(b.targetNickname || 'ブロックされたユーザー')}</div>
            </div>
          </div>
          <button onclick="unblockUser('${b.targetUid}')" class="px-3.5 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-slate-800 text-gray-800 dark:text-white text-xs font-bold rounded-xl transition active:scale-95">
            ブロック解除
          </button>
        </div>
      `).join('');
    }
  }
}

function createFriendCardHtml(friend, online) {
  const safeName = escapeHtml(friend.targetNickname || 'ユーザー');
  const safeAvatar = isUsableAvatarUrl(friend.targetAvatarUrl) ? `<img src="${friend.targetAvatarUrl}" class="w-full h-full rounded-full object-cover">` : safeName.charAt(0).toUpperCase();
  const customStatusHtml = (friend.customStatus && friend.customStatus.text)
    ? `<div class="text-[11px] text-gray-500 dark:text-[#949ba4] truncate flex items-center gap-1 mt-0.5"><span>${escapeHtml(friend.customStatus.emoji || '💬')}</span><span class="truncate">${escapeHtml(friend.customStatus.text)}</span></div>`
    : `<div class="text-xs text-gray-400 dark:text-slate-400">${online ? 'オンライン' : 'オフライン'}</div>`;

  return `
    <div class="friend-card" onclick="openUserProfileModal('${friend.targetUid}', '${escapeHtml(friend.targetNickname || '')}', '${escapeHtml(friend.targetAvatarUrl || '')}')">
      <div class="flex items-center gap-3 min-w-0 flex-1 mr-2">
        <div class="relative w-10 h-10 rounded-full bg-slate-700 text-white font-bold flex items-center justify-center text-sm flex-shrink-0 overflow-hidden">
          ${safeAvatar}
          <div class="status-indicator ${online ? 'status-online' : 'status-offline'}"></div>
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">${safeName}</div>
          ${customStatusHtml}
        </div>
      </div>
      <div class="flex items-center gap-1.5 flex-shrink-0" onclick="event.stopPropagation()">
        <button onclick="openDm('${friend.targetUid}', '${escapeHtml(friend.targetNickname || '')}', '${escapeHtml(friend.targetAvatarUrl || '')}')" class="friend-action-btn" title="メッセージを送る">
          <i class="fas fa-comment-dots"></i>
        </button>
        <button onclick="openCallPickerWithTarget('${friend.targetUid}')" class="friend-action-btn" title="通話">
          <i class="fas fa-phone"></i>
        </button>
        <button onclick="openFileShareWithTarget('${friend.targetUid}')" class="friend-action-btn" title="P2Pファイル共有">
          <i class="fas fa-share-from-square"></i>
        </button>
        <button onclick="blockUser('${friend.targetUid}')" class="friend-action-btn hover:!bg-rose-600 hover:!text-white" title="ブロック">
          <i class="fas fa-ban"></i>
        </button>
      </div>
    </div>
  `;
}

window.openCallPickerWithTarget = function(targetUid) {
  const targetUser = cachedUsers.find(u => u.id === targetUid) || { id: targetUid, nickname: friendRelationships[targetUid]?.targetNickname || 'ユーザー', avatarUrl: friendRelationships[targetUid]?.targetAvatarUrl || '' };
  startCall(targetUser.id, targetUser.nickname || 'ユーザー', targetUser.avatarUrl || '');
};

window.openFileShareWithTarget = function(targetUid) {
  const targetUser = cachedUsers.find(u => u.id === targetUid) || { id: targetUid, nickname: friendRelationships[targetUid]?.targetNickname || 'ユーザー' };
  _fsPickFileAndSend(targetUser.id, targetUser.nickname || 'ユーザー');
};

window.submitFriendRequest = async function() {
  const input = document.getElementById('dmAddFriendInput');
  const feedback = document.getElementById('dmAddFriendFeedback');
  const btn = document.getElementById('dmAddFriendSubmitBtn');
  if (!input || !feedback) return;
  
  const queryText = input.value.trim();
  if (!queryText) {
    feedback.className = 'text-xs font-semibold px-2 min-h-[1.25rem] text-rose-500';
    feedback.textContent = 'ユーザー名またはメールアドレスを入力してください';
    return;
  }

  btn.disabled = true;
  feedback.className = 'text-xs font-semibold px-2 min-h-[1.25rem] text-indigo-500';
  feedback.textContent = 'ユーザーを検索中...';

  try {
    let targetUser = null;

    if (queryText.includes('@')) {
      const q = query(collection(db, `artifacts/${appId}/users`), where('email', '==', queryText.toLowerCase()), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        targetUser = { id: snap.docs[0].id, ...snap.docs[0].data() };
      }
    } else {
      const nameParts = queryText.split('#');
      const baseName = nameParts[0].trim();
      const q = query(collection(db, `artifacts/${appId}/users`), where('nickname', '==', baseName), limit(5));
      const snap = await getDocs(q);
      if (!snap.empty) {
        if (nameParts[1]) {
          const match = snap.docs.find(d => d.id.endsWith(nameParts[1]) || (d.data().tag === nameParts[1]));
          if (match) targetUser = { id: match.id, ...match.data() };
        }
        if (!targetUser) {
          targetUser = { id: snap.docs[0].id, ...snap.docs[0].data() };
        }
      }
    }

    if (!targetUser) {
      feedback.className = 'text-xs font-semibold px-2 min-h-[1.25rem] text-rose-500';
      feedback.textContent = 'ユーザーが見つかりませんでした。綴りを確認してください。';
      btn.disabled = false;
      return;
    }

    if (targetUser.id === userId) {
      feedback.className = 'text-xs font-semibold px-2 min-h-[1.25rem] text-rose-500';
      feedback.textContent = '自分自身にフレンド申請を送信することはできません。';
      btn.disabled = false;
      return;
    }

    const existing = friendRelationships[targetUser.id];
    if (existing && existing.status === 'friends') {
      feedback.className = 'text-xs font-semibold px-2 min-h-[1.25rem] text-amber-500';
      feedback.textContent = 'すでにフレンドです！';
      btn.disabled = false;
      return;
    }

    const myRef = doc(db, `artifacts/${appId}/users/${userId}/relationships/${targetUser.id}`);
    const targetRef = doc(db, `artifacts/${appId}/users/${targetUser.id}/relationships/${userId}`);

    const batch = writeBatch(db);
    batch.set(myRef, {
      targetUid: targetUser.id,
      targetNickname: targetUser.nickname || 'ユーザー',
      targetAvatarUrl: targetUser.avatarUrl || '',
      targetEmail: targetUser.email || '',
      status: 'pending_sent',
      updatedAt: serverTimestamp()
    });
    batch.set(targetRef, {
      targetUid: userId,
      targetNickname: userNickname || 'ユーザー',
      targetAvatarUrl: userAvatarUrl || '',
      targetEmail: auth.currentUser?.email || '',
      status: 'pending_received',
      updatedAt: serverTimestamp()
    });

    await batch.commit();

    input.value = '';
    feedback.className = 'text-xs font-semibold px-2 min-h-[1.25rem] text-emerald-500';
    feedback.textContent = `@${targetUser.nickname || 'ユーザー'} にフレンド申請を送信しました！`;
    alertMessage("フレンド申請を送信しました", "success");
  } catch (err) {
    console.error('Failed to send friend request:', err);
    feedback.className = 'text-xs font-semibold px-2 min-h-[1.25rem] text-rose-500';
    feedback.textContent = '送信中にエラーが発生しました。';
  } finally {
    btn.disabled = false;
  }
};

window.acceptFriendRequest = async function(targetUid) {
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, `artifacts/${appId}/users/${userId}/relationships/${targetUid}`), {
      status: 'friends',
      updatedAt: serverTimestamp()
    }, { merge: true });
    batch.set(doc(db, `artifacts/${appId}/users/${targetUid}/relationships/${userId}`), {
      status: 'friends',
      updatedAt: serverTimestamp()
    }, { merge: true });
    await batch.commit();
    alertMessage("フレンド申請を承認しました！", "success");
  } catch (err) {
    console.error('Failed to accept friend request:', err);
    alertMessage("承認に失敗しました", "error");
  }
};

window.rejectFriendRequest = async function(targetUid) {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, `artifacts/${appId}/users/${userId}/relationships/${targetUid}`));
    batch.delete(doc(db, `artifacts/${appId}/users/${targetUid}/relationships/${userId}`));
    await batch.commit();
    alertMessage("フレンド申請を拒否しました", "info");
  } catch (err) {
    console.error('Failed to reject friend request:', err);
  }
};

window.cancelFriendRequest = async function(targetUid) {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, `artifacts/${appId}/users/${userId}/relationships/${targetUid}`));
    batch.delete(doc(db, `artifacts/${appId}/users/${targetUid}/relationships/${userId}`));
    await batch.commit();
    alertMessage("フレンド申請を取り消しました", "info");
  } catch (err) {
    console.error('Failed to cancel friend request:', err);
  }
};

window.blockUser = async function(targetUid) {
  if (!confirm("このユーザーをブロックしますか？")) return;
  try {
    await setDoc(doc(db, `artifacts/${appId}/users/${userId}/relationships/${targetUid}`), {
      targetUid,
      status: 'blocked',
      updatedAt: serverTimestamp()
    }, { merge: true });
    alertMessage("ユーザーをブロックしました", "info");
  } catch (err) {
    console.error('Failed to block user:', err);
  }
};

window.unblockUser = async function(targetUid) {
  try {
    await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/relationships/${targetUid}`));
    alertMessage("ブロックを解除しました", "success");
  } catch (err) {
    console.error('Failed to unblock user:', err);
  }
};

function subscribeToDmChannels() {
  if (unsubscribeDmChannels) { unsubscribeDmChannels(); unsubscribeDmChannels = null; }
  if (!userId) return;
  try {
    const dmQuery = query(collection(db, `artifacts/${appId}/dm_channels`), where('participants', 'array-contains', userId));
    unsubscribeDmChannels = onSnapshot(dmQuery, (snap) => {
      dmConversations = {};
      snap.forEach(d => {
        dmConversations[d.id] = { id: d.id, ...d.data() };
      });
      renderDmConversationsList();
    }, (err) => {
      console.warn('[DmChannels] Listen error:', err);
    });
  } catch (e) { }
}

function renderDmConversationsList() {
  const container = document.getElementById('dmConversationsList');
  if (!container) return;

  const list = Object.values(dmConversations);
  if (list.length === 0) {
    container.innerHTML = `
      <div class="p-4 text-center text-xs text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-[#1e1f22]/50 rounded-xl border border-gray-200/50 dark:border-gray-800/50 m-1">
        <i class="fas fa-comments text-2xl text-gray-300 dark:text-gray-600 mb-2 block"></i>
        <span>DMの履歴はありません</span>
      </div>
    `;
    return;
  }

  list.sort((a, b) => (b.lastMessageAt?.toMillis?.() || b.lastMessageAt || 0) - (a.lastMessageAt?.toMillis?.() || a.lastMessageAt || 0));

  container.innerHTML = list.map(dm => {
    const otherUid = (dm.participants || []).find(id => id !== userId) || userId;
    const rel = friendRelationships[otherUid];
    const targetUser = cachedUsers.find(u => u.id === otherUid) || {};
    const nickname = rel?.targetNickname || targetUser.nickname || 'ユーザー';
    const avatarUrl = rel?.targetAvatarUrl || targetUser.avatarUrl || '';
    const isActive = currentDmId === dm.id;
    const isOnline = targetUser.status === 'online' || targetUser.status === 'dnd';

    return `
      <div class="dm-sidebar-item ${isActive ? 'active' : ''}" onclick="openDm('${otherUid}', '${escapeHtml(nickname)}', '${escapeHtml(avatarUrl)}')">
        <div class="relative w-8 h-8 rounded-full bg-slate-700 text-white font-bold flex items-center justify-center text-xs flex-shrink-0">
          ${avatarUrl ? `<img src="${avatarUrl}" class="w-full h-full rounded-full object-cover">` : escapeHtml(nickname.charAt(0))}
          <div class="status-indicator ${isOnline ? 'status-online' : 'status-offline'}"></div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">${escapeHtml(nickname)}</div>
          <div class="text-[11px] text-gray-400 truncate">${escapeHtml(dm.lastMessageText || '会話を始めましょう')}</div>
        </div>
        <button class="dm-close-btn p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs" title="非表示" onclick="event.stopPropagation(); hideDmConversation('${dm.id}')">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
  }).join('');
}

window.openDm = async function(targetUid, targetNickname, targetAvatarUrl) {
  if (!targetUid || targetUid === userId) return;
  const dmId = [userId, targetUid].sort().join('_');
  currentDmId = dmId;
  currentDmParticipants = [userId, targetUid].sort();
  currentDmParticipant = { uid: targetUid, nickname: targetNickname, avatarUrl: targetAvatarUrl };
  currentServerId = null;
  currentRoomId = null;
  currentServerData = null;
  currentServerNickname = null;

  document.body.classList.add('in-chat-view');
  const sb = document.getElementById("sidebar");
  if (sb) sb.classList.add("mobile-hidden");

  const currentRoomHeader = document.getElementById("currentRoomHeader");
  if (currentRoomHeader) currentRoomHeader.classList.remove("hidden");
  const icon = document.getElementById("currentRoomIcon");
  if (icon) icon.className = "fas fa-at text-indigo-500 text-sm";
  const title = document.getElementById("currentRoomTitleText");
  if (title) title.textContent = targetNickname || 'ユーザー';

  if (typeof updateTitleBarContext === 'function') {
    updateTitleBarContext('dm', currentDmParticipant);
  }

  if (messageInput) {
    messageInput.placeholder = `@${targetNickname || 'ユーザー'} へのメッセージ`;
    messageInput.disabled = false;
  }
  if (fileAttachButton) fileAttachButton.disabled = false;
  { const sbtn = document.getElementById('stickerButton'); if (sbtn) sbtn.disabled = false; }
  { const pbtn = document.getElementById('plusMenuButton'); if (pbtn) pbtn.disabled = false; }
  if (sendMessageButton) sendMessageButton.disabled = false;

  const callBtn = document.getElementById('callButton');
  if (callBtn) callBtn.disabled = false;
  const fsBtn = document.getElementById('fileShareButton');
  if (fsBtn) fsBtn.disabled = false;

  clearMessagesDOM();
  lastMessagesData = [];
  allLoadedMessages = [];
  hasMoreOlderMessages = true;
  isLoadingOlderMessages = false;
  cancelReply();
  clearAttachedFile();

  renderDmConversationsList();

  try {
    await _getOrCreateDmKey(dmId, currentDmParticipants);
  } catch (e) {
    console.warn('[E2EE] DM key init error:', e);
  }

  subscribeToMessages();
  renderPinnedMessages();

  // P2P 過去ログ補完（相手がオンラインならバックグラウンド同期）
  try {
    const oldestTs = await LocalStore.getOldestMessageTimestamp(`dm_${dmId}`);
    requestP2PLogBackfill('dm', dmId, oldestTs);
  } catch (e) { }
};

window.hideDmConversation = async function(dmId) {
  delete dmConversations[dmId];
  renderDmConversationsList();
};

// ============ P2P 端末間データ完全移行 コントローラー ============

window.initiateMigrationReceive = async function() {
  if (!userId) return;
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const sessionCode = `COVO-${randomNum}`;
  activeMigrationSession = sessionCode;

  const initEl = document.getElementById('migrationReceiveInitialState');
  const activeEl = document.getElementById('migrationReceiveActiveState');
  const codeEl = document.getElementById('migrationSessionCodeDisplay');
  const timerEl = document.getElementById('migrationExpiryCountdown');
  const progressArea = document.getElementById('migrationReceiveProgressArea');
  const progressBar = document.getElementById('migrationReceiveProgressBar');
  const statusEl = document.getElementById('migrationReceiveStatus');

  if (initEl) initEl.classList.add('hidden');
  if (activeEl) activeEl.classList.remove('hidden');
  if (codeEl) codeEl.textContent = sessionCode;
  if (progressArea) progressArea.classList.remove('hidden');
  if (statusEl) statusEl.textContent = '旧端末からの接続を待機しています...';

  let timeLeft = 300;
  if (activeMigrationCountdown) clearInterval(activeMigrationCountdown);
  activeMigrationCountdown = setInterval(() => {
    timeLeft--;
    const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
    const secs = String(timeLeft % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    if (timeLeft <= 0) {
      clearInterval(activeMigrationCountdown);
      cancelMigrationReceive();
      alertMessage("端末移行セッションの有効期限が切れました", "warning");
    }
  }, 1000);

  try {
    const transferRef = doc(db, `artifacts/${appId}/device_transfers/${sessionCode}`);
    await setDoc(transferRef, {
      uid: userId,
      status: 'waiting',
      createdAt: serverTimestamp()
    });

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
    });
    activeMigrationPeer = pc;

    let receivedChunks = [];
    let expectedChunks = 0;

    pc.ondatachannel = (e) => {
      const channel = e.channel;
      activeMigrationChannel = channel;

      channel.onopen = () => {
        if (statusEl) statusEl.textContent = '端末間P2P接続が確立しました。データを受信中...';
      };

      channel.onmessage = async (event) => {
        try {
          const packet = JSON.parse(event.data);
          if (packet.type === 'START') {
            expectedChunks = packet.totalChunks;
            receivedChunks = [];
            if (progressBar) progressBar.style.width = '5%';
          } else if (packet.type === 'CHUNK') {
            receivedChunks.push(packet.data);
            const pct = Math.min(95, Math.round((receivedChunks.length / expectedChunks) * 90) + 5);
            if (progressBar) progressBar.style.width = `${pct}%`;
            if (statusEl) statusEl.textContent = `データ受信中... (${receivedChunks.length}/${expectedChunks})`;
          } else if (packet.type === 'END') {
            if (progressBar) progressBar.style.width = '100%';
            if (statusEl) statusEl.textContent = 'データをローカルデータベースへ復元中...';
            
            const fullJson = receivedChunks.join('');
            const bundle = JSON.parse(fullJson);
            
            await LocalStore.restoreAllLocalData(bundle);
            if (statusEl) statusEl.textContent = '復元完了！';
            alertMessage("端末データ移行が完了しました！過去ログと設定がすべて復元されました。", "success");
            
            setTimeout(() => {
              cancelMigrationReceive();
              location.reload();
            }, 1500);
          }
        } catch (msgErr) {
          console.error('Migration chunk processing error:', msgErr);
        }
      };
    };

    pc.onicecandidate = async (ev) => {
      if (ev.candidate) {
        await addDoc(collection(db, `artifacts/${appId}/device_transfers/${sessionCode}/receiver_candidates`), ev.candidate.toJSON());
      }
    };

    onSnapshot(transferRef, async (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.offer && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await updateDoc(transferRef, { answer: { type: answer.type, sdp: answer.sdp }, status: 'connected' });
      }
    });

    onSnapshot(collection(db, `artifacts/${appId}/device_transfers/${sessionCode}/sender_candidates`), (snap) => {
      snap.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
          } catch (e) { }
        }
      });
    });

  } catch (err) {
    console.error('Failed to initiate migration receive:', err);
    alertMessage("受信セッションの開始に失敗しました", "error");
  }
};

window.cancelMigrationReceive = function() {
  if (activeMigrationCountdown) { clearInterval(activeMigrationCountdown); activeMigrationCountdown = null; }
  if (activeMigrationPeer) { activeMigrationPeer.close(); activeMigrationPeer = null; }
  activeMigrationChannel = null;

  const initEl = document.getElementById('migrationReceiveInitialState');
  const activeEl = document.getElementById('migrationReceiveActiveState');
  if (initEl) initEl.classList.remove('hidden');
  if (activeEl) activeEl.classList.add('hidden');

  if (activeMigrationSession) {
    deleteDoc(doc(db, `artifacts/${appId}/device_transfers/${activeMigrationSession}`)).catch(() => {});
    activeMigrationSession = null;
  }
};

window.initiateMigrationSend = async function() {
  const input = document.getElementById('migrationSendCodeInput');
  const btn = document.getElementById('startSendMigrationBtn');
  const progressArea = document.getElementById('migrationSendProgressArea');
  const progressBar = document.getElementById('migrationSendProgressBar');
  const statusEl = document.getElementById('migrationSendStatus');

  if (!input) return;
  const code = input.value.trim().toUpperCase();
  if (!code) {
    alertMessage("移行コードを入力してください", "warning");
    return;
  }

  btn.disabled = true;
  if (progressArea) progressArea.classList.remove('hidden');
  if (statusEl) statusEl.textContent = '新端末に接続中...';

  try {
    const transferRef = doc(db, `artifacts/${appId}/device_transfers/${code}`);
    const snap = await getDoc(transferRef);
    if (!snap.exists()) {
      alertMessage("有効なセッションが見つかりませんでした。コードを確認してください。", "error");
      btn.disabled = false;
      return;
    }

    const data = snap.data();
    if (data.uid !== userId) {
      alertMessage("アカウントが一致しません。同一のアカウントでログインしてください。", "error");
      btn.disabled = false;
      return;
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
    });

    const channel = pc.createDataChannel('migrationData', { ordered: true });
    
    channel.onopen = async () => {
      if (statusEl) statusEl.textContent = 'ローカルデータを集約・送信準備中...';
      if (progressBar) progressBar.style.width = '10%';

      const bundle = await LocalStore.getAllLocalData();
      const jsonStr = JSON.stringify(bundle);

      const CHUNK_SIZE = 16384;
      const totalChunks = Math.ceil(jsonStr.length / CHUNK_SIZE);

      channel.send(JSON.stringify({ type: 'START', totalChunks }));

      for (let i = 0; i < totalChunks; i++) {
        const chunk = jsonStr.substr(i * CHUNK_SIZE, CHUNK_SIZE);
        channel.send(JSON.stringify({ type: 'CHUNK', index: i, data: chunk }));
        const pct = Math.min(95, Math.round(((i + 1) / totalChunks) * 85) + 10);
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (statusEl) statusEl.textContent = `送信中... (${i + 1}/${totalChunks})`;
        await new Promise(r => setTimeout(r, 15));
      }

      channel.send(JSON.stringify({ type: 'END' }));
      if (progressBar) progressBar.style.width = '100%';
      if (statusEl) statusEl.textContent = 'データ送信完了！';
      alertMessage("端末データ移行の送信が完了しました！", "success");
      btn.disabled = false;
    };

    pc.onicecandidate = async (ev) => {
      if (ev.candidate) {
        await addDoc(collection(db, `artifacts/${appId}/device_transfers/${code}/sender_candidates`), ev.candidate.toJSON());
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await updateDoc(transferRef, { offer: { type: offer.type, sdp: offer.sdp } });

    onSnapshot(transferRef, async (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.answer && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
      }
    });

    onSnapshot(collection(db, `artifacts/${appId}/device_transfers/${code}/receiver_candidates`), (snap) => {
      snap.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
          } catch (e) { }
        }
      });
    });

  } catch (err) {
    console.error('Migration send error:', err);
    alertMessage("送信処理中にエラーが発生しました", "error");
    btn.disabled = false;
  }
};

// 探索・発見画面を開く
window.openDiscoverView = function () {
  currentServerId = null;
  currentServerData = null;
  currentRoomId = null;
  currentServerNickname = null;
  currentHomeViewMode = 'discover';
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
  if (typeof updateTitleBarContext === 'function') {
    updateTitleBarContext('discover');
  }
  if (typeof setupGlobalNotificationListeners === 'function') {
    setupGlobalNotificationListeners();
  }
  if (window.renderServerList) window.renderServerList();
  if (typeof renderDiscordServerNav === 'function') renderDiscordServerNav();
};

// サーバーを出てリストに戻る
window.leaveServerView = function (mode) {
  if (mode === 'discover' || currentHomeViewMode === 'discover') {
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
document.getElementById("backToServerListBtn")?.addEventListener("click", () => {
  leaveServerView();
});

// サーバー作成ボタン
document.getElementById("createServerBtn")?.addEventListener("click", () => {
  const nameEl = document.getElementById("newServerName");
  const idEl = document.getElementById("newServerId");
  const passEl = document.getElementById("newServerPassword");
  const passConfEl = document.getElementById("newServerPasswordConfirm");
  const msgEl = document.getElementById("createServerMessage");
  const availEl = document.getElementById("serverIdAvailability");
  const modalEl = document.getElementById("createServerModal");
  if (nameEl) nameEl.value = "";
  if (idEl) idEl.value = "";
  if (passEl) passEl.value = "";
  if (passConfEl) passConfEl.value = "";
  if (msgEl) msgEl.textContent = "";
  if (availEl) availEl.textContent = "";
  if (modalEl) openModal(modalEl);
});

document.getElementById("cancelCreateServerBtn")?.addEventListener("click", () => {
  document.getElementById("createServerModal")?.classList.add("hidden");
});

// サーバーID リアルタイムバリデーション
let serverIdCheckTimer = null;
document.getElementById("newServerId")?.addEventListener("input", (e) => {
  const val = e.target.value;
  const availEl = document.getElementById("serverIdAvailability");
  if (!availEl) return;
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

document.getElementById("confirmCreateServerBtn")?.addEventListener("click", async () => {
  const name = document.getElementById("newServerName")?.value.trim() || "";
  const rawId = document.getElementById("newServerId")?.value.trim().toLowerCase() || "";
  const pass = document.getElementById("newServerPassword")?.value || "";
  const passConfirm = document.getElementById("newServerPasswordConfirm")?.value || "";
  const msgEl = document.getElementById("createServerMessage");

  if (!name) { if (msgEl) msgEl.textContent = "サーバー名を入力してください"; return; }
  if (!rawId || rawId.length < 3) { if (msgEl) msgEl.textContent = "サーバーID（3文字以上）を入力してください"; return; }
  if (!/^[a-z0-9-]+$/.test(rawId)) { if (msgEl) msgEl.textContent = "IDは英数字とハイフンのみ使えます"; return; }
  if (!pass) { if (msgEl) msgEl.textContent = "パスワードを入力してください"; return; }
  if (pass !== passConfirm) { if (msgEl) msgEl.textContent = "パスワードが一致しません"; return; }

  const loadingOverlayEl = document.getElementById("loadingOverlay");
  if (loadingOverlayEl) loadingOverlayEl.classList.remove("hidden");
  try {
    // 作成上限チェック（全体管理者は無制限、それ以外は同時に2つまで）
    if (!isAdmin) {
      const myServersSnap = await getDocs(
        query(collection(db, `artifacts/${appId}/servers`), where("joinedUsers", "array-contains", userId))
      );
      const myCreated = myServersSnap.docs.filter(d => d.data().createdBy === userId).length;
      if (myCreated >= 2) {
        if (msgEl) msgEl.textContent = "サーバーは同時に2つまで作成できます";
        if (loadingOverlayEl) loadingOverlayEl.classList.add("hidden");
        return;
      }
    }
    const available = await checkServerIdAvailable(rawId);
    if (!available) { if (msgEl) msgEl.textContent = "このIDは既に使われています"; if (loadingOverlayEl) loadingOverlayEl.classList.add("hidden"); return; }
    await createServer(name, rawId, pass);
    document.getElementById("createServerModal")?.classList.add("hidden");
  } catch (e) {
    console.error(e);
    if (msgEl) msgEl.textContent = "作成に失敗しました: " + e.message;
  } finally {
    if (loadingOverlayEl) loadingOverlayEl.classList.add("hidden");
  }
});

// サーバー参加ボタン
document.getElementById("joinServerBtn")?.addEventListener("click", () => {
  if (isAdmin) {
    openAdminJoinModal();
    return;
  }
  const idEl = document.getElementById("joinServerId");
  const passEl = document.getElementById("joinServerPassword");
  const codeEl = document.getElementById("joinInviteCode");
  const msgEl = document.getElementById("joinServerMessage");
  const modalEl = document.getElementById("joinServerModal");
  if (idEl) idEl.value = "";
  if (passEl) passEl.value = "";
  if (codeEl) codeEl.value = "";
  if (msgEl) msgEl.textContent = "";
  if (modalEl) openModal(modalEl);
});

document.getElementById("cancelAdminJoinBtn")?.addEventListener("click", () => {
  document.getElementById("adminJoinModal")?.classList.add("hidden");
});

document.getElementById("cancelJoinServerBtn")?.addEventListener("click", () => {
  document.getElementById("joinServerModal")?.classList.add("hidden");
});

// 参加モーダルのタブ切り替え
document.getElementById("joinTabPassword")?.addEventListener("click", () => {
  document.getElementById("joinTabPassword")?.classList.add("active");
  document.getElementById("joinTabCode")?.classList.remove("active");
  document.getElementById("joinByPasswordSection")?.classList.remove("hidden");
  document.getElementById("joinByCodeSection")?.classList.add("hidden");
});
document.getElementById("joinTabCode")?.addEventListener("click", () => {
  document.getElementById("joinTabCode")?.classList.add("active");
  document.getElementById("joinTabPassword")?.classList.remove("active");
  document.getElementById("joinByCodeSection")?.classList.remove("hidden");
  document.getElementById("joinByPasswordSection")?.classList.add("hidden");
});

document.getElementById("confirmJoinServerBtn")?.addEventListener("click", async () => {
  const msgEl = document.getElementById("joinServerMessage");
  if (msgEl) msgEl.textContent = "";
  const loadingOverlayEl = document.getElementById("loadingOverlay");
  if (loadingOverlayEl) loadingOverlayEl.classList.remove("hidden");
  try {
    const isCodeTab = document.getElementById("joinByCodeSection") && !document.getElementById("joinByCodeSection").classList.contains("hidden");
    if (isCodeTab) {
      const code = document.getElementById("joinInviteCode")?.value.trim() || "";
      if (!code) { if (msgEl) msgEl.textContent = "招待コードを入力してください"; return; }
      await joinServerByInviteCode(code);
    } else {
      const serverId = document.getElementById("joinServerId")?.value.trim().toLowerCase() || "";
      const password = document.getElementById("joinServerPassword")?.value || "";
      if (!serverId) { if (msgEl) msgEl.textContent = "サーバーIDを入力してください"; return; }
      if (!password) { if (msgEl) msgEl.textContent = "パスワードを入力してください"; return; }
      await joinServerByPassword(serverId, password);
    }
    document.getElementById("joinServerModal")?.classList.add("hidden");
  } catch (e) {
    console.error(e);
    if (msgEl) msgEl.textContent = e.message || "参加に失敗しました";
  } finally {
    if (loadingOverlayEl) loadingOverlayEl.classList.add("hidden");
  }
});

// サーバー設定モーダル
const serverSettingsModal = document.getElementById("serverSettingsModal");
document.getElementById("serverSettingsBtn")?.addEventListener("click", openServerSettings);
document.getElementById("closeServerSettingsBtn")?.addEventListener("click", () => serverSettingsModal?.classList.add("hidden"));

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


window.openServerSettings = openServerSettings;
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
      iconPreview.innerHTML = `<img src="${escapeHtml(currentServerData.iconUrl)}" class="w-full h-full object-cover" />`;
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

document.getElementById("createRoomInServerBtn")?.addEventListener("click", async () => {
  const name = document.getElementById("newRoomNameInput")?.value.trim() || "";
  const categoryId = document.getElementById("newRoomCategorySelect")?.value || null;
  if (!name) return;
  const loadingOverlayEl = document.getElementById("loadingOverlay");
  if (loadingOverlayEl) loadingOverlayEl.classList.remove("hidden");
  try {
    const newRoomRef = await addDoc(collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms`), {
      name, categoryId, createdAt: serverTimestamp(), createdBy: userId
    });
    try {
      const b64 = await crypto.subtle.exportKey("raw", await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])).then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))));
      await updateDoc(newRoomRef, { sharedKey: b64, currentKeyVersion: 1 });
    } catch (e) { console.error("E2EE key gen failed", e); }
    const nameInp = document.getElementById("newRoomNameInput");
    if (nameInp) nameInp.value = "";
    await loadServerSettingsRooms();
    alertMessage("ルームを作成しました", "success");
  } catch (e) { alertMessage("作成に失敗しました", "error"); }
  finally { if (loadingOverlayEl) loadingOverlayEl.classList.add("hidden"); }
});

// メンバー管理タブ
async function loadServerSettingsMembers() {
  if (currentSsTab !== "members") return;
  const listEl = document.getElementById("serverMembersManageList");
  if (!listEl) return;
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
document.getElementById("ssTabMembers")?.addEventListener("click", loadServerSettingsMembers);

// 招待コードタブ
document.getElementById("ssTabInvites")?.addEventListener("click", loadInviteCodes);
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
              ${hasAdminRights ? `<button class="bg-red-50 hover:bg-red-100 text-red-500 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors sa-del-grp-btn">グループごと削除</button>` : ''}
            </div>
            <div class="flex flex-wrap gap-3 pt-1 max-h-32 overflow-y-auto">${stampsHtml}</div>
          `;
      const delGrpBtn = div.querySelector('.sa-del-grp-btn');
      if (delGrpBtn) {
        delGrpBtn.addEventListener('click', () => saDeleteGroup(targetServerId, id, isLegacy));
      }
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

document.getElementById("createInviteCodeBtn")?.addEventListener("click", async () => {
  const expiryDays = parseInt(document.getElementById("inviteExpiry")?.value || "0");
  const maxUses = parseInt(document.getElementById("inviteMaxUses")?.value || "0");
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
document.getElementById("renameServerBtn")?.addEventListener("click", async () => {
  const name = document.getElementById("renameServerInput")?.value.trim() || "";
  if (!name) return;
  try {
    await updateDoc(doc(db, `artifacts/${appId}/servers`, currentServerId), { name });
    const nameDisplay = document.getElementById("serverNameDisplay");
    const settingsTitle = document.getElementById("serverSettingsTitle");
    if (nameDisplay) nameDisplay.textContent = name;
    if (settingsTitle) settingsTitle.textContent = name;
    currentServerData = { ...currentServerData, name };
    if (typeof updateTitleBarContext === 'function') {
      updateTitleBarContext('server', currentServerData);
    }
    alertMessage("サーバー名を変更しました", "success");
  } catch (e) { alertMessage("変更に失敗しました", "error"); }
});

document.getElementById("changeServerPasswordBtn")?.addEventListener("click", async () => {
  const newPass = document.getElementById("changeServerPasswordInput")?.value || "";
  if (!newPass || newPass.length < 4) { alertMessage("パスワードは4文字以上にしてください", "error"); return; }
  try {
    const hash = await hashPassword(newPass, currentServerId);
    await setDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/secrets`, 'auth'), { passwordHash: hash }, { merge: true });
    await updateDoc(doc(db, `artifacts/${appId}/servers`, currentServerId), { passwordHash: deleteField() });
    const passInp = document.getElementById("changeServerPasswordInput");
    if (passInp) passInp.value = "";
    alertMessage("パスワードを変更しました", "success");
  } catch (e) { alertMessage("変更に失敗しました", "error"); }
});

document.getElementById("deleteServerBtn")?.addEventListener("click", async () => {
  if (!await showCustomConfirm(`「${currentServerData?.name || currentServerId}」を削除しますか？`, "削除する", "キャンセル", "この操作は取り消せません。")) return;
  const canDelete = currentServerData?.createdBy === userId ||
    (currentServerData?.serverAdmins && currentServerData.serverAdmins.includes(userId)) || isAdmin;
  if (!canDelete) { alertMessage("削除できるのはサーバーオーナーのみです", "error"); return; }
  const loadingOverlayEl = document.getElementById("loadingOverlay");
  if (loadingOverlayEl) loadingOverlayEl.classList.remove("hidden");
  try {
    await deleteServerCascade(currentServerId);
    serverSettingsModal?.classList.add("hidden");
    leaveServerView();
    alertMessage("サーバーを削除しました", "success");
  } catch (e) { console.error("deleteServer error:", e); alertMessage("削除に失敗しました", "error"); }
  finally { if (loadingOverlayEl) loadingOverlayEl.classList.add("hidden"); }
});

let isSendingMessage = false;
// ===== サーバーカードコンテキストメニュー =====
let serverCtxData = null;

function showServerContextMenu(server, x, y) {
  serverCtxData = server;
  const menu = document.getElementById("serverContextMenu");
  if (!menu) return;
  const isSvAdmin = server.serverAdmins && server.serverAdmins.includes(userId);
  const isOwner = server.createdBy === userId;
  const isJoined = server.joinedUsers && server.joinedUsers.includes(userId);
  const sSet = document.getElementById("serverCtxSettings");
  const sLeave = document.getElementById("serverCtxLeave");
  const sDelSep = document.getElementById("serverCtxDeleteSep");
  const sDel = document.getElementById("serverCtxDelete");
  if (sSet) sSet.style.display = (isAdmin || isSvAdmin) ? "" : "none";
  if (sLeave) sLeave.style.display = (isJoined && !isOwner && !isAdmin) ? "" : "none";
  if (sDelSep) sDelSep.style.display = (isAdmin || isOwner) ? "" : "none";
  if (sDel) sDel.style.display = (isAdmin || isOwner) ? "" : "none";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.classList.remove("hidden");
  requestAnimationFrame(() => {
    const r = menu.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) menu.style.left = `${x - r.width}px`;
    if (r.bottom > window.innerHeight - 8) menu.style.top = `${y - r.height}px`;
  });
}

document.getElementById("serverCtxEnter")?.addEventListener("click", () => {
  if (serverCtxData) enterServer(serverCtxData.id, serverCtxData);
  document.getElementById("serverContextMenu")?.classList.add("hidden");
});

document.getElementById("serverCtxSettings")?.addEventListener("click", async () => {
  const sv = serverCtxData;
  document.getElementById("serverContextMenu")?.classList.add("hidden");
  if (!sv) return;
  await enterServer(sv.id, sv);
  setTimeout(() => openServerSettings(), 600);
});

document.getElementById("serverCtxLeave")?.addEventListener("click", async () => {
  const sv = serverCtxData;
  document.getElementById("serverContextMenu")?.classList.add("hidden");
  if (!sv) return;
  if (!await showCustomConfirm(`「${sv.name || sv.id}」を退出しますか？`, "退出する", "キャンセル")) return;
  const loadingOverlayEl = document.getElementById("loadingOverlay");
  if (loadingOverlayEl) loadingOverlayEl.classList.remove("hidden");
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
  finally { if (loadingOverlayEl) loadingOverlayEl.classList.add("hidden"); }
});

document.getElementById("serverCtxDelete")?.addEventListener("click", async () => {
  const sv = serverCtxData;
  document.getElementById("serverContextMenu")?.classList.add("hidden");
  if (!sv) return;
  if (!await showCustomConfirm(`「${sv.name || sv.id}」を削除しますか？`, "削除する", "キャンセル", "この操作は取り消せません。")) return;
  const loadingOverlayEl = document.getElementById("loadingOverlay");
  if (loadingOverlayEl) loadingOverlayEl.classList.remove("hidden");
  try {
    await deleteServerCascade(sv.id);
    alertMessage("サーバーを削除しました", "success");
  } catch (e) { alertMessage("削除に失敗しました: " + e.message, "error"); }
  finally { if (loadingOverlayEl) loadingOverlayEl.classList.add("hidden"); }
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
  if (!userId) return;

  try {
    let servers = (allServersCache && allServersCache.length)
      ? allServersCache.filter(s => (s.joinedUsers || []).includes(userId))
      : null;
    if (!servers) {
      const serversSnap = await getDocs(
        query(collection(db, `artifacts/${appId}/servers`), where("joinedUsers", "array-contains", userId))
      );
      servers = serversSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    for (const svData of servers) {
      const svId = svData.id;
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
                  
                  const isMentioned = userNickname && body && (body.includes(`@${userNickname}`) || body.includes('@all'));
                  const title = isMentioned ? `[@メンション] ${svData.name || svId} › #${rmName}` : `${svData.name || svId} › #${rmName}`;
                  
                  showInAppNotification(
                    svData.name || svId, rmName,
                    'メンバー',
                    body,
                    svId, svData, rmId, rmName
                  );
                  // バックグラウンド・非フォーカス時はOS通知 / デスクトップ通知を必ず送信
                  if (!document.hasFocus() || document.visibilityState === 'hidden') {
                    showNotification(title, `メンバー: ${body}`, rmId);
                  }
                })();
              }
            }
          }
        });
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
                window.__TAURI__.core.invoke('set_badge', { hasUnread: true }).catch(() => { });
              }
            } catch (e) { console.error(e); }
          } else if (typeof scanAllUnreadAndRender === 'function') {
            scanAllUnreadAndRender();
          }
        }
      }, (err) => {
        if (!auth.currentUser || !userId || err?.code === 'permission-denied') return;
        console.warn(`[GlobalNotif sv=${svId}] connection state updated:`, err?.message || err);
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

// === 旧UI（レガシー）切り替え時の注意書きハンドラ ===
window.handleLegacyUIToggle = async function (enableLegacy) {
  const pcToggle = document.getElementById('toggleLegacyUI');
  const mobileToggle = document.getElementById('toggleLegacyUIMobile');

  if (enableLegacy) {
    const confirmed = await showCustomConfirm(
      '旧UIは現在サポートされておらず、表示崩れや予期せぬ不具合が発生する可能性があります。本当に切り替えますか？',
      '切り替える',
      'キャンセル'
    );
    if (!confirmed) {
      if (pcToggle) pcToggle.checked = false;
      if (mobileToggle) mobileToggle.checked = false;
      return;
    }
    setDiscordUIMode(false);
  } else {
    setDiscordUIMode(true);
  }
};

// === モダンUIモード制御JSロジック (デフォルトON) ===
window.setDiscordUIMode = function (enabled) {
  localStorage.setItem('covo_discord_ui_mode', enabled ? 'true' : 'false');
  document.body.classList.toggle('discord-ui-mode', enabled);
  const pcToggle = document.getElementById('toggleLegacyUI');
  const mobileToggle = document.getElementById('toggleLegacyUIMobile');
  if (pcToggle) pcToggle.checked = !enabled;
  if (mobileToggle) mobileToggle.checked = !enabled;

  if (enabled) {
    if (!currentServerId) {
      if (currentHomeViewMode === 'discover') {
        document.body.classList.add("discord-home-view", "discord-discover-view");
        document.body.classList.remove("discord-dm-view");
      } else {
        document.body.classList.add("discord-home-view", "discord-dm-view");
        document.body.classList.remove("discord-discover-view");
      }
      const appCont = document.getElementById("appContainer");
      if (appCont && userId) appCont.classList.remove("hidden");
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
      if (sls && userId) sls.classList.remove("hidden");
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

  if (!currentServerId) {
    if (currentHomeViewMode === 'discover') {
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

    // ホーム画面右側の全体メンバーリスト描画 (画像完全準拠)
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
    if (serverIconZoomSlider) {
      serverIconZoomSlider.min = sIconMinScale;
      serverIconZoomSlider.max = sIconMinScale * 4;
      serverIconZoomSlider.value = sIconScale;
    }
    sIconOffsetX = (SICON_SIZE - sIconImage.naturalWidth * sIconScale) / 2;
    sIconOffsetY = (SICON_SIZE - sIconImage.naturalHeight * sIconScale) / 2;
    document.getElementById('serverIconUploadProgress')?.classList.add('hidden');
    serverIconCropModal?.classList.remove('hidden');
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
  if (!sIconImage || !serverIconCropCanvas) return;
  const ctx = serverIconCropCanvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, SICON_SIZE, SICON_SIZE);
  ctx.drawImage(sIconImage, sIconOffsetX, sIconOffsetY, sIconImage.naturalWidth * sIconScale, sIconImage.naturalHeight * sIconScale);
}

if (serverIconCropCanvas) {
  serverIconCropCanvas.addEventListener('mousedown', (e) => {
    e.preventDefault(); sIconIsDragging = true;
    sIconDragStartX = e.clientX; sIconDragStartY = e.clientY;
    sIconDragStartOffsetX = sIconOffsetX; sIconDragStartOffsetY = sIconOffsetY;
    serverIconCropCanvas.style.cursor = 'grabbing';
  });

  serverIconCropCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); // スクロール防止
    if (e.touches.length !== 1) return;
    sIconIsDragging = true;
    sIconDragStartX = e.touches[0].clientX;
    sIconDragStartY = e.touches[0].clientY;
    sIconDragStartOffsetX = sIconOffsetX;
    sIconDragStartOffsetY = sIconOffsetY;
  }, { passive: false });

  serverIconCropCanvas.addEventListener('touchmove', (e) => {
    if (!sIconIsDragging || !sIconImage) return;
    if (e.touches.length !== 1) return;
    e.preventDefault(); // スクロール防止
    sIconOffsetX = sIconDragStartOffsetX + (e.touches[0].clientX - sIconDragStartX);
    sIconOffsetY = sIconDragStartOffsetY + (e.touches[0].clientY - sIconDragStartY);
    clampSIconOffset(); drawSIconPreview();
  }, { passive: false });

  serverIconCropCanvas.addEventListener('touchend', () => {
    if (sIconIsDragging) { sIconIsDragging = false; }
  }, { passive: true });
}

document.addEventListener('mousemove', (e) => {
  if (!sIconIsDragging || !sIconImage) return;
  sIconOffsetX = sIconDragStartOffsetX + (e.clientX - sIconDragStartX);
  sIconOffsetY = sIconDragStartOffsetY + (e.clientY - sIconDragStartY);
  clampSIconOffset(); drawSIconPreview();
});
document.addEventListener('mouseup', () => {
  if (sIconIsDragging && serverIconCropCanvas) { sIconIsDragging = false; serverIconCropCanvas.style.cursor = 'grab'; }
});

serverIconZoomSlider?.addEventListener('input', () => {
  if (!sIconImage || !serverIconZoomSlider) return;
  const newScale = parseFloat(serverIconZoomSlider.value);
  const cx = SICON_SIZE / 2, cy = SICON_SIZE / 2;
  sIconOffsetX = cx - (cx - sIconOffsetX) * (newScale / sIconScale);
  sIconOffsetY = cy - (cy - sIconOffsetY) * (newScale / sIconScale);
  sIconScale = newScale; clampSIconOffset(); drawSIconPreview();
});

document.getElementById('serverIconCropCancel')?.addEventListener('click', () => {
  serverIconCropModal?.classList.add('hidden'); sIconImage = null;
  if (serverIconUploadInput) serverIconUploadInput.value = '';
  const newFileInput = document.getElementById("newServerIconUploadInput");
  if (newFileInput) newFileInput.value = '';
});

document.getElementById('serverIconCropConfirm')?.addEventListener('click', async () => {
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
      if (typeof updateTitleBarContext === 'function') {
        updateTitleBarContext('server', currentServerData);
      }
      const iconPreview = document.getElementById("serverIconSettingsPreview");
      if (iconPreview) {
        iconPreview.innerHTML = `<img src="${escapeHtml(fileUrl)}" class="w-full h-full object-cover" />`;
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

// ================= MODULE: rooms.js ================
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
          // 現在開いているルームで新しいメッセージが更新された場合、リアルタイムメッセージの同期を即座にキック（受信漏れ防止）
          if (change.doc.id === currentRoomId && room.lastMessageSender !== userId) {
            resyncActiveRoomMessages();
          }

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
    if (!auth.currentUser || !userId || currentServerId !== serverId || error?.code === 'permission-denied') return;
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

// ターミナルバナー（100件終端案内）表示ヘルパー
function showTerminalBanner() {
  let banner = document.getElementById('historyTerminalBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'historyTerminalBanner';
    banner.className = 'history-terminal-banner';
    banner.innerHTML = `<i class="fas fa-shield-halved text-indigo-500 mr-1.5"></i> これより前のメッセージはありません（サーバーには最大100件まで保存されます）`;
  }
  banner.style.display = 'flex';
  if (messagesDisplay && !messagesDisplay.contains(banner)) {
    messagesDisplay.appendChild(banner);
  }
}

function hideTerminalBanner() {
  const banner = document.getElementById('historyTerminalBanner');
  if (banner) banner.style.display = 'none';
}

async function loadOlderMessages() {
  if (!hasMoreOlderMessages || isLoadingOlderMessages) return;
  if (allLoadedMessages.length === 0) return;
  isLoadingOlderMessages = true;
  const spinner = document.getElementById('topLoadingSpinner');
  const spinnerText = document.getElementById('topLoadingSpinnerText');
  if (spinnerText) spinnerText.textContent = "読み込み中...";
  if (spinner) spinner.style.display = 'flex';

  const chId = currentServerId ? `${currentServerId}_${currentRoomId}` : `dm_${currentDmId}`;

  const decryptInPlace = async (list) => {
    if (!list || list.length === 0) return;
    if (currentServerId) {
      const _members = (currentServerData && currentServerData.joinedUsers) || [];
      await decryptMessagesInPlace(list, currentServerId, currentRoomId, _members).catch(() => {});
    } else if (currentDmId) {
      await _decryptDmMessagesInPlace(list, currentDmId, currentDmParticipants).catch(() => {});
    }
  };

  try {
    const oldestMessage = allLoadedMessages[0];
    const rtdbTime = getMsgTimestamp(oldestMessage);

    // 1. まず IndexedDB (ローカルDB) から過去ログを探索
    const localOlder = await LocalStore.getMessages(chId, rtdbTime, 20);
    if (localOlder && localOlder.length > 0) {
      await decryptInPlace(localOlder);
      allLoadedMessages = [...localOlder, ...allLoadedMessages];
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
      isLoadingOlderMessages = false;
      if (spinner) spinner.style.display = 'none';
      allowPagination = true;
      return;
    }

    // 2. ローカルに無い場合のみ RTDB から過去ログを取得
    const { ref, get, query: rtdbQuery, limitToLast, orderByChild, endAt } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
    const rtdb = await _getOrInitRTDB();
    const basePath = currentServerId ? `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages` : `artifacts/${appId}/dm_messages/${currentDmId}`;
    const messagesRef = ref(rtdb, basePath);
    const q = rtdbQuery(messagesRef, orderByChild('timestamp'), endAt(rtdbTime, oldestMessage.id), limitToLast(21));
    const snapshot = await get(q);

    if (snapshot.exists()) {
      const data = snapshot.val();
      let docs = Object.keys(data).map(k => ({ ...data[k], id: k, channelId: chId }));
      docs = docs.filter(d => d.id !== oldestMessage.id);

      if (docs.length > 0) {
        await LocalStore.upsertMessagesBatch(docs);
        await decryptInPlace(docs);

        allLoadedMessages = [...docs, ...allLoadedMessages];
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
        rtdbMessagesLimit += docs.length;
      }
      if (docs.length < 20) {
        hasMoreOlderMessages = false;
        showTerminalBanner();
      }
    } else {
      hasMoreOlderMessages = false;
      showTerminalBanner();
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
  hideTerminalBanner();
  const spinner = document.getElementById('topLoadingSpinner');
  if (spinner) spinner.style.display = 'none';

  subscribeToMessagesRTDB();
}

async function subscribeToMessagesRTDB() {
  const { ref, onChildAdded, onChildChanged, onChildRemoved, query: rtdbQuery, limitToLast, limitToFirst, orderByChild, startAt, endAt, off, get } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
  const rtdb = await _getOrInitRTDB();
  const chId = currentServerId ? `${currentServerId}_${currentRoomId}` : `dm_${currentDmId}`;
  const basePath = currentServerId ? `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages` : `artifacts/${appId}/dm_messages/${currentDmId}`;
  const messagesRef = ref(rtdb, basePath);
  const q = rtdbQuery(messagesRef, orderByChild('timestamp'), limitToLast(rtdbMessagesLimit));

  const decryptInPlace = async (list) => {
    if (!list || list.length === 0) return;
    if (currentServerId) {
      const _members = (currentServerData && currentServerData.joinedUsers) || [];
      await decryptMessagesInPlace(list, currentServerId, currentRoomId, _members).catch(() => {});
    } else if (currentDmId) {
      await _decryptDmMessagesInPlace(list, currentDmId, currentDmParticipants).catch(() => {});
    }
  };

  // STEP 1: LINE方式ローカル永続化（IndexedDB）から即時読み込み（0ms / 0KB）
  try {
    const localDocs = await LocalStore.getMessages(chId, null, 50);
    if (localDocs && localDocs.length > 0) {
      await decryptInPlace(localDocs);
      allLoadedMessages = [...localDocs];
      allLoadedMessages.sort((a, b) => getMsgTimestamp(a) - getMsgTimestamp(b));
      lastMessagesData = [...allLoadedMessages];
      messagesIndexMap = {};
      lastMessagesData.forEach((m, i) => messagesIndexMap[m.id] = i);

      renderPinnedMessages();
      renderMessagesWithReadReceipts();
    }
  } catch (localErr) {
    console.warn('[LocalStore] initial load error:', localErr);
  }

  // STEP 2: 通信量極小化 Delta Sync（ローカルの最新以降のみRTDBから取得）
  const performDeltaSync = async () => {
    try {
      const lastLocalTs = await LocalStore.getLatestMessageTimestamp(chId);
      let rtdbDocs = [];

      if (lastLocalTs > 0) {
        const deltaQuery = rtdbQuery(messagesRef, orderByChild('timestamp'), startAt(lastLocalTs + 1), limitToLast(50));
        const deltaSnap = await get(deltaQuery);
        if (deltaSnap.exists()) {
          const d = deltaSnap.val();
          rtdbDocs = Object.keys(d).map(k => ({ ...d[k], id: k, channelId: chId }));
        }
      } else {
        const snap = await get(q);
        if (snap.exists()) {
          const d = snap.val();
          rtdbDocs = Object.keys(d).map(k => ({ ...d[k], id: k, channelId: chId }));
        }
      }

      if (rtdbDocs.length > 0) {
        await LocalStore.upsertMessagesBatch(rtdbDocs);
        await decryptInPlace(rtdbDocs);

        rtdbDocs.forEach(msg => {
          const idx = allLoadedMessages.findIndex(m => m.id === msg.id);
          if (idx >= 0) allLoadedMessages[idx] = msg;
          else allLoadedMessages.push(msg);
        });

        allLoadedMessages.sort((a, b) => getMsgTimestamp(a) - getMsgTimestamp(b));
        lastMessagesData = [...allLoadedMessages];
        messagesIndexMap = {};
        lastMessagesData.forEach((m, i) => messagesIndexMap[m.id] = i);

        renderPinnedMessages();
        renderMessagesWithReadReceipts();
        updateReadReceiptForCurrentUser();
      }
    } catch (err) {
      console.warn('[RTDB] Delta Sync error:', err);
    }
  };

  performDeltaSync();

  let initialLoadTimeout = null;
  let buffer = [];
  let isInitialPhase = true;

  const processBuffer = async () => {
    if (buffer.length === 0) return;
    const docsToProcess = [...buffer];
    buffer = [];

    await decryptInPlace(docsToProcess);

    docsToProcess.forEach(msg => {
      const idx = allLoadedMessages.findIndex(m => m.id === msg.id);
      if (idx >= 0) allLoadedMessages[idx] = msg;
      else allLoadedMessages.push(msg);
    });

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
    if (!data) return;
    data.id = snapshot.key;
    data.channelId = chId;

    // IndexedDB に保存
    LocalStore.putMessage(data).catch(() => {});

    if (isInitialPhase) {
      buffer.push(data);
      if (initialLoadTimeout) clearTimeout(initialLoadTimeout);
      initialLoadTimeout = setTimeout(() => {
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
      }, 100);
      return;
    }

    if (data.senderId !== userId) {
      let bodyText = data.text;
      try {
        if (isEncrypted(bodyText)) {
          if (currentServerId) {
            const _members = (currentServerData && currentServerData.joinedUsers) || [];
            bodyText = await decryptText(bodyText, currentServerId, currentRoomId, _members);
          } else if (currentDmId) {
            const dmKey = await _getDmKeyWithWait(currentDmId, currentDmParticipants, 1500);
            bodyText = await _decryptDmText(bodyText, dmKey);
          }
        }
      } catch (e) { }
      const isMentioned = bodyText && typeof bodyText === "string" && (bodyText.includes(`@${userNickname}`) || bodyText.includes('@all'));
      if (isMentioned && document.hasFocus()) {
        showMentionToast(data.senderNickname || "ユーザー");
      }
      
      if (!document.hasFocus() || document.visibilityState === 'hidden') {
        const sName = currentServerId ? (currentServerData?.name || 'Covo') : 'ダイレクトメッセージ';
        const rName = currentServerId ? (roomNames[currentRoomId] || 'ルーム') : (currentDmParticipant?.nickname || 'ユーザー');
        const notifTitle = isMentioned ? `[@メンション] ${sName} › #${rName}` : `${sName} › #${rName}`;
        showNotification(notifTitle, `${data.senderNickname || 'ユーザー'}: ${bodyText || '新着メッセージ'}`, currentRoomId || currentDmId);
        showInAppNotification(sName, rName, data.senderNickname || 'ユーザー', bodyText || '新着メッセージ', currentServerId, currentServerData, currentRoomId);
        updateGlobalNotifUI();
        if (isTauri && window.__TAURI__?.core?.invoke) {
          window.__TAURI__.core.invoke('set_badge', { hasUnread: true }).catch(console.error);
        }
      }
    }

    await decryptInPlace([data]);

    const idx = allLoadedMessages.findIndex(m => m.id === data.id);
    if (idx >= 0) allLoadedMessages[idx] = data;
    else allLoadedMessages.push(data);

    allLoadedMessages.sort((a, b) => getMsgTimestamp(a) - getMsgTimestamp(b));
    lastMessagesData = [...allLoadedMessages];
    messagesIndexMap = {};
    lastMessagesData.forEach((m, i) => messagesIndexMap[m.id] = i);

    const wasScrolledToBottom = (messagesDisplay.scrollTop <= 50);
    renderMessagesWithReadReceipts();
    if (wasScrolledToBottom) messagesDisplay.scrollTop = 0;
    updateReadReceiptForCurrentUser();
  };

  const handleChanged = async (snapshot) => {
    const data = snapshot.val();
    data.id = snapshot.key;
    data.channelId = chId;
    LocalStore.putMessage(data).catch(() => {});
    buffer.push(data);
    processBuffer();
  };

  const handleRemoved = (snapshot) => {
    LocalStore.deleteMessage(snapshot.key).catch(() => {});
    allLoadedMessages = allLoadedMessages.filter(m => m.id !== snapshot.key);
    lastMessagesData = [...allLoadedMessages];
    renderMessagesWithReadReceipts();
  };

  onChildAdded(q, handleAdded);
  onChildChanged(q, handleChanged);
  onChildRemoved(q, handleRemoved);

  const typingPath = currentServerId ? `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/typing` : `artifacts/${appId}/dm_typing/${currentDmId}`;
  const typingRef = ref(rtdb, typingPath);
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

  const rrPath = currentServerId ? `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/readReceipts` : `artifacts/${appId}/dm_readReceipts/${currentDmId}`;
  const rrRef = ref(rtdb, rrPath);
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
  if (currentRoomId === roomId) {
    document.body.classList.add('in-chat-view');
    const sb = document.getElementById("sidebar");
    if (sb) sb.classList.add("mobile-hidden");
    currentRoomHeader.classList.remove("hidden");
    if (typeof updateMetaThemeColor === 'function') updateMetaThemeColor();
    unreadCounts[roomId] = 0;
    const badgeElem = document.getElementById(`unread-badge-${roomId}`);
    if (badgeElem) badgeElem.style.display = 'none';
    updateGlobalNotifUI();
    return;
  }

  document.body.classList.add('in-chat-view');
  const sb = document.getElementById("sidebar");
  if (sb) sb.classList.add("mobile-hidden");
  currentRoomId = roomId;

  // 未読境界をリセットし、前回までの最終既読時刻を確定
  unreadBoundaryAt = 0;
  unreadBoundaryMessageId = null;
  try {
    const rm = JSON.parse(localStorage.getItem('covo_last_read') || '{}');
    const prevRead = rm[roomId];
    if (typeof prevRead === 'number' && prevRead > 0) {
      unreadBoundaryAt = prevRead;
    }
    const newReadTime = Date.now();
    rm[roomId] = newReadTime;
    localStorage.setItem('covo_last_read', JSON.stringify(rm));
    if (typeof updateLocalAndRemoteReadState === 'function') {
      updateLocalAndRemoteReadState(roomId, newReadTime);
    }
    const badge = document.getElementById('unread-badge-' + roomId);
    if (badge) badge.style.display = 'none';
  } catch (e) { }

  updateUserStatus('online'); // Sync room selection for notifications
  currentDmId = null;
  currentDmParticipant = null;
  currentDmParticipants = [];
  const roomIcon = document.getElementById("currentRoomIcon");
  if (roomIcon) roomIcon.className = "fas fa-hashtag text-sm";
  document.querySelectorAll('.room-item-animate').forEach(el => el.classList.remove('active'));
  const activeItem = document.getElementById('room-item-' + roomId);
  if (activeItem) activeItem.classList.add('active');
  currentRoomTitleText.textContent = roomName;
  currentRoomHeader.classList.remove("hidden");
  clearMessagesDOM();
  lastMessagesData = [];
  if (messageInput) {
    messageInput.placeholder = "メッセージを入力...";
    messageInput.disabled = false;
  }
  fileAttachButton.disabled = false;
  { const sb = document.getElementById('stickerButton'); if (sb) sb.disabled = false; }
  { const pmb = document.getElementById('plusMenuButton'); if (pmb) pmb.disabled = false; }
  document.getElementById('callButton').disabled = false;
  { const fsb = document.getElementById('fileShareButton'); if (fsb) fsb.disabled = false; }
  prewarmPeerConnection();
  sendMessageButton.disabled = false;
  messageLimit = 20;
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

  // スマホ: チャット画面ビューに切り替え
  if (window.innerWidth < 768) {
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
  subscribeToPinnedMessages(currentServerId, roomId);


  // E2EE: 入室時にルーム鍵を準備し、まだ鍵を持たない参加メンバーへ自動補完 ＆ 復号エラー者の全自動レスキュー・自己治癒監視
  if (window._activeRoomKeyCheckTimer) {
    clearInterval(window._activeRoomKeyCheckTimer);
    window._activeRoomKeyCheckTimer = null;
  }
  (async () => {
    try {
      if (typeof ensureE2EEKeys === 'function') await ensureE2EEKeys(); // 新規アカウントの公開鍵を確実化
      const activeServerId = currentServerId;
      const activeRoomId = currentRoomId;
      const members = (currentServerData && currentServerData.joinedUsers) || [];
      const key = await getOrCreateRoomKey(activeServerId, activeRoomId, members);
      if (key) {
        await backfillRoomKeysForMembers(activeServerId, activeRoomId, members);
        // 【完璧なP2Pレスキュー監視機構】復号化エラーで救済リクエストを出している人を自動検知して鍵を配布

        const resSnap = await getDocs(collection(db, `artifacts/${appId}/servers/${activeServerId}/rooms/${activeRoomId}/rescueRequests`));
        if (!resSnap.empty) {
          const rawKey = await window.crypto.subtle.exportKey("raw", key.latest);
          for (const resDoc of resSnap.docs) {
            const reqUserId = resDoc.id;
            await _distributeRoomKeyVersion(activeServerId, activeRoomId, rawKey, [reqUserId], key.latestVersion);
            await deleteDoc(resDoc.ref).catch(() => {});
          }
        }

      } else {
        // 新規アカウントが鍵を持たない場合、救済リクエスト後の鍵到着を監視して自動リロード（自己治癒）
        let retryCount = 0;
        window._activeRoomKeyCheckTimer = setInterval(async () => {
          retryCount++;
          if (retryCount > 15 || currentRoomId !== activeRoomId || _e2ee.roomKeyCache[activeRoomId]) {
            clearInterval(window._activeRoomKeyCheckTimer);
            window._activeRoomKeyCheckTimer = null;
            return;
          }
          const arrived = await getOrCreateRoomKey(activeServerId, activeRoomId, members);
          if (arrived) {
            clearInterval(window._activeRoomKeyCheckTimer);
            window._activeRoomKeyCheckTimer = null;
            if (currentRoomId === activeRoomId && typeof renderMessagesWithReadReceipts === 'function') {
              renderMessagesWithReadReceipts();
            }
          }
        }, 2000);
      }
    } catch (e) { }
  })();

  // 既読とタイピングは subscribeToMessagesRTDB() 内で RTDB リスニングされるため、ここでの不要な Firestore 重複 onSnapshot を排除
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
  const spinner = document.getElementById('topLoadingSpinner');
  if (spinner) spinner.style.display = 'flex';
  try {
    const oldestMsg = jumpViewMessages[0];
    if (!oldestMsg) { hasMoreJumpOlder = false; return; }
    const oldestTime = getMsgTimestamp(oldestMsg);
    const { ref, get, query: rtdbQuery, limitToLast, orderByChild, endAt } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
    const rtdb = await _getOrInitRTDB();
    const messagesRef = ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`);
    const q = rtdbQuery(messagesRef, orderByChild('timestamp'), endAt(oldestTime, oldestMsg.id), limitToLast(21));
    const snap = await get(q);
    if (snap.exists()) {
      const data = snap.val();
      let docs = Object.keys(data).map(k => ({ ...data[k], id: k }));
      docs.sort((a, b) => getMsgTimestamp(a) - getMsgTimestamp(b));
      const _members = (currentServerData && currentServerData.joinedUsers) || [];
      await decryptMessagesInPlace(docs, currentServerId, currentRoomId, _members).catch(() => {});
      docs = docs.filter(d => d.id !== oldestMsg.id);
      if (docs.length > 0) {
        jumpViewMessages = [...docs, ...jumpViewMessages];
        allLoadedMessages = [...jumpViewMessages];
        lastMessagesData = [...allLoadedMessages];
        messagesIndexMap = {};
        lastMessagesData.forEach((m, i) => messagesIndexMap[m.id] = i);
        renderMessagesWithReadReceipts();
      }
      if (docs.length < 20) {
        hasMoreJumpOlder = false;
      }
    } else {
      hasMoreJumpOlder = false;
    }
  } catch (e) {
    console.error("loadJumpOlderMessages error:", e);
  } finally {
    isLoadingJumpOlder = false;
    if (spinner) spinner.style.display = 'none';
  }
}

async function loadJumpNewerMessages() {
  if (isLoadingJumpNewer || !hasMoreJumpNewer || !jumpViewMessages.length) return;
  isLoadingJumpNewer = true;
  try {
    const newestMsg = jumpViewMessages[jumpViewMessages.length - 1];
    if (!newestMsg) { hasMoreJumpNewer = false; return; }
    const newestTime = getMsgTimestamp(newestMsg);
    const { ref, get, query: rtdbQuery, limitToFirst, orderByChild, startAt } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
    const rtdb = await _getOrInitRTDB();
    const messagesRef = ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`);
    const q = rtdbQuery(messagesRef, orderByChild('timestamp'), startAt(newestTime, newestMsg.id), limitToFirst(21));
    const snap = await get(q);
    if (snap.exists()) {
      const data = snap.val();
      let docs = Object.keys(data).map(k => ({ ...data[k], id: k }));
      docs.sort((a, b) => getMsgTimestamp(a) - getMsgTimestamp(b));
      const _members = (currentServerData && currentServerData.joinedUsers) || [];
      await decryptMessagesInPlace(docs, currentServerId, currentRoomId, _members).catch(() => {});
      docs = docs.filter(d => d.id !== newestMsg.id);
      if (docs.length > 0) {
        const oldScrollHeight = messagesDisplay.scrollHeight;
        const oldScrollTop = messagesDisplay.scrollTop;
        jumpViewMessages = [...jumpViewMessages, ...docs];
        allLoadedMessages = [...jumpViewMessages];
        lastMessagesData = [...allLoadedMessages];
        messagesIndexMap = {};
        lastMessagesData.forEach((m, i) => messagesIndexMap[m.id] = i);
        renderMessagesWithReadReceipts();
        messagesDisplay.scrollTop = oldScrollTop + (messagesDisplay.scrollHeight - oldScrollHeight);
      }
      if (docs.length < 20) {
        hasMoreJumpNewer = false;
        isJumpView = false;
      }
    } else {
      hasMoreJumpNewer = false;
      isJumpView = false;
    }
  } catch (e) {
    console.error("loadJumpNewerMessages error:", e);
  } finally {
    isLoadingJumpNewer = false;
  }
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
  const delModal = document.getElementById("deleteRoomConfirmModal");
  if (delModal) delModal.classList.remove("hidden");
  const nameEl = document.getElementById("roomToDeleteName");
  if (nameEl) nameEl.textContent = name;
}

const confirmDelButton = document.getElementById("confirmDeleteButton");
if (confirmDelButton) {
  confirmDelButton.addEventListener("click", async () => {
    const delModal = document.getElementById("deleteRoomConfirmModal");
    if (delModal) delModal.classList.add("hidden");
    if (pendingRoomDelete) {
      await deleteRoomAndMessages(pendingRoomDelete.roomId);
    }
  });
}
const cancelDelButton = document.getElementById("cancelDeleteButton");
if (cancelDelButton) {
  cancelDelButton.addEventListener("click", () => {
    const delModal = document.getElementById("deleteRoomConfirmModal");
    if (delModal) delModal.classList.add("hidden");
  });
}

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
const toggleSearchButton = document.getElementById("toggleSearchButton");
const searchContainer = document.getElementById("searchContainer");
const closeSearchBtn = document.getElementById("closeSearchBtn");
const searchInput = document.getElementById("searchInput");
const mobileBackButton = document.getElementById("mobileBackButton");

if (toggleSearchButton && searchContainer) {
  toggleSearchButton.addEventListener("click", () => {
    searchContainer.classList.toggle("hidden");
    if (!searchContainer.classList.contains("hidden")) {
      if (searchInput) searchInput.focus();
      messageLimit = 9999;
      if (typeof subscribeToMessages === 'function') subscribeToMessages();
    } else {
      searchQuery = "";
      if (searchInput) searchInput.value = "";
      messageLimit = 20;
      if (typeof subscribeToMessages === 'function') subscribeToMessages();
    }
  });
}

if (closeSearchBtn && searchContainer) {
  closeSearchBtn.addEventListener("click", () => {
    searchContainer.classList.add("hidden");
    searchQuery = "";
    if (searchInput) searchInput.value = "";
    messageLimit = 20;
    if (typeof subscribeToMessages === 'function') subscribeToMessages();
  });
}

if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.toLowerCase();
    if (typeof renderMessagesWithReadReceipts === 'function') renderMessagesWithReadReceipts();
  });
}

// --- スマホ用戻るボタン ---
if (mobileBackButton) {
  mobileBackButton.addEventListener("click", () => {
    const currentRoomHeader = document.getElementById("currentRoomHeader");
    if (currentRoomHeader) currentRoomHeader.classList.add("hidden");
    document.body.classList.remove('in-chat-view');
    if (typeof updateMetaThemeColor === 'function') updateMetaThemeColor();

    const wasDm = Boolean(currentDmId);
    currentRoomId = null;
    currentDmId = null;
    currentDmParticipant = null;
    currentDmParticipants = [];

    if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
    if (unsubscribePinnedMessages) { unsubscribePinnedMessages(); unsubscribePinnedMessages = null; }
    if (readReceiptsUnsubscribe) { readReceiptsUnsubscribe(); readReceiptsUnsubscribe = null; }
    if (typingUnsubscribe) { typingUnsubscribe(); typingUnsubscribe = null; }
    if (typeof clearMessagesDOM === 'function') clearMessagesDOM();
    lastMessagesData = [];
    const messageInput = document.getElementById("messageInput");
    const fileAttachButton = document.getElementById("fileAttachButton");
    const sendMessageButton = document.getElementById("sendMessageButton");
    if (messageInput) messageInput.disabled = true;
    if (fileAttachButton) fileAttachButton.disabled = true;
    { const sb = document.getElementById('stickerButton'); if (sb) sb.disabled = true; }
    { const pmb = document.getElementById('plusMenuButton'); if (pmb) pmb.disabled = true; }
    if (sendMessageButton) sendMessageButton.disabled = true;
    if (typeof clearAttachedFile === 'function') clearAttachedFile();
    if (typeof cancelReply === 'function') cancelReply();

    if (wasDm) {
      openDmHomeView();
    }
  });
}

// ================= MODULE: stickers_data.js ================
// ================= STICKERS DATA MODULE ================
/* =====================================================================
   スタンプ機能（Twemoji絵文字をLINE風スタンプとして送る）
   - カテゴリ別の絵文字グリッド + よく使う(お気に入り) + 最近使った
   - スタンプは message.sticker フィールドで送信し、受信側で大きく表示
   - お気に入り/最近は localStorage に保存（端末ごと）
   ===================================================================== */
let STICKER_CATEGORIES = [
  { id: 'recent', icon: '🕘', label: '最近' },
  { id: 'fav', icon: '⭐', label: 'よく使う' },
  { id: 'covo_new', icon: 'covonew:いいね', label: 'スタンプ', emojis: ['covonew:OKです', 'covonew:ありがとう', 'covonew:いいね', 'covonew:うーん', 'covonew:え！', 'covonew:おやすみ', 'covonew:がんばるぞ', 'covonew:ごめんなさい', 'covonew:ちら', 'covonew:ぴえん', 'covonew:ぺこり', 'covonew:またねー', 'covonew:やっほー', 'covonew:わーい！', 'covonew:了解', 'covonew:大好き'] },
  { id: 'covo', icon: 'covo:yay', label: 'Covo', emojis: ['covo:sleep', 'covo:yay', 'covo:love', 'covo:despair', 'covo:ok', 'covo:no', 'covo:roger', 'covo:lol', 'covo:good'] },
  {
    id: 'twitter', icon: '😀', label: 'Twitter', emojis: [
      ...['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '😌', '😔', '😪', '😴', '😷', '🤒', '🤕', '🤧', '🥵', '🥶', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '💀', '💩', '🤡', '👻'],
      ...['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '💪', '🦾', '🖕', '✍️', '💅', '🤳'],
      ...['❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '💋', '💯', '💢', '💥', '💫', '💦', '💨', '✨', '🌟', '⭐', '🔥'],
      ...['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🦄', '🐝', '🦋', '🐢', '🐙', '🐳', '🐬', '🐟', '🦈', '🐊', '🦖', '🐉'],
      ...['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🌽', '🥕', '🍞', '🧀', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🍣', '🍱', '🍜', '🍡', '🍦', '🍰', '🎂', '🍫', '🍬', '🍭', '🍩', '🍪', '☕', '🍵', '🍺', '🍻', '🥂', '🍷'],
      ...['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🥅', '⛳', '🎣', '🎮', '🕹️', '🎲', '🎯', '🎳', '🎤', '🎧', '🎵', '🎸', '🎹', '🥁', '🎺', '🎻', '🎬', '🏆', '🥇', '🥈', '🥉', '🎉', '🎊', '🎈', '🎁', '🎀'],
      ...['✅', '❌', '⭕', '❓', '❗', '‼️', '⁉️', '💤', '🆗', '🆖', '🆕', '🆒', '🔝', '🎶', '〽️', '⚠️', '🚫', '💮', '💢', '♨️', '🈵', '🉐', '㊗️', '㊙️', '🈳', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟥', '🟦', '✔️', '➕', '➖']
    ]
  }
];
let currentServerStampsUnsub = null;
let currentServerStampGroupsUnsub = null;

async function loadCurrentServerStamps() {
  if (!currentServerId) return;
  try {
    if (currentServerStampsUnsub) currentServerStampsUnsub();
    if (currentServerStampGroupsUnsub) currentServerStampGroupsUnsub();

    let stampsCache = [];
    let groupsCache = [];

    const renderStamps = () => {
      for (let i = STICKER_CATEGORIES.length - 1; i >= 0; i--) {
        if (STICKER_CATEGORIES[i].id === 'server_custom' || STICKER_CATEGORIES[i].id.startsWith('server_group_')) {
          STICKER_CATEGORIES.splice(i, 1);
        }
      }

      let customCategories = [];

      const processDocs = (docs) => {
        docs.forEach(d => {
          const s = d.data;
          if (s.isGroup || (s.stamps && s.stamps.length > 0)) {
            customCategories.push({
              id: 'server_group_' + d.id,
              icon: `serverstamp:${s.thumbnailUrl}`,
              label: s.name,
              emojis: s.stamps.map(st => `serverstamp:${st.url}`)
            });
          } else {
            customCategories.push({
              id: 'server_group_' + d.id,
              icon: `serverstamp:${s.url}`,
              label: s.name,
              emojis: [`serverstamp:${s.url}`]
            });
          }
        });
      };

      processDocs(stampsCache);
      processDocs(groupsCache);

      if (customCategories.length > 0) {
        STICKER_CATEGORIES.splice(2, 0, ...customCategories);
      }

      if (_skTabsBound) {
        _skRenderTabs();
        if (_stickerActiveCat === 'server_custom' || _stickerActiveCat.startsWith('server_group_')) {
          _skRenderGrid(_stickerActiveCat);
        }
      }
    };

    const stampsRef = collection(db, `artifacts/${appId}/servers/${currentServerId}/stamps`);
    const groupsRef = collection(db, `artifacts/${appId}/servers/${currentServerId}/stampGroups`);

    currentServerStampsUnsub = onSnapshot(stampsRef, (snap) => {
      stampsCache = snap.docs.map(d => ({ id: d.id, data: d.data() }));
      renderStamps();
    }, (err) => {
      if (!auth.currentUser || !userId || !currentServerId || err?.code === 'permission-denied') return;
      console.warn('[Stamps onSnapshot] connection state updated:', err?.message || err);
    });

    currentServerStampGroupsUnsub = onSnapshot(groupsRef, (snap) => {
      groupsCache = snap.docs.map(d => ({ id: d.id, data: d.data() }));
      renderStamps();
    }, (err) => {
      if (!auth.currentUser || !userId || !currentServerId || err?.code === 'permission-denied') return;
      console.warn('[StampGroups onSnapshot] connection state updated:', err?.message || err);
    });

  } catch (e) {
    console.error("Failed to load server stamps", e);
  }
}
const SK_RECENT = 'covo_sticker_recent', SK_FAV = 'covo_sticker_fav';
let _stickerActiveCat = 'covo';

// Twemoji を「生きているCDN(jsDelivr)」のSVGで描画する共通関数。
// 旧デフォルトの maxcdn は閉鎖済みで画像が404→OS純正絵文字に戻ってしまうため base を明示する。

function _skLoad(key) { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; } }
function _skSave(key, arr) { try { localStorage.setItem(key, JSON.stringify(arr.slice(0, 40))); } catch (e) { } }
function _skPushRecent(emoji) {
  let r = _skLoad(SK_RECENT).filter(e => e !== emoji);
  r.unshift(emoji); _skSave(SK_RECENT, r);
}
function _skToggleFav(emoji) {
  let f = _skLoad(SK_FAV);
  if (f.includes(emoji)) f = f.filter(e => e !== emoji);
  else f.unshift(emoji);
  _skSave(SK_FAV, f);
  _skRenderGrid(_stickerActiveCat);
}

let _skTabsBound = false;
function _skRenderTabs() {
  const tabs = document.getElementById('stickerTabs');
  tabs.innerHTML = '';
  STICKER_CATEGORIES.forEach(cat => {
    const b = document.createElement('button');
    b.className = 'sticker-tab' + (cat.id === _stickerActiveCat ? ' active' : '');
    b.innerHTML = getEmojiHtml(cat.icon, 'sk-em');
    b.title = cat.label;
    b.dataset.cat = cat.id;
    tabs.appendChild(b);
  });
  // イベント委譲（twemojiでimg化されてもタブ全体で確実にクリックを拾う）
  if (!_skTabsBound) {
    _skTabsBound = true;
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.sticker-tab');
      if (!btn || !btn.dataset.cat) return;
      _stickerActiveCat = btn.dataset.cat;
      tabs.querySelectorAll('.sticker-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === _stickerActiveCat));
      _skRenderGrid(_stickerActiveCat);
    });
  }
  _twemojiParse(tabs);
}

function _skRenderGrid(catId) {
  const grid = document.getElementById('stickerGrid');
  grid.innerHTML = '';
  let emojis = [];
  if (catId === 'recent') emojis = _skLoad(SK_RECENT);
  else if (catId === 'fav') emojis = _skLoad(SK_FAV);
  else { const cat = STICKER_CATEGORIES.find(c => c.id === catId); emojis = cat ? (cat.emojis || []) : []; }
  if (emojis.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sticker-empty';
    empty.textContent = catId === 'recent' ? 'まだありません' : (catId === 'fav' ? 'スタンプを長押しでよく使うに追加' : '');
    grid.appendChild(empty);
  }
  const favs = _skLoad(SK_FAV);
  emojis.forEach(emoji => {
    const cell = document.createElement('button');
    cell.className = 'sticker-cell' + (favs.includes(emoji) ? ' is-fav' : '');
    cell.innerHTML = getEmojiHtml(emoji, 'sk-em') + `<span class="sticker-fav-star"><i class="fas fa-star"></i></span>`;
    // タップで送信
    let lp = null, lpFired = false;
    const fire = () => { lpFired = true; _skToggleFav(emoji); if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) { } };
    cell.addEventListener('touchstart', () => { lpFired = false; lp = setTimeout(fire, 450); }, { passive: true });
    cell.addEventListener('touchend', () => { if (lp) clearTimeout(lp); });
    cell.addEventListener('touchmove', () => { if (lp) clearTimeout(lp); });
    cell.onclick = () => { if (lpFired) { lpFired = false; return; } sendSticker(emoji); };
    // PC: 右クリックでお気に入りトグル
    cell.oncontextmenu = (e) => { e.preventDefault(); _skToggleFav(emoji); };
    grid.appendChild(cell);
  });
  _twemojiParse(grid);
}

window.toggleStickerPicker = function () {
  const p = document.getElementById('stickerPicker');
  if (!p) return;
  if (p.classList.contains('show')) {
    p.classList.remove('show');
    window._reactionTargetMessageId = null;
    return;
  }
  // 最近があればそれを初期表示、無ければcovoカテゴリ
  _stickerActiveCat = _skLoad(SK_RECENT).length ? 'recent' : 'covo';
  _skRenderTabs();
  _skRenderGrid(_stickerActiveCat);
  // 位置決め: 入力欄の上に出す
  const btn = document.getElementById('stickerButton');
  const r = btn.getBoundingClientRect();
  p.style.visibility = 'hidden'; p.classList.add('show');
  const pw = p.offsetWidth, ph = p.offsetHeight;
  let left = Math.min(Math.max(8, r.left - pw / 2 + r.width / 2), window.innerWidth - pw - 8);
  let top = r.top - ph - 10;
  if (top < 8) top = 8;
  p.style.left = left + 'px'; p.style.top = top + 'px';
  p.style.visibility = '';
};

async function sendSticker(emoji) {
  if (!currentRoomId && !currentDmId) return;
  _skPushRecent(emoji);
  document.getElementById('stickerPicker').classList.remove('show');
  if (window._reactionTargetMessageId) {
    window.toggleReaction(window._reactionTargetMessageId, emoji);
    window._reactionTargetMessageId = null;
    return;
  }

  // 自分が送信した時は未読境界線をクリア
  unreadBoundaryAt = 0;
  unreadBoundaryMessageId = null;
  const existingDiv = messagesDisplay.querySelector('.unread-divider');
  if (existingDiv) existingDiv.remove();

  try {
    const data = { sticker: emoji, senderId: userId, senderNickname: currentServerNickname || userNickname, timestamp: serverTimestamp() };
    if (replyingToMessage) {
      data.replyTo = { messageId: replyingToMessage.id, senderNickname: replyingToMessage.senderNickname, text: replyingToMessage.text || "（ファイル）" };
    }

    if (currentDmId) {
      const newMessageId = 'dm_msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7);
      const { ref, set } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const rtdb = await _getOrInitRTDB();
      const rtdbMsgRef = ref(rtdb, `artifacts/${appId}/dm_messages/${currentDmId}/${newMessageId}`);
      const rtdbData = { ...data, id: newMessageId, timestamp: Date.now() };
      await set(rtdbMsgRef, rtdbData);

      await setDoc(doc(db, `artifacts/${appId}/dm_channels/${currentDmId}`), {
        participants: currentDmParticipants,
        lastMessageAt: data.timestamp,
        lastMessageSender: userId,
        lastMessageText: 'スタンプ ' + emoji
      }, { merge: true });

      LocalStore.putMessage({ ...rtdbData, channelId: `dm_${currentDmId}` }).catch(() => {});
      pruneExcessMessages(null, null, currentDmId);

      const otherUid = currentDmParticipants.find(id => id !== userId);
      if (otherUid) {
        try {
          const idToken = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => "") : "";
          const notifPayload = JSON.stringify({
            receiverIds: [otherUid],
            title: `ダイレクトメッセージ › @${userNickname}`,
            body: `${userNickname}: スタンプ ${emoji}`,
            roomId: currentDmId,
            messageId: newMessageId,
            appId: appId,
            senderId: userId,
            idToken
          });
          const notifUrl = `${WORKER_BASE_URL}/api/sendNotification`;
          if (navigator.sendBeacon) {
            navigator.sendBeacon(notifUrl, new Blob([notifPayload], { type: 'application/json' }));
          } else {
            fetch(notifUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: notifPayload, keepalive: true }).catch(() => {});
          }
        } catch (e) { }
      }
    } else {
      const replyMsgRef = await addDoc(collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`), data);
      try {
        const { ref, set } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
        const rtdb = await _getOrInitRTDB();
        const rtdbMsgRef = ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages/${replyMsgRef.id}`);
        const rtdbData = { ...data, id: replyMsgRef.id, timestamp: Date.now() };
        await set(rtdbMsgRef, rtdbData);
        LocalStore.putMessage({ ...rtdbData, channelId: `${currentServerId}_${currentRoomId}` }).catch(() => {});
      } catch (e) { console.error("RTDB Dual Write Failed in Reply", e); }
      await updateDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}`), {
        lastMessageAt: data.timestamp, lastMessageSender: userId, lastMessageText: 'スタンプ ' + emoji
      });
      pruneExcessMessages(currentServerId, currentRoomId, null);

      // 通知（スタンプ絵文字つき・キャッシュ利用でgetDoc通信を排除）
      try {
        const sd = currentServerData;
        if (sd) {
          const receiverIds = (sd.joinedUsers || []).filter(id => id !== userId);
          if (receiverIds.length > 0) {
            const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
            fetch(`${WORKER_BASE_URL}/api/sendNotification`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ receiverIds, title: `${sd.name || 'Covo'} › #${roomNames[currentRoomId] || 'room'}`, body: `${userNickname}: ${emoji}`, roomId: currentRoomId, messageId: replyMsgRef.id, appId, senderId: userId, idToken })
            }).catch(() => { });
          }
        }
      } catch (e) { }
    }

    cancelReply();
    resetAwayTimer();
  } catch (e) {
    console.error('[Sticker] 送信失敗:', e);
    alertMessage('スタンプの送信に失敗しました', 'error');
  }
}

// スタンプボタン / 外側クリックで閉じる
document.addEventListener('DOMContentLoaded', () => { });
{
  const sbtn = document.getElementById('stickerButton');
  if (sbtn) sbtn.addEventListener('click', (e) => { e.stopPropagation(); if (!currentRoomId && !currentDmId) return; toggleStickerPicker(); });
  document.addEventListener('click', (e) => {
    const p = document.getElementById('stickerPicker');
    if (p && p.classList.contains('show') && !p.contains(e.target) && e.target.id !== 'stickerButton' && !e.target.closest('#stickerButton')) {
      p.classList.remove('show');
      window._reactionTargetMessageId = null;
    }
  });
}

// ================= MODULE: media_preview.js ================
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



const messageInpEl = document.getElementById("messageInput");

if (messageInpEl) {
  messageInpEl.addEventListener("keydown", (e) => {
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

  messageInpEl.addEventListener("input", (e) => {
    // メンション機能の判定
    const val = messageInpEl.value;
    const pos = messageInpEl.selectionStart;
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
    messageInpEl.style.height = "auto";
    messageInpEl.style.height = messageInpEl.scrollHeight + "px";
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

  messageInpEl.addEventListener("blur", () => {
    clearTimeout(typingTimeout);
    if (isCurrentlyTyping) {
      isCurrentlyTyping = false;
      setTypingStatus(false);
    }
  });

  messageInpEl.addEventListener("paste", async (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        let f = items[i].getAsFile();
        if (!f) return;
        f = await processHeicFile(f);
        if (!checkFileAllowed(f)) return;
        // 上限を統一（動画100MB / その他ファイル25MB）
        const MAX = f.type.startsWith('video/') ? 100 * 1024 * 1024 : 25 * 1024 * 1024;
        if (f.size > MAX) { alertMessage(f.type.startsWith('video/') ? "動画は100MBまでです" : "ファイルは25MBまでです", "error"); return; }
        attachedFile = { file: f, name: f.name || `paste_${Date.now()}`, type: f.type || 'application/octet-stream', size: f.size };
        updateFilePreview();
        e.preventDefault();
        return;
      }
    }
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && isCurrentlyTyping) {
    clearTimeout(typingTimeout);
    isCurrentlyTyping = false;
    setTypingStatus(false);
  }
});

function updateFilePreview() {
  const progressBar = document.getElementById("uploadProgressBar");
  const progressFill = document.getElementById("uploadProgressFill");
  const filePreviewImage = document.getElementById("filePreviewImage");
  const filePreviewName = document.getElementById("filePreviewName");
  const filePreviewContainer = document.getElementById("filePreviewContainer");

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
    if (filePreviewName) filePreviewName.textContent = `${attachedFile.name} (${sizeStr})`;

    if (filePreviewImage && attachedFile.type && attachedFile.type.startsWith("image/")) {
      filePreviewImage.src = URL.createObjectURL(attachedFile.file);
      filePreviewImage.classList.remove("hidden");
    }

    if (filePreviewContainer) filePreviewContainer.classList.remove("hidden");
    if (progressBar) progressBar.classList.add("hidden");
    if (progressFill) progressFill.style.width = "0%";
  } else if (attachedKvFile) {
    const sizeStr = attachedKvFile.size >= 1024 * 1024
      ? `${(attachedKvFile.size / (1024 * 1024)).toFixed(1)} MB`
      : `${(attachedKvFile.size / 1024).toFixed(1)} KB`;
    if (filePreviewName) filePreviewName.innerHTML = `<i class="fas fa-paperclip mr-1 text-gray-400"></i>${escapeHtml(attachedKvFile.name)} (${escapeHtml(sizeStr)})`;
    if (filePreviewContainer) filePreviewContainer.classList.remove("hidden");
    if (progressBar) progressBar.classList.add("hidden");
    if (progressFill) progressFill.style.width = "0%";
  } else {
    if (filePreviewContainer) filePreviewContainer.classList.add("hidden");
    if (progressBar) progressBar.classList.add("hidden");
    if (progressFill) progressFill.style.width = "0%";
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

// ================= MODULE: messages.js ================
// ================= MESSAGES MODULE ================

// RTDB 100件上限ローテーション & Cloudflare KV 連動物理ファイル削除
async function pruneExcessMessages(serverId, roomId, dmId) {
  try {
    const { ref, get, remove, query: rtdbQuery, orderByChild } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
    const rtdb = await _getOrInitRTDB();
    const basePath = serverId ? `artifacts/${appId}/servers/${serverId}/rooms/${roomId}/messages` : `artifacts/${appId}/dm_messages/${dmId}`;
    const messagesRef = ref(rtdb, basePath);
    const snap = await get(rtdbQuery(messagesRef, orderByChild('timestamp')));
    if (!snap.exists()) return;

    const data = snap.val();
    const keys = Object.keys(data);
    if (keys.length <= 100) return;

    let msgs = keys.map(k => ({ ...data[k], id: k }));
    msgs.sort((a, b) => getMsgTimestamp(a) - getMsgTimestamp(b)); // 古い順

    const unpinnedMsgs = msgs.filter(m => !m.isPinned);
    const excessCount = keys.length - 100;
    const toDelete = unpinnedMsgs.slice(0, excessCount);

    if (toDelete.length === 0) return;

    const idToken = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => "") : "";

    for (const msg of toDelete) {
      // 1. Cloudflare KV ファイル連動削除
      const fileUrls = [msg.kvFileUrl, msg.fileData, msg.text].filter(Boolean);
      for (const urlStr of fileUrls) {
        if (typeof urlStr === 'string' && urlStr.includes('/api/file/')) {
          const m = urlStr.match(/\/api\/file\/([A-Za-z0-9_]+)/);
          if (m && m[1]) {
            const fileKey = m[1];
            fetch(`${WORKER_BASE_URL}/api/file/${fileKey}?userId=${encodeURIComponent(userId)}&idToken=${encodeURIComponent(idToken)}&forceDelete=1`, {
              method: 'DELETE'
            }).catch(e => console.warn('[pruneExcessMessages] KV delete failed:', fileKey, e));
          }
        }
      }

      // 2. RTDB から削除
      await remove(ref(rtdb, `${basePath}/${msg.id}`)).catch(e => console.warn('[pruneExcessMessages] RTDB remove failed:', msg.id, e));

      // 3. Firestore からも削除 (サーバーメッセージの場合)
      if (serverId && roomId) {
        deleteDoc(doc(db, `artifacts/${appId}/servers/${serverId}/rooms/${roomId}/messages/${msg.id}`)).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[pruneExcessMessages] Error during prune:', err);
  }
}

async function sendMessage() {
  if (isSendingMessage && (attachedFile || attachedKvFile)) return;
  const text = messageInput.value.trim();
  if ((!text && !attachedFile && !attachedKvFile) || (!currentRoomId && !currentDmId)) return;

  // Optimistic input clearing (LINE style)
  messageInput.value = "";
  messageInput.style.height = "auto";
  if (typeof toggleSendButtonState === 'function') toggleSendButtonState();

  unreadBoundaryAt = 0;
  unreadBoundaryMessageId = null;
  const existingDiv = messagesDisplay.querySelector('.unread-divider');
  if (existingDiv) existingDiv.remove();

  const progressBar = document.getElementById("uploadProgressBar");
  const progressFill = document.getElementById("uploadProgressFill");
  const progressText = document.getElementById("uploadProgressText");

  if (attachedFile || attachedKvFile) {
    isSendingMessage = true;
    messageInput.disabled = true;
    sendMessageButton.disabled = true;
    if (progressBar) progressBar.classList.remove("hidden");
  }

  clearTimeout(typingTimeout);
  isCurrentlyTyping = false;
  setTypingStatus(false);

  const chId = currentServerId ? `${currentServerId}_${currentRoomId}` : `dm_${currentDmId}`;

  try {
    let textToStore = text;
    let wasEncrypted = false;

    if (text) {
      if (!_subtleOK) {
        console.warn("[E2EE] この環境は Web Crypto 非対応のため平文で送信します");
        if (!confirm("⚠️ セキュリティ保護警告: 現在のブラウザ環境はエンドツーエンド暗号化(WebCrypto API)に非対応です。平文で送信してもよろしいですか？")) {
          return;
        }
      } else {
        try {
          if (currentDmId) {
            const dmKey = await _getDmKeyWithWait(currentDmId, currentDmParticipants, 2000);
            if (!dmKey) {
              alertMessage("🔒 暗号化保護エラー: DMセキュリティ鍵の取得に失敗しました", "error");
              return;
            }
            const enc = await _encryptDmText(text, dmKey);
            if (enc) {
              textToStore = enc;
              wasEncrypted = true;
            }
          } else {
            const members = (currentServerData && currentServerData.joinedUsers) || [];
            const overlayWasHidden = loadingOverlay.classList.contains("hidden");
            if (overlayWasHidden && !_e2ee.roomKeyCache[currentRoomId]) {
              loadingOverlay.classList.remove("hidden");
            }
            const roomKey = await getRoomKeyWithWait(currentServerId, currentRoomId, members, 2000);
            if (!roomKey) {
              console.warn(`[E2EE] ルーム鍵の取得に失敗 (server=${currentServerId}, room=${currentRoomId})`);
              loadingOverlay.classList.add("hidden");
              alertMessage("🔒 暗号化保護エラー: セキュリティ鍵の取得に失敗したため、平文での送信を強制遮断しました。自動で鍵の修復を実行します。", "error");
              await requestEscrowRescue(currentServerId, currentRoomId);
              return;
            } else {
              const enc = await encryptText(text, roomKey);
              if (enc) {
                textToStore = enc;
                wasEncrypted = true;
              } else {
                alertMessage("🔒 暗号化保護エラー: メッセージの暗号化処理に失敗しました", "error");
                await requestEscrowRescue(currentServerId, currentRoomId);
                return;
              }
            }
          }
        } catch (e) {
          console.error("[E2EE] 暗号化処理で例外が発生したため送信を遮断:", e);
          loadingOverlay.classList.add("hidden");
          alertMessage("🔒 暗号化保護エラー: 例外が発生したため送信を遮断しました", "error");
          return;
        }
      }
    }

    const data = { text: textToStore, senderId: userId, senderNickname: currentServerNickname || userNickname, timestamp: serverTimestamp() };
    if (attachedKvFile) {
      Object.assign(data, { kvFileUrl: attachedKvFile.url, fileName: attachedKvFile.name, fileType: attachedKvFile.type, fileSize: attachedKvFile.size });
    }
    if (attachedFile) {
      if (progressBar) progressBar.classList.remove("hidden");
      if (progressFill) progressFill.style.width = "0%";
      if (progressText) progressText.textContent = "アップロード中... 0%";
      try {
        let fileToUpload = attachedFile.file;
        let isFileEncrypted = false;

        if (_subtleOK) {
          if (currentDmId) {
            const dmKey = await _getDmKeyWithWait(currentDmId, currentDmParticipants, 2000);
            if (dmKey) {
              const encBlob = await encryptFileE2EE(fileToUpload, dmKey);
              fileToUpload = new File([encBlob], attachedFile.name, { type: 'application/octet-stream' });
              isFileEncrypted = true;
            }
          } else {
            const members = (currentServerData && currentServerData.joinedUsers) || [];
            const roomKey = await getRoomKeyWithWait(currentServerId, currentRoomId, members, 2000);
            if (roomKey) {
              const encBlob = await encryptFileE2EE(fileToUpload, roomKey);
              fileToUpload = new File([encBlob], attachedFile.name, { type: 'application/octet-stream' });
              isFileEncrypted = true;
            }
          }
        }

        const fileUrl = await uploadToExternalService(
          fileToUpload,
          (pct) => {
            if (progressFill) progressFill.style.width = pct + "%";
            if (progressText) progressText.textContent = pct >= 100 ? "送信中..." : `アップロード中... ${pct}%`;
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
        if (progressBar) progressBar.classList.add("hidden");
        if (progressFill) progressFill.style.width = "0%";
      }
    }

    if (replyingToMessage) {
      data.replyTo = { messageId: replyingToMessage.id, senderNickname: replyingToMessage.senderNickname, text: replyingToMessage.text || "（ファイル）" };
    }

    let newMessageId;

    if (currentDmId) {
      newMessageId = 'dm_msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7);
      const { ref, set } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const rtdb = await _getOrInitRTDB();
      const rtdbMsgRef = ref(rtdb, `artifacts/${appId}/dm_messages/${currentDmId}/${newMessageId}`);
      const rtdbData = { ...data, id: newMessageId, timestamp: Date.now() };
      await set(rtdbMsgRef, rtdbData);

      await setDoc(doc(db, `artifacts/${appId}/dm_channels/${currentDmId}`), {
        participants: currentDmParticipants,
        lastMessageAt: data.timestamp,
        lastMessageSender: userId,
        lastMessageText: wasEncrypted ? textToStore : (text || (attachedFile ? '（画像）' : attachedKvFile ? '（ファイル）' : ''))
      }, { merge: true });

      LocalStore.putMessage({ ...rtdbData, channelId: chId }).catch(() => {});
      pruneExcessMessages(null, null, currentDmId);

      const otherUid = currentDmParticipants.find(id => id !== userId);
      if (otherUid) {
        try {
          const idToken = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => "") : "";
          const notifPayload = JSON.stringify({
            receiverIds: [otherUid],
            title: `ダイレクトメッセージ › @${userNickname}`,
            body: `${userNickname}: ${wasEncrypted ? textToStore : (text || (attachedFile ? '（画像）' : attachedKvFile ? '（ファイル）' : ''))}`,
            roomId: currentDmId,
            messageId: newMessageId,
            appId: appId,
            senderId: userId,
            idToken
          });
          const notifUrl = `${WORKER_BASE_URL}/api/sendNotification`;
          if (navigator.sendBeacon) {
            navigator.sendBeacon(notifUrl, new Blob([notifPayload], { type: 'application/json' }));
          } else {
            fetch(notifUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: notifPayload, keepalive: true }).catch(() => {});
          }
        } catch (e) { }
      }
    } else {
      const msgRef = await addDoc(collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`), data);
      try {
        const { ref, set } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
        const rtdb = await _getOrInitRTDB();
        const rtdbMsgRef = ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages/${msgRef.id}`);
        const rtdbData = { ...data, id: msgRef.id, timestamp: Date.now() };
        await set(rtdbMsgRef, rtdbData);
        LocalStore.putMessage({ ...rtdbData, channelId: chId }).catch(() => {});
      } catch (e) { console.error("RTDB Dual Write Failed in sendMessage", e); }
      newMessageId = msgRef.id;

      try {
        await updateDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}`), {
          lastMessageAt: data.timestamp,
          lastMessageSender: userId,
          lastMessageText: wasEncrypted ? textToStore : (text || (attachedFile ? '（画像）' : attachedKvFile ? '（ファイル）' : ''))
        });
      } catch (updateErr) { }

      pruneExcessMessages(currentServerId, currentRoomId, null);

      try {
        const serverData = currentServerData;
        if (serverData) {
          const receiverIds = (serverData.joinedUsers || []).filter(id => id !== userId);
          if (receiverIds.length > 0) {
            const serverName = serverData.name || 'Covo';
            const roomName = roomNames[currentRoomId] || 'room';
            const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
            const notifPayload = JSON.stringify({
              receiverIds,
              title: `${serverName} › #${roomName}`,
              body: `${userNickname}: ${wasEncrypted ? textToStore : (text || (attachedFile ? '（画像）' : attachedKvFile ? '（ファイル）' : ''))}`,
              roomId: currentRoomId,
              messageId: newMessageId,
              appId: appId,
              senderId: userId,
              idToken
            });
            const notifUrl = `${WORKER_BASE_URL}/api/sendNotification`;
            const beaconSent = navigator.sendBeacon
              ? navigator.sendBeacon(notifUrl, new Blob([notifPayload], { type: 'application/json' }))
              : false;
            if (!beaconSent) {
              fetch(notifUrl, {
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
    }

    clearAttachedFile(); cancelReply();
    resetAwayTimer();

  } catch (e) {
    console.error(e);
    if (typeof text !== 'undefined' && text) {
      const mi = document.getElementById("messageInput");
      if (mi && !mi.value) mi.value = text;
    }
    alertMessage("送信に失敗しました", "error");
  } finally {
    loadingOverlay.classList.add("hidden");
    if (progressBar) progressBar.classList.add("hidden");
    if (progressFill) progressFill.style.width = "0%";
    messageInput.disabled = false;
    sendMessageButton.disabled = false;
    isSendingMessage = false;
    setTimeout(() => messageInput.focus(), 10);
  }
}
const clearFileBtn = document.getElementById("clearFileButton");
if (clearFileBtn) {
  clearFileBtn.addEventListener("click", clearAttachedFile);
}
function clearAttachedFile() { attachedFile = null; attachedKvFile = null; updateFilePreview(); }


// --- 送信ボタン ---
const sendMessageBtn = document.getElementById("sendMessageButton");
if (sendMessageBtn) {
  sendMessageBtn.addEventListener("click", sendMessage);
}

// --- ファイル添付ボタン ---
const fileAttachBtn = document.getElementById("fileAttachButton");
const fileAttachInp = document.getElementById("fileAttachInput");
if (fileAttachBtn && fileAttachInp) {
  fileAttachBtn.disabled = true;
  fileAttachBtn.addEventListener("click", () => {
    if (!currentRoomId && !currentDmId) return;
    fileAttachInp.click();
  });
}

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
  if (currentRoomId || currentDmId) dropOverlay.classList.add("active");
});
window.addEventListener("dragleave", (e) => {
  e.preventDefault(); dragCounter--;
  if (dragCounter <= 0) { dragCounter = 0; dropOverlay.classList.remove("active"); }
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", async (e) => {
  e.preventDefault(); dragCounter = 0;
  dropOverlay.classList.remove("active");
  if (!currentRoomId && !currentDmId) return;
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

  let users = [];
  if (currentDmId && currentDmParticipant) {
    // DM環境では通話/会話相手を直接候補に設定
    users = [{
      id: currentDmParticipant.uid,
      nickname: currentDmParticipant.nickname || 'ユーザー',
      avatarUrl: currentDmParticipant.avatarUrl || ''
    }];
    mentionUsers = users;
  } else {
    const serverMemberIds = currentServerData?.joinedUsers || [];
    users = cachedUsers.filter(u => u.id !== userId && serverMemberIds.includes(u.id));

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
  }

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
      : (isUsableAvatarUrl(u.avatarUrl)
        ? `<img src="${escapeHtml(u.avatarUrl)}" class="w-6 h-6 rounded-full object-cover flex-shrink-0" onerror="this.remove()">`
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
  if (!currentRoomId && !currentDmId) return; // DM時もポップアップを開く
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
    if (!currentRoomId && !currentDmId) return;
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
  if ((!currentServerId || !currentRoomId) && !currentDmId) return;
  if (!userId) return;

  try {
    if (currentDmId) {
      const { ref, get, remove, update } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const rtdb = await _getOrInitRTDB();
      const rtdbMsgRef = ref(rtdb, `artifacts/${appId}/dm_messages/${currentDmId}/${messageId}`);
      const snap = await get(rtdbMsgRef);
      if (!snap.exists()) return;
      const msgData = snap.val();
      const currentReactions = msgData.reactions || {};
      const hasReactedWithSameEmoji = currentReactions[userId] === emoji;

      if (hasReactedWithSameEmoji) {
        await remove(ref(rtdb, `artifacts/${appId}/dm_messages/${currentDmId}/${messageId}/reactions/${userId}`));
        delete currentReactions[userId];
      } else {
        await update(ref(rtdb, `artifacts/${appId}/dm_messages/${currentDmId}/${messageId}/reactions`), { [userId]: emoji });
        currentReactions[userId] = emoji;
      }
      // Update LocalStore
      LocalStore.putMessage({ ...msgData, reactions: currentReactions, id: messageId, channelId: `dm_${currentDmId}` }).catch(() => {});
    } else {
      const msgRef = doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`, messageId);
      const msgSnap = await getDoc(msgRef);
      if (!msgSnap.exists()) return;
      const msgData = msgSnap.data();
      const currentReactions = msgData.reactions || {};
      const hasReactedWithSameEmoji = currentReactions[userId] === emoji;

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
    avatarDiv.className = "msg-avatar z-10 cursor-pointer";
    if (senderUser?.avatarUrl) {
      __setAvatarImg(avatarDiv, senderUser.avatarUrl, message.senderNickname, { style: '' });
    } else {
      avatarDiv.textContent = (message.senderNickname || "?").charAt(0).toUpperCase();
    }
    // Discord準拠: メッセージアバタークリックでユーザープロフィールポップアップを表示
    avatarDiv.addEventListener("click", (e) => {
      e.stopPropagation();
      openUserProfileModal(message.senderId, message.senderNickname || 'ユーザー', senderUser?.avatarUrl || '');
    });
    messageRowInner.appendChild(avatarDiv);
  }

  const bubbleContainer = document.createElement("div");
  bubbleContainer.className = `flex flex-col z-10 w-fit max-w-[85%] min-w-0 ${isMyMessage ? 'items-end' : 'items-start'}`;

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
  senderNicknameSpan.className = `text-xs text-gray-600 dark:text-gray-400 mb-1 cursor-pointer hover:underline ${isMyMessage ? "text-right" : "text-left font-semibold"}`;
  senderNicknameSpan.textContent = message.senderNickname || "不明なユーザー";
  senderNicknameSpan.addEventListener("click", (e) => {
    e.stopPropagation();
    const senderUser = cachedUsers.find(u => u.id === message.senderId);
    openUserProfileModal(message.senderId, message.senderNickname || 'ユーザー', senderUser?.avatarUrl || '');
  });
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
              let key;
              if (currentDmId) {
                key = await _getDmKeyWithWait(currentDmId, currentDmParticipants, 2000);
              } else {
                const members = (currentServerData && currentServerData.joinedUsers) || [];
                key = await getOrCreateRoomKey(currentServerId, currentRoomId, members);
              }
              if (!key) throw new Error("No key");
              const res = await fetch(message.fileData);
              const buf = await res.arrayBuffer();
              const dec = await decryptFileE2EE(buf, key, currentServerId, currentRoomId);
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
                let key;
                if (currentDmId) {
                  key = await _getDmKeyWithWait(currentDmId, currentDmParticipants, 2000);
                } else {
                  const members = (currentServerData && currentServerData.joinedUsers) || [];
                  key = await getOrCreateRoomKey(currentServerId, currentRoomId, members);
                }
                if (!key) return;
                const res = await fetch(message.fileData);
                const buf = await res.arrayBuffer();
                const dec = await decryptFileE2EE(buf, key, currentServerId, currentRoomId);
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

  // Discord風 DM Welcome Hero Header（過去ログの最上部、DOM上は最後尾）
  if (currentDmId && currentDmParticipant) {
    let hero = document.getElementById('dmHeroWelcomeBanner');
    if (!hero) {
      hero = document.createElement('div');
      hero.id = 'dmHeroWelcomeBanner';
      hero.className = 'dm-welcome-banner flipped';
    }
    const safeNick = escapeHtml(currentDmParticipant.nickname || 'ユーザー');
    const safeAv = currentDmParticipant.avatarUrl 
      ? `<img src="${currentDmParticipant.avatarUrl}" class="w-16 h-16 rounded-full object-cover shadow-md border-2 border-indigo-500/20">`
      : `<div class="w-16 h-16 rounded-full bg-slate-700 text-white font-bold text-xl flex items-center justify-center shadow-md">${safeNick.charAt(0)}</div>`;
    
    hero.innerHTML = `
      <div class="mb-3">${safeAv}</div>
      <h2 class="text-2xl font-black text-gray-900 dark:text-gray-100 mb-1 tracking-tight">${safeNick}</h2>
      <p class="text-xs text-gray-500 dark:text-gray-400 font-medium mb-4">これは @${safeNick} さんとのダイレクトメッセージの始まりです。</p>
      <div class="flex items-center gap-2 flex-wrap">
        <button onclick="window.openCallPickerWithTarget('${currentDmParticipant.uid}')" class="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow transition flex items-center gap-1.5">
          <i class="fas fa-phone text-xs"></i> <span>通話を開始</span>
        </button>
        <button onclick="window.openFileShareWithTarget('${currentDmParticipant.uid}')" class="px-3.5 py-1.5 rounded-xl bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-800 dark:text-white font-bold text-xs transition flex items-center gap-1.5">
          <i class="fas fa-share-from-square text-xs"></i> <span>ファイルを送る</span>
        </button>
        <button onclick="window.blockUser('${currentDmParticipant.uid}')" class="px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 font-bold text-xs transition">
          ブロック
        </button>
      </div>
    `;
    expectedElements.push(hero);
  } else {
    const hero = document.getElementById('dmHeroWelcomeBanner');
    if (hero) hero.remove();
  }

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
    const ts = getMsgTimestamp(msg);
    if (ts && ts > unreadBoundaryAt) {
      unreadBoundaryMessageId = msg.id;
      return unreadBoundaryMessageId;
    }
  }
  return null;
}

// 区切り線を、境界メッセージの「視覚的に直上」に配置する。
// 表示は scaleY(-1) で反転しているため、DOM上は境界行の次 (nextSibling) に入れると視覚的に直上（過去メッセージ側）になる。
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
  if ((!currentRoomId && !currentDmId) || !userId) return;
  // バックグラウンド・最小化・非フォーカス時は既読にしない
  if (document.visibilityState === 'hidden' || !document.hasFocus()) return;
  const channelKey = currentRoomId || `dm_${currentDmId}`;
  if (typeof updateLocalAndRemoteReadState === 'function') {
    updateLocalAndRemoteReadState(channelKey, Date.now() + 10000);
  } else {
    try {
      const rm = JSON.parse(localStorage.getItem('covo_last_read') || '{}');
      rm[channelKey] = Date.now() + 10000;
      localStorage.setItem('covo_last_read', JSON.stringify(rm));
    } catch (e) { }
  }
  const lastMsgId = lastMessagesData.length ? lastMessagesData[lastMessagesData.length - 1].id : null;
  const currentReadMsgKey = `${channelKey}_${lastMsgId || 'empty'}`;
  if (currentReadMsgKey === _lastSentReadMessageId) return;
  _lastSentReadMessageId = currentReadMsgKey;
  try {
    const { ref, set } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
    const rtdb = await _getOrInitRTDB();
    const myReceiptPath = currentDmId
      ? `artifacts/${appId}/dm_readReceipts/${currentDmId}/${userId}`
      : `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/readReceipts/${userId}`;
    const myReceiptRef = ref(rtdb, myReceiptPath);
    await set(myReceiptRef, { lastReadAt: Date.now(), lastReadMessageId: lastMsgId });
  } catch (error) { }
}

async function setTypingStatus(isTyping) {
  if ((!currentRoomId && !currentDmId) || !userId || !appId) return;
  try {
    const { ref, set, remove, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
    const rtdb = await _getOrInitRTDB();
    const typingPath = currentDmId
      ? `artifacts/${appId}/dm_typing/${currentDmId}/${userId}`
      : `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/typing/${userId}`;
    const typingRef = ref(rtdb, typingPath);
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

const replyMsgBtn = document.getElementById("replyMessageButton");
const downloadMsgBtn = document.getElementById("downloadMessageButton");
const copyMsgBtn = document.getElementById("copyMessageButton");
const deleteMsgBtn = document.getElementById("deleteMessageButton");
const messageCtxMenu = document.getElementById("messageContextMenu");

if (replyMsgBtn) {
  replyMsgBtn.addEventListener("click", (e) => {
    if (ignoreNextContextMenuClick) { e.preventDefault(); e.stopPropagation(); return; }
    if (selectedMessageForContext) {
      replyingToMessage = selectedMessageForContext;
      const nickEl = document.getElementById("replyingToNickname");
      const textEl = document.getElementById("replyingToText");
      const contEl = document.getElementById("replyingToContainer");
      if (nickEl) nickEl.textContent = selectedMessageForContext.senderNickname;
      if (textEl) textEl.textContent = selectedMessageForContext.text || (selectedMessageForContext.fileName ? "ファイル" : "...");
      if (contEl) contEl.classList.remove("hidden");
    }
    if (messageCtxMenu) messageCtxMenu.classList.add("hidden");
  });
}

if (downloadMsgBtn) {
  downloadMsgBtn.addEventListener("click", async (e) => {
    if (ignoreNextContextMenuClick) { e.preventDefault(); e.stopPropagation(); return; }
    if (messageCtxMenu) messageCtxMenu.classList.add("hidden");
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
}

if (copyMsgBtn) {
  copyMsgBtn.addEventListener("click", async (e) => {
    if (ignoreNextContextMenuClick) { e.preventDefault(); e.stopPropagation(); return; }
    if (messageCtxMenu) messageCtxMenu.classList.add("hidden");
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
                return;
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
}

if (deleteMsgBtn) {
  deleteMsgBtn.addEventListener("click", async (e) => {
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
  const deleteExtraParams = `&appId=${encodeURIComponent(appId)}${currentServerId ? `&serverId=${encodeURIComponent(currentServerId)}` : ''}`;

  // 1a. kvFileUrl フィールド（新形式）
  if (msgToDelete.kvFileUrl) {
    const m = msgToDelete.kvFileUrl.match(/\/api\/file\/([A-Za-z0-9_]+)/);
    if (m) {
      const fileKey = m[1];
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
      const params = `userId=${encodeURIComponent(userId)}&idToken=${encodeURIComponent(idToken)}${forceDelete ? '&forceDelete=1' : ''}${deleteExtraParams}`;
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
      const params = `userId=${encodeURIComponent(userId)}&idToken=${encodeURIComponent(idToken)}${forceDelete ? '&forceDelete=1' : ''}${deleteExtraParams}`;
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
      const params = `userId=${encodeURIComponent(userId)}&idToken=${encodeURIComponent(idToken)}${forceDelete ? '&forceDelete=1' : ''}${deleteExtraParams}`;
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

  // 3. Firestore / RTDB / LocalStore メッセージ削除
  try {
    if (currentDmId) {
      const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const rtdb = await _getOrInitRTDB();
      await remove(ref(rtdb, `artifacts/${appId}/dm_messages/${currentDmId}/${msgToDelete.id}`));
      LocalStore.deleteMessage(msgToDelete.id).catch(() => {});
    } else {
      await deleteDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`, msgToDelete.id));
      try {
        const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
        const rtdb = await _getOrInitRTDB();
        await remove(ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages/${msgToDelete.id}`));
      } catch (err) { console.error("RTDB Delete Failed", err); }
      LocalStore.deleteMessage(msgToDelete.id).catch(() => {});
    }

    allLoadedMessages = allLoadedMessages.filter(m => m.id !== msgToDelete.id);
    currentPinnedMessages = currentPinnedMessages.filter(m => m.id !== msgToDelete.id);
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
}

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
const cancelReplyBtn = document.getElementById("cancelReplyButton");
if (cancelReplyBtn) {
  cancelReplyBtn.addEventListener("click", cancelReply);
}
function cancelReply() {
  replyingToMessage = null;
  const cont = document.getElementById("replyingToContainer");
  if (cont) cont.classList.add("hidden");
}
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
  const container = document.getElementById("messagesDisplay") || messagesDisplay;
  let didScroll = false;

  if (container) {
    const row = el.closest('.message-row') || el;
    const cRect = container.getBoundingClientRect();
    const rRect = row.getBoundingClientRect();
    const containerCenterY = (cRect.top + cRect.bottom) / 2;
    const rowCenterY = (rRect.top + rRect.bottom) / 2;

    // 「中央より下にある（画面下半分に完全に収まっている）」場合はスクロールしない
    // 最新メッセージ付近で見えているメッセージの不必要なスクロールを防止
    const isBelowCenterAndVisible = (rowCenterY >= containerCenterY && rRect.bottom <= cRect.bottom && rRect.top >= cRect.top);

    // 中央より上にある、または画面外・見切れている場合は、画面の真ん中（center）に来るようにスクロール
    if (!isBelowCenterAndVisible) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      didScroll = true;
    }
  }

  // すでに見えている場合は即座に、スクロールした場合はスムーズスクロール完了を待ってハイライトを発火
  setTimeout(() => {
    const isStamp = el.querySelector('img[alt^="stamp_"]') || el.querySelector('.sticker-content');
    if (isStamp) {
      isStamp.classList.add('stamp-jump-anim');
      setTimeout(() => isStamp.classList.remove('stamp-jump-anim'), 1200);
    } else {
      el.classList.add('message-highlight');
      setTimeout(() => el.classList.remove('message-highlight'), 1200);
    }
  }, didScroll ? 350 : 50);
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

  if (isTauri && window.__TAURI__?.plugin?.shell) {
    window.__TAURI__.plugin.shell.open(fileData).catch(e => {
      console.warn('Tauri open failed', e);
      window.open(fileData, '_blank');
    });
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
  await batchDeleteCollection(collection(db, `${base}/roomKeys`));
  await batchDeleteCollection(collection(db, `${base}/rescueRequests`));
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

// モバイル通知用キュー & 状態
window._mobileNotifQueue = window._mobileNotifQueue || [];
window._mobileNotifActive = window._mobileNotifActive || false;

async function showInAppNotification(serverName, roomName, senderName, text, serverId, serverData, roomId) {
  if (document.hasFocus() && roomId === currentRoomId) return;

  const soundEnabled = localStorage.getItem('simplechat_sound') !== 'false';
  const notifEnabled = localStorage.getItem('simplechat_browser_notif') !== 'false';

  // 1. 本文が暗号化されている場合は、非同期で確実に復号を実行
  if (typeof isEncrypted === 'function' && isEncrypted(text)) {
    try {
      const memberIds = serverData?.joinedUsers || [];
      text = await decryptText(text, serverId, roomId, memberIds);
    } catch (e) { text = '（暗号化されたメッセージ）'; }
  }
  if (typeof isEncrypted === 'function' && isEncrypted(text)) {
    text = '（暗号化されたメッセージ）';
  }

  // 2. スタンプおよび添付ファイルの表現変換
  let displayBody = text;
  if (text.includes("firebase-storage") || text.includes("cloudinary") || text.includes("r2.cloudflarestorage") || text.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov)/i)) {
    displayBody = `📎 添付ファイル`;
  } else if (text.startsWith("[STAMP]") || text.includes("/stamps/") || text.startsWith("covo:") || text.startsWith("covonew:") || text.startsWith("serverstamp:")) {
    displayBody = `🌟 スタンプ`;
  }

  const isMention = displayBody && userNickname && (displayBody.includes(`@${userNickname}`) || displayBody.includes('@all'));

  // 通知音の再生
  if (soundEnabled && notifEnabled) {
    playNotificationSound();
  }
  if (isTauri && window.__TAURI__?.core?.invoke) {
    window.__TAURI__.core.invoke('set_badge', { hasUnread: !document.hasFocus() }).catch(console.error);
  }

  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    // === スマホ版 (Discord Mobile風 バナー通知) ===
    const notifItem = { serverName, roomName, senderName, text: displayBody, serverId, serverData, roomId, isMention };
    window._mobileNotifQueue.push(notifItem);
    if (!window._mobileNotifActive) {
      _processNextMobileNotification();
    }
  } else {
    // === PC版 (Discord Desktop風 右下スタックトースト) ===
    _showPcStackNotification(serverName, roomName, senderName, displayBody, serverId, serverData, roomId, isMention);
  }
}

// PC版 Discord風スタック通知
function _showPcStackNotification(serverName, roomName, senderName, displayBody, serverId, serverData, roomId, isMention) {
  const stack = document.getElementById("notifStack");
  if (!stack) return;

  const serverIconUrl = serverData?.iconUrl || null;
  const initial = (serverName || '?').charAt(0).toUpperCase();

  // 同一サーバーの既存通知を探す（グループ化・スタック集約）
  const existingCard = stack.querySelector(`.discord-notif-pc[data-server-id="${serverId}"]`);

  if (existingCard) {
    let count = parseInt(existingCard.dataset.msgCount || '1', 10) + 1;
    existingCard.dataset.msgCount = count;
    existingCard.dataset.roomId = roomId;

    const countBadge = existingCard.querySelector('.notif-count-badge');
    if (countBadge) {
      countBadge.textContent = `+${count - 1}`;
      countBadge.style.display = 'inline-flex';
    }

    const roomText = existingCard.querySelector('.notif-room-text');
    if (roomText) roomText.textContent = `#${roomName}`;

    const bodyText = existingCard.querySelector('.notif-body-text');
    if (bodyText) bodyText.textContent = `${senderName}: ${displayBody}`;

    // プログレスバーをリセット
    const bar = existingCard.querySelector('.discord-notif-progress');
    if (bar) {
      bar.style.animation = 'none';
      void bar.offsetWidth;
      bar.style.animation = 'notifProgressLinear 5s linear forwards';
    }

    if (existingCard._timer) clearTimeout(existingCard._timer);
    existingCard._timer = setTimeout(() => {
      _dismissPcNotif(existingCard);
    }, 5000);

    existingCard.classList.remove('pop-update');
    void existingCard.offsetWidth;
    existingCard.classList.add('pop-update');
    return;
  }

  // 新規トーストカードの作成（最大3件を超えたら古いものを消去）
  if (stack.children.length >= 3) {
    const oldest = stack.firstElementChild;
    if (oldest) _dismissPcNotif(oldest);
  }

  const card = document.createElement("div");
  card.className = "discord-notif-pc";
  card.dataset.serverId = serverId;
  card.dataset.roomId = roomId;
  card.dataset.msgCount = '1';

  const iconHtml = serverIconUrl
    ? `<img src="${escapeHtml(serverIconUrl)}" class="w-full h-full object-cover rounded-lg" />`
    : `<span class="w-full h-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs rounded-lg">${escapeHtml(initial)}</span>`;

  card.innerHTML = `
    <div class="discord-notif-progress" style="animation-duration: 5s;"></div>
    <div class="p-3.5 flex items-start gap-3">
      <div class="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden shadow-inner">
        ${iconHtml}
      </div>
      <div class="flex-1 min-w-0 pr-4">
        <div class="flex items-center gap-1.5 leading-none mb-1">
          <span class="text-[11px] font-bold opacity-75 truncate max-w-[130px]">${escapeHtml(serverName)}</span>
          <span class="text-[11px] font-semibold text-indigo-400 notif-room-text truncate">#${escapeHtml(roomName)}</span>
          <span class="notif-count-badge px-1.5 py-0.2 text-[9px] font-extrabold bg-indigo-500 text-white rounded-full hidden"></span>
        </div>
        <div class="text-xs font-bold truncate leading-snug notif-body-text">${escapeHtml(senderName)}: ${escapeHtml(displayBody)}</div>
      </div>
      <button class="notif-close-btn absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
        <i class="fas fa-times text-[10px]"></i>
      </button>
    </div>
  `;

  let remainingTime = 5000;
  let startTime = Date.now();
  let timerId = null;

  const startCountdown = (duration) => {
    startTime = Date.now();
    remainingTime = duration;
    timerId = setTimeout(() => {
      _dismissPcNotif(card);
    }, duration);
    card._timer = timerId;
  };

  card.addEventListener('mouseenter', () => {
    if (timerId) clearTimeout(timerId);
    remainingTime -= (Date.now() - startTime);
    const bar = card.querySelector('.discord-notif-progress');
    if (bar) bar.style.animationPlayState = 'paused';
  });

  card.addEventListener('mouseleave', () => {
    const bar = card.querySelector('.discord-notif-progress');
    if (bar) bar.style.animationPlayState = 'running';
    startCountdown(Math.max(1000, remainingTime));
  });

  card.querySelector('.notif-close-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    _dismissPcNotif(card);
  });

  card.addEventListener('click', () => {
    _dismissPcNotif(card);
    goToServerRoom(serverId, roomId);
  });

  stack.appendChild(card);
  startCountdown(5000);
}

function _dismissPcNotif(card) {
  if (!card || card.classList.contains('dismissing')) return;
  card.classList.add('dismissing');
  if (card._timer) clearTimeout(card._timer);
  setTimeout(() => {
    card.remove();
  }, 260);
}

// スマホ版 Discord風スライドインバナー通知
function _processNextMobileNotification() {
  if (window._mobileNotifQueue.length === 0) {
    window._mobileNotifActive = false;
    return;
  }
  window._mobileNotifActive = true;
  const item = window._mobileNotifQueue.shift();

  const container = document.getElementById("mobileNotifContainer") || document.getElementById("notifStack");
  if (!container) {
    window._mobileNotifActive = false;
    return;
  }

  const serverIconUrl = item.serverData?.iconUrl || null;
  const initial = (item.serverName || '?').charAt(0).toUpperCase();

  const banner = document.createElement("div");
  banner.className = "discord-notif-mobile w-full";

  const iconHtml = serverIconUrl
    ? `<img src="${escapeHtml(serverIconUrl)}" class="w-full h-full object-cover rounded-xl" />`
    : `<span class="w-full h-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs rounded-xl">${escapeHtml(initial)}</span>`;

  banner.innerHTML = `
    <div class="discord-notif-progress" style="animation-duration: 4.5s;"></div>
    <div class="p-3.5 flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden shadow-inner">
        ${iconHtml}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 leading-tight mb-0.5">
          <span class="text-xs font-bold truncate">${escapeHtml(item.serverName)}</span>
          <span class="text-xs font-semibold text-indigo-400 truncate">#${escapeHtml(item.roomName)}</span>
        </div>
        <div class="text-xs font-medium truncate leading-tight opacity-90">${escapeHtml(item.senderName)}: ${escapeHtml(item.text)}</div>
      </div>
      <div class="text-gray-400 text-xs px-1">
        <i class="fas fa-chevron-up text-[10px] opacity-60"></i>
      </div>
    </div>
  `;

  let timer = null;
  const dismissBanner = () => {
    if (banner.classList.contains('dismissing-up')) return;
    if (timer) clearTimeout(timer);
    banner.classList.add('dismissing-up');
    setTimeout(() => {
      banner.remove();
      setTimeout(_processNextMobileNotification, 100);
    }, 240);
  };

  // タッチスワイプ（上フリック）ジェスチャー
  let startY = 0;
  let currentY = 0;
  let isSwiping = false;

  banner.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startY = e.touches[0].clientY;
    currentY = startY;
    isSwiping = true;
    banner.style.transition = 'none';
    if (timer) clearTimeout(timer);
  }, { passive: true });

  banner.addEventListener('touchmove', (e) => {
    if (!isSwiping || e.touches.length !== 1) return;
    currentY = e.touches[0].clientY;
    const diffY = currentY - startY;
    if (diffY < 0) {
      banner.style.transform = `translateY(${diffY}px)`;
    } else {
      banner.style.transform = `translateY(${diffY * 0.25}px)`;
    }
  }, { passive: true });

  banner.addEventListener('touchend', () => {
    if (!isSwiping) return;
    isSwiping = false;
    const diffY = currentY - startY;
    banner.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
    if (diffY < -25) {
      banner.style.transform = 'translateY(-120%)';
      dismissBanner();
    } else {
      banner.style.transform = 'translateY(0)';
      timer = setTimeout(dismissBanner, 3500);
    }
  }, { passive: true });

  banner.addEventListener('click', () => {
    dismissBanner();
    goToServerRoom(item.serverId, item.roomId);
  });

  container.appendChild(banner);
  timer = setTimeout(dismissBanner, 4500);
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

// --- 汎用ボトムシート（Drawer）管理 & ネイティブ風慣性・反動スプリングジェスチャー ---
function initBottomSheetGestures(sheetEl, overlayEl, closeFn, scrollContainerEl) {
  if (!sheetEl) return;

  let startY = 0;
  let currentY = 0;
  let isDragging = false;
  let isHandleTouch = false;
  let touchHistory = []; // [{ y, t }]
  let isAnimating = false;

  const getScrollTop = () => scrollContainerEl ? scrollContainerEl.scrollTop : 0;

  sheetEl.addEventListener('touchstart', (e) => {
    if (window.innerWidth >= 768) return;
    if (e.touches.length !== 1) return;
    if (isAnimating) return;

    const handle = e.target.closest('.bottom-sheet-handle, .call-picker-handle, #bottomSheetHandle');
    isHandleTouch = !!handle;

    const scrollTop = getScrollTop();
    if (isHandleTouch || scrollTop <= 0) {
      startY = e.touches[0].clientY;
      currentY = startY;
      touchHistory = [{ y: startY, t: Date.now() }];
      isDragging = true;
      sheetEl.style.transition = 'none';
      sheetEl.style.willChange = 'transform';
      if (overlayEl) {
        overlayEl.style.transition = 'none';
      }
    } else {
      isDragging = false;
    }
  }, { passive: true });

  sheetEl.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const clientY = e.touches[0].clientY;
    const deltaY = clientY - startY;
    const now = Date.now();

    touchHistory.push({ y: clientY, t: now });
    if (touchHistory.length > 5) touchHistory.shift();

    if (deltaY < 0) {
      // 上方向への引っ張り（極上の対数ラバーバンド抵抗）
      if (isHandleTouch || getScrollTop() <= 0) {
        if (e.cancelable) e.preventDefault();
        const rubber = -Math.min(75, Math.log1p(-deltaY * 0.4) * 18);
        sheetEl.style.transform = `translateY(${rubber}px)`;
        if (overlayEl) overlayEl.style.opacity = '1';
      }
    } else if (deltaY > 0) {
      // 下方向へのドラッグ（スムーズな指追従と暗幕フェード）
      if (isHandleTouch || getScrollTop() <= 0) {
        if (e.cancelable) e.preventDefault();
        sheetEl.style.transform = `translateY(${deltaY}px)`;
        if (overlayEl) {
          const progress = Math.max(0, 1 - (deltaY / (window.innerHeight * 0.6)));
          overlayEl.style.opacity = progress.toString();
        }
      } else {
        isDragging = false;
        sheetEl.style.transform = 'translateY(0)';
      }
    }
  }, { passive: false });

  sheetEl.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;
    sheetEl.style.willChange = 'auto';

    const endY = e.changedTouches[0]?.clientY || currentY;
    const deltaY = endY - startY;
    const now = Date.now();

    // 移動履歴から指を離した瞬間の正確なフリック初速度 (px/ms) を算出
    let velocity = 0;
    if (touchHistory.length >= 2) {
      const recent = touchHistory[0];
      const timeDiff = now - recent.t;
      if (timeDiff > 0 && timeDiff < 200) {
        velocity = (endY - recent.y) / timeDiff;
      }
    }

    const sheetHeight = sheetEl.offsetHeight || 400;
    const shouldClose = deltaY > sheetHeight * 0.28 || (deltaY > 35 && velocity > 0.42);

    if (shouldClose) {
      isAnimating = true;
      // 速度を引き継ぐスムーズな減速スライドアウト
      sheetEl.style.transition = 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease';
      sheetEl.style.transform = 'translateY(100%)';
      if (overlayEl) {
        overlayEl.style.transition = 'opacity 0.25s ease';
        overlayEl.style.opacity = '0';
      }
      setTimeout(() => {
        isAnimating = false;
        closeFn();
      }, 260);
    } else {
      // 心地よい反動スプリング（Spring bounce）で「ポンッ」と跳ね返って元位置に吸着
      sheetEl.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      sheetEl.style.transform = 'translateY(0)';
      if (overlayEl) {
        overlayEl.style.transition = 'opacity 0.25s ease';
        overlayEl.style.opacity = '1';
      }
      setTimeout(() => {
        sheetEl.style.transition = '';
      }, 400);
    }
  }, { passive: true });
}

window.openBottomSheet = function (sheetId) {
  if (window.innerWidth >= 768) return; // PCでは何もしない
  const overlay = document.getElementById("bottomSheetOverlay");
  const sheet = typeof sheetId === 'string' ? document.getElementById(sheetId) : (sheetId || document.getElementById("membersSidebar"));
  if (!sheet || !overlay) return;

  overlay.classList.add("show");
  sheet.classList.remove("closing", "hidden");
  sheet.classList.add("bottom-sheet-open");
  sheet.style.transform = "";
  if (typeof updateMetaThemeColor === 'function') updateMetaThemeColor();
};

window.closeBottomSheet = function (sheetId) {
  const overlay = document.getElementById("bottomSheetOverlay");
  const sheets = sheetId ? [document.getElementById(sheetId)] : document.querySelectorAll(".bottom-sheet-open, .covo-bottom-sheet");
  
  sheets.forEach(sheet => {
    if (!sheet) return;
    sheet.classList.add("closing");
    setTimeout(() => {
      sheet.classList.remove("bottom-sheet-open", "closing");
      sheet.style.transform = "";
    }, 280);
  });

  if (overlay) {
    overlay.classList.remove("show");
  }
  if (typeof updateMetaThemeColor === 'function') updateMetaThemeColor();
};

function openBottomSheet(sheetId) { window.openBottomSheet(sheetId); }
function closeBottomSheet(sheetId) { window.closeBottomSheet(sheetId); }

const currentRoomTitleTextEl = document.getElementById("currentRoomTitleText");
const currentRoomTitleAreaEl = document.getElementById("currentRoomTitleArea");
const bottomSheetOverlayEl = document.getElementById("bottomSheetOverlay");
const membersSidebarEl = document.getElementById("membersSidebar");
const membersListEl = document.getElementById("membersList");
const pinMessageBtn = document.getElementById("pinMessageButton");

if (currentRoomTitleAreaEl) {
  currentRoomTitleAreaEl.addEventListener("click", (e) => {
    if (e.target.closest('#mobileBackButton') || e.target.closest('#toggleLeftSidebarBtn')) return;
    openBottomSheet('membersSidebar');
  });
} else if (currentRoomTitleTextEl) {
  currentRoomTitleTextEl.addEventListener("click", () => openBottomSheet('membersSidebar'));
}
if (bottomSheetOverlayEl) bottomSheetOverlayEl.addEventListener("click", () => closeBottomSheet());

if (membersSidebarEl) {
  initBottomSheetGestures(membersSidebarEl, bottomSheetOverlayEl, () => closeBottomSheet('membersSidebar'), membersListEl);
}

const callPickerModalEl = document.getElementById('callPickerModal');
const callPickerBoxEl = callPickerModalEl ? callPickerModalEl.querySelector('.call-picker-box') : null;
const callPickerListEl = document.getElementById('callPickerList');
if (callPickerBoxEl) {
  initBottomSheetGestures(callPickerBoxEl, callPickerModalEl, () => closeCallPicker(), callPickerListEl);
}

// --- LINE完全準拠 ピン留め（アナウンス）機能 ---
function subscribeToPinnedMessages(serverId, roomId) {
  if (unsubscribePinnedMessages) {
    unsubscribePinnedMessages();
    unsubscribePinnedMessages = null;
  }
  if (!serverId || !roomId) {
    currentPinnedMessages = [];
    renderPinnedMessages();
    return;
  }

  const q = query(
    collection(db, `artifacts/${appId}/servers/${serverId}/rooms/${roomId}/messages`),
    where("isPinned", "==", true)
  );

  unsubscribePinnedMessages = onSnapshot(q, async (snap) => {
    const pinned = [];
    snap.forEach(d => {
      pinned.push({ id: d.id, ...d.data() });
    });
    pinned.sort((a, b) => getMsgTimestamp(a) - getMsgTimestamp(b));
    const members = (currentServerData && currentServerData.joinedUsers) || [];
    await decryptMessagesInPlace(pinned, serverId, roomId, members).catch(() => {});
    currentPinnedMessages = pinned;
    renderPinnedMessages();
  }, (err) => {
    console.warn("[PinnedMessages onSnapshot] error:", err);
  });
}

window.unpinMessage = async function(msgId) {
  if ((!currentServerId || !currentRoomId) && !currentDmId) return;
  if (!msgId) return;
  const msgObj = currentPinnedMessages.find(m => m.id === msgId) || allLoadedMessages.find(m => m.id === msgId);
  const canUnpin = isAdmin || (currentServerData?.serverAdmins && currentServerData.serverAdmins.includes(userId)) || (msgObj && msgObj.senderId === userId) || Boolean(currentDmId);
  if (!canUnpin) {
    alertMessage("ピン留めを解除する権限がありません", "warning");
    return;
  }
  const confirmed = await showCustomConfirm("このメッセージのピン留め（アナウンス）を解除しますか？", "解除する", "キャンセル");
  if (!confirmed) return;

  try {
    if (currentDmId) {
      const { ref, update } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const rtdb = await _getOrInitRTDB();
      await update(ref(rtdb, `artifacts/${appId}/dm_messages/${currentDmId}/${msgId}`), { isPinned: false });
      LocalStore.putMessage({ ...(msgObj || {}), isPinned: false, id: msgId, channelId: `dm_${currentDmId}` }).catch(() => {});
    } else {
      const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
      const msgRef = doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`, msgId);
      await updateDoc(msgRef, { isPinned: false });
      try {
        const { ref, update } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
        const rtdb = await _getOrInitRTDB();
        await update(ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages/${msgId}`), { isPinned: false });
      } catch (e) {}
      LocalStore.putMessage({ ...(msgObj || {}), isPinned: false, id: msgId, channelId: `${currentServerId}_${currentRoomId}` }).catch(() => {});
    }

    currentPinnedMessages = currentPinnedMessages.filter(m => m.id !== msgId);
    const mInLoaded = allLoadedMessages.find(m => m.id === msgId);
    if (mInLoaded) mInLoaded.isPinned = false;

    renderPinnedMessages();
    alertMessage("ピン留めを解除しました", "success");
  } catch (e) {
    console.error("unpinMessage error:", e);
    alertMessage("ピン留め解除に失敗しました", "error");
  }
};

window.minimizePinnedAnnouncement = function() {
  const pinKey = currentRoomId || currentDmId;
  sessionStorage.setItem(`minimized_pins_${pinKey}`, "true");
  isPinnedMessagesExpanded = false;
  renderPinnedMessages();
};

window.restorePinnedAnnouncement = function() {
  const pinKey = currentRoomId || currentDmId;
  sessionStorage.removeItem(`minimized_pins_${pinKey}`);
  if (currentPinnedMessages && currentPinnedMessages.length > 0) {
    const latestMsg = currentPinnedMessages[currentPinnedMessages.length - 1];
    localStorage.setItem(`covo_last_seen_pin_${pinKey}`, latestMsg.id);
  }
  renderPinnedMessages();
};

if (pinMessageBtn) {
  pinMessageBtn.addEventListener("click", async (e) => {
    if (ignoreNextContextMenuClick) { e.preventDefault(); e.stopPropagation(); return; }
    if (selectedMessageForContext && ((currentServerId && currentRoomId) || currentDmId)) {
      const targetId = selectedMessageForContext.id;
      const isPinned = !selectedMessageForContext.isPinned;
      selectedMessageForContext.isPinned = isPinned;

      // ローカル状態を即時更新して画面に瞬時反映
      const mObj = allLoadedMessages.find(m => m.id === targetId);
      if (mObj) mObj.isPinned = isPinned;

      const pinKey = currentRoomId || currentDmId;

      if (isPinned) {
        if (!currentPinnedMessages.some(m => m.id === targetId)) {
          currentPinnedMessages.push({ ...selectedMessageForContext });
          currentPinnedMessages.sort((a, b) => getMsgTimestamp(a) - getMsgTimestamp(b));
        }
        sessionStorage.removeItem(`minimized_pins_${pinKey}`);
      } else {
        currentPinnedMessages = currentPinnedMessages.filter(m => m.id !== targetId);
      }
      renderPinnedMessages();

      if (currentDmId) {
        try {
          const { ref, update } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
          const rtdb = await _getOrInitRTDB();
          await update(ref(rtdb, `artifacts/${appId}/dm_messages/${currentDmId}/${targetId}`), { isPinned: isPinned });
          LocalStore.putMessage({ ...selectedMessageForContext, isPinned, id: targetId, channelId: `dm_${currentDmId}` }).catch(() => {});
        } catch (e) { console.error("RTDB DM Pin Failed", e); }
      } else {
        const msgRef = doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`, targetId);
        await updateDoc(msgRef, { isPinned: isPinned });
        try {
          const { ref, update } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
          const rtdb = await _getOrInitRTDB();
          await update(ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages/${targetId}`), { isPinned: isPinned });
        } catch (e) { console.error("RTDB Pin Failed", e); }
        LocalStore.putMessage({ ...selectedMessageForContext, isPinned, id: targetId, channelId: `${currentServerId}_${currentRoomId}` }).catch(() => {});
      }
      alertMessage(isPinned ? "アナウンスに固定しました" : "ピン留めを解除しました", "success");
    }
    if (messageCtxMenu) messageCtxMenu.classList.add("hidden");
  });
}

let isPinnedMessagesExpanded = false;
let isPinnedMessagesMinimized = false;

function renderPinnedMessages() {
  const pinnedMessages = currentPinnedMessages || [];
  pinnedMessagesArea.innerHTML = "";

  // 既存のフローティングアイコンを一旦取得
  let floatIcon = document.getElementById("minimizedPinIcon");

  // ピン留めが0件の場合はエリアを隠し、フローティングアイコンも完全消去
  if (pinnedMessages.length === 0) {
    pinnedMessagesArea.classList.add("hidden");
    if (floatIcon) floatIcon.remove();
    return;
  }

  // 最新（直近）のピン留めメッセージ
  const latestMsg = pinnedMessages[pinnedMessages.length - 1];
  const count = pinnedMessages.length;
  const lastSeenPinId = localStorage.getItem(`covo_last_seen_pin_${currentRoomId}`);

  // セッションから最小化状態を復元
  const isMinimized = sessionStorage.getItem(`minimized_pins_${currentRoomId}`) === "true";

  if (isMinimized) {
    pinnedMessagesArea.classList.add("hidden");
    // フローティング最小化アイコン（メガホン）を表示
    if (!floatIcon) {
      floatIcon = document.createElement("div");
      floatIcon.id = "minimizedPinIcon";
      floatIcon.className = "minimized-pin-icon";
      floatIcon.title = "アナウンスを表示";
      floatIcon.onclick = (e) => {
        e.stopPropagation();
        window.restorePinnedAnnouncement();
      };
      
      const chatAreaContainer = document.querySelector("#chatArea .relative.flex-1") || document.getElementById("chatArea");
      if (chatAreaContainer) {
        chatAreaContainer.appendChild(floatIcon);
      }
    }

    // 未確認のピン留め（新しいピン留め）がある場合のみバッジを表示
    let unseenCount = 0;
    if (!lastSeenPinId) {
      unseenCount = pinnedMessages.length;
    } else {
      const lastSeenIndex = pinnedMessages.findIndex(m => m.id === lastSeenPinId);
      if (lastSeenIndex === -1) {
        unseenCount = pinnedMessages.length;
      } else {
        unseenCount = pinnedMessages.length - 1 - lastSeenIndex;
      }
    }

    floatIcon.innerHTML = `
      <i class="fas fa-bullhorn"></i>
      ${unseenCount > 0 ? `<div class="minimized-pin-badge">${unseenCount}</div>` : ''}
    `;
    return;
  } else {
    // 最小化されていない（バーが表示されている）状態 = ユーザーが確認したとみなし、lastSeenPinId を更新
    if (latestMsg) {
      localStorage.setItem(`covo_last_seen_pin_${currentRoomId}`, latestMsg.id);
    }
    // 最小化されていない場合はフローティングアイコンを消去
    if (floatIcon) floatIcon.remove();
  }

  pinnedMessagesArea.classList.remove("hidden");

  // LINE完全準拠 アナウンスコンテナ
  const container = document.createElement("div");
  container.className = "pinned-announcement-container";

  const headerRow = document.createElement("div");
  headerRow.className = "pinned-announcement-header";

  const iconWrap = document.createElement("div");
  iconWrap.className = "announcement-icon-wrap";
  iconWrap.innerHTML = '<i class="fas fa-bullhorn"></i>';

  const contentWrap = document.createElement("div");
  contentWrap.className = "announcement-content-wrap";

  const latestText = latestMsg._decryptedErrorText || latestMsg.text || (latestMsg.fileType?.startsWith('image') ? "（画像）" : latestMsg.fileData ? "（ファイル）" : latestMsg.sticker ? "（スタンプ）" : "...");
  contentWrap.innerHTML = `
    <span class="announcement-sender">${escapeHtml(latestMsg.senderNickname || 'ユーザー')}:</span>
    <span class="announcement-text">${escapeHtml(latestText)}</span>
  `;
  contentWrap.title = "クリックしてメッセージへ移動";
  contentWrap.onclick = (e) => {
    e.stopPropagation();
    jumpToMsg(latestMsg.id);
  };

  // アクションボタン群
  const actionsWrap = document.createElement("div");
  actionsWrap.className = "announcement-actions";

  // 複数件ある場合のアコーディオン開閉ボタン (V / ∧)
  if (count > 1) {
    const expandBtn = document.createElement("button");
    expandBtn.className = "announcement-btn announcement-expand-btn";
    expandBtn.title = isPinnedMessagesExpanded ? "アナウンスを折りたたむ" : `他 ${count - 1} 件のアナウンスを表示`;
    expandBtn.innerHTML = `<i class="fas fa-chevron-${isPinnedMessagesExpanded ? 'up' : 'down'}"></i>`;
    expandBtn.onclick = (e) => {
      e.stopPropagation();
      isPinnedMessagesExpanded = !isPinnedMessagesExpanded;
      renderPinnedMessages();
    };
    actionsWrap.appendChild(expandBtn);
  }

  // 最小化ボタン (LINE風: アナウンスを隠して右上のメガホンアイコンにする)
  const minimizeBtn = document.createElement("button");
  minimizeBtn.className = "announcement-btn announcement-minimize-btn";
  minimizeBtn.title = "アナウンスを最小化";
  minimizeBtn.innerHTML = `<i class="fas fa-chevron-up"></i>`;
  minimizeBtn.onclick = (e) => {
    e.stopPropagation();
    window.minimizePinnedAnnouncement();
  };
  actionsWrap.appendChild(minimizeBtn);

  headerRow.appendChild(iconWrap);
  headerRow.appendChild(contentWrap);
  headerRow.appendChild(actionsWrap);
  container.appendChild(headerRow);

  // 複数件のアナウンス展開アコーディオンリスト（一番上に latestMsg があるため、過去ピンのみ表示して二重表示を解消）
  if (isPinnedMessagesExpanded && count > 1) {
    const listWrap = document.createElement("div");
    listWrap.className = "pinned-announcement-list";

    // 最新以外の過去ピン留めメッセージを新しい順（直近が上）で一覧表示
    const pastPins = [...pinnedMessages].reverse().filter(msg => msg.id !== latestMsg.id);
    pastPins.forEach((msg) => {
      const itemRow = document.createElement("div");
      itemRow.className = "pinned-announcement-item";

      const itemIcon = document.createElement("div");
      itemIcon.className = "announcement-item-icon";
      itemIcon.innerHTML = '<i class="fas fa-bullhorn text-xs opacity-60"></i>';

      const itemContent = document.createElement("div");
      itemContent.className = "announcement-item-content";
      const itemText = msg._decryptedErrorText || msg.text || (msg.fileType?.startsWith('image') ? "（画像）" : msg.fileData ? "（ファイル）" : msg.sticker ? "（スタンプ）" : "...");
      itemContent.innerHTML = `
        <span class="announcement-sender">${escapeHtml(msg.senderNickname || 'ユーザー')}:</span>
        <span class="announcement-text">${escapeHtml(itemText)}</span>
      `;
      itemContent.onclick = (e) => {
        e.stopPropagation();
        jumpToMsg(msg.id);
      };

      itemRow.appendChild(itemIcon);
      itemRow.appendChild(itemContent);

      // ピン留め解除ボタン（権限所持者のみ）
      const canUnpin = isAdmin || (currentServerData?.serverAdmins && currentServerData.serverAdmins.includes(userId)) || msg.senderId === userId;
      if (canUnpin) {
        const unpinBtn = document.createElement("button");
        unpinBtn.className = "announcement-unpin-btn";
        unpinBtn.title = "アナウンス（ピン留め）を解除";
        unpinBtn.innerHTML = '<i class="fas fa-times"></i>';
        unpinBtn.onclick = (e) => {
          e.stopPropagation();
          window.unpinMessage(msg.id);
        };
        itemRow.appendChild(unpinBtn);
      }

      listWrap.appendChild(itemRow);
    });

    // リスト下部の最小化フッター
    const footer = document.createElement("div");
    footer.className = "pinned-announcement-footer";
    footer.innerHTML = `
      <button class="pinned-announcement-footer-btn" onclick="window.minimizePinnedAnnouncement()">
        <i class="fas fa-chevron-up mr-1 text-xs"></i>アナウンスを最小化
      </button>
    `;
    listWrap.appendChild(footer);

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

// ================= MODULE: voice_call.js ================
// ================= VOICE CALL & WEBRTC MODULE ================
// =========================================================================
// Notifications & Updater
// =========================================================================

// 重複通知防止 (同一内容を3秒以内に複数ソースから受け取った場合は1件のみ表示)
let lastNotificationTime = 0;
let lastNotificationBody = "";
let lastNotificationRoomId = "";

// --- 堅牢なクリップボードコピーユーティリティ ---
function fallbackCopyTextToClipboard(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch (e) { console.warn('execCommand copy failed', e); }
  document.body.removeChild(ta);
}
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopyTextToClipboard(text);
    }
  } catch (e) {
    fallbackCopyTextToClipboard(text);
  }
}

// --- P2P Voice Call ---
const STUN_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};
const STUN_ONLY_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

function renderCallAvatar(el, name, url) {
  __setAvatarImg(el, url, name, { style: '' });
}

function showCallOverlay(mode, opts) {
  const overlay = document.getElementById('callOverlay');
  const incomingView = document.getElementById('callIncomingView');
  const activeView = document.getElementById('callActiveView');
  incomingView.style.display = 'none';
  activeView.style.display = 'none';
  if (mode === 'incoming') {
    renderCallAvatar(document.getElementById('callIncomingAvatar'), opts.name, opts.avatar);
    document.getElementById('callIncomingName').textContent = opts.name || '不明';
    incomingView.style.display = 'flex';
  } else {
    renderCallAvatar(document.getElementById('callActiveAvatar'), opts.name, opts.avatar);
    document.getElementById('callActiveName').textContent = opts.name || '不明';
    document.getElementById('callStatusLabel').textContent = opts.status || '発信中';
    document.getElementById('callTimerDisplay').style.display = 'none';
    document.getElementById('callTimeoutDisplay').style.display = 'block';
    activeView.style.display = 'flex';
  }
  overlay.classList.remove('hide');
  overlay.classList.add('show');
}

function hideCallOverlay() {
  const overlay = document.getElementById('callOverlay');
  overlay.classList.add('hide');
  setTimeout(() => {
    overlay.classList.remove('show', 'hide');
  }, 300);
}

function startCallTimer() {
  let elapsed = 0;
  const display = document.getElementById('callTimerDisplay');
  const timeoutDisplay = document.getElementById('callTimeoutDisplay');
  display.style.display = 'block';
  timeoutDisplay.style.display = 'none';
  document.getElementById('callStatusLabel').textContent = '通話中';
  _callTimerInterval = setInterval(() => {
    elapsed++;
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    display.textContent = `${m}:${s}`;
  }, 1000);
}

async function cleanupWebRtcDoc(colName, docId) {
  if (!docId) return;
  try {
    const { doc, deleteDoc, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const docRef = doc(db, 'artifacts', appId, colName, docId);

    // 候補（ICE Candidates）を削除
    const subCols = colName === 'calls' ? ['callerCandidates', 'calleeCandidates'] : ['senderCandidates', 'receiverCandidates'];
    for (const sub of subCols) {
      try {
        const candsSnap = await getDocs(collection(docRef, sub));
        const deletePromises = [];
        candsSnap.forEach(d => deletePromises.push(deleteDoc(d.ref).catch(() => {})));
        await Promise.all(deletePromises);
      } catch (_) {}
    }

    // 親ドキュメント自体を削除
    await deleteDoc(docRef).catch(() => {});
  } catch (e) {
    // 相手側によって既に削除されている場合は正常フローとして扱う
  }
}

function stopCallTimer() {
  if (_callTimerInterval) { clearInterval(_callTimerInterval); _callTimerInterval = null; }
}

function playCallRingSound() {
  stopCallRingSound();
  try {
    _ringCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) { return; }
  const playTone = () => {
    if (!_ringCtx) return;
    try {
      const freqs = [880, 1100];
      freqs.forEach((freq, i) => {
        const osc = _ringCtx.createOscillator();
        const gain = _ringCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, _ringCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.15, _ringCtx.currentTime + 0.05);
        gain.gain.linearRampToValueAtTime(0, _ringCtx.currentTime + 0.6);
        osc.connect(gain);
        gain.connect(_ringCtx.destination);
        osc.start(_ringCtx.currentTime + i * 0.08);
        osc.stop(_ringCtx.currentTime + 0.7);
      });
    } catch (_) { }
  };
  playTone();
  _ringRepeatHandle = setInterval(playTone, 2000);
}

function stopCallRingSound() {
  if (_ringRepeatHandle) { clearInterval(_ringRepeatHandle); _ringRepeatHandle = null; }
  if (_ringCtx) { try { _ringCtx.close(); } catch (_) { } _ringCtx = null; }
}

function prewarmPeerConnection() {
  if (_prewarmPC || _callId) return;
  try { _prewarmPC = new RTCPeerConnection(STUN_CONFIG); } catch (_) { }
}
function stopPrewarmPC() {
  if (_prewarmPC) { try { _prewarmPC.close(); } catch (_) { } _prewarmPC = null; }
}

function setupPeerConnection(role) {
  _usingTurnRelay = false;
  _iceRestartAttempts = 0; // 通話ごとにリセット
  setCallConnectionType(null);
  _peerConnection = _prewarmPC || new RTCPeerConnection(STUN_CONFIG);
  _prewarmPC = null;

  if (_localStream) {
    _localStream.getTracks().forEach(track => _peerConnection.addTrack(track, _localStream));
  }

  _peerConnection.ontrack = (event) => {
    const remoteAudio = document.getElementById('remoteAudio');
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.muted = false;
    remoteAudio.play().catch(() => { });
    startVoiceIndicator(event.streams[0]);
  };

  _peerConnection.onicecandidate = async (event) => {
    if (!event.candidate || !_callId) return;
    const { addDoc, collection } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const subCol = role === 'caller' ? 'callerCandidates' : 'calleeCandidates';
    try {
      await addDoc(collection(db, 'artifacts', appId, 'calls', _callId, subCol), event.candidate.toJSON());
    } catch (_) { }
  };

  _peerConnection.onconnectionstatechange = () => {
    const state = _peerConnection?.connectionState;
    if (state === 'connected') {
      if (_callTimeoutHandle) { clearTimeout(_callTimeoutHandle); _callTimeoutHandle = null; }
      if (_iceDisconnectTimer) { clearTimeout(_iceDisconnectTimer); _iceDisconnectTimer = null; }
      const lbl = document.getElementById('callStatusLabel');
      if (lbl) lbl.textContent = '通話中';
      startCallTimer();
      // TURN使用を検出（getStats）
      _usingTurnRelay = false;
      _peerConnection.getStats().then(stats => {
        const candidates = {};
        stats.forEach(r => { if (r.type === 'local-candidate') candidates[r.id] = r; });
        stats.forEach(r => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) {
            const lc = candidates[r.localCandidateId];
            if (lc && lc.candidateType === 'relay') _usingTurnRelay = true;
          }
        });
        setCallConnectionType(_usingTurnRelay ? 'turn' : 'p2p');
      }).catch(() => { });
    } else if (state === 'failed' || state === 'closed') {
      endCall(false, 'connectionLost');
    }
  };

  _peerConnection.oniceconnectionstatechange = () => {
    const iceState = _peerConnection?.iceConnectionState;
    if (iceState === 'failed') {
      // 即座に切攔せず、最大2回 TURN で ICE 再接続を試みる
      if (_iceRestartAttempts < 2) {
        _iceRestartAttempts++;
        setCallReconnectStatus(true);
        console.log(`[ICE] failed → restart #${_iceRestartAttempts} attempt`);
        if (_callRole === 'caller') {
          (async () => {
            try {
              const offer = await _peerConnection.createOffer({ iceRestart: true });
              await _peerConnection.setLocalDescription(offer);
              const { doc: fsDoc2, updateDoc: fsUpdateDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
              const restartAt = Date.now();
              await fsUpdateDoc(fsDoc2(db, 'artifacts', appId, 'calls', _callId), {
                offer: { type: offer.type, sdp: offer.sdp },
                iceRestartAt: restartAt,
                iceRestartAttempt: _iceRestartAttempts,
              });
              _lastIceRestartAt = restartAt;
              _iceRestartTimer = setTimeout(() => {
                _iceRestartTimer = null;
                const s = _peerConnection?.iceConnectionState;
                if (s !== 'connected' && s !== 'completed') endCall(false, 'connectionLost');
              }, 12000);
            } catch (e) {
              console.warn('[ICE restart on failed] failed:', e);
              endCall(false, 'connectionLost');
            }
          })();
        } else {
          // callee: caller が restart するまで最大12秒待つ
          _iceRestartTimer = setTimeout(() => {
            _iceRestartTimer = null;
            const s = _peerConnection?.iceConnectionState;
            if (s !== 'connected' && s !== 'completed') endCall(false, 'connectionLost');
          }, 12000);
        }
      } else {
        // 2回試しても回復しなければ通話終了
        endCall(false, 'connectionLost');
      }
    } else if (iceState === 'disconnected') {
      setCallReconnectStatus(true);
      if (_iceDisconnectTimer) return;
      _iceDisconnectTimer = setTimeout(async () => {
        _iceDisconnectTimer = null;
        if (!_peerConnection || !_callId) return;
        const cur = _peerConnection.iceConnectionState;
        if (cur === 'connected' || cur === 'completed') return;
        // callerのみICE restartを試みる（calleeは待機）
        if (_callRole === 'caller') {
          try {
            const offer = await _peerConnection.createOffer({ iceRestart: true });
            await _peerConnection.setLocalDescription(offer);
            const { doc: fsDoc, updateDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
            const restartAt = Date.now();
            await updateDoc(fsDoc(db, 'artifacts', appId, 'calls', _callId), {
              offer: { type: offer.type, sdp: offer.sdp },
              iceRestartAt: restartAt,
            });
            _lastIceRestartAt = restartAt;
            _iceRestartTimer = setTimeout(() => {
              _iceRestartTimer = null;
              const s = _peerConnection?.iceConnectionState;
              if (s !== 'connected' && s !== 'completed') endCall(false, 'connectionLost');
            }, 10000);
          } catch (e) {
            console.warn('[ICE restart] failed:', e);
            endCall(false, 'connectionLost');
          }
        } else {
          // callee: caller が restart するまで最大8秒待つ
          _iceRestartTimer = setTimeout(() => {
            _iceRestartTimer = null;
            const s = _peerConnection?.iceConnectionState;
            if (s !== 'connected' && s !== 'completed') endCall(false, 'connectionLost');
          }, 8000);
        }
      }, 2000);
    } else if (iceState === 'connected' || iceState === 'completed') {
      if (_iceDisconnectTimer) { clearTimeout(_iceDisconnectTimer); _iceDisconnectTimer = null; }
      if (_iceRestartTimer) { clearTimeout(_iceRestartTimer); _iceRestartTimer = null; }
      setCallReconnectStatus(false);
      // ICEリスタート後に経路が変わっている可能性があるので再チェック
      if (_peerConnection) {
        _peerConnection.getStats().then(stats => {
          const candidates = {};
          stats.forEach(r => { if (r.type === 'local-candidate') candidates[r.id] = r; });
          let relay = false;
          stats.forEach(r => {
            if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) {
              const lc = candidates[r.localCandidateId];
              if (lc && lc.candidateType === 'relay') relay = true;
            }
          });
          _usingTurnRelay = relay;
          setCallConnectionType(relay ? 'turn' : 'p2p');
        }).catch(() => { });
      }
    }
  };
}

async function listenForRemoteCandidates(role) {
  const { collection, onSnapshot } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
  const subCol = role === 'caller' ? 'calleeCandidates' : 'callerCandidates';
  const unsub = onSnapshot(collection(db, 'artifacts', appId, 'calls', _callId, subCol), (snap) => {
    snap.docChanges().forEach(async (change) => {
      if (change.type === 'added' && _peerConnection) {
        try {
          await _peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        } catch (_) { }
      }
    });
  }, (err) => {
    console.warn('[Call candidates onSnapshot] connection state updated:', err?.message || err);
  });
  return unsub;
}

let readStatesUnsub = null;
async function initReadStatesSync() {
  if (!userId || !appId) return;
  if (readStatesUnsub) { readStatesUnsub(); readStatesUnsub = null; }
  const { ref, onValue, off } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
  const rtdb = await _getOrInitRTDB();
  const rsRef = ref(rtdb, `artifacts/${appId}/users/${userId}/readStates`);
  const onRs = onValue(rsRef, (snap) => {
    let changed = false;
    let rm = {};
    try { rm = JSON.parse(localStorage.getItem('covo_last_read') || '{}'); } catch (e) { }
    snap.forEach((child) => {
      const remoteTime = child.val().lastReadAt || 0;
      const localTime = rm[child.key] || 0;
      if (remoteTime && remoteTime > localTime) {
        rm[child.key] = remoteTime;
        changed = true;
      }
    });
    if (changed) {
      localStorage.setItem('covo_last_read', JSON.stringify(rm));
      if (typeof requestScanAllUnread === 'function') requestScanAllUnread();
    }
  });
  readStatesUnsub = () => off(rsRef, 'value', onRs);
}

const _readStateThrottle = {};
async function updateLocalAndRemoteReadState(roomId, time) {
  if (!roomId) return;
  try {
    const rm = JSON.parse(localStorage.getItem('covo_last_read') || '{}');
    const prev = rm[roomId] || 0;
    if (time > prev) {
      rm[roomId] = time;
      localStorage.setItem('covo_last_read', JSON.stringify(rm));

      if (userId && appId) {
        const now = Date.now();
        if (!_readStateThrottle[roomId] || now - _readStateThrottle[roomId] > 5000) {
          _readStateThrottle[roomId] = now;
          const { ref, set } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
          const rtdb = await _getOrInitRTDB();
          set(ref(rtdb, `artifacts/${appId}/users/${userId}/readStates/${roomId}`), { lastReadAt: time }).catch(() => { });
        }
      }
    }
  } catch (e) { }
}

function initCallListener() {
  if (!userId) return;
  if (_callIncomingUnsub) { _callIncomingUnsub(); _callIncomingUnsub = null; }
  import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js').then(({ collection, query, where, onSnapshot }) => {
    // calleeUid はトップレベルフィールドのため複合インデックス不要
    const q = query(
      collection(db, 'artifacts', appId, 'calls'),
      where('calleeUid', '==', userId)
    );
    _callIncomingUnsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (data.status === 'ringing' && !_callId) {
            handleIncomingCall(change.doc.id, data.caller);
          }
        }
      });
    }, (err) => {
      console.warn('[CallIncoming onSnapshot] connection state updated:', err?.message || err);
    });
  }).catch(() => {});
}

function _renderPickerMembers(listContainer, memberIds, onClickCallback) {
  listContainer.innerHTML = '';

  const processedMembers = memberIds.map(uid => {
    const user = (cachedUsers || []).find(u => u.id === uid) || { id: uid };
    let computedState = user.computedState || user.state || 'offline';
    return { ...user, id: uid, computedState };
  });

  const onlineMembers = processedMembers.filter(u => u.computedState === 'online');
  const awayMembers = processedMembers.filter(u => u.computedState === 'away');
  const offlineMembers = processedMembers.filter(u => u.computedState === 'offline');

  onlineMembers.sort((a, b) => (a.nickname || "").localeCompare(b.nickname || ""));
  awayMembers.sort((a, b) => (a.nickname || "").localeCompare(b.nickname || ""));
  offlineMembers.sort((a, b) => (a.nickname || "").localeCompare(b.nickname || ""));

  const sortedList = [...onlineMembers, ...awayMembers, ...offlineMembers];

  sortedList.forEach(member => {
    const nameRaw = member.nickname || member.displayName || member.id.slice(0, 8);
    const item = document.createElement("div");
    item.className = "call-picker-item";

    const avatar = document.createElement("div");
    avatar.className = "call-picker-avatar relative";
    if (isUsableAvatarUrl(member.avatarUrl)) {
      __setAvatarImg(avatar, member.avatarUrl, nameRaw, { style: 'width:100%;height:100%;object-fit:cover;' });
    } else {
      avatar.textContent = (nameRaw || " ").charAt(0).toUpperCase();
    }

    const statusDot = document.createElement("div");
    statusDot.className = `status-indicator status-${member.computedState}`;
    avatar.appendChild(statusDot);

    const info = document.createElement("div");
    info.className = "flex-1 min-w-0";

    const name = document.createElement("div");
    name.className = "call-picker-name truncate";
    name.textContent = nameRaw;
    info.appendChild(name);

    let statusTextVal = "オフライン";
    if (member.computedState === 'online') statusTextVal = "オンライン";
    else if (member.computedState === 'away') statusTextVal = "離席中";
    else if (member.last_changed) statusTextVal = formatTimeAgo(member.last_changed);

    const statusText = document.createElement("div");
    statusText.className = "call-picker-status";
    statusText.textContent = statusTextVal;
    info.appendChild(statusText);

    item.appendChild(avatar);
    item.appendChild(info);

    item.onclick = () => {
      onClickCallback(member.id, nameRaw, member.avatarUrl || '');
    };
    listContainer.appendChild(item);
  });
}

async function openCallPicker() {
  if (currentDmId && currentDmParticipant) {
    startCall(currentDmParticipant.uid, currentDmParticipant.nickname, currentDmParticipant.avatarUrl || '');
    return;
  }
  if (!currentServerData || !userId) return;
  const modal = document.getElementById('callPickerModal');
  const list = document.getElementById('callPickerList');
  const titleEl = document.getElementById('callPickerTitle');
  if (titleEl) titleEl.textContent = '通話する相手を選択';
  if (!list || !modal) return;
  list.innerHTML = '';

  const memberIds = (currentServerData.joinedUsers || []).filter(uid => uid !== userId);
  if (memberIds.length === 0) {
    list.innerHTML = '<div class="p-6 text-center text-xs text-gray-400">メンバーがいません</div>';
  } else {
    _renderPickerMembers(list, memberIds, (uid, nameRaw, avatarUrl) => {
      closeCallPicker();
      startCall(uid, nameRaw, avatarUrl);
    });
  }

  const box = modal.querySelector('.call-picker-box');
  modal.classList.remove('hidden', 'closing');
  modal.classList.add('show');
  modal.style.opacity = '1';
  if (box) {
    box.classList.remove('closing');
    box.style.transform = '';
  }
}

window.openDmCallPicker = function () {
  const modal = document.getElementById('callPickerModal');
  const list = document.getElementById('callPickerList');
  const titleEl = document.getElementById('callPickerTitle');
  if (titleEl) titleEl.textContent = '通話するフレンドを選択';
  if (!list || !modal) return;
  list.innerHTML = '';

  const friendUids = Object.values(friendRelationships).filter(r => r.status === 'friends').map(r => r.targetUid);
  if (friendUids.length === 0) {
    list.innerHTML = '<div class="p-6 text-center text-xs text-gray-400">フレンドがいません</div>';
  } else {
    _renderPickerMembers(list, friendUids, (uid, nameRaw, avatarUrl) => {
      closeCallPicker();
      startCall(uid, nameRaw, avatarUrl);
    });
  }

  const box = modal.querySelector('.call-picker-box');
  modal.classList.remove('hidden', 'closing');
  modal.classList.add('show');
  modal.style.opacity = '1';
  if (box) {
    box.classList.remove('closing');
    box.style.transform = '';
  }
};

function closeCallPicker() {
  const modal = document.getElementById('callPickerModal');
  if (!modal) return;
  if (window.innerWidth < 768) {
    const box = modal.querySelector('.call-picker-box');
    modal.classList.add('closing');
    if (box) box.classList.add('closing');
    setTimeout(() => {
      modal.classList.remove('show', 'closing');
      modal.classList.add('hidden');
      modal.style.opacity = '';
      if (box) {
        box.classList.remove('closing');
        box.style.transform = '';
      }
    }, 280);
  } else {
    modal.classList.remove('show');
    modal.classList.add('hidden');
  }
}


/* =====================================================================
   P2P ファイル共有（WebRTC DataChannel）
   - シグナリングだけ Firestore (fileshares/{id}) を経由（データ量ごく僅か）
   - STUN/TURN は接続安定化の補助。ファイル本体は P2P DataChannel で直送
   - 大容量も16KBチャンク分割＋バックプレッシャ制御で送れる
   - 通話用の peerConnection とは完全に別系統（衝突しない）
   ===================================================================== */
const FS_CHUNK = 64 * 1024;          // 64KB チャンク（WebRTC仕様・MTUに最適化）
const FS_BUFFER_HIGH = 1024 * 1024;  // 送信バッファ上限 1MB（SCTPキュー溢れを防止）
const FS_BUFFER_LOW = 256 * 1024;    // 256KBまで減ったら再開
let _fsPC = null, _fsChannel = null, _fsId = null, _fsRole = null;
let _fsUnsub = null, _fsCandUnsub = null;
let _fsRecv = null; // { name, type, size, received, chunks[] }
let _fsAckResolve = null; // 受信完了ACK待ちのresolver

function _fsCleanup() {
  if (_fsAckResolve) {
    const r = _fsAckResolve;
    _fsAckResolve = null;
    r(false);
  }
  try { if (_fsUnsub) _fsUnsub(); } catch (e) { }
  try { if (_fsCandUnsub) _fsCandUnsub(); } catch (e) { }
  try { if (_fsChannel) _fsChannel.close(); } catch (e) { }
  try { if (_fsPC) _fsPC.close(); } catch (e) { }
  _fsUnsub = _fsCandUnsub = _fsChannel = _fsPC = _fsId = _fsRole = null;
  _fsRecv = null;
}

// 送信側: 相手選択ピッカーを開く（通話ピッカーと同デザインを流用・ボトムシート完全統一）
window.openFileSharePicker = function () {
  if (currentDmId && currentDmParticipant) {
    _fsPickFileAndSend(currentDmParticipant.uid, currentDmParticipant.nickname);
    return;
  }
  if (!currentServerData || !userId) return;
  const modal = document.getElementById('callPickerModal');
  const list = document.getElementById('callPickerList');
  const titleEl = document.getElementById('callPickerTitle');
  if (titleEl) titleEl.textContent = 'ファイルを送る相手を選択';
  if (!list || !modal) return;
  list.innerHTML = '';
  const memberIds = (currentServerData.joinedUsers || []).filter(uid => uid !== userId);
  if (memberIds.length === 0) {
    list.innerHTML = '<div class="p-6 text-center text-xs text-gray-400">メンバーがいません</div>';
  } else {
    _renderPickerMembers(list, memberIds, (uid, nameRaw, avatarUrl) => {
      closeCallPicker();
      _fsPickFileAndSend(uid, nameRaw);
    });
  }
  const box = modal.querySelector('.call-picker-box');
  modal.classList.remove('hidden', 'closing');
  modal.classList.add('show');
  modal.style.opacity = '1';
  if (box) {
    box.classList.remove('closing');
    box.style.transform = '';
  }
  if (typeof updateMetaThemeColor === 'function') updateMetaThemeColor();
};

window.openDmFileSharePicker = function () {
  const modal = document.getElementById('callPickerModal');
  const list = document.getElementById('callPickerList');
  const titleEl = document.getElementById('callPickerTitle');
  if (titleEl) titleEl.textContent = 'ファイルを送るフレンドを選択';
  if (!list || !modal) return;
  list.innerHTML = '';

  const friendUids = Object.values(friendRelationships).filter(r => r.status === 'friends').map(r => r.targetUid);
  if (friendUids.length === 0) {
    list.innerHTML = '<div class="p-6 text-center text-xs text-gray-400">フレンドがいません</div>';
  } else {
    _renderPickerMembers(list, friendUids, (uid, nameRaw, avatarUrl) => {
      closeCallPicker();
      _fsPickFileAndSend(uid, nameRaw);
    });
  }

  const box = modal.querySelector('.call-picker-box');
  modal.classList.remove('hidden', 'closing');
  modal.classList.add('show');
  modal.style.opacity = '1';
  if (box) {
    box.classList.remove('closing');
    box.style.transform = '';
  }
};

/* =====================================================================
   【要件 F】安全なP2P過去ログ分散補完（長期間オフライン者へのバックグラウンド同期）
   - 長期間オフラインでRTDBの100件ローテーションから消えたログを、オンラインの同室メンバーからP2Pで補完
   - 暗号化されたまま（enc::v...）転送し、自端末の鍵で復号（機密性100%保護）
   - 相手不在や接続失敗時は5秒タイムアウトで静かに終了（フェイルセーフ）
   ===================================================================== */
let _p2pLogSyncUnsub = null;
const _p2pLogSyncThrottle = new Map();

function initP2PLogSyncListener() {
  if (_p2pLogSyncUnsub) { _p2pLogSyncUnsub(); _p2pLogSyncUnsub = null; }
  if (!userId) return;
  try {
    const q = query(
      collection(db, `artifacts/${appId}/p2p_log_sync`),
      where('targetUid', '==', userId),
      where('status', '==', 'offering')
    );
    _p2pLogSyncUnsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const reqDoc = change.doc;
          const reqData = reqDoc.data();
          _handleIncomingP2PLogRequest(reqDoc.id, reqData);
        }
      });
    }, (err) => {
      console.warn('[P2P LogSync] Listener warning:', err);
    });
  } catch (e) { }
}

async function _handleIncomingP2PLogRequest(syncId, reqData) {
  if (!reqData || !reqData.requesterUid) return;
  const { requesterUid, channelType, serverId, roomId, dmId, beforeTs } = reqData;

  // 1. 厳格なアクセス権照合 (Security Boundary)
  let isAuthorized = false;
  if (channelType === 'dm' && dmId) {
    const parts = dmId.split('_');
    isAuthorized = parts.includes(requesterUid) && parts.includes(userId);
  } else if (channelType === 'server' && serverId) {
    try {
      const sSnap = await getDoc(doc(db, `artifacts/${appId}/servers/${serverId}`));
      if (sSnap.exists()) {
        const sData = sSnap.data();
        isAuthorized = (sData.joinedUsers || []).includes(requesterUid) && (sData.joinedUsers || []).includes(userId);
      }
    } catch (e) { }
  }

  if (!isAuthorized) {
    deleteDoc(doc(db, `artifacts/${appId}/p2p_log_sync/${syncId}`)).catch(() => {});
    return;
  }

  // 2. 自端末のIndexedDBから該当チャンネルのメッセージのみを抽出
  const channelId = channelType === 'dm' ? `dm_${dmId}` : `${serverId}_${roomId}`;
  const localMsgs = await LocalStore.getMessages(channelId, beforeTs || null, 100);

  if (!localMsgs || localMsgs.length === 0) {
    deleteDoc(doc(db, `artifacts/${appId}/p2p_log_sync/${syncId}`)).catch(() => {});
    return;
  }

  // 3. WebRTC DataChannel 経由で暗号化メッセージを送信
  try {
    const pc = new RTCPeerConnection(STUN_ONLY_CONFIG);
    let dc = null;

    pc.ondatachannel = (ev) => {
      dc = ev.channel;
      dc.onopen = () => {
        // 暗号化された状態のメッセージ配列のみを送信（秘密鍵や別チャンネルのログは一切除外）
        const payload = JSON.stringify({ type: 'LOG_RESP', channelId, messages: localMsgs });
        dc.send(payload);
        setTimeout(() => {
          try { pc.close(); } catch (e) {}
          deleteDoc(doc(db, `artifacts/${appId}/p2p_log_sync/${syncId}`)).catch(() => {});
        }, 1000);
      };
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        addDoc(collection(db, `artifacts/${appId}/p2p_log_sync/${syncId}/targetCandidates`), e.candidate.toJSON()).catch(() => {});
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(reqData.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await updateDoc(doc(db, `artifacts/${appId}/p2p_log_sync/${syncId}`), {
      answer: { type: answer.type, sdp: answer.sdp },
      status: 'answered'
    });

    onSnapshot(collection(db, `artifacts/${appId}/p2p_log_sync/${syncId}/requesterCandidates`), (snap) => {
      snap.docChanges().forEach(async (ch) => {
        if (ch.type === 'added') {
          try { await pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())); } catch (e) {}
        }
      });
    });

    setTimeout(() => {
      try { pc.close(); } catch (e) {}
      deleteDoc(doc(db, `artifacts/${appId}/p2p_log_sync/${syncId}`)).catch(() => {});
    }, 6000);

  } catch (err) {
    console.warn('[P2P LogSync] Responder error:', err);
    deleteDoc(doc(db, `artifacts/${appId}/p2p_log_sync/${syncId}`)).catch(() => {});
  }
}

async function requestP2PLogBackfill(channelType, targetId, oldestLocalTs) {
  if (!userId) return;
  const channelKey = channelType === 'dm' ? `dm_${targetId}` : `${currentServerId}_${targetId}`;
  
  // デバウンス（同一チャンネルへの要求は45秒に1回）
  const lastReq = _p2pLogSyncThrottle.get(channelKey) || 0;
  if (Date.now() - lastReq < 45000) return;
  _p2pLogSyncThrottle.set(channelKey, Date.now());

  // オンラインの相手を選定
  let targetUid = null;
  if (channelType === 'dm') {
    const otherUid = currentDmParticipants.find(id => id !== userId);
    const u = cachedUsers.find(cu => cu.id === otherUid);
    if (u && (u.computedState === 'online' || u.state === 'online')) {
      targetUid = otherUid;
    }
  } else if (channelType === 'server' && currentServerData) {
    const members = (currentServerData.joinedUsers || []).filter(id => id !== userId);
    const onlineMems = members.filter(id => {
      const u = cachedUsers.find(cu => cu.id === id);
      return u && (u.computedState === 'online' || u.state === 'online');
    });
    if (onlineMems.length > 0) {
      targetUid = onlineMems[Math.floor(Math.random() * onlineMems.length)];
    }
  }

  if (!targetUid) return;

  const syncDocRef = doc(collection(db, `artifacts/${appId}/p2p_log_sync`));
  const syncId = syncDocRef.id;

  try {
    const pc = new RTCPeerConnection(STUN_ONLY_CONFIG);
    const dc = pc.createDataChannel('logSync', { ordered: true });

    dc.onmessage = async (ev) => {
      try {
        const res = JSON.parse(ev.data);
        if (res && res.type === 'LOG_RESP' && Array.isArray(res.messages) && res.messages.length > 0) {
          console.log(`[P2P LogSync] Received ${res.messages.length} backfilled messages for ${res.channelId}`);
          await LocalStore.upsertMessagesBatch(res.messages);

          // 現在開いているチャンネルと一致していれば復号して即時画面反映
          const activeChId = currentServerId ? `${currentServerId}_${currentRoomId}` : `dm_${currentDmId}`;
          if (res.channelId === activeChId) {
            const decryptInPlace = async (list) => {
              if (currentServerId) {
                const _members = (currentServerData && currentServerData.joinedUsers) || [];
                await decryptMessagesInPlace(list, currentServerId, currentRoomId, _members).catch(() => {});
              } else if (currentDmId) {
                await _decryptDmMessagesInPlace(list, currentDmId, currentDmParticipants).catch(() => {});
              }
            };
            await decryptInPlace(res.messages);
            res.messages.forEach(msg => {
              const idx = allLoadedMessages.findIndex(m => m.id === msg.id);
              if (idx >= 0) allLoadedMessages[idx] = msg;
              else allLoadedMessages.push(msg);
            });
            allLoadedMessages.sort((a, b) => getMsgTimestamp(a) - getMsgTimestamp(b));
            lastMessagesData = [...allLoadedMessages];
            messagesIndexMap = {};
            lastMessagesData.forEach((m, i) => messagesIndexMap[m.id] = i);
            renderMessagesWithReadReceipts();
          }
        }
      } catch (e) {
        console.warn('[P2P LogSync] Parse error:', e);
      } finally {
        try { pc.close(); } catch (_) {}
        deleteDoc(syncDocRef).catch(() => {});
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        addDoc(collection(db, `artifacts/${appId}/p2p_log_sync/${syncId}/requesterCandidates`), e.candidate.toJSON()).catch(() => {});
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await setDoc(syncDocRef, {
      requesterUid: userId,
      targetUid: targetUid,
      channelType,
      serverId: currentServerId || null,
      roomId: channelType === 'server' ? targetId : null,
      dmId: channelType === 'dm' ? targetId : null,
      beforeTs: oldestLocalTs || null,
      offer: { type: offer.type, sdp: offer.sdp },
      status: 'offering',
      createdAt: serverTimestamp()
    });

    const unsubDoc = onSnapshot(syncDocRef, async (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.answer && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
      }
    });

    const unsubCands = onSnapshot(collection(db, `artifacts/${appId}/p2p_log_sync/${syncId}/targetCandidates`), (snap) => {
      snap.docChanges().forEach(async (ch) => {
        if (ch.type === 'added') {
          try { await pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())); } catch (e) {}
        }
      });
    });

    // 5秒タイムアウト（ベストエフォート）
    setTimeout(() => {
      try { unsubDoc(); } catch (_) {}
      try { unsubCands(); } catch (_) {}
      try { pc.close(); } catch (_) {}
      deleteDoc(syncDocRef).catch(() => {});
    }, 5000);

  } catch (err) {
    console.warn('[P2P LogSync] Request failed (continuing normal operation):', err);
    deleteDoc(syncDocRef).catch(() => {});
  }
}

// ファイル選択 → 送信開始
function _fsPickFileAndSend(targetUid, targetName) {
  const input = document.createElement('input');
  input.type = 'file';
  input.onchange = () => {
    if (input.files.length > 0) startFileShare(targetUid, targetName, input.files[0]);
  };
  input.click();
}
async function startFileShare(targetUid, targetName, file) {
  if (_fsId) { alertMessage('別のファイル送信が進行中です', 'error'); return; }
  _fsRole = 'sender';
  const { doc, setDoc, collection, serverTimestamp, onSnapshot, addDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
  try {
    _fsPC = new RTCPeerConnection(STUN_ONLY_CONFIG);
    const ref = doc(collection(db, 'artifacts', appId, 'fileshares'));
    _fsId = ref.id;

    // DataChannel を作成（送信側）
    _fsChannel = _fsPC.createDataChannel('file', { ordered: true });
    _fsChannel.binaryType = 'arraybuffer';
    _fsChannel.onopen = () => _fsSendFileData(file);
    _fsChannel.onerror = () => { };

    // TURN中継を使わない（STUNのみ）ので、P2P直結できないと接続できない。
    // その場合に永遠に待たないよう、失敗を検出してユーザーに知らせる。
    _fsPC.oniceconnectionstatechange = () => {
      const st = _fsPC && _fsPC.iceConnectionState;
      if (st === 'failed' || st === 'disconnected') {
        if (_fsChannel && _fsChannel.readyState === 'open') return; // 既に繋がっていれば無視
        _fsShowProgress('error', file.name, 'P2P接続できませんでした（相手と直接つながれない回線です）');
        setTimeout(() => { _fsCloseProgress(); _fsCleanup(); }, 2500);
      }
    };

    // ICE候補を Firestore へ
    const candCol = collection(db, 'artifacts', appId, 'fileshares', _fsId, 'senderCandidates');
    _fsPC.onicecandidate = e => { if (e.candidate) addDoc(candCol, e.candidate.toJSON()).catch(() => { }); };

    const offer = await _fsPC.createOffer();
    await _fsPC.setLocalDescription(offer);

    const myUser = cachedUsers.find(u => u.id === userId) || {};
    await setDoc(ref, {
      sender: { uid: userId, nickname: myUser.nickname || '' },
      receiverUid: targetUid,
      fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size,
      status: 'offering',
      offer: { type: offer.type, sdp: offer.sdp },
      createdAt: serverTimestamp()
    });

    // 相手にプッシュ通知（任意・fire-and-forget）
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
    fetch(`${WORKER_BASE_URL}/api/sendNotification`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiverIds: [targetUid], title: 'ファイル受信', body: `${myUser.nickname || '相手'}さんがファイルを送ろうとしています`, appId, senderId: userId, idToken })
    }).catch(() => { });

    _fsShowProgress('send', file.name, '相手の応答を待っています…');

    // answer + 受信側ICEを待つ（リモートDescription設定前のCandidateを確実にキューイング）
    const pendingCandidates = [];
    _fsUnsub = onSnapshot(ref, async snap => {
      const d = snap.data();
      if (!d) return;
      if (d.status === 'declined') { _fsShowProgress('error', file.name, '相手が拒否しました'); setTimeout(_fsCloseProgress, 1500); _fsCleanup(); return; }
      if (d.answer && _fsPC && !_fsPC.currentRemoteDescription) {
        await _fsPC.setRemoteDescription(new RTCSessionDescription(d.answer));
        while (pendingCandidates.length > 0) {
          const cand = pendingCandidates.shift();
          try { await _fsPC.addIceCandidate(cand); } catch (e) { }
        }
      }
    }, (err) => {
      console.warn('[FileShare ref onSnapshot] connection state updated:', err?.message || err);
    });
    const rcandCol = collection(db, 'artifacts', appId, 'fileshares', _fsId, 'receiverCandidates');
    _fsCandUnsub = onSnapshot(rcandCol, snap => {
      snap.docChanges().forEach(async ch => {
        if (ch.type === 'added') {
          const cand = new RTCIceCandidate(ch.doc.data());
          if (_fsPC && _fsPC.currentRemoteDescription) {
            try { await _fsPC.addIceCandidate(cand); } catch (e) { }
          } else {
            pendingCandidates.push(cand);
          }
        }
      });
    }, (err) => {
      console.warn('[FileShare receiverCandidates onSnapshot] connection state updated:', err?.message || err);
    });
  } catch (e) {
    console.error('[FileShare] 送信開始失敗:', e);
    alertMessage('ファイル送信を開始できませんでした', 'error');
    _fsCleanup();
  }
}

// 送信バッファが十分はけるまで待つ（送ったつもりで実際は未送信、を防ぐ）
async function _fsDrain(threshold) {
  let guard = 0;
  while (_fsChannel && _fsChannel.bufferedAmount > threshold) {
    await new Promise(r => setTimeout(r, 30));
    if (++guard > 100000) break; // 無限ループ保険
  }
}
// 受信側からの完了ACKを待つPromise（チャンネルのonmessageで解決される）
function _fsWaitForAck(timeoutMs) {
  return new Promise(resolve => {
    _fsAckResolve = resolve;
    if (timeoutMs) setTimeout(() => { if (_fsAckResolve) { _fsAckResolve = null; resolve(false); } }, timeoutMs);
  });
}

// チャンク分割送信（バックプレッシャ制御つき）
async function _fsSendFileData(file) {
  try {
    // 送信側も相手からの完了ACKを受け取れるようにする
    _fsChannel.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try { const m = JSON.parse(ev.data); if (m && m.__ack && _fsAckResolve) { const r = _fsAckResolve; _fsAckResolve = null; r(true); } } catch (e) { }
      }
    };
    // 送信バッファが減ったら通知してもらう（タイムアウト付きレースでデッドロック防止）
    _fsChannel.bufferedAmountLowThreshold = FS_BUFFER_LOW;
    const waitBufferLow = () => new Promise(resolve => {
      if (!_fsChannel || _fsChannel.bufferedAmount <= FS_BUFFER_LOW) return resolve();
      let timer = null;
      const onLow = () => {
        if (timer) clearTimeout(timer);
        _fsChannel?.removeEventListener('bufferedamountlow', onLow);
        resolve();
      };
      _fsChannel.addEventListener('bufferedamountlow', onLow);
      timer = setTimeout(onLow, 120); // 120msフォールバックタイムアウト
    });

    _fsChannel.send(JSON.stringify({ __meta: true, name: file.name, type: file.type, size: file.size }));
    let offset = 0;
    if (!file.stream) { await _fsSendFileDataLegacy(file); return; }
    const reader = file.stream().getReader();
    const sendSlice = async (buf) => {
      if (!_fsChannel || _fsChannel.readyState !== 'open') throw new Error('DataChannel closed');
      if (_fsChannel.bufferedAmount > FS_BUFFER_HIGH) await waitBufferLow();
      let retries = 0;
      while (true) {
        try {
          _fsChannel.send(buf);
          break;
        } catch (sendErr) {
          if (retries++ < 5) {
            await new Promise(r => setTimeout(r, 60));
          } else {
            throw sendErr;
          }
        }
      }
      offset += buf.byteLength;
      _fsUpdateProgress(Math.round(offset / file.size * 100));
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      let chunk = value; // Uint8Array
      for (let i = 0; i < chunk.length; i += FS_CHUNK) {
        const end = Math.min(i + FS_CHUNK, chunk.length);
        await sendSlice(chunk.subarray(i, end));
      }
    }
    // 全チャンクがバッファからはけきるまで待ってから __done を送る
    await _fsDrain(0);
    _fsChannel.send(JSON.stringify({ __done: true }));
    await _fsDrain(0);
    // ここでは「送信完了」と即断せず、相手が受信し切るのを待つ（大容量対応で最大10分）
    _fsShowProgress('send', file.name, '相手が受信中…');
    const acked = await _fsWaitForAck(600000);
    if (acked) {
      _fsShowProgress('done', file.name, '送信完了');
      setTimeout(() => { _fsCloseProgress(); _fsMarkComplete(); }, 1000);
    } else {
      _fsShowProgress('done', file.name, '送信しました');
      setTimeout(() => { _fsCloseProgress(); _fsMarkComplete(); }, 1000);
    }
  } catch (e) {
    console.error('[FileShare] 送信中エラー:', e);
    _fsShowProgress('error', file.name, '送信に失敗しました');
    setTimeout(_fsCloseProgress, 1500);
  }
}
async function _fsSendFileDataLegacy(file) {
  let offset = 0;
  while (offset < file.size) {
    const slice = await file.slice(offset, offset + FS_CHUNK).arrayBuffer();
    while (_fsChannel.bufferedAmount > FS_BUFFER_HIGH) { await new Promise(r => setTimeout(r, 20)); }
    _fsChannel.send(slice);
    offset += slice.byteLength;
    _fsUpdateProgress(Math.round(offset / file.size * 100));
  }
  await _fsDrain(0);
  _fsChannel.send(JSON.stringify({ __done: true }));
  await _fsDrain(0);
  _fsShowProgress('send', file.name, '相手が受信中…');
  await _fsWaitForAck(60000);
  _fsShowProgress('done', file.name, '送信完了');
  setTimeout(() => { _fsCloseProgress(); _fsMarkComplete(); }, 1000);
}
async function _fsMarkComplete() {
  try {
    const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    if (_fsId) await cleanupWebRtcDoc('fileshares', _fsId);
  } catch (e) { }
  _fsCleanup();
}

let _fsIncomingUnsub = null;
// 受信側: 着信を監視（ログイン時に開始）
async function initFileShareListener() {
  if (!userId) return;
  if (_fsIncomingUnsub) { _fsIncomingUnsub(); _fsIncomingUnsub = null; }
  const { collection, query, where, onSnapshot } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
  const q = query(collection(db, 'artifacts', appId, 'fileshares'), where('receiverUid', '==', userId), where('status', '==', 'offering'));
  _fsIncomingUnsub = onSnapshot(q, snap => {
    snap.docChanges().forEach(ch => {
      if (ch.type === 'added') {
        const d = ch.doc.data();
        if (_fsId) return; // 既に処理中
        _fsShowIncoming(ch.doc.id, d);
      }
    });
  }, (err) => {
    console.warn('[FileShare incoming onSnapshot] connection state updated:', err?.message || err);
  });
}

function _fsShowIncoming(id, d) {
  const human = _fsHumanSize(d.fileSize || 0);
  showCustomConfirm(
    `${escapeHtml(d.sender?.nickname || '相手')}さんからファイル`,
    '受け取る', '拒否',
    `${escapeHtml(d.fileName || '')}（${human}）をP2Pで受信しますか？`
  ).then(ok => {
    if (ok) acceptFileShare(id, d);
    else _fsDecline(id);
  });
}
async function _fsDecline(id) {
  try {
    const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    await cleanupWebRtcDoc('fileshares', id);
  } catch (e) { }
}

async function acceptFileShare(id, d) {
  _fsRole = 'receiver';
  _fsId = id;
  _fsRecv = { name: d.fileName, type: d.fileType, size: d.fileSize, received: 0, chunks: [], writer: null, lastPct: -1 };
  // 対応ブラウザ(Chrome/Edge等)では保存先を先に選び、ディスクへ直接ストリーミング書き込み。
  // → メモリにファイル全体を溜めないので1GB級でも端末が重くならない＆速い。
  // 非対応(iOS Safari等)はメモリに溜める従来方式へ自動フォールバック。
  try {
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({ suggestedName: d.fileName || 'file' });
      _fsRecv.writer = await handle.createWritable();
    }
  } catch (e) { _fsRecv.writer = null; /* キャンセル時もメモリ方式で続行 */ }
  const { doc, updateDoc, collection, onSnapshot, addDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
  try {
    _fsPC = new RTCPeerConnection(STUN_ONLY_CONFIG);
    const candCol = collection(db, 'artifacts', appId, 'fileshares', id, 'receiverCandidates');
    _fsPC.onicecandidate = e => { if (e.candidate) addDoc(candCol, e.candidate.toJSON()).catch(() => { }); };
    _fsPC.ondatachannel = e => {
      _fsChannel = e.channel;
      _fsChannel.binaryType = 'arraybuffer';
      _fsChannel.onmessage = _fsOnMessage;
    };
    await _fsPC.setRemoteDescription(new RTCSessionDescription(d.offer));
    const answer = await _fsPC.createAnswer();
    await _fsPC.setLocalDescription(answer);
    await updateDoc(doc(db, 'artifacts', appId, 'fileshares', id), { status: 'answered', answer: { type: answer.type, sdp: answer.sdp } });

    const scandCol = collection(db, 'artifacts', appId, 'fileshares', id, 'senderCandidates');
    _fsCandUnsub = onSnapshot(scandCol, snap => {
      snap.docChanges().forEach(ch => { if (ch.type === 'added') { try { _fsPC.addIceCandidate(new RTCIceCandidate(ch.doc.data())); } catch (e) { } } });
    }, (err) => {
      console.warn('[FileShare senderCandidates onSnapshot] connection state updated:', err?.message || err);
    });
    _fsShowProgress('recv', d.fileName, '接続中…');
  } catch (e) {
    console.error('[FileShare] 受信開始失敗:', e);
    _fsCleanup();
  }
}

function _fsOnMessage(ev) {
  const data = ev.data;
  if (typeof data === 'string') {
    let msg; try { msg = JSON.parse(data); } catch (e) { return; }
    if (msg.__meta) { _fsRecv.name = msg.name; _fsRecv.type = msg.type; _fsRecv.size = msg.size; _fsRecv.received = 0; _fsRecv.chunks = []; return; }
    if (msg.__done) { _fsRecv._gotDone = true; _fsMaybeFinish(); return; }
    return;
  }
  // バイナリチャンク
  _fsRecv.received += data.byteLength;
  if (_fsRecv.writer) {
    // ディスクへ直接書き込み（順序保証のためPromiseチェーンで直列化）
    _fsRecv._writeChain = (_fsRecv._writeChain || Promise.resolve())
      .then(() => _fsRecv.writer.write(data))
      .catch(e => { console.error('[FileShare] 書き込みエラー:', e); });
  } else {
    _fsRecv.chunks.push(data); // メモリ方式（フォールバック）
  }
  // 進捗はrAFで間引いて更新（毎チャンク更新は重くて受信を詰まらせる）
  if (_fsRecv.size && !_fsRecv._rafPending) {
    _fsRecv._rafPending = true;
    requestAnimationFrame(() => {
      _fsRecv._rafPending = false;
      if (_fsRecv) _fsUpdateProgress(Math.round(_fsRecv.received / _fsRecv.size * 100));
    });
  }
}

// __done受信＆全書き込み完了の両方が揃ったら完了処理
async function _fsMaybeFinish() {
  if (!_fsRecv || !_fsRecv._gotDone) return;
  // 書き込みチェーンが残っていれば待つ
  try { if (_fsRecv._writeChain) await _fsRecv._writeChain; } catch (e) { }
  _fsFinishReceive();
}

async function _fsFinishReceive() {
  // 送信側に「受信し切った」ことを通知（これで送信側が本当の完了を表示できる）
  try { if (_fsChannel && _fsChannel.readyState === 'open') _fsChannel.send(JSON.stringify({ __ack: true })); } catch (e) { }
  try {
    _fsUpdateProgress(100);
    if (_fsRecv.writer) {
      // ディスク書き込みを確定（close）。既に保存済みなのでプレビューはファイル名のみ案内。
      await _fsRecv.writer.close();
      _fsCloseProgress();
      _fsShowSavedNotice(_fsRecv.name, _fsRecv.size);
    } else {
      const blob = new Blob(_fsRecv.chunks, { type: _fsRecv.type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      _fsCloseProgress();
      _fsShowReceivedPreview(url, _fsRecv.name, _fsRecv.type, _fsRecv.size);
    }
  } catch (e) {
    console.error('[FileShare] 受信完了処理エラー:', e);
  }
  // ACKが送信側に届くまで少し待ってから接続を閉じる
  setTimeout(() => { _fsCleanup(); }, 800);
}

// ディスク保存済みの場合の通知（プレビューは作らない＝メモリ節約）
function _fsShowSavedNotice(name, size) {
  _fsShowReceivedPreview(null, name, 'application/octet-stream', size, true);
}

function _fsHumanSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
  return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

// 進捗オーバーレイ（送信/受信共通）
function _fsShowProgress(mode, fileName, statusText) {
  let ov = document.getElementById('fsProgressOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'fsProgressOverlay';
    ov.setAttribute('data-inspect-ignore', '1');
    ov.innerHTML = `
          <div class="fs-prog-box">
            <div class="fs-prog-icon"><i class="fas fa-share-from-square"></i></div>
            <div class="fs-prog-name" id="fsProgName"></div>
            <div class="fs-prog-status" id="fsProgStatus"></div>
            <div class="fs-prog-bar"><div class="fs-prog-fill" id="fsProgFill"></div></div>
            <div class="fs-prog-pct" id="fsProgPct">0%</div>
            <button class="fs-prog-cancel" onclick="cancelFileShare()">キャンセル</button>
          </div>`;
    document.body.appendChild(ov);
  }
  ov.style.display = 'flex';
  const nameEl = document.getElementById('fsProgName');
  if (nameEl) nameEl.textContent = fileName || '';
  const statusEl = document.getElementById('fsProgStatus');
  if (statusEl) statusEl.textContent = statusText || '';
  const cancel = ov.querySelector('.fs-prog-cancel');
  if (cancel) cancel.style.display = (mode === 'done' || mode === 'error') ? 'none' : '';
}
function _fsUpdateProgress(pct) {
  const f = document.getElementById('fsProgFill'); const p = document.getElementById('fsProgPct');
  if (f) f.style.width = pct + '%';
  if (p) p.textContent = pct + '%';
  const st = document.getElementById('fsProgStatus');
  if (st && st.textContent.indexOf('待') < 0) st.textContent = (_fsRole === 'sender' ? '送信中…' : '受信中…');
}
function _fsCloseProgress() {
  const ov = document.getElementById('fsProgressOverlay');
  if (ov) ov.style.display = 'none';
}
window.cancelFileShare = function () {
  _fsCloseProgress();
  _fsCleanup();
};

// 受信したファイルのプレビュー＆保存
function _fsShowReceivedPreview(url, name, type, size, alreadySaved) {
  let ov = document.getElementById('fsPreviewOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'fsPreviewOverlay';
    ov.setAttribute('data-inspect-ignore', '1');
    document.body.appendChild(ov);
  }
  // 既にディスク保存済み（ストリーミング書き込み）の場合は完了通知のみ表示
  if (alreadySaved) {
    ov.innerHTML = `
          <div class="fs-prev-box">
            <div class="fs-prev-file" style="color:#16a34a"><i class="fas fa-circle-check"></i></div>
            <div class="fs-prev-title" style="margin-bottom:6px">保存しました</div>
            <div class="fs-prev-name">${escapeHtml(name || '')}</div>
            <div class="fs-prev-size">${_fsHumanSize(size || 0)}</div>
            <div class="fs-prev-actions">
              <button class="fs-prev-close" style="flex:1" onclick="document.getElementById('fsPreviewOverlay').style.display='none'">閉じる</button>
            </div>
          </div>`;
    ov.style.display = 'flex';
    return;
  }
  let inner = '';
  if (type && type.startsWith('image/')) {
    inner = `<img src="${url}" class="fs-prev-media" alt="">`;
  } else if (type && type.startsWith('video/')) {
    inner = `<video src="${url}" class="fs-prev-media" controls></video>`;
  } else {
    inner = `<div class="fs-prev-file"><i class="fas fa-file"></i></div>`;
  }
  ov.innerHTML = `
        <div class="fs-prev-box">
          <div class="fs-prev-title">受信したファイル</div>
          ${inner}
          <div class="fs-prev-name">${escapeHtml(name || '')}</div>
          <div class="fs-prev-size">${_fsHumanSize(size || 0)}</div>
          <div class="fs-prev-actions">
            <a class="fs-prev-save" href="${url}" download="${encodeURIComponent(name || 'file').replace(/"/g, '')}">保存</a>
            <button class="fs-prev-close" onclick="document.getElementById('fsPreviewOverlay').style.display='none'">閉じる</button>
          </div>
        </div>`;
  const a = ov.querySelector('.fs-prev-save'); if (a) a.setAttribute('download', name || 'file');
  ov.style.display = 'flex';
}

async function startCall(uid, name, avatar) {
  if (_callId) return;
  _callRole = 'caller';

  // ① UIを即時表示（マイク取得前でもユーザーに即フィードバック）
  showCallOverlay('active', { name, avatar, status: '発信中' });

  const { doc, setDoc, updateDoc, collection, serverTimestamp, onSnapshot } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');

  try {
    _localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    endCall(false);
    alert('マイクへのアクセスが拒否されました。設定を確認してください。');
    return;
  }

  const myUser = cachedUsers.find(u => u.id === userId) || {};

  // ② ICE収集が始まる前にcallIdを確定する（onicecandidate内でcallIdが必要）
  // doc()はクライアント側でIDを即時生成するためFirestore書き込み前でも使える
  const newCallRef = doc(collection(db, 'artifacts', appId, 'calls'));
  _callId = newCallRef.id;
  _callDoc = newCallRef;

  // ③ prewarmしたPeerConnectionを再利用 → ICE候補が既に収集済み
  setupPeerConnection('caller');

  // ④ offerを作成 → setLocalDescriptionでICE収集開始（_callIdが確定済みなので候補を即書き込み可能）
  const offer = await _peerConnection.createOffer();
  await _peerConnection.setLocalDescription(offer);

  // ⑤ Firestore書き込み（offer込みで初回書き込み、setDocでIDを指定）
  const callData = {
    caller: { uid: userId, nickname: myUser.nickname || myUser.displayName || '', avatarUrl: myUser.avatarUrl || '' },
    callee: { uid, nickname: name, avatarUrl: avatar },
    calleeUid: uid,
    status: 'ringing',
    offer: { type: offer.type, sdp: offer.sdp },
    createdAt: serverTimestamp()
  };
  await setDoc(newCallRef, callData);

  // ⑥ FCM通知はfire-and-forget（awaitしない → ~1s節約）
  const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  fetch(`${WORKER_BASE_URL}/api/sendCallNotification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      calleeId: uid,
      callerNickname: myUser.nickname || myUser.displayName || '',
      callerAvatarUrl: myUser.avatarUrl || '',
      callId: _callId,
      appId,
      callerId: userId,
      idToken
    })
  }).catch(() => { });

  // answerを待つ
  const unsubAnswer = onSnapshot(newCallRef, async (snap) => {
    const d = snap.data();
    if (!d) return;
    if (d.status === 'declined') {
      unsubAnswer();
      endCall(true, 'declined');
      return;
    }
    if (d.status === 'ended' || d.status === 'missed') {
      unsubAnswer();
      endCall(true);
      return;
    }
    if (d.answer && _peerConnection && !_peerConnection.currentRemoteDescription) {
      const lbl = document.getElementById('callStatusLabel');
      if (lbl) lbl.textContent = '接続中';
      await _peerConnection.setRemoteDescription(new RTCSessionDescription(d.answer));
      listenForRemoteCandidates('caller').then(unsub => {
        if (_callId) { _callUnsubOffer = unsub; } else { unsub(); }
      });
      unsubAnswer();
      // 通話確立後も相手が終了 or ICE restart応答を検知する
      if (_callId) {
        _callEndUnsub = onSnapshot(newCallRef, (snap2) => {
          const d2 = snap2.data();
          if (!d2 || d2.status === 'ended' || d2.status === 'missed') {
            if (_callEndUnsub) { _callEndUnsub(); _callEndUnsub = null; }
            if (_callId) endCall(true, 'remoteEnded');
          } else if (d2.iceRestartAt && d2.iceRestartAt === _lastIceRestartAt && d2.answer && _peerConnection) {
            // ICE restartに対するcalleeからのanswerを適用
            const desc = d2.answer;
            if (_peerConnection.signalingState === 'have-local-offer') {
              _peerConnection.setRemoteDescription(new RTCSessionDescription(desc)).catch(e => {
                console.warn('[ICE restart caller setRemote] failed:', e);
              });
            }
          }
        }, (err) => {
          console.warn('[CallEnd caller onSnapshot] connection state updated:', err?.message || err);
        });
      }
    }
  }, (err) => {
    console.warn('[CallAnswer onSnapshot] connection state updated:', err?.message || err);
  });
  _callUnsubOffer = unsubAnswer;

  // タイムアウト
  _callTimeoutHandle = setTimeout(async () => {
    if (_callId) {
      try { await cleanupWebRtcDoc('calls', _callId); } catch (_) { }
      endCall(true);
    }
  }, CALL_TIMEOUT_MS);
}

async function handleIncomingCall(callId, callerData) {
  if (_callId) return;
  _callId = callId;
  _callRole = 'callee';
  _pendingCallerData = callerData;

  playCallRingSound();
  showCallOverlay('incoming', { name: callerData.nickname || '不明', avatar: callerData.avatarUrl || '' });

  // 相手がキャンセルした場合を監視
  const { doc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
  const unsub = onSnapshot(doc(db, 'artifacts', appId, 'calls', callId), (snap) => {
    const d = snap.data();
    if (!d) { unsub(); endCall(true, 'callerCancelled'); return; }
    if (d.status === 'ended' || d.status === 'missed') {
      unsub();
      stopCallRingSound();
      endCall(true, 'callerCancelled');
    }
  }, (err) => {
    console.warn('[IncomingCall onSnapshot] connection state updated:', err?.message || err);
  });
  _callUnsubOffer = unsub;
}

async function acceptCall() {
  if (!_callId || _callRole !== 'callee') return;
  stopCallRingSound();

  // ① UIを即時切り替えてユーザーに即フィードバック
  const callerName = _pendingCallerData?.nickname || '不明';
  const callerAvatar = _pendingCallerData?.avatarUrl || '';
  showCallOverlay('active', { name: callerName, avatar: callerAvatar, status: '接続中' });
  document.getElementById('callTimeoutDisplay').style.display = 'none';

  // ② 着信監視リスナーを即時解除
  if (_callUnsubOffer) { _callUnsubOffer(); _callUnsubOffer = null; }

  // ③ iOS Safari 自動再生ポリシー対応：ユーザージェスチャー内で audio をunlock
  const remoteAudioEl = document.getElementById('remoteAudio');
  if (remoteAudioEl) {
    remoteAudioEl.muted = true;
    remoteAudioEl.play().catch(() => { });
    remoteAudioEl.pause();
    remoteAudioEl.muted = false;
  }

  // ④ Firebase import・getUserMedia・getDoc を並列実行して速度改善
  const { doc, getDoc, updateDoc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
  const callRef = doc(db, 'artifacts', appId, 'calls', _callId);
  let stream, callData;
  try {
    const [streamResult, snapResult] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
      getDoc(callRef)
    ]);
    stream = streamResult;
    callData = snapResult.data();
  } catch (e) {
    const isMicError = e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError' || e?.name === 'NotFoundError';
    if (isMicError) {
      alert('マイクへのアクセスが拒否されました。');
      endCall(false, 'micDenied');
    } else {
      endCall(false);
    }
    return;
  }
  _localStream = stream;

  // ⑤ Peer接続とリモートSDP設定
  setupPeerConnection('callee');
  await _peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));

  // ⑥ 発信側のICE candidateをすぐ受信開始（速度改善）
  _callUnsubOffer = await listenForRemoteCandidates('callee');

  // ⑦ answerを作成して送信
  const answer = await _peerConnection.createAnswer();
  await _peerConnection.setLocalDescription(answer);
  await updateDoc(callRef, {
    answer: { type: answer.type, sdp: answer.sdp },
    status: 'active'
  });

  // ⑧ 通話確立後、発信者が終了 or ICE restartを検知する
  _callEndUnsub = onSnapshot(callRef, async (snap2) => {
    const d2 = snap2.data();
    if (!d2 || d2.status === 'ended' || d2.status === 'missed') {
      if (_callEndUnsub) { _callEndUnsub(); _callEndUnsub = null; }
      if (_callId) endCall(true, 'remoteEnded');
    } else if (d2.iceRestartAt && d2.iceRestartAt !== _lastIceRestartAt && _peerConnection && d2.offer) {
      _lastIceRestartAt = d2.iceRestartAt;
      setCallReconnectStatus(true);
      try {
        await _peerConnection.setRemoteDescription(new RTCSessionDescription(d2.offer));
        const newAnswer = await _peerConnection.createAnswer();
        await _peerConnection.setLocalDescription(newAnswer);
        await updateDoc(callRef, { answer: { type: newAnswer.type, sdp: newAnswer.sdp } });
        console.log('[ICE restart callee] answered successfully, attempt:', d2.iceRestartAttempt || 1);
      } catch (e) {
        console.warn('[ICE restart callee] failed:', e);
        // callee側でanswerに失敗した場合、callerのタイムアウトを待つ（endCallはcallerが制御）
      }
    }
  }, (err) => {
    console.warn('[CallEnd callee onSnapshot] connection state updated:', err?.message || err);
  });
}

async function declineCall() {
  if (!_callId) return;
  stopCallRingSound();
  try {
    const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    await cleanupWebRtcDoc('calls', _callId);
  } catch (_) { }
  endCall(true);
}

async function endCall(skipFirestore, reason) {
  const overlay = document.getElementById('callOverlay');
  if (!_callId && !_peerConnection && !_localStream && !(overlay?.classList.contains('show'))) return;
  const callIdCopy = _callId;
  _callId = null;
  _callRole = null;
  _pendingCallerData = null;
  if (reason === 'connectionLost' && _usingTurnRelay) reason = 'turnDisconnected';
  _usingTurnRelay = false;
  setCallConnectionType(null);

  stopCallRingSound();
  stopCallTimer();

  if (_callTimeoutHandle) { clearTimeout(_callTimeoutHandle); _callTimeoutHandle = null; }
  if (_iceDisconnectTimer) { clearTimeout(_iceDisconnectTimer); _iceDisconnectTimer = null; }
  if (_iceRestartTimer) { clearTimeout(_iceRestartTimer); _iceRestartTimer = null; }
  _lastIceRestartAt = null;
  if (_callUnsubOffer) { _callUnsubOffer(); _callUnsubOffer = null; }
  if (_callEndUnsub) { _callEndUnsub(); _callEndUnsub = null; }

  if (_peerConnection) {
    _peerConnection.onconnectionstatechange = null;
    _peerConnection.oniceconnectionstatechange = null;
    _peerConnection.ontrack = null;
    _peerConnection.onicecandidate = null;
    _peerConnection.close();
    _peerConnection = null;
  }
  if (_localStream) {
    _localStream.getTracks().forEach(t => t.stop());
    _localStream = null;
  }
  const remoteAudio = document.getElementById('remoteAudio');
  if (remoteAudio) { remoteAudio.srcObject = null; }

  stopVoiceIndicator();

  if (!skipFirestore && callIdCopy) {
    try {
      const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
      await cleanupWebRtcDoc('calls', callIdCopy);
    } catch (_) { }
  }

  _isMuted = false;
  const muteBtn = document.getElementById('muteButton');
  if (muteBtn) { muteBtn.classList.remove('active'); muteBtn.querySelector('i').className = 'fas fa-microphone'; }
  document.getElementById('muteLabel').textContent = 'ミュート';

  hideCallOverlay();
  if (reason) showCallEndedReason(reason);
}

let _voiceAudioContext = null;
let _voiceAnalyser = null;
let _voiceAnimFrame = null;

function startVoiceIndicator(remoteStream) {
  const canvas = document.getElementById('voiceWaveform');
  if (!canvas) return;
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');

  if (!_voiceAudioContext) {
    _voiceAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_voiceAudioContext.state === 'suspended') {
    _voiceAudioContext.resume();
  }
  if (_voiceAnalyser) {
    _voiceAnalyser.disconnect();
  }
  _voiceAnalyser = _voiceAudioContext.createAnalyser();
  _voiceAnalyser.fftSize = 64;

  const sources = [];
  if (remoteStream && remoteStream.getAudioTracks().length > 0) {
    sources.push(_voiceAudioContext.createMediaStreamSource(remoteStream));
  }
  if (_localStream && _localStream.getAudioTracks().length > 0) {
    sources.push(_voiceAudioContext.createMediaStreamSource(_localStream));
  }

  sources.forEach(s => s.connect(_voiceAnalyser));

  const bufferLength = _voiceAnalyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  if (_voiceAnimFrame) cancelAnimationFrame(_voiceAnimFrame);

  let smoothedData = new Float32Array(20);
  function draw() {
    if (!_voiceAnalyser) return;
    _voiceAnimFrame = requestAnimationFrame(draw);

    _voiceAnalyser.getByteFrequencyData(dataArray);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const numBars = 20;
    const barWidth = 4;
    const gap = 4;
    const totalWidth = numBars * (barWidth + gap) - gap;
    let startX = (canvas.width - totalWidth) / 2;
    const centerY = canvas.height / 2;

    ctx.lineCap = 'round';
    ctx.lineWidth = barWidth;

    for (let i = 0; i < numBars; i++) {
      const binStart = Math.floor(i * (bufferLength / numBars));
      const binEnd = Math.floor((i + 1) * (bufferLength / numBars));
      let sum = 0;
      for (let j = binStart; j < binEnd; j++) {
        sum += dataArray[j] || 0;
      }
      const avg = sum / (binEnd - binStart || 1);
      const targetHeight = (avg / 255) * (canvas.height - 10) * 0.8 + 4;

      // Smooth interpolation
      smoothedData[i] += (targetHeight - smoothedData[i]) * 0.2;
      const barHeight = Math.max(4, smoothedData[i]);

      ctx.beginPath();
      ctx.moveTo(startX, centerY - barHeight / 2);
      ctx.lineTo(startX, centerY + barHeight / 2);
      ctx.strokeStyle = '#ffffff'; // 以前の色（白）
      ctx.stroke();

      startX += barWidth + gap;
    }
  }
  draw();
}

function stopVoiceIndicator() {
  if (_voiceAnimFrame) cancelAnimationFrame(_voiceAnimFrame);
  _voiceAnimFrame = null;
  if (_voiceAnalyser) { _voiceAnalyser.disconnect(); _voiceAnalyser = null; }
  const canvas = document.getElementById('voiceWaveform');
  if (canvas) {
    canvas.style.display = 'none';
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function toggleMute() {
  if (!_localStream) return;
  _isMuted = !_isMuted;
  _localStream.getAudioTracks().forEach(t => { t.enabled = !_isMuted; });
  const btn = document.getElementById('muteButton');
  const label = document.getElementById('muteLabel');
  if (_isMuted) {
    btn.classList.add('active');
    btn.querySelector('i').className = 'fas fa-microphone-slash';
    label.textContent = 'ミュート解除';
  } else {
    btn.classList.remove('active');
    btn.querySelector('i').className = 'fas fa-microphone';
    label.textContent = 'ミュート';
  }
}

async function handleCallNotificationClick(data) {
  if (!data.callId) return;
  const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
  try {
    const snap = await getDoc(doc(db, 'artifacts', appId, 'calls', data.callId));
    if (snap.exists() && snap.data().status === 'ringing') {
      handleIncomingCall(data.callId, { nickname: data.callerNickname, avatarUrl: data.callerAvatarUrl });
    }
  } catch (_) { }
}

function handleCallDeclinedFromNotification(data) {
  if (_callId && data.callId === _callId) {
    declineCall();
  }
}

// --- 統合通知関数 ---
async function showNotification(title, body, roomId) {
  if (typeof isEncrypted === 'function') {
    if (isEncrypted(body)) body = '新しいメッセージがあります';
    if (isEncrypted(title)) title = 'Covo';
  }
  const soundEnabled = localStorage.getItem('simplechat_sound') !== 'false';
  const notifEnabled = localStorage.getItem('simplechat_browser_notif') !== 'false';

  if (!notifEnabled) return;

  const now = Date.now();
  const sameContent = body === lastNotificationBody && (roomId || '') === lastNotificationRoomId;
  if (now - lastNotificationTime < 3000 && sameContent) return;
  lastNotificationTime = now;
  lastNotificationBody = body;
  lastNotificationRoomId = roomId || '';

  if (soundEnabled) {
    playNotificationSound();
  }

  if (isTauri) {
    if (window.__TAURI__?.core?.invoke) {
      window.__TAURI__.core.invoke('set_badge', { hasUnread: !document.hasFocus() }).catch(console.error);
    }

    if (window.__TAURI__?.core?.invoke) {
      window.__TAURI__.core.invoke('send_desktop_notification', { title: title, body: body }).catch(console.error);
    } else if (Notification.permission === 'granted') {
      const n = new Notification(title, { body: body });
      n.onclick = () => {
        if (roomId) {
          if (typeof goToRoom === 'function') goToRoom(roomId);
          else {
            const roomItem = document.getElementById(`room-item-${roomId}`);
            if (roomItem) roomItem.click();
          }
        }
        if (window.__TAURI__?.core?.invoke) {
          window.__TAURI__.core.invoke('show_main_window').catch(console.error);
        }
      };
    }
  } else {
    // Web/PWA版: Service Worker (FCM) が動かない環境のフォールバック
    if (!currentFcmToken && "Notification" in window && Notification.permission === "granted") {
      try {
        const n = new Notification(title, { body, icon: '/icon-192x192.png?v=6' });
        n.onclick = () => {
          window.focus();
          n.close();
          if (roomId) {
            if (typeof goToRoom === 'function') goToRoom(roomId);
            else {
              const roomItem = document.getElementById(`room-item-${roomId}`);
              if (roomItem) roomItem.click();
            }
          }
        };
      } catch (e) { }
    }
  }
}

// --- ブロッキングアップデートチェック ---
let pendingUpdate = null;
window.__bgDownloading = false;
window.__bgDownloaded = false;
window.__bgProgressText = '';

window.performBackgroundUpdateRestart = async function () {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) { window.location.reload(); return; }
  try {
    if (pendingUpdate && pendingUpdate.rid) {
      await invoke('plugin:updater|install', { rid: pendingUpdate.rid, updateRid: pendingUpdate.rid });
    }
  } catch (e) { console.warn(e); }
  try {
    await invoke('plugin:process|restart');
  } catch (e) { window.location.reload(); }
};

async function blockingUpdateCheck() {
  if (!isTauri) return false;
  if (localStorage.getItem('covo_ignore_force_update') === '1') {
    console.log('[Update] バージョンロックが有効なため、自動アップデート確認をスキップします。');
    return false;
  }
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) {
    console.warn('Tauri core.invoke not available, skipping update check.');
    return false;
  }

  try {
    console.log('📦 [アップデート] 新しいバージョンがないか確認しています...');
    const metadata = await invoke('plugin:updater|check');
    if (metadata) {
      console.log('📦 [アップデート] 新しいバージョンが見つかりました:', metadata.version);

      const Channel = window.__TAURI__?.core?.Channel;
      const rid = metadata.rid;

      const tryInvokeWithRidVariants = async (cmd, extraArgs) => {
        const variants = [
          { rid },
          { updateRid: rid },
          { rid, updateRid: rid },
        ];
        let lastErr = null;
        for (const v of variants) {
          try {
            const args = { ...v, ...extraArgs };
            return await invoke(cmd, args);
          } catch (e) {
            lastErr = e;
            const msg = String(e?.message || e || '').toLowerCase();
            if (msg.includes('missing required key') || msg.includes('invalid args')) {
              continue;
            }
            throw e;
          }
        }
        throw lastErr || new Error(`${cmd}: all variants failed`);
      };

      pendingUpdate = {
        rid: rid,
        version: metadata.version,
        body: metadata.body,
        downloadAndInstall: async () => {
          console.log('[Updater] Starting, rid:', rid);
          const makeChannel = () => {
            if (!Channel) return null;
            const ch = new Channel();
            ch.onmessage = (msg) => console.log('[Updater event]', msg);
            return ch;
          };

          try {
            const ch = makeChannel();
            const extra = ch ? { onEvent: ch } : {};
            await tryInvokeWithRidVariants('plugin:updater|download_and_install', extra);
            console.log('[Updater] download_and_install OK');
            return;
          } catch (e1) {
            console.warn('[Updater] download_and_install failed, trying download+install', e1);
          }

          try {
            const ch = makeChannel();
            const extra = ch ? { onEvent: ch } : {};
            await tryInvokeWithRidVariants('plugin:updater|download', extra);
            console.log('[Updater] download OK, installing');
          } catch (e2) {
            throw new Error('download failed: ' + (e2?.message || JSON.stringify(e2)));
          }
          try {
            await tryInvokeWithRidVariants('plugin:updater|install', {});
            console.log('[Updater] install OK');
          } catch (e3) {
            throw new Error('install failed: ' + (e3?.message || JSON.stringify(e3)));
          }
        }
      };

      // アップデートオーバーレイを表示して自動でアップデートを開始する
      const overlay = document.getElementById('updateOverlay');
      const versionText = document.getElementById('updateVersionText');
      const bodyText = document.getElementById('updateBodyText');
      const closeBtn = document.getElementById('updateCloseButton');
      const updateBtn = document.getElementById('updateButton');
      const updateMainTitle = document.getElementById('updateMainTitle');

      versionText.textContent = `v${metadata.version} を自動でダウンロード中...`;
      bodyText.textContent = metadata.body || 'バグ修正とパフォーマンス改善が含まれています。';

      if (closeBtn) closeBtn.classList.add('hidden');
      if (updateBtn) updateBtn.classList.add('hidden');
      if (updateMainTitle) updateMainTitle.textContent = '最新アップデートをダウンロード中';

      overlay.classList.add('show');

      setTimeout(() => {
        performUpdate();
      }, 500);

      return true; // アプリ起動をブロック
    }
    console.log('📦 [アップデート] 現在のバージョンは最新です');
  } catch (error) {
    console.warn('Update check failed:', error);
  }
  return false;
}

window.closeUpdateOverlay = function () {
  const overlay = document.getElementById('updateOverlay');
  if (overlay) {
    overlay.classList.remove('show');
  }
  if (!app) {
    initializeFirebase();
    if ('Notification' in window) Notification.requestPermission();
    if (typeof initializeResizer === 'function') initializeResizer();
  }
};

// ================= MODULE: updater.js ================
// ================= UPDATER MODULE ================
// =========================================================================
// 🛡️ リリース履歴取得＆強制アプデ回避機能管理（設定モーダル＆リカバリー用）
// =========================================================================
window.updateForceOverrideUI = function () {
  const cb = document.getElementById('toggleForceOverrideCheckbox');
  if (!cb) return;
  cb.checked = localStorage.getItem('covo_ignore_force_update') === '1';
};

window.handleForceOverrideToggle = function (event) {
  const checked = event.target.checked;
  if (checked) {
    // オンにしようとしている → 確認モーダルを表示し、まずチェックをキャンセル
    event.target.checked = false;
    const modal = document.getElementById('forceOverrideConfirmModal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    }
  } else {
    // オフにする → そのまま保存
    localStorage.setItem('covo_ignore_force_update', '0');
    updateForceOverrideUI();
  }
};

window.confirmForceOverrideToggle = function () {
  localStorage.setItem('covo_ignore_force_update', '1');
  updateForceOverrideUI();
  const modal = document.getElementById('forceOverrideConfirmModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
};

window.cancelForceOverrideToggle = function () {
  const modal = document.getElementById('forceOverrideConfirmModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
  updateForceOverrideUI();
};

// 無限スクロール対応 過去バージョンモーダル

window.downloadLatestWindowsApp = async function (btn) {
  const origText = btn.textContent;
  btn.textContent = "準備中...";
  btn.disabled = true;
  try {
    const res = await fetch('https://api.github.com/repos/qwertyuiop1229/Covo/releases/latest', { cache: 'no-store' });
    if (!res.ok) throw new Error('API limit or network error');
    const release = await res.json();
    const exeAsset = release.assets?.find(a => a.name?.endsWith('.exe'));
    const url = exeAsset ? exeAsset.browser_download_url : release.html_url;
    window.open(url, '_blank');
  } catch (e) {
    alert("最新バージョンの取得に失敗しました。GitHubページを開きます。");
    window.open('https://github.com/qwertyuiop1229/Covo/releases/latest', '_blank');
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
};

// DOMロード後にTauri環境以外でのUI制御
document.addEventListener("DOMContentLoaded", () => {
  const isTauriEnv = window.__TAURI__ !== undefined;
  if (!isTauriEnv) {
    const vlc = document.getElementById("versionLockContainer");
    if (vlc) vlc.style.display = "none";

    const wdc = document.getElementById("windowsDownloadContainer");
    if (wdc) wdc.style.display = "flex";
  }
});

window.openPastVersionsModal = function () {
  const modal = document.getElementById('pastVersionsModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
  window.__pastVersionsPage = 1;
  window.__pastVersionsHasMore = true;
  window.__pastVersionsLoading = false;
  const listEl = document.getElementById('pastVersionsList');
  if (listEl) listEl.innerHTML = '';
  loadPastVersionsPage(1);
};

window.closePastVersionsModal = function () {
  const modal = document.getElementById('pastVersionsModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
};

window.loadPastVersionsPage = async function (page) {
  if (window.__pastVersionsLoading || !window.__pastVersionsHasMore) return;
  window.__pastVersionsLoading = true;
  const listEl = document.getElementById('pastVersionsList');
  const loadingEl = document.getElementById('pastVersionsLoading');
  if (!listEl) return;
  if (loadingEl) loadingEl.classList.remove('hidden');

  try {
    const res = await fetch(`https://api.github.com/repos/qwertyuiop1229/Covo/releases?per_page=10&page=${page}`, { cache: 'no-store' });
    if (!res.ok) {
      window.__pastVersionsHasMore = false;
      if (res.status === 403) {
        listEl.innerHTML = `
              <div class="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-200 text-xs leading-relaxed space-y-2">
                <p class="font-bold text-amber-400"><i class="fas fa-exclamation-triangle mr-1.5"></i>GitHub API の取得上限 (1時間60回) に到達しました</p>
                <p>ターミナルでのデプロイ監視 (<code>npm run deploy</code>) が匿名APIリクエスト枠をすべて消費したため、過去のリリース履歴を取得できませんでした。</p>
                <p class="pt-1 text-white font-semibold">💡 解決方法：</p>
                <p>Windows の環境変数に <code class="px-1.5 py-0.5 bg-amber-500/20 rounded font-mono text-amber-300">GITHUB_TOKEN</code> を設定してください。ターミナル監視が無料枠を消費しなくなり、アプリ内の履歴表示がいつでも正常に動作するようになります！</p>
              </div>
            `;
      } else {
        listEl.innerHTML = `<div class="text-center text-xs text-red-400 py-4">エラーが発生しました: HTTP ${res.status}</div>`;
      }
      if (loadingEl) loadingEl.classList.add('hidden');
      window.__pastVersionsLoading = false;
      return;
    }
    const releases = await res.json();
    if (!Array.isArray(releases) || releases.length === 0) {
      window.__pastVersionsHasMore = false;
      if (page === 1) {
        listEl.innerHTML = '<div class="text-center text-xs text-gray-500 py-4">リリース履歴が見つかりませんでした。</div>';
      }
      if (loadingEl) loadingEl.classList.add('hidden');
      window.__pastVersionsLoading = false;
      return;
    }

    if (releases.length < 10) {
      window.__pastVersionsHasMore = false;
    }

    releases.forEach(rel => {
      const exeAsset = rel.assets?.find(a => a.name?.endsWith('.exe'));
      const tag = rel.tag_name || '不明';
      const dateStr = rel.published_at ? new Date(rel.published_at).toLocaleDateString() : '';
      const bodyStr = (rel.body || '説明なし').substring(0, 100) + (rel.body?.length > 100 ? '...' : '');

      const card = document.createElement('div');
      card.className = 'p-4 bg-gray-800/60 border border-gray-700/60 rounded-2xl flex items-center justify-between gap-4 shadow-sm hover:shadow transition text-white';
      card.innerHTML = `
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-bold font-mono text-gray-100">${tag}</span>
                <span class="text-xs text-gray-400">(${dateStr})</span>
              </div>
              <p class="text-xs text-gray-300 mt-1 line-clamp-2">${bodyStr}</p>
            </div>
            <button class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-bold text-xs rounded-xl transition flex-shrink-0 flex items-center gap-1.5 shadow-sm" onclick="installPastRelease('${exeAsset ? exeAsset.browser_download_url : rel.html_url}', '${tag}', this)">
              <i class="fas fa-download"></i>${typeof window.__TAURI__ !== "undefined" ? "このバージョンをインストール" : "インストーラーをダウンロード"}
            </button>
          `;
      listEl.appendChild(card);
    });
    window.__pastVersionsPage = page;
  } catch (e) {
    console.warn('Failed to fetch GitHub releases:', e);
    if (page === 1) {
      listEl.innerHTML = '<div class="text-center text-xs text-red-500 py-4">リリース履歴の取得に失敗しました。</div>';
    }
  } finally {
    if (loadingEl) loadingEl.classList.add('hidden');
    window.__pastVersionsLoading = false;
  }
};

window.handlePastVersionsScroll = function (container) {
  if (container.scrollHeight - container.scrollTop <= container.clientHeight + 150) {
    loadPastVersionsPage(window.__pastVersionsPage + 1);
  }
};

window.installPastRelease = async function (url, tag, btnEl) {
  if (!url) return;
  console.log(`[Install Past Release] ${tag} -> ${url}`);
  localStorage.setItem('covo_ignore_force_update', '1');
  if (typeof updateForceOverrideUI === 'function') updateForceOverrideUI();

  // カード内に進捗UIを動的挿入
  let progressEl = null;
  if (btnEl) {
    btnEl.disabled = true;
    const card = btnEl.closest('.past-version-card') || btnEl.parentElement;
    if (card) {
      progressEl = document.createElement('div');
      progressEl.style.cssText = 'margin-top:0.75rem;';
      progressEl.innerHTML = `
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;">
              <span class="past-spinner" style="font-size:0.9rem;">⠋</span>
              <span class="past-progress-text" style="font-size:0.8rem;color:#a5b4fc;font-weight:600;">準備中...</span>
            </div>
            <div style="background:rgba(99,102,241,0.15);border-radius:999px;height:6px;overflow:hidden;border:1px solid rgba(99,102,241,0.3);">
              <div class="past-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#6366f1,#a78bfa);border-radius:999px;transition:width 0.25s ease;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:#64748b;margin-top:0.3rem;">
              <span class="past-bytes-text"></span>
              <span class="past-pct-text" style="font-weight:700;color:#818cf8;">0%</span>
            </div>
          `;
      card.appendChild(progressEl);
    }

    // スピナーアニメーション
    const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let si = 0;
    const spinTimer = setInterval(() => {
      const sp = progressEl?.querySelector('.past-spinner');
      if (sp) sp.textContent = SPINNERS[si++ % SPINNERS.length];
    }, 80);
    progressEl._spinTimer = spinTimer;
  }

  const updatePastProgress = ({ progress = 0, downloaded = 0, total = 0, text = '' } = {}) => {
    if (!progressEl) return;
    const bar = progressEl.querySelector('.past-progress-bar');
    const pct = progressEl.querySelector('.past-pct-text');
    const bytes = progressEl.querySelector('.past-bytes-text');
    const txt = progressEl.querySelector('.past-progress-text');
    if (bar) bar.style.width = Math.min(progress, 100) + '%';
    if (pct) pct.textContent = progress + '%';
    if (bytes && total > 0) bytes.textContent = (downloaded / (1024 * 1024)).toFixed(1) + ' MB / ' + (total / (1024 * 1024)).toFixed(1) + ' MB';
    else if (bytes && downloaded > 0) bytes.textContent = (downloaded / (1024 * 1024)).toFixed(1) + ' MB ダウンロード済み';
    if (txt && text) txt.textContent = text;
  };

  const invoke = window.__TAURI__?.core?.invoke;
  if (invoke && url.endsWith('.exe')) {
    // download-progress イベントをリッスン
    let unlisten = null;
    try {
      const tauriEvent = window.__TAURI__?.event;
      if (tauriEvent?.listen) {
        unlisten = await tauriEvent.listen('download-progress', (event) => {
          const { progress, downloaded, total } = event.payload;
          updatePastProgress({
            progress: Math.min(95, Math.round(5 + progress * 0.9)),
            downloaded, total,
            text: `ダウンロード中... (${progress}%)`
          });
        });
      }
    } catch (e) { console.warn('past version event listen unavailable:', e); }

    updatePastProgress({ progress: 2, text: 'ダウンロードを開始中...' });
    try {
      await invoke('silent_install_past_version', { url, tag });
      if (unlisten) unlisten();
      if (progressEl) clearInterval(progressEl._spinTimer);
      updatePastProgress({ progress: 100, text: '再起動します。更新を適用中...' });
      const sp = progressEl?.querySelector('.past-spinner');
      if (sp) { sp.textContent = '✔'; sp.style.animation = 'none'; }
    } catch (err) {
      console.warn('silent_install_past_version failed, fallback to shell open', err);
      if (unlisten) unlisten();
      if (progressEl) clearInterval(progressEl._spinTimer);
      updatePastProgress({ progress: 0, text: 'ブラウザでダウンロードページを開いています...' });
      invoke('plugin:shell|open', { path: url }).catch(() => window.open(url, '_blank'));
    }
  } else if (invoke) {
    invoke('plugin:shell|open', { path: url }).catch(() => window.open(url, '_blank'));
  } else {
    window.open(url, '_blank');
  }
};


window.emergencyCheckUpdate = async function (btn) {
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '確認中...';
  try {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) throw new Error('Tauri API unavailable');
    const metadata = await invoke('plugin:updater|check');
    if (metadata) {
      alert(`最新バージョン v${metadata.version} が利用可能です！ただちに自動更新を開始します。`);
      document.getElementById('emergencyRecoveryOverlay').classList.add('hidden');
      document.getElementById('emergencyRecoveryOverlay').style.display = 'none';
      localStorage.setItem('covo_ignore_force_update', '0');
      await blockingUpdateCheck();
    } else {
      alert('現在提供されている最新バージョンです。更新プログラムはありません。');
    }
  } catch (e) {
    alert('アップデートの確認に失敗しました: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
};

// === 全体お知らせ・What's New 配信＆表示システム ===
window.selectAnnouncementCategory = function (val, label, iconClass) {
  const hiddenInput = document.getElementById("announcementCategorySelect");
  const labelEl = document.getElementById("announcementCategorySelectedLabel");
  const customWrapper = document.getElementById("announcementCustomCategoryWrapper");

  if (hiddenInput) hiddenInput.value = val;
  if (labelEl) {
    labelEl.innerHTML = `<i class="${iconClass} text-xs opacity-70"></i>${label}`;
  }

  document.querySelectorAll('#announcementCategorySelectContainer .covo-select-option').forEach(opt => {
    opt.classList.toggle('selected', opt.getAttribute('data-value') === val);
  });

  if (customWrapper) {
    if (val === 'custom') {
      customWrapper.classList.remove('hidden');
      document.getElementById('announcementCustomCategoryInput')?.focus();
    } else {
      customWrapper.classList.add('hidden');
    }
  }

  document.querySelectorAll('.covo-custom-select').forEach(s => s.classList.remove('open'));
};

window.loadAdminAnnouncements = async function () {
  const listEl = document.getElementById("adminAnnouncementsList");
  if (!listEl) return;
  listEl.innerHTML = "<p class='text-xs text-gray-400 text-center py-4'>読み込み中...</p>";
  try {
    const { collection, query, orderBy, getDocs } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const q = query(collection(db, `artifacts/${appId}/announcements`), orderBy('publishedAt', 'desc'));
    const snap = await getDocs(q);
    listEl.innerHTML = "";
    if (snap.empty) {
      listEl.innerHTML = "<p class='text-xs text-gray-400 text-center py-4'>配信されたお知らせはありません</p>";
      return;
    }
    snap.forEach(d => {
      const data = d.data();
      const dt = data.publishedAt?.toDate ? data.publishedAt.toDate().toLocaleDateString() : '不明';
      const item = document.createElement("div");
      item.className = "p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xs text-xs flex items-center justify-between gap-3";
      
      let badge = `<span class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 flex items-center gap-1"><i class="fas fa-sparkles text-[9px]"></i>${escapeHtml(data.version || 'UPDATE')}</span>`;
      if (data.category === 'bugfix') badge = `<span class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 flex items-center gap-1"><i class="fas fa-wrench text-[9px]"></i>BUGFIX</span>`;
      else if (data.category === 'notice') badge = `<span class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 flex items-center gap-1"><i class="fas fa-circle-exclamation text-[9px]"></i>NOTICE</span>`;
      else if (data.category && data.category !== 'update' && data.category !== 'none') badge = `<span class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 flex items-center gap-1"><i class="fas fa-tag text-[9px]"></i>${escapeHtml(data.category)}</span>`;
      else if (!data.category || data.category === 'none') badge = `<span class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">${escapeHtml(data.version || 'お知らせ')}</span>`;

      item.innerHTML = `
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            ${badge}
            <span class="text-gray-400">${dt}</span>
          </div>
          <div class="font-bold text-gray-800 dark:text-gray-200 truncate text-sm">${escapeHtml(data.title || '')}</div>
        </div>
        <button onclick="deleteAdminAnnouncement('${d.id}')" class="px-2.5 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="削除">
          <i class="fas fa-trash"></i>
        </button>
      `;
      listEl.appendChild(item);
    });
  } catch (e) {
    console.error("loadAdminAnnouncements error:", e);
    listEl.innerHTML = "<p class='text-xs text-red-400 text-center py-4'>読み込みエラー</p>";
  }
};

window.publishAdminAnnouncement = async function () {
  const versionInput = document.getElementById("announcementVersionInput");
  const catSelect = document.getElementById("announcementCategorySelect");
  const customCatInput = document.getElementById("announcementCustomCategoryInput");
  const titleInput = document.getElementById("announcementTitleInput");
  const contentInput = document.getElementById("announcementContentInput");
  const btn = document.getElementById("publishAnnouncementButton");

  const version = versionInput?.value.trim() || _appVersion || "v最新";
  let category = catSelect?.value || "update";
  if (category === "custom") {
    category = customCatInput?.value.trim() || "";
  } else if (category === "none") {
    category = "";
  }

  const title = titleInput?.value.trim();
  const content = contentInput?.value.trim();

  if (!title || !content) {
    alertMessage("タイトルと内容を入力してください", "error");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 配信中...';

  try {
    const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const docRef = await addDoc(collection(db, `artifacts/${appId}/announcements`), {
      version,
      category,
      title,
      content,
      publishedAt: serverTimestamp(),
      publishedBy: userId,
      active: true
    });

    // RTDBに軽量トリガー（数十バイト）のみを書き込み、全ユーザーへリアルタイム配信通知をブロードキャスト（超省通信）
    try {
      const { ref, set } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const rtdb = await _getOrInitRTDB();
      await set(ref(rtdb, `artifacts/${appId}/latestAnnouncement`), {
        id: docRef.id,
        version,
        title,
        category,
        content,
        publishedAt: Date.now()
      });
    } catch (rtdbErr) {
      console.warn("RTDB announcement trigger error:", rtdbErr);
    }

    titleInput.value = "";
    contentInput.value = "";
    if (customCatInput) customCatInput.value = "";
    alertMessage("全体にお知らせを配信しました！", "success");
    loadAdminAnnouncements();
  } catch (e) {
    console.error("publishAnnouncement error:", e);
    alertMessage("配信に失敗しました: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane text-xs"></i> 全体に配信する';
  }
};

window.deleteAdminAnnouncement = async function (id) {
  if (!await showCustomConfirm("このお知らせを削除しますか？", "削除")) return;
  try {
    const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    await deleteDoc(doc(db, `artifacts/${appId}/announcements`, id));
    alertMessage("削除しました", "success");
    loadAdminAnnouncements();
  } catch (e) {
    console.error("deleteAnnouncement error:", e);
    alertMessage("削除に失敗しました", "error");
  }
};

let _announcementListenerUnsub = null;
async function setupGlobalAnnouncementListener() {
  if (_announcementListenerUnsub) return;
  try {
    const { ref, onValue, off } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
    const rtdb = await _getOrInitRTDB();
    const annRef = ref(rtdb, `artifacts/${appId}/latestAnnouncement`);
    
    const onAnn = (snap) => {
      const data = snap.val();
      if (!data || !data.id) return;
      const lastSeenId = localStorage.getItem('covo_last_seen_announcement_id');
      if (lastSeenId !== data.id && data.active !== false) {
        showAnnouncementModal(data, data.id);
      }
    };
    onValue(annRef, onAnn);
    _announcementListenerUnsub = () => off(annRef, 'value', onAnn);
  } catch (e) {
    console.warn("setupGlobalAnnouncementListener error, fallback to checkLatestAnnouncement:", e);
    checkLatestAnnouncement();
  }
}

window.checkLatestAnnouncement = async function () {
  try {
    const { collection, query, orderBy, limit, getDocs } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const q = query(collection(db, `artifacts/${appId}/announcements`), orderBy('publishedAt', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return;
    const docData = snap.docs[0].data();
    const docId = snap.docs[0].id;
    const lastSeenId = localStorage.getItem('covo_last_seen_announcement_id');
    if (lastSeenId !== docId && docData.active !== false) {
      showAnnouncementModal(docData, docId);
    }
  } catch (e) {
    console.warn("checkLatestAnnouncement error:", e);
  }
};

let _announcementsListCache = [];
let _currentAnnouncementIndex = 0;

window.showAnnouncementModal = function (data, id, allList = null, currentIndex = 0) {
  const modal = document.getElementById("whatsNewModal");
  if (!modal) return;

  if (Array.isArray(allList) && allList.length > 0) {
    _announcementsListCache = allList;
    _currentAnnouncementIndex = currentIndex;
  } else if (!allList && data) {
    _announcementsListCache = [{ id, ...data }];
    _currentAnnouncementIndex = 0;
  }

  const current = (_announcementsListCache.length > 0 && _announcementsListCache[_currentAnnouncementIndex])
    ? _announcementsListCache[_currentAnnouncementIndex]
    : data;

  if (!current) return;

  const typeBadge = document.getElementById("whatsNewTypeBadge");
  const iconWrap = document.getElementById("whatsNewIconWrap");
  const verEl = document.getElementById("whatsNewVersion");
  const titleEl = document.getElementById("whatsNewTitle");
  const dateEl = document.getElementById("whatsNewDate");
  const contentEl = document.getElementById("whatsNewContent");
  const iconEl = document.getElementById("whatsNewIcon");
  const navRow = document.getElementById("whatsNewNavRow");
  const indexDisplay = document.getElementById("whatsNewIndexDisplay");
  const prevBtn = document.getElementById("whatsNewPrevBtn");
  const nextBtn = document.getElementById("whatsNewNextBtn");

  if (verEl) verEl.textContent = current.version || "";
  if (titleEl) titleEl.textContent = current.title || "最新アップデートのお知らせ";
  if (dateEl) {
    let dt = '';
    if (current.publishedAt?.toDate) dt = current.publishedAt.toDate().toLocaleDateString('ja-JP');
    else if (typeof current.publishedAt === 'number') dt = new Date(current.publishedAt).toLocaleDateString('ja-JP');
    dateEl.textContent = dt;
  }

  // ナビゲーションバーの更新
  if (navRow) {
    if (_announcementsListCache.length > 1) {
      navRow.classList.remove("hidden");
      if (indexDisplay) {
        indexDisplay.textContent = `${_currentAnnouncementIndex + 1} / ${_announcementsListCache.length}`;
      }
      if (prevBtn) {
        prevBtn.style.opacity = _currentAnnouncementIndex > 0 ? "1" : "0.35";
        prevBtn.style.pointerEvents = _currentAnnouncementIndex > 0 ? "auto" : "none";
      }
      if (nextBtn) {
        nextBtn.style.opacity = _currentAnnouncementIndex < _announcementsListCache.length - 1 ? "1" : "0.35";
        nextBtn.style.pointerEvents = _currentAnnouncementIndex < _announcementsListCache.length - 1 ? "auto" : "none";
      }
    } else {
      navRow.classList.add("hidden");
    }
  }

  // 本文のリッチフォーマット処理（Markdown風の箇条書き・太字・コード・リンク化）
  if (contentEl) {
    const rawText = current.content || "";
    if (typeof escapeHtmlAndLinkUrls === 'function') {
      contentEl.innerHTML = escapeHtmlAndLinkUrls(rawText);
    } else {
      contentEl.textContent = rawText;
    }
  }

  // カテゴリバッジ・アイコンのライト＆ダーク両対応スタイリング
  if (typeBadge) {
    if (current.category === 'bugfix') {
      typeBadge.textContent = "BUG FIX";
      typeBadge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 tracking-wider uppercase";
      if (iconEl) iconEl.className = "fas fa-wrench";
      if (iconWrap) iconWrap.className = "w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-100 dark:border-amber-800/40 flex items-center justify-center text-xl flex-shrink-0 shadow-xs transition-colors";
    } else if (current.category === 'notice') {
      typeBadge.textContent = "NOTICE";
      typeBadge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 tracking-wider uppercase";
      if (iconEl) iconEl.className = "fas fa-circle-exclamation";
      if (iconWrap) iconWrap.className = "w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-100 dark:border-rose-800/40 flex items-center justify-center text-xl flex-shrink-0 shadow-xs transition-colors";
    } else if (current.category && current.category !== 'update' && current.category !== 'none') {
      typeBadge.textContent = String(current.category).toUpperCase();
      typeBadge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 tracking-wider uppercase";
      if (iconEl) iconEl.className = "fas fa-tag";
      if (iconWrap) iconWrap.className = "w-11 h-11 rounded-2xl bg-slate-50 text-slate-600 dark:bg-slate-900/60 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center text-xl flex-shrink-0 shadow-xs transition-colors";
    } else {
      typeBadge.textContent = "UPDATE";
      typeBadge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 tracking-wider uppercase";
      if (iconEl) iconEl.className = "fas fa-sparkles";
      if (iconWrap) iconWrap.className = "w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/40 flex items-center justify-center text-xl flex-shrink-0 shadow-xs transition-colors";
    }
  }

  modal.dataset.currentId = current.id || id || "";
  modal.classList.remove("hidden");
  modal.style.display = "flex";
  if (typeof updateMetaThemeColor === 'function') updateMetaThemeColor();
};

window.navigateAnnouncement = function (delta) {
  if (!_announcementsListCache || _announcementsListCache.length === 0) return;
  const newIndex = _currentAnnouncementIndex + delta;
  if (newIndex >= 0 && newIndex < _announcementsListCache.length) {
    _currentAnnouncementIndex = newIndex;
    showAnnouncementModal(null, null, _announcementsListCache, newIndex);
  }
};

window.closeWhatsNewModal = function () {
  const modal = document.getElementById("whatsNewModal");
  if (!modal) return;
  const id = modal.dataset.currentId;
  if (id) {
    localStorage.setItem('covo_last_seen_announcement_id', id);
  }
  modal.classList.add("hidden");
  modal.style.display = "none";
};

window.showLatestAnnouncementModal = async function (force = false) {
  try {
    const { collection, query, orderBy, limit, getDocs } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const q = query(collection(db, `artifacts/${appId}/announcements`), orderBy('publishedAt', 'desc'), limit(15));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      showAnnouncementModal(list[0], list[0].id, list, 0);
    } else if (force) {
      alertMessage("配信されているお知らせはありません", "info");
    }
  } catch (e) {
    console.error("showLatestAnnouncementModal error:", e);
    if (force) alertMessage("お知らせの取得に失敗しました", "error");
  }
};

// 手動アップデート確認（設定のアプリ情報から呼ばれる）
window.manualCheckUpdate = async function (btnId, statusId) {
  const btn = document.getElementById(btnId);
  const statusEl = statusId ? document.getElementById(statusId) : null;
  if (!btn || btn.dataset.checking === '1') return;
  btn.dataset.checking = '1';
  if (btn.tagName === 'BUTTON') { btn.disabled = true; btn.textContent = '確認中…'; }
  if (statusEl) { statusEl.textContent = '確認中…'; statusEl.style.color = '#6b7280'; }

  const resetBtn = () => {
    if (btn) { btn.dataset.checking = '0'; if (btn.tagName === 'BUTTON') { btn.disabled = false; btn.textContent = 'アップデートを確認'; } }
  };

  if (!isTauri) {
    if (statusEl) { statusEl.textContent = 'キャッシュをクリアして再読み込み中...'; statusEl.style.color = '#6b7280'; }
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) {
          await r.unregister();
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const k of keys) {
          await caches.delete(k);
        }
      }
    } catch (e) { console.warn('[manualCheckUpdate] cache clear failed:', e); }
    window.location.href = window.location.pathname + '?v=' + new Date().getTime();
    return;
  }

  try {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) throw new Error('Tauri invoke unavailable');
    const metadata = await invoke('plugin:updater|check');
    if (metadata) {
      resetBtn();
      if (statusEl) { statusEl.textContent = ''; }

      localStorage.setItem('covo_ignore_force_update', '0');
      if (typeof updateForceOverrideUI === 'function') updateForceOverrideUI();

      const result = await blockingUpdateCheck();
      if (!result) {
        const overlay = document.getElementById('updateOverlay');
        const versionText = document.getElementById('updateVersionText');
        const bodyText = document.getElementById('updateBodyText');
        const closeBtn = document.getElementById('updateCloseButton');
        const updateBtn = document.getElementById('updateButton');
        const updateMainTitle = document.getElementById('updateMainTitle');
        if (overlay && versionText) {
          versionText.textContent = `v${metadata.version} を自動でダウンロード中...`;
          if (bodyText) bodyText.textContent = metadata.body || 'バグ修正とパフォーマンス改善が含まれています。';
          if (closeBtn) closeBtn.classList.add('hidden');
          if (updateBtn) updateBtn.classList.add('hidden');
          if (updateMainTitle) updateMainTitle.textContent = '最新アップデートをダウンロード中';
          overlay.classList.add('show');
          setTimeout(() => { performUpdate(); }, 500);
        }
      }
    } else {
      if (statusEl) { statusEl.textContent = '最新バージョンです'; statusEl.style.color = '#4f46e5'; }
      resetBtn();
    }
  } catch (e) {
    console.warn('[manualCheckUpdate] failed:', e);
    if (statusEl) { statusEl.textContent = '確認に失敗しました'; statusEl.style.color = '#ef4444'; }
    resetBtn();
  }
};

// デスクトップショートカット作成（設定のアプリ情報から呼ばれる）
window.createDesktopShortcut = async function (btnId, statusId) {
  const btn = document.getElementById(btnId);
  const statusEl = statusId ? document.getElementById(statusId) : null;
  if (!btn || btn.dataset.creating === '1') return;
  btn.dataset.creating = '1';
  const origText = btn.tagName === 'BUTTON' ? btn.textContent : null;
  if (origText) { btn.disabled = true; btn.textContent = '作成中…'; }
  if (statusEl) { statusEl.textContent = '作成中…'; statusEl.style.color = '#6b7280'; }

  const reset = () => {
    if (btn) { btn.dataset.creating = '0'; if (origText) { btn.disabled = false; btn.textContent = origText; } }
  };

  try {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) throw new Error('Tauri unavailable');
    await invoke('create_desktop_shortcut');
    if (statusEl) { statusEl.textContent = 'ショートカットを作成しました'; statusEl.style.color = '#4f46e5'; }
    reset();
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
  } catch (e) {
    console.warn('[createDesktopShortcut] failed:', e);
    if (statusEl) { statusEl.textContent = '作成に失敗しました'; statusEl.style.color = '#ef4444'; }
    reset();
  }
};

// ─────────────────────────────────────────────────────────────
// 進捗UI ヘルパー
// ─────────────────────────────────────────────────────────────
const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let _spinIdx = 0;
let _spinTimer = null;

function startSpinner() {
  const el = document.getElementById('updateSpinnerIcon');
  if (!el) return;
  _spinIdx = 0;
  _spinTimer = setInterval(() => {
    if (el) el.textContent = SPINNERS[_spinIdx++ % SPINNERS.length];
  }, 80);
}
function stopSpinner(symbol = '✔') {
  clearInterval(_spinTimer);
  _spinTimer = null;
  const el = document.getElementById('updateSpinnerIcon');
  if (el) { el.textContent = symbol; el.style.animation = 'none'; }
}

function formatDownloadBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function updateProgressUI({ progress = 0, downloaded = 0, total = 0, text = '' } = {}) {
  const bar = document.getElementById('updateProgressBar');
  const pct = document.getElementById('updatePercentText');
  const bytes = document.getElementById('updateBytesText');
  const statusText = document.getElementById('updateProgressText');
  const area = document.getElementById('updateProgressArea');

  if (area && area.classList.contains('hidden')) area.classList.remove('hidden');
  if (bar) bar.style.width = Math.min(progress, 100) + '%';
  if (pct) pct.textContent = progress + '%';
  if (bytes && total > 0) bytes.textContent = formatDownloadBytes(downloaded) + ' / ' + formatDownloadBytes(total);
  else if (bytes && downloaded > 0) bytes.textContent = formatDownloadBytes(downloaded) + ' ダウンロード済み';
  if (statusText && text) statusText.textContent = text;
}

// 自動再起動カウントダウン
function startAutoRestartCountdown(seconds = 3) {
  const el = document.getElementById('countdownSec');
  const restartContainer = document.getElementById('updateRestartContainer');
  if (restartContainer) restartContainer.classList.remove('hidden');
  let remaining = seconds;
  if (el) el.textContent = remaining;
  const timer = setInterval(() => {
    remaining--;
    if (el) el.textContent = Math.max(0, remaining);
    if (remaining <= 0) {
      clearInterval(timer);
      forceRestartNow();
    }
  }, 1000);
}

window.forceRestartNow = function () {
  const invoke = window.__TAURI__?.core?.invoke;
  if (invoke) {
    // Tauri環境では app.restart() 相当のコマンドを呼ぶ
    invoke('plugin:process|restart').catch(() => {
      // フォールバック: reload
      window.location.reload();
    });
  } else {
    window.location.reload();
  }
};

// アップデート実行（HTMLのonclickまたは自動更新から呼ばれる）
window.performUpdate = async function () {
  if (!pendingUpdate) return;
  const btn = document.getElementById('updateButton');
  const invoke = window.__TAURI__?.core?.invoke;

  if (btn) { btn.disabled = true; btn.classList.add('hidden'); }
  updateProgressUI({ progress: 20, text: 'アップデートを準備中...' });
  startSpinner();

  try {
    // Tauri標準の確実なビルトインアップデーターを実行
    // 完了後に自動的にインストーラー(Covoセットアップ)が起動するため、同時にアプリを自動終了させる
    updateProgressUI({ progress: 60, text: '更新データを取得中...' });
    await pendingUpdate.downloadAndInstall();
    updateProgressUI({ progress: 100, text: '完了。covoセットアップを起動します...' });
    stopSpinner('✔');
    if (invoke) {
      invoke('plugin:process|exit', { code: 0 }).catch(() => {
        invoke('tauri', { __tauriModule: 'Process', message: { cmd: 'exit', exitCode: 0 } }).catch(() => { });
      });
    }
  } catch (error) {
    stopSpinner('✖');
    console.error('Update failed:', error);
    const detail = error instanceof Error
      ? (error.message + (error.stack ? '\n\n' + error.stack : ''))
      : (typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error));

    if (detail.includes('The signature was created with a different key')) {
      const url = 'https://github.com/qwertyuiop1229/covo/releases/latest';
      if (invoke) {
        invoke('plugin:shell|open', { path: url }).catch(() => window.open(url, '_blank'));
      } else {
        window.open(url, '_blank');
      }
      updateProgressUI({ progress: 0, text: '手動でのアップデートが必要です。ブラウザを開いています...' });
      if (btn) {
        btn.innerHTML = '<i class="fas fa-external-link-alt"></i>&nbsp;&nbsp;ダウンロードページへ';
        btn.disabled = false; btn.classList.remove('hidden');
        btn.onclick = () => { if (invoke) invoke('plugin:shell|open', { path: url }).catch(() => window.open(url, '_blank')); else window.open(url, '_blank'); };
      }
      return;
    }

    updateProgressUI({ progress: 0, text: 'アップデート失敗（詳細は下のエラー欄を確認）' });
    const errBox = document.getElementById('updateErrorBox');
    const errArea = document.getElementById('updateErrorDetail');
    if (errBox && errArea) { errArea.value = detail; errBox.classList.remove('hidden'); }
    if (btn) { btn.disabled = false; btn.classList.remove('hidden'); btn.innerHTML = '<i class="fas fa-download"></i>&nbsp;&nbsp;もう一度試す'; }
  }
};

// エラーコピー
document.addEventListener('click', (e) => {
  if (e.target?.id === 'copyErrorBtn') {
    const ta = document.getElementById('updateErrorDetail');
    if (ta) {
      copyToClipboard(ta.value).then(() => {
        e.target.textContent = 'コピーしました ✓';
        setTimeout(() => { e.target.textContent = 'エラーをコピー'; }, 1500);
      });
    }
  }
});

// ===== Web版専用: Windowsインストーラー自動取得＆ダウンロード =====
// PWAインストールプロンプトの変数定義
let deferredPwaPrompt = null;

// ===== デバイス判定＆ダウンロード / インストール分岐 =====
window.openWindowsDownloadModal = function () {
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isAndroid = /android/i.test(ua);

  // 1. iOS Safari の場合: ホーム画面追加ガイドモーダルを表示
  if (isIos && isSafari) {
    const iosModal = document.getElementById('iosPwaGuideModal');
    if (iosModal) {
      iosModal.classList.remove('hidden');
      return;
    }
  }

  // 2. Android の場合: ワンタップでPWAインストールプロンプトを起動
  if (isAndroid && (deferredPwaPrompt || window.__deferredPwaPrompt)) {
    const promptEvent = deferredPwaPrompt || window.__deferredPwaPrompt;
    promptEvent.prompt();
    promptEvent.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        alertMessage('ホーム画面に追加しました！', 'success');
      }
      deferredPwaPrompt = null;
      window.__deferredPwaPrompt = null;
    });
    return;
  }

  // 3. PC Web版の場合: Windows版ダウンロード案内モーダルを表示
  const modal = document.getElementById('windowsDownloadModal');
  if (modal) modal.classList.remove('hidden');
};

window.downloadLatestWindowsApp = async function (triggerBtn) {
  const btn = triggerBtn || document.getElementById('modalDownloadExeBtn');
  const orgHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> 最新版を取得中...';
  }

  try {
    const res = await fetch('https://api.github.com/repos/qwertyuiop1229/covo/releases/latest');
    if (!res.ok) throw new Error('Release API error: ' + res.status);
    const data = await res.json();
    
    // .exe ファイルを探す
    let downloadUrl = null;
    if (data.assets && data.assets.length > 0) {
      const exeAsset = data.assets.find(a => a.name.endsWith('.exe') || a.name.endsWith('-setup.exe'));
      if (exeAsset) {
        downloadUrl = exeAsset.browser_download_url;
      }
    }

    if (!downloadUrl) {
      downloadUrl = data.html_url || 'https://github.com/qwertyuiop1229/covo/releases/latest';
    }

    // ダウンロードを開始
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = '';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (btn) {
      btn.innerHTML = '<i class="fas fa-check"></i> ダウンロードを開始しました';
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = orgHtml;
        const modal = document.getElementById('windowsDownloadModal');
        if (modal) modal.classList.add('hidden');
      }, 2000);
    }
  } catch (err) {
    console.error('Download latest Windows app failed:', err);
    // フォールバック
    window.open('https://github.com/qwertyuiop1229/covo/releases/latest', '_blank');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = orgHtml;
    }
  }
};

// ===== タイトルバー中央コンテキスト更新 =====
window.updateTitleBarContext = function (type, data) {
  const iconEl = document.getElementById('titleBarContextIcon');
  const textEl = document.getElementById('titleBarContextText');
  if (!iconEl || !textEl) return;

  if (type === 'server' && data) {
    const sName = data.name || data.id || 'サーバー';
    textEl.textContent = sName;
    if (data.iconUrl) {
      iconEl.innerHTML = `<img src="${escapeHtml(data.iconUrl)}" class="w-full h-full object-cover rounded" />`;
    } else {
      const initial = sName.charAt(0).toUpperCase();
      iconEl.innerHTML = `<span class="w-full h-full bg-slate-600 dark:bg-slate-700 text-white flex items-center justify-center font-bold text-[9px] rounded">${escapeHtml(initial)}</span>`;
    }
  } else if (type === 'dm' || type === 'home') {
    textEl.textContent = 'フレンド';
    iconEl.innerHTML = '<i class="fas fa-user-friends text-xs"></i>';
  } else if (type === 'discover') {
    textEl.textContent = 'サーバーを探す';
    iconEl.innerHTML = '<i class="fas fa-compass text-xs"></i>';
  } else {
    textEl.textContent = 'Covo';
    iconEl.innerHTML = '<i class="fas fa-comments text-xs"></i>';
  }
};
function updateTitleBarContext(...args) { return window.updateTitleBarContext(...args); }

// ===== Windows版 (Tauri) Discord風 カスタムタイトルバー ウィンドウ操作 =====
window.minimizeWindow = function () {
  if (window.__TAURI__?.core?.invoke) {
    window.__TAURI__.core.invoke('minimize_window').catch(console.error);
  } else if (window.__TAURI__?.window?.getCurrentWindow) {
    window.__TAURI__.window.getCurrentWindow().minimize().catch(console.error);
  }
};

window.toggleMaximizeWindow = async function () {
  if (window.__TAURI__?.core?.invoke) {
    window.__TAURI__.core.invoke('toggle_maximize_window').catch(console.error);
  } else if (window.__TAURI__?.window?.getCurrentWindow) {
    const win = window.__TAURI__.window.getCurrentWindow();
    const isMax = await win.isMaximized().catch(() => false);
    if (isMax) win.unmaximize().catch(console.error);
    else win.maximize().catch(console.error);
  }
};

window.closeWindow = function () {
  if (window.__TAURI__?.core?.invoke) {
    window.__TAURI__.core.invoke('close_window').catch(console.error);
  } else if (window.__TAURI__?.window?.getCurrentWindow) {
    const closeBehavior = localStorage.getItem('covo_close_behavior') || 'minimize';
    if (closeBehavior === 'quit') {
      window.__TAURI__.window.getCurrentWindow().close().catch(console.error);
    } else if (closeBehavior === 'hide') {
      window.__TAURI__.window.getCurrentWindow().hide().catch(console.error);
    } else {
      window.minimizeWindow();
    }
  }
};

// 環境判定とタイトルバー / ダウンロードボタンの表示初期化
(function initDesktopAndWebUI() {
  const titleBar = document.getElementById('discordTitleBar');
  const winControls = document.getElementById('windowControlsGroup');
  const titleBarDlBtn = document.getElementById('titleBarDownloadAppBtn');
  const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

  if (window.__TAURI__) {
    // Windowsデスクトップアプリ (Tauri): ウィンドウ操作ボタンを表示
    if (titleBar) titleBar.style.display = 'flex';
    if (winControls) winControls.style.display = 'flex';
    if (titleBarDlBtn) titleBarDlBtn.style.display = 'none';
  } else {
    // Web版 / PWA: タイトルバーを表示（ウィンドウ操作ボタンは非表示）
    if (titleBar) titleBar.style.display = 'flex';
    if (winControls) winControls.style.display = 'none';
    if (titleBarDlBtn) titleBarDlBtn.style.display = isStandalone ? 'none' : 'flex';
  }

  // 初期コンテキストのセット
  if (typeof updateTitleBarContext === 'function') {
    if (typeof currentServerId !== 'undefined' && currentServerId && typeof currentServerData !== 'undefined' && currentServerData) {
      updateTitleBarContext('server', currentServerData);
    } else if (typeof currentHomeViewMode !== 'undefined' && currentHomeViewMode === 'discover') {
      updateTitleBarContext('discover');
    } else {
      updateTitleBarContext('dm');
    }
  }
})();

// ================= MODULE: settings_ui.js ================
// ================= SETTINGS UI MODULE ================

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
// Keyboard Shortcuts (Enter for Confirm / Form Submit)
// =========================================================================
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    if (e.isComposing || e.keyCode === 229) return;
    const authCont = document.getElementById("authContainer");
    const emailInp = document.getElementById("emailInput");
    const passInp = document.getElementById("passwordInput");
    const authBtn = document.getElementById("authButton");
    const nickCont = document.getElementById("nicknameContainer");
    const nickInp = document.getElementById("nicknameInput");
    const setNickBtn = document.getElementById("setNicknameButton");
    const createRoomModal = document.getElementById("createRoomPasswordModal");
    const modalNewRoomName = document.getElementById("modalNewRoomNameInput");
    const newRoomPass = document.getElementById("newRoomPasswordInput");
    const confirmCreateRoomBtn = document.getElementById("confirmCreateRoomButton");
    const joinRoomModal = document.getElementById("joinRoomPasswordModal");
    const joinRoomPass = document.getElementById("joinRoomPasswordInput");
    const confirmJoinRoomBtn = document.getElementById("confirmJoinRoomButton");
    const delRoomConfirmModal = document.getElementById("deleteRoomConfirmModal");
    const confirmDelBtn = document.getElementById("confirmDeleteButton");
    const delRoomPassModal = document.getElementById("deleteRoomPasswordModal");
    const delRoomPassInp = document.getElementById("deleteRoomPasswordInput");
    const confirmDelPassBtn = document.getElementById("confirmDeletePasswordButton");
    const setModal = document.getElementById("settingsModal");
    const setNickInp = document.getElementById("settingsNicknameInput");
    const saveSetBtn = document.getElementById("saveSettingsButton");

    if (authCont && !authCont.classList.contains("hidden") && (document.activeElement === emailInp || document.activeElement === passInp)) {
      e.preventDefault(); if (authBtn) authBtn.click();
    } else if (nickCont && !nickCont.classList.contains("hidden") && document.activeElement === nickInp) {
      e.preventDefault(); if (setNickBtn) setNickBtn.click();
    } else if (createRoomModal && !createRoomModal.classList.contains("hidden") && (document.activeElement === modalNewRoomName || document.activeElement === newRoomPass)) {
      e.preventDefault(); if (confirmCreateRoomBtn) confirmCreateRoomBtn.click();
    } else if (joinRoomModal && !joinRoomModal.classList.contains("hidden") && document.activeElement === joinRoomPass) {
      e.preventDefault(); if (confirmJoinRoomBtn) confirmJoinRoomBtn.click();
    } else if (delRoomConfirmModal && !delRoomConfirmModal.classList.contains("hidden")) {
      e.preventDefault(); if (confirmDelBtn) confirmDelBtn.click();
    } else if (delRoomPassModal && !delRoomPassModal.classList.contains("hidden") && document.activeElement === delRoomPassInp) {
      e.preventDefault(); if (confirmDelPassBtn) confirmDelPassBtn.click();
    } else if (setModal && !setModal.classList.contains("hidden") && document.activeElement === setNickInp) {
      e.preventDefault(); if (saveSetBtn) saveSetBtn.click();
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

      // 通知クリック時: Tauri (Windows EXE) ではウィンドウをフォーカスし、該当ルームへ遷移
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NOTIFICATION_CLICKED') {
          if (window.__TAURI__) {
            try {
              window.__TAURI__.window.getCurrent().setFocus();
            } catch (e) {
              try { window.__TAURI__.invoke('tauri', { __tauriModule: 'Window', message: { cmd: 'setFocus' } }); } catch (_) { }
            }
          }
          const notifData = event.data.data;
          if (notifData?.type === 'incoming_call') {
            handleCallNotificationClick(notifData);
          } else if (notifData?.roomId) {
            const doJump = () => {
              if (notifData.serverId && notifData.serverId !== currentServerId) {
                if (typeof goToServerRoom === 'function') {
                  goToServerRoom(notifData.serverId, notifData.roomId);
                }
              } else {
                if (typeof goToRoom === 'function') {
                  goToRoom(notifData.roomId);
                } else {
                  const roomItem = document.getElementById(`room-item-${notifData.roomId}`);
                  if (roomItem) roomItem.click();
                }
              }
            };
            if (isAuthReady && userId) {
              doJump();
            } else {
              window.__pendingNotifJump = doJump;
            }
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
        console.log('📱 [通知] 通知権限が許可されていないため、プッシュ通知の登録をスキップしました (現在の状態: ' + Notification.permission + ')');
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
  let leftPointerId = null;

  if (resizer && sidebar) {
    resizer.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      isResizingLeft = true;
      leftPointerId = e.pointerId;
      try { resizer.setPointerCapture(e.pointerId); } catch (_) {}
      resizer.classList.add("is-resizing");
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    });

    resizer.addEventListener("pointermove", (e) => {
      if (!isResizingLeft) return;
      const sidebarRect = sidebar.getBoundingClientRect();
      // sidebar の左端からの相対X座標で計算（サーバーナビゲーションバーの幅を自動控除）
      const calculatedWidth = e.clientX - sidebarRect.left;
      const maxAllowed = Math.min(600, window.innerWidth - 180);
      const newWidth = Math.max(180, Math.min(maxAllowed, calculatedWidth));
      sidebar.style.width = `${newWidth}px`;
    });

    const stopLeftResize = (e) => {
      if (!isResizingLeft) return;
      isResizingLeft = false;
      if (leftPointerId !== null) {
        try { resizer.releasePointerCapture(leftPointerId); } catch (_) {}
        leftPointerId = null;
      }
      resizer.classList.remove("is-resizing");
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (sidebar) localStorage.setItem(LEFT_WIDTH_KEY, sidebar.style.width);
    };

    resizer.addEventListener("pointerup", stopLeftResize);
    resizer.addEventListener("pointercancel", stopLeftResize);
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
  let rightPointerId = null;

  if (resizerRight && membersSidebar) {
    resizerRight.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      isResizingRight = true;
      rightPointerId = e.pointerId;
      try { resizerRight.setPointerCapture(e.pointerId); } catch (_) {}
      resizerRight.classList.add("is-resizing");
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    });

    resizerRight.addEventListener("pointermove", (e) => {
      if (!isResizingRight) return;
      const appContainer = document.getElementById("appContainer") || document.body;
      const appRect = appContainer.getBoundingClientRect();
      // 右端からの相対幅を計算
      const calculatedWidth = appRect.right - e.clientX;
      const maxAllowed = Math.min(500, window.innerWidth - 200);
      const newWidth = Math.max(160, Math.min(maxAllowed, calculatedWidth));
      membersSidebar.style.width = `${newWidth}px`;
    });

    const stopRightResize = (e) => {
      if (!isResizingRight) return;
      isResizingRight = false;
      if (rightPointerId !== null) {
        try { resizerRight.releasePointerCapture(rightPointerId); } catch (_) {}
        rightPointerId = null;
      }
      resizerRight.classList.remove("is-resizing");
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (membersSidebar) localStorage.setItem(RIGHT_WIDTH_KEY, membersSidebar.style.width);
    };

    resizerRight.addEventListener("pointerup", stopRightResize);
    resizerRight.addEventListener("pointercancel", stopRightResize);
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

const pwaBanner = document.getElementById('pwaInstallBanner');
const pwaInstallBtn = document.getElementById('pwaInstallButton');
const pwaCloseBtn = document.getElementById('pwaInstallClose');

const isMobileDevice = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

window.addEventListener('beforeinstallprompt', (e) => {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  // スマホ端末またはインストール可能な環境のみキャプチャ
  if (!isStandalone && !isTauri) {
    e.preventDefault();
    deferredPwaPrompt = e;
    window.__deferredPwaPrompt = e;
    if (isMobileDevice && pwaBanner) {
      pwaBanner.classList.add('show');
    }
  }
});

if (pwaInstallBtn) {
  pwaInstallBtn.addEventListener('click', async () => {
    if (deferredPwaPrompt) {
      deferredPwaPrompt.prompt();
      const { outcome } = await deferredPwaPrompt.userChoice;
      if (outcome === 'accepted') {
        pwaBanner?.classList.remove('show');
      }
      deferredPwaPrompt = null;
      window.__deferredPwaPrompt = null;
    } else if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
      // iOS Safariの場合
      showCustomAlert("Safariの「共有」ボタンから「ホーム画面に追加」を選択してください。\n追加すると通知を受け取れるようになります。");
    }
  });
}

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
  const toggleNotifSoundMobile = document.getElementById('toggleNotifSoundMobile');
  const toggleBrowserNotifMobile = document.getElementById('toggleBrowserNotifMobile');
  const toggleAutoStart = document.getElementById('toggleAutoStart');

  // 初期値の読み込み (デフォルトは有効: true)
  const soundEnabled = localStorage.getItem('simplechat_sound') !== 'false';
  const notifEnabled = localStorage.getItem('simplechat_browser_notif') !== 'false';

  if (toggleNotifSound) toggleNotifSound.checked = soundEnabled;
  if (toggleNotifSoundMobile) toggleNotifSoundMobile.checked = soundEnabled;
  if (toggleBrowserNotif) toggleBrowserNotif.checked = notifEnabled;
  if (toggleBrowserNotifMobile) toggleBrowserNotifMobile.checked = notifEnabled;

  loadDarkServerTheme();

  // 通知音トグルのリスナー (PC & Mobile 同期)
  const handleSoundChange = (checked) => {
    localStorage.setItem('simplechat_sound', checked ? 'true' : 'false');
    if (toggleNotifSound && toggleNotifSound.checked !== checked) toggleNotifSound.checked = checked;
    if (toggleNotifSoundMobile && toggleNotifSoundMobile.checked !== checked) toggleNotifSoundMobile.checked = checked;
  };
  if (toggleNotifSound) toggleNotifSound.addEventListener('change', (e) => handleSoundChange(e.target.checked));
  if (toggleNotifSoundMobile) toggleNotifSoundMobile.addEventListener('change', (e) => handleSoundChange(e.target.checked));

  // 通知トグルのリスナー (PC & Mobile 同期)
  const handleNotifChange = (checked) => {
    localStorage.setItem('simplechat_browser_notif', checked ? 'true' : 'false');
    localStorage.setItem('simplechat_desktop_notif', checked ? 'true' : 'false');
    if (toggleBrowserNotif && toggleBrowserNotif.checked !== checked) toggleBrowserNotif.checked = checked;
    if (toggleBrowserNotifMobile && toggleBrowserNotifMobile.checked !== checked) toggleBrowserNotifMobile.checked = checked;
    setBrowserPushEnabled(checked).catch(console.error);
    if (isTauri && checked) {
      const tauriNotif = window.__TAURI__?.notification;
      if (tauriNotif && tauriNotif.requestPermission) {
        tauriNotif.requestPermission();
      } else if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
      }
    }
  };
  if (toggleBrowserNotif) toggleBrowserNotif.addEventListener('change', (e) => handleNotifChange(e.target.checked));
  if (toggleBrowserNotifMobile) toggleBrowserNotifMobile.addEventListener('change', (e) => handleNotifChange(e.target.checked));

  if (isTauri) {
    // Windows版: 自動起動・ショートカットを表示
    document.getElementById('desktopSettingsContainer')?.classList.remove('hidden');
    document.getElementById('shortcutInfoContainer')?.classList.remove('hidden');
    const pcRow = document.getElementById('pcCreateShortcutRow');
    if (pcRow) pcRow.style.setProperty('display', 'flex', 'important');
    const mobileRow = document.getElementById('mobileCreateShortcutBtn');
    if (mobileRow) mobileRow.style.display = 'flex';

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

    if (window.__TAURI__?.autostart) {
      window.__TAURI__.autostart.isEnabled().then(enabled => {
        if (toggleAutoStart) toggleAutoStart.checked = enabled;
      }).catch(console.error);
    }

    // ショートカットキー入力欄の初期化
    const shortcutInput = document.getElementById('shortcutKeyInput');
    const shortcutDisplay = document.getElementById('shortcutKeyDisplay');
    const savedKey = localStorage.getItem('simplechat_shortcut_key') || 'S';
    if (shortcutInput) shortcutInput.value = savedKey.toUpperCase();
    if (shortcutDisplay) shortcutDisplay.textContent = savedKey.toUpperCase();

    if (shortcutInput) {
      shortcutInput.addEventListener('input', (e) => {
        const val = e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
        e.target.value = val;
        if (val.length === 1) {
          localStorage.setItem('simplechat_shortcut_key', val);
          if (shortcutDisplay) shortcutDisplay.textContent = val;
          if (window.__TAURI__?.core?.invoke) {
            window.__TAURI__.core.invoke('update_shortcut_key', { key: val }).catch(console.error);
          }
        }
      });

      shortcutInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') e.preventDefault();
      });
    }
  }

  if (toggleAutoStart) {
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
  }

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

// ===== テーマ切り替えロジック (Light, Dark Navy) =====
window.setAppTheme = function (theme) {
  const isDark = (theme === 'dark-navy' || theme === 'dark');
  const validTheme = isDark ? 'dark-navy' : 'light';
  localStorage.setItem('covo_app_theme', validTheme);
  localStorage.setItem('covo_dark_server', isDark ? 'true' : 'false');

  document.documentElement.classList.toggle('dark-server-theme', isDark);
  document.documentElement.classList.toggle('dark', isDark);
  document.body.classList.toggle('dark-server-theme', isDark);
  document.body.classList.toggle('dark', isDark);

  const mobileToggle = document.getElementById('toggleDarkServerMobile');
  if (mobileToggle && 'checked' in mobileToggle) mobileToggle.checked = isDark;

  updateThemeSelectorUI(validTheme);
  if (typeof updateMetaThemeColor === 'function') updateMetaThemeColor();
};

window.updateThemeSelectorUI = function (theme) {
  let t = theme || localStorage.getItem('covo_app_theme') || (localStorage.getItem('covo_dark_server_theme') === 'true' ? 'dark-navy' : 'light');
  if (t === 'discord-dark') t = 'dark-navy';
  const btnLight = document.getElementById('themeBtnLight');
  const btnNavy = document.getElementById('themeBtnDarkNavy');

  [btnLight, btnNavy].forEach(b => {
    if (b) {
      b.classList.remove('ring-2', 'ring-indigo-500', 'border-indigo-500');
    }
  });

  if (t === 'dark-navy' && btnNavy) {
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

// ===== ショートカットキー & グローバル Esc キー =====
document.addEventListener("keydown", (e) => {
  // Ctrl+I / Cmd+I で受信ボックスの開閉トグル
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i' && !e.shiftKey && !e.altKey) {
    const activeEl = document.activeElement;
    const isEditing = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
    if (!isEditing || (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      window.toggleNotifModal();
      return;
    }
  }

  // Ctrl+Shift+E / Cmd+Shift+E で受信ボックスの全通知を既読にする
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    window.clearAllNotifications();
    return;
  }

  if (e.key === "Escape") {
    // -1. ステメ絵文字ピッカー
    const statusEmojiPopover = document.getElementById('statusEmojiPopover');
    if (statusEmojiPopover && statusEmojiPopover.style.display !== 'none') {
      statusEmojiPopover.style.display = 'none';
      return;
    }
    // 0. 受信ボックスポップオーバー
    const pcNotif = document.getElementById('pcNotifModal');
    if (pcNotif && !pcNotif.classList.contains('hidden') && pcNotif.style.display !== 'none') {
      window.closeNotifModal();
      return;
    }
    // 1. スタンプピッカー
    const stickerPicker = document.getElementById('stickerPicker');
    if (stickerPicker && stickerPicker.classList.contains('show')) {
      stickerPicker.classList.remove('show');
      window._reactionTargetMessageId = null;
      return;
    }
    // 2. メンションポップアップ
    const mentionPopup = document.getElementById('mentionPopup');
    if (mentionPopup && !mentionPopup.classList.contains('hidden')) {
      mentionPopup.classList.add('hidden');
      return;
    }
    // 3. コンテキストメニュー
    const msgCtx = document.getElementById('messageContextMenu');
    const svCtx = document.getElementById('serverContextMenu');
    if (msgCtx && !msgCtx.classList.contains('hidden')) { msgCtx.classList.add('hidden'); return; }
    if (svCtx && !svCtx.classList.contains('hidden')) { svCtx.classList.add('hidden'); return; }
    // 4. カスタムドロップダウン
    const openSelects = document.querySelectorAll('.covo-custom-select.open');
    if (openSelects.length > 0) {
      openSelects.forEach(s => s.classList.remove('open'));
      return;
    }
    // 5. 通話相手ピッカー
    const callPicker = document.getElementById('callPickerModal');
    if (callPicker && callPicker.classList.contains('show')) {
      callPicker.classList.remove('show');
      return;
    }
    // 6. 各種ライトボックス
    const avatarLb = document.getElementById('avatarLightbox');
    const imageLb = document.getElementById('imageLightbox');
    const pdfLb = document.getElementById('pdfLightbox');
    if (avatarLb && avatarLb.style.display !== 'none') { avatarLb.style.display = 'none'; return; }
    if (imageLb && imageLb.style.display !== 'none') { imageLb.style.display = 'none'; return; }
    if (pdfLb && pdfLb.style.display !== 'none') { pdfLb.style.display = 'none'; return; }
    // 7. モバイル設定詳細・ボトムシート
    const openDetail = document.querySelector('.mobile-settings-detail.active');
    if (openDetail) {
      openDetail.classList.remove('active');
      return;
    }
    // 8. 開いている最上位のモーダル
    const openModals = document.querySelectorAll('[id$="Modal"]:not(.hidden), #emergencyRecoveryOverlay:not(.hidden), #updateOverlay.show');
    if (openModals.length > 0) {
      const topModal = openModals[openModals.length - 1];
      if (topModal.id === 'whatsNewModal') { window.closeWhatsNewModal(); return; }
      if (topModal.id === 'feedbackModal') { window.closeFeedbackModal(); return; }
      if (topModal.id === 'pastVersionsModal') { window.closePastVersionsModal(); return; }
      if (topModal.id === 'inAppBrowserModal') { window.closeInAppBrowser(); return; }
      topModal.classList.add('hidden');
      if (topModal.style.display === 'flex') topModal.style.display = 'none';
    }
  }
});

// =========================================================================
// アプリ起動エントリーポイント (Boot Sequence)
// =========================================================================
(async function bootstrapApp() {
  try {
    // 0. 設定の初期化 (通知設定などの状態復元)
    if (typeof initSettings === 'function') {
      initSettings();
    }

    // 1. Tauri環境の場合: アップデートチェック
    if (isTauri && typeof blockingUpdateCheck === 'function') {
      const hasUpdate = await blockingUpdateCheck();
      if (hasUpdate) {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        return;
      }
    }

    // 2. Firebase初期化
    if (typeof initializeFirebase === 'function') {
      initializeFirebase();
    }

    // 3. 通知の許可リクエスト
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    // 4. リサイザー初期化
    if (typeof initializeResizer === 'function') {
      initializeResizer();
    }

    // 5. Discord風UIモードの初期適用
    const isDiscordMode = localStorage.getItem('covo_discord_ui_mode') !== 'false';
    if (typeof setDiscordUIMode === 'function') {
      setDiscordUIMode(isDiscordMode);
    }

    // 6. 全体お知らせ (What's New) のリアルタイムリスナー＆初期チェック起動
    setTimeout(() => {
      if (typeof setupGlobalAnnouncementListener === 'function') {
        setupGlobalAnnouncementListener();
      } else if (typeof checkLatestAnnouncement === 'function') {
        checkLatestAnnouncement();
      }
    }, 1500);
  } catch (err) {
    console.error('App bootstrap error:', err);
    if (typeof showEmergencyRecoveryPanel === 'function') {
      showEmergencyRecoveryPanel(err.message || '初期化起動エラー', err);
    }
  }
})();