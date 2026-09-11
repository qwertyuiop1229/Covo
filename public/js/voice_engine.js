
// ================================================================
// VOICE ENGINE — ハイブリッド通話エンジン (Discord風VC)
// P2P(1〜4人) + OpenRelay TURN <-> Agora SFU(5人以上) 自動切替
// ================================================================

const VC_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:openrelay.metered.ca:80' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

const VC_TURN_INFO = {
  service: 'Open Relay Project (openrelay.metered.ca)',
  freeQuota: '50GB/月',
  audioOnlyMinutes: Math.round((50 * 1024 * 1024 * 1024 * 8) / (64 * 1000) / 60),
  videoMinutes: Math.round((50 * 1024 * 1024 * 1024 * 8) / (500 * 1000) / 60)
};

class VoiceEngine {
  constructor() {
    this.mode = null;
    this.serverId = null;
    this.channelId = null;
    this.channelName = null;
    this.isActive = false;
    this._localStream = null;
    this._p2pPeers = new Map();
    this._isMuted = false;
    this._isVideoOn = false;
    this._isScreenOn = false;
    this._localVideoTrack = null;
    this._localScreenTrack = null;
    this._agoraClient = null;
    this._agoraLocalAudio = null;
    this._agoraLocalVideo = null;
    this._agoraRemoteUsers = new Map();
    this._voiceStatesUnsub = null;
    this._voiceStates = {};
    this._signalingUnsub = null;
    this._myUid = null;
    this._myNickname = null;
    this._myAvatar = null;
  }

  async join(serverId, channelId, channelName) {
    if (this.isActive) { console.warn('[VoiceEngine] 既にVC参加中です。'); return; }
    this.serverId = serverId;
    this.channelId = channelId;
    this.channelName = channelName;
    this.isActive = true;
    this._myUid = userId;
    this._myNickname = currentServerNickname || userNickname || 'ユーザー';
    this._myAvatar = userAvatarUrl || '';

    console.log(`[VoiceEngine] 🔊 VC参加: #${channelName} (serverId: ${serverId})`);
    console.log(`[VoiceEngine] 📡 TURNサーバー: ${VC_TURN_INFO.service}`);
    console.log(`[VoiceEngine] 📦 無料枠: ${VC_TURN_INFO.freeQuota} (~${VC_TURN_INFO.audioOnlyMinutes.toLocaleString()}分/月 音声のみ | ~${VC_TURN_INFO.videoMinutes.toLocaleString()}分/月 ビデオ込み)`);

    try {
      this._localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      console.log('[VoiceEngine] ✅ マイクアクセス許可済み');
    } catch (e) {
      console.error('[VoiceEngine] マイクアクセス拒否:', e.message);
      this.isActive = false;
      alertMessage('マイクへのアクセスが許可されていません', 'error');
      return;
    }

    await this._setMyVoiceState({ isMuted: false, hasVideo: false, hasScreen: false });
    this._subscribeVoiceStates();
    showVcBar(channelName);
    this._updateVcChannelHighlight(channelId, true);
    window.addEventListener('beforeunload', () => this._clearMyVoiceState());
  }

  async leave() {
    if (!this.isActive) return;
    console.log(`[VoiceEngine] 📴 VC退出: #${this.channelName}`);
    this.isActive = false;
    this._cleanupP2P();
    await this._cleanupAgora();
    this._stopLocalStream();
    await this._clearMyVoiceState();
    if (this._voiceStatesUnsub) { this._voiceStatesUnsub(); this._voiceStatesUnsub = null; }
    if (this._signalingUnsub) { this._signalingUnsub(); this._signalingUnsub = null; }
    const channelId = this.channelId;
    this.mode = null; this._voiceStates = {};
    this.serverId = this.channelId = this.channelName = null;
    hideVcBar();
    this._updateVcChannelHighlight(channelId, false);
    this._renderVcMemberTree(null, []);
    console.log('[VoiceEngine] 👋 VC退出完了');
  }

