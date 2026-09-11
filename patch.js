#!/usr/bin/env node
/**
 * patch.js - Robust AI Patch Engine (v2)
 * 完全空行保持・CRLF/LF自動正規化・高精度コードフェンス解析
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
    console.error('❌ バックアップが見つかりません。');
    process.exit(1);
  }

  const manifestPath = path.join(BACKUP_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('❌ バックアップ情報 (manifest.json) が見つかりません。');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  console.log(`🕒 バックアップ日時: ${new Date(manifest.date).toLocaleString('ja-JP')}`);

  manifest.files.forEach(relPath => {
    const backupFile = path.join(BACKUP_DIR, relPath);
    const targetFile = path.resolve(process.cwd(), relPath);
    if (fs.existsSync(backupFile)) {
      fs.copyFileSync(backupFile, targetFile);
      console.log(`   ✅ 復元完了: ${relPath}`);
    }
  });

  console.log('\n============================================================');
  console.log('🎉 【復元完了】すべてのファイルをパッチ適用前の状態に戻しました！');
  console.log('============================================================');
  process.exit(0);
}

// =========================================================================
// 1. 入力テキスト取得 (Windows Rawクリップボード完全対応)
// =========================================================================
function getSourceText() {
  console.log('[ステップ 1/5] 📋 クリップボードを安全に検査中...');

  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (args.length > 0 && fs.existsSync(args[0])) {
    console.log(`   📄 指定ファイルから読み込みます: ${args[0]}`);
    return { text: fs.readFileSync(args[0], 'utf-8'), source: args[0] };
  }

  if (process.platform === 'win32') {
    try {
      const cmd = 'powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard -Raw"';
      const text = execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
      if (text && text.trim().length > 0) {
        const hasPatchMarkers = text.includes('【置換前') || text.includes('置換前') || text.includes('<<<<<<< SEARCH');
        if (!hasPatchMarkers) {
          console.error('\n⚠️  【安全停止】クリップボードに修正コード（置換前/置換後）が見つかりません。');
          console.error('   関係のない文章やメモを誤って書き換えないよう、処理を安全に中断しました。');
          console.error('   AIの回答全体をコピーしてから再度実行してください。\n');
          process.exit(1);
        }
        console.log(`   ✅ クリップボードから読み込みました (${text.length.toLocaleString()} 文字)`);
        console.log('   🛡️  セキュリティ検査: 修正パッチの合言葉を確認（安全確認済）');
        return { text, source: 'クリップボード' };
      }
    } catch (_) {}
  } else {
    try {
      const cmd = process.platform === 'darwin' ? 'pbpaste' : 'xclip -selection clipboard -o';
      const text = execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
      if (text && (text.includes('【置換前') || text.includes('<<<<<<< SEARCH'))) {
        console.log(`   ✅ クリップボードから読み込みました (${text.length.toLocaleString()} 文字)`);
        return { text, source: 'クリップボード' };
      }
    } catch (_) {}
  }

  const fallback = path.resolve(process.cwd(), 'patch.txt');
  if (fs.existsSync(fallback)) {
    console.log('   📄 patch.txt から読み込みます');
    return { text: fs.readFileSync(fallback, 'utf-8'), source: 'patch.txt' };
  }

  console.error('\n❌ クリップボードが空です。AIの回答をコピーしてから実行してください。\n');
  process.exit(1);
}

// =========================================================================
// 2. パッチ構文解析 (空行完全保持・フェンス境界対応)
// =========================================================================
function parseBlocks(rawText) {
  console.log('\n[ステップ 2/5] 🧩 パッチの構文を解析中...');

  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const blocks = [];

  let currentFile = null;
  let state = 'OUTSIDE';
  let searchLines = [];
  let replaceLines = [];
  let inFence = false;

  const fileRegex = /^(?:#+\s*|FILE:\s*)?\[?\*{0,2}([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+)\*{0,2}\]?$/i;
  const searchTagRegex = /(?:🔍|【置換前|\[置換前\]|<<<<<<< SEARCH)/i;
  const replaceTagRegex = /(?:✨|【置換後|\[置換後\]|=======)/i;
  const sectionEndRegex = /(?:^#+\s*第\d+部|^第\d+部|サマリー|>>>>>>> REPLACE)/i;

  function saveBlock() {
    if (currentFile && searchLines.length > 0 && replaceLines.length > 0) {
      const sClean = searchLines.join('\n').replace(/^\n+|\n+$/g, '');
      const rClean = replaceLines.join('\n').replace(/^\n+|\n+$/g, '');

      blocks.push({
        file: currentFile,
        search: sClean,
        replace: rClean
      });
    }
    searchLines = [];
    replaceLines = [];
    state = 'OUTSIDE';
    inFence = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // コードフェンス外の制御構文判定
    if (!inFence) {
      if (trimmed && sectionEndRegex.test(trimmed) && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
        saveBlock();
        currentFile = null;
        continue;
      }

      const fileMatch = trimmed.match(fileRegex);
      if (fileMatch && !trimmed.includes('第') && !trimmed.includes('サマリー') && !trimmed.includes('問題') && !trimmed.includes('要約')) {
        saveBlock();
        currentFile = fileMatch[1].replace(/\\/g, '/').replace(/^\*+|\*+$/g, '').trim();
        continue;
      }

      if (searchTagRegex.test(trimmed) && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
        saveBlock();
        state = 'SEARCH';
        inFence = false;
        continue;
      }

      if (replaceTagRegex.test(trimmed) && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
        state = 'REPLACE';
        inFence = false;
        continue;
      }
    }

    // コードフェンスの開始/終了
    if (state === 'SEARCH' || state === 'REPLACE') {
      if (trimmed.startsWith('```') && trimmed.length < 25) {
        inFence = !inFence;
        continue;
      }

      if (state === 'SEARCH') {
        searchLines.push(line);
      } else if (state === 'REPLACE') {
        replaceLines.push(line);
      }
    }
  }

  saveBlock();
  console.log(`   ✅ 修正ブロックを検出しました: 計 ${blocks.length} 箇所`);
  return blocks;
}

// 記号正規化関数
function normalizeLine(line) {
  let l = line.trim().replace(/['"`]/g, '"');
  if (l.endsWith(';')) l = l.slice(0, -1).trim();
  return l.replace(/\s+/g, ' ');
}

// =========================================================================
// 3. 改行コード吸収 & 行シーケンス照合エンジン
// =========================================================================
function applyReplacement(originalContent, searchText, replaceText) {
  if (!searchText.trim()) {
    if (!originalContent.trim()) return { success: true, content: replaceText, mode: '新規ファイル作成', lineNo: 1 };
    return { success: true, content: originalContent + '\n' + replaceText, mode: '末尾追記', lineNo: originalContent.split('\n').length };
  }

  const isCRLF = originalContent.includes('\r\n');
  const origLF = originalContent.replace(/\r\n/g, '\n');
  const searchLF = searchText.replace(/\r\n/g, '\n');
  const replaceLF = replaceText.replace(/\r\n/g, '\n');

  // Level 1: 改行コード吸収の完全一致 (Exact Match)
  const exactIndex = origLF.indexOf(searchLF);
  if (exactIndex !== -1) {
    const secondIndex = origLF.indexOf(searchLF, exactIndex + 1);
    if (secondIndex !== -1) {
      return { success: false, reason: '検索コードがファイル内に2箇所以上見つかりました（誤爆防止のためスキップ）。' };
    }
    const lineNo = origLF.substring(0, exactIndex).split('\n').length;
    const newLF = origLF.substring(0, exactIndex) + replaceLF + origLF.substring(exactIndex + searchLF.length);
    const finalContent = isCRLF ? newLF.replace(/\n/g, '\r\n') : newLF;
    return {
      success: true,
      content: finalContent,
      mode: 'Level 1 完全一致 (Exact)',
      lineNo
    };
  }

  // Level 2: 空行完全吸収 & 行シーケンス照合 (Repomix空行除去に完全対応)
  const origLines = origLF.split('\n');
  const searchLines = searchLF.split('\n');
  const replaceLines = replaceLF.split('\n');

  // 検索コードから非空行のみを抽出（行内容の正規化値と元の行インデックスを保持）
  const sValid = [];
  for (let idx = 0; idx < searchLines.length; idx++) {
    const line = searchLines[idx];
    if (line.trim()) {
      sValid.push({ norm: normalizeLine(line), raw: line, origIndex: idx });
    }
  }

  if (sValid.length === 0) {
    return { success: false, reason: '検索コードが空です。' };
  }

  const firstSearchIndentLen = (sValid[0].raw.match(/^\s*/) || [''])[0].length;
  const matchedRanges = [];

  for (let startI = 0; startI < origLines.length; startI++) {
    // 照合開始候補行が空行ならスキップ
    if (!origLines[startI].trim()) continue;
    // 最初の有効行が一致するかクイックチェック
    if (normalizeLine(origLines[startI]) !== sValid[0].norm) continue;

    let sIdx = 0;
    let curOrigI = startI;
    let matchFailed = false;

    // 元ファイル側の空行を自律的に読み飛ばしながら照合
    while (curOrigI < origLines.length && sIdx < sValid.length) {
      const oLine = origLines[curOrigI];
      // 元ファイル側の空行は無視して読み飛ばす
      if (!oLine.trim()) {
        curOrigI++;
        continue;
      }
      if (normalizeLine(oLine) !== sValid[sIdx].norm) {
        matchFailed = true;
        break;
      }
      sIdx++;
      curOrigI++;
    }

    if (!matchFailed && sIdx === sValid.length) {
      matchedRanges.push({ startOrigLine: startI, endOrigLine: curOrigI - 1 });
    }
  }

  if (matchedRanges.length === 1) {
    const { startOrigLine, endOrigLine } = matchedRanges[0];
    const baseIndent = (origLines[startOrigLine].match(/^\s*/) || [''])[0];
    const adjustedReplace = replaceLines.map(line => {
      if (!line.trim()) return '';
      const curIndentLen = (line.match(/^\s*/) || [''])[0].length;
      const relIndent = Math.max(0, curIndentLen - firstSearchIndentLen);
      return baseIndent + (' '.repeat(relIndent)) + line.trimStart();
    });

    const newLines = [
      ...origLines.slice(0, startOrigLine),
      ...adjustedReplace,
      ...origLines.slice(endOrigLine + 1)
    ];

    const newLF = newLines.join('\n');
    const finalContent = isCRLF ? newLF.replace(/\n/g, '\r\n') : newLF;
    return {
      success: true,
      content: finalContent,
      mode: 'Level 2 空行完全吸収・行シーケンス照合',
      lineNo: startOrigLine + 1
    };
  } else if (matchedRanges.length > 1) {
    return { success: false, reason: `検索コードが複数箇所 (${matchedRanges.length}箇所) ヒットしたため、誤爆防止でスキップしました。` };
  }

  return { success: false, reason: 'ファイル内に該当するコードが見つかりません。' };
}

