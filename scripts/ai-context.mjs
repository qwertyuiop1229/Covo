#!/usr/bin/env node
/**
 * ai-context.mjs  ―  AIに渡すコンテキストを「必要な関数だけ」に自動で絞る（依存パッケージなし / Node 18+）
 *
 * いちばん簡単な使い方（プロジェクトのルートで）:
 *   1) node scripts/ai-context.mjs          … エラー文や要望を貼り付け → 空行を2回で確定
 *   2) できた ai-context/for-ai.md を AI Studio に添付し「添付ファイルの指示に従ってください」と送る
 *   3) AIの回答でパッチを適用したら:  node scripts/ai-context.mjs check   … 構文エラーがないか全ファイル検査
 *
 * 修正を適用したら必ず check を実行（構文エラーの見落とし防止）。
 * 複数の話題をまとめて頼むときは --budget 120000 のように増やす（既定60000）。
 *
 * 上級者向け:
 *   map                    関数の目次を ai-context/map.md に出力
 *   pick --name a,b --grep "正規表現" [--deps] [--file x]   指定した関数/文字列を含む関数だけを ai-context/pick.md に出力
 *   ask  [--text "要望"] [--budget 110000] [--add 関数名,関数名] [--no-map]   既定。自動で関連関数を選んで for-ai.md を作る
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_FILES = [
    'public/js/main.js', 'public/js/crypto_helpers.js', 'public/js/local_store.js', 'public/js/utils.js',
    'public/js/ui_helpers.js', 'public/js/text_formatter.js', 'public/js/file_uploader.js', 'public/js/debug_ui.js',
    'public/firebase-messaging-sw.js', 'server/src/index.js',
];
const OUT_DIR = 'ai-context';

// ───────────── 引数 ─────────────
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = { context: 30, 'max-tokens': 120000 };
for (let i = (argv[0] && argv[0].startsWith('--') ? 0 : 1); i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    if (['deps', 'stdout', 'no-map'].includes(k)) opt[k] = true; else opt[k] = argv[++i];
}
const list = (v) => (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : []);

// ───────────── トークン概算（日本語は約1文字=1トークン / 英数は約3.6文字=1トークン） ─────────────
const estTokens = (s) => { let a = 0; for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 128) a++; return Math.round(a / 3.6 + (s.length - a) * 1.1); };

// ───────────── JSを「トップレベルの塊（関数・変数・イベント登録）」に分割 ─────────────
function splitUnits(src) {
    const n = src.length, lineStart = [0];
    for (let i = 0; i < n; i++) if (src[i] === '\n') lineStart.push(i + 1);
    const lineOf = (pos) => { let lo = 0, hi = lineStart.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lineStart[m] <= pos) lo = m; else hi = m - 1; } return lo; };
    const depthAtLineStart = new Array(lineStart.length).fill(0);
    const inComment = new Array(lineStart.length).fill(false);
    let depth = 0, i = 0, prevSig = '', tplStack = [], line = 0;
    const regexOK = () => prevSig === '' || /[(,=:\[!&|?{};+\-*%<>~^]/.test(prevSig) || /(?:return|typeof|case|in|of|delete|void|throw|new)$/.test(prevSig);
    depthAtLineStart[0] = 0;
    const markLines = (upto) => { while (line + 1 < lineStart.length && lineStart[line + 1] <= upto) { line++; depthAtLineStart[line] = depth; } };
    while (i < n) {
        const c = src[i], d = src[i + 1];
        if (c === '\n') { i++; markLines(i); continue; }
        if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
        if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; const l0 = lineOf(i), l1 = lineOf(end - 1); for (let k = l0 + 1; k <= l1; k++) inComment[k] = true; i = end; markLines(i); continue; }
        if (c === '"' || c === "'") { i++; while (i < n && src[i] !== c) { if (src[i] === '\\') i++; i++; } i++; prevSig = 'x'; markLines(i); continue; }
        if (c === '`') { i++; tplLoop: while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === '`') { i++; break; } if (src[i] === '$' && src[i + 1] === '{') { tplStack.push(depth); depth++; i += 2; break tplLoop; } i++; } if (!(src[i - 1] === '`' && tplStack.length === 0) && src[i - 2] !== '$') { /* 続きは } で再開 */ } prevSig = 'x'; markLines(i); continue; }
        if (c === '}' && tplStack.length && depth - 1 === tplStack[tplStack.length - 1]) {
            depth--; tplStack.pop(); i++;
            // テンプレートリテラルの続きを読む
            while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === '`') { i++; break; } if (src[i] === '$' && src[i + 1] === '{') { tplStack.push(depth); depth++; i += 2; break; } i++; }
            prevSig = 'x'; markLines(i); continue;
        }
        if (c === '/' && regexOK()) { // 正規表現リテラル
            i++; let inCls = false; while (i < n && src[i] !== '\n') { if (src[i] === '\\') { i += 2; continue; } if (src[i] === '[') inCls = true; else if (src[i] === ']') inCls = false; else if (src[i] === '/' && !inCls) break; i++; }
            i++; while (/[a-z]/i.test(src[i] || '')) i++; prevSig = 'x'; continue;
        }
        if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
        prevSig = /[A-Za-z0-9_$]/.test(c) ? (() => { let j = i; while (/[A-Za-z0-9_$]/.test(src[j] || '')) j++; const w = src.slice(i, j); i = j - 1; return w; })() : c;
        i++;
    }
    const total = lineStart.length;
    const lines = src.split('\n');
    const units = []; let start = 0;
    const startsCont = (t) => /^[.)\]},?:&|=*]/.test(t.trimStart()) || /^\s*(else|catch|finally)\b/.test(t);
    const isBlank = (t) => t.trim() === '';
    for (let ln = 1; ln < total; ln++) {
        if (depthAtLineStart[ln] !== 0 || inComment[ln] || isBlank(lines[ln] ?? '') || startsCont(lines[ln] ?? '')) continue;
        let p = ln - 1; while (p > start && isBlank(lines[p])) p--;
        if (/[,=:+\-*/&|?(\[{]\s*$/.test(lines[p].replace(/\/\/.*$/, '').trimEnd()) && !/\*\/\s*$/.test(lines[p])) continue; // 式が続いている
        // 直前のコメント行は次の塊に付ける
        let s = ln; while (s > start && /^\s*(\/\/|\/\*|\*)/.test(lines[s - 1])) s--;
        if (s > start) { units.push([start, s - 1]); start = s; }
    }
    units.push([start, total - 1]);
    return units.map(([a, b]) => {
        while (b > a && isBlank(lines[b])) b--;
        const text = lines.slice(a, b + 1).join('\n');
        return { from: a + 1, to: b + 1, text, name: unitName(text) };
    });
}
function unitName(text) {
    const code = text.split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l) && l.trim()).join('\n');
    let m;
    if ((m = code.match(/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)/))) return m[1];
    if ((m = code.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)/))) return m[1];
    if ((m = code.match(/^\s*(?:const|let|var)\s+(\{[^}]{0,60})/))) return m[1].replace(/\s+/g, '') + '}';
    if ((m = code.match(/^\s*window\.([A-Za-z0-9_$]+)\s*=/))) return 'window.' + m[1];
    if ((m = code.match(/^\s*class\s+([A-Za-z0-9_$]+)/))) return m[1];
    if (/^\s*import\b/.test(code)) return '(import)';
    const first = code.split('\n')[0].trim();
    return '(stmt) ' + first.slice(0, 70);
}