  _subscribeVoiceStates() {
    const mods = window._rtdbModules;
    if (!mods) { setTimeout(() => { if (this.isActive) this._subscribeVoiceStates(); }, 600); return; }
    const { getDatabase, ref: rtdbRef, onValue, off } = mods;
    const dbInst = getDatabase();
    const stateRef = rtdbRef(dbInst, `voiceStates/${this.serverId}/${this.channelId}`);
    const handler = (snapshot) => {
      const data = snapshot.val() || {};
      this._voiceStates = data;
      const uids = Object.keys(data);
      const count = uids.length;
      console.log(`[VoiceEngine] 👥 現在の参加者: ${count}人`);
      this._renderVcMemberTree(this.channelId, Object.values(data));
      this._renderVcGrid();
      const countEl = document.getElementById('vcGridParticipantCount');
      if (countEl) countEl.textContent = `${count}人`;
      if (count <= 4) {
        if (this.mode !== 'p2p') {
          console.log('[VoiceEngine] 🔵 接続方式: P2P + OpenRelay TURN（1〜4人・完全無料）');
          this._switchToP2P(data);
        }
      } else {
        if (this.mode !== 'agora') {
          console.log(`[VoiceEngine] ⚠️ 参加者が${count}人 → Agora SFUへ自動切替`);
          this._switchToAgora();
        }
      }
    };
    onValue(stateRef, handler);
    this._voiceStatesUnsub = () => off(stateRef, 'value', handler);
  }

  async _switchToP2P(currentStates) {
    if (this.mode === 'agora') { console.log('[VoiceEngine] 🔵 Agora → P2P 切替'); await this._cleanupAgora(); }
    this.mode = 'p2p';
    console.log('[VoiceEngine] 🔵 P2P + OpenRelay TURNモード開始');
    this._cleanupP2P();
    const others = Object.keys(currentStates).filter(uid => uid !== this._myUid);
    for (const peerUid of others) { await this._createP2POffer(peerUid); }
    this._setupSignalingListener();
  }

