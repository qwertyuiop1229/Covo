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
 * Discord風 長文コードブロックの展開/折りたたみトグル
 */
export function covoToggleCodeBlock(btn, totalLines) {
  if (!btn) return;
  const container = btn.closest('.code-block-container');
  if (!container) return;
  const pre = container.querySelector('.code-block-pre');
  const fade = container.querySelector('.code-block-fade');
  if (!pre) return;
  const isExpanded = pre.classList.toggle('max-h-none');
  pre.classList.toggle('max-h-64', !isExpanded);
  pre.classList.toggle('overflow-y-hidden', !isExpanded);
  if (fade) fade.classList.toggle('hidden', isExpanded);
  if (!isExpanded && container.getBoundingClientRect().top < 60) {
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  btn.innerHTML = isExpanded
    ? '<span>折りたたむ</span> <i class="fas fa-chevron-up text-[10px]"></i>'
    : `<span>さらに表示 (${totalLines}行)</span> <i class="fas fa-chevron-down text-[10px]"></i>`;
}

/**
 * コードブロックのワンクリッククリップボードコピー
 */
export function covoCopyCodeBlock(btn) {
  if (!btn || btn.dataset.copying) return;
  btn.dataset.copying = 'true';
  const container = btn.closest('.code-block-container');
  const codeEl = container ? container.querySelector('.code-block-pre code') : null;
  const text = codeEl ? (codeEl.innerText || codeEl.textContent || '') : '';
  if (window.safeCopy) {
    window.safeCopy(text);
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  const origHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-check text-emerald-500"></i> <span class="text-emerald-500 font-bold">コピー済</span>';
  setTimeout(() => {
    btn.innerHTML = origHtml;
    delete btn.dataset.copying;
  }, 1500);
}

if (typeof window !== 'undefined') {
  window.covoToggleCodeBlock = covoToggleCodeBlock;
  window.covoCopyCodeBlock = covoCopyCodeBlock;
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
  // 🔒 暗号文生テキストの画面露出を100%防止（Discord/LINEライクな自然なシマースケルトンを表示）
  if (typeof text === 'string' && (text.startsWith('enc::v') || text.startsWith('enc::'))) {
    return '<span class="covo-msg-loading-shimmer inline-block w-28 sm:w-36 h-3.5 bg-gray-300/60 dark:bg-slate-700/60 rounded-md animate-pulse align-middle" aria-label="読み込み中"></span>';
  }
  // 0a. 不可視文字・ゼロ幅スペースの過剰連続サニタイズ（不可視爆弾対策）
  let normalizedText = String(text).replace(/[\u200B-\u200D\uFEFF]{3,}/g, '');

  // 0b. 連続改行の正規化（4つ以上の連続改行を最大3つに制限）
  normalizedText = normalizedText.replace(/\n{4,}/g, '\n\n\n');

  // ランダムプレフィックスによりユーザー入力とのプレースホルダー衝突を完全防止
  const tokenNonce = Math.random().toString(36).substring(2, 8);
  
  // 1. コードブロック退避（構文ハイライト & 言語バッジ & コピーボタン付き）
  const codeBlocks = [];
  let processedText = normalizedText.replace(/```([a-zA-Z0-9_\-+]*)\n?([\s\S]*?)```/g, (match, rawLang, codeContent) => {
    const id = `\uE000CB_${tokenNonce}_${codeBlocks.length}\uE001`;
    let lang = (rawLang || '').trim().toLowerCase();
    let body = codeContent;
    // 言語指定が改行なしで続いている場合のフォールバック
    if (!lang) {
      const firstLineBreak = codeContent.indexOf('\n');
      if (firstLineBreak > 0) {
        const potentialLang = codeContent.substring(0, firstLineBreak).trim().toLowerCase();
        if (/^[a-zA-Z0-9_\-+]{1,15}$/.test(potentialLang)) {
          lang = potentialLang;
          body = codeContent.substring(firstLineBreak + 1);
        }
      }
    }
    const displayLang = lang ? lang.toUpperCase() : 'CODE';
    const trimmedBody = body.replace(/^\n+/, '').replace(/\n+$/, '');

    // 🎨 Discord準拠 トークン構文ハイライト
    let highlighted = '';
    try {
      const tokens = [];
      const makeToken = (html) => {
        const id = `\uE002T${tokens.length}\uE003`;
        tokens.push(html);
        return id;
      };

      let rawCode = trimmedBody;

      // 1. コメント (//..., #..., /*...*/)
      rawCode = rawCode.replace(/(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)/g, (m) =>
        makeToken(`<span class="text-gray-400 dark:text-gray-500 italic">${escapeHtml(m)}</span>`)
      );

      // 2. 文字列 ("...", '...', `...`)
      rawCode = rawCode.replace(/("(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'|`(?:\\[\s\S]|[^`\\])*`)/g, (m) =>
        makeToken(`<span class="text-emerald-600 dark:text-emerald-400">${escapeHtml(m)}</span>`)
      );

      // 3. キーワード
      const keywords = [
        'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'do',
        'switch', 'case', 'break', 'continue', 'default', 'new', 'class', 'extends',
        'import', 'export', 'from', 'as', 'async', 'await', 'try', 'catch', 'finally', 'throw',
        'typeof', 'instanceof', 'void', 'this', 'super', 'null', 'undefined', 'true', 'false',
        'def', 'elif', 'lambda', 'with', 'yield', 'pass', 'raise', 'in', 'is', 'not', 'and', 'or',
        'fn', 'pub', 'mut', 'struct', 'enum', 'impl', 'trait', 'match', 'use', 'mod', 'where',
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'JOIN', 'LIMIT', 'ORDER', 'GROUP'
      ];
      const kwPattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
      rawCode = rawCode.replace(kwPattern, (m) =>
        makeToken(`<span class="text-purple-600 dark:text-purple-400 font-semibold">${escapeHtml(m)}</span>`)
      );

      // 4. 関数呼び出し
      rawCode = rawCode.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\()/g, (m) =>
        makeToken(`<span class="text-blue-600 dark:text-sky-400">${escapeHtml(m)}</span>`)
      );

      // 5. 数値リテラル
      rawCode = rawCode.replace(/\b(\d+(?:\.\d+)?|0x[0-9a-fA-F]+)\b/g, (m) =>
        makeToken(`<span class="text-amber-600 dark:text-amber-400 font-mono">${escapeHtml(m)}</span>`)
      );

      // 6. プレーンテキスト部分を安全にHTMLエスケープ (プレースホルダーは\uE002T..\uE003のためエスケープ無害)
      let escapedWithTokens = escapeHtml(rawCode);

      // 7. 各トークンHTMLを安全に復元
      tokens.forEach((tokenHtml, idx) => {
        escapedWithTokens = escapedWithTokens.replace(`\uE002T${idx}\uE003`, () => tokenHtml);
      });

      highlighted = escapedWithTokens;
    } catch (_) {
      highlighted = escapeHtml(trimmedBody);
    }

    const codeLines = trimmedBody.split('\n');
    const isLongCode = codeLines.length > 12;
    const collapseClasses = isLongCode ? 'max-h-64 overflow-y-hidden' : '';
    const fadeOverlay = isLongCode
      ? `<div class="code-block-fade absolute bottom-8 inset-x-0 h-16 bg-gradient-to-t from-[#f2f3f5] dark:from-[#2b2d31] to-transparent pointer-events-none transition-opacity"></div>`
      : '';
    const expandBtn = isLongCode
      ? `<button type="button" onclick="window.covoToggleCodeBlock(this, ${codeLines.length})" class="code-expand-toggle w-full py-1.5 text-center text-[11px] font-semibold text-[#5865F2] hover:bg-gray-200/80 dark:hover:bg-[#1e1f22] bg-gray-200/50 dark:bg-[#1e1f22]/70 border-t border-gray-300/80 dark:border-black/20 flex items-center justify-center gap-1.5 cursor-pointer transition-colors select-none"><span>さらに表示 (${codeLines.length}行)</span> <i class="fas fa-chevron-down text-[10px]"></i></button>`
      : '';

    codeBlocks.push(
      `<div class="code-block-container relative group my-2 rounded-xl overflow-hidden border border-gray-300 dark:border-[#1e1f22] bg-[#f2f3f5] dark:bg-[#2b2d31] shadow-xs">` +
        `<div class="flex items-center justify-between px-3 py-1.5 bg-gray-200/90 dark:bg-[#1e1f22]/90 border-b border-gray-300 dark:border-black/20 text-[11px] text-gray-600 dark:text-[#949ba4] font-mono select-none">` +
          `<span class="flex items-center gap-1.5 font-bold tracking-wider text-[#5865F2]"><i class="fas fa-code text-[10px]"></i> ${escapeHtml(displayLang)}</span>` +
          `<button type="button" onclick="window.covoCopyCodeBlock(this)" class="copy-code-btn px-2 py-0.5 rounded hover:bg-gray-300 dark:hover:bg-[#35373c] hover:text-gray-900 dark:hover:text-white transition-all flex items-center gap-1.5 cursor-pointer font-sans text-[11px]">` +
            `<i class="far fa-copy text-xs"></i> コピー` +
          `</button>` +
        `</div>` +
        `<pre class="code-block-pre p-3.5 overflow-x-auto text-xs sm:text-sm font-mono text-left m-0 leading-relaxed text-gray-800 dark:text-[#dbdee1] selection:bg-[#5865F2]/30 ${collapseClasses} transition-all duration-300"><code class="block font-mono">${highlighted}</code></pre>` +
        fadeOverlay +
        expandBtn +
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
      '\\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\\-]{0,61}[a-zA-Z0-9])?\\.){1,8}' + COMMON_TLDS + '(?::\\d+)?(?:\\/[^\\s<>"\'　]*)?' +
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
    // 🔒 厳格なプロトコルバリデーション（javascript:, data:, vbscript: などのXSSスキーム完全排除）
    if (!/^https?:\/\/[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;%=]+$/i.test(href)) {
      return escapeHtml(rawUrl);
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
  // スポイラー記法 (||ネタバレ|| - ホバーで漏洩せずクリックでトグルするDiscord仕様)
  escapedText = escapedText.replace(/\|\|(.*?)\|\|/g, '<span class="covo-spoiler-inline spoiler-text cursor-pointer bg-gray-500/80 dark:bg-[#202225] hover:bg-gray-600 dark:hover:bg-[#2b2d31] text-transparent rounded px-1.5 py-0.5 select-none transition-all" onclick="this.classList.toggle(\'text-transparent\'); this.classList.toggle(\'select-none\'); this.classList.toggle(\'bg-gray-200/80\'); this.classList.toggle(\'dark:bg-white/10\');" title="クリックで表示">$1</span>');
  escapedText = escapedText.replace(/__(.*?)__/g, '<u>$1</u>');
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