// ───────────── ファイル読み込み ─────────────
const rd = (f) => fs.readFileSync(f, 'utf8');
const exists = (f) => fs.existsSync(f);
const isJs = (f) => /\.(m?js)$/.test(f);

function header(files, extra = '') {
    let ver = ''; try { ver = JSON.parse(rd('public/version.json')).version; } catch (_) { }
    return `<!-- ai-context ${new Date().toISOString()} / app version: ${ver || '?'} -->\n${extra}`;
}

// ───────────── map ─────────────
function doMap() {
    const files = list(opt.file).length ? list(opt.file) : DEFAULT_FILES;
    let out = header(files, `# 関数マップ（目次）\nこの一覧は「どこに何があるか」だけを示します。コードは含みません。\n修正に必要な関数名をここから選び、別途 pick で本文を取り出してください。\n形式: \`開始行-終了行 (約トークン) 名前\`\n\n`);
    let tot = 0;
    for (const f of files) {
        if (!exists(f)) continue;
        const src = rd(f); const t = estTokens(src); tot += t;
        out += `## ${f}  (全体 約${t.toLocaleString()}トークン / ${src.split('\n').length}行)\n`;
        const units = splitUnits(src).filter(u => u.name !== '(import)');
        for (const u of units) {
            const size = u.to - u.from + 1;
            if (u.name.startsWith('(stmt)') && size < 6) continue; // 小さいイベント登録などは省略
            out += `${u.from}-${u.to} (${estTokens(u.text)}) ${u.name}\n`;
        }
        out += '\n';
    }
    emit(out, 'map.md', `全ファイル合計 約${tot.toLocaleString()}トークン`);
}

