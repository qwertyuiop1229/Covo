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

  // data フィールドを優先（サーバーが送る情報）
  if (payload.data) {
    title = payload.data.title || title;
    body = payload.data.body || body;
    data = payload.data;
  }
  // notification フィールドはフォールバック（ブラウザが自動表示する前に SW が横取り）
  if (payload.notification) {
    title = payload.notification.title || title;
    body = payload.notification.body || body;
  }

  // 最終防壁: SW は鍵を持たず復号できないので、暗号文(enc::v1::)が来たら
  // ユーザーに暗号文を見せず汎用文言に置き換える。
  if (typeof body === 'string' && body.indexOf('enc::v1::') === 0) {
    body = '新しいメッセージがあります';
  }
  if (typeof title === 'string' && title.indexOf('enc::v1::') === 0) {
    title = 'Covo';
  }

  // ★ 自分が送ったメッセージへの通知は表示しない
  if (self._cachedUserId && data.senderId && data.senderId === self._cachedUserId) {
    console.log('[SW] Skipping own message notification (senderId match)');
    return;
  }

  // ★ バッジをセット（アプリが閉じていてもアイコンに赤マークが付く）
  try {
    if ('setAppBadge' in navigator) {
      navigator.setAppBadge(1).catch(() => {});
    }
  } catch (_) {}

  let notificationOptions;
  if (data.type === 'incoming_call') {
    notificationOptions = {
      body: body,
      icon: '/icon-192x192.png?v=6',
      badge: '/icon-192x192.png?v=6',
      tag: `call-${data.callId || 'covo-call'}`,
      renotify: true,
      requireInteraction: true,
      data: data,
      actions: [
        { action: 'accept', title: '応答' },
        { action: 'decline', title: '拒否' }
      ]
    };
  } else {
    notificationOptions = {
      body: body,
      icon: '/icon-192x192.png?v=6',
      badge: '/icon-192x192.png?v=6',
      // 同じルームの通知は上書き（スパム防止）、毎回振動・音あり
      tag: `chat-${data.roomId || 'covo'}`,
      renotify: true,
      data: data,
      actions: [
        { action: 'open', title: '開く' }
      ]
    };
  }

  // ブラウザが webpush.notification で自動表示しようとしても、
  // SW の showNotification が tag で上書きするので重複しない
  return self.registration.showNotification(title, notificationOptions);
});

// 通知クリック時にアプリを開く / フォーカスする
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // ★ バッジをクリア（通知をタップしたらアイコンの赤マークを消す）
  try {
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  } catch (_) {}

  const data = event.notification.data || {};
  const action = event.action;
  const urlToOpen = self.location.origin + '/';

  // 着信通知の「拒否」アクション
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
          // Tauri (Windows EXE) 向け: postMessage でアプリ側にウィンドウフォーカスを依頼
          client.postMessage({ type: 'NOTIFICATION_CLICKED', data });
          return client.focus();
        }
      }
      // 開いているウィンドウがなければ新規で開く
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
