import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep unchanged module URLs cached, but never reuse an old URL for changed CSS.
export async function stampCssImports(file = fileURLToPath(new URL('../public/css/main.css', import.meta.url))) {
  const source = await readFile(file, 'utf8');
  const modules = resolve(dirname(file), 'modules') + sep;
  const imports = [...source.matchAll(/(@import\s+url\(['"])(\.\/modules\/[^'"?]+\.css)(?:\?[^'"]*)?(['"]\);)/g)];
  let result = source;
  for (const match of imports.reverse()) {
    const target = resolve(dirname(file), match[2]);
    if (!target.startsWith(modules)) throw new Error('CSS import escapes modules directory');
    const content = (await readFile(target, 'utf8')).replaceAll('\r\n', '\n');
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
    result = result.slice(0, match.index) + match[1] + match[2] + '?v=' + hash + match[3] + result.slice(match.index + match[0].length);
  }
  if (result !== source) await writeFile(file, result);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await stampCssImports();
