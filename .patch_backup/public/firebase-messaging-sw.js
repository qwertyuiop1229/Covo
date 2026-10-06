importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyDxGdHwHnJYhBErKcQHZs0H9JpwcSN-huY",
  authDomain: "simplechat-65a0d.firebaseapp.com",
  projectId: "simplechat-65a0d",
  storageBucket: "simplechat-65a0d.firebasestorage.app",
  messagingSenderId: "611067360180",
  appId: "1:611067360180:web:5c43144af3ccc4988878e1"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ─── SW内キャッシュ ───────────────────────────────────────────
// メインスクリプトから postMessage で受け取る
self._cachedUserId  = null;
self._cachedAppId   = null;
self._cachedIdToken = null; // Offlineビーコン送信用（iOS対策）
self._badgeCount    = 0;    // アプリアイコンバッジの未読カウント
self._notifEnabled  = true; // 通知トグル状態

// 重複通知防止キャッシュ (iOS PWA多重受信防止)
const _recentNotifs = new Map();
function _isDuplicate(key) {
  const now = Date.now();
  for (const [k, time] of _recentNotifs.entries()) {
    if (now - time > 15000) _recentNotifs.delete(k);
  }
  if (_recentNotifs.has(key)) return true;
  _recentNotifs.set(key, now);
  return false;
}

// ─── postMessage受信 ────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (!event.data) return;

  switch (event.data.type) {
    case 'SET_NOTIF_ENABLED':
      self._notifEnabled = event.data.enabled !== false;
      console.log('⚙️ [バックグラウンド] 通知トグル状態を受信:', self._notifEnabled);
      break;

    case 'SET_USER_ID':
      self._cachedUserId  = event.data.userId  || null;
      self._cachedAppId   = event.data.appId   || null;
      self._cachedIdToken = event.data.idToken || self._cachedIdToken;
      if (typeof event.data.notifEnabled === 'boolean') {
        self._notifEnabled = event.data.notifEnabled;
      }
      console.log('⚙️ [バックグラウンド] ユーザー情報をキャッシュしました:', self._cachedUserId ? self._cachedUserId.substring(0, 8) + '...' : 'null');
      break;

    case 'CLEAR_USER_ID':
      self._cachedUserId  = null;
      self._cachedAppId   = null;
      self._cachedIdToken = null;
      self._badgeCount    = 0;
      console.log('⚙️ [バックグラウンド] ユーザーのキャッシュを消去しました');
      break;

    case 'CACHE_AUTH_TOKEN':
      // iOS対策: visibilitychange:hidden 時にトークンをSWに預けておく
      // クライアントが死んでもSW側からofflineビーコンを送れる
      self._cachedIdToken = event.data.idToken || null;
      self._cachedAppId   = event.data.appId   || self._cachedAppId;
      self._cachedUserId  = event.data.userId  || self._cachedUserId;
      break;

    case 'CLEAR_BADGE':
      self._badgeCount = 0;
      if ('clearAppBadge' in self.navigator || 'clearAppBadge' in self) {
        try { (navigator.clearAppBadge || self.clearAppBadge).call(navigator || self).catch(() => {}); } catch(_) {}
      }
      break;

    case 'SET_BADGE_COUNT':
      self._badgeCount = event.data.count || 0;
      _updateBadge();
      break;
  }
});

// バッジを更新するヘルパー
function _updateBadge() {
  try {
    if (self._badgeCount > 0) {
      if ('setAppBadge' in self.navigator) {
        navigator.setAppBadge(self._badgeCount).catch(() => {});
      } else if ('setAppBadge' in self) {
        self.setAppBadge(self._badgeCount).catch(() => {});
      }
    } else {
      if ('clearAppBadge' in self.navigator) {
        navigator.clearAppBadge().catch(() => {});
      } else if ('clearAppBadge' in self) {
        self.clearAppBadge().catch(() => {});
      }
    }
  } catch (_) {}
}

