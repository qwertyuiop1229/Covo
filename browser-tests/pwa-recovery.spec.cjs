const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

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

test('keyboard dismissal restores only document scrolling and cancels on refocus', async ({ page }) => {
  await routeApp(page, { standalone: true, ios: true });
  await page.evaluate(() => {
    document.getElementById('appLoadingSplash').remove();
    const chat = document.createElement('div'); chat.id = 'scrollProbe'; chat.style.cssText = 'height:80px;overflow:auto'; chat.innerHTML = '<div style="height:1000px">chat</div>'; document.body.append(chat); chat.scrollTop = 300;
    const input = document.createElement('textarea'); input.id = 'focusProbe'; document.body.append(input);
    window.rootResets = 0; window.scrollTo = () => { window.rootResets++; };
    Object.defineProperty(window, 'scrollY', { get: () => 80, configurable: true });
    input.focus(); input.blur();
  });
  await expect.poll(() => page.evaluate(() => window.rootResets)).toBeGreaterThan(0);
  expect(await page.locator('#scrollProbe').evaluate(el => el.scrollTop)).toBe(300);
  await page.evaluate(() => { focusProbe.focus(); focusProbe.blur(); focusProbe.focus(); window.rootResets = 0; });
  await page.waitForTimeout(550);
  expect(await page.evaluate(() => window.rootResets)).toBe(0);
});

test('installed mobile server panel has no gradient shadow and chrome follows navigation in all themes', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await routeApp(page, { standalone: true, ios: true });
  for (const theme of ['', 'dark-server-theme', 'discord-dark-theme']) {
    await page.evaluate(theme => { document.getElementById('appLoadingSplash')?.remove(); document.body.className = `auth-ready logged-in discord-ui-mode ${theme}`; window.covoViewport.refresh(); }, theme);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(await page.locator('#discordServerNav').evaluate(el => getComputedStyle(el).backgroundColor));
    expect(await page.locator('#userPanel').evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');
  }
});

test('mobile diagnostics has a direct settings entry, back navigation and a viewport report', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await routeApp(page, { standalone: true, ios: true });
  const main = fs.readFileSync('public/js/main.js', 'utf8');
  const navigation = parser.parse(main, { sourceType: 'module' }).program.body.filter(node => node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression' && ['openMobileDetail', 'closeMobileDetail'].includes(node.expression.left.property?.name)).map(node => main.slice(node.start, node.end)).join('\n');
  await page.evaluate(async navigation => {
    document.getElementById('appLoadingSplash').remove();
    document.body.className = 'auth-ready logged-in discord-ui-mode';
    document.getElementById('mobileProfileScreen').classList.add('active');
    window.loadLocalDiagnostics = () => {};
    window.eval(navigation);
    (await import('/js/diagnostics_runtime.js')).installDiagnostics();
  }, navigation);
  await page.locator('.covo-mobile-diagnostics-entry').click();
  await expect(page.locator('#mobileDetailDiagnostics')).toBeVisible();
  await page.locator('#mobileDetailDiagnostics').getByRole('button', { name: '結果を表示', exact: true }).click();
  const report = JSON.parse(await page.locator('#mobileDetailDiagnostics pre').textContent());
  expect(report.viewport.standalone).toBe(true); expect(report.viewport.ios).toBe(true);
  await expect(page.locator('[data-covo-diagnostics-status]')).toBeHidden();
  await page.getByRole('button', { name: '設定に戻る', exact: true }).click();
  await expect(page.locator('#mobileDetailDiagnostics')).toBeHidden();
});

