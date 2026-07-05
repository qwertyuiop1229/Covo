/**
 * テキストフォーマット・パース処理 (text_formatter.js)
 * ここにはチャットメッセージのテキストをHTMLに変換したり、絵文字をパースしたりする
 * 表示用の純粋関数をまとめています。
 * これらも特定のデータベースの状態に依存しない安全な機能群です。
 */

const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/';

/**
 * テキスト内の特殊文字(&, <, >, ", ')を無害なHTMLエンティティに変換（エスケープ）します。
 * XSS（クロスサイトスクリプティング）攻撃を防ぐための必須処理です。
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
 * 特殊な絵文字タグ（covo:, covonew:, serverstamp:）をimgタグのHTMLに変換します。
 * 組み込みの絵文字がない場合はspanタグで包んで返します。
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
    return `<img src="${escapeHtml(url)}" class="emoji covo-emoji" alt="カスタムスタンプ" style="object-fit: contain; aspect-ratio: 1/1;" />`;
  }
  return `<span class="${escapeHtml(spanClass)}">${escapeHtml(emoji)}</span>`;
}

/**
 * 渡されたDOM要素内の絵文字テキスト（🍎など）を、Twemoji（Twitterの綺麗な絵文字画像）に変換します。
 * @param {HTMLElement} el - 対象のDOM要素
 */
export function _twemojiParse(el) {
  if (!window.twemoji || !el) return;
  try { twemoji.parse(el, { folder: 'svg', ext: '.svg', base: TWEMOJI_BASE }); } catch (e) {}
}

/**
 * チャットの本文テキストをパースし、安全なHTMLに変換します。
 * - コードブロック (```...```)
 * - インラインコード (`...`)
 * - 太字 (**...**), 斜体 (*...*), 打ち消し線 (~~...~~)
 * - URLの自動リンク化
 * - メンション (@ユーザー)
 * これらの書式をすべて処理しつつ、XSSを防ぎます。
 * @param {string} text - 変換元のプレーンテキスト
 * @returns {string} 表示用HTML文字列
 */
export function escapeHtmlAndLinkUrls(text) {
  if (!text) return "";
  
  const codeBlocks = [];
  let processedText = text.replace(/```([\s\S]*?)```/g, (match, p1) => {
    const id = `__CODE_BLOCK_${codeBlocks.length}__`;
    let escapedCode = p1.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    codeBlocks.push(`<pre class="bg-gray-800 text-gray-100 p-2 rounded-md overflow-x-auto my-1 text-sm font-mono text-left"><code>${escapedCode}</code></pre>`);
    return id;
  });

  const inlineCodes = [];
  processedText = processedText.replace(/`([^`]+)`/g, (match, p1) => {
    const id = `__INLINE_CODE_${inlineCodes.length}__`;
    let escapedCode = p1.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    inlineCodes.push(`<code class="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1 rounded text-sm font-mono">${escapedCode}</code>`);
    return id;
  });

  let escapedText = processedText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  
  escapedText = escapedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  escapedText = escapedText.replace(/\*(.*?)\*/g, '<em>$1</em>');
  escapedText = escapedText.replace(/~~(.*?)~~/g, '<del>$1</del>');
  escapedText = escapedText.replace(/\n/g, '<br>');

  const urlRegex = /(https?:\/\/[^\s"'<>&]+)/g;
  escapedText = escapedText.replace(urlRegex, (safeUrl) => {
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline">${safeUrl}</a>`;
  });

  const mentionRegex = /@([^\s<&]+)/g;
  escapedText = escapedText.replace(mentionRegex, (match, p1) => {
    return `<span class="mention-text">@${p1}</span>`;
  });

  inlineCodes.forEach((html, index) => {
    escapedText = escapedText.replace(`__INLINE_CODE_${index}__`, html);
  });
  codeBlocks.forEach((html, index) => {
    escapedText = escapedText.replace(`__CODE_BLOCK_${index}__`, html);
  });

  return escapedText;
}
