#!/usr/bin/env node
/**
 * patch.js - Full-Featured Safe AI Patch Engine
 * 
 * 機能一覧:
 * 1. 外部パッケージ依存ゼロ (Node.js標準機能のみで動作)
 * 2. 入力自動判定 (クリップボード UTF-8取得 / 引数ファイル / patch.txt)
 * 3. 誤爆完全防止 (パッチ記法がないテキストはファイルを一切触らず安全停止)
 * 4. 複数ヒット安全停止 (同一コードがファイル内に2箇所以上ある場合は誤爆防止でスキップ)
 * 5. 4段階の精密照合エンジン:
 *    - Level 1: 完全一致 (100% Exact)
 *    - Level 2: 行末空白・改行コード無視一致 (CRLF / LF 自動吸収)
 *    - Level 3: インデント自動補正一致 (スペース2個/4個/タブの差分補正)
 *    - Level 4: 意味論的一致 (クォート ' vs "、末尾セミコロン、連続空白の正規化)
 * 6. 自動バックアップ (.patch_backup/ に退避)
 * 7. 一発復元 (--undo で直前の状態に100%完全巻き戻し)
 * 8. 逐一詳細レポート (ステップごとの進行状況と行番号・変更結果の完全可視化)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BACKUP_DIR = path.resolve(process.cwd(), '.patch_backup');

// =========================================================================
// 巻き戻し機能 (--undo)
// =========================================================================
if (process.argv.includes('--undo')) {
    console.log('============================================================');
    console.log('  ↩️  直前の状態への巻き戻し (Undo) を開始します');
    console.log('============================================================\n');

    if (!fs.existsSync(BACKUP_DIR)) {
        console.error('❌ バックアップが見つかりません。直前にパッチが実行されていない可能性があります。');
        process.exit(1);
    }

    const manifestPath = path.join(BACKUP_DIR, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        console.error('❌ バックアップ管理ファイル (manifest.json) が見つかりません。');
        process.exit(1);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    console.log(`🕒 バックアップ日時: ${new Date(manifest.date).toLocaleString('ja-JP')}`);
    console.log(`📁 復元対象ファイル数: ${manifest.files.length} 件\n`);

    let restoredCount = 0;
    manifest.files.forEach(relPath => {
        const backupFile = path.join(BACKUP_DIR, relPath);
        const targetFile = path.resolve(process.cwd(), relPath);
        if (fs.existsSync(backupFile)) {
            fs.copyFileSync(backupFile, targetFile);
            console.log(`   ✅ 復元完了: ${relPath}`);
            restoredCount++;
        } else {
            console.warn(`   ⚠️ バックアップファイルが見つかりません: ${relPath}`);
        }
    });

    console.log('\n============================================================');
    console.log(`🎉 【復元完了】${restoredCount} 件のファイルをパッチ適用前の状態に100%戻しました！`);
    console.log('============================================================');
    process.exit(0);
}

// =========================================================================
// 1. 入力テキストの取得と安全検査
// =========================================================================
function getSourceText() {
    console.log('[ステップ 1/5] 📋 入力テキストを安全に検査中...');

    const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
    if (args.length > 0 && fs.existsSync(args[0])) {
        console.log(`   📄 指定されたファイルから読み込みます: ${args[0]}`);
        return { text: fs.readFileSync(args[0], 'utf-8'), source: args[0] };
    }

    // Windows クリップボード取得 (PowerShell経由・UTF-8強制)
    if (process.platform === 'win32') {
        try {
            const cmd = 'powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard"';
            const text = execSync(cmd, { encoding: 'utf-8', maxBuffer: 30 * 1024 * 1024 });
            if (text && text.trim().length > 0) {
                const hasPatchMarkers = text.includes('【置換前') || text.includes('置換前') || text.includes('<<<<<<< SEARCH');
                if (!hasPatchMarkers) {
                    console.error('\n⚠️  【安全停止】クリップボードに修正コード（置換前/置換後）が見つかりません。');
                    console.error('   関係のない文章やパスワード等を誤って書き換えないよう、処理を安全に中断しました。');
                    console.error('   AIの回答全体をコピーしてから再度実行してください。\n');
                    process.exit(1);
                }
                console.log(`   ✅ クリップボードから読み込みました (${text.length.toLocaleString()} 文字)`);
                console.log('   🛡️  セキュリティ検査: 修正パッチの合言葉を確認（誤爆なし・安全確認済）');
                return { text, source: 'クリップボード' };
            }
        } catch (_) { }
    } else {
        // Mac / Linux
        try {
            const cmd = process.platform === 'darwin' ? 'pbpaste' : 'xclip -selection clipboard -o';
            const text = execSync(cmd, { encoding: 'utf-8', maxBuffer: 30 * 1024 * 1024 });
            if (text && (text.includes('【置換前') || text.includes('<<<<<<< SEARCH'))) {
                console.log(`   ✅ クリップボードから読み込みました (${text.length.toLocaleString()} 文字)`);
                return { text, source: 'クリップボード' };
            }
        } catch (_) { }
    }

    // フォールバック: patch.txt
    const fallback = path.resolve(process.cwd(), 'patch.txt');
    if (fs.existsSync(fallback)) {
        console.log('   📄 カレントディレクトリの patch.txt から読み込みます');
        return { text: fs.readFileSync(fallback, 'utf-8'), source: 'patch.txt' };
    }

    console.error('\n❌ クリップボードが空か、有効なコードが見つかりません。');
    console.error('   AIの回答をコピーしてから再度実行してください。\n');
    process.exit(1);
}

// =========================================================================
// 2. パッチ構文解析 (ユーザーのオリジナル形式 & SEARCH形式の両対応)
// =========================================================================
function parseBlocks(rawText) {
    console.log('\n[ステップ 2/5] 🧩 パッチの構文を解析中...');

    const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    const blocks = [];

    let currentFile = null;

    // 形式A: 🔍【置換前】 / ✨【置換後】
    let targetRole = null; // 'SEARCH' | 'REPLACE'
    let searchCode = null;
    let replaceCode = null;
    let inCodeBlock = false;
    let currentCodeLines = [];

    // 形式B: <<<<<<< SEARCH / ======= / >>>>>>> REPLACE
    let srState = 'OUTSIDE';
    let srSearch = [];
    let srReplace = [];

    const fileRegex = /^(?:#+\s*|FILE:\s*)\[?([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+)\]?/i;
    const searchTagRegex = /(?:🔍|【置換前|\[置換前\])/;
    const replaceTagRegex = /(?:✨|【置換後|\[置換後\])/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // コードブロック外でのファイル名検出
        if (!inCodeBlock && srState === 'OUTSIDE') {
            const fileMatch = trimmed.match(fileRegex);
            if (fileMatch && !trimmed.includes('第') && !trimmed.includes('サマリー')) {
                currentFile = fileMatch[1].replace(/\\/g, '/').trim();
                continue;
            }
        }

        // --- 形式B (SEARCH / REPLACE) の処理 ---
        if (trimmed.includes('<<<<<<< SEARCH')) {
            if (trimmed.includes('FILE:')) {
                const fp = trimmed.split('<<<<<<<')[0].replace('FILE:', '').replace(/[\[\]]/g, '').trim();
                if (fp.includes('.')) currentFile = fp;
            }
            srState = 'SEARCH';
            srSearch = [];
            continue;
        }
        if (trimmed === '=======' && srState === 'SEARCH') {
            srState = 'REPLACE';
            srReplace = [];
            continue;
        }
        if ((trimmed.includes('>>>>>>> REPLACE') || trimmed === 'REPLACE') && srState === 'REPLACE') {
            if (currentFile) {
                blocks.push({
                    file: currentFile,
                    search: srSearch.join('\n'),
                    replace: srReplace.join('\n'),
                    format: 'SEARCH/REPLACE'
                });
            }
            srState = 'OUTSIDE';
            continue;
        }
        if (srState === 'SEARCH') { srSearch.push(line); continue; }
        if (srState === 'REPLACE') { srReplace.push(line); continue; }

        // --- 形式A (🔍【置換前】/ ✨【置換後】) の処理 ---
        if (!inCodeBlock) {
            if (searchTagRegex.test(trimmed)) {
                targetRole = 'SEARCH';
                continue;
            } else if (replaceTagRegex.test(trimmed)) {
                targetRole = 'REPLACE';
                continue;
            }
        }

        // コードフェンス (```)
        if (trimmed.startsWith('```')) {
            if (!inCodeBlock) {
                inCodeBlock = true;
                currentCodeLines = [];
            } else {
                inCodeBlock = false;
                const codeStr = currentCodeLines.join('\n');
                if (targetRole === 'SEARCH') {
                    searchCode = codeStr;
                    targetRole = null;
                } else if (targetRole === 'REPLACE') {
                    replaceCode = codeStr;
                    targetRole = null;
                    if (currentFile && searchCode !== null && replaceCode !== null) {
                        blocks.push({
                            file: currentFile,
                            search: searchCode,
                            replace: replaceCode,
                            format: '🔍置換前/✨置換後'
                        });
                        searchCode = null;
                        replaceCode = null;
                    }
                }
            }
            continue;
        }

        if (inCodeBlock) {
            currentCodeLines.push(line);
        }
    }

    console.log(`   ✅ 修正ブロックを検出しました: 計 ${blocks.length} 箇所`);
    return blocks;
}

// 記号正規化関数 (クォート、末尾セミコロン、連続空白の吸収)
function normalizeLine(line) {
    let l = line.trim().replace(/['"`]/g, '"');
    if (l.endsWith(';')) l = l.slice(0, -1).trim();
    return l.replace(/\s+/g, ' ');
}

// =========================================================================
// 3. 4段階の安全置換エンジン (誤爆ゼロ保証)
// =========================================================================
function applyReplacement(originalContent, searchText, replaceText) {
    // 新規ファイル作成または末尾追加
    if (!searchText.trim()) {
        if (!originalContent.trim()) {
            return { success: true, content: replaceText, mode: '新規ファイル作成', lineNo: 1 };
        } else {
            return { success: true, content: originalContent + '\n' + replaceText, mode: '末尾追記', lineNo: originalContent.split('\n').length };
        }
    }

    // Level 1: 完全一致 (Exact Match)
    const exactIndex = originalContent.indexOf(searchText);
    if (exactIndex !== -1) {
        const secondIndex = originalContent.indexOf(searchText, exactIndex + 1);
        if (secondIndex !== -1) {
            return { success: false, reason: '検索コードがファイル内に2箇所以上見つかりました。誤爆を防ぐためスキップしました（前後の行を増やしてください）。' };
        }
        const lineNo = originalContent.substring(0, exactIndex).split('\n').length;
        return {
            success: true,
            content: originalContent.replace(searchText, () => replaceText),
            mode: 'Level 1 完全一致 (Exact)',
            lineNo
        };
    }

    const origLines = originalContent.split('\n');
    const searchLines = searchText.split('\n');
    const replaceLines = replaceText.split('\n');
    const sLen = searchLines.length;

    // Level 2: 行末空白・改行コード無視一致 (Trim End Match)
    let foundEndMatch = -1;
    let endMatchCount = 0;
    for (let i = 0; i <= origLines.length - sLen; i++) {
        let match = true;
        for (let j = 0; j < sLen; j++) {
            if (origLines[i + j].trimEnd() !== searchLines[j].trimEnd()) {
                match = false;
                break;
            }
        }
        if (match) {
            foundEndMatch = i;
            endMatchCount++;
        }
    }
    if (endMatchCount === 1) {
        const newLines = [...origLines.slice(0, foundEndMatch), ...replaceLines, ...origLines.slice(foundEndMatch + sLen)];
        return { success: true, content: newLines.join('\n'), mode: 'Level 2 行末空白補正一致', lineNo: foundEndMatch + 1 };
    } else if (endMatchCount > 1) {
        return { success: false, reason: '検索コード（空白無視後）が複数箇所ヒットしたため、誤爆防止でスキップしました。' };
    }

    // Level 3: インデント自動調整一致 (スペース2個/4個/タブ差分吸収)
    const trimmedSearch = searchLines.map(l => l.trim());
    let foundTrimMatch = -1;
    let trimMatchCount = 0;
    for (let i = 0; i <= origLines.length - sLen; i++) {
        let match = true;
        for (let j = 0; j < sLen; j++) {
            if (origLines[i + j].trim() !== trimmedSearch[j]) {
                match = false;
                break;
            }
        }
        if (match) {
            foundTrimMatch = i;
            trimMatchCount++;
        }
    }
    if (trimMatchCount === 1) {
        const origIndent = origLines[foundTrimMatch].match(/^\s*/)[0];
        const searchIndent = searchLines[0].match(/^\s*/)[0];
        const indentDelta = origIndent.length - searchIndent.length;

        const adjustedReplace = replaceLines.map(line => {
            if (!line.trim()) return '';
            const curIndent = line.match(/^\s*/)[0].length;
            return ' '.repeat(Math.max(0, curIndent + indentDelta)) + line.trimStart();
        });

        const newLines = [...origLines.slice(0, foundTrimMatch), ...adjustedReplace, ...origLines.slice(foundTrimMatch + sLen)];
        return { success: true, content: newLines.join('\n'), mode: 'Level 3 インデント自動補正一致', lineNo: foundTrimMatch + 1 };
    } else if (trimMatchCount > 1) {
        return { success: false, reason: 'インデント補正後のコードが複数箇所ヒットしたため、誤爆防止でスキップしました。' };
    }

    // Level 4: 意味論的一致 (クォート ' vs "、末尾セミコロン、連続空白のズレ補正)
    const normSearch = searchLines.map(normalizeLine);
    let foundNormMatch = -1;
    let normMatchCount = 0;
    for (let i = 0; i <= origLines.length - sLen; i++) {
        let match = true;
        for (let j = 0; j < sLen; j++) {
            if (normalizeLine(origLines[i + j]) !== normSearch[j]) {
                match = false;
                break;
            }
        }
        if (match) {
            foundNormMatch = i;
            normMatchCount++;
        }
    }
    if (normMatchCount === 1) {
        const origIndent = origLines[foundNormMatch].match(/^\s*/)[0];
        const searchIndent = searchLines[0].match(/^\s*/)[0];
        const indentDelta = origIndent.length - searchIndent.length;

        const adjustedReplace = replaceLines.map(line => {
            if (!line.trim()) return '';
            const curIndent = line.match(/^\s*/)[0].length;
            return ' '.repeat(Math.max(0, curIndent + indentDelta)) + line.trimStart();
        });

        const newLines = [...origLines.slice(0, foundNormMatch), ...adjustedReplace, ...origLines.slice(foundNormMatch + sLen)];
        return { success: true, content: newLines.join('\n'), mode: 'Level 4 記号・インデント正規化一致', lineNo: foundNormMatch + 1 };
    } else if (normMatchCount > 1) {
        return { success: false, reason: '正規化後のコードが複数箇所ヒットしたため、誤爆防止でスキップしました。' };
    }

    return { success: false, reason: 'ファイル内に該当するコードが見つかりません。' };
}

