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

    // TuRNV候補（ICE Candidates）を削除
    const subCols = colName === 'calls' ? ['callerCandidates', 'calleeCandidates'] : ['senderCandidates', 'receiverCandidates'];
    for (const sub of subCols) {
      const candsSnap = await getDocs(collection(docRef, sub));
      const deletePromises = [];
      candsSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
      await Promise.all(deletePromises);
    }

    // 親ドキュメント自体を削除
    await deleteDoc(docRef);
  } catch (e) {
    console.warn(`[WebRTC Cleanup] Failed to cleanup ${colName}/${docId}:`, e);
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
      if (typeof scanAllUnreadAndRender === 'function') scanAllUnreadAndRender();
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
    });
  });
}

async function openCallPicker() {
  if (!currentServerData || !userId) return;
  const modal = document.getElementById('callPickerModal');
  const list = document.getElementById('callPickerList');
  const header = modal.querySelector('.call-picker-header span');
  if (header) header.textContent = '通話する相手を選択';
  list.innerHTML = '';

  const memberIds = (currentServerData.joinedUsers || []).filter(uid => uid !== userId);
  if (memberIds.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4);">メンバーがいません</div>';
  } else {
    for (const uid of memberIds) {
      const user = cachedUsers.find(u => u.id === uid) || {};
      const nameRaw = user.nickname || user.displayName || uid.slice(0, 8);
      const name = escapeHtml(nameRaw);
      const div = document.createElement('div');
      div.className = 'call-picker-item';
      div.innerHTML = `<div class="call-picker-avatar"></div><div><div class="call-picker-name">${name}</div></div>`;
      const avatarEl = div.querySelector('.call-picker-avatar');
      __setAvatarImg(avatarEl, user.avatarUrl || '', nameRaw, { style: 'width:100%;height:100%;object-fit:cover;' });
      div.onclick = () => {
        closeCallPicker();
        startCall(uid, nameRaw, user.avatarUrl || '');
      };
      list.appendChild(div);
    }
  }

  modal.classList.add('show');
}

function closeCallPicker() {
  const modal = document.getElementById('callPickerModal');
  if (!modal) return;
  modal.classList.add('closing');
  setTimeout(() => {
    modal.classList.remove('show', 'closing');
  }, 240);
}

/* =====================================================================
   P2P ファイル共有（WebRTC DataChannel）
   - シグナリングだけ Firestore (fileshares/{id}) を経由（データ量ごく僅か）
   - STUN/TURN は接続安定化の補助。ファイル本体は P2P DataChannel で直送
   - 大容量も16KBチャンク分割＋バックプレッシャ制御で送れる
   - 通話用の peerConnection とは完全に別系統（衝突しない）
   ===================================================================== */
const FS_CHUNK = 256 * 1024;          // 256KB チャンク（大きいほど少ない回数で速く送れる）
const FS_BUFFER_HIGH = 16 * 1024 * 1024; // 送信バッファ上限 16MB（多く積めるほど速い）
const FS_BUFFER_LOW = 4 * 1024 * 1024;   // ここまで減ったら再開（bufferedamountlow用）
let _fsPC = null, _fsChannel = null, _fsId = null, _fsRole = null;
let _fsUnsub = null, _fsCandUnsub = null;
let _fsRecv = null; // { name, type, size, received, chunks[] }
let _fsAckResolve = null; // 受信完了ACK待ちのresolver

function _fsCleanup() {
  try { if (_fsUnsub) _fsUnsub(); } catch (e) { }
  try { if (_fsCandUnsub) _fsCandUnsub(); } catch (e) { }
  try { if (_fsChannel) _fsChannel.close(); } catch (e) { }
  try { if (_fsPC) _fsPC.close(); } catch (e) { }
  _fsUnsub = _fsCandUnsub = _fsChannel = _fsPC = _fsId = _fsRole = null;
  _fsRecv = null;
}

