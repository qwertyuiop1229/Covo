/**
 * ユーティリティ関数群 (utils.js)
 * 状態 (db, authなど) に依存しない、汎用的で純粋な便利関数群です。
 */

/**
 * ArrayBuffer (バイナリデータ) を Base64 文字列に変換
 * @param {ArrayBuffer} buf - 変換元のバイナリデータ
 * @returns {string} Base64文字列
 */
export function _abToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

/**
 * Base64 文字列を ArrayBuffer (バイナリデータ) に復元
 * @param {string} b64 - 変換元のBase64文字列
 * @returns {ArrayBuffer} 復元されたバイナリデータ
 */
export function _b64ToAb(b64) {
  try {
    if (typeof b64 !== "string") return new ArrayBuffer(0);
    let norm = b64.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
    while (norm.length % 4 > 0) norm += "=";
    const bin = atob(norm);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  } catch (e) {
    console.error("Base64 decode failed:", e);
    return new ArrayBuffer(0);
  }
}

/**
 * バイト数を人間が読みやすい形式 (KB, MB, GB) に変換
 * @param {number} bytes - バイト数
 * @param {number} decimals - 小数点以下の桁数 (デフォルト: 2)
 * @returns {string} フォーマットされた文字列
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * メッセージオブジェクトから正確なタイムスタンプを取得
 * @param {Object} msg - メッセージオブジェクト
 * @returns {number} タイムスタンプ(ミリ秒)
 */
export function getMsgTimestamp(msg) {
  if (msg.createdAt && msg.createdAt.toMillis) {
    return msg.createdAt.toMillis();
  }
  if (msg.createdAt && typeof msg.createdAt === 'number') {
    return msg.createdAt;
  }
  if (msg.timestamp) {
    return typeof msg.timestamp === 'number' ? msg.timestamp : (msg.timestamp.toMillis ? msg.timestamp.toMillis() : Date.now());
  }
  return Date.now();
}

/**
 * テキストをクリップボードに安全にコピー
 * @param {string} txt - コピーするテキスト
 */
export async function safeCopy(txt) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(txt);
      return true;
    } else {
      return _execCopyFallback(txt);
    }
  } catch (err) {
    console.warn("Clipboard API failed, fallback to execCommand", err);
    return _execCopyFallback(txt);
  }
}

/**
 * (内部用) 古いブラウザや非セキュア環境向けのコピー処理フォールバック
 * @param {string} txt - コピーするテキスト
 */
export function _execCopyFallback(txt) {
  try {
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (err) {
    console.error('Fallback copy error', err);
    return false;
  }
}

/**
 * メールアドレスの最初の1文字を取得
 * @param {string} email - メールアドレス
 * @returns {string} 最初の1文字(大文字) または '?'
 */
export function emailInitial(email) {
  if (!email) return '?';
  return email.charAt(0).toUpperCase();
}

/**
 * HEICファイルをJPEGに変換
 * @param {File} file - 処理対象のファイル
 * @returns {Promise<File>} 処理後のファイル
 */
export async function processHeicFile(file) {
  if (!file) return null;
  const name = file.name || '';
  const ext = name.split('.').pop().toLowerCase();
  
  if (file.type === 'image/heic' || file.type === 'image/heif' || ext === 'heic' || ext === 'heif') {
    try {
      if (typeof heic2any === 'undefined') {
        console.warn("heic2any is not loaded");
        return file;
      }
      console.log("HEIC file detected. Converting to JPEG...");
      const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 });
      const finalBlob = Array.isArray(blob) ? blob[0] : blob;
      const newName = name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
      return new File([finalBlob], newName || 'converted.jpg', { type: 'image/jpeg' });
    } catch (e) {
      console.error("HEIC conversion failed:", e);
      return file;
    }
  }
  return file;
}

// グローバル互換性
if (typeof window !== 'undefined') {
  window._abToB64 = _abToB64;
  window._b64ToAb = _b64ToAb;
  window.formatBytes = formatBytes;
  window.getMsgTimestamp = getMsgTimestamp;
  window.safeCopy = safeCopy;
  window._execCopyFallback = _execCopyFallback;
  window.emailInitial = emailInitial;
  window.processHeicFile = processHeicFile;
}