// iOS対策: クライアントが応答しているか確認し、いなければofflineビーコン送信
async function _sendOfflineIfNoClients() {
  if (!self._cachedUserId || !self._cachedAppId || !self._cachedIdToken) return;
  try {
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    // すべてのウィンドウが閉じられている（clientList.length === 0）場合のみオフライン化
    // ※タブがバックグラウンド待機中（非表示）の時にメッセージを受信して勝手にオフライン化されるのを防止
    if (clientList.length === 0) {
      const data = JSON.stringify({
        userId: self._cachedUserId,
        appId:  self._cachedAppId,
        idToken: self._cachedIdToken
      });
      fetch('https://simplechat-api.astro-fray-server.workers.dev/api/setOffline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data,
        keepalive: true
      }).catch(() => {});
      console.log('⚙️ [バックグラウンド] アプリウィンドウが閉じられたため、オフライン状態をサーバーに送信しました');
    }
  } catch (e) {
    console.warn('[SW] _sendOfflineIfNoClients error:', e);
  }
}

// ─── バックグラウンドメッセージ処理 ────────────────────────────
messaging.onBackgroundMessage((payload) => {
  console.log('🔔 [バックグラウンド] プッシュ通知を受信しました', payload);

  let title = 'Covo';
  let body  = '新しいメッセージがあります';
  let data  = {};

  if (payload.data) {
    title = payload.data.title || title;
    body  = payload.data.body  || body;
    data  = payload.data;
  }
  if (payload.notification) {
    title = payload.notification.title || title;
    body  = payload.notification.body  || body;
  }

  // 暗号文が来たら汎用文言に置き換え（SW は鍵を持たない・送信者プレフィックス付き暗号文にも対応）
  if (typeof body === 'string') {
    if (body.includes('enc::v') || body.startsWith('enc::')) {
      if (body.includes(': enc::') || body.includes(':enc::')) {
        const senderPart = body.split(/:\s*enc::/)[0];
        body = `${senderPart}: 新着メッセージがあります`;
      } else {
        body = '新着メッセージがあります';
      }
    }
  }
  if (typeof title === 'string') {
    if (title.includes('enc::v') || title.startsWith('enc::')) {
      title = 'Covo';
    } else if (title.startsWith('ダイレクトメッセージ › @')) {
      title = title.replace('ダイレクトメッセージ › @', '');
    }
  }

  // スタンプ/添付ファイルのURLを可読テキストに変換（Discord & LINE 準拠）
  if (typeof body === 'string') {
    function _swFormatContent(s) {
      if (!s || typeof s !== 'string') return '新着メッセージがあります';
      const trimmed = s.trim();
      if (
        trimmed.includes('[STAMP]') || trimmed.includes('/stamps/') ||
        trimmed.includes('covo:') || trimmed.includes('covonew:') || trimmed.includes('serverstamp:') ||
        trimmed.startsWith('スタンプ') || trimmed === '🌟 スタンプ' || trimmed === '[スタンプ]'
      ) {
        return '[スタンプ]';
      }
      if (/\.(jpg|jpeg|png|gif|webp|heic|svg)/i.test(trimmed) || trimmed === '（画像）' || trimmed === '[画像]') {
        return '📷 [写真]';
      }
      if (/\.(mp4|mov|webm|avi|m4v)/i.test(trimmed) || trimmed === '（動画）' || trimmed === '[動画]') {
        return '🎥 [動画]';
      }
      if (/\.(mp3|wav|ogg|m4a|aac)/i.test(trimmed) || trimmed === '（音声）' || trimmed === '[ボイスメッセージ]') {
        return '🎤 [ボイスメッセージ]';
      }
      if (
        trimmed.includes('firebase-storage') || trimmed.includes('cloudinary') ||
        trimmed.includes('r2.cloudflarestorage') || trimmed.includes('/api/file/') ||
        trimmed === '（ファイル）' || /\.(pdf|zip|txt|docx?|xlsx?)/i.test(trimmed)
      ) {
        return '📎 [ファイル]';
      }
      return trimmed;
    }

    const colonIdx = body.indexOf(': ');
    if (colonIdx !== -1) {
      const senderPart = body.substring(0, colonIdx);
      const rest = body.substring(colonIdx + 2);
      body = `${senderPart}: ${_swFormatContent(rest)}`;
    } else {
      body = _swFormatContent(body);
    }
  }

  // 自分が送ったメッセージへの通知はスキップ
  if (self._cachedUserId && data.senderId && data.senderId === self._cachedUserId) {
    console.log('🔔 [バックグラウンド] 自分自身のメッセージのため通知表示をスキップしました');
    return;
  }

  // 通知設定がオフならスキップ
  if (self._notifEnabled === false) {
    console.log('🔔 [バックグラウンド] 通知設定がOFFのため通知をスキップしました');
    return;
  }

  // 重複通知チェック (同一メッセージや同一着信・同一内容の多重表示防止)
  const dedupKey = (data.type === 'incoming_call' && data.callId)
    ? `call-${data.callId}`
    : (data.messageId
      ? `msg-${data.messageId}`
      : `${data.roomId || 'covo'}_${title}_${body}`);

  if (_isDuplicate(dedupKey)) {
    console.log('🔔 [バックグラウンド] 重複通知を検知したため表示を抑制しました:', dedupKey);
    return;
  }

  // バッジ更新（未読+1）
  self._badgeCount = (self._badgeCount || 0) + 1;
  _updateBadge();

  // iOS対策: push受信時にアクティブクライアントがなければofflineビーコン送信
  _sendOfflineIfNoClients();

  let notificationOptions;
  if (data.type === 'incoming_call') {
    notificationOptions = {
      body,
      icon: '/img/icon-192x192.png?v=6',
      badge: '/img/icon-192x192.png?v=6',
      tag: `call-${data.callId || 'covo-call'}`,
      requireInteraction: true,
      data,
      actions: [
        { action: 'accept',  title: '応答' },
        { action: 'decline', title: '拒否'  }
      ]
    };
  } else {
    // messageId がある場合は1件ずつ独立した通知、ない場合はルーム単位で上書き
    const tag = data.messageId
      ? `msg-${data.messageId}`
      : `chat-${data.roomId || 'covo'}`;

    notificationOptions = {
      body,
      icon: '/img/icon-192x192.png?v=6',
      badge: '/img/icon-192x192.png?v=6',
      tag,
      data,
      actions: [
        { action: 'open', title: '開く' }
      ]
    };
  }

  return self.registration.showNotification(title, notificationOptions);
});