// 送信側: 相手選択ピッカーを開く（通話ピッカーと同デザインを流用）
window.openFileSharePicker = function () {
  if (!currentServerData || !userId) return;
  const modal = document.getElementById('callPickerModal');
  const list = document.getElementById('callPickerList');
  const header = modal.querySelector('.call-picker-header span');
  if (header) header.textContent = 'ファイルを送る相手を選択';
  list.innerHTML = '';
  const memberIds = (currentServerData.joinedUsers || []).filter(uid => uid !== userId);
  if (memberIds.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4);">メンバーがいません</div>';
  } else {
    for (const uid of memberIds) {
      const user = cachedUsers.find(u => u.id === uid) || {};
      const nameRaw = user.nickname || user.displayName || uid.slice(0, 8);
      const div = document.createElement('div');
      div.className = 'call-picker-item';
      div.innerHTML = `<div class="call-picker-avatar"></div><div><div class="call-picker-name">${escapeHtml(nameRaw)}</div></div>`;
      __setAvatarImg(div.querySelector('.call-picker-avatar'), user.avatarUrl || '', nameRaw, { style: 'width:100%;height:100%;object-fit:cover;' });
      div.onclick = () => { closeCallPicker(); _fsPickFileAndSend(uid, nameRaw); };
      list.appendChild(div);
    }
  }
  modal.classList.add('show');
};

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

    // answer + 受信側ICEを待つ
    _fsUnsub = onSnapshot(ref, async snap => {
      const d = snap.data();
      if (!d) return;
      if (d.status === 'declined') { _fsShowProgress('error', file.name, '相手が拒否しました'); setTimeout(_fsCloseProgress, 1500); _fsCleanup(); return; }
      if (d.answer && !_fsPC.currentRemoteDescription) {
        await _fsPC.setRemoteDescription(new RTCSessionDescription(d.answer));
      }
    });
    const rcandCol = collection(db, 'artifacts', appId, 'fileshares', _fsId, 'receiverCandidates');
    _fsCandUnsub = onSnapshot(rcandCol, snap => {
      snap.docChanges().forEach(ch => { if (ch.type === 'added') { try { _fsPC.addIceCandidate(new RTCIceCandidate(ch.doc.data())); } catch (e) { } } });
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
    // 送信バッファが減ったら通知してもらう（setTimeoutポーリングより高速・低負荷）
    _fsChannel.bufferedAmountLowThreshold = FS_BUFFER_LOW;
    const waitBufferLow = () => new Promise(resolve => {
      if (_fsChannel.bufferedAmount <= FS_BUFFER_HIGH) return resolve();
      const onLow = () => { _fsChannel.removeEventListener('bufferedamountlow', onLow); resolve(); };
      _fsChannel.addEventListener('bufferedamountlow', onLow);
    });

    _fsChannel.send(JSON.stringify({ __meta: true, name: file.name, type: file.type, size: file.size }));
    let offset = 0;
    if (!file.stream) { await _fsSendFileDataLegacy(file); return; }
    const reader = file.stream().getReader();
    let pending = null; // 前チャンクの端数を保持
    const sendSlice = async (buf) => {
      if (_fsChannel.bufferedAmount > FS_BUFFER_HIGH) await waitBufferLow();
      _fsChannel.send(buf);
      offset += buf.byteLength;
      _fsUpdateProgress(Math.round(offset / file.size * 100));
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // streamのチャンクをそのまま（または256KB単位で）送る
      let chunk = value; // Uint8Array
      for (let i = 0; i < chunk.length; i += FS_CHUNK) {
        // subarrayはコピーを作らない（高速・省メモリ）。境界はsliceでバッファ確定
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

// 受信側: 着信を監視（ログイン時に開始）
async function initFileShareListener() {
  if (!userId) return;
  const { collection, query, where, onSnapshot } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
  const q = query(collection(db, 'artifacts', appId, 'fileshares'), where('receiverUid', '==', userId), where('status', '==', 'offering'));
  onSnapshot(q, snap => {
    snap.docChanges().forEach(ch => {
      if (ch.type === 'added') {
        const d = ch.doc.data();
        if (_fsId) return; // 既に処理中
        _fsShowIncoming(ch.doc.id, d);
      }
    });
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
  document.getElementById('fsProgName').textContent = fileName || '';
  document.getElementById('fsProgStatus').textContent = statusText || '';
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
        });
      }
    }
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
  const desktopEnabled = localStorage.getItem('simplechat_desktop_notif') !== 'false';
  const browserEnabled = localStorage.getItem('simplechat_browser_notif') !== 'false';

  if (!isTauri && !browserEnabled) return;
  if (isTauri && !desktopEnabled) return;

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
        if (roomId) selectRoom(roomId);
        if (window.__TAURI__?.core?.invoke) {
          window.__TAURI__.core.invoke('show_main_window').catch(console.error);
        }
      };
    }
  } else {
    // Web/PWA版: Service Worker (FCM) が動かない環境のフォールバック
    if (!currentFcmToken && "Notification" in window && Notification.permission === "granted") {
      try {
        const n = new Notification(title, { body, icon: '/icon-192x192.png?v=5' });
        n.onclick = () => {
          window.focus();
          n.close();
          if (roomId) {
            if (typeof goToRoom === 'function') goToRoom(roomId);
            else { const roomItem = document.getElementById(`room-item-${roomId}`); if (roomItem) roomItem.click(); }
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

      let isForced = false;
      try {
        const vRes = await fetch('version.json?_t=' + Date.now(), { cache: 'no-store' });
        const vData = await vRes.json();
        if (vData && vData.force === true) {
          isForced = true;
        }
      } catch (e) { console.warn('Failed to fetch version.json:', e); }

      if (localStorage.getItem('covo_ignore_force_update') === '1') {
        console.log('[Update] バージョンロックが有効なため、自動アップデートをスキップします。');
        return false;
      }

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