  async _createP2POffer(peerUid) {
    const pc = new RTCPeerConnection({ iceServers: VC_ICE_SERVERS });
    this._p2pPeers.set(peerUid, pc);
    if (this._localStream) this._localStream.getTracks().forEach(t => pc.addTrack(t, this._localStream));
    pc.ontrack = (e) => {
      const audio = new Audio(); audio.srcObject = e.streams[0]; audio.autoplay = true;
      audio.play().catch(() => {});
      console.log(`[VoiceEngine] 🔈 P2P音声受信: ${peerUid.slice(0,8)}`);
    };
    pc.onicecandidate = async (e) => { if (e.candidate) await this._sendSignaling(peerUid, { type: 'candidate', candidate: e.candidate.toJSON() }); };
    pc.oniceconnectionstatechange = () => {
      console.log(`[VoiceEngine] ICE(${peerUid.slice(0,8)}): ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') { console.warn('[VoiceEngine] ICE失敗→ICE Restart'); pc.restartIce(); }
      if (['connected','completed'].includes(pc.iceConnectionState)) {
        pc.getStats().then(stats => {
          stats.forEach(r => {
            if (r.type === 'candidate-pair' && r.state === 'succeeded') {
              const localId = r.localCandidateId;
              stats.forEach(lr => { if (lr.id === localId && lr.candidateType === 'relay') console.log(`[VoiceEngine] ✅ ICE完了 relay経由: ${lr.ip || 'openrelay.metered.ca'}`); });
            }
          });
        }).catch(() => {});
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this._sendSignaling(peerUid, { type: 'offer', sdp: offer.sdp });
    console.log(`[VoiceEngine] 📤 P2P Offer → ${peerUid.slice(0,8)}`);
  }

  _cleanupP2P() { this._p2pPeers.forEach(pc => { try { pc.close(); } catch(_){} }); this._p2pPeers.clear(); }

  async _sendSignaling(targetUid, payload) {
    try {
      const sigRef = doc(db, `artifacts/${appId}/vc_signaling/${this.channelId}_${this._myUid}_${targetUid}`);
      await setDoc(sigRef, { ...payload, fromUid: this._myUid, toUid: targetUid, at: Date.now() });
    } catch (e) { console.warn('[VoiceEngine] Signaling送信エラー:', e.message); }
  }

  _setupSignalingListener() {
    if (this._signalingUnsub) { this._signalingUnsub(); }
    const sigQuery = query(collection(db, `artifacts/${appId}/vc_signaling`), where('toUid', '==', this._myUid));
    this._signalingUnsub = onSnapshot(sigQuery, async (snap) => {
      for (const change of snap.docChanges()) {
        if (!['added','modified'].includes(change.type)) continue;
        const data = change.doc.data();
        if (!data || data.toUid !== this._myUid) continue;
        const fromUid = data.fromUid;
        if (!fromUid || fromUid === this._myUid) continue;
        if (data.type === 'offer') { await this._handleP2PAnswer(fromUid, data); }
        else if (data.type === 'answer') {
          const pc = this._p2pPeers.get(fromUid);
          if (pc && pc.signalingState !== 'stable') await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
        } else if (data.type === 'candidate') {
          const pc = this._p2pPeers.get(fromUid);
          if (pc && data.candidate) try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch(_){}
        }
        try { await deleteDoc(change.doc.ref); } catch(_){}
      }
    });
  }

  async _handleP2PAnswer(fromUid, data) {
    let pc = this._p2pPeers.get(fromUid);
    if (!pc) {
      pc = new RTCPeerConnection({ iceServers: VC_ICE_SERVERS });
      this._p2pPeers.set(fromUid, pc);
      if (this._localStream) this._localStream.getTracks().forEach(t => pc.addTrack(t, this._localStream));
      pc.ontrack = (e) => { const a = new Audio(); a.srcObject = e.streams[0]; a.autoplay = true; a.play().catch(()=>{}); };
      pc.onicecandidate = async (e) => { if (e.candidate) await this._sendSignaling(fromUid, { type: 'candidate', candidate: e.candidate.toJSON() }); };
    }
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this._sendSignaling(fromUid, { type: 'answer', sdp: answer.sdp });
    console.log(`[VoiceEngine] 📥 P2P Offer受信&Answer送信 from ${fromUid.slice(0,8)}`);
  }

  async _switchToAgora() {
    if (this.mode === 'p2p') { this._cleanupP2P(); if (this._signalingUnsub) { this._signalingUnsub(); this._signalingUnsub = null; } }
    this.mode = 'agora';
    if (typeof AgoraRTC === 'undefined') { console.error('[VoiceEngine] Agora SDK未ロード'); this.mode = 'p2p'; return; }
    console.log('[VoiceEngine] 🟣 Agora SFU接続中...');
    try {
      const chName = `vc_${this.serverId}_${this.channelId}`.slice(0, 64);
      const tokenData = await fetchAgoraToken(chName, this._myUid);
      this._agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      this._agoraClient.on('user-published', async (user, mediaType) => {
        await this._agoraClient.subscribe(user, mediaType);
        if (mediaType === 'audio') user.audioTrack?.play();
        this._agoraRemoteUsers.set(user.uid, user); this._renderVcGrid();
      });
      this._agoraClient.on('user-unpublished', () => this._renderVcGrid());
      this._agoraClient.on('user-left', (user) => { this._agoraRemoteUsers.delete(user.uid); this._renderVcGrid(); });
      this._agoraClient.on('volume-indicator', (vols) => {
        vols.forEach(vol => {
          const isSpeaking = vol.level > 5; const uid = String(vol.uid);
          document.getElementById(`vc-tile-${uid}`)?.classList.toggle('speaking', isSpeaking);
          document.querySelector(`.vc-member-item[data-uid="${uid}"]`)?.classList.toggle('speaking', isSpeaking);
        });
      });
      this._agoraClient.enableAudioVolumeIndicator();
      await this._agoraClient.join(tokenData.appId, chName, tokenData.token, this._myUid);
      this._agoraLocalAudio = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
      if (this._isMuted) await this._agoraLocalAudio.setEnabled(false);
      await this._agoraClient.publish([this._agoraLocalAudio]);
      console.log('[VoiceEngine] ✅ Agora SFU接続完了');
    } catch (e) {
      console.error('[VoiceEngine] Agora接続エラー:', e.message);
      alertMessage('Agora接続に失敗しました。P2Pモードを維持します。', 'warning');
      this.mode = 'p2p'; this._switchToP2P(this._voiceStates);
    }
  }

  async _cleanupAgora() {
    if (this._agoraLocalAudio) { try { this._agoraLocalAudio.stop(); this._agoraLocalAudio.close(); } catch(_){} this._agoraLocalAudio = null; }
    if (this._agoraLocalVideo) { try { this._agoraLocalVideo.stop(); this._agoraLocalVideo.close(); } catch(_){} this._agoraLocalVideo = null; }
    if (this._agoraClient) { try { await this._agoraClient.leave(); } catch(_){} this._agoraClient = null; }
    this._agoraRemoteUsers.clear();
  }

  _stopLocalStream() {
    if (this._localStream) { this._localStream.getTracks().forEach(t => t.stop()); this._localStream = null; }
    if (this._localVideoTrack) { try { this._localVideoTrack.stop(); } catch(_){} this._localVideoTrack = null; }
    if (this._localScreenTrack) { try { this._localScreenTrack.stop(); } catch(_){} this._localScreenTrack = null; }
  }

  async toggleMute() {
    this._isMuted = !this._isMuted;
    if (this._localStream) this._localStream.getAudioTracks().forEach(t => { t.enabled = !this._isMuted; });
    if (this.mode === 'agora' && this._agoraLocalAudio) await this._agoraLocalAudio.setEnabled(!this._isMuted);
    await this._setMyVoiceState({ isMuted: this._isMuted });
    this._updateMuteUI();
    console.log(`[VoiceEngine] 🎤 ミュート: ${this._isMuted ? 'ON' : 'OFF'}`);
  }

  async toggleCamera() {
    if (this.mode !== 'agora' || !this._agoraClient) { alertMessage('カメラはAgoraモード（5人以上）でご利用ください', 'info'); return; }
    if (this._isVideoOn) {
      if (this._agoraLocalVideo) { await this._agoraClient.unpublish([this._agoraLocalVideo]); this._agoraLocalVideo.stop(); this._agoraLocalVideo.close(); this._agoraLocalVideo = null; }
      this._isVideoOn = false;
    } else {
      this._agoraLocalVideo = await AgoraRTC.createCameraVideoTrack({ encoderConfig: '720p_1' });
      await this._agoraClient.publish([this._agoraLocalVideo]); this._isVideoOn = true;
    }
    await this._setMyVoiceState({ hasVideo: this._isVideoOn });
    this._updateCamUI(); this._renderVcGrid();
    console.log(`[VoiceEngine] 📷 カメラ: ${this._isVideoOn ? 'ON' : 'OFF'}`);
  }

  async toggleScreen() {
    if (this.mode !== 'agora' || !this._agoraClient) { alertMessage('画面共有はAgoraモード（5人以上）でご利用ください', 'info'); return; }
    if (this._isScreenOn) {
      if (this._localScreenTrack) { await this._agoraClient.unpublish([this._localScreenTrack]); this._localScreenTrack.stop(); this._localScreenTrack.close(); this._localScreenTrack = null; }
      this._isScreenOn = false;
    } else {
      const tr = await AgoraRTC.createScreenVideoTrack({ encoderConfig: '1080p_1' }, 'auto');
      this._localScreenTrack = Array.isArray(tr) ? tr[0] : tr;
      this._localScreenTrack.on('track-ended', () => { if (this._isScreenOn) this.toggleScreen(); });
      await this._agoraClient.publish([this._localScreenTrack]); this._isScreenOn = true;
    }
    await this._setMyVoiceState({ hasScreen: this._isScreenOn });
    this._updateScreenUI();
    console.log(`[VoiceEngine] 🖥️ 画面共有: ${this._isScreenOn ? 'ON' : 'OFF'}`);
  }

  _updateMuteUI() {
    ['vcBarMuteIcon','vcGridMuteIcon'].forEach(id => { const el = document.getElementById(id); if (el) el.className = this._isMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone'; });
    ['vcBarMuteBtn','vcGridMuteBtn'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.toggle('muted', this._isMuted); });
  }
  _updateCamUI() {
    ['vcBarCamIcon','vcGridCamIcon'].forEach(id => { const el = document.getElementById(id); if (el) el.className = this._isVideoOn ? 'fas fa-video-slash' : 'fas fa-video'; });
    ['vcBarCamBtn','vcGridCamBtn'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.toggle('active', this._isVideoOn); });
  }
  _updateScreenUI() {
    ['vcBarScreenIcon','vcGridScreenIcon'].forEach(id => { const el = document.getElementById(id); if (el) el.className = this._isScreenOn ? 'fas fa-stop-circle' : 'fas fa-desktop'; });
    ['vcBarScreenBtn','vcGridScreenBtn'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.toggle('active', this._isScreenOn); });
  }

  _updateVcChannelHighlight(channelId, active) {
    if (!channelId) return;
    document.querySelector(`.vc-channel-row[data-vc-id="${channelId}"]`)?.classList.toggle('active-vc', active);
  }

  _renderVcMemberTree(channelId, members) {
    const treeEl = channelId ? document.getElementById(`vc-tree-${channelId}`) : null;
    if (!treeEl) return;
    if (!members || members.length === 0) { treeEl.innerHTML = ''; return; }
    treeEl.innerHTML = members.map(m => {
      const safeName = escapeHtml(m.nickname || 'ユーザー');
      const avatarHtml = (m.avatarUrl && m.avatarUrl.startsWith('http')) ? `<img src="${escapeHtml(m.avatarUrl)}" alt="${safeName}" />` : `<span>${safeName.charAt(0).toUpperCase()}</span>`;
      const muteIcon = m.isMuted ? '<i class="fas fa-microphone-slash vc-member-mute-icon"></i>' : '';
      return `<div class="vc-member-item" data-uid="${escapeHtml(m.uid||'')}" title="${safeName}"><div class="vc-member-avatar">${avatarHtml}</div><span class="vc-member-name">${safeName}</span>${muteIcon}</div>`;
    }).join('');
  }

  _renderVcGrid() {
    const gridBody = document.getElementById('vcGridBody');
    if (!gridBody) return;
    const states = this._voiceStates;
    const uids = Object.keys(states);
    if (uids.length === 0) { gridBody.innerHTML = '<div style="color:#6b7280;font-size:0.875rem;text-align:center;padding:2rem;">誰も参加していません</div>'; return; }
    const sz = uids.length <= 2 ? 'width:min(280px,40vw);height:min(280px,40vw)' : uids.length <= 4 ? 'width:min(220px,30vw);height:min(220px,30vw)' : 'width:min(160px,22vw);height:min(160px,22vw)';
    gridBody.innerHTML = uids.map(uid => {
      const m = states[uid]; const isMe = uid === this._myUid;
      const safeName = escapeHtml(m.nickname || 'ユーザー');
      const avatarHtml = (m.avatarUrl && m.avatarUrl.startsWith('http')) ? `<img src="${escapeHtml(m.avatarUrl)}" alt="${safeName}" />` : `<span>${safeName.charAt(0).toUpperCase()}</span>`;
      const muteIcon = m.isMuted ? '<i class="fas fa-microphone-slash" style="color:#f87171;font-size:0.6rem"></i>' : '';
      return `<div class="vc-grid-tile" id="vc-tile-${escapeHtml(uid)}" style="${sz}"><div class="vc-grid-avatar">${avatarHtml}</div><div class="vc-grid-tile-name"><span class="vc-grid-tile-name-text">${safeName}${isMe?' (あなた)':''}</span>${muteIcon}</div></div>`;
    }).join('');
    if (this.mode === 'agora') {
      this._agoraRemoteUsers.forEach((user, uid) => {
        if (user.videoTrack) setTimeout(() => { const el = document.getElementById(`vc-tile-${uid}`); if (el) try { user.videoTrack.play(`vc-tile-${uid}`); } catch(_){} }, 50);
      });
    }
  }

  async _setMyVoiceState(extra = {}) {
    if (!this._myUid || !this.serverId || !this.channelId) return;
    try {
      const mods = window._rtdbModules;
      if (!mods) return;
      const { getDatabase, ref: rtdbRef, set } = mods;
      await set(rtdbRef(getDatabase(), `voiceStates/${this.serverId}/${this.channelId}/${this._myUid}`), { uid: this._myUid, nickname: this._myNickname, avatarUrl: this._myAvatar, joinedAt: Date.now(), isMuted: this._isMuted, hasVideo: this._isVideoOn, hasScreen: this._isScreenOn, ...extra });
    } catch(e) { console.warn('[VoiceEngine] voiceState書き込みエラー:', e.message); }
  }

  async _clearMyVoiceState() {
    if (!this._myUid || !this.serverId || !this.channelId) return;
    try {
      const mods = window._rtdbModules;
      if (!mods) return;
      const { getDatabase, ref: rtdbRef, remove } = mods;
      await remove(rtdbRef(getDatabase(), `voiceStates/${this.serverId}/${this.channelId}/${this._myUid}`));
    } catch(e) { console.warn('[VoiceEngine] voiceState削除エラー:', e.message); }
  }
}

// ===== グローバルVoiceEngineインスタンス =====
window._voiceEngine = new VoiceEngine();

// ===== RTDB モジュール登録 =====
(function _registerRtdbModules() {
  import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js').then(m => {
    window._rtdbModules = m;
    console.log('[VoiceEngine] RTDB モジュール登録完了');
  }).catch(e => console.warn('[VoiceEngine] RTDB モジュール登録失敗:', e.message));
})();

// ===== グローバルVC操作関数 =====
window.joinVoiceChannel = async function(channelId, channelName) {
  if (!currentServerId) { alertMessage('サーバーに参加していません', 'error'); return; }
  if (window._voiceEngine.isActive) {
    if (window._voiceEngine.channelId === channelId) return;
    await window._voiceEngine.leave();
  }
  await window._voiceEngine.join(currentServerId, channelId, channelName);
};
window.leaveVoiceChannel = async function() { await window._voiceEngine.leave(); };
window.vcToggleMute = async function() { await window._voiceEngine.toggleMute(); };
window.vcToggleCamera = async function() { await window._voiceEngine.toggleCamera(); };
window.vcToggleScreen = async function() { await window._voiceEngine.toggleScreen(); };

window.vcOpenGrid = function() {
  const overlay = document.getElementById('vcGridOverlay');
  if (!overlay) return;
  if (overlay.classList.contains('hidden')) {
    overlay.classList.remove('hidden');
    const nameEl = document.getElementById('vcGridChannelName');
    if (nameEl && window._voiceEngine.channelName) nameEl.textContent = window._voiceEngine.channelName;
    window._voiceEngine._renderVcGrid();
  } else {
    overlay.classList.add('hidden');
  }
};

window.selectChannelType = function(type) {
  const input = document.getElementById('newRoomTypeInput');
  if (input) input.value = type;
  document.querySelectorAll('.channel-type-option').forEach(opt => opt.classList.toggle('active', opt.dataset.type === type));
};

// ===== VCバー表示/非表示 =====
function showVcBar(channelName) {
  const bar = document.getElementById('vcConnectionBar');
  const nameEl = document.getElementById('vcBarChannelName');
  if (bar) bar.classList.remove('hidden');
  if (nameEl) nameEl.textContent = channelName || 'ボイスチャンネル';
}
function hideVcBar() {
  document.getElementById('vcConnectionBar')?.classList.add('hidden');
  document.getElementById('vcGridOverlay')?.classList.add('hidden');
}

// ===== サイドバーVCステート購読（サーバー入室時） =====
window._subscribeVcSidebarStates = function(serverId) {
  if (window._vcSidebarUnsub) { window._vcSidebarUnsub(); window._vcSidebarUnsub = null; }
  const mods = window._rtdbModules;
  if (!serverId || !mods) {
    setTimeout(() => window._subscribeVcSidebarStates(serverId), 800);
    return;
  }
  const { getDatabase, ref: rtdbRef, onValue, off } = mods;
  const dbInst = getDatabase();
  const serverStateRef = rtdbRef(dbInst, `voiceStates/${serverId}`);
  const handler = (snapshot) => {
    const allStates = snapshot.val() || {};
    Object.entries(allStates).forEach(([channelId, members]) => {
      const treeEl = document.getElementById(`vc-tree-${channelId}`);
      if (treeEl) {
        const memberList = Object.values(members || {});
        window._voiceEngine._renderVcMemberTree(channelId, memberList);
        const row = document.querySelector(`.vc-channel-row[data-vc-id="${channelId}"]`);
        if (row) {
          let badge = row.querySelector('.vc-member-count-badge');
          if (memberList.length > 0) {
            if (!badge) { badge = document.createElement('span'); badge.className = 'vc-member-count-badge'; row.appendChild(badge); }
            badge.textContent = memberList.length;
          } else if (badge) { badge.remove(); }
        }
      }
    });
  };
  onValue(serverStateRef, handler);
  window._vcSidebarUnsub = () => off(serverStateRef, 'value', handler);
};

// ===== ルームリストのVC表示パッチ（MutationObserver） =====
(function() {
  function patchVcRooms() {
    const roomList = document.getElementById('roomList');
    if (!roomList) return;
    const observer = new MutationObserver(() => {
      roomList.querySelectorAll('.room-item-animate').forEach(el => {
        const roomId = el.id?.replace('room-item-', '');
        if (!roomId || el.classList.contains('vc-channel-item')) return;
        if (el.dataset.channelType === 'voice') {
          const name = el.querySelector('.truncate')?.textContent || roomId;
          const safeName = escapeHtml(name);
          const isActive = window._voiceEngine.isActive && window._voiceEngine.channelId === roomId;
          const vcEl = document.createElement('div');
          vcEl.className = 'vc-channel-item';
          vcEl.id = `room-item-${roomId}`;
          vcEl.innerHTML = `<div class="vc-channel-row${isActive?' active-vc':''}" data-vc-id="${roomId}" onclick="joinVoiceChannel('${roomId}','${safeName}')"><i class="fas fa-volume-up vc-channel-icon"></i><span class="vc-channel-name">${safeName}</span><button class="vc-join-btn" onclick="event.stopPropagation();joinVoiceChannel('${roomId}','${safeName}')" title="参加"><i class="fas fa-sign-in-alt"></i></button></div><div class="vc-member-tree" id="vc-tree-${roomId}"></div>`;
          el.replaceWith(vcEl);
        }
      });
    });
    observer.observe(roomList, { childList: true, subtree: true });
    window._vcRoomListObserver = observer;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', patchVcRooms);
  else patchVcRooms();
})();
