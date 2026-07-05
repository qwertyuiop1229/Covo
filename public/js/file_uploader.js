import { alertMessage } from './ui_helpers.js';

const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'pif', 'vbs', 'vbe', 'wsf', 'wsh',
  'ps1', 'psm1', 'psd1', 'sh', 'bash', 'zsh', 'fish', 'csh', 'ksh',
  'jar', 'jse', 'js', 'hta', 'cpl', 'inf', 'ins', 'isp', 'msp', 'mst',
  'reg', 'dll', 'sys', 'drv', 'ocx', 'app', 'dmg', 'pkg', 'deb', 'rpm',
  'ade', 'adp', 'chm', 'lnk', 'prf', 'url', 'xbap'
]);

/**
 * 送信が禁止されている拡張子かどうかをチェックし、ダメならアラートを出します。
 */
export function checkFileAllowed(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    alertMessage(`この形式のファイル(.${ext})は送信できません`, "error");
    return false;
  }
  return true;
}

/**
 * Cloudflare Worker (KV) へファイルをアップロードします。
 * (main.jsのグローバル変数を引数として受け取る内部用関数)
 */
export function _uploadToExternalService(file, auth, userId, workerBaseUrl, onProgress, _folder) {
  return new Promise(async (resolve, reject) => {
    const idToken = auth && auth.currentUser ? await auth.currentUser.getIdToken() : "";
    const fd = new FormData();
    fd.append('file', file);
    fd.append('uploaderId', userId || '');
    fd.append('idToken', idToken);
    if (_folder) {
      fd.append('folder', _folder);
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${workerBaseUrl}/api/uploadFile`);
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        try {
          const d = JSON.parse(xhr.responseText);
          d.url ? resolve(d.url) : reject(new Error(d.error || 'アップロード失敗'));
        } catch (e) { reject(new Error('応答の解析に失敗')); }
      } else {
        let msg = `HTTP ${xhr.status}`;
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch (_) {}
        reject(new Error(msg));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('ネットワークエラー')));
    xhr.addEventListener('abort', () => reject(new Error('アップロードキャンセル')));
    xhr.send(fd);
  });
}
