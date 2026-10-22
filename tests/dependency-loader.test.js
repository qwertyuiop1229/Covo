const fs = require('fs');
const vm = require('vm');

function loader() {
  const scripts = [];
  const ctx = vm.createContext({ window: {}, setTimeout, clearTimeout, document: {
    createElement: () => ({ remove: jest.fn() }), head: { appendChild: script => scripts.push(script) }
  } });
  vm.runInContext(fs.readFileSync('public/js/dependency_loader.js', 'utf8').replace(/\bexport /g, ''), ctx);
  return { ctx, scripts };
}

test('concurrent requests for a large optional dependency load a single script', async () => {
  const { ctx, scripts } = loader();
  const first = ctx.loadOptionalScript('https://example.test/sdk.js', 'SDK');
  const second = ctx.loadOptionalScript('https://example.test/sdk.js', 'SDK');
  expect(scripts.length).toBe(1);
  ctx.window.SDK = { ready: true };
  scripts[0].onload();
  expect(await first).toBe(ctx.window.SDK);
  expect(await second).toBe(ctx.window.SDK);
});

test('failed lazy load can be retried and never leaves a pending timer or failed cache entry', async () => {
  const { ctx, scripts } = loader();
  const first = ctx.loadOptionalScript('sdk', 'SDK');
  scripts[0].onerror();
  await expect(first).rejects.toThrow('読み込み');
  const retry = ctx.loadOptionalScript('sdk', 'SDK');
  expect(scripts.length).toBe(2);
  ctx.window.SDK = {};
  scripts[1].onload();
  await retry;
  expect(scripts[0].remove).toHaveBeenCalledTimes(1);
});

test('PDF worker URL is configured only after the lazily loaded library is available', async () => {
  const { ctx, scripts } = loader();
  const pending = ctx.loadPdfLibrary();
  ctx.window.pdfjsLib = { GlobalWorkerOptions: {} };
  scripts[0].onload();
  expect((await pending).GlobalWorkerOptions.workerSrc).toContain('pdf.worker.min.js');
});

test('normal startup does not request the geographic dataset, PDF, HEIC, Panzoom or Agora', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  const eagerScripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
  for (const removed of ['geoguessr_locations.js', 'pdf.min.js', 'heic2any', 'panzoom', 'AgoraRTC_N']) {
    expect(eagerScripts.some(src => src.includes(removed))).toBe(false);
  }
  expect(eagerScripts.some(src => src.includes('main.js'))).toBe(true);
});

test('critical loading helpers are release-versioned while account storage remains a single canonical module', () => {
  const main = fs.readFileSync('public/js/main.js', 'utf8');
  expect(main).toMatch(/from ['"]\.\/loading_runtime\.js\?v=\d+\.\d+\.\d+['"]/);
  expect(main).toMatch(/import\(['"]\.\/backup_feature\.js\?v=\d+\.\d+\.\d+['"]\)/);
  expect(main).toMatch(/from ['"]\.\/local_store\.js['"]/);
  expect(fs.readFileSync('public/js/crypto_helpers.js', 'utf8')).toMatch(/from ['"]\.\/local_store\.js['"]/);
  const config = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
  const headers = config.hosting.headers.find(rule => rule.source === '/js/**');
  expect(headers.headers).toContainEqual({ key: 'Cache-Control', value: 'no-cache' });
});
