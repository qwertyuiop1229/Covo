// Optional feature: dependencies are live getters, never a snapshot of the selected account/channel.
export function createVoiceEngine(context) {
class VoiceEngine {
  constructor() {
    this.mode = null; // 'p2p' | 'agora' | null
    this.serverId = null;
    this.channelId = null;
    this.channelName = null;
    this.isActive = false;
    this._modeSwitching = false; // 切替競合防止

    // --- 排他制御・リカバリ用フラグ ---
    this._isJoining = false;
    this._isLeaving = false;
    this._boundDeviceChange = null;
    this._boundVisibilityChange = null;
    this._wakeLock = null; // 通話中の画面スリープ防止用 (Screen Wake Lock API)

    // --- Local Media ---
    this._localStream = null; // マイク専用 MediaStream
    this._localScreenStream = null; // 画面共有専用 MediaStream
    this._localVideoStream = null; // カメラ専用 MediaStream (P2P)
    // --- P2P ---
    this._peers = new Map(); // uid -> { pc, audioEl, iceRestarts, iceTimer }
    this._audioElements = new Map(); // uid -> HTMLAudioElement (GC防止)

    // --- 状態フラグ ---
    this._isMuted = false;
    this._isVideoOn = false;
    this._isScreenOn = false;

    // --- Agora ---
    this._agoraClient = null;
    this._agoraAudio = null;
    this._agoraVideo = null;
    this._agoraScreen = null;
    this._agoraRemote = new Map(); // uid -> AgoraUser
    this._agoraVolumeDebounceTimer = null;

    // --- RTDB / Firestore listeners ---
    this._voiceStatesUnsub = null;
    this._signalingUnsub = null;
    this._onDisconnectRef = null;

    // --- 参加者データキャッシュ ---
    this._voiceStates = {};

    // --- 自分の情報 ---
    this._myUid = null;
    this._myNickname = null;
    this._myAvatar = null;

    // --- P2P 音量検知 (Web Audio API) ---
    this._p2pAudioContext = null;
    this._p2pAnalysers = new Map(); // uid -> { analyser, isLocal }
    this._p2pVolumeInterval = null;

    // --- 通話モード強制切替 (管理者用) ---
    this._forceTurnOnly = false;
    this._modeOverride = 'auto'; // 'auto' | 'p2p' | 'turn' | 'agora'
    this._channelConfigUnsub = null;
  }
  // ================================================================
  // マイク健全性確保（P2P ⇔ Agora 切替時の無音化を完全防止）
  // ================================================================
  async _ensureLocalStream() {
    if (this._localStream) {
      const tracks = this._localStream.getAudioTracks();
      if (tracks.length > 0 && tracks[0].readyState === 'live') {
        tracks[0].enabled = !this._isMuted;
        return this._localStream;
      }
    }
    try {
      this._localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      const track = this._localStream.getAudioTracks()[0];
      if (track) {
        track.enabled = !this._isMuted;
        track.onended = () => {
          if (this.isActive) {
            console.warn('[VoiceEngine] 🎤 マイクデバイス切断');
            this._isMuted = true;
            this._updateMuteUI();
            this._setVoiceState({
              isMuted: true
            });
          }
        };
      }
      console.log('[VoiceEngine] ✅ マイクストリーム再初期化完了');
    } catch (e) {
      console.error('[VoiceEngine] _ensureLocalStream failed:', e);
    }
    return this._localStream;
  }
  // ================================================================
  // ビデオ・画面共有マウント & 静止画残留完全防止
  // ================================================================
  _mountVideoTrack(uid, trackOrStream, isLocal = false) {
    // 1. ボイスチャンネル (vcGridOverlay) タイルへのマウント
    const vcTile = document.getElementById(`vc-tile-${uid}`);
    if (vcTile) {
      let videoContainer = vcTile.querySelector('.vc-grid-video-container');
      if (!videoContainer) {
        videoContainer = document.createElement('div');
        videoContainer.className = 'vc-grid-video-container';
        vcTile.insertBefore(videoContainer, vcTile.firstChild);
      }
      videoContainer.classList.remove('hidden');
      videoContainer.style.display = 'block';
      const avatarEl = vcTile.querySelector('.vc-grid-avatar');
      if (avatarEl) avatarEl.style.display = 'none';
      if (trackOrStream && typeof trackOrStream.play === 'function') {
        try {
          trackOrStream.play(videoContainer);
        } catch (_) {}
      } else {
        let vid = videoContainer.querySelector('video');
        if (!vid) {
          vid = document.createElement('video');
          vid.autoplay = true;
          vid.playsInline = true;
          vid.muted = isLocal;
          vid.className = 'w-full h-full object-contain bg-black';
          videoContainer.appendChild(vid);
        }
        if (trackOrStream instanceof MediaStream) {
          vid.srcObject = trackOrStream;
        } else if (trackOrStream instanceof MediaStreamTrack) {
          vid.srcObject = new MediaStream([trackOrStream]);
        }
        vid.play().catch(() => {});
      }
    }

    // 2. 1対1通話 (callOverlay) タイルへのマウント
    const callContainerId = isLocal ? 'local-video-container' : `remote-video-${uid}`;
    let callCont = document.getElementById(callContainerId);
    if (!callCont && !isLocal) callCont = document.getElementById('remote-video-container');
    if (callCont) {
      callCont.classList.remove('hidden');
      callCont.style.display = 'block';
      const tile = callCont.closest('.discord-participant-tile');
      if (tile) {
        const tileAv = tile.querySelector('.discord-tile-avatar');
        if (tileAv) tileAv.classList.add('hidden');
      }
      if (trackOrStream && typeof trackOrStream.play === 'function') {
        try {
          trackOrStream.play(callCont);
        } catch (_) {}
      } else {
        let vid = callCont.querySelector('video');
        if (!vid) {
          vid = document.createElement('video');
          vid.autoplay = true;
          vid.playsInline = true;
          vid.muted = isLocal;
          vid.className = 'w-full h-full object-cover bg-black';
          callCont.appendChild(vid);
        }
        if (trackOrStream instanceof MediaStream) {
          vid.srcObject = trackOrStream;
        } else if (trackOrStream instanceof MediaStreamTrack) {
          vid.srcObject = new MediaStream([trackOrStream]);
        }
        vid.play().catch(() => {});
      }
    }
  }
  _unmountVideoTrack(uid, isLocal = false) {
    // 1. ボイスチャンネル (vcGridOverlay) タイルからの破棄
    const vcTile = document.getElementById(`vc-tile-${uid}`);
    if (vcTile) {
      const videoContainer = vcTile.querySelector('.vc-grid-video-container');
      if (videoContainer) {
        const vid = videoContainer.querySelector('video');
        if (vid) {
          try {
            vid.pause();
            vid.srcObject = null;
          } catch (_) {}
          vid.remove();
        }
        videoContainer.innerHTML = '';
        videoContainer.classList.add('hidden');
        videoContainer.style.display = 'none';
      }
      const avatarEl = vcTile.querySelector('.vc-grid-avatar');
      if (avatarEl) avatarEl.style.display = '';
    }

    // 2. 1対1通話 (callOverlay) タイルからの破棄
    const callContainerId = isLocal ? 'local-video-container' : `remote-video-${uid}`;
    let callCont = document.getElementById(callContainerId);
    if (!callCont && !isLocal) callCont = document.getElementById('remote-video-container');
    if (callCont) {
      const vid = callCont.querySelector('video');
      if (vid) {
        try {
          vid.pause();
          vid.srcObject = null;
        } catch (_) {}
        vid.remove();
      }
      callCont.innerHTML = '';
      callCont.classList.add('hidden');
      callCont.style.display = 'none';
      const tile = callCont.closest('.discord-participant-tile');
      if (tile) {
        const tileAv = tile.querySelector('.discord-tile-avatar');
        if (tileAv) tileAv.classList.remove('hidden');
      }
    }
  }
  // ================================================================
  // JOIN
  // ================================================================
  async join(serverId, channelId, channelName) {
    if (this._isJoining) {
      console.warn('[VoiceEngine] 既にVC参加処理を実行中です。重複参加を抑止しました。');
      return;
    }
    this._isJoining = true;
    try {
      if (this.isActive) {
        console.warn('[VoiceEngine] 既にVC参加中。退出してから再参加します。');
        await this.leave();
      }
      this.serverId = serverId;
      this.channelId = channelId;
      this.channelName = channelName;
      this.isActive = true;
      this._directCallConnected = false;
      if (!context.userId) {
        console.warn('[VoiceEngine] ログインセッションが確立されていないため参加できません');
        this.isActive = false;
        this._isJoining = false;
        return;
      }
      this._myUid = context.userId;
      this._myNickname = context.currentServerNickname || context.userNickname || 'ユーザー';
      this._myAvatar = context.userAvatarUrl || '';
      console.log(`[VoiceEngine] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`[VoiceEngine] 🔊 VC参加: #${channelName}`);
      console.log(`[VoiceEngine] 📡 TURN: ${context.VC_TURN_INFO.service}`);
      console.log(`[VoiceEngine] 📦 無料枠: ${context.VC_TURN_INFO.freeQuota} | 音声: ~${context.VC_TURN_INFO.audioOnlyMinutes.toLocaleString()}分/月`);
      console.log(`[VoiceEngine] ⚡ 遅延: ${context.VC_TURN_INFO.latencyNote}`);
      console.log(`[VoiceEngine] 🔒 セキュリティ: ${context.VC_TURN_INFO.securityNote}`);
      console.log(`[VoiceEngine] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // --- マイク取得 (共通ヘルパーで確実に初期化) ---
      await this._ensureLocalStream();
      if (!this._localStream || this._localStream.getAudioTracks().length === 0) {
        this.isActive = false;
        if (typeof context.alertMessage === 'function') context.alertMessage('マイクへのアクセスが拒否されたか、デバイスが見つかりません。', 'error');
        return;
      }

      // デバイス変更リスナー (イヤホン抜き差し・Bluetooth再接続)
      if (navigator.mediaDevices && !this._boundDeviceChange) {
        this._boundDeviceChange = () => {
          if (!this.isActive) return;
          console.log('[VoiceEngine] 🎧 オーディオデバイス変更を検知しました');
        };
        try {
          navigator.mediaDevices.addEventListener('devicechange', this._boundDeviceChange);
        } catch (_) {}
      }

      // スリープ・バックグラウンド復帰時の AudioContext 再開リスナー (iOS Safari/Android PWA)
      if (!this._boundVisibilityChange) {
        this._boundVisibilityChange = () => {
          if (document.visibilityState === 'visible' && this._p2pAudioContext && this._p2pAudioContext.state === 'suspended') {
            this._p2pAudioContext.resume().catch(e => console.warn('[VoiceEngine] AudioContext resume failed:', e));
          }
          if (document.visibilityState === 'visible' && this.isActive && !this._wakeLock) {
            this._acquireWakeLock();
          }
        };
        try {
          document.addEventListener('visibilitychange', this._boundVisibilityChange);
        } catch (_) {}
      }
      // 通話中の画面ロックによる強制切断を防ぐ (特にiOSはバックグラウンド/ロック時にWebRTCが切れやすい)
      this._acquireWakeLock();
      // --- TURN 疎通チェック（非同期・バックグラウンド） ---
      this._checkTurnConnectivity();
      // --- シグナリングリスナーを最速先行起動（相手からのOffer取りこぼしを完全防止） ---
      this._setupSignalingListener();
      // --- RTDB に voiceState を書き込み + onDisconnect 設定 ---
      await this._setVoiceState({
        isMuted: false,
        hasVideo: false,
        hasScreen: false
      });
      // --- voiceStates を購読 ---
      this._subscribeVoiceStates();
      // --- 古いシグナリングドキュメントを安全に掃除（直近60秒以内のドキュメントは保持） ---
      this._cleanupStaleSignaling();
      // --- UI 更新 ---
      const isDirectCall = Boolean(channelId && channelId.startsWith('call_'));
      if (!isDirectCall) {
        context._vcShowBar(channelName);
        this._setChannelActive(channelId, true);
      }
      // --- beforeunload でも確実にクリーンアップ ---
      window.addEventListener('beforeunload', this._boundBeforeUnload = () => {
        this._clearVoiceStateSync();
      });
    } finally {
      this._isJoining = false;
    }
  }
  // ================================================================
  // WAKE LOCK (通話中の画面スリープ防止。iOSはバックグラウンド/画面ロックでWebRTCが
  // 切れやすいため、通話中は画面が自動ロックされないようにする)
  // ================================================================
  async _acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      this._wakeLock = await navigator.wakeLock.request('screen');
      this._wakeLock.addEventListener('release', () => {
        this._wakeLock = null;
      });
    } catch (e) {
      // iOS Safari 等でユーザー操作直後以外の WakeLock 要求が NotAllowedError となるため静かに無視
      if (e.name !== 'NotAllowedError' && !String(e.message || '').includes('Permission was denied')) {
        console.warn('[VoiceEngine] WakeLock取得失敗:', e);
      }
    }
  }
  async _releaseWakeLock() {
    if (this._wakeLock) {
      try {
        await this._wakeLock.release();
      } catch (_) {}
      this._wakeLock = null;
    }
  }
  // ================================================================
  // LEAVE
  // ================================================================
  async leave() {
    if (this._isLeaving) return;
    this._isLeaving = true;
    try {
      if (!this.isActive) return;
      const channelId = this.channelId;
      const channelName = this.channelName;
      console.log(`[VoiceEngine] 📴 VC退出: #${channelName}`);
      this.isActive = false;
      this._modeSwitching = false;
      this._directCallConnected = false;

      // デバイス変更・復帰リスナー解除
      if (this._boundDeviceChange && navigator.mediaDevices) {
        try {
          navigator.mediaDevices.removeEventListener('devicechange', this._boundDeviceChange);
        } catch (_) {}
        this._boundDeviceChange = null;
      }
      if (this._boundVisibilityChange) {
        try {
          document.removeEventListener('visibilitychange', this._boundVisibilityChange);
        } catch (_) {}
        this._boundVisibilityChange = null;
      }
      this._releaseWakeLock();
      // P2P クリーンアップ
      this._cleanupAllPeers();
      // Agora クリーンアップ
      await this._cleanupAgora();

      // ローカルストリーム停止
      this._stopLocalStreams();

      // RTDB voiceState 削除 + onDisconnect キャンセル
      await this._clearVoiceState();

      // Firestore リスナー解除
      if (this._voiceStatesUnsub) {
        try {
          this._voiceStatesUnsub();
        } catch (_) {}
        this._voiceStatesUnsub = null;
      }
      if (this._signalingUnsub) {
        try {
          this._signalingUnsub();
        } catch (_) {}
        this._signalingUnsub = null;
      }
      if (this._channelConfigUnsub) {
        try {
          this._channelConfigUnsub();
        } catch (_) {}
        this._channelConfigUnsub = null;
      }

      // P2P 音量検知停止
      this._stopP2PVolumeMonitor();

      // 状態リセット
      this.mode = null;
      this._voiceStates = {};
      this._isMuted = false;
      this._isVideoOn = false;
      this._isScreenOn = false;
      this.serverId = this.channelId = this.channelName = null;
      // UI リセット
      if (channelId && !channelId.startsWith('call_')) {
        context._vcHideBar();
        this._setChannelActive(channelId, false);
        this._renderMemberTree(channelId, []);
      }
      this._renderGrid();
      const rtcText = document.getElementById('discordCallRtcText');
      const rtcBadge = document.getElementById('discordCallRtcStatus');
      if (rtcText) rtcText.textContent = '通話終了';
      if (rtcBadge) rtcBadge.classList.remove('reconnecting');
      if (this._boundBeforeUnload) {
        window.removeEventListener('beforeunload', this._boundBeforeUnload);
        this._boundBeforeUnload = null;
      }
      console.log('[VoiceEngine] 👋 退出完了');
    } finally {
      this._isLeaving = false;
    }
  }

  // ================================================================
  // TURN 疎通チェック (iceTransportPolicy: relay 強制テスト)
  // ================================================================
  async _checkTurnConnectivity() {
    const startTime = Date.now();
    try {
      const pc = new RTCPeerConnection({
        iceServers: context.VC_TURN_TEST_SERVERS,
        // TURN専用設定で不要なSTUN探索待ちをバイパス
        iceTransportPolicy: 'relay' // TURNリレー候補のみを強制探索
      });
      pc.createDataChannel('__vc_turn_check__');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const res = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pc.onicecandidate = null;
          try {
            pc.close();
          } catch (_) {}
          reject(new Error('TURN リレー候補探索タイムアウト (12秒)'));
        }, 12000);
        let foundRelay = false;
        pc.onicecandidate = e => {
          if (e.candidate && (e.candidate.type === 'relay' || e.candidate.candidate && e.candidate.candidate.includes('typ relay'))) {
            foundRelay = true;
            clearTimeout(timer);
            const latency = Date.now() - startTime;
            const candStr = e.candidate.candidate || `${e.candidate.protocol} ${e.candidate.address || e.candidate.ip}:${e.candidate.port}`;
            pc.onicecandidate = null;
            try {
              pc.close();
            } catch (_) {}
            resolve({
              success: true,
              latencyMs: latency,
              candidate: candStr
            });
          }
          if (e.candidate === null && !foundRelay) {
            clearTimeout(timer);
            pc.onicecandidate = null;
            try {
              pc.close();
            } catch (_) {}
            reject(new Error('リレー候補が生成されませんでした'));
          }
        };
      });
      console.log(`[VoiceEngine] ✅ TURN 疎通確認成功 (${res.latencyMs}ms): ${res.candidate}`);
      return res;
    } catch (e) {
      console.log(`[VoiceEngine] ℹ️ TURN 疎通テスト: ${e.message} (直接P2P可能環境ではリレー不使用で正常接続されます)`);
      return {
        success: false,
        error: e.message,
        latencyMs: Date.now() - startTime
      };
    }
  }

  // ================================================================
  // P2P 音量検知 & 発話インジケーター (Web Audio API)
  // ================================================================
  _startP2PVolumeMonitor() {
    if (this._p2pVolumeInterval) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this._p2pAudioContext || this._p2pAudioContext.state === 'closed') {
        this._p2pAudioContext = new AudioCtx();
      }
      if (this._p2pAudioContext.state === 'suspended') {
        this._p2pAudioContext.resume().catch(() => {});
      }

      // 自分のマイクストリームを登録
      if (this._localStream && this._myUid) {
        this._attachP2PStreamAnalyser(this._myUid, this._localStream, true);
      }
      const buf = new Uint8Array(64);
      this._p2pVolumeInterval = setInterval(() => {
        if (!this.isActive || this.mode !== 'p2p') return;
        this._p2pAnalysers.forEach((entry, uid) => {
          if (!entry || !entry.analyser) return;
          try {
            entry.analyser.getByteFrequencyData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) {
              sum += buf[i];
            }
            const avg = sum / buf.length;
            // ローカルがミュート中なら発話判定しない
            const isSpeaking = (!entry.isLocal || !this._isMuted) && avg > 14;
            this._setSpeakingUI(uid, isSpeaking);
          } catch (_) {}
        });
      }, 100);
      console.log('[VoiceEngine] 🎙️ P2P 音量検知モニター開始');
    } catch (e) {
      console.warn('[VoiceEngine] P2P 音量検知開始失敗:', e);
    }
  }
  _attachP2PStreamAnalyser(uid, stream, isLocal = false) {
    try {
      if (!this._p2pAudioContext || this._p2pAudioContext.state === 'closed') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this._p2pAudioContext = new AudioCtx();
      }
      if (!this._p2pAudioContext || !stream) return;
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) return;

      // 既存があれば切断
      const existing = this._p2pAnalysers.get(uid);
      if (existing && existing.source) {
        try {
          existing.source.disconnect();
        } catch (_) {}
      }
      const source = this._p2pAudioContext.createMediaStreamSource(stream);
      const analyser = this._p2pAudioContext.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      this._p2pAnalysers.set(uid, {
        source,
        analyser,
        isLocal
      });
    } catch (e) {
      console.warn(`[VoiceEngine] Analyser 接続失敗 (${uid}):`, e);
    }
  }
  _stopP2PVolumeMonitor() {
    if (this._p2pVolumeInterval) {
      clearInterval(this._p2pVolumeInterval);
      this._p2pVolumeInterval = null;
    }
    this._p2pAnalysers.forEach((entry, uid) => {
      try {
        if (entry.source) entry.source.disconnect();
      } catch (_) {}
      this._setSpeakingUI(uid, false);
    });
    this._p2pAnalysers.clear();
    if (this._p2pAudioContext) {
      try {
        this._p2pAudioContext.close();
      } catch (_) {}
      this._p2pAudioContext = null;
    }
  }
  _setSpeakingUI(uid, isSpeaking) {
    const isLocal = uid === this._myUid;
    const tile = document.getElementById(`vc-tile-${uid}`);
    if (tile) tile.classList.toggle('speaking', isSpeaking);
    const member = document.querySelector(`.vc-member-item[data-uid="${uid}"]`);
    if (member) member.classList.toggle('speaking', isSpeaking);

    // 1対1 通話用 UI
    if (isLocal) {
      const localTile = document.getElementById("participant-tile-local");
      if (localTile) localTile.classList.toggle("speaking", isSpeaking && !this._isMuted);
      const pipAvatar = document.getElementById("callPipAvatar");
      if (pipAvatar) pipAvatar.classList.toggle("speaking", isSpeaking && !this._isMuted);
    } else {
      const remoteTile = document.getElementById(`participant-tile-${uid}`) || document.querySelector('.discord-participant-tile:not(#participant-tile-local)');
      if (remoteTile) remoteTile.classList.toggle("speaking", isSpeaking);
    }
  }

  // ================================================================
  // voiceStates RTDB 購読 & 通話モード設定購読
  // ================================================================
  _subscribeVoiceStates() {
    if (this._voiceStatesUnsub) {
      try {
        this._voiceStatesUnsub();
      } catch (_) {}
      this._voiceStatesUnsub = null;
    }
    if (this._channelConfigUnsub) {
      try {
        this._channelConfigUnsub();
      } catch (_) {}
      this._channelConfigUnsub = null;
    }
    context._getOrInitRTDB().then(rtdb => {
      if (!this.isActive) return;
      import('../vendor/firebase/firebase-database.js').then(({
        ref,
        onValue,
        off
      }) => {
        if (!this.isActive) return;
        const sId = this.serverId || 'direct';
        const stateRef = ref(rtdb, `voiceStates/${sId}/${this.channelId}`);
        const configRef = ref(rtdb, `voiceStatesConfig/${sId}/${this.channelId}`);
        const configHandler = snapshot => {
          if (!this.isActive) return;
          const cfg = snapshot.val() || {};
          const modeOverride = cfg.modeOverride || 'auto';
          if (this._modeOverride !== modeOverride) {
            console.log(`[VoiceEngine] ⚙️ 通話モード設定受信: ${this._modeOverride} → ${modeOverride}`);
            this._modeOverride = modeOverride;
            this._applyCallMode(this._voiceStates);
          }
        };
        onValue(configRef, configHandler);
        this._channelConfigUnsub = () => off(configRef, 'value', configHandler);
        const handler = snapshot => {
          if (!this.isActive) return;
          const data = snapshot.val() || {};
          this._voiceStates = data;
          const count = Object.keys(data).length;
          console.log(`[VoiceEngine] 👥 参加者: ${count}人 | モード: ${this.mode || '初期化中'} (設定: ${this._modeOverride})`);
          // 画面共有・ビデオ終了者の静止画を確実に消去
          Object.keys(data).forEach(u => {
            const m = data[u];
            if (!m.hasVideo && !m.hasScreen) {
              this._unmountVideoTrack(u, u === this._myUid);
            }
          });
          // サイドバーと グリッドを更新
          if (this.channelId && !this.channelId.startsWith('call_')) {
            this._renderMemberTree(this.channelId, Object.values(data));
          }
          this._renderGrid();
          const countEl = document.getElementById('vcGridParticipantCount');
          if (countEl) countEl.textContent = `${count}人`;
          // 個別通話 (call_*) の場合、参加者タイルを更新し、一度2人以上で接続された後に相手が退出したら自動終了
          if (this.channelId && this.channelId.startsWith('call_')) {
            if (typeof context.renderParticipantTiles === 'function') {
              context.renderParticipantTiles();
            }
            if (count >= 2) {
              this._directCallConnected = true;
            } else if (this._directCallConnected && count <= 1) {
              console.log('[VoiceEngine] 📴 個別通話で相手の退出を検知しました');
              this._directCallConnected = false;
              if (typeof context.endCall === 'function') {
                context.endCall(true, 'remoteEnded');
              } else {
                this.leave();
              }
              return;
            }
          }
          // 通話モード判定（切替中は無視）
          if (!this._modeSwitching) {
            this._applyCallMode(data);
          }
        };
        onValue(stateRef, handler);
        this._voiceStatesUnsub = () => off(stateRef, 'value', handler);
      });
    }).catch(e => {
      console.error('[VoiceEngine] RTDB 初期化失敗:', e);
    });
  }

  // ================================================================
  // 通話モード適用（auto / p2p / turn / agora）
  // ================================================================
  async _applyCallMode(currentStates) {
    if (!this.isActive || this._modeSwitching) return;
    const count = Object.keys(currentStates || {}).length;
    const override = this._modeOverride || 'auto';
    if (override === 'turn') {
      const needPolicyChange = this.mode === 'p2p' && !this._forceTurnOnly;
      this._forceTurnOnly = true;
      if (this.mode !== 'p2p') {
        await this._switchToP2P(currentStates, 'relay');
      } else if (needPolicyChange) {
        await this._reconnectAllPeersWithPolicy('relay', currentStates);
      } else {
        this._syncP2PPeers(currentStates);
      }
      return;
    }
    if (override === 'p2p') {
      const needPolicyChange = this.mode === 'p2p' && this._forceTurnOnly;
      this._forceTurnOnly = false;
      if (this.mode !== 'p2p') {
        await this._switchToP2P(currentStates, 'all');
      } else if (needPolicyChange) {
        await this._reconnectAllPeersWithPolicy('all', currentStates);
      } else {
        this._syncP2PPeers(currentStates);
      }
      return;
    }
    this._forceTurnOnly = false;
    if (override === 'agora') {
      if (this.mode !== 'agora') {
        await this._switchToAgora();
      }
      return;
    }
    // デフォルト: 'auto'
    if (count <= context.VC_P2P_MAX_PEERS) {
      if (this.mode !== 'p2p') {
        console.log(`[VoiceEngine] 🔵 P2P モードへ切替 (${count}人)`);
        await this._switchToP2P(currentStates, 'all');
      } else if (this._forceTurnOnly) {
        this._forceTurnOnly = false;
        await this._reconnectAllPeersWithPolicy('all', currentStates);
      } else {
        this._syncP2PPeers(currentStates);
      }
    } else {
      if (this.mode !== 'agora') {
        console.log(`[VoiceEngine] ⚠️ 参加者 ${count}人 → Agora SFU へ自動切替`);
        await this._switchToAgora();
      }
    }
  }
  // 音声ストリームを一切切断せずに、ピア接続の通信ポリシー（直接 ⇔ TURNリレー）のみを瞬時に再構築
  async _reconnectAllPeersWithPolicy(transportPolicy, currentStates) {
    if (this._modeSwitching || !this.isActive) return;
    this._modeSwitching = true;
    const isRelay = transportPolicy === 'relay';
    console.log(`[VoiceEngine] 🔄 P2Pポリシー切替開始: ${isRelay ? 'TURNリレー強制' : 'P2P直接優先'}`);
    const rtcText = document.getElementById('discordCallRtcText');
    const rtcBadge = document.getElementById('discordCallRtcStatus');
    if (rtcText) rtcText.textContent = isRelay ? 'P2P (TURNリレー強制) 移行中...' : 'P2P (直接優先) 移行中...';
    if (rtcBadge) rtcBadge.classList.add('reconnecting');
    this._forceTurnOnly = isRelay;

    // Discord / LINE 準拠: Make-Before-Break (接続確立猶予付き切替)
    // 既存のピア接続とオーディオを即座に破棄せず、新接続が音声を受信するまで保持して音切れラグを撲滅
    const oldPeers = new Map(this._peers);
    const oldAudioElements = new Map(this._audioElements);
    this._peers = new Map();
    this._audioElements = new Map();
    const cleanupOldPeers = () => {
      oldPeers.forEach(p => {
        try {
          if (p.pc) p.pc.close();
        } catch (_) {}
        if (p.iceTimer) clearTimeout(p.iceTimer);
        if (p.signalingTimer) clearTimeout(p.signalingTimer);
      });
      oldPeers.clear();
      oldAudioElements.forEach(audioEl => {
        try {
          audioEl.pause();
          audioEl.srcObject = null;
          audioEl.remove();
        } catch (_) {}
      });
      oldAudioElements.clear();
    };
    // 最大3秒の猶予後に旧接続を完全破棄
    const oldCleanupTimer = setTimeout(cleanupOldPeers, 3000);
    const others = Object.keys(currentStates || {}).filter(uid => uid !== this._myUid);
    for (const peerUid of others) {
      const iAmOfferer = this._myUid < peerUid;
      if (iAmOfferer) {
        await this._createOffer(peerUid).catch(e => console.error(`[VoiceEngine] ポリシー切替Offer失敗 (${peerUid.slice(0, 8)}):`, e));
      } else {
        this._createPeerConnection(peerUid);
      }
    }
    this._modeSwitching = false;
    console.log(`[VoiceEngine] 🔄 P2Pポリシー切替完了: ${isRelay ? 'TURNリレー強制' : 'P2P直接優先'}`);
  }
  async setChannelModeOverride(mode = 'auto') {
    if (!this.channelId) {
      throw new Error('通話チャンネルに参加していません');
    }
    const isGlobalAdmin = typeof context.isAdmin !== 'undefined' && context.isAdmin;
    if (!isGlobalAdmin) {
      throw new Error('通話方式の強制変更は全体管理者のみ実行できます');
    }
    const validModes = ['auto', 'p2p', 'turn', 'agora'];
    if (!validModes.includes(mode)) {
      throw new Error(`無効なモード: ${mode} (有効値: ${validModes.join(', ')})`);
    }
    const rtdb = await context._getOrInitRTDB();
    const {
      ref,
      set
    } = await import('../vendor/firebase/firebase-database.js');
    const sId = this.serverId || 'direct';
    const configRef = ref(rtdb, `voiceStatesConfig/${sId}/${this.channelId}`);
    await set(configRef, {
      modeOverride: mode,
      updatedAt: Date.now(),
      updatedBy: this._myUid
    });
    console.log(`[VoiceEngine] ⚙️ 通話モード設定を更新しました: ${mode}`);
    this._modeOverride = mode;
    await this._applyCallMode(this._voiceStates);
  }

  // ================================================================
  // P2P ピア差分同期（新規参加者の検知とOffer作成・退出者削除）
  // ================================================================
  async _syncP2PPeers(currentStates) {
    if (this.mode !== 'p2p' || !this.isActive || this._modeSwitching) return;
    const currentUids = new Set(Object.keys(currentStates || {}).filter(uid => uid !== this._myUid));

    // 1. 退出したピアを削除
    for (const [peerUid] of this._peers) {
      if (!currentUids.has(peerUid)) {
        console.log(`[VoiceEngine] 👋 ピア退出検知 (${peerUid.slice(0, 8)}) → 削除`);
        this._removePeer(peerUid);
      }
    }

    // 2. 新規参加したピアへ接続開始
    for (const peerUid of currentUids) {
      if (!this._peers.has(peerUid)) {
        const iAmOfferer = this._myUid < peerUid;
        console.log(`[VoiceEngine] 🤝 新規ピア検知 (${peerUid.slice(0, 8)}): ${iAmOfferer ? '自分がOfferer' : '相手のOfferを待機'}`);
        if (iAmOfferer) {
          await this._createOffer(peerUid).catch(e => console.error(`[VoiceEngine] Offer作成失敗 (${peerUid.slice(0, 8)}):`, e));
        } else {
          // 自分がAnswererの場合もピア接続を先行生成し、Offer未達時の自律回復タイマーを設定
          const peerInfo = this._createPeerConnection(peerUid);
          if (peerInfo.signalingTimer) clearTimeout(peerInfo.signalingTimer);
          peerInfo.signalingTimer = setTimeout(async () => {
            if (!this.isActive || this.mode !== 'p2p') return;
            if (peerInfo.pc.signalingState === 'stable' && peerInfo.pc.iceConnectionState === 'new') {
              console.warn(`[VoiceEngine] ⏱ Offer待機タイムアウト (${peerUid.slice(0, 8)}) → 自発的Offer送信で接続推進`);
              try {
                const offer = await peerInfo.pc.createOffer();
                await peerInfo.pc.setLocalDescription(offer);
                await this._sendSignal(peerUid, {
                  type: 'offer',
                  sdp: offer.sdp,
                  fallback: true
                });
              } catch (e) {
                console.warn(`[VoiceEngine] 自発的Offer送信エラー:`, e);
              }
            }
          }, 4500);
        }
      }
    }
  }

  // ================================================================
  // P2P モード切替
  // ================================================================
  async _switchToP2P(currentStates, transportPolicy = 'all') {
    if (this._modeSwitching) return;
    this._modeSwitching = true;
    this._forceTurnOnly = transportPolicy === 'relay';
    if (this.mode === 'agora') {
      console.log('[VoiceEngine] 🔄 Agora → P2P 切替中...');
      await this._cleanupAgora();
    }
    this.mode = 'p2p';
    // マイクストリームが生きていることを確実に保証（Agora解放後の無音化を完全防止）
    await this._ensureLocalStream();
    console.log(`[VoiceEngine] 🔵 P2P モード (強制リレー: ${this._forceTurnOnly})`);
    const rtcText = document.getElementById('discordCallRtcText');
    const rtcBadge = document.getElementById('discordCallRtcStatus');
    if (rtcText) rtcText.textContent = this._forceTurnOnly ? 'P2P (TURNリレー中継) 接続完了' : 'P2P (直接接続) 接続完了';
    if (rtcBadge) rtcBadge.classList.remove('reconnecting');
    // 既存ピア接続をクリーンアップしてから再構築
    this._cleanupAllPeers();
    // シグナリングリスナーを先行起動（高速なAnswer/Candidateの受信漏れ防止）
    this._setupSignalingListener();
    // P2P 音量検知開始
    this._startP2PVolumeMonitor();
    // 参加者リストの統合（未反映による取りこぼし防止）
    const allStates = {
      ...(this._voiceStates || {}),
      ...(currentStates || {})
    };
    const others = Object.keys(allStates).filter(uid => uid !== this._myUid);
    for (const peerUid of others) {
      const iAmOfferer = this._myUid < peerUid;
      if (iAmOfferer) {
        await this._createOffer(peerUid).catch(e => console.error(`[VoiceEngine] Offer作成失敗 (${peerUid.slice(0, 8)}):`, e));
      } else {
        this._createPeerConnection(peerUid);
      }
    }
    this._modeSwitching = false;
  }

  // ================================================================
  // P2P Offer 作成
  // ================================================================
  async _createOffer(peerUid) {
    const peerInfo = this._createPeerConnection(peerUid);
    const {
      pc
    } = peerInfo;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this._sendSignal(peerUid, {
      type: 'offer',
      sdp: offer.sdp
    });
    console.log(`[VoiceEngine] 📤 Offer → ${peerUid.slice(0, 8)} (ICE: UDP80/443 + TCP443)`);
    // 相手からのAnswer待機タイムアウト (3.5秒)：相手の受信漏れ・起動遅延時に自動再送
    if (peerInfo.signalingTimer) clearTimeout(peerInfo.signalingTimer);
    peerInfo.signalingTimer = setTimeout(async () => {
      if (!this.isActive || this.mode !== 'p2p') return;
      if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed' && pc.signalingState === 'have-local-offer') {
        console.warn(`[VoiceEngine] ⏱ Answer待機タイムアウト (${peerUid.slice(0, 8)}) → Offer自動再送`);
        try {
          const reOffer = await pc.createOffer({
            iceRestart: true
          });
          await pc.setLocalDescription(reOffer);
          await this._sendSignal(peerUid, {
            type: 'offer',
            sdp: reOffer.sdp,
            retry: true
          });
        } catch (e) {
          console.warn(`[VoiceEngine] Offer自動再送エラー:`, e);
        }
      }
    }, 3500);
  }
  // ================================================================
  // RTCPeerConnection 生成（共通）
  // ================================================================
  _createPeerConnection(peerUid) {
    // 既存があれば閉じる
    const existing = this._peers.get(peerUid);
    if (existing) {
      if (existing.signalingTimer) clearTimeout(existing.signalingTimer);
      try {
        existing.pc.close();
      } catch (_) {}
    }
    const pc = new RTCPeerConnection({
      iceServers: context.VC_ICE_SERVERS,
      iceTransportPolicy: this._forceTurnOnly ? 'relay' : 'all',
      // TURN強制フラグまたは直接接続
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });
    const peerInfo = {
      pc,
      iceRestarts: 0,
      iceTimer: null,
      signalingTimer: null,
      pendingCandidates: []
    };
    this._peers.set(peerUid, peerInfo);

    // ローカルトラックを追加
    if (this._localStream) {
      this._localStream.getTracks().forEach(track => {
        pc.addTrack(track, this._localStream);
      });
    }
    // 画面共有またはカメラONならビデオトラックも追加
    if (this._localScreenStream && this._isScreenOn) {
      this._localScreenStream.getTracks().forEach(track => {
        pc.addTrack(track, this._localScreenStream);
      });
    } else if (this._localVideoStream && this._isVideoOn) {
      this._localVideoStream.getTracks().forEach(track => {
        pc.addTrack(track, this._localVideoStream);
      });
    }
    // リモートトラック受信（Audio GC防止: Map に格納）
    pc.ontrack = e => {
      if (e.track.kind === 'audio') {
        let audioEl = this._audioElements.get(peerUid);
        if (!audioEl) {
          audioEl = new Audio();
          audioEl.autoplay = true;
          audioEl.playsInline = true;
          // DOM に追加して GC を確実に防止
          audioEl.style.display = 'none';
          document.body.appendChild(audioEl);
          this._audioElements.set(peerUid, audioEl);
        }
        if (typeof context._isUserPanelDeafened !== 'undefined' && context._isUserPanelDeafened) {
          audioEl.muted = true;
        }
        audioEl.srcObject = e.streams[0];
        if (window.covoVolumeManager) {
          window.covoVolumeManager.applyToAudioElement(peerUid, audioEl);
        }
        const savedSpeaker = localStorage.getItem('covo_selected_speaker');
        if (savedSpeaker && typeof audioEl.setSinkId === 'function') {
          audioEl.setSinkId(savedSpeaker).catch(() => {});
        }
        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            console.warn(`[VoiceEngine] 🔈 自動再生制限検知 (${peerUid.slice(0, 8)}): タップで再生開始`, err);
            const resumeAudio = () => {
              audioEl.play().catch(() => {});
              document.removeEventListener('click', resumeAudio);
              document.removeEventListener('touchstart', resumeAudio);
            };
            document.addEventListener('click', resumeAudio, {
              once: true
            });
            document.addEventListener('touchstart', resumeAudio, {
              once: true
            });
          });
        }
        this._attachP2PStreamAnalyser(peerUid, e.streams[0], false);
        console.log(`[VoiceEngine] 🔈 音声受信: ${peerUid.slice(0, 8)}`);
      }
      if (e.track.kind === 'video') {
        console.log(`[VoiceEngine] 📹 映像受信: ${peerUid.slice(0, 8)}`);
        this._mountVideoTrack(peerUid, e.streams[0] || e.track, false);
        // 静止画残留完全防止: トラック停止/ミュート検知時に即座にアンマウント
        e.track.onmute = () => {
          console.log(`[VoiceEngine] 📹 映像ミュート検知 (${peerUid.slice(0, 8)}) → 映像消去`);
          this._unmountVideoTrack(peerUid, false);
        };
        e.track.onunmute = () => {
          console.log(`[VoiceEngine] 📹 映像再開検知 (${peerUid.slice(0, 8)}) → 映像再マウント`);
          this._mountVideoTrack(peerUid, e.streams[0] || e.track, false);
        };
        e.track.onended = () => {
          console.log(`[VoiceEngine] 📹 映像終了検知 (${peerUid.slice(0, 8)}) → 映像消去`);
          this._unmountVideoTrack(peerUid, false);
        };
      }
    };

    // ICE 候補
    pc.onicecandidate = e => {
      if (!this.isActive) return;
      if (e.candidate) {
        this._sendSignal(peerUid, {
          type: 'candidate',
          candidate: e.candidate.toJSON()
        }).catch(() => {});
      }
    };

    // ICE 接続状態
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[VoiceEngine] ICE (${peerUid.slice(0, 8)}): ${state}`);
      if (peerInfo.iceTimer) {
        clearTimeout(peerInfo.iceTimer);
        peerInfo.iceTimer = null;
      }
      if (state === 'checking') {
        // 30秒タイムアウト
        peerInfo.iceTimer = setTimeout(() => {
          if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
            console.warn(`[VoiceEngine] ⏱ ICEタイムアウト (${peerUid.slice(0, 8)}) → リスタート`);
            this._iceRestart(peerUid);
          }
        }, context.VC_ICE_TIMEOUT_MS);
      }
      if (state === 'connected' || state === 'completed') {
        peerInfo.iceRestarts = 0;
        if (peerInfo.signalingTimer) {
          clearTimeout(peerInfo.signalingTimer);
          peerInfo.signalingTimer = null;
        }
        // どのパス（relay/直接）を使っているかをログ出力し、UIステータスにも即座に明示
        pc.getStats().then(stats => {
          stats.forEach(r => {
            if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) {
              const localId = r.localCandidateId;
              stats.forEach(lr => {
                if (lr.id === localId) {
                  const isRelay = lr.candidateType === 'relay';
                  const via = isRelay ? `TURN relay (${lr.relayProtocol || '?'} @ ${lr.ip || lr.address || 'openrelay.metered.ca'})` : `直接 P2P (${lr.candidateType})`;
                  console.log(`[VoiceEngine] ✅ ${peerUid.slice(0, 8)}: ${via}`);
                  const rtcText = document.getElementById('discordCallRtcText');
                  const rtcBadge = document.getElementById('discordCallRtcStatus');
                  if (rtcText) {
                    rtcText.textContent = isRelay ? 'P2P (TURNリレー中継) 接続完了' : 'P2P (直接接続) 接続完了';
                  }
                  if (rtcBadge) rtcBadge.classList.remove('reconnecting');
                }
              });
            }
          });
        }).catch(() => {});
      }
      if (state === 'failed') {
        console.warn(`[VoiceEngine] ❌ ICE失敗 (${peerUid.slice(0, 8)}) → ICE Restart`);
        this._iceRestart(peerUid);
      }
      if (state === 'disconnected') {
        // 5秒待って回復しなければリスタート
        peerInfo.iceTimer = setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') {
            if (window.__covo_native_console__?.log) {
              window.__covo_native_console__.log(`[VoiceEngine] 🔌 一時切断検知 (${peerUid.slice(0, 8)}) → ICE Restart`);
            }
            this._iceRestart(peerUid);
          }
        }, 5000);
      }
    };
    return peerInfo;
  }

  // ================================================================
  // ICE Restart
  // ================================================================
  async _iceRestart(peerUid) {
    const peerInfo = this._peers.get(peerUid);
    if (!peerInfo || !this.isActive || this.mode !== 'p2p') return;
    peerInfo.iceRestarts++;
    console.log(`[VoiceEngine] 🔄 ICE Restart ${peerInfo.iceRestarts}/${context.VC_ICE_MAX_RESTARTS} (${peerUid.slice(0, 8)})`);
    const iAmOfferer = this._myUid < peerUid;
    if (iAmOfferer) {
      // 直接接続失敗時は自動でTURNリレー強制へエスカレーションして確実に貫通
      if (peerInfo.iceRestarts >= 2 && !this._forceTurnOnly) {
        console.log(`[VoiceEngine] ⚡ 直接ICE失敗多発 → TURNリレー強制に切り替えて再接続`);
        this._forceTurnOnly = true;
      }
      try {
        const {
          pc
        } = peerInfo;
        const offer = await pc.createOffer({
          iceRestart: true
        });
        await pc.setLocalDescription(offer);
        await this._sendSignal(peerUid, {
          type: 'offer',
          sdp: offer.sdp
        });
      } catch (e) {
        console.error('[VoiceEngine] ICE Restart Offer失敗:', e);
      }
    } else {
      // 自分がAnswerer側なら相手にrestart-requestを送信してOfferを促す
      await this._sendSignal(peerUid, {
        type: 'restart-request'
      });
    }
  }

  // ================================================================
  // P2P 再ネゴシエーション (画面共有の追加・削除用)
  // ================================================================
  async _renegotiatePeer(peerUid) {
    const peerInfo = this._peers.get(peerUid);
    if (!peerInfo || !peerInfo.pc || !this.isActive || this.mode !== 'p2p') return;
    try {
      const offer = await peerInfo.pc.createOffer();
      await peerInfo.pc.setLocalDescription(offer);
      await this._sendSignal(peerUid, {
        type: 'offer',
        sdp: offer.sdp,
        renegotiate: true
      });
      console.log(`[VoiceEngine] 🔄 再ネゴシエーション Offer 送信 → ${peerUid.slice(0, 8)}`);
    } catch (e) {
      console.warn(`[VoiceEngine] 再ネゴシエーション失敗 (${peerUid.slice(0, 8)}):`, e);
    }
  }

  // ================================================================
  // ピア削除
  // ================================================================
  _removePeer(peerUid) {
    const peerInfo = this._peers.get(peerUid);
    if (peerInfo) {
      if (peerInfo.iceTimer) clearTimeout(peerInfo.iceTimer);
      if (peerInfo.signalingTimer) clearTimeout(peerInfo.signalingTimer);
      try {
        peerInfo.pc.onicecandidate = null;
        peerInfo.pc.ontrack = null;
        peerInfo.pc.oniceconnectionstatechange = null;
        peerInfo.pc.close();
      } catch (_) {}
      this._peers.delete(peerUid);
    }
    // Audio 要素をDOMから安全に停止・消去
    const audioEl = this._audioElements.get(peerUid);
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.srcObject = null;
        audioEl.remove();
      } catch (_) {}
      this._audioElements.delete(peerUid);
    }
    // 音量アナライザー切断
    const analyserEntry = this._p2pAnalysers.get(peerUid);
    if (analyserEntry) {
      try {
        if (analyserEntry.source) analyserEntry.source.disconnect();
      } catch (_) {}
      this._p2pAnalysers.delete(peerUid);
    }
    this._setSpeakingUI(peerUid, false);

    // リモートビデオコンテナもクリア
    const remVideo = document.getElementById(`remote-video-${peerUid}`);
    if (remVideo) {
      remVideo.innerHTML = '';
      remVideo.classList.add('hidden');
    }
  }

  // ================================================================
  // 全ピア削除
  // ================================================================
  _cleanupAllPeers() {
    this._peers.forEach((_, uid) => this._removePeer(uid));
    this._peers.clear();
  }

  // ================================================================
  // Firestore シグナリング送信
  // ================================================================
  async _sendSignal(targetUid, payload) {
    if (!this.isActive) return;
    try {
      // ドキュメントIDに一意サフィックスを付与し、既存ドキュメントとの衝突・更新拒否を100%排除
      const docId = [this._myUid, targetUid].sort().join('_') + '_' + (this.channelId || '').replace(/[^a-zA-Z0-9]/g, '');
      const uniqueSuffix = `_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const sigRef = context.doc(context.db, `artifacts/${context.appId}/vc_signaling/${docId}_${payload.type}${uniqueSuffix}`);
      await context.setDoc(sigRef, {
        ...payload,
        fromUid: this._myUid,
        toUid: targetUid,
        channelId: this.channelId,
        at: Date.now()
      });
    } catch (e) {
      console.warn('[VoiceEngine] シグナリング送信エラー:', e.code || e.message);
    }
  }
  // ================================================================
  // Firestore シグナリング受信リスナー
  // ================================================================
  _setupSignalingListener() {
    if (this._signalingUnsub) {
      try {
        this._signalingUnsub();
      } catch (_) {}
    }
    const sigQuery = context.query(context.collection(context.db, `artifacts/${context.appId}/vc_signaling`), context.where('toUid', '==', this._myUid));
    this._signalingUnsub = context.onSnapshot(sigQuery, async snap => {
      for (const change of snap.docChanges()) {
        if (!['added', 'modified'].includes(change.type)) continue;
        const data = change.doc.data();
        if (!data || data.toUid !== this._myUid || !this.isActive) continue;
        if (data.channelId !== this.channelId) continue;
        const fromUid = data.fromUid;
        if (!fromUid || fromUid === this._myUid) continue;
        try {
          if (data.type === 'offer') {
            await this._handleOffer(fromUid, data);
          } else if (data.type === 'answer') {
            const peerInfo = this._peers.get(fromUid);
            if (peerInfo) {
              if (peerInfo.signalingTimer) {
                clearTimeout(peerInfo.signalingTimer);
                peerInfo.signalingTimer = null;
              }
              if (peerInfo.pc.signalingState !== 'stable') {
                await peerInfo.pc.setRemoteDescription(new RTCSessionDescription({
                  type: 'answer',
                  sdp: data.sdp
                }));
                console.log(`[VoiceEngine] 📥 Answer受信 from ${fromUid.slice(0, 8)}`);
                while (peerInfo.pendingCandidates && peerInfo.pendingCandidates.length > 0) {
                  const cand = peerInfo.pendingCandidates.shift();
                  try {
                    await peerInfo.pc.addIceCandidate(new RTCIceCandidate(cand));
                  } catch (e) {}
                }
              }
            }
          } else if (data.type === 'candidate') {
            let peerInfo = this._peers.get(fromUid);
            if (!peerInfo) {
              peerInfo = this._createPeerConnection(fromUid);
            }
            if (peerInfo && data.candidate) {
              if (peerInfo.pc.remoteDescription && peerInfo.pc.remoteDescription.type) {
                try {
                  await peerInfo.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                  // 無効な候補は無視
                }
              } else {
                if (!peerInfo.pendingCandidates) peerInfo.pendingCandidates = [];
                peerInfo.pendingCandidates.push(data.candidate);
              }
            }
          } else if (data.type === 'restart-request') {
            console.log(`[VoiceEngine] 🔄 相手(${fromUid.slice(0, 8)})からICE再接続要求を受信`);
            await this._iceRestart(fromUid);
          }
        } catch (e) {
          console.error('[VoiceEngine] シグナリング処理エラー:', e);
        }
        // 処理済みドキュメントを削除
        try {
          await context.deleteDoc(change.doc.ref);
        } catch (_) {}
      }
    }, e => {
      console.error('[VoiceEngine] シグナリングリスナーエラー:', e.code, e.message);
    });
  }
  // ================================================================
  // Offer 受信処理（Answerer 側）
  // ================================================================
  async _handleOffer(fromUid, data) {
    let peerInfo = this._peers.get(fromUid);
    if (!peerInfo) {
      peerInfo = this._createPeerConnection(fromUid);
    } else if (!data.renegotiate && peerInfo.pc.signalingState === 'have-local-offer') {
      // Glare（両端がOfferを同時送信）: 決定論的ルールで解決
      if (this._myUid > fromUid) {
        console.log(`[VoiceEngine] Glare検知: ${fromUid.slice(0, 8)}のOfferを優先`);
        peerInfo.pc.close();
        peerInfo = this._createPeerConnection(fromUid);
      } else {
        return; // 自分がOfferer、相手のOfferは無視
      }
    }
    try {
      if (!peerInfo || !peerInfo.pc || peerInfo.pc.signalingState === 'closed') return;
      await peerInfo.pc.setRemoteDescription(new RTCSessionDescription({
        type: 'offer',
        sdp: data.sdp
      }));
      while (peerInfo.pendingCandidates && peerInfo.pendingCandidates.length > 0) {
        const cand = peerInfo.pendingCandidates.shift();
        try {
          await peerInfo.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {}
      }
      if (peerInfo.pc.signalingState !== 'have-remote-offer') return;
      const answer = await peerInfo.pc.createAnswer();
      if (peerInfo.pc.signalingState !== 'have-remote-offer') return;
      await peerInfo.pc.setLocalDescription(answer);
      await this._sendSignal(fromUid, {
        type: 'answer',
        sdp: answer.sdp
      });
      console.log(`[VoiceEngine] 📥 Offer受信 → Answer送信 to ${fromUid.slice(0, 8)}`);
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes('Called in wrong state') && !msg.includes('no pending remote description')) {
        console.error('[VoiceEngine] Answer作成失敗:', e);
      }
    }
  }

  // ================================================================
  // 古いシグナリングドキュメントを掃除
  // ================================================================
  async _cleanupStaleSignaling() {
    try {
      // 自分宛の古いシグナリングを安全に掃除（60秒以上前の古い残骸のみ削除、最新のOfferは絶対保持）
      const snap = await context.getDocs(context.query(context.collection(context.db, `artifacts/${context.appId}/vc_signaling`), context.where('toUid', '==', this._myUid)));
      const now = Date.now();
      const deletes = [];
      snap.forEach(d => {
        const data = d.data();
        if (!data.at || now - data.at > 60000) {
          deletes.push(context.deleteDoc(d.ref));
        }
      });
      await Promise.allSettled(deletes);
      if (deletes.length > 0) {
        console.log(`[VoiceEngine] 🧹 古いシグナリング残骸 ${deletes.length}件 を削除`);
      }
    } catch (e) {
      // 無視（クリーンアップ失敗は致命的ではない）
    }
  }

  // ================================================================
  // Agora SFU モード切替
  // ================================================================
  async _switchToAgora() {
    if (this._modeSwitching) return;
    this._modeSwitching = true;
    const channelAtStart = this.channelId;
    const streamAtStart = this._localStream;
    try {
      await context.loadAgoraLibrary();
    } catch (err) {
      console.warn('[VoiceEngine] SFUライブラリ取得失敗、P2Pを継続:', err.message);
      this._modeSwitching = false;
      return;
    }
    if (!this.isActive || this.channelId !== channelAtStart || this._localStream !== streamAtStart) {
      this._modeSwitching = false;
      return;
    }
    if (this.mode === 'p2p') {
      console.log('[VoiceEngine] 🔄 P2P → Agora SFU 切替中 (P2P接続とオーディオを完全解放)...');
      this._cleanupAllPeers();
      if (this._signalingUnsub) {
        try {
          this._signalingUnsub();
        } catch (_) {}
        this._signalingUnsub = null;
      }
    }
    if (typeof AgoraRTC === 'undefined') {
      console.error('[VoiceEngine] ❌ Agora RTC SDK が読み込まれていません');
      this.mode = 'p2p';
      this._modeSwitching = false;
      await this._switchToP2P(this._voiceStates);
      return;
    }
    this.mode = 'agora';
    try {
      // Agora チャンネル名（64文字制限あり）
      const agoraChannel = `vc_${this.serverId}_${this.channelId}`.slice(0, 64);
      console.log(`[VoiceEngine] 🟣 Agora SFU: チャンネル "${agoraChannel}"`);
      let tokenData;
      try {
        tokenData = await context.fetchAgoraToken(agoraChannel, this._myUid);
      } catch (e) {
        if (e.message === 'agoraNotConfigured') {
          console.error('[VoiceEngine] ❌ Agora トークン未設定。Worker の AGORA_APP_ID を確認してください。');
        } else {
          console.error('[VoiceEngine] ❌ Agora トークン取得失敗:', e.message);
        }
        throw e;
      }
      this._agoraClient = AgoraRTC.createClient({
        mode: 'rtc',
        codec: 'vp8'
      });
      // イベントハンドラ設定
      this._agoraClient.on('user-published', async (user, mediaType) => {
        await this._agoraClient.subscribe(user, mediaType).catch(e => console.warn('[VoiceEngine] Agora subscribe失敗:', e));
        if (mediaType === 'audio' && user.audioTrack) {
          if (window.covoVolumeManager) {
            window.covoVolumeManager.applyToAgoraTrack(user.uid, user.audioTrack);
          }
          const savedSpeaker = localStorage.getItem('covo_selected_speaker');
          if (savedSpeaker && typeof user.audioTrack.setPlaybackDevice === 'function') {
            user.audioTrack.setPlaybackDevice(savedSpeaker).catch(() => {});
          }
          if (typeof context._isUserPanelDeafened !== 'undefined' && context._isUserPanelDeafened) {
            try {
              user.audioTrack.setVolume(0);
            } catch (_) {}
          }
          const p = user.audioTrack.play();
          if (p && typeof p.catch === 'function') {
            p.catch(err => {
              console.warn('[VoiceEngine] Agora 音声自動再生制限検知:', err);
              const resumeAudio = () => {
                user.audioTrack?.play().catch(() => {});
                document.removeEventListener('click', resumeAudio);
                document.removeEventListener('touchstart', resumeAudio);
              };
              document.addEventListener('click', resumeAudio, {
                once: true
              });
              document.addEventListener('touchstart', resumeAudio, {
                once: true
              });
            });
          }
        }
        if (mediaType === 'video' && user.videoTrack) {
          this._agoraRemote.set(String(user.uid), user);
          this._renderGrid();
          this._mountVideoTrack(String(user.uid), user.videoTrack, false);
        }
        this._agoraRemote.set(String(user.uid), user);
      });
      this._agoraClient.on('user-unpublished', (user, mediaType) => {
        if (mediaType === 'video') {
          this._unmountVideoTrack(String(user.uid), false);
          this._renderGrid();
        }
      });
      this._agoraClient.on('user-left', user => {
        this._unmountVideoTrack(String(user.uid), false);
        this._agoraRemote.delete(String(user.uid));
        this._renderGrid();
      });
      // ボリュームインジケーター（デバウンス100ms）
      this._agoraClient.enableAudioVolumeIndicator();
      this._agoraClient.on('volume-indicator', volumes => {
        if (this._agoraVolumeDebounceTimer) return;
        this._agoraVolumeDebounceTimer = setTimeout(() => {
          this._agoraVolumeDebounceTimer = null;
          volumes.forEach(vol => {
            const isSpeaking = vol.level > 5;
            const uid = String(vol.uid);
            document.getElementById(`vc-tile-${uid}`)?.classList.toggle('speaking', isSpeaking);
            document.querySelector(`.vc-member-item[data-uid="${uid}"]`)?.classList.toggle('speaking', isSpeaking);
          });
        }, 100);
      });

      // トークン有効期限切れ監視と自動リフレッシュ
      this._agoraClient.on('token-privilege-will-expire', async () => {
        console.log('[VoiceEngine] 🔑 Agora トークン期限切れ予告を受信。更新します...');
        try {
          const refreshedToken = await context.fetchAgoraToken(agoraChannel, this._myUid);
          if (this._agoraClient && refreshedToken?.token) {
            await this._agoraClient.renewToken(refreshedToken.token);
            console.log('[VoiceEngine] 🔑 Agora トークン自動更新成功');
          }
        } catch (err) {
          console.error('[VoiceEngine] Agora トークン自動更新失敗:', err);
        }
      });
      this._agoraClient.on('token-privilege-did-expire', async () => {
        console.warn('[VoiceEngine] 🔑 Agora トークン期限切れ。再接続します...');
        try {
          const refreshedToken = await context.fetchAgoraToken(agoraChannel, this._myUid);
          if (this._agoraClient && refreshedToken?.token) {
            await this._agoraClient.renewToken(refreshedToken.token);
          }
        } catch (err) {
          console.error('[VoiceEngine] Agora トークン再接続失敗:', err);
          if (this.isActive) {
            await this._cleanupAgora();
            this.mode = 'p2p';
            await this._switchToP2P(this._voiceStates);
          }
        }
      });

      // チャンネル参加
      await this._agoraClient.join(tokenData.appId, agoraChannel, tokenData.token, this._myUid);
      // マイクトラック公開 (既存ストリームのトラックを再利用してデバイス競合・無音化を完全防止)
      await this._ensureLocalStream();
      const localAudioTrack = this._localStream?.getAudioTracks()[0];
      if (localAudioTrack && typeof AgoraRTC.createCustomAudioTrack === 'function') {
        this._agoraAudio = AgoraRTC.createCustomAudioTrack({
          mediaStreamTrack: localAudioTrack
        });
      } else {
        this._agoraAudio = await AgoraRTC.createMicrophoneAudioTrack({
          AEC: true,
          ANS: true,
          AGC: true
        });
      }
      if (this._isMuted) await this._agoraAudio.setEnabled(false);
      await this._agoraClient.publish([this._agoraAudio]);
      console.log('[VoiceEngine] ✅ Agora SFU 接続完了');
      const rtcText = document.getElementById('discordCallRtcText');
      const rtcBadge = document.getElementById('discordCallRtcStatus');
      if (rtcText) rtcText.textContent = 'Agora SFU 接続完了';
      if (rtcBadge) rtcBadge.classList.remove('reconnecting');
    } catch (e) {
      console.error('[VoiceEngine] ❌ Agora接続失敗:', e.message || e);
      if (typeof context.alertMessage === 'function') {
        context.alertMessage('Agora SFU 接続に失敗しました。P2P モードを継続します。', 'warning');
      }
      await this._cleanupAgora();
      this.mode = 'p2p';
      this._modeSwitching = false;
      await this._switchToP2P(this._voiceStates);
      return;
    }
    this._modeSwitching = false;
  }
  // ================================================================
  // Agora クリーンアップ
  // ================================================================
  async _cleanupAgora() {
    this._stopP2PVolumeMonitor();
    if (this._agoraVolumeDebounceTimer) {
      clearTimeout(this._agoraVolumeDebounceTimer);
      this._agoraVolumeDebounceTimer = null;
    }
    for (const track of [this._agoraAudio, this._agoraVideo, this._agoraScreen]) {
      if (track) {
        try {
          track.stop();
          track.close();
        } catch (_) {}
      }
    }
    this._agoraAudio = this._agoraVideo = this._agoraScreen = null;
    if (this._agoraClient) {
      try {
        this._agoraClient.removeAllListeners();
        await this._agoraClient.leave();
      } catch (_) {}
      this._agoraClient = null;
    }
    this._agoraRemote.clear();
  }

  // ================================================================
  // ローカルストリーム停止
  // ================================================================
  _stopLocalStreams() {
    if (this._localStream) {
      this._localStream.getTracks().forEach(t => {
        try {
          t.stop();
        } catch (_) {}
      });
      this._localStream = null;
    }
    if (this._localScreenStream) {
      this._localScreenStream.getTracks().forEach(t => {
        try {
          t.stop();
        } catch (_) {}
      });
      this._localScreenStream = null;
    }
    if (this._localVideoStream) {
      this._localVideoStream.getTracks().forEach(t => {
        try {
          t.stop();
        } catch (_) {}
      });
      this._localVideoStream = null;
    }
  }

  // ================================================================
  // ミュート切替
  // ================================================================
  async toggleMute() {
    this._isMuted = !this._isMuted;

    // P2P: ローカルストリームのオーディオトラックを有効/無効
    if (this._localStream) {
      this._localStream.getAudioTracks().forEach(t => {
        t.enabled = !this._isMuted;
      });
    }
    // Agora: SDK の setEnabled を使用
    if (this.mode === 'agora' && this._agoraAudio) {
      await this._agoraAudio.setEnabled(!this._isMuted).catch(e => console.warn('[VoiceEngine] Agora mute失敗:', e));
    }
    await this._setVoiceState({
      isMuted: this._isMuted
    }).catch(() => {});
    this._updateMuteUI();
    console.log(`[VoiceEngine] 🎤 マイク: ${this._isMuted ? 'ミュート' : 'オン'}`);
  }

  // ================================================================
  // カメラ切替（P2P + Agora 完全両対応）
  // ================================================================
  async toggleCamera() {
    if (this._isVideoOn) {
      await this._stopCamera();
    } else {
      await this._startCamera();
    }
  }
  async _startCamera() {
    try {
      this._localVideoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: {
            ideal: 1280
          },
          height: {
            ideal: 720
          },
          frameRate: {
            ideal: 30
          }
        },
        audio: false
      });
    } catch (e) {
      const isNotFound = e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError' || String(e.message || '').includes('Requested device not found');
      if (isNotFound) {
        console.warn('[VoiceEngine] カメラデバイスが見つかりません (未接続)');
        if (typeof context.alertMessage === 'function') context.alertMessage('カメラデバイスが見つかりませんでした。Webカメラの接続をご確認ください。', 'warning');
      } else {
        console.error('[VoiceEngine] カメラ取得失敗:', e);
        if (typeof context.alertMessage === 'function') context.alertMessage('カメラの起動に失敗しました: ' + (e.message || ''), 'error');
      }
      return;
    }
    const camTrack = this._localVideoStream.getVideoTracks()[0];
    if (!camTrack) return;
    camTrack.onended = () => {
      if (this._isVideoOn) this._stopCamera();
    };
    if (this.mode === 'p2p') {
      for (const [peerUid, {
        pc
      }] of this._peers) {
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(camTrack).catch(e => console.warn('[VoiceEngine] P2P replaceTrack(cam)失敗:', e));
        } else {
          pc.addTrack(camTrack, this._localVideoStream);
          await this._renegotiatePeer(peerUid);
        }
      }
    } else if (this.mode === 'agora') {
      try {
        if (typeof AgoraRTC !== 'undefined' && AgoraRTC.createCustomVideoTrack) {
          this._agoraVideo = AgoraRTC.createCustomVideoTrack({
            mediaStreamTrack: camTrack
          });
        } else {
          this._agoraVideo = await AgoraRTC.createCameraVideoTrack({
            encoderConfig: '720p_1'
          });
        }
        if (Array.isArray(this._agoraVideo)) this._agoraVideo = this._agoraVideo[0];
        await this._agoraClient.publish([this._agoraVideo]);
      } catch (e) {
        console.error('[VoiceEngine] Agora カメラ公開失敗:', e);
        if (this._localVideoStream) {
          this._localVideoStream.getTracks().forEach(t => t.stop());
          this._localVideoStream = null;
        }
        if (typeof context.alertMessage === 'function') context.alertMessage('Agora カメラの起動に失敗しました', 'error');
        return;
      }
    }
    this._isVideoOn = true;
    this._mountVideoTrack(this._myUid, camTrack, true);
    await this._setVoiceState({
      hasVideo: true
    }).catch(() => {});
    this._updateCamUI();
    this._renderGrid();
    console.log(`[VoiceEngine] 📷 カメラ: オン (モード: ${this.mode})`);
  }
  async _stopCamera() {
    if (this.mode === 'p2p') {
      for (const [peerUid, {
        pc
      }] of this._peers) {
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) {
          const screenTrack = this._isScreenOn && this._localScreenStream ? this._localScreenStream.getVideoTracks()[0] : null;
          await videoSender.replaceTrack(screenTrack).catch(() => {});
        }
        await this._renegotiatePeer(peerUid);
      }
    } else if (this.mode === 'agora' && this._agoraVideo) {
      try {
        await this._agoraClient.unpublish([this._agoraVideo]);
      } catch (_) {}
      try {
        this._agoraVideo.stop();
        this._agoraVideo.close();
      } catch (_) {}
      this._agoraVideo = null;
    }
    if (this._localVideoStream) {
      this._localVideoStream.getTracks().forEach(t => {
        try {
          t.stop();
        } catch (_) {}
      });
      this._localVideoStream = null;
    }
    this._isVideoOn = false;
    this._unmountVideoTrack(this._myUid, true);
    await this._setVoiceState({
      hasVideo: false
    }).catch(() => {});
    this._updateCamUI();
    this._renderGrid();
    console.log('[VoiceEngine] 📷 カメラ: オフ');
  }
  async switchMicrophone(deviceId) {
    if (!deviceId) return;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: {
            exact: deviceId
          },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      const newTrack = newStream.getAudioTracks()[0];
      if (!newTrack) return;
      newTrack.enabled = !this._isMuted;
      if (this._localStream) {
        this._localStream.getAudioTracks().forEach(t => {
          try {
            t.stop();
          } catch (_) {}
        });
      }
      this._localStream = newStream;
      for (const [peerUid, {
        pc
      }] of this._peers) {
        const audioSender = pc.getSenders().find(s => s.track?.kind === 'audio');
        if (audioSender) {
          await audioSender.replaceTrack(newTrack).catch(e => console.warn('[VoiceEngine] replaceTrack(mic)失敗:', e));
        }
      }
      if (this.mode === 'agora' && this._agoraAudio) {
        if (typeof this._agoraAudio.setDevice === 'function') {
          await this._agoraAudio.setDevice(deviceId);
        }
      }
      if (this._p2pAudioContext && this._myUid) {
        this._attachP2PStreamAnalyser(this._myUid, this._localStream, true);
      }
      console.log(`[VoiceEngine] 🎙️ マイク切替成功: ${deviceId}`);
    } catch (e) {
      console.error('[VoiceEngine] switchMicrophone failed:', e);
      throw e;
    }
  }
  async switchCamera(deviceId) {
    if (!deviceId) return;
    try {
      if (!this._isVideoOn) return;
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: {
            exact: deviceId
          },
          width: {
            ideal: 1280
          },
          height: {
            ideal: 720
          },
          frameRate: {
            ideal: 30
          }
        },
        audio: false
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;
      if (this._localVideoStream) {
        this._localVideoStream.getTracks().forEach(t => {
          try {
            t.stop();
          } catch (_) {}
        });
      }
      this._localVideoStream = newStream;
      for (const [peerUid, {
        pc
      }] of this._peers) {
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newTrack).catch(e => console.warn('[VoiceEngine] replaceTrack(cam)失敗:', e));
        }
      }
      if (this.mode === 'agora' && this._agoraVideo) {
        if (typeof this._agoraVideo.setDevice === 'function') {
          await this._agoraVideo.setDevice(deviceId);
        }
      }
      this._mountVideoTrack(this._myUid, newTrack, true);
      console.log(`[VoiceEngine] 📹 カメラ切替成功: ${deviceId}`);
    } catch (e) {
      console.error('[VoiceEngine] switchCamera failed:', e);
      throw e;
    }
  }
  async switchSpeaker(deviceId) {
    if (!deviceId) return;
    for (const [peerUid, audioEl] of this._audioElements) {
      if (audioEl && typeof audioEl.setSinkId === 'function') {
        try {
          await audioEl.setSinkId(deviceId);
        } catch (e) {
          console.warn('[VoiceEngine] setSinkId failed:', e);
        }
      }
    }
  }

  // ================================================================
  // 画面共有切替（P2P + Agora 両対応）
  // ================================================================
  async toggleScreen() {
    if (this._isScreenOn) {
      await this._stopScreenShare();
    } else {
      await this._startScreenShare();
    }
  }
  async _startScreenShare() {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isPwa = Boolean(window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches);
    const hasDisplayMedia = Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function');
    if (!hasDisplayMedia || isIos && isPwa) {
      const useBackCam = await (typeof context.showCustomConfirm === 'function' ? context.showCustomConfirm('iPhoneアプリ版(PWA)ではiOSの仕様により画面キャプチャが制限されています。\n\n手元の資料や画面を映せる【外カメラ（背面カメラ）共有】で代用しますか？\n（※Safariブラウザの通常タブで開くとシステム画面共有も可能です）', '外カメラで共有', 'キャンセル') : Promise.resolve(confirm('iPhoneアプリ版(PWA)では画面キャプチャが制限されています。外カメラで共有しますか？')));
      if (useBackCam) {
        try {
          this._localScreenStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: {
                ideal: 'environment'
              }
            },
            audio: false
          });
        } catch (camErr) {
          console.warn('[VoiceEngine] Back camera share failed:', camErr);
          if (typeof context.alertMessage === 'function') context.alertMessage('外カメラの起動に失敗しました: ' + (camErr.message || ''), 'error');
          return;
        }
      } else {
        return;
      }
    } else {
      try {
        try {
          this._localScreenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false
          });
        } catch (fallbackErr) {
          this._localScreenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              frameRate: 30
            }
          });
        }
      } catch (e) {
        if (e.name !== 'NotAllowedError') {
          console.error('[VoiceEngine] 画面共有取得失敗:', e);
          if (typeof context.alertMessage === 'function') context.alertMessage('画面共有の開始に失敗しました: ' + (e.message || ''), 'error');
        }
        return;
      }
    }
    const screenTrack = this._localScreenStream.getVideoTracks()[0];
    if (!screenTrack) return;
    // 共有停止時のハンドラ（ブラウザの「共有を停止」ボタン）
    screenTrack.onended = () => {
      if (this._isScreenOn) this._stopScreenShare();
    };
    if (this.mode === 'p2p') {
      // P2P: 全ピア接続に画面トラックを追加 & 再ネゴシエーション
      for (const [peerUid, {
        pc
      }] of this._peers) {
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack).catch(e => console.warn('[VoiceEngine] P2P replaceTrack失敗:', e));
        } else {
          pc.addTrack(screenTrack, this._localScreenStream);
          await this._renegotiatePeer(peerUid);
        }
      }
      console.log('[VoiceEngine] 🖥️ P2P 画面共有開始');
    } else if (this.mode === 'agora') {
      try {
        // Agora: 取得済み MediaStreamTrack から CustomVideoTrack を作成
        if (typeof AgoraRTC !== 'undefined' && AgoraRTC.createCustomVideoTrack) {
          this._agoraScreen = AgoraRTC.createCustomVideoTrack({
            mediaStreamTrack: screenTrack
          });
        } else {
          this._agoraScreen = await AgoraRTC.createScreenVideoTrack({
            encoderConfig: '1080p_1',
            optimizationMode: 'detail'
          }, 'disable');
        }
        if (Array.isArray(this._agoraScreen)) this._agoraScreen = this._agoraScreen[0];
        await this._agoraClient.publish([this._agoraScreen]);
        console.log('[VoiceEngine] 🖥️ Agora 画面共有開始');
      } catch (e) {
        console.error('[VoiceEngine] Agora 画面共有開始失敗:', e);
        if (this._localScreenStream) {
          this._localScreenStream.getTracks().forEach(t => t.stop());
          this._localScreenStream = null;
        }
        if (typeof context.alertMessage === 'function') context.alertMessage('Agora 画面共有の開始に失敗しました', 'error');
        return;
      }
    }
    this._isScreenOn = true;
    // 自端末のタイルにもプレビューを即時マウント
    this._mountVideoTrack(this._myUid, screenTrack, true);
    await this._setVoiceState({
      hasScreen: true
    }).catch(() => {});
    this._updateScreenUI();
    console.log(`[VoiceEngine] 🖥️ 画面共有開始 (モード: ${this.mode})`);
  }
  async _stopScreenShare() {
    if (this.mode === 'p2p') {
      // P2P: 映像センダーを null にリセット & 再ネゴシエーション
      for (const [peerUid, {
        pc
      }] of this._peers) {
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(null).catch(() => {});
        }
        await this._renegotiatePeer(peerUid);
      }
    } else if (this.mode === 'agora' && this._agoraScreen) {
      try {
        await this._agoraClient.unpublish([this._agoraScreen]);
      } catch (_) {}
      try {
        this._agoraScreen.stop();
        this._agoraScreen.close();
      } catch (_) {}
      this._agoraScreen = null;
    }
    if (this._localScreenStream) {
      this._localScreenStream.getTracks().forEach(t => {
        try {
          t.stop();
        } catch (_) {}
      });
      this._localScreenStream = null;
    }
    this._isScreenOn = false;
    // 自端末プレビューも即座にアンマウント（静止画残留防止）
    this._unmountVideoTrack(this._myUid, true);
    await this._setVoiceState({
      hasScreen: false
    }).catch(() => {});
    this._updateScreenUI();
    console.log('[VoiceEngine] 🖥️ 画面共有停止');
  }

  // ================================================================
  // UI 更新
  // ================================================================
  _updateMuteUI() {
    const muted = this._isMuted;
    ['vcBarMuteIcon', 'vcGridMuteIcon', 'callMuteIcon'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = muted ? 'fas fa-microphone-slash text-xs text-rose-500' : 'fas fa-microphone text-xs';
    });
    const upMicIcon = document.getElementById('userPanelMicIcon');
    if (upMicIcon) {
      upMicIcon.className = muted ? 'fas fa-microphone text-xs text-[#da373c]' : 'fas fa-microphone text-xs';
    }
    const upMicSlash = document.getElementById('userPanelMicSlash');
    if (upMicSlash) {
      upMicSlash.classList.toggle('hidden', !muted);
      upMicSlash.style.display = muted ? 'flex' : 'none';
    }
    document.getElementById('userPanelMicBtn')?.classList.toggle('is-muted', muted);
    ['vcBarMuteBtn', 'vcGridMuteBtn', 'callMuteBtn', 'userPanelMicBtn'].forEach(id => {
      document.getElementById(id)?.classList.toggle('muted', muted);
      document.getElementById(id)?.classList.toggle('active', muted);
    });
    const pipMuteBtn = document.getElementById('callPipMuteBtn');
    if (pipMuteBtn) {
      pipMuteBtn.classList.toggle('active', muted);
      pipMuteBtn.innerHTML = muted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
    }
    const localMuteBadge = document.getElementById('localMuteBadge');
    if (localMuteBadge) localMuteBadge.classList.toggle('hidden', !muted);
  }
  _updateCamUI() {
    const on = this._isVideoOn;
    ['vcBarCamIcon', 'vcGridCamIcon'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = on ? 'fas fa-video-slash' : 'fas fa-video';
    });
    ['vcBarCamBtn', 'vcGridCamBtn', 'callVideoBtn'].forEach(id => {
      document.getElementById(id)?.classList.toggle('active', on);
    });
  }
  _updateScreenUI() {
    const on = this._isScreenOn;
    ['vcBarScreenIcon', 'vcGridScreenIcon'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = on ? 'fas fa-stop-circle' : 'fas fa-desktop';
    });
    ['vcBarScreenBtn', 'vcGridScreenBtn', 'callScreenBtn'].forEach(id => {
      document.getElementById(id)?.classList.toggle('active', on);
    });
  }
  _setChannelActive(channelId, active) {
    if (!channelId) return;
    document.querySelector(`.vc-channel-row[data-vc-id="${channelId}"]`)?.classList.toggle('active-vc', active);
  }

  // ================================================================
  // サイドバーメンバーツリー描画
  // ================================================================
  _renderMemberTree(channelId, members) {
    const treeEl = channelId ? document.getElementById(`vc-tree-${channelId}`) : null;
    if (!treeEl) return;
    if (!members || members.length === 0) {
      treeEl.innerHTML = '';
      return;
    }
    treeEl.innerHTML = members.map(m => {
      const name = m.nickname || 'ユーザー';
      const safeName = context.escapeHtml(name);
      const initial = safeName.charAt(0).toUpperCase();
      const avatarSrc = m.avatarUrl && m.avatarUrl.startsWith('http') ? m.avatarUrl : '';
      const avatarHtml = avatarSrc ? `<img src="${context.escapeHtml(avatarSrc)}" alt="${safeName}" loading="lazy" />` : `<span>${initial}</span>`;
      const muteIcon = m.isMuted ? '<i class="fas fa-microphone-slash vc-member-mute-icon"></i>' : '';
      const safeUid = context.escapeHtml(m.uid || '');
      return `<div class="vc-member-item" data-uid="${safeUid}" title="${safeName}">
        <div class="vc-member-avatar">${avatarHtml}</div>
        <span class="vc-member-name">${safeName}</span>${muteIcon}
      </div>`;
    }).join('');
  }

  // ================================================================
  // VCグリッド描画
  // ================================================================
  _renderGrid() {
    const gridBody = document.getElementById('vcGridBody');
    if (!gridBody) return;
    const states = this._voiceStates;
    const uids = Object.keys(states);
    if (uids.length === 0) {
      gridBody.innerHTML = '<div style="color:#6b7280;font-size:0.875rem;text-align:center;padding:3rem 1rem;">誰もボイスチャンネルに参加していません</div>';
      return;
    }
    const tileStyle = uids.length <= 1 ? 'width:min(320px,60vw);height:min(320px,60vw)' : uids.length <= 2 ? 'width:min(260px,44vw);height:min(260px,44vw)' : uids.length <= 4 ? 'width:min(200px,30vw);height:min(200px,30vw)' : 'width:min(150px,20vw);height:min(150px,20vw)';
    gridBody.innerHTML = uids.map(uid => {
      const m = states[uid];
      const isMe = uid === this._myUid;
      const safeName = context.escapeHtml(m.nickname || 'ユーザー');
      const initial = safeName.charAt(0).toUpperCase();
      const avatarSrc = m.avatarUrl && m.avatarUrl.startsWith('http') ? m.avatarUrl : '';
      const avatarHtml = avatarSrc ? `<img src="${context.escapeHtml(avatarSrc)}" alt="${safeName}" loading="lazy" />` : `<span>${initial}</span>`;
      const muteIcon = m.isMuted ? '<i class="fas fa-microphone-slash" style="color:#f87171;font-size:0.6rem;margin-left:2px"></i>' : '';
      const safeUid = context.escapeHtml(uid);
      return `<div class="vc-grid-tile relative group/vctile" id="vc-tile-${safeUid}" style="${tileStyle}" ${isMe ? '' : `oncontextmenu="window.covoVolumeManager.openVolumePopover('${safeUid}', '${safeName}', '${context.escapeHtml(avatarSrc)}', this, event); return false;"`}>
        <div class="vc-grid-avatar">${avatarHtml}</div>
        ${isMe ? '' : `
          <div class="absolute top-2 right-2 z-10 opacity-0 group-hover/vctile:opacity-100 transition-opacity">
            <button type="button" class="vc-tile-vol-btn" title="音量を調整 (0%〜200%)" onclick="window.covoVolumeManager.openVolumePopover('${safeUid}', '${safeName}', '${context.escapeHtml(avatarSrc)}', this, event)">
              <i class="fas fa-volume-high"></i>
            </button>
          </div>
        `}
        <div class="vc-grid-tile-name">
          <span class="vc-grid-tile-name-text">${safeName}${isMe ? ' (あなた)' : ''}</span>
          ${muteIcon}
        </div>
      </div>`;
    }).join('');

    // Agora リモートビデオをタイルにマウント
    if (this.mode === 'agora') {
      this._agoraRemote.forEach((user, uid) => {
        if (user.videoTrack) {
          const tileEl = document.getElementById(`vc-tile-${uid}`);
          if (tileEl) {
            setTimeout(() => {
              try {
                user.videoTrack.play(`vc-tile-${uid}`);
              } catch (_) {}
            }, 80);
          }
        }
      });
    }
  }

  // ================================================================
  // RTDB voiceState 書き込み + onDisconnect 設定
  // ================================================================
  async _setVoiceState(extra = {}) {
    if (!this._myUid || !this.channelId) return;
    const sId = this.serverId || 'direct';
    try {
      const rtdb = await context._getOrInitRTDB();
      const {
        ref,
        set,
        onDisconnect: rtdbOnDisconnect
      } = await import('../vendor/firebase/firebase-database.js');
      const stateRef = ref(rtdb, `voiceStates/${sId}/${this.channelId}/${this._myUid}`);
      const stateData = {
        uid: this._myUid,
        nickname: this._myNickname,
        avatarUrl: this._myAvatar,
        joinedAt: Date.now(),
        isMuted: this._isMuted,
        hasVideo: this._isVideoOn,
        hasScreen: this._isScreenOn,
        ...extra
      };
      await set(stateRef, stateData);

      // onDisconnect: ブラウザクラッシュ・ネット切断時も自動削除
      if (!this._onDisconnectRef) {
        this._onDisconnectRef = rtdbOnDisconnect(stateRef);
        await this._onDisconnectRef.remove();
        console.log('[VoiceEngine] 🔒 onDisconnect 設定完了（クラッシュ時も自動退室）');
      }
    } catch (e) {
      console.warn('[VoiceEngine] voiceState書き込みエラー:', e.message);
    }
  }

  // ================================================================
  // voiceState 削除
  // ================================================================
  async _clearVoiceState() {
    if (!this._myUid || !this.channelId) return;
    const sId = this.serverId || 'direct';
    try {
      const rtdb = await context._getOrInitRTDB();
      const {
        ref,
        remove
      } = await import('../vendor/firebase/firebase-database.js');
      if (this._onDisconnectRef) {
        try {
          await this._onDisconnectRef.cancel();
        } catch (_) {}
        this._onDisconnectRef = null;
      }
      await remove(ref(rtdb, `voiceStates/${sId}/${this.channelId}/${this._myUid}`));
    } catch (e) {
      console.warn('[VoiceEngine] voiceState削除エラー:', e.message);
    }
  }

  // 同期的削除（beforeunload 用）
  _clearVoiceStateSync() {
    if (!this._myUid || !this.serverId || !this.channelId) return;
    // Firebase SDK は navigator.sendBeacon 相当の同期削除を提供しないため、
    // onDisconnect に頼る（上で設定済み）
    // keepAlive 接続があれば onDisconnect が発火してサーバー側で削除される
  }
}
return new VoiceEngine();
}
