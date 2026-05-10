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

// ログイン中ユーザーIDをキャッシュ（自分への通知を防ぐ）
// メインスクリプトから postMessage({ type: 'SET_USER_ID', userId }) で設定
self._cachedUserId = null;

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SET_USER_ID') {
    self._cachedUserId = event.data.userId || null;
    console.log('[SW] userId cached:', self._cachedUserId ? self._cachedUserId.substring(0, 8) + '...' : 'null');
  } else if (event.data.type === 'CLEAR_USER_ID') {
    self._cachedUserId = null;
    console.log('[SW] userId cleared');
  }
});

// バックグラウンドメッセージ処理（data + notification 両対応）
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  let title = 'Covo';
  let body = '新しいメッセージがあります';
  let data = {};

  if (payload.notification) {
    title = payload.notification.title || title;
    body = payload.notification.body || body;
  }
  if (payload.data) {
    title = payload.data.title || title;
    body = payload.data.body || body;
    data = payload.data;
  }

  // ★ 自分が送ったメッセージへの通知は表示しない
  // Cloudflare Worker が payload.data.senderId に送信者 UID を含めて送信する
  if (self._cachedUserId && data.senderId && data.senderId === self._cachedUserId) {
    console.log('[SW] Skipping own message notification (senderId match)');
    return;
  }

  const notificationOptions = {
    body: body,
    icon: '/icon-192x192.png?v=4',
    badge: '/icon-192x192.png?v=4',
    tag: data.roomId || 'covo-notification',
    renotify: true,
    data: data,
    actions: [
      { action: 'open', title: '開く' }
    ]
  };

  self.registration.showNotification(title, notificationOptions);
});

// 通知クリック時にアプリを開く
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const roomId = event.notification.data?.roomId;
  const urlToOpen = self.location.origin + '/index.html' + (roomId ? `?room=${roomId}` : '');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 既に開いているタブがあればフォーカス
      for (const client of clientList) {
        if (client.url.includes('/index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // なければ新規タブで開く
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