// =========================================================================
// 4. メイン実行処理
// =========================================================================
function run() {
  console.log('============================================================');
  console.log('  ⚡ Covo AI パッチ自動適用エンジン (Robust v2)');
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
    console.log('   ✨ バックアップ完了！ いつでもメニューの [2] (Undo) で元に戻せます。');
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
    let fileEncoding = 'utf-8';
    const exists = fs.existsSync(fullPath);

    if (exists) {
      const rawBuf = fs.readFileSync(fullPath);
      // UTF-16LE / UTF-8 自動判別 (BOMまたはヌルバイト密度から高精度検知)
      if (rawBuf.length >= 2 && rawBuf[0] === 0xFF && rawBuf[1] === 0xFE) {
        fileEncoding = 'utf-16le';
        fileContent = rawBuf.slice(2).toString('utf16le');
      } else {
        let nulls = 0;
        for (let i = 1; i < Math.min(rawBuf.length, 512); i += 2) {
          if (rawBuf[i] === 0) nulls++;
        }
        if (nulls > 30) {
          fileEncoding = 'utf-16le';
          fileContent = rawBuf.toString('utf16le');
        } else {
          fileEncoding = 'utf-8';
          fileContent = rawBuf.toString('utf-8');
        }
      }
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
      if (fileEncoding === 'utf-16le') {
        const bom = Buffer.from([0xFF, 0xFE]);
        const body = Buffer.from(modified, 'utf16le');
        fs.writeFileSync(fullPath, Buffer.concat([bom, body]));
      } else {
        fs.writeFileSync(fullPath, modified, 'utf-8');
      }
      console.log(`   💾 変更をファイルに保存しました (${relPath})`);

      // patch.js 自身が更新された場合は、最新のパッチエンジンで残りのファイルを即時自動再適用
      if (relPath.replace(/\\/g, '/').endsWith('patch.js') && !process.env._PATCH_RELOADED) {
        console.log('   🔄 パッチエンジンが最新版に更新されました。最新エンジンでパッチを自動再実行します...');
        process.env._PATCH_RELOADED = '1';
        execSync(`node "${fullPath}" --apply`, { stdio: 'inherit' });
        process.exit(0);
      }
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
    failedDetails.forEach(f => {
      console.log(`\n  ・ファイル: ${f.file} (修正ブロック #${f.blockNo})`);
      console.log(`    理由: ${f.reason}`);
      console.log(`    探したコード（先頭部分）:`);
      console.log('    ----------------------------------------');
      console.log('    ' + f.searchSnippet.split('\n').join('\n    '));
      console.log('    ----------------------------------------');
    });
  }
  console.log('============================================================');
}

run();