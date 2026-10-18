#!/usr/bin/env node
/**
 * ai-context.mjs  ―  Gemini 3.8 Flash (1M制限) に最適化されたコンテキスト抽出・分割監査エンジン
 *
 * 使い方（プロジェクトのルートで）:
 *   1) 特定の不具合を直す場合:
 *      node scripts/ai-context.mjs
 *      エラー文や直したい内容を貼り付け → 空行2回で確定 → ai-context/for-ai.md が完成
 *
 *   2) コードベース全体を監査する場合:
 *      node scripts/ai-context.mjs audit [--size 220000]
 *      全89万トークンを安全なサイズ（約18万〜22万トークン×4〜5回）に分割出力
 *      （Gemini 3.8 Flash High の思考トークン＋出力バッファを圧迫せず確実に完走）
 *
 *   3) AIの回答パッチを適用前にリハーサル検証する場合:
 *      node scripts/ai-context.mjs verify [回答.txt]
 *      クリップボードまたはファイル内の【置換前】コードがファイル内に実在するか事前照合
 *      二重宣言（oldAvatarUrl等の重複定義）の危険も事前に警告
 *
 *   4) パッチ適用後の構文検査:
 *      node scripts/ai-context.mjs check
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_FILES = [
    'public/index.html',
    'public/js/main.js',
    'public/js/crypto_helpers.js',
    'public/js/local_store.js',
    'public/js/utils.js',
    'public/js/ui_helpers.js',
    'public/js/text_formatter.js',
    'public/js/file_uploader.js',
    'public/js/debug_ui.js',
    'public/firebase-messaging-sw.js',
    'server/src/index.js',
    'firestore.rules',
    'database.rules.json'
];
const OUT_DIR = 'ai-context';

// ───────────── 引数 ─────────────
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = { context: 30, 'max-tokens': 120000, size: 220000 };
for (let i = (argv[0] && argv[0].startsWith('--') ? 0 : 1); i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    if (['deps', 'stdout', 'no-map', 'domains'].includes(k)) opt[k] = true; else opt[k] = argv[++i];
}
const list = (v) => (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : []);

// ───────────── トークン概算（日本語は約1文字=1トークン / 英数は約3.6文字=1トークン） ─────────────
const estTokens = (s) => {
    if (!s) return 0;
    let a = 0;
    for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 128) a++;
    return Math.round(a / 3.6 + (s.length - a) * 1.1);
};

const rd = (f) => fs.readFileSync(f, 'utf8');
const exists = (f) => fs.existsSync(f);
const isJs = (f) => /\.(m?js)$/.test(f);
const isHtml = (f) => /\.html$/i.test(f);

function isStubUnit(text) {
    const lines = text.split('\n').filter(l => l.trim() && !/^\s*(\/\/|\/\*|\*)/.test(l));
    if (lines.length > 4) return false;
    const body = lines.join(' ');
    return /return\s+(?:window\.)?[_A-Za-z0-9$]+\s*\(/i.test(body) ||
           /^\s*(?:window\.[_A-Za-z0-9$]+\s*=\s*[_A-Za-z0-9$]+;?\s*)+$/.test(body);
}

// ───────────── JSを「トップレベルの塊（関数・変数・イベント登録）」に分割 ─────────────
function splitJsUnits(src) {
    const n = src.length, lineStart = [0];
    for (let i = 0; i < n; i++) if (src[i] === '\n') lineStart.push(i + 1);
    const lineOf = (pos) => {
        let lo = 0, hi = lineStart.length - 1;
        while (lo < hi) {
            const m = (lo + hi + 1) >> 1;
            if (lineStart[m] <= pos) lo = m; else hi = m - 1;
        }
        return lo;
    };
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
        if (c === '/' && d === '*') {
            const e = src.indexOf('*/', i + 2);
            const end = e < 0 ? n : e + 2;
            const l0 = lineOf(i), l1 = lineOf(end - 1);
            for (let k = l0 + 1; k <= l1; k++) inComment[k] = true;
            i = end; markLines(i); continue;
        }
        if (c === '"' || c === "'") {
            i++; while (i < n && src[i] !== c) { if (src[i] === '\\') i++; i++; }
            i++; prevSig = 'x'; markLines(i); continue;
        }
        if (c === '`') {
            i++;
            tplLoop: while (i < n) {
                if (src[i] === '\\') { i += 2; continue; }
                if (src[i] === '`') { i++; break; }
                if (src[i] === '$' && src[i + 1] === '{') { tplStack.push(depth); depth++; i += 2; break tplLoop; }
                i++;
            }
            prevSig = 'x'; markLines(i); continue;
        }
        if (c === '}' && tplStack.length && depth - 1 === tplStack[tplStack.length - 1]) {
            depth--; tplStack.pop(); i++;
            while (i < n) {
                if (src[i] === '\\') { i += 2; continue; }
                if (src[i] === '`') { i++; break; }
                if (src[i] === '$' && src[i + 1] === '{') { tplStack.push(depth); depth++; i += 2; break; }
                i++;
            }
            prevSig = 'x'; markLines(i); continue;
        }
        if (c === '/' && regexOK()) {
            i++; let inCls = false;
            while (i < n && src[i] !== '\n') {
                if (src[i] === '\\') { i += 2; continue; }
                if (src[i] === '[') inCls = true; else if (src[i] === ']') inCls = false;
                else if (src[i] === '/' && !inCls) break;
                i++;
            }
            i++; while (/[a-z]/i.test(src[i] || '')) i++;
            prevSig = 'x'; continue;
        }
        if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
        prevSig = /[A-Za-z0-9_$]/.test(c) ? (() => {
            let j = i; while (/[A-Za-z0-9_$]/.test(src[j] || '')) j++;
            const w = src.slice(i, j); i = j - 1; return w;
        })() : c;
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
        if (/[,=:+\-*/&|?(\[{]\s*$/.test(lines[p].replace(/\/\/.*$/, '').trimEnd()) && !/\*\/\s*$/.test(lines[p])) continue;
        let s = ln; while (s > start && /^\s*(\/\/|\/\*|\*)/.test(lines[s - 1])) s--;
        if (s > start) { units.push([start, s - 1]); start = s; }
    }
    units.push([start, total - 1]);
    return units.map(([a, b]) => {
        while (b > a && isBlank(lines[b])) b--;
        const text = lines.slice(a, b + 1).join('\n');
        return { from: a + 1, to: b + 1, text, name: unitName(text), isStub: isStubUnit(text) };
    });
}

// ───────────── HTMLを論理ブロック（スクリプト、主要モーダル、セクション）に分割 ─────────────
function splitHtmlUnits(src) {
    const lines = src.split('\n');
    const units = [];
    let start = 0;
    let inScript = false;
    let scriptStart = 0;

    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (/<script\b/i.test(l) && !inScript) {
            if (i > start) {
                units.push([start, i - 1]);
            }
            inScript = true;
            scriptStart = i;
        }
        if (/<\/script>/i.test(l) && inScript) {
            inScript = false;
            units.push([scriptStart, i]);
            start = i + 1;
        } else if (!inScript) {
            // 主要なモーダルや画面コンテナの開始地点で区切る
            if (/id="[A-Za-z0-9_-]*(?:Modal|Overlay|Screen|Container|Drawer|Sidebar)"/i.test(l) && i - start > 40) {
                units.push([start, i - 1]);
                start = i;
            }
        }
    }
    if (start < lines.length) units.push([start, lines.length - 1]);

    return units.map(([a, b]) => {
        const text = lines.slice(a, b + 1).join('\n');
        let name = '(html section)';
        const mScript = text.match(/<script(?![^>]*\bsrc=)([^>]*)>/i);
        const mId = text.match(/id="([A-Za-z0-9_-]+)"/i);
        if (mScript) name = '<script> ' + (text.slice(0, 80).replace(/\n/g, ' '));
        else if (mId) name = `#${mId[1]}`;
        return { from: a + 1, to: b + 1, text, name, isStub: false };
    });
}