for (const [theme, width] of [['', 1180], ['dark-server-theme', 402], ['discord-dark-theme', 820]]) {
  test(`server settings ${theme || 'light'} ${width}: real navigation, safe rename, cancel and retry`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await routeApp(page, { standalone: true, ios: true });
    const source = fs.readFileSync('public/js/main.js', 'utf8');
    const nodes = parser.parse(source, { sourceType: 'module' }).program.body;
    const snippets = nodes.filter(node => (node.type === 'FunctionDeclaration' && node.id.name === 'openServerSettings') ||
      (node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression' && ['openSsMobileTab', 'goBackSsMobileMenu', 'switchSsTab'].includes(node.expression.left.property?.name))).map(node => source.slice(node.start, node.end)).join('\n');
    await page.evaluate(async ({ theme, snippets }) => {
      document.getElementById('appLoadingSplash').remove(); document.body.className = `auth-ready logged-in discord-ui-mode ${theme}`;
      const api = await import('/js/server_profile_settings.js'); Object.assign(window, api);
      window.currentServerId = 'server-a'; window.userId = 'alice'; window.isAdmin = false; window.currentSsTab = 'overview';
      window.currentServerData = { name: 'Before', createdBy: 'alice', serverAdmins: [] };
      window.serverSettingsModal = document.getElementById('serverSettingsModal'); window.writes = [];
      window.closeServerMenu = window.closeServerActionSheet = () => {};
      window.openModal = el => el.classList.remove('hidden'); window.escapeHtml = text => text;
      window.loadServerSettingsRooms = window.loadServerSettingsMembers = window.loadInviteCodes = window.loadServerStampsForAdmin = () => { throw new Error('Unexpected initial data read'); };
      window.discard = false;
      window.serverProfileEditor = api.createServerProfileEditor({ getOwner: () => userId,
        confirmDiscard: async () => window.discard, applied: (id, name) => { currentServerData.name = name; },
        transact: async (id, mutate) => { if (window.failSave) throw new Error('offline'); const server = { ...currentServerData }; if (window.delaySave) await new Promise(resolve => { window.finishSave = resolve; }); await mutate(server, patch => { window.writes.push({ id, patch }); }); }
      });
      window.eval(snippets); window.openServerSettings = openServerSettings;
      window.closeServerSettingsModal = () => serverProfileEditor.close(() => serverSettingsModal.classList.add('hidden'));
      await openServerSettings();
    }, { theme, snippets });
    const input = page.locator('#renameServerInput'); await expect(input).toBeVisible(); await expect(input).toHaveValue('Before');
    if (width < 769) await expect(page.locator('#closeServerSettingsBtn')).toBeHidden();
    else await expect(page.locator('#ssMobileHeader')).toBeHidden();
    await input.fill('After'); await expect(page.locator('#serverProfileSaveBar')).toBeVisible();
    await page.evaluate(() => closeServerSettingsModal()); await expect(input).toBeVisible();
    await page.evaluate(() => { window.failSave = true; }); await page.locator('#renameServerBtn').click();
    await expect(page.locator('#serverProfileStatus')).toHaveText('offline'); await expect(input).toHaveValue('After');
    await page.evaluate(() => { window.failSave = false; }); await page.locator('#renameServerBtn').click();
    await expect(page.locator('#serverProfileSaveBar')).toBeHidden();
    await expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(await page.evaluate(() => window.writes)).toEqual([{ id: 'server-a', patch: { name: 'After' } }]);
    const box = await input.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `scratch/server-settings-${width}.png` });
    await input.fill('Delayed name'); await page.evaluate(() => { window.delaySave = true; }); await page.locator('#renameServerBtn').click();
    await page.evaluate(() => { currentServerId = 'server-b'; currentServerData = { name: 'Other server', createdBy: 'alice', serverAdmins: [] }; serverProfileEditor.open({ id: currentServerId, uid: 'alice', server: currentServerData, globalAdmin: false }); window.finishSave(); });
    await expect(input).toHaveValue('Other server'); await expect(page.locator('#serverProfileSaveBar')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(2);
    expect(await page.evaluate(() => window.writes[1])).toEqual({ id: 'server-a', patch: { name: 'Delayed name' } });
    expect(await page.evaluate(() => currentServerData.name)).toBe('Other server');
  });
}

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
