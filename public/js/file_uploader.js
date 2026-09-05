import { alertMessage } from './ui_helpers.js';

const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'pif', 'vbs', 'vbe', 'wsf', 'wsh',
  'ps1', 'psm1', 'psd1', 'sh', 'bash', 'zsh', 'fish', 'csh', 'ksh',
  'jar', 'jse', 'js', 'hta', 'cpl', 'inf', 'ins', 'isp', 'msp', 'mst',
  'reg', 'dll', 'sys', 'drv', 'ocx', 'app', 'dmg', 'pkg', 'deb', 'rpm',
  'ade', 'adp', 'chm', 'lnk', 'prf', 'url', 'xbap', 'html', 'htm'
]);

/**
 * 送信が禁止されている拡張子・サイズ超過・偽装MIMEかどうかをチェックし、安全性を確保します (#59, #60)
 */
export function checkFileAllowed(file) {
  if (!file || !file.name) return false;

  // 1. ファイルサイズ上限チェック (50MB) (#60)
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    alertMessage(`ファイルサイズが上限を超えています (${sizeMb}MB / 上限50MB)`, "error");
    return false;
  }

  // 2. 拡張子の完全サニタイズと二重拡張子ガード (#59)
  const cleanName = file.name.trim().replace(/\.+$/, '');
  const parts = cleanName.split('.').slice(1).map(p => p.toLowerCase().trim());
  
  // ファイル名に含まれる全拡張子パートをチェック (例: danger.exe.jpg, script.bat.txt)
  for (const part of parts) {
    if (BLOCKED_EXTENSIONS.has(part)) {
      alertMessage(`セキュリティ保護のため、実行可能形式または危険な拡張子 (.${part}) を含むファイルは送信できません`, "error");
      return false;
    }
  }

  // 3. 危険なMIMEタイプの偽装防御 (#59)
  const DANGEROUS_MIMES = new Set([
    'application/x-msdownload', 'application/x-executable', 'application/x-dosexec',
    'application/x-sh', 'application/x-bat', 'application/x-msdos-program',
    'application/hta', 'application/x-msi'
  ]);
  if (file.type && DANGEROUS_MIMES.has(file.type.toLowerCase())) {
    alertMessage("セキュリティ保護のため、この形式のファイルは送信できません", "error");
    return false;
  }

  return true;
}

/**
 * Cloudflare Worker (KV) へファイルをアップロードします。
 * (main.jsのグローバル変数を引数として受け取る内部用関数)
 */
export function _uploadToExternalService(file, auth, userId, workerBaseUrl, onProgress, _folder, _serverId) {
  return new Promise(async (resolve, reject) => {
    let idToken = "";
    try {
      if (auth && auth.currentUser) {
        idToken = await auth.currentUser.getIdToken();
      }
    } catch (tokenErr) {
      return reject(new Error("認証トークンの取得に失敗しました: " + tokenErr.message));
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('uploaderId', userId || '');
    fd.append('idToken', idToken);
    if (_folder) {
      fd.append('folder', _folder);
    }
    if (_serverId) {
      fd.append('serverId', _serverId);
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
