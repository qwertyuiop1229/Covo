
// ================================================================
// VOICE ENGINE v2 — ハイブリッド通話エンジン（完全修正版）
// ================================================================
// 修正した問題:
//  1. _getOrInitRTDB() を使用（window._rtdbModulesを廃止）
//  2. onDisconnect でブラウザクラッシュ時も voiceState を自動削除
//  3. 決定論的 Offer 方向（小さい UID 側が常に Offerer）→ 二重 Offer 防止
//  4. Audio 要素を Map で管理 → GC による無音化を防止
//  5. ICE タイムアウト 30 秒 + 自動 ICE Restart（最大 3 回）
//  6. 参加時に古いシグナリングドキュメントを削除
//  7. P2P でも画面共有 (replaceTrack)
//  8. モード切替中フラグ → 二重切替競合防止
//  9. TURN 疎通確認（TURN Health Check）
// 10. XSS 対策: data 属性 + イベント委譲（onclick 文字列挿入廃止）
// 11. voiceStates 購読の多重登録防止
// 12. Agora ボリュームインジケーターのデバウンス
// 13. サーバー離脱時に MutationObserver を切断
//
// ================================================================
// SECURITY NOTE:
// OpenRelay Project は公開認証情報を使用します（誰でも利用可能）。
// 本番環境では Metered.ca の無料 API キー取得を推奨：
//   https://dashboard.metered.ca/  → 月 50GB 無料、認証付き
//   TURN_USERNAME / TURN_CREDENTIAL を環境変数またはWorker経由で取得
// ================================================================