function splitUnits(src, filePath = '') {
    if (filePath.endsWith('.html')) return splitHtmlUnits(src);
    return splitJsUnits(src);
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

function header(files, extra = '') {
    let ver = ''; try { ver = JSON.parse(rd('public/version.json')).version; } catch (_) { }
    return `<!-- ai-context ${new Date().toISOString()} / app version: ${ver || '?'} -->\n${extra}`;
}

// ───────────── map ─────────────
function doMap() {
    const files = list(opt.file).length ? list(opt.file) : DEFAULT_FILES;
    let out = header(files, `# 関数マップ（目次）\nこの一覧は「どこに何があるか」だけを示します。コードは含みません。\n形式: \`開始行-終了行 (約トークン) 名前\`\n\n`);
    let tot = 0;
    for (const f of files) {
        if (!exists(f)) continue;
        const src = rd(f); const t = estTokens(src); tot += t;
        out += `## ${f}  (全体 約${t.toLocaleString()}トークン / ${src.split('\n').length}行)\n`;
        const units = splitUnits(src, f).filter(u => u.name !== '(import)');
        for (const u of units) {
            const size = u.to - u.from + 1;
            if (u.name.startsWith('(stmt)') && size < 6) continue;
            out += `${u.from}-${u.to} (${estTokens(u.text)}) ${u.name}\n`;
        }
        out += '\n';
    }
    emit(out, 'map.md', `全ファイル合計 約${tot.toLocaleString()}トークン`);
}

// ───────────── キーワード抽出 ─────────────
const STOP = new Set(('error uncaught undefined function https http null true false this that with from have been will main version index html script window document console line column error:'.split(' ')));
const GENERIC_JP = new Set(['修正', '問題', 'バグ', 'エラー', 'お願い', '機能', '場合', '状態', '原因', '対応', '確認', '表示', '動作', '発生', '画面', 'ユーザー', '起き', '直し']);
const DICT = [
    ['通知', 'notif notification'], ['アイコン', 'avatar icon'], ['アバター', 'avatar'], ['検索', 'search'], ['個人チャット', 'dm'], ['DM', 'dm'],
    ['ログイン', 'auth login signin'], ['Google', 'google'], ['招待', 'invite'], ['暗号', 'e2ee encrypt roomkey'], ['復号', 'decrypt roomkey rescue'], ['鍵', 'roomkey key'],
    ['既読', 'lastread readstate'], ['未読', 'unread'], ['赤丸', 'badge notif'], ['スタンプ', 'stamp sticker'], ['通話', 'call agora voice'], ['ボイス', 'voice'], ['メッセージ', 'message'],
    ['サーバー', 'server'], ['ルーム', 'room channel'], ['設定', 'settings'], ['プロフィール', 'profile'], ['ブロック', 'block'], ['フレンド', 'friend'], ['友達', 'friend'],
    ['ファイル', 'file upload download'], ['アップロード', 'upload'], ['ダウンロード', 'download file'], ['削除', 'delete remove'], ['履歴', 'history older loadolder'], ['過去ログ', 'older history scroll'],
    ['更新', 'update'], ['管理', 'admin'], ['ストレージ', 'storage'], ['リカバリー', 'recovery watchdog'], ['ウォッチドッグ', 'watchdog timeout'], ['ピン', 'pinned pin'], ['リアクション', 'reaction'],
    ['ニックネーム', 'nickname'], ['名前', 'nickname name'], ['新規登録', 'signup register createuser'], ['アカウント', 'account user'], ['サインアップ', 'signup'], ['退会', 'delete account'],
    ['送信', 'send'], ['受信', 'receive'], ['編集', 'edit'], ['テーマ', 'theme'], ['スクロール', 'scroll loadolder older'], ['最上部', 'scroll top older'],
];

function extractKeywords(text) {
    const t = text.replace(/https?:\/\/\S+/g, ' ').replace(/[\w.-]+\.(js|html|css|json|rs)(\?[^\s:]*)?(:\d+)*/gi, ' ');
    const kw = new Map();
    const put = (w, wt, minLen = 3) => { w = w.toLowerCase(); if (STOP.has(w) || w.length < minLen) return; kw.set(w, Math.max(kw.get(w) || 0, wt)); };
    for (const m of t.matchAll(/[A-Za-z_$][A-Za-z0-9_$]{2,}/g)) {
        const w = m[0]; const strong = /[a-z][A-Z]/.test(w) || /_/.test(w) || /[0-9]/.test(w) || /^[A-Z][a-z]+[A-Z]/.test(w);
        put(w, strong ? 3 : 1);
        if (strong) for (const part of w.split(/(?=[A-Z])|_|[0-9]+/)) if (part.length >= 4) put(part, 1.2);
    }
    for (const [jp, code] of DICT) if (t.toLowerCase().includes(jp.toLowerCase())) for (const c of code.split(' ')) put(c, 1.8, 2);
    for (const m of t.matchAll(/[゠-ヿ一-鿿]{2,}/g)) if (!GENERIC_JP.has(m[0])) put(m[0], 1);
    return kw;
}

async function readRequest() {
    if (opt.text) return String(opt.text);
    if (!process.stdin.isTTY) {
        const chunks = []; for await (const c of process.stdin) chunks.push(c);
        return Buffer.concat(chunks).toString('utf8');
    }
    console.log('エラー文や直したい内容を貼り付けて、最後に Enter を2回押してください（空行が2回続くと確定します）:');
    const rl = (await import('node:readline')).createInterface({ input: process.stdin });
    return await new Promise((resolve) => {
        const lines = []; let blank = 0;
        rl.on('line', (l) => {
            if (l.trim() === '') blank++; else blank = 0;
            lines.push(l);
            if (blank >= 2 && lines.some(x => x.trim())) { rl.close(); }
        });
        rl.on('close', () => resolve(lines.join('\n')));
    });
}

function getPromptRules(extraTitle = '') {
    const promptFile = 'scripts/ai-prompt.txt';
    if (exists(promptFile)) {
        return rd(promptFile);
    }
    return `# AIへの指示（Gemini 3.8 Flash 最適化）${extraTitle ? ' - ' + extraTitle : ''}
このファイルには修正に必要なコードブロック（\`<code file="..." lines="...">\`）が含まれています。

## 守ること
1. 出力は「第1部: 原因分析と修正方針 / 第2部: コード修正パッチ / 第3部: 修正後の安全性検証サマリー」の3部構成にしてください。
2. 第2部は自動パッチスクリプト（patch.js）が解釈するため、以下の形式を厳守してください:
\`\`\`text
ファイル: パス/ファイル名
🔍【置換前】
// 抜粋コードから前後の文脈を含む1文字も変えない完全一致コピー
=======
// 修正後コード
\`\`\`
3. 🔍【置換前】は抜粋コードから完全にコピーし、ファイル内で一意に特定できる十分な長さ（前後3〜5行）を含めてください。
4. 抜粋コードに含まれていない範囲のコードを推測で書かないでください。
5. 新たな変数・関数を宣言するときは、同名変数（const/let）の重複宣言による SyntaxError を絶対に起こさないよう、既存変数名と衝突しない命名にしてください。
`;
}

// ───────────── ask（特定バグ向け自動絞り込み） ─────────────
async function doAsk() {
    const reqText = (await readRequest()).trim();
    if (!reqText) { console.error('依頼内容が空でした'); process.exit(1); }
    const budget = Number(opt.budget || 80000);
    const files = list(opt.file).length ? list(opt.file) : DEFAULT_FILES;
    const kw = extractKeywords(reqText + ' ' + (opt.add || '').replace(/,/g, ' '));
    const all = [];

    for (const f of files) {
        if (!exists(f)) continue;
        const src = rd(f);
        for (const u of splitUnits(src, f)) {
            if (u.name !== '(import)') {
                all.push({
                    file: f, ...u,
                    tok: estTokens(u.text),
                    low: u.text.toLowerCase(),
                    lname: u.name.toLowerCase()
                });
            }
        }
    }

    const N = all.length;
    const stats = new Map();
    for (const [k, w] of kw) {
        let df = 0; for (const u of all) if (u.low.includes(k)) df++;
        if (df > 0) stats.set(k, { w, df, idf: Math.log(1 + N / df) });
    }

    for (const u of all) {
        let sc = 0;
        for (const [k, st] of stats) {
            let c = 0, idx = -1;
            while ((idx = u.low.indexOf(k, idx + 1)) >= 0 && c < 20) c++;
            if (c) sc += st.w * st.idf * (1 + Math.log(c));
            if (u.lname.includes(k)) sc += st.w * st.idf * 3.5;
        }
        // 単なる1行転送スタブはスコアを大幅に減衰
        if (u.isStub) sc *= 0.1;
        u.score = sc / (1 + 0.35 * Math.log(1 + u.tok / 300));
    }

    for (const n of list(opt.add)) {
        for (const u of all) if (u.lname.includes(n.toLowerCase())) u.score += 1000;
    }

    const ranked = all.filter(u => u.score > 0).sort((a, b) => b.score - a.score);
    const chosen = []; let used = 0;
    for (const u of ranked) {
        if (used + u.tok > budget) continue;
        if (u.score < ranked[0].score * Number(opt.cut || 0.25) && chosen.length >= 8) break;
        chosen.push(u);
        used += u.tok;
    }

    // 依存関数を追加（1行スタブは除外してトークンの浪費を防ぐ）
    const have = new Set(chosen.map(u => u.file + ':' + u.from));
    const body = chosen.map(u => u.text).join('\n');
    const deps = [];
    for (const u of all) {
        if (have.has(u.file + ':' + u.from) || /^\(|\{/.test(u.name) || u.isStub) continue;
        const nm = u.name.replace(/^window\./, '');
        if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(nm) || nm.length < 4) continue;
        const refs = (body.match(new RegExp('(?<![A-Za-z0-9_$.])' + nm.replace(/\$/g, '\\$') + '\\s*\\(', 'g')) || []).length;
        if (refs) deps.push({ ...u, refs });
    }
    deps.sort((a, b) => b.refs - a.refs || a.tok - b.tok);
    const depBudget = Math.min(Math.round(budget * 0.4), 35000);
    let dused = 0; const depChosen = [];
    for (const d of deps) {
        if (d.tok > 5000 || dused + d.tok > depBudget) continue;
        depChosen.push(d);
        dused += d.tok;
    }

    const picked = [...chosen.map(u => ({ ...u, why: 'match' })), ...depChosen.map(u => ({ ...u, why: 'dep' }))]
        .sort((a, b) => a.file === b.file ? a.from - b.from : files.indexOf(a.file) - files.indexOf(b.file));

    const kwList = [...stats.entries()].sort((a, b) => b[1].w * b[1].idf - a[1].w * a[1].idf).slice(0, 25).map(([k]) => k).join(', ');
    const promptRules = getPromptRules('特定不具合対応');

    let out = `${promptRules}\n## 【依頼内容】\n${reqText}\n\n<!-- 検出キーワード: ${kwList} / 抜粋 ${picked.length}件 約${(used + dused).toLocaleString()}トークン -->\n\n## 抜粋コード\n\n`;
    for (const p of picked) {
        out += `<code file="${p.file}" lines="${p.from}-${p.to}" unit="${p.name.replace(/"/g, "'")}" why="${p.why}">\n${p.text}\n</code>\n\n`;
    }

    if (!opt['no-map']) {
        out += '## 関数マップ（目次 / コード無し）\n';
        const inPicked = new Set(picked.map(p => p.file + ':' + p.from));
        let curF = '';
        for (const u of all) {
            if (inPicked.has(u.file + ':' + u.from) || u.isStub) continue;
            if (u.file !== curF) { curF = u.file; out += `### ${curF}\n`; }
            out += `${u.from}-${u.to} (${u.tok}) ${u.name}\n`;
        }
    }

    emit(out, 'for-ai.md', `${picked.length}件の関連コードを厳選 / 約${(used + dused).toLocaleString()}トークン`);
    console.log('\n✔ ai-context/for-ai.md を AI Studio に添付し送信してください。');
}

// ───────────── audit（Gemini 3.8 Flash 向け全体分割監査） ─────────────
async function doAudit() {
    const targetSize = Number(opt.size || 220000);
    const files = list(opt.file).length ? list(opt.file) : DEFAULT_FILES;
    console.log(`🔍 全コードベースを走査中（1ファイル上限: 約${targetSize.toLocaleString()}トークン / Gemini 3.8 Flash最適化）...`);

    const allUnits = [];
    let grandTokens = 0;
    for (const f of files) {
        if (!exists(f)) continue;
        const src = rd(f);
        const units = splitUnits(src, f);
        for (const u of units) {
            const tok = estTokens(u.text);
            allUnits.push({ file: f, ...u, tok });
            grandTokens += tok;
        }
    }

    // 分割パートの作成（関数の途中で切断しない）
    const parts = [];
    let curUnits = [], curTok = 0;

    for (const u of allUnits) {
        if (curTok + u.tok > targetSize && curUnits.length > 0) {
            parts.push({ units: curUnits, tokens: curTok });
            curUnits = [];
            curTok = 0;
        }
        curUnits.push(u);
        curTok += u.tok;
    }
    if (curUnits.length > 0) parts.push({ units: curUnits, tokens: curTok });

    const totalParts = parts.length;
    console.log(`📦 全体約 ${grandTokens.toLocaleString()} トークンを ${totalParts} パートに分割出力します。\n`);

    for (let idx = 0; idx < totalParts; idx++) {
        const p = parts[idx];
        const partNo = idx + 1;
        const filename = `audit-${partNo}of${totalParts}.md`;
        const promptRules = getPromptRules(`全体監査 パート ${partNo}/${totalParts}`);

        let out = `${promptRules}\n`;
        out += `## 【監査対象スコープ: パート ${partNo}/${totalParts}】\n`;
        out += `本ファイルには全コードベース（約${grandTokens.toLocaleString()}トークン）のうち、第 ${partNo} パート（約${p.tokens.toLocaleString()}トークン）のコードが含まれています。\n`;
        out += `- 監査はこのブロックに含まれるコードのみを対象とし、他パートに属する外部関数は推測で変更しないでください。\n`;
        out += `- バグ修正や構文不備の修正パッチは、必ず <code> ブロックの原文から完全一致の【置換前】コードをコピーして出力してください。\n\n`;
        out += `## コード本文\n\n`;

        for (const u of p.units) {
            out += `<code file="${u.file}" lines="${u.from}-${u.to}" unit="${u.name.replace(/"/g, "'")}">\n${u.text}\n</code>\n\n`;
        }

        emit(out, filename, `パート ${partNo}/${totalParts}: 約${p.tokens.toLocaleString()}トークン`);
    }

    console.log(`\n🎉 全 ${totalParts} ファイルを ai-context/ に出力しました！`);
    console.log(`Gemini 3.8 Flash に audit-1of${totalParts}.md から順番に添付して監査を実行してください。`);
}

// ───────────── verify（適用前リハーサル検査） ─────────────
async function doVerify(targetArg) {
    let text = '';
    if (targetArg && exists(targetArg)) {
        text = rd(targetArg);
        console.log(`📄 指定ファイルからパッチを検査します: ${targetArg}`);
    } else {
        if (process.platform === 'win32') {
            try {
                const { execSync } = await import('node:child_process');
                const cmd = 'powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard -Raw"';
                text = execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
                if (text && text.trim()) console.log(`📋 クリップボードからパッチを読み込みました (${text.length.toLocaleString()} 文字)`);
            } catch (_) {}
        }
    }

    if (!text || (!text.includes('【置換前') && !text.includes('<<<<<<< SEARCH') && !text.includes('置換前'))) {
        console.error('❌ 検証対象のパッチテキストが見つかりません。AIの回答をクリップボードにコピーするか、ファイルを指定してください:');
        console.error('   例: node scripts/ai-context.mjs verify 回答.txt');
        process.exit(1);
    }

    // パッチブロックの抽出
    const blocks = [];
    const lines = text.split('\n');
    let currentFile = null;
    let searchLines = [], replaceLines = [];
    let state = 'IDLE';

    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const tr = l.trim();
        const fm = tr.match(/(?:ファイル|File|TargetFile)\s*[:：]\s*[`"']?([A-Za-z0-9_.\-\/\\]+)[`"']?/i);
        if (fm && !tr.includes('第') && !tr.includes('サマリー')) {
            if (searchLines.length > 0 && currentFile) {
                blocks.push({ file: currentFile, search: searchLines.join('\n'), replace: replaceLines.join('\n') });
                searchLines = []; replaceLines = [];
            }
            currentFile = fm[1].replace(/\\/g, '/');
            state = 'IDLE';
            continue;
        }

        if (tr.includes('【置換前】') || tr.includes('<<<<<<< SEARCH') || tr === '置換前') {
            if (searchLines.length > 0 && currentFile) {
                blocks.push({ file: currentFile, search: searchLines.join('\n'), replace: replaceLines.join('\n') });
                searchLines = []; replaceLines = [];
            }
            state = 'SEARCH';
            continue;
        }
        if (tr.includes('【置換後】') || tr.includes('=======') || tr === '置換後') {
            state = 'REPLACE';
            continue;
        }
        if (tr.includes('>>>>>>> REPLACE') || tr.includes('【置換終了】')) {
            if (searchLines.length > 0 && currentFile) {
                blocks.push({ file: currentFile, search: searchLines.join('\n'), replace: replaceLines.join('\n') });
                searchLines = []; replaceLines = [];
            }
            state = 'IDLE';
            continue;
        }

        if (state === 'SEARCH') {
            if (tr.startsWith('```')) continue;
            searchLines.push(l);
        } else if (state === 'REPLACE') {
            if (tr.startsWith('```')) continue;
            replaceLines.push(l);
        }
    }
    if (searchLines.length > 0 && currentFile) {
        blocks.push({ file: currentFile, search: searchLines.join('\n'), replace: replaceLines.join('\n') });
    }

    console.log(`\n🔍 検出されたパッチブロック: 計 ${blocks.length} 箇所\n`);
    let pass = 0, fail = 0;

    for (let idx = 0; idx < blocks.length; idx++) {
        const b = blocks[idx];
        const f = b.file;
        console.log(`[ブロック ${idx + 1}/${blocks.length}] 対象: ${f}`);
        if (!exists(f)) {
            console.log(`   ❌ ファイルが存在しません: ${f}`);
            fail++;
            continue;
        }
        const src = rd(f).replace(/\r\n/g, '\n');
        const search = b.search.trim().replace(/\r\n/g, '\n');
        if (!search) {
            console.log(`   ⚠ 検索コードが空です（追記扱い）`);
            pass++;
            continue;
        }

        const pos = src.indexOf(search);
        if (pos === -1) {
            console.log(`   ❌ 【置換前】がファイル内で見つかりません。`);
            console.log(`      検索先頭: "${search.split('\n')[0].slice(0, 60)}"`);
            fail++;
        } else {
            const second = src.indexOf(search, pos + 1);
            if (second !== -1) {
                console.log(`   ⚠ 警告: 検索コードがファイル内に2箇所以上マッチします（誤爆の危険）。コンテキスト行を増やしてください。`);
                fail++;
            } else {
                const lineNo = src.slice(0, pos).split('\n').length;
                console.log(`   ✔ 完全一致確認 (行番号: 約${lineNo}行目)`);
                pass++;
            }
        }

        // 二重宣言の事前検査
        for (const m of b.replace.matchAll(/(?:const|let|var|function)\s+([A-Za-z0-9_$]+)/g)) {
            const varName = m[1];
            if (varName.length < 4) continue;
            // 既存ファイル内で検索ブロック外にある同名変数を検出
            const regex = new RegExp(`(?:const|let)\\s+${varName}\\b`, 'g');
            const matches = [...src.matchAll(regex)];
            if (matches.length > 1) {
                console.log(`   ⚠ 【二重宣言リスク検知】変数 '${varName}' が既存ファイル内に既に宣言されています。構文エラーに注意してください。`);
            }
        }
    }

    console.log('\n============================================================');
    if (fail === 0) {
        console.log(`🎉 【リハーサル合格】全 ${pass} 箇所の置換ブロックが安全に適用可能です！`);
        console.log(`   → このまま通常通り patch.bat または node patch.js を実行してください。`);
    } else {
        console.log(`❌ 【リハーサル不合格】${fail} 箇所のブロックで照合失敗または多重一致を検出しました。`);
        console.log(`   → 修正を適用する前にAIに再度「置換前コードの一致」を指示してください。`);
    }
    console.log('============================================================\n');
}

// ───────────── check（構文検査） ─────────────
async function doCheck() {
    const { spawnSync } = await import('node:child_process');
    const files = list(opt.file).length ? list(opt.file) : DEFAULT_FILES;
    const targets = [...files.filter(exists).filter(isJs).map(f => ({ name: f, code: rd(f) }))];
    for (const h of ['public/recovery.html', 'public/auth-desktop.html', 'public/index.html']) {
        if (!exists(h)) continue; const html = rd(h); let i = 0;
        for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) {
            if (/type\s*=\s*["']?(application\/(ld\+)?json|text\/template)/i.test(m[1]) || !m[2].trim()) continue;
            targets.push({ name: `${h} (script #${++i})`, code: m[2] });
        }
    }
    let ng = 0;
    for (const t of targets) {
        const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: t.code, encoding: 'utf8' });
        if (r.status === 0) console.log(`OK   ${t.name}`);
        else { ng++; console.log(`NG   ${t.name}\n${(r.stderr || '').split('\n').slice(0, 6).join('\n')}`); }
    }
    console.log(ng ? `\n✖ ${ng} 件で構文エラー。` : '\n✔ すべて構文エラーなし');
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
    if (cmd === 'map') doMap();
    else if (cmd === 'pick') doPick();
    else if (cmd === 'check') await doCheck();
    else if (cmd === 'audit') await doAudit();
    else if (cmd === 'verify') await doVerify(argv[1]);
    else if (cmd === 'help' || cmd === '--help') console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace('#!/usr/bin/env node\n', ''));
    else await doAsk();
}

export { splitUnits, extractKeywords };
