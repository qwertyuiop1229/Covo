/**
 * テキストフォーマット・パース処理 (text_formatter.js)
 * チャットメッセージのテキストを安全にHTMLに変換したり、絵文字・スタンプをパースする純粋関数群です。
 */

const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/';

/**
 * 特殊文字(&, <, >, ", ')を無害なHTMLエンティティに変換（XSS防止）
 * @param {string} s - エスケープする文字列
 * @returns {string} 安全なHTML文字列
 */
export function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * 特殊な絵文字タグ（covo:, covonew:, serverstamp:）をimgタグのHTMLに変換
 * @param {string} emoji - 絵文字の識別文字列
 * @param {string} spanClass - spanで包む場合のCSSクラス
 * @returns {string} 絵文字のHTMLタグ文字列
 */
export function getEmojiHtml(emoji, spanClass = 'sk-em') {
  if (!emoji || typeof emoji !== 'string') return '';
  if (emoji.startsWith('covo:')) {
    const name = emoji.substring(5);
    return `<img src="/covo-stamps/${escapeHtml(name)}.png" class="emoji covo-emoji" alt="${escapeHtml(name)}" style="object-fit: contain; aspect-ratio: 1/1;" />`;
  }
  if (emoji.startsWith('covonew:')) {
    const name = emoji.substring(8);
    return `<img src="/assets/covo_stamps/${escapeHtml(name)}.png" class="emoji covo-emoji" alt="${escapeHtml(name)}" style="object-fit: contain; aspect-ratio: 1/1;" />`;
  }
  if (emoji.startsWith('serverstamp:')) {
    const url = emoji.substring(12);
    const isSafe = /^https?:\/\//i.test(url) || url.startsWith('/');
    if (!isSafe) return '';
    return `<img src="${escapeHtml(url)}" class="emoji covo-emoji" alt="カスタムスタンプ" style="object-fit: contain; aspect-ratio: 1/1;" />`;
  }
  return `<span class="${escapeHtml(spanClass)}">${escapeHtml(emoji)}</span>`;
}

/**
 * DOM要素内の絵文字テキスト（🍎など）をTwemojiに変換
 * @param {HTMLElement} el - 対象のDOM要素
 */
export function _twemojiParse(el) {
  if (!window.twemoji || !el) return;
  try { twemoji.parse(el, { folder: 'svg', ext: '.svg', base: TWEMOJI_BASE }); } catch (e) {}
}

/**
 * チャットの本文テキストをパースし、安全なHTMLに変換
 * - コードブロック (```...```)
 * - インラインコード (`...`)
 * - 太字 (**...**), 斜体 (*...*), 打ち消し線 (~~...~~)
 * - URLの自動リンク化（末尾の記号巻き込み防止）
 * - メンション (@ユーザー) （メールアドレス・URLとの衝突防止）
 * @param {string} text - 変換元のプレーンテキスト
 * @returns {string} 表示用HTML文字列
 */
export function escapeHtmlAndLinkUrls(text) {
  if (!text) return "";

  // ランダムプレフィックスによりユーザー入力とのプレースホルダー衝突を完全防止
  const tokenNonce = Math.random().toString(36).substring(2, 8);
  
  // 1. コードブロック退避
  const codeBlocks = [];
  let processedText = text.replace(/```([\s\S]*?)```/g, (match, p1) => {
    const id = `__CB_${tokenNonce}_${codeBlocks.length}__`;
    const escapedCode = escapeHtml(p1);
    codeBlocks.push(`<pre class="bg-gray-800 text-gray-100 p-2 rounded-md overflow-x-auto my-1 text-sm font-mono text-left"><code>${escapedCode}</code></pre>`);
    return id;
  });

  // 2. インラインコード退避
  const inlineCodes = [];
  processedText = processedText.replace(/`([^`]+)`/g, (match, p1) => {
    const id = `__IC_${tokenNonce}_${inlineCodes.length}__`;
    const escapedCode = escapeHtml(p1);
    inlineCodes.push(`<code class="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1 rounded text-sm font-mono">${escapedCode}</code>`);
    return id;
  });

  // 3. 基本テキストのエスケープ
  let escapedText = escapeHtml(processedText);
  
  // 4. 書式装飾
  escapedText = escapedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  escapedText = escapedText.replace(/\*(.*?)\*/g, '<em>$1</em>');
  escapedText = escapedText.replace(/~~(.*?)~~/g, '<del>$1</del>');
  escapedText = escapedText.replace(/\n/g, '<br>');

  // 5. URL自動リンク化（末尾の記号 . , ! ? ) ] をリンクから正しく除外）
  const urlRegex = /(https?:\/\/[^\s"'<>&]+)/g;
  escapedText = escapedText.replace(urlRegex, (matchedUrl) => {
    let cleanUrl = matchedUrl;
    let trailing = "";
    // 末尾の記号を切り離す
    while (/[.,!?:;)\]]$/.test(cleanUrl)) {
      trailing = cleanUrl.slice(-1) + trailing;
      cleanUrl = cleanUrl.slice(0, -1);
    }
    return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline">${cleanUrl}</a>${trailing}`;
  });

  // 6. メンション検出（単語の先頭または空白直後のみマッチさせ、emailやURL内を破壊しない）
  const mentionRegex = /(^|[\s>])@([a-zA-Z0-9_\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+)/g;
  escapedText = escapedText.replace(mentionRegex, (match, prefix, username) => {
    return `${prefix}<span class="mention-text">@${username}</span>`;
  });

  // 7. コードブロック・インラインコードの復元
  inlineCodes.forEach((html, index) => {
    escapedText = escapedText.replace(`__IC_${tokenNonce}_${index}__`, () => html);
  });
  codeBlocks.forEach((html, index) => {
    escapedText = escapedText.replace(`__CB_${tokenNonce}_${index}__`, () => html);
  });

  return escapedText;
}

// グローバル互換性
if (typeof window !== 'undefined') {
  window.escapeHtml = escapeHtml;
  window.getEmojiHtml = getEmojiHtml;
  window._twemojiParse = _twemojiParse;
  window.escapeHtmlAndLinkUrls = escapeHtmlAndLinkUrls;
}