// --- TURN / ICE サーバー設定 ---
const VC_ICE_SERVERS = [
  // Google STUN（認証不要・無制限）
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // OpenRelay STUN
  { urls: 'stun:openrelay.metered.ca:80' },
  // OpenRelay TURN – UDP 80（ファイアウォール回避率が最も高い）
  { urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject', credential: 'openrelayproject' },
  // OpenRelay TURN – UDP 443
  { urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject', credential: 'openrelayproject' },
  // OpenRelay TURN – TCP 443（最も通りやすい・企業Firewall対応）
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject', credential: 'openrelayproject' },
  // Cloudflare STUN（追加 STUN バックアップ）
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const VC_TURN_INFO = {
  service: 'Open Relay Project (openrelay.metered.ca)',
  freeQuota: '50GB/月',
  audioOnlyMinutes: 86805,  // 50GB @ 64kbps
  videoMinutes: 1118,        // 50GB @ 500kbps
  latencyNote: 'エッジ展開済み、平均遅延 <50ms（アジアリージョン）',
  securityNote: '公開認証情報。本番では Metered.ca API キーを推奨'
};

const VC_ICE_TIMEOUT_MS = 30000; // 30秒でタイムアウト
const VC_ICE_MAX_RESTARTS = 3;
const VC_P2P_MAX_PEERS = 4;     // 4人以下はP2P

// ================================================================
class VoiceEngine {
  constructor() {
    this.mode = null;         // 'p2p' | 'agora' | null
    this.serverId = null;
    this.channelId = null;
    this.channelName = null;
    this.isActive = false;
    this._modeSwitching = false;  // 切替競合防止

    // --- Local Media ---
    this._localStream = null;      // マイク専用 MediaStream
    this._localScreenStream = null; // 画面共有専用 MediaStream

    // --- P2P ---
    this._peers = new Map();        // uid -> { pc, audioEl, iceRestarts, iceTimer }
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
    this._agoraRemote = new Map();  // uid -> AgoraUser
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
  }

  // ================================================================
  // JOIN
  // ================================================================
  async join(serverId, channelId, channelName) {
    if (this.isActive) {
      console.warn('[VoiceEngine] 既にVC参加中。退出してから再参加します。');
      await this.leave();
    }

    this.serverId = serverId;
    this.channelId = channelId;
    this.channelName = channelName;
    this.isActive = true;
    this._myUid = userId;
    this._myNickname = currentServerNickname || userNickname || 'ユーザー';
    this._myAvatar = userAvatarUrl || '';

    console.log(`[VoiceEngine] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[VoiceEngine] 🔊 VC参加: #${channelName}`);
    console.log(`[VoiceEngine] 📡 TURN: ${VC_TURN_INFO.service}`);
    console.log(`[VoiceEngine] 📦 無料枠: ${VC_TURN_INFO.freeQuota} | 音声: ~${VC_TURN_INFO.audioOnlyMinutes.toLocaleString()}分/月`);
    console.log(`[VoiceEngine] ⚡ 遅延: ${VC_TURN_INFO.latencyNote}`);
    console.log(`[VoiceEngine] 🔒 セキュリティ: ${VC_TURN_INFO.securityNote}`);
    console.log(`[VoiceEngine] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // --- マイク取得 ---
    try {
      this._localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      console.log('[VoiceEngine] ✅ マイク取得完了');
    } catch (e) {
      this.isActive = false;
      const msg = e.name === 'NotAllowedError'
        ? 'マイクへのアクセスが拒否されています。ブラウザの権限設定を確認してください。'
        : `マイクの取得に失敗しました: ${e.message}`;
      console.error('[VoiceEngine] ❌ マイクエラー:', e);
      if (typeof alertMessage === 'function') alertMessage(msg, 'error');
      return;
    }

    // --- TURN 疎通チェック（非同期・バックグラウンド） ---
    this._checkTurnConnectivity();

    // --- RTDB に voiceState を書き込み + onDisconnect 設定 ---
    await this._setVoiceState({ isMuted: false, hasVideo: false, hasScreen: false });

    // --- voiceStates を購読 ---
    this._subscribeVoiceStates();

    // --- 古いシグナリングドキュメントを掃除 ---
    this._cleanupStaleSignaling();

    // --- UI 更新 ---
    _vcShowBar(channelName);
    this._setChannelActive(channelId, true);

    // --- beforeunload でも確実にクリーンアップ ---
    window.addEventListener('beforeunload', this._boundBeforeUnload = () => {
      this._clearVoiceStateSync();
    });
  }

  // ================================================================
  // LEAVE
  // ================================================================
  async leave() {
    if (!this.isActive) return;
    const channelId = this.channelId;
    const channelName = this.channelName;
    console.log(`[VoiceEngine] 📴 VC退出: #${channelName}`);

    this.isActive = false;
    this._modeSwitching = false;

    // P2P クリーンアップ
    this._cleanupAllPeers();

    // Agora クリーンアップ
    await this._cleanupAgora();

    // ローカルストリーム停止
    this._stopLocalStreams();

    // RTDB voiceState 削除 + onDisconnect キャンセル
    await this._clearVoiceState();

    // Firestore リスナー解除
    if (this._voiceStatesUnsub) { try { this._voiceStatesUnsub(); } catch(_){} this._voiceStatesUnsub = null; }
    if (this._signalingUnsub) { try { this._signalingUnsub(); } catch(_){} this._signalingUnsub = null; }

    // 状態リセット
    this.mode = null;
    this._voiceStates = {};
    this._isMuted = false;
    this._isVideoOn = false;
    this._isScreenOn = false;
    this.serverId = this.channelId = this.channelName = null;

    // UI リセット
    _vcHideBar();
    this._setChannelActive(channelId, false);
    this._renderMemberTree(channelId, []);
    this._renderGrid();

    if (this._boundBeforeUnload) {
      window.removeEventListener('beforeunload', this._boundBeforeUnload);
      this._boundBeforeUnload = null;
    }

    console.log('[VoiceEngine] 👋 退出完了');
  }

  // ================================================================
  // TURN 疎通チェック
  // ================================================================
  async _checkTurnConnectivity() {
    try {
      const pc = new RTCPeerConnection({ iceServers: VC_ICE_SERVERS });
      pc.createDataChannel('__vc_turn_check__');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pc.close();
          reject(new Error('timeout'));
        }, 8000);

        let foundRelay = false;
        pc.onicecandidate = (e) => {
          if (e.candidate?.type === 'relay') {
            foundRelay = true;
            clearTimeout(timeout);
            pc.close();
            resolve();
          }
          if (e.candidate === null && !foundRelay) {
            clearTimeout(timeout);
            pc.close();
            reject(new Error('no relay candidate'));
          }
        };
      });

      console.log('[VoiceEngine] ✅ TURN 疎通確認: openrelay.metered.ca 接続可能');
    } catch (e) {
      console.warn(`[VoiceEngine] ⚠️ TURN 疎通チェック失敗: ${e.message}`);
      console.warn('[VoiceEngine]   → P2P直接接続（STUN）にフォールバックします');
      console.warn('[VoiceEngine]   → 対称型NATの場合、接続できない可能性があります');
    }
  }

  // ================================================================
  // voiceStates RTDB 購読
  // ================================================================
  _subscribeVoiceStates() {
    if (this._voiceStatesUnsub) {
      try { this._voiceStatesUnsub(); } catch(_){}
      this._voiceStatesUnsub = null;
    }

    _getOrInitRTDB().then(rtdb => {
      if (!this.isActive) return;
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js').then(({ ref, onValue, off }) => {
        if (!this.isActive) return;
        const stateRef = ref(rtdb, `voiceStates/${this.serverId}/${this.channelId}`);

        const handler = (snapshot) => {
          if (!this.isActive) return;
          const data = snapshot.val() || {};
          this._voiceStates = data;
          const count = Object.keys(data).length;

          console.log(`[VoiceEngine] 👥 参加者: ${count}人 | モード: ${this.mode || '初期化中'}`);

          // サイドバーと グリッドを更新
          this._renderMemberTree(this.channelId, Object.values(data));
          this._renderGrid();

          const countEl = document.getElementById('vcGridParticipantCount');
          if (countEl) countEl.textContent = `${count}人`;

          // ハイブリッド切替判定（切替中は無視）
          if (!this._modeSwitching) {
            if (count <= VC_P2P_MAX_PEERS && this.mode !== 'p2p') {
              console.log(`[VoiceEngine] 🔵 P2P モードへ切替 (${count}人)`);
              this._switchToP2P(data);
            } else if (count > VC_P2P_MAX_PEERS && this.mode !== 'agora') {
              console.log(`[VoiceEngine] ⚠️ 参加者 ${count}人 → Agora SFU へ自動切替`);
              this._switchToAgora();
            }
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
  // P2P モード切替
  // ================================================================
  async _switchToP2P(currentStates) {
    if (this._modeSwitching) return;
    this._modeSwitching = true;

    if (this.mode === 'agora') {
      console.log('[VoiceEngine] 🔄 Agora → P2P 切替中...');
      await this._cleanupAgora();
    }

    this.mode = 'p2p';
    this._modeSwitching = false;

    console.log('[VoiceEngine] 🔵 P2P + OpenRelay TURN モード');
    console.log(`[VoiceEngine] 📡 ICE Servers: STUN(Google) + STUN(OpenRelay) + TURN(UDP80/UDP443/TCP443)`);

    // 既存ピア接続をクリーンアップしてから再構築
    this._cleanupAllPeers();

    // 決定論的 Offer 方向：
    //   自分のUIDが相手より「小さい（辞書順）」場合に自分がOfferer
    //   これにより両端が同時にOfferを送るグリッチを防止
    const others = Object.keys(currentStates).filter(uid => uid !== this._myUid);
    for (const peerUid of others) {
      const iAmOfferer = this._myUid < peerUid;
      if (iAmOfferer) {
        await this._createOffer(peerUid).catch(e =>
          console.error(`[VoiceEngine] Offer作成失敗 (${peerUid.slice(0,8)}):`, e)
        );
      }
      // iAmOfferer=false の場合は相手からのOfferを待つ（_setupSignalingListener で処理）
    }

    // シグナリングリスナーを（再）設定
    this._setupSignalingListener();
  }

  // ================================================================
  // P2P Offer 作成
  // ================================================================
  async _createOffer(peerUid) {
    const peerInfo = this._createPeerConnection(peerUid);
    const { pc } = peerInfo;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await this._sendSignal(peerUid, { type: 'offer', sdp: offer.sdp });
    console.log(`[VoiceEngine] 📤 Offer → ${peerUid.slice(0,8)} (ICE: UDP80/443 + TCP443)`);
  }

  // ================================================================
  // RTCPeerConnection 生成（共通）
  // ================================================================
  _createPeerConnection(peerUid) {
    // 既存があれば閉じる
    const existing = this._peers.get(peerUid);
    if (existing) {
      try { existing.pc.close(); } catch(_){}
    }

    const pc = new RTCPeerConnection({
      iceServers: VC_ICE_SERVERS,
      iceTransportPolicy: 'all',   // まず直接接続を試み、失敗したらTURN
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    const peerInfo = { pc, iceRestarts: 0, iceTimer: null };
    this._peers.set(peerUid, peerInfo);

    // ローカルトラックを追加
    if (this._localStream) {
      this._localStream.getTracks().forEach(track => {
        pc.addTrack(track, this._localStream);
      });
    }
    // 画面共有中なら画面トラックも追加
    if (this._localScreenStream && this._isScreenOn) {
      this._localScreenStream.getTracks().forEach(track => {
        pc.addTrack(track, this._localScreenStream);
      });
    }

    // リモートトラック受信（Audio GC防止: Map に格納）
    pc.ontrack = (e) => {
      if (e.track.kind === 'audio') {
        let audioEl = this._audioElements.get(peerUid);
        if (!audioEl) {
          audioEl = new Audio();
          audioEl.autoplay = true;
          // DOM に追加して GC を確実に防止
          audioEl.style.display = 'none';
          document.body.appendChild(audioEl);
          this._audioElements.set(peerUid, audioEl);
        }
        audioEl.srcObject = e.streams[0];
        audioEl.play().catch(() => {});
        console.log(`[VoiceEngine] 🔈 音声受信: ${peerUid.slice(0,8)}`);
      }
      if (e.track.kind === 'video') {
        // P2P ビデオは将来拡張
        console.log(`[VoiceEngine] 📹 映像受信: ${peerUid.slice(0,8)}`);
      }
    };

    // ICE 候補
    pc.onicecandidate = (e) => {
      if (!this.isActive) return;
      if (e.candidate) {
        this._sendSignal(peerUid, { type: 'candidate', candidate: e.candidate.toJSON() })
          .catch(() => {});
      }
    };

    // ICE 接続状態
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[VoiceEngine] ICE (${peerUid.slice(0,8)}): ${state}`);

      if (peerInfo.iceTimer) { clearTimeout(peerInfo.iceTimer); peerInfo.iceTimer = null; }

      if (state === 'checking') {
        // 30秒タイムアウト
        peerInfo.iceTimer = setTimeout(() => {
          if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
            console.warn(`[VoiceEngine] ⏱ ICEタイムアウト (${peerUid.slice(0,8)}) → リスタート`);
            this._iceRestart(peerUid);
          }
        }, VC_ICE_TIMEOUT_MS);
      }

      if (state === 'connected' || state === 'completed') {
        peerInfo.iceRestarts = 0;
        // どのパス（relay/直接）を使っているかをログ出力
        pc.getStats().then(stats => {
          stats.forEach(r => {
            if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) {
              const localId = r.localCandidateId;
              stats.forEach(lr => {
                if (lr.id === localId) {
                  const via = lr.candidateType === 'relay'
                    ? `TURN relay (${lr.relayProtocol || '?'} @ ${lr.ip || lr.address || 'openrelay.metered.ca'})`
                    : `直接 P2P (${lr.candidateType})`;
                  console.log(`[VoiceEngine] ✅ ${peerUid.slice(0,8)}: ${via}`);
                }
              });
            }
          });
        }).catch(() => {});
      }

      if (state === 'failed') {
        console.warn(`[VoiceEngine] ❌ ICE失敗 (${peerUid.slice(0,8)}) → ICE Restart`);
        this._iceRestart(peerUid);
      }

      if (state === 'disconnected') {
        // 5秒待って回復しなければリスタート
        peerInfo.iceTimer = setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') {
            console.warn(`[VoiceEngine] 🔌 切断検知 (${peerUid.slice(0,8)}) → ICE Restart`);
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

    if (peerInfo.iceRestarts >= VC_ICE_MAX_RESTARTS) {
      console.error(`[VoiceEngine] ❌ ICE Restart 上限 (${peerUid.slice(0,8)}) → ピア除去`);
      this._removePeer(peerUid);
      return;
    }

    peerInfo.iceRestarts++;
    console.log(`[VoiceEngine] 🔄 ICE Restart ${peerInfo.iceRestarts}/${VC_ICE_MAX_RESTARTS} (${peerUid.slice(0,8)})`);

    const { pc } = peerInfo;
    const iAmOfferer = this._myUid < peerUid;
    if (iAmOfferer) {
      try {
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        await this._sendSignal(peerUid, { type: 'offer', sdp: offer.sdp });
      } catch(e) {
        console.error('[VoiceEngine] ICE Restart Offer失敗:', e);
      }
    }
  }

  // ================================================================
  // ピア削除
  // ================================================================
  _removePeer(peerUid) {
    const peerInfo = this._peers.get(peerUid);
    if (peerInfo) {
      if (peerInfo.iceTimer) clearTimeout(peerInfo.iceTimer);
      try { peerInfo.pc.close(); } catch(_){}
      this._peers.delete(peerUid);
    }
    // Audio 要素をDOMから除去
    const audioEl = this._audioElements.get(peerUid);
    if (audioEl) {
      try { audioEl.srcObject = null; audioEl.remove(); } catch(_){}
      this._audioElements.delete(peerUid);
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
      // ドキュメントIDに特殊文字が入らないよう両端のUIDのみ使用
      const docId = [this._myUid, targetUid].sort().join('_') +
        '_' + (this.channelId || '').replace(/[^a-zA-Z0-9]/g, '');
      const sigRef = doc(db, `artifacts/${appId}/vc_signaling/${docId}_${payload.type}`);
      await setDoc(sigRef, {
        ...payload,
        fromUid: this._myUid,
        toUid: targetUid,
        channelId: this.channelId,
        at: Date.now()
      });
    } catch(e) {
      console.warn('[VoiceEngine] シグナリング送信エラー:', e.code || e.message);
    }
  }

  // ================================================================
  // Firestore シグナリング受信リスナー
  // ================================================================
  _setupSignalingListener() {
    if (this._signalingUnsub) { try { this._signalingUnsub(); } catch(_){} }

    const sigQuery = query(
      collection(db, `artifacts/${appId}/vc_signaling`),
      where('toUid', '==', this._myUid),
      where('channelId', '==', this.channelId)
    );

    this._signalingUnsub = onSnapshot(sigQuery, async (snap) => {
      for (const change of snap.docChanges()) {
        if (!['added', 'modified'].includes(change.type)) continue;
        const data = change.doc.data();
        if (!data || data.toUid !== this._myUid || !this.isActive) continue;

        const fromUid = data.fromUid;
        if (!fromUid || fromUid === this._myUid) continue;

        try {
          if (data.type === 'offer') {
            await this._handleOffer(fromUid, data);
          } else if (data.type === 'answer') {
            const peerInfo = this._peers.get(fromUid);
            if (peerInfo && peerInfo.pc.signalingState !== 'stable') {
              await peerInfo.pc.setRemoteDescription(
                new RTCSessionDescription({ type: 'answer', sdp: data.sdp })
              );
              console.log(`[VoiceEngine] 📥 Answer受信 from ${fromUid.slice(0,8)}`);
            }
          } else if (data.type === 'candidate') {
            const peerInfo = this._peers.get(fromUid);
            if (peerInfo && data.candidate) {
              try {
                await peerInfo.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch(e) {
                // 無効な候補は無視（signalingState不一致など）
              }
            }
          }
        } catch(e) {
          console.error('[VoiceEngine] シグナリング処理エラー:', e);
        }

        // 処理済みドキュメントを削除
        try { await deleteDoc(change.doc.ref); } catch(_){}
      }
    }, (e) => {
      console.error('[VoiceEngine] シグナリングリスナーエラー:', e.code, e.message);
      if (e.code === 'permission-denied') {
        console.error('[VoiceEngine] → firestore.rules の vc_signaling ルールを確認してください');
      }
      if (e.code === 'failed-precondition') {
        console.error('[VoiceEngine] → Firestore インデックスが不足しています。Firebase Console で以下のインデックスを作成:');
        console.error('  コレクション: vc_signaling, フィールド: toUid (昇順), channelId (昇順)');
      }
    });
  }

  // ================================================================
  // Offer 受信処理（Answerer 側）
  // ================================================================
  async _handleOffer(fromUid, data) {
    let peerInfo = this._peers.get(fromUid);
    if (!peerInfo) {
      peerInfo = this._createPeerConnection(fromUid);
    } else if (peerInfo.pc.signalingState === 'have-local-offer') {
      // Glare（両端がOfferを同時送信）: 決定論的ルールで解決
      // 自分のUIDが大きい場合は自分がAnswererになる（相手のOfferを優先）
      if (this._myUid > fromUid) {
        console.log(`[VoiceEngine] Glare検知: ${fromUid.slice(0,8)}のOfferを優先`);
        peerInfo.pc.close();
        peerInfo = this._createPeerConnection(fromUid);
      } else {
        return; // 自分がOfferer、相手のOfferは無視
      }
    }

    try {
      await peerInfo.pc.setRemoteDescription(
        new RTCSessionDescription({ type: 'offer', sdp: data.sdp })
      );
      const answer = await peerInfo.pc.createAnswer();
      await peerInfo.pc.setLocalDescription(answer);
      await this._sendSignal(fromUid, { type: 'answer', sdp: answer.sdp });
      console.log(`[VoiceEngine] 📥 Offer受信 → Answer送信 to ${fromUid.slice(0,8)}`);
    } catch(e) {
      console.error('[VoiceEngine] Answer作成失敗:', e);
    }
  }

  // ================================================================
  // 古いシグナリングドキュメントを掃除
  // ================================================================
  async _cleanupStaleSignaling() {
    try {
      // 自分宛の古いシグナリングを削除
      const snap = await getDocs(
        query(
          collection(db, `artifacts/${appId}/vc_signaling`),
          where('toUid', '==', this._myUid)
        )
      );
      const deletes = snap.docs.map(d => deleteDoc(d.ref));
      await Promise.allSettled(deletes);
      if (snap.docs.length > 0) {
        console.log(`[VoiceEngine] 🧹 古いシグナリング ${snap.docs.length}件 を削除`);
      }
    } catch(e) {
      // 無視（クリーンアップ失敗は致命的ではない）
    }
  }

  // ================================================================
  // Agora SFU モード切替
  // ================================================================
  async _switchToAgora() {
    if (this._modeSwitching) return;
    this._modeSwitching = true;

    if (this.mode === 'p2p') {
      console.log('[VoiceEngine] 🔄 P2P → Agora SFU 切替中...');
      this._cleanupAllPeers();
      if (this._signalingUnsub) { try { this._signalingUnsub(); } catch(_){} this._signalingUnsub = null; }
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
        tokenData = await fetchAgoraToken(agoraChannel, this._myUid);
      } catch(e) {
        if (e.message === 'agoraNotConfigured') {
          console.error('[VoiceEngine] ❌ Agora トークン未設定。Worker の AGORA_APP_ID を確認してください。');
        } else {
          console.error('[VoiceEngine] ❌ Agora トークン取得失敗:', e.message);
        }
        throw e;
      }

      this._agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

      // イベントハンドラ設定
      this._agoraClient.on('user-published', async (user, mediaType) => {
        await this._agoraClient.subscribe(user, mediaType).catch(e =>
          console.warn('[VoiceEngine] Agora subscribe失敗:', e)
        );
        if (mediaType === 'audio' && user.audioTrack) {
          user.audioTrack.play();
        }
        if (mediaType === 'video' && user.videoTrack) {
          this._agoraRemote.set(String(user.uid), user);
          this._renderGrid();
        }
        this._agoraRemote.set(String(user.uid), user);
      });

      this._agoraClient.on('user-unpublished', (user, mediaType) => {
        if (mediaType === 'video') this._renderGrid();
      });

      this._agoraClient.on('user-left', (user) => {
        this._agoraRemote.delete(String(user.uid));
        this._renderGrid();
      });

      // ボリュームインジケーター（デバウンス100ms）
      this._agoraClient.enableAudioVolumeIndicator();
      this._agoraClient.on('volume-indicator', (volumes) => {
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

      // チャンネル参加
      await this._agoraClient.join(tokenData.appId, agoraChannel, tokenData.token, this._myUid);

      // マイクトラック公開
      this._agoraAudio = await AgoraRTC.createMicrophoneAudioTrack({
        AEC: true, ANS: true, AGC: true
      });
      if (this._isMuted) await this._agoraAudio.setEnabled(false);
      await this._agoraClient.publish([this._agoraAudio]);

      console.log('[VoiceEngine] ✅ Agora SFU 接続完了');
    } catch(e) {
      console.error('[VoiceEngine] ❌ Agora接続失敗:', e.message || e);
      if (typeof alertMessage === 'function') {
        alertMessage('Agora SFU 接続に失敗しました。P2P モードを継続します。', 'warning');
      }
      this.mode = 'p2p';
      this._modeSwitching = false;
      this._switchToP2P(this._voiceStates);
      return;
    }

    this._modeSwitching = false;
  }

  // ================================================================
  // Agora クリーンアップ
  // ================================================================
  async _cleanupAgora() {
    if (this._agoraVolumeDebounceTimer) { clearTimeout(this._agoraVolumeDebounceTimer); this._agoraVolumeDebounceTimer = null; }
    for (const track of [this._agoraAudio, this._agoraVideo, this._agoraScreen]) {
      if (track) try { track.stop(); track.close(); } catch(_){}
    }
    this._agoraAudio = this._agoraVideo = this._agoraScreen = null;
    if (this._agoraClient) {
      try { await this._agoraClient.leave(); } catch(_){}
      this._agoraClient = null;
    }
    this._agoraRemote.clear();
  }

  // ================================================================
  // ローカルストリーム停止
  // ================================================================
  _stopLocalStreams() {
    if (this._localStream) {
      this._localStream.getTracks().forEach(t => { try { t.stop(); } catch(_){} });
      this._localStream = null;
    }
    if (this._localScreenStream) {
      this._localScreenStream.getTracks().forEach(t => { try { t.stop(); } catch(_){} });
      this._localScreenStream = null;
    }
  }

  // ================================================================
  // ミュート切替
  // ================================================================
  async toggleMute() {
    this._isMuted = !this._isMuted;

    // P2P: ローカルストリームのオーディオトラックを有効/無効
    if (this._localStream) {
      this._localStream.getAudioTracks().forEach(t => { t.enabled = !this._isMuted; });
    }
    // Agora: SDK の setEnabled を使用
    if (this.mode === 'agora' && this._agoraAudio) {
      await this._agoraAudio.setEnabled(!this._isMuted).catch(e =>
        console.warn('[VoiceEngine] Agora mute失敗:', e)
      );
    }

    await this._setVoiceState({ isMuted: this._isMuted }).catch(() => {});
    this._updateMuteUI();
    console.log(`[VoiceEngine] 🎤 マイク: ${this._isMuted ? 'ミュート' : 'オン'}`);
  }

  // ================================================================
  // カメラ切替（Agora のみ / P2P は将来実装）
  // ================================================================
  async toggleCamera() {
    if (this.mode === 'p2p') {
      if (typeof alertMessage === 'function') {
        alertMessage('📷 カメラは Agora モード（5人以上）でご利用いただけます', 'info');
      }
      return;
    }
    if (!this._agoraClient) return;

    if (this._isVideoOn) {
      if (this._agoraVideo) {
        try { await this._agoraClient.unpublish([this._agoraVideo]); } catch(_){}
        try { this._agoraVideo.stop(); this._agoraVideo.close(); } catch(_){}
        this._agoraVideo = null;
      }
      this._isVideoOn = false;
    } else {
      try {
        this._agoraVideo = await AgoraRTC.createCameraVideoTrack({ encoderConfig: '720p_1' });
        await this._agoraClient.publish([this._agoraVideo]);
        this._isVideoOn = true;
      } catch(e) {
        console.error('[VoiceEngine] カメラ開始失敗:', e);
        if (typeof alertMessage === 'function') alertMessage('カメラの起動に失敗しました', 'error');
        return;
      }
    }

    await this._setVoiceState({ hasVideo: this._isVideoOn }).catch(() => {});
    this._updateCamUI();
    this._renderGrid();
    console.log(`[VoiceEngine] 📷 カメラ: ${this._isVideoOn ? 'オン' : 'オフ'}`);
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
    try {
      // ブラウザのネイティブ画面選択ダイアログ
      this._localScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor', frameRate: 30 },
        audio: false
      });
    } catch(e) {
      if (e.name !== 'NotAllowedError') {
        console.error('[VoiceEngine] 画面共有取得失敗:', e);
        if (typeof alertMessage === 'function') alertMessage('画面共有の開始に失敗しました', 'error');
      }
      return;
    }

    const screenTrack = this._localScreenStream.getVideoTracks()[0];
    if (!screenTrack) return;

    // 共有停止時のハンドラ（ブラウザの「共有を停止」ボタン）
    screenTrack.onended = () => {
      if (this._isScreenOn) this._stopScreenShare();
    };

    if (this.mode === 'p2p') {
      // P2P: 全ピア接続に画面トラックを replaceTrack で追加
      for (const [, { pc }] of this._peers) {
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack).catch(e =>
            console.warn('[VoiceEngine] P2P replaceTrack失敗:', e)
          );
        } else {
          pc.addTrack(screenTrack, this._localScreenStream);
        }
      }
      console.log('[VoiceEngine] 🖥️ P2P 画面共有開始（replaceTrack）');
    } else if (this.mode === 'agora') {
      try {
        // Agora: createScreenVideoTrack を使用して publish
        this._agoraScreen = await AgoraRTC.createScreenVideoTrack(
          { encoderConfig: '1080p_1', optimizationMode: 'detail' },
          'disable' // 音声は別途マイクで
        );
        if (Array.isArray(this._agoraScreen)) this._agoraScreen = this._agoraScreen[0];
        await this._agoraClient.publish([this._agoraScreen]);
        console.log('[VoiceEngine] 🖥️ Agora 画面共有開始');
      } catch(e) {
        console.error('[VoiceEngine] Agora 画面共有開始失敗:', e);
        this._localScreenStream.getTracks().forEach(t => t.stop());
        this._localScreenStream = null;
        if (typeof alertMessage === 'function') alertMessage('Agora 画面共有の開始に失敗しました', 'error');
        return;
      }
    }

    this._isScreenOn = true;
    await this._setVoiceState({ hasScreen: true }).catch(() => {});
    this._updateScreenUI();
    console.log(`[VoiceEngine] 🖥️ 画面共有開始 (モード: ${this.mode})`);
  }

  async _stopScreenShare() {
    if (this.mode === 'p2p') {
      // P2P: 映像センダーを null にリセット
      for (const [, { pc }] of this._peers) {
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(null).catch(() => {});
        }
      }
    } else if (this.mode === 'agora' && this._agoraScreen) {
      try { await this._agoraClient.unpublish([this._agoraScreen]); } catch(_){}
      try { this._agoraScreen.stop(); this._agoraScreen.close(); } catch(_){}
      this._agoraScreen = null;
    }

    if (this._localScreenStream) {
      this._localScreenStream.getTracks().forEach(t => { try { t.stop(); } catch(_){} });
      this._localScreenStream = null;
    }

    this._isScreenOn = false;
    await this._setVoiceState({ hasScreen: false }).catch(() => {});
    this._updateScreenUI();
    console.log('[VoiceEngine] 🖥️ 画面共有停止');
  }

  // ================================================================
  // UI 更新
  // ================================================================
  _updateMuteUI() {
    const muted = this._isMuted;
    ['vcBarMuteIcon','vcGridMuteIcon'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = muted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
    });
    ['vcBarMuteBtn','vcGridMuteBtn'].forEach(id => {
      document.getElementById(id)?.classList.toggle('muted', muted);
    });
  }

  _updateCamUI() {
    const on = this._isVideoOn;
    ['vcBarCamIcon','vcGridCamIcon'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = on ? 'fas fa-video-slash' : 'fas fa-video';
    });
    ['vcBarCamBtn','vcGridCamBtn'].forEach(id => {
      document.getElementById(id)?.classList.toggle('active', on);
    });
  }

  _updateScreenUI() {
    const on = this._isScreenOn;
    ['vcBarScreenIcon','vcGridScreenIcon'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = on ? 'fas fa-stop-circle' : 'fas fa-desktop';
    });
    ['vcBarScreenBtn','vcGridScreenBtn'].forEach(id => {
      document.getElementById(id)?.classList.toggle('active', on);
    });
  }

  _setChannelActive(channelId, active) {
    if (!channelId) return;
    document.querySelector(`.vc-channel-row[data-vc-id="${channelId}"]`)
      ?.classList.toggle('active-vc', active);
  }

  // ================================================================
  // サイドバーメンバーツリー描画
  // ================================================================
  _renderMemberTree(channelId, members) {
    const treeEl = channelId ? document.getElementById(`vc-tree-${channelId}`) : null;
    if (!treeEl) return;
    if (!members || members.length === 0) { treeEl.innerHTML = ''; return; }

    treeEl.innerHTML = members.map(m => {
      const name = m.nickname || 'ユーザー';
      const safeName = escapeHtml(name);
      const initial = safeName.charAt(0).toUpperCase();
      const avatarSrc = m.avatarUrl && m.avatarUrl.startsWith('http') ? m.avatarUrl : '';
      const avatarHtml = avatarSrc
        ? `<img src="${escapeHtml(avatarSrc)}" alt="${safeName}" loading="lazy" />`
        : `<span>${initial}</span>`;
      const muteIcon = m.isMuted ? '<i class="fas fa-microphone-slash vc-member-mute-icon"></i>' : '';
      const safeUid = escapeHtml(m.uid || '');

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

    const tileStyle = uids.length <= 1 ? 'width:min(320px,60vw);height:min(320px,60vw)'
      : uids.length <= 2 ? 'width:min(260px,44vw);height:min(260px,44vw)'
      : uids.length <= 4 ? 'width:min(200px,30vw);height:min(200px,30vw)'
      : 'width:min(150px,20vw);height:min(150px,20vw)';

    gridBody.innerHTML = uids.map(uid => {
      const m = states[uid];
      const isMe = uid === this._myUid;
      const safeName = escapeHtml(m.nickname || 'ユーザー');
      const initial = safeName.charAt(0).toUpperCase();
      const avatarSrc = m.avatarUrl && m.avatarUrl.startsWith('http') ? m.avatarUrl : '';
      const avatarHtml = avatarSrc
        ? `<img src="${escapeHtml(avatarSrc)}" alt="${safeName}" loading="lazy" />`
        : `<span>${initial}</span>`;
      const muteIcon = m.isMuted ? '<i class="fas fa-microphone-slash" style="color:#f87171;font-size:0.6rem;margin-left:2px"></i>' : '';
      const safeUid = escapeHtml(uid);

      return `<div class="vc-grid-tile" id="vc-tile-${safeUid}" style="${tileStyle}">
        <div class="vc-grid-avatar">${avatarHtml}</div>
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
              try { user.videoTrack.play(`vc-tile-${uid}`); } catch(_){}
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
    if (!this._myUid || !this.serverId || !this.channelId) return;
    try {
      const rtdb = await _getOrInitRTDB();
      const { ref, set, onDisconnect: rtdbOnDisconnect } =
        await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');

      const stateRef = ref(rtdb, `voiceStates/${this.serverId}/${this.channelId}/${this._myUid}`);
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
    } catch(e) {
      console.warn('[VoiceEngine] voiceState書き込みエラー:', e.message);
    }
  }

  // ================================================================
  // voiceState 削除
  // ================================================================
  async _clearVoiceState() {
    if (!this._myUid || !this.serverId || !this.channelId) return;
    try {
      const rtdb = await _getOrInitRTDB();
      const { ref, remove } =
        await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');

      if (this._onDisconnectRef) {
        try { await this._onDisconnectRef.cancel(); } catch(_){}
        this._onDisconnectRef = null;
      }
      await remove(ref(rtdb, `voiceStates/${this.serverId}/${this.channelId}/${this._myUid}`));
    } catch(e) {
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

// ================================================================
// グローバルインスタンス
// ================================================================
window._voiceEngine = new VoiceEngine();

// ================================================================
// グローバル操作関数
// ================================================================
window.joinVoiceChannel = async function(channelId, channelName) {
  if (!currentServerId) {
    if (typeof alertMessage === 'function') alertMessage('サーバーに参加していません', 'error');
    return;
  }
  if (window._voiceEngine.isActive) {
    if (window._voiceEngine.channelId === channelId) {
      // 同じVCを再クリックした場合はグリッドを開く
      _vcOpenGrid();
      return;
    }
    // 別のVCへ移動
    await window._voiceEngine.leave();
  }
  await window._voiceEngine.join(currentServerId, channelId, channelName);
};

window.leaveVoiceChannel = async function() {
  await window._voiceEngine.leave();
};

window.vcToggleMute = async function() {
  if (!window._voiceEngine.isActive) return;
  await window._voiceEngine.toggleMute();
};

window.vcToggleCamera = async function() {
  if (!window._voiceEngine.isActive) return;
  await window._voiceEngine.toggleCamera();
};

window.vcToggleScreen = async function() {
  if (!window._voiceEngine.isActive) return;
  await window._voiceEngine.toggleScreen();
};

window.vcOpenGrid = _vcOpenGrid;
function _vcOpenGrid() {
  const overlay = document.getElementById('vcGridOverlay');
  if (!overlay) return;
  const isHidden = overlay.classList.contains('hidden');
  overlay.classList.toggle('hidden', !isHidden);
  if (isHidden) {
    // グリッドを開く
    const nameEl = document.getElementById('vcGridChannelName');
    if (nameEl && window._voiceEngine.channelName) nameEl.textContent = window._voiceEngine.channelName;
    window._voiceEngine._renderGrid();
  }
}

// ================================================================
// VCバー表示/非表示
// ================================================================
function _vcShowBar(channelName) {
  const bar = document.getElementById('vcConnectionBar');
  const nameEl = document.getElementById('vcBarChannelName');
  if (bar) bar.classList.remove('hidden');
  if (nameEl) nameEl.textContent = channelName || 'ボイスチャンネル';
}

function _vcHideBar() {
  document.getElementById('vcConnectionBar')?.classList.add('hidden');
  document.getElementById('vcGridOverlay')?.classList.add('hidden');
}

// ================================================================
// チャンネルタイプ選択（サーバー設定モーダル）
// ================================================================
window.selectChannelType = function(type) {
  const input = document.getElementById('newRoomTypeInput');
  if (input) input.value = type;
  document.querySelectorAll('.channel-type-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.type === type);
  });
};

// ================================================================
// サイドバーVC状態購読（サーバー入室時に呼ばれる）
// ================================================================
window._subscribeVcSidebarStates = function(serverId) {
  // 既存の購読を解除
  if (window._vcSidebarUnsub) {
    try { window._vcSidebarUnsub(); } catch(_){}
    window._vcSidebarUnsub = null;
  }
  if (!serverId) return;

  _getOrInitRTDB().then(rtdb => {
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js').then(({ ref, onValue, off }) => {
      const serverStateRef = ref(rtdb, `voiceStates/${serverId}`);
      const handler = (snapshot) => {
        const allStates = snapshot.val() || {};
        Object.entries(allStates).forEach(([channelId, members]) => {
          const treeEl = document.getElementById(`vc-tree-${channelId}`);
          if (!treeEl) return;

          const memberList = Object.values(members || {});
          window._voiceEngine._renderMemberTree(channelId, memberList);

          // 参加者数バッジ更新
          const row = document.querySelector(`.vc-channel-row[data-vc-id="${channelId}"]`);
          if (row) {
            let badge = row.querySelector('.vc-member-count-badge');
            if (memberList.length > 0) {
              if (!badge) {
                badge = document.createElement('span');
                badge.className = 'vc-member-count-badge';
                row.appendChild(badge);
              }
              badge.textContent = memberList.length;
            } else if (badge) {
              badge.remove();
            }
          }
        });

        // 空になったVCのツリーもクリア
        document.querySelectorAll('.vc-member-tree').forEach(tree => {
          const chId = tree.id.replace('vc-tree-', '');
          if (!allStates[chId] || Object.keys(allStates[chId]).length === 0) {
            tree.innerHTML = '';
            const row = document.querySelector(`.vc-channel-row[data-vc-id="${chId}"]`);
            row?.querySelector('.vc-member-count-badge')?.remove();
          }
        });
      };

      onValue(serverStateRef, handler);
      window._vcSidebarUnsub = () => off(serverStateRef, 'value', handler);
    });
  }).catch(e => {
    console.error('[VoiceEngine] サイドバー状態購読失敗:', e);
  });
};

// ================================================================
// ルームリストのVC表示パッチ（MutationObserver）
// ================================================================
(function _initVcRoomPatch() {
  function _patchVcRooms() {
    const roomList = document.getElementById('roomList');
    if (!roomList) return;

    // サーバー切替時に既存Observerを切断
    if (window._vcRoomListObserver) {
      window._vcRoomListObserver.disconnect();
    }

    const observer = new MutationObserver(() => {
      roomList.querySelectorAll('.room-item-animate').forEach(el => {
        const roomId = el.id?.replace('room-item-', '');
        if (!roomId || el.classList.contains('vc-channel-item')) return;
        if (el.dataset.channelType !== 'voice') return;

        // XSS対策: テキストはinnerText、onclick属性でなくdata属性 + イベント委譲
        const name = el.querySelector('.truncate')?.textContent || '';
        const vcEl = document.createElement('div');
        vcEl.className = 'vc-channel-item';
        vcEl.id = `room-item-${roomId}`;

        const row = document.createElement('div');
        const isActive = window._voiceEngine.isActive && window._voiceEngine.channelId === roomId;
        row.className = `vc-channel-row${isActive ? ' active-vc' : ''}`;
        row.dataset.vcId = roomId;

        const icon = document.createElement('i');
        icon.className = 'fas fa-volume-up vc-channel-icon';
        row.appendChild(icon);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'vc-channel-name';
        nameSpan.textContent = name;
        row.appendChild(nameSpan);

        const joinBtn = document.createElement('button');
        joinBtn.className = 'vc-join-btn';
        joinBtn.title = '参加';
        joinBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i>';
        joinBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.joinVoiceChannel(roomId, name);
        });
        row.appendChild(joinBtn);

        row.addEventListener('click', () => window.joinVoiceChannel(roomId, name));

        const tree = document.createElement('div');
        tree.className = 'vc-member-tree';
        tree.id = `vc-tree-${roomId}`;

        vcEl.appendChild(row);
        vcEl.appendChild(tree);
        el.replaceWith(vcEl);
      });
    });

    observer.observe(roomList, { childList: true, subtree: true });
    window._vcRoomListObserver = observer;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _patchVcRooms);
  } else {
    _patchVcRooms();
  }
})();
