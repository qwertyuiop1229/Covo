const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');

test('real HTTP cache retains unchanged CSS but changed module content replaces a previously cached release', async ({ page }) => {
  const folder = await fs.mkdtemp(path.resolve('scratch/css-cache-'));
  await fs.mkdir(path.join(folder, 'modules'));
  const stylesheet = path.join(folder, 'main.css'), module = path.join(folder, 'modules/theme.css');
  await fs.writeFile(stylesheet, "@import url('./modules/theme.css');\n");
  await fs.writeFile(module, 'body { color: rgb(200, 0, 0); }');
  let release = 0;
  const requests = new Map();
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/') { response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Type', 'text/html'); response.end(`<link rel="stylesheet" href="/main.css?v=${release}"><p>Cache test</p>`); return; }
    if (url.pathname !== '/main.css' && url.pathname !== '/modules/theme.css') { response.writeHead(404); response.end(); return; }
    requests.set(request.url, (requests.get(request.url) || 0) + 1);
    response.setHeader('Cache-Control', 'public,max-age=31536000,immutable'); response.setHeader('Content-Type', 'text/css');
    response.end(await fs.readFile(url.pathname === '/main.css' ? stylesheet : module));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    await page.goto(url); await expect(page.locator('body')).toHaveCSS('color', 'rgb(200, 0, 0)');
    const { stampCssImports } = await import(pathToFileURL(path.resolve('scripts/build_css_modules.mjs')).href);
    await fs.writeFile(module, 'body { color: rgb(0, 0, 200); }'); await stampCssImports(stylesheet); release++;
    const generated = await fs.readFile(stylesheet, 'utf8');
    await page.goto(url); await expect(page.locator('body')).toHaveCSS('color', 'rgb(0, 0, 200)');
    await stampCssImports(stylesheet); expect(await fs.readFile(stylesheet, 'utf8')).toBe(generated);
    await page.goto(url); await expect(page.locator('body')).toHaveCSS('color', 'rgb(0, 0, 200)');
    const moduleRequests = [...requests].filter(([name]) => name.startsWith('/modules/'));
    expect(moduleRequests).toHaveLength(2); expect(moduleRequests.map(([,count]) => count)).toEqual([1,1]);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.unlink(module); await fs.unlink(stylesheet); await fs.rmdir(path.join(folder, 'modules')); await fs.rmdir(folder);
  }
});
