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
    const rawName = emoji.substring(5);
    const cleanName = rawName.replace(/[^a-zA-Z0-9_\-\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff01-\uff5e]/g, '');
    return `<img src="/covo-stamps/${escapeHtml(cleanName)}.png" class="emoji covo-emoji" alt="${escapeHtml(cleanName)}" style="object-fit: contain; aspect-ratio: 1/1;" />`;
  }
  if (emoji.startsWith('covonew:')) {
    const rawName = emoji.substring(8);
    const cleanName = rawName.replace(/[^a-zA-Z0-9_\-\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff01-\uff5e]/g, '');
    return `<img src="/assets/covo_stamps/${escapeHtml(cleanName)}.png" class="emoji covo-emoji" alt="${escapeHtml(cleanName)}" style="object-fit: contain; aspect-ratio: 1/1;" />`;
  }
  if (emoji.startsWith('serverstamp:')) {
    const url = emoji.substring(12).trim();
    const isSafeHttp = (/^https?:\/\/[^\s"'<>]+$/i.test(url) || (url.startsWith('/') && !url.startsWith('//'))) && !url.includes('\\');
    const isSafeDataImage = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=]+$/i.test(url);
    if (!isSafeHttp && !isSafeDataImage) return '';
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
 * - URLの自動リンク化（& やクエリパラメータの切断防止、括弧バランス対応）
 * - メンション (@ユーザー) （メールアドレス・URLとの衝突防止）
 * @param {string} text - 変換元のプレーンテキスト
 * @returns {string} 表示用HTML文字列
 */
export function escapeHtmlAndLinkUrls(text) {
  if (!text) return "";

  // 0a. 不可視文字・ゼロ幅スペースの過剰連続サニタイズ（不可視爆弾対策）
  let normalizedText = String(text).replace(/[\u200B-\u200D\uFEFF]{3,}/g, '');

  // 0b. 連続改行の正規化（4つ以上の連続改行を最大3つに制限）
  normalizedText = normalizedText.replace(/\n{4,}/g, '\n\n\n');

  // ランダムプレフィックスによりユーザー入力とのプレースホルダー衝突を完全防止
  const tokenNonce = Math.random().toString(36).substring(2, 8);
  
  // 1. コードブロック退避（コピーボタン付き）
  const codeBlocks = [];
  let processedText = normalizedText.replace(/```([\s\S]*?)```/g, (match, p1) => {
    const id = `\uE000CB_${tokenNonce}_${codeBlocks.length}\uE001`;
    const escapedCode = escapeHtml(p1.trim());
    codeBlocks.push(
      `<div class="code-block-container relative group my-1.5 rounded-lg overflow-hidden border border-gray-700/50">` +
        `<div class="flex items-center justify-between px-3 py-1 bg-gray-900/90 text-xs text-gray-400 font-mono select-none">` +
          `<span>Code</span>` +
          `<button type="button" onclick="window.safeCopy ? window.safeCopy(this.parentElement.nextElementSibling.innerText) : navigator.clipboard.writeText(this.parentElement.nextElementSibling.innerText); const orig=this.innerHTML; this.innerHTML='<i class=\\\'fas fa-check\\\'></i> コピー済'; setTimeout(()=>this.innerHTML=orig, 1500);" class="copy-code-btn hover:text-white transition-colors flex items-center gap-1 cursor-pointer">` +
            `<i class="far fa-copy"></i> コピー` +
          `</button>` +
        `</div>` +
        `<pre class="bg-gray-800/90 text-gray-100 p-3 overflow-x-auto text-sm font-mono text-left m-0"><code>${escapedCode}</code></pre>` +
      `</div>`
    );
    return id;
  });

  // 2. インラインコード退避
  const inlineCodes = [];
  processedText = processedText.replace(/`([^`]+)`/g, (match, p1) => {
    const id = `\uE000IC_${tokenNonce}_${inlineCodes.length}\uE001`;
    const escapedCode = escapeHtml(p1);
    inlineCodes.push(`<code class="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1 py-0.5 rounded text-sm font-mono">${escapedCode}</code>`);
    return id;
  });

  // 3. URL検出 & リンク化（http(s)://、www.、主要ドメイン直接指定（youtube.com 等）すべて対応）
  const urls = [];
  const COMMON_TLDS = '(?:com|net|org|edu|gov|mil|jp|co\\.jp|ne\\.jp|or\\.jp|ac\\.jp|go\\.jp|io|app|dev|me|tv|ai|gg|cc|info|biz|xyz|site|online|live|tech|store|space|club|fun|top|pro|link|click|news|work|tokyo|asia|us|uk|ca|de|fr|ru|cn|in|br|au|eu|ch|nl|se|no|es|it|kr|tw|hk|sg|nz|za|is|to|ly|be|gl|fm|so)';
  
  const urlRegex = new RegExp(
    '(?:' +
      'https?:\\/\\/[^\\s<>"\'　]+' +
      '|' +
      '\\bwww\\.[a-zA-Z0-9\\-._~:/?#\\[\\]@!$&\'*+,;%=]+' +
      '|' +
      '\\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\\-]*[a-zA-Z0-9])?\\.)+' + COMMON_TLDS + '(?::\\d+)?(?:\\/[^\\s<>"\'　]*)?' +
    ')',
    'gi'
  );

  processedText = processedText.replace(urlRegex, (rawUrl, offset, fullStr) => {
    // メールアドレス (user@example.com) やコロン直後のプロトコル二重マッチなどをスキップ
    if (offset > 0 && (fullStr[offset - 1] === '@' || fullStr[offset - 1] === ':')) {
      return rawUrl;
    }

    let cleanUrl = rawUrl;
    let trailing = "";

    // 日本語や全角文字、無効な文字がパスに含まれている場合はそこで切り離す
    for (let i = 0; i < cleanUrl.length; i++) {
      const code = cleanUrl.charCodeAt(i);
      const ch = cleanUrl.charAt(i);
      if (code < 33 || code > 126 || ch === '<' || ch === '>' || ch === '"' || ch === "'" || ch === '`' || ch === '　') {
        trailing = cleanUrl.substring(i);
        cleanUrl = cleanUrl.substring(0, i);
        break;
      }
    }

    // 末尾の句読点トリミングと括弧バランシング
    while (cleanUrl.length > 0) {
      const last = cleanUrl.slice(-1);
      if (/[.,!?:;]/.test(last)) {
        trailing = last + trailing;
        cleanUrl = cleanUrl.slice(0, -1);
      } else if (last === ')') {
        const openCount = (cleanUrl.match(/\(/g) || []).length;
        const closeCount = (cleanUrl.match(/\)/g) || []).length;
        if (openCount < closeCount) {
          trailing = last + trailing;
          cleanUrl = cleanUrl.slice(0, -1);
        } else {
          break;
        }
      } else if (last === ']') {
        const openCount = (cleanUrl.match(/\[/g) || []).length;
        const closeCount = (cleanUrl.match(/\]/g) || []).length;
        if (openCount < closeCount) {
          trailing = last + trailing;
          cleanUrl = cleanUrl.slice(0, -1);
        } else {
          break;
        }
      } else if (last === '}') {
        const openCount = (cleanUrl.match(/\{/g) || []).length;
        const closeCount = (cleanUrl.match(/\}/g) || []).length;
        if (openCount < closeCount) {
          trailing = last + trailing;
          cleanUrl = cleanUrl.slice(0, -1);
        } else {
          break;
        }
      } else {
        break;
      }
    }

    if (!cleanUrl) return rawUrl;

    let href = cleanUrl;
    if (!/^https?:\/\//i.test(href)) {
      href = 'https://' + href;
    }

    const id = `\uE000URL_${tokenNonce}_${urls.length}\uE001`;
    const escapedHref = escapeHtml(href);
    const escapedText = escapeHtml(cleanUrl);
    const escapedTrailing = escapeHtml(trailing);
    urls.push(`<a href="${escapedHref}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline">${escapedText}</a>${escapedTrailing}`);
    return id;
  });

  // 4. 基本テキストのエスケープ
  let escapedText = escapeHtml(processedText);
  
  // 5. 書式装飾
  // スポイラー記法 (||ネタバレ||)
  escapedText = escapedText.replace(/\|\|(.*?)\|\|/g, '<span class="spoiler-text cursor-pointer bg-gray-600 dark:bg-gray-700 text-transparent hover:text-inherit rounded px-1 transition-all select-none" onclick="this.classList.toggle(\'text-transparent\'); this.classList.toggle(\'select-none\');" title="クリックで表示">$1</span>');
  escapedText = escapedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  escapedText = escapedText.replace(/\*(.*?)\*/g, '<em>$1</em>');
  escapedText = escapedText.replace(/~~(.*?)~~/g, '<del>$1</del>');
  escapedText = escapedText.replace(/\n/g, '<br>');

  // 6. メンション検出（最大10件までマッチ、メンション爆弾防止）
  let mentionCount = 0;
  const mentionRegex = /(^|[\s>])@([a-zA-Z0-9_\-\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+)/g;
  escapedText = escapedText.replace(mentionRegex, (match, prefix, username) => {
    if (mentionCount >= 10) return match;
    mentionCount++;
    return `${prefix}<span class="mention-text">@${username}</span>`;
  });

  // 7. URL・インラインコード・コードブロックの復元
  urls.forEach((html, index) => {
    escapedText = escapedText.replace(`\uE000URL_${tokenNonce}_${index}\uE001`, () => html);
  });
  inlineCodes.forEach((html, index) => {
    escapedText = escapedText.replace(`\uE000IC_${tokenNonce}_${index}\uE001`, () => html);
  });
  codeBlocks.forEach((html, index) => {
    escapedText = escapedText.replace(`\uE000CB_${tokenNonce}_${index}\uE001`, () => html);
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
