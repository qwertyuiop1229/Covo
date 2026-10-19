/**
 * build_tailwind.mjs
 * Tailwind CSS ビルドスクリプト
 *
 * 背景: Tailwind CLI (tailwindcss.cmd) は index.html (456KB) や main.js (1.5MB) を
 *       content スキャン対象にすると Node.js Zone Allocation OOM でクラッシュする。
 *       このスクリプトは PostCSS を直接呼び出し、事前生成済みの軽量スキャンファイル
 *       (tailwind.safelist.html) のみを参照してビルドする。
 *
 * 使用方法:
 *   node scripts/build_tailwind.mjs           # 通常ビルド
 *   node scripts/build_tailwind.mjs --regen   # safelist.html 再生成 + ビルド
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const inputFile   = path.join(projectRoot, 'tailwind.input.css');
const outputFile  = path.join(projectRoot, 'public', 'css', 'styles.css');
const safelistFile = path.join(projectRoot, 'tailwind.safelist.html');

// --regen フラグで safelist.html を再生成
if (process.argv.includes('--regen')) {
  console.log('[1/2] Regenerating tailwind.safelist.html ...');
  const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
  const js   = fs.readFileSync(path.join(projectRoot, 'public', 'js', 'main.js'), 'utf8');

  const allClasses = new Set();
  for (const match of html.matchAll(/class="([^"]+)"/g)) {
    for (const cls of match[1].split(/\s+/)) { if (cls.trim()) allClasses.add(cls.trim()); }
  }
  for (const match of js.matchAll(/className\s*[+=]\s*['"`]([^'"`]+)['"`]/g)) {
    for (const cls of match[1].split(/\s+/)) {
      if (cls.trim() && !cls.includes('${') && !cls.includes('+')) allClasses.add(cls.trim());
    }
  }
  for (const match of js.matchAll(/classList\.(add|remove|toggle)\(["']([^"']+)["']/g)) {
    for (const cls of match[2].split(/\s*,\s*/)) {
      const c = cls.replace(/['"]/g, '').trim(); if (c) allClasses.add(c);
    }
  }

  const classes = [...allClasses];
  let htmlOut = '<!DOCTYPE html><html><body>\n';
  for (let i = 0; i < classes.length; i += 200) {
    htmlOut += `<div class="${classes.slice(i, i + 200).join(' ')}"></div>\n`;
  }
  htmlOut += '</body></html>';
  fs.writeFileSync(safelistFile, htmlOut, 'utf8');
  console.log(`    -> ${allClasses.size} classes -> tailwind.safelist.html (${Math.round(htmlOut.length/1024)}KB)`);
}

// tailwind.safelist.html がなければ警告
if (!fs.existsSync(safelistFile)) {
  console.warn('WARNING: tailwind.safelist.html not found. Run with --regen to generate it.');
}

// PostCSS + Tailwind ビルド
const tailwindConfig = require(path.join(projectRoot, 'tailwind.config.js'));
const postcss    = require(path.join(projectRoot, 'node_modules', 'postcss'));
const tailwindcss = require(path.join(projectRoot, 'node_modules', 'tailwindcss'));

const inputCss = fs.readFileSync(inputFile, 'utf8');
console.log(process.argv.includes('--regen') ? '[2/2] Building Tailwind CSS...' : 'Building Tailwind CSS...');

const processor = postcss([tailwindcss(tailwindConfig)]);

processor.process(inputCss, { from: inputFile, to: outputFile })
  .then(result => {
    // シンプルminify (cssnanoがない環境用)
    let css = result.css;
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    css = css.replace(/\s+/g, ' ');
    css = css.replace(/\s*\{\s*/g, '{');
    css = css.replace(/\s*\}\s*/g, '}');
    css = css.replace(/\s*:\s*/g, ':');
    css = css.replace(/\s*;\s*/g, ';');
    css = css.replace(/;}/g, '}');
    css = css.trim();

    fs.writeFileSync(outputFile, css, 'utf8');
    const size = fs.statSync(outputFile).size;
    console.log(`OK: styles.css (${Math.round(size / 1024)}KB)`);
    process.exit(0);
  })
  .catch(err => {
    console.error('Tailwind build error:', err.message || err);
    process.exit(1);
  });
