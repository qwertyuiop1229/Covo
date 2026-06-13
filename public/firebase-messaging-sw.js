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

// ─── postMessage受信 ────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (!event.data) return;

  switch (event.data.type) {
    case 'SET_USER_ID':
      self._cachedUserId = event.data.userId || null;
      self._cachedAppId  = event.data.appId  || null;
      console.log('[SW] userId cached:', self._cachedUserId ? self._cachedUserId.substring(0, 8) + '...' : 'null');
      break;

    case 'CLEAR_USER_ID':
      self._cachedUserId  = null;
      self._cachedAppId   = null;
      self._cachedIdToken = null;
      self._badgeCount    = 0;
      console.log('[SW] userId cleared');
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
      navigator.setAppBadge(self._badgeCount).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  } catch (_) {}
}

// iOS対策: クライアントが応答しているか確認し、いなければofflineビーコン送信
async function _sendOfflineIfNoClients() {
  if (!self._cachedUserId || !self._cachedAppId || !self._cachedIdToken) return;
  try {
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const activeClients = clientList.filter(c => c.visibilityState === 'visible');
    if (activeClients.length === 0) {
      // 全クライアントが非表示または存在しない → offlineビーコン
      // SW内はnavigator.sendBeaconが使えないのでfetch+keepaliveを使う
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
      console.log('[SW] Sent offline fetch (no active clients)');
    }
  } catch (e) {
    console.warn('[SW] _sendOfflineIfNoClients error:', e);
  }
}

// ─── バックグラウンドメッセージ処理 ────────────────────────────
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message', payload);

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

  // 暗号文が来たら汎用文言に置き換え（SW は鍵を持たない）
  if (typeof body  === 'string' && body.indexOf('enc::v1::')  === 0) body  = '新しいメッセージがあります';
  if (typeof title === 'string' && title.indexOf('enc::v1::') === 0) title = 'Covo';

  // 自分が送ったメッセージへの通知はスキップ
  if (self._cachedUserId && data.senderId && data.senderId === self._cachedUserId) {
    console.log('[SW] Skipping own message notification');
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
      icon: '/icon-192x192.png?v=6',
      badge: '/icon-192x192.png?v=6',
      tag: `call-${data.callId || 'covo-call'}`,
      renotify: true,
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
      icon: '/icon-192x192.png?v=6',
      badge: '/icon-192x192.png?v=6',
      tag,
      renotify: true,
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
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICKED', data });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