// ─── 通知クリック ───────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // バッジをクリア（通知タップでアイコンの赤マークを消す）
  self._badgeCount = 0;
  _updateBadge();

  const data   = event.notification.data || {};
  const action = event.action;
  const urlToOpen = self.location.origin + '/';

  // 着信「拒否」アクション
  if (data.type === 'incoming_call' && action === 'decline') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            client.postMessage({ type: 'CALL_DECLINED_FROM_NOTIFICATION', callId: data.callId, data });
            return;
          }
        }
      })
    );
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 既存のウィンドウがあればフォーカス
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICKED', data });
          return client.focus();
        }
      }
      // なければ新しく開く（通知対象のURLパラメータを付与して直接遷移可能にする）
      if (clients.openWindow) {
        let launchUrl = urlToOpen;
        if (data.callId) {
          launchUrl += (launchUrl.includes('?') ? '&' : '?') + `callId=${encodeURIComponent(data.callId)}`;
        } else if (data.roomId) {
          launchUrl += (launchUrl.includes('?') ? '&' : '?') + `roomId=${encodeURIComponent(data.roomId)}` + (data.serverId ? `&serverId=${encodeURIComponent(data.serverId)}` : '');
        }
        return clients.openWindow(launchUrl).then(client => {
          if (client && 'focus' in client) {
             client.postMessage({ type: 'NOTIFICATION_CLICKED', data });
             return client.focus();
          }
        });
      }
    })
  );
});