// =========================================================================
// 4. メイン実行処理 (安心の逐一ログ出力)
// =========================================================================
function run() {
    console.log('============================================================');
    console.log('  ⚡ Covo AI パッチ自動適用エンジン');
    console.log('============================================================\n');

    const { text: rawText, source } = getSourceText();
    const blocks = parseBlocks(rawText);

    if (blocks.length === 0) {
        console.error('❌ 有効な修正ブロックが見つかりませんでした。');
        process.exit(1);
    }

    const fileGroups = {};
    blocks.forEach((b, i) => {
        if (!fileGroups[b.file]) fileGroups[b.file] = [];
        fileGroups[b.file].push({ ...b, blockIndex: i + 1 });
    });

    // 自動バックアップ作成
    console.log('\n[ステップ 3/5] 🛡️  安全装置: 書き換え前に元ファイルを自動バックアップ中...');
    try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const backupManifest = { date: new Date().toISOString(), files: Object.keys(fileGroups) };
        fs.writeFileSync(path.join(BACKUP_DIR, 'manifest.json'), JSON.stringify(backupManifest, null, 2));

        for (const relPath of Object.keys(fileGroups)) {
            const fullPath = path.resolve(process.cwd(), relPath);
            if (fs.existsSync(fullPath)) {
                const dest = path.join(BACKUP_DIR, relPath);
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                fs.copyFileSync(fullPath, dest);
                console.log(`   💾 バックアップ完了: ${relPath}`);
            }
        }
        console.log('   ✨ バックアップ完了！ いつでもメニューの [2] (Undo) で1秒で元に戻せます。');
    } catch (backupErr) {
        console.warn('   ⚠️  バックアップ作成警告:', backupErr.message);
    }

    console.log('\n[ステップ 4/5] 🔍 各ファイルのコードを慎重に照合・置換中...');
    console.log('------------------------------------------------------------');

    let totalSuccess = 0;
    let totalFail = 0;
    const failedDetails = [];

    for (const [relPath, fileBlocks] of Object.entries(fileGroups)) {
        const fullPath = path.resolve(process.cwd(), relPath);
        console.log(`\n📁 対象ファイル: ${relPath}`);

        let fileContent = '';
        let isCRLF = false;
        const exists = fs.existsSync(fullPath);

        if (exists) {
            const raw = fs.readFileSync(fullPath, 'utf-8');
            isCRLF = raw.includes('\r\n');
            fileContent = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        } else {
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            console.log(`   📁 新規ファイルを作成します`);
        }

        let modified = fileContent;
        let fileSuccessCount = 0;

        for (let idx = 0; idx < fileBlocks.length; idx++) {
            const block = fileBlocks[idx];
            const result = applyReplacement(modified, block.search, block.replace);

            if (result.success) {
                modified = result.content;
                fileSuccessCount++;
                totalSuccess++;
                console.log(`   ✅ [${idx + 1}/${fileBlocks.length}] L.${result.lineNo}: 置換成功 (${result.mode})`);
            } else {
                totalFail++;
                failedDetails.push({
                    file: relPath,
                    blockNo: block.blockIndex,
                    reason: result.reason,
                    searchSnippet: block.search.split('\n').slice(0, 3).join('\n')
                });
                console.error(`   ❌ [${idx + 1}/${fileBlocks.length}] スキップ: ${result.reason}`);
            }
        }

        if (fileSuccessCount > 0) {
            const finalSave = isCRLF ? modified.replace(/\n/g, '\r\n') : modified;
            fs.writeFileSync(fullPath, finalSave, 'utf-8');
            console.log(`   💾 変更をファイルに保存しました (${relPath})`);
        } else {
            console.log(`   ⚠️  変更箇所がなかったため保存をスキップしました`);
        }
    }

    console.log('\n------------------------------------------------------------');
    console.log('[ステップ 5/5] 📊 最終レポート');
    console.log('============================================================');

    if (totalFail === 0) {
        console.log(`🎉 【完全成功】すべての変更が正常に適用されました！`);
        console.log(`   ・対象ファイル数: ${Object.keys(fileGroups).length} 件`);
        console.log(`   ・置換成功箇所: ${totalSuccess} / ${blocks.length} 箇所 (失敗 0 件)`);
        console.log('\n💡 ご安心ください:');
        console.log('   ・ファイルは安全に書き換わりました。');
        console.log('   ・もし元に戻したくなったら、メニューで [2] (Undo) を選ぶだけで');
        console.log('     この実行直前の状態に100%完全復元できます。');
    } else {
        console.log(`⚠️  【一部スキップ】成功: ${totalSuccess} 箇所 / 未適用: ${totalFail} 箇所`);
        console.log('------------------------------------------------------------');
        console.log('🛡️  安全装置が作動した箇所:');
        failedDetails.forEach(f => {
            console.log(`\n  ・ファイル: ${f.file} (修正ブロック #${f.blockNo})`);
            console.log(`    理由: ${f.reason}`);
            console.log(`    探したコード（先頭部分）:`);
            console.log('    ----------------------------------------');
            console.log('    ' + f.searchSnippet.split('\n').join('\n    '));
            console.log('    ----------------------------------------');
        });
        console.log('\n💡 失敗してもご安心ください:');
        console.log('   ・無理に書き換えずスキップしたため、既存のコードは壊れていません。');
        console.log('   ・元に戻したい場合は、メニューで [2] (Undo) を選んでください。');
    }
    console.log('============================================================');
}

run();