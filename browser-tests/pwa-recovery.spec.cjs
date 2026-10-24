const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function routeApp(page, { standalone = false, ios = false, recovery = false } = {}) {
  await page.addInitScript(({ standalone, ios }) => {
    Object.defineProperty(navigator, 'standalone', { value: standalone, configurable: true });
    if (ios) { Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPad; CPU OS 26_5_2 like Mac OS X)', configurable: true }); Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true }); }
    localStorage.setItem('covo_private_key_alice', 'KEEP_KEY');
    localStorage.setItem('covo_outbox_alice', 'KEEP_OUTBOX');
    localStorage.setItem('covo_missing_files_v3', '[]');
  }, { standalone, ios });
  await page.route('https://covo.test/**', route => {
    const url = new URL(route.request().url());
    let file = path.resolve('public', '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(path.resolve('public') + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
    if (url.pathname === '/') {
      // Exercise the real document/CSS with all authenticated/network application scripts removed.
      let html = fs.readFileSync(file, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
      html = html.replace('</head>', '<script src="/js/viewport_runtime.js"></script></head>');
      return route.fulfill({ contentType: 'text/html', body: html });
    }
    return route.fulfill({ path: file, contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : undefined });
  });
  await page.route(/https:\/\/(?!covo\.test)/, route => route.abort());
  await page.goto(recovery ? 'https://covo.test/recovery.html' : 'https://covo.test/');
}

for (const [name, width, height] of [['iphone', 402, 874], ['ipad', 1180, 820]]) {
  test(`${name}: installed shell fills its viewport, consumes safe area once and aligns header actions`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await routeApp(page, { standalone: true, ios: true });
    await expect(page.locator('html')).toHaveClass(/covo-ios-standalone/);
    expect(await page.locator('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute('content')).toBe('default');
    const splash = await page.locator('#appLoadingSplash').boundingBox();
    expect(splash.y).toBe(0); expect(splash.height).toBe(height);
    await page.evaluate(() => { document.getElementById('appLoadingSplash').remove(); document.body.className = 'auth-ready logged-in discord-ui-mode discord-home-view discord-discover-view'; });
    const shell = await page.locator('.container').boundingBox();
    expect(shell.y).toBe(0); expect(shell.height).toBe(height);
    if (width > 768) {
      // Reproduce nonzero safe insets independently of browser env() emulation.
      await page.evaluate(() => document.documentElement.style.setProperty('--safe-top', '24px'));
      const title = await page.locator('#discordTitleBarContext').boundingBox();
      const inbox = await page.locator('#titlebarInboxBtn').boundingBox();
      expect(Math.abs(title.y + title.height / 2 - inbox.y - inbox.height / 2)).toBeLessThan(1);
      expect((await page.locator('#discordDiscoverHeader').boundingBox()).height).toBe(48);
    }
  });
}

test('Safari browser mode is unchanged and viewport sizing does not grow to the physical screen', async ({ page }) => {
  await routeApp(page, { ios: true });
  await expect(page.locator('html')).not.toHaveClass(/covo-ios-standalone/);
  const result = await page.evaluate(() => window.covoViewport.snapshot());
  expect(result.standalone).toBe(false); expect(result.shellBottom).toBe(result.innerHeight);
});

test('keyboard resize is temporary and pinch zoom never resizes the shell', async ({ page }) => {
  await routeApp(page, { standalone: true, ios: true });
  await page.evaluate(() => {
    const vv = new EventTarget(); Object.assign(vv, { height: 420, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    const input = document.createElement('textarea'); input.id = 'keyboardProbe'; document.body.append(input); input.focus();
    window.covoViewport.refresh();
  });
  await expect(page.locator('html')).toHaveClass(/covo-keyboard-open/);
  expect((await page.locator('.container').boundingBox()).height).toBe(420);
  await page.evaluate(() => { visualViewport.scale = 2; window.covoViewport.refresh(); });
  await expect(page.locator('html')).not.toHaveClass(/covo-keyboard-open/);
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--covo-keyboard-height'))).toBe('');
  await page.evaluate(() => { visualViewport.scale = 1; visualViewport.height = innerHeight; document.getElementById('keyboardProbe').blur(); window.covoViewport.refresh(); });
  expect((await page.locator('.container').boundingBox()).height).toBe(850);
});

for (const theme of ['', 'dark-server-theme', 'discord-dark-theme']) {
  test(`discovery ${theme || 'light'}: narrow columns, long names, keyboard and local search stay usable`, async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await routeApp(page, { standalone: true, ios: true });
    await page.evaluate(async theme => {
      document.body.className = `auth-ready logged-in discord-ui-mode discord-home-view discord-discover-view ${theme}`;
      document.getElementById('appLoadingSplash').remove();
      const grid = document.getElementById('discordHomeServerGrid'); grid.replaceChildren(); grid.style.width = '460px';
      const { createDiscoveryCard, installDiscoveryFilter } = await import('/js/discovery_ui.js');
      window.opened = [];
      for (const [index, name] of ['長い名前のサーバーが何文字あっても壊れない', 'テスト部屋', '<script>bad</script>'].entries()) grid.append(createDiscoveryCard({ id: String(index), name, joinedUsers: ['a', 'b'] }, s => window.opened.push(s.id)));
      installDiscoveryFilter(grid, document.getElementById('covoDiscoverySearch'), document.getElementById('covoDiscoveryResultCount'));
    }, theme);
    const card = page.locator('.discord-server-card').first();
    const button = card.getByRole('button');
    const box = await card.boundingBox(), btn = await button.boundingBox();
    expect(btn.width).toBeGreaterThan(100); expect(btn.x + btn.width).toBeLessThanOrEqual(box.x + box.width);
    await card.focus(); await page.keyboard.press('Enter'); expect(await page.evaluate(() => window.opened)).toEqual(['0']);
    await page.locator('#covoDiscoverySearch').fill('テスト');
    await expect(page.locator('.discord-server-card:visible')).toHaveCount(1);
    await page.locator('#covoDiscoverySearch').fill('ありません'); await expect(page.locator('.covo-discovery-filter-empty')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.locator('.discord-server-card:visible')).toHaveCount(3);
    await page.screenshot({ path: `scratch/discovery-${theme || 'light'}.png` });
  });
}

test('recovery diagnosis and repair preserve keys/outbox and work without the main app', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await routeApp(page, { standalone: true, ios: true, recovery: true });
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('covo_local_db_user_alice', 1); request.onupgradeneeded = () => request.result.createObjectStore('settings'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put('KEEP_ARCHIVE', 'archive'); tx.oncomplete = resolve; tx.onerror = reject; }); db.close();
    await (await caches.open('covo_media_cache_v1')).put('/encrypted-file', new Response('ENCRYPTED_ATTACHMENT'));
  });
  await page.locator('[data-action="inspect"]').click();
  await expect(page.locator('#recoveryStatus')).toContainText('診断が完了');
  const report = JSON.parse(await page.locator('#recoveryReport').textContent());
  expect(report.viewport.standalone).toBe(true);
  expect(JSON.stringify(report)).not.toMatch(/KEEP_KEY|KEEP_OUTBOX|alice/);
  await page.locator('[data-action="repair"]').click();
  expect((await page.locator('#covoRecoveryNotice').boundingBox()).height).toBeLessThan(250);
  expect(await page.evaluate(() => [localStorage.getItem('covo_private_key_alice'), localStorage.getItem('covo_outbox_alice'), localStorage.getItem('covo_missing_files_v3')])).toEqual(['KEEP_KEY', 'KEEP_OUTBOX', null]);
  expect(await page.evaluate(async () => (await (await caches.open('covo_media_cache_v1')).match('/encrypted-file')).text())).toBe('ENCRYPTED_ATTACHMENT');
  await expect(page.locator('[data-action="logs"]')).toBeDisabled();
  await expect(page.locator('[data-action="quit"]')).toBeDisabled();
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.locator('#covoRecoveryNotice button').click();
  await page.evaluate(() => { document.body.scrollTop = 0; });
  await page.screenshot({ path: 'scratch/recovery-mobile.png' });
});

test('recovery versions retry the same page and block unsupported or unsigned installs', async ({ page }) => {
  const pages = []; let requests = 0;
  await routeApp(page, { recovery: true });
  await page.route('https://api.github.com/**', route => {
    pages.push(new URL(route.request().url()).searchParams.get('page'));
    if (++requests === 1) return route.fulfill({ status: 503, body: '{}' });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify([
      { tag_name: 'v1.1.1', assets: [] }, { tag_name: 'v1.1.284', assets: [{ name: 'Covo.exe', browser_download_url: 'https://evil.test/app.exe' }] }
    ]) });
  });
  const button = page.locator('[data-action="releases"]');
  await button.click(); await expect(page.locator('#recoveryStatus')).toContainText('HTTP 503');
  await expect(button).toBeEnabled(); await button.click();
  await expect(page.locator('#recoveryReleases .covo-recovery-release')).toHaveCount(2);
  await expect(page.locator('#recoveryReleases button:enabled')).toHaveCount(0);
  expect(pages).toEqual(['1', '1']);
  expect(await page.evaluate(() => localStorage.getItem('covo_ignore_force_update'))).toBe(null);
});

test('recovery inspection reports blocked storage instead of claiming success or rejecting the page', async ({ page }) => {
  await routeApp(page, { recovery: true });
  await page.evaluate(() => { indexedDB.databases = () => Promise.reject(new Error('blocked')); caches.keys = () => Promise.reject(new Error('blocked')); });
  await page.locator('[data-action="inspect"]').click();
  await expect(page.locator('#recoveryStatus')).toContainText('一部の保存領域');
  const report = JSON.parse(await page.locator('#recoveryReport').textContent());
  expect(report.databases).toBe(null); expect(report.caches).toBe(null);
  await expect(page.locator('[data-action="inspect"]')).toBeEnabled();
});