// ───────────── pick ─────────────
function doPick() {
    const names = list(opt.name), grep = opt.grep ? new RegExp(opt.grep, 'i') : null;
    if (!names.length && !grep) { console.error('--name か --grep を指定してください'); process.exit(1); }
    const files = list(opt.file).length ? list(opt.file) : DEFAULT_FILES;
    const ctx = Number(opt.context);
    const max = Number(opt['max-tokens']);
    const picked = []; // {file, from, to, text, name, reason}
    const allUnits = {};
    for (const f of files) {
        if (!exists(f)) { console.error(`(無視) ${f} が見つかりません`); continue; }
        const src = rd(f);
        if (isJs(f)) {
            const units = splitUnits(src); allUnits[f] = units;
            for (const u of units) {
                if (u.name === '(import)') continue;
                const byName = names.some(n => u.name.toLowerCase().includes(n.toLowerCase()));
                const byGrep = grep && grep.test(u.text);
                if (byName || byGrep) picked.push({ file: f, ...u, reason: byName ? 'name' : 'grep' });
            }
        } else if (grep) { // HTML/CSS等: 一致行の前後を抜粋
            const lines = src.split('\n'); const win = [];
            lines.forEach((l, i) => { if (grep.test(l)) win.push([Math.max(0, i - ctx), Math.min(lines.length - 1, i + ctx)]); });
            const merged = []; for (const w of win) { const l = merged[merged.length - 1]; if (l && w[0] <= l[1] + 1) l[1] = Math.max(l[1], w[1]); else merged.push([...w]); }
            for (const [a, b] of merged) picked.push({ file: f, from: a + 1, to: b + 1, text: lines.slice(a, b + 1).join('\n'), name: '(excerpt)', reason: 'grep' });
        }
    }
    // 依存（呼んでいる関数）を1段だけ追加
    if (opt.deps) {
        const have = new Set(picked.map(p => p.file + ':' + p.from));
        const body = picked.filter(p => isJs(p.file)).map(p => p.text).join('\n');
        const cands = [];
        for (const [f, units] of Object.entries(allUnits)) for (const u of units) {
            if (have.has(f + ':' + u.from) || /^\(|\{/.test(u.name)) continue;
            const nm = u.name.replace(/^window\./, '');
            if (nm.length < 4) continue;
            if (new RegExp('(?<![A-Za-z0-9_$.])' + nm.replace(/\$/g, '\\$') + '\\s*\\(').test(body) || new RegExp('window\\.' + nm + '\\b').test(body)) cands.push({ file: f, ...u, reason: 'dep' });
        }
        cands.sort((a, b) => estTokens(a.text) - estTokens(b.text)); // 小さいものから入れる
        let used = picked.reduce((s, p) => s + estTokens(p.text), 0);
        for (const c of cands) { const t = estTokens(c.text); if (used + t > max) continue; picked.push(c); used += t; }
    }
    picked.sort((a, b) => a.file === b.file ? a.from - b.from : DEFAULT_FILES.indexOf(a.file) - DEFAULT_FILES.indexOf(b.file));
    let out = header(files, `# 抽出コンテキスト（検索: ${[names.length ? 'name=' + names.join('|') : '', grep ? 'grep=' + opt.grep : ''].filter(Boolean).join(' ')}）\n各 <code> ブロックは元ファイルから1文字も変えずに切り出した原文です。置換前コードはここから完全一致でコピーしてください。\n\n`);
    let total = 0, cut = 0;
    for (const p of picked) {
        const t = estTokens(p.text);
        if (total + t > max) { cut++; continue; }
        total += t;
        out += `<code file="${p.file}" lines="${p.from}-${p.to}" unit="${p.name.replace(/"/g, "'")}" why="${p.reason}">\n${p.text}\n</code>\n\n`;
    }
    if (cut) out += `<!-- 上限(${max}トークン)のため ${cut} 件を省略しました。--grep/--name を絞るか --max-tokens を増やしてください -->\n`;
    emit(out, 'pick.md', `${picked.length - cut}件 / 約${total.toLocaleString()}トークン`);
}


// ───────────── ask（全自動） ─────────────
const STOP = new Set(('error uncaught undefined function https http null true false this that with from have been will main version index html script window document console line column error:'.split(' ')));
const GENERIC_JP = new Set(['修正', '問題', 'バグ', 'エラー', 'お願い', '機能', '場合', '状態', '原因', '対応', '確認', '表示', '動作', '発生', '画面', 'ユーザー', '起き', '直し']);
const DICT = [
    ['通知', 'notif notification'], ['アイコン', 'avatar icon'], ['アバター', 'avatar'], ['検索', 'search'], ['個人チャット', 'dm'], ['DM', 'dm'],
    ['ログイン', 'auth login signin'], ['Google', 'google'], ['招待', 'invite'], ['暗号', 'e2ee encrypt roomkey'], ['復号', 'decrypt roomkey rescue'], ['鍵', 'roomkey key'],
    ['既読', 'lastread readstate'], ['未読', 'unread'], ['赤丸', 'badge notif'], ['スタンプ', 'stamp sticker'], ['通話', 'call agora voice'], ['ボイス', 'voice'], ['メッセージ', 'message'],
    ['サーバー', 'server'], ['ルーム', 'room channel'], ['設定', 'settings'], ['プロフィール', 'profile'], ['ブロック', 'block'], ['フレンド', 'friend'], ['友達', 'friend'],
    ['ファイル', 'file upload'], ['アップロード', 'upload'], ['削除', 'delete remove'], ['履歴', 'history older'], ['過去ログ', 'older history'], ['レポート', 'telemetry report'],
    ['更新', 'update'], ['管理', 'admin'], ['ストレージ', 'storage'], ['リカバリー', 'recovery'], ['ヘルスチェック', 'health'], ['ピン', 'pinned pin'], ['リアクション', 'reaction'],
    ['ニックネーム', 'nickname'], ['名前', 'nickname name'], ['新規登録', 'signup register createuser'], ['アカウント', 'account user'], ['サインアップ', 'signup'], ['退会', 'delete account'],
    ['送信', 'send'], ['受信', 'receive'], ['編集', 'edit'], ['テーマ', 'theme'], ['ダーク', 'dark'], ['音声', 'voice audio'], ['音', 'sound audio'], ['カメラ', 'camera video'], ['画面共有', 'screen share'], ['絵文字', 'emoji'],
    ['通報', 'report'], ['フィードバック', 'feedback'], ['お知らせ', 'announcement'], ['権限', 'permission role'], ['ロール', 'role'], ['カテゴリ', 'category'], ['チャンネル', 'channel room'], ['同期', 'sync'], ['オフライン', 'offline'],
    ['キャッシュ', 'cache'], ['バージョン', 'version'], ['ダウンロード', 'download'], ['インストール', 'install'], ['スマホ', 'mobile'], ['モバイル', 'mobile'], ['引用', 'quote reply'], ['転送', 'forward'], ['入力中', 'typing'],
    ['友達申請', 'friendrequest friend'], ['ミュート', 'mute'], ['ステータス', 'status presence'], ['参加', 'join'], ['退出', 'leave'], ['再設定', 'reset password'], ['メール', 'email'], ['ログ', 'log'], ['読み込', 'load'], ['保存', 'save'],
    ['返信', 'reply'], ['メンション', 'mention'], ['オンライン', 'online status presence'], ['タイピング', 'typing'], ['画像', 'image'], ['動画', 'video'], ['ログアウト', 'signout logout'], ['パスワード', 'password'],
];
function extractKeywords(text) {
    const t = text.replace(/https?:\/\/\S+/g, ' ').replace(/[\w.-]+\.(js|html|css|json|rs)(\?[^\s:]*)?(:\d+)*/gi, ' ');
    const kw = new Map();
    const put = (w, wt, minLen = 3) => { w = w.toLowerCase(); if (STOP.has(w) || w.length < minLen) return; kw.set(w, Math.max(kw.get(w) || 0, wt)); };
    for (const m of t.matchAll(/[A-Za-z_$][A-Za-z0-9_$]{2,}/g)) {
        const w = m[0]; const strong = /[a-z][A-Z]/.test(w) || /_/.test(w) || /[0-9]/.test(w) || /^[A-Z][a-z]+[A-Z]/.test(w);
        put(w, strong ? 3 : 1);
        // キャメルケースを分解（例: oldAvatarUrl → old / avatar / url）。完全一致する名前が無くても関連箇所に辿り着けるようにする
        if (strong) for (const part of w.split(/(?=[A-Z])|_|[0-9]+/)) if (part.length >= 4) put(part, 1.2);
    }
    for (const [jp, code] of DICT) if (t.toLowerCase().includes(jp.toLowerCase())) for (const c of code.split(' ')) put(c, 1.5, 2);
    for (const m of t.matchAll(/[゠-ヿ一-鿿]{2,}/g)) if (!GENERIC_JP.has(m[0])) put(m[0], 1);
    return kw;
}
async function readRequest() {
    if (opt.text) return String(opt.text);
    if (!process.stdin.isTTY) { const chunks = []; for await (const c of process.stdin) chunks.push(c); return Buffer.concat(chunks).toString('utf8'); }
    console.log('エラー文や直したい内容を貼り付けて、最後に Enter を2回押してください（空行が2回続くと確定します）:');
    const rl = (await import('node:readline')).createInterface({ input: process.stdin });
    return await new Promise((resolve) => {
        const lines = []; let blank = 0;
        rl.on('line', (l) => { if (l.trim() === '') blank++; else blank = 0; lines.push(l); if (blank >= 2 && lines.some(x => x.trim())) { rl.close(); } });
        rl.on('close', () => resolve(lines.join('\n')));
    });
}
const PROMPT_RULES = `# AIへの指示（このファイルの使い方）
このファイルには「【依頼内容】」と、修正に関係しそうな関数だけを元ファイルから原文のまま抜き出した <code> ブロックが入っています。
プロジェクト全体ではありません。末尾の「関数マップ」は、ここに載っていない関数の目次（コード無し）です。

## 守ること
1. 出力は「第1部: 問題点や改善点、追加項目 / 第2部: コード修正 / 第3部: 修正後の安全性検証サマリー」の3部構成にする（第2部は自動パッチスクリプトが読むので書式厳守）。
2. 🔍【置換前】は <code> ブロックの原文から1文字も変えずにコピーする（前後3〜5行のコンテキスト付き）。インデントや全角文字も変えない。
3. 置換前は、そのファイル内で1箇所にしか一致しない内容にする。同じ文が複数ありそうなら前後の行を増やして一意にする。
4. <code> ブロックに無いコードを推測で書かない。情報が足りない場合は、コード修正を出さずに
   「追加で必要: 関数名またはキーワード（理由）」を箇条書きで答えて止まる（関数名は末尾の関数マップから選ぶ）。
5. 新しい変数名・関数名を追加するときは、既存名との衝突（同名の const/let/function の二重宣言）に注意する。
   このファイルの範囲外に同名がある可能性があるなら、第3部に「要確認: 〇〇 が他に無いか検索してください」と書く。
6. 依頼と無関係なリファクタリングや、他の機能の挙動変更はしない。
`;
async function doAsk() {
    const reqText = (await readRequest()).trim();
    if (!reqText) { console.error('依頼内容が空でした'); process.exit(1); }
    const budget = Number(opt.budget || 60000);
    const files = list(opt.file).length ? list(opt.file) : DEFAULT_FILES;
    const kw = extractKeywords(reqText + ' ' + (opt.add || '').replace(/,/g, ' '));
    const all = [];
    for (const f of files) { if (!exists(f)) continue; const src = rd(f); for (const u of splitUnits(src)) if (u.name !== '(import)') all.push({ file: f, ...u, tok: estTokens(u.text), low: u.text.toLowerCase(), lname: u.name.toLowerCase() }); }
    const N = all.length;
    const stats = new Map();
    for (const [k, w] of kw) { let df = 0; for (const u of all) if (u.low.includes(k)) df++; if (df > 0) stats.set(k, { w, df, idf: Math.log(1 + N / df) }); }
    for (const u of all) {
        let sc = 0;
        for (const [k, st] of stats) {
            let c = 0, idx = -1; while ((idx = u.low.indexOf(k, idx + 1)) >= 0 && c < 20) c++;
            if (c) sc += st.w * st.idf * (1 + Math.log(c));
            if (u.lname.includes(k)) sc += st.w * st.idf * 3;
        }
        u.score = sc / (1 + 0.35 * Math.log(1 + u.tok / 300));
    }
    for (const n of list(opt.add)) for (const u of all) if (u.lname.includes(n.toLowerCase())) u.score += 1000;
    const ranked = all.filter(u => u.score > 0).sort((a, b) => b.score - a.score);
    const chosen = []; let used = 0;
    for (const u of ranked) { if (used + u.tok > budget) continue; if (u.score < ranked[0].score * Number(opt.cut || 0.3) && chosen.length >= 6) break; chosen.push(u); used += u.tok; }
    // 依存関数（選ばれた関数が呼んでいる関数）を、予算の余りで追加
    const have = new Set(chosen.map(u => u.file + ':' + u.from)); const body = chosen.map(u => u.text).join('\n');
    const deps = [];
    for (const u of all) {
        if (have.has(u.file + ':' + u.from) || /^\(|\{/.test(u.name)) continue;
        const nm = u.name.replace(/^window\./, ''); if (nm.length < 4) continue;
        const refs = (body.match(new RegExp('(?<![A-Za-z0-9_$.])' + nm.replace(/\$/g, '\\$') + '\\s*\\(', 'g')) || []).length;
        if (refs) deps.push({ ...u, refs });
    }
    deps.sort((a, b) => b.refs - a.refs || a.tok - b.tok);
    const depBudget = Math.min(Math.round(budget * 0.35), budget + 30000 - used);
    let dused = 0; const depChosen = [];
    for (const d of deps) { if (d.tok > 6000 || dused + d.tok > depBudget) continue; depChosen.push(d); dused += d.tok; }
    const picked = [...chosen.map(u => ({ ...u, why: 'match' })), ...depChosen.map(u => ({ ...u, why: 'dep' }))]
        .sort((a, b) => a.file === b.file ? a.from - b.from : files.indexOf(a.file) - files.indexOf(b.file));
    const kwList = [...stats.entries()].sort((a, b) => b[1].w * b[1].idf - a[1].w * a[1].idf).slice(0, 25).map(([k]) => k).join(', ');
    const topScore0 = ranked.length ? ranked[0].score : 0;
    const lowConf = topScore0 < 12;
    const lowNote = lowConf ? '\n> ⚠ 自動選択の確信度が低く、依頼に関係する関数が下の抜粋に含まれていない可能性が高いです。推測でコードを書かず、まず末尾の関数マップから「追加で必要: 関数名」を答えてください。\n' : '';
    let out = `${PROMPT_RULES}${lowNote}\n## 【依頼内容】\n${reqText}\n\n<!-- 自動検出キーワード: ${kwList} / 抜粋 ${picked.length}件 約${(used + dused).toLocaleString()}トークン -->\n\n## 抜粋コード\n\n`;
    for (const p of picked) out += `<code file="${p.file}" lines="${p.from}-${p.to}" unit="${p.name.replace(/"/g, "'")}" why="${p.why}">\n${p.text}\n</code>\n\n`;
    if (!opt['no-map'] || lowConf) {
        out += '## 関数マップ（ここに載っていない関数の目次。コード無し。形式: 行範囲 (約トークン) 名前）\n';
        const inPicked = new Set(picked.map(p => p.file + ':' + p.from));
        let curF = '';
        for (const u of all) {
            if (inPicked.has(u.file + ':' + u.from)) continue;
            if (u.name.startsWith('(stmt)') && u.to - u.from < 5) continue;
            if (u.file !== curF) { curF = u.file; out += `### ${curF}\n`; }
            out += `${u.from}-${u.to} (${u.tok}) ${u.name}\n`;
        }
    }
    const topScore = ranked.length ? ranked[0].score : 0;
    if (process.env.AI_CTX_DEBUG) console.log('top=' + topScore.toFixed(1) + ' strongKw=' + [...stats.values()].filter(v => v.w >= 3).length);
    out += '\n## 最後に再確認（回答前に必ず守る）\n- 3部構成（第1部/第2部/第3部）で出力する\n- 🔍【置換前】は上の <code> の原文を1文字も変えずにコピーし、ファイル内で1箇所にだけ一致する内容にする\n- <code> に無いコードを推測で書かない。足りなければ「追加で必要: 関数名（理由）」だけ答えて止まる\n- 新しい変数名・関数名が既存と二重宣言にならないか確認する\n';
    emit(out, 'for-ai.md', `${picked.length}件の関数を自動選択 / 約${(used + dused).toLocaleString()}トークン / キーワード: ${kwList.split(', ').slice(0, 8).join(', ')} …`);
    if (lowConf) console.log('\n⚠ 依頼文から関連する関数を自信を持って選べませんでした。依頼文にエラーメッセージ・関数名・画面上の文言を足して再実行すると精度が上がります（そのままAIに渡しても、関数マップから追加を頼む指示が入っています）。');
    console.log('\n次の手順: ai-context/for-ai.md を AI Studio に添付し、「添付ファイルの指示に従ってください」と送信。');
    console.log('AIが「追加で必要: ○○」と答えたら:  node scripts/ai-context.mjs ask --add ○○   （同じ依頼文を貼り直し）');
    return { picked, kw };
}

// ───────────── check（パッチ適用後の構文検査） ─────────────
async function doCheck() {
    const { spawnSync } = await import('node:child_process');
    const files = list(opt.file).length ? list(opt.file) : DEFAULT_FILES;
    const targets = [...files.filter(exists).map(f => ({ name: f, code: rd(f) }))];
    for (const h of ['public/recovery.html', 'public/auth-desktop.html', 'public/index.html']) {
        if (!exists(h)) continue; const html = rd(h); let i = 0;
        for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) { if (/type\s*=\s*["']?(application\/(ld\+)?json|text\/template)/i.test(m[1]) || !m[2].trim()) continue; targets.push({ name: `${h} (script #${++i})`, code: m[2] }); }
    }
    let ng = 0;
    for (const t of targets) {
        const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: t.code, encoding: 'utf8' });
        if (r.status === 0) console.log(`OK   ${t.name}`); else { ng++; console.log(`NG   ${t.name}\n${(r.stderr || '').split('\n').slice(0, 6).join('\n')}`); }
    }
    console.log(ng ? `\n✖ ${ng} 件で構文エラー。パッチを戻すか、上のエラー文をそのままAIに貼って直してもらってください。` : '\n✔ すべて構文エラーなし');
    process.exit(ng ? 1 : 0);
}

function emit(text, file, summary) {
    if (opt.stdout) { process.stdout.write(text); return; }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const p = path.join(OUT_DIR, file); fs.writeFileSync(p, text);
    console.log(`✔ ${p} を出力しました（${summary} / ファイル自体は約${estTokens(text).toLocaleString()}トークン）`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
    if (cmd === 'map') doMap(); else if (cmd === 'pick') doPick(); else if (cmd === 'check') await doCheck();
    else if (cmd === 'help' || cmd === '--help') console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace('#!/usr/bin/env node\n', ''));
    else await doAsk();
}

export { splitUnits, extractKeywords };
