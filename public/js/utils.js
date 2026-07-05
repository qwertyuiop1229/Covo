/**
 * ユーティリティ関数群 (utils.js)
 * ここには特定の状態 (db, authなど) に依存しない、汎用的で純粋な便利関数のみをまとめています。
 * これらはUIやシステム全体で使われる共通の道具であり、バグが発生しにくい最も安全な層です。
 */

/**
 * ArrayBuffer (バイナリデータ) を Base64 文字列に変換します。
 * 暗号化されたデータの保存や通信などで利用されます。
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
 * Base64 文字列を ArrayBuffer (バイナリデータ) に復元します。
 * データの復号時などに利用されます。
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
 * バイト数を人間が読みやすい形式 (KB, MB, GB) に変換します。
 * ファイルアップロード時のサイズ表示などに利用されます。
 * @param {number} bytes - バイト数
 * @param {number} decimals - 小数点以下の桁数 (デフォルト: 2)
 * @returns {string} フォーマットされた文字列 (例: "1.50 MB")
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
 * メッセージオブジェクトから正確なタイムスタンプを取得します。
 * サーバーの時間がまだ反映されていない場合(ローカル投稿直後)のフォールバックも行います。
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
    return msg.timestamp;
  }
  return Date.now();
}

/**
 * テキストをクリップボードに安全にコピーします。
 * 現代の Clipboard API と古いブラウザ用のフォールバックの両方をサポートしています。
 * @param {string} txt - コピーするテキスト
 */
export function safeCopy(txt) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(txt).catch(err => {
      console.warn("Clipboard API failed, fallback to execCommand", err);
      _execCopyFallback(txt);
    });
  } else {
    _execCopyFallback(txt);
  }
}

/**
 * (内部用) 古いブラウザや非セキュア環境向けのコピー処理フォールバック
 * @param {string} txt - コピーするテキスト
 */
export function _execCopyFallback(txt) {
  const ta = document.createElement('textarea');
  ta.value = txt;
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
  } catch (err) {
    console.error('Fallback copy error', err);
  }
  document.body.removeChild(ta);
}

/**
 * メールアドレスの最初の1文字を取得します。
 * アイコンの代わりのイニシャル画像生成などで利用されます。
 * @param {string} email - メールアドレス
 * @returns {string} 最初の1文字(大文字) または '?'
 */
export function emailInitial(email) {
  if (!email) return '?';
  return email.charAt(0).toUpperCase();
}
