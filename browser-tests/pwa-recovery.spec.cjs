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

test('login remains blocked after the authentication API resolves until the destination frame is ready', async ({ page }) => {
  await routeApp(page);
  const main = fs.readFileSync('public/js/main.js', 'utf8');
  const node = parser.parse(main, { sourceType: 'module' }).program.body.find(node => node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression' && node.expression.left.property?.name === 'handleUnifiedAuthSubmit');
  await page.evaluate(async source => {
    document.getElementById('appLoadingSplash').remove(); document.body.className = 'auth-ready';
    document.getElementById('authContainer').classList.remove('hidden');
    window.authTransition = (await import('/js/auth_transition.js')).createAuthTransition();
    window.calls = 0; window.auth = {}; window.signInWithEmailAndPassword = async () => { window.calls++; if (window.loginFailure) throw { code: 'auth/wrong-password' }; };
    window.escapeHtml = String; window.getJapaneseAuthErrorMessage = () => 'failed';
    window.eval(source);
  }, main.slice(node.start, node.end));
  await page.locator('#emailInput').fill('test@example.test'); await page.locator('#passwordInput').fill('password123');
  await page.locator('#authButton').click(); await expect(page.locator('#authTransitionOverlay')).toBeVisible();
  await expect(page.locator('#googleAuthButton')).toBeDisabled();
  await page.evaluate(() => handleUnifiedAuthSubmit()); expect(await page.evaluate(() => calls)).toBe(1);
  await page.evaluate(() => { document.body.classList.add('logged-in'); document.getElementById('appContainer').classList.remove('hidden'); authTransition.initializing('alice'); authTransition.ready('alice'); });
  await expect(page.locator('#authTransitionOverlay')).toBeHidden();
  await page.evaluate(() => { document.body.classList.remove('logged-in'); window.loginFailure = true; });
  await page.locator('#authButton').click(); await expect(page.locator('#authTransitionOverlay')).toBeHidden(); await expect(page.locator('#authButton')).toBeEnabled();
  expect(await page.locator('#authContainer').evaluate(el => el.inert)).toBe(false);
});

for (const theme of ['', 'dark-server-theme', 'discord-dark-theme']) {
  test(`composer ${theme || 'light'} keeps the attachment icon, moves recording to plus and gives send a legible brand color`, async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 }); await routeApp(page);
    const main = fs.readFileSync('public/js/main.js', 'utf8');
    const handler = parser.parse(main, { sourceType: 'module' }).program.body.find(node => node.type === 'ExpressionStatement' && main.slice(node.start, node.end).startsWith('fileAttachInput.addEventListener("change"'));
    await page.evaluate(({ theme, handler }) => {
      document.getElementById('appLoadingSplash').remove(); document.body.className = `auth-ready logged-in discord-ui-mode in-chat-view ${theme}`;
      const area = document.getElementById('messageInputArea'); document.body.append(area); area.classList.remove('hidden'); area.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;z-index:9999;display:block';
      document.getElementById('sendMessageButton').disabled = false;
      window.fileAttachInput = document.getElementById('fileAttachInput'); window.fileAttachButton = document.getElementById('fileAttachButton');
      window.handleFilesSelected = async () => {}; window.eval(handler);
    }, { theme, handler: main.slice(handler.start, handler.end) });
    await expect(page.locator('#voiceRecordButton')).toBeHidden();
    expect(await page.locator('#menuVoiceRecordBtn').count()).toBe(1);
    expect(await page.locator('#sendMessageButton').evaluate(el => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
    expect(await page.locator('#sendMessageButton').evaluate(el => getComputedStyle(el).backgroundColor)).toBe(theme ? 'rgb(88, 101, 242)' : 'rgb(71, 82, 196)');
    await page.locator('#fileAttachInput').setInputFiles({ name: 'test.txt', mimeType: 'text/plain', buffer: Buffer.from('test') });
    await expect(page.locator('#fileAttachButton i')).toHaveClass('fas fa-paperclip');
    await page.screenshot({ path: `scratch/composer-${theme || 'light'}.png` });
  });
}

for (const theme of ['', 'dark-server-theme', 'discord-dark-theme']) {
  test(`maintenance and reinstall controls ${theme || 'light'}: block data, preserve by default and require confirmation`, async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1000 }); await routeApp(page);
    await page.evaluate(async theme => {
      document.getElementById('appLoadingSplash').remove(); document.body.className = `auth-ready ${theme}`;
      const { createMaintenanceGate } = await import('/js/maintenance_runtime.js');
      window.stopCount = 0; window.statusRequests = []; window.authorized = false;
      window.fetch = async (_, options) => { window.statusRequests.push(options); return new Response(JSON.stringify({ enabled: true, revision: 1, adminAllowed: window.authorized })); };
      window.gate = createMaintenanceGate({ endpoint: '/api/maintenance', stopped: async () => { window.stopCount++; }, resume: () => gate.check() });
      await gate.check();
    }, theme);
    await expect(page.locator('#covoMaintenancePanel')).toBeVisible(); expect(await page.evaluate(() => window.covoMaintenanceBlocked)).toBe(true);
    expect(await page.locator('.container').evaluate(el => el.inert)).toBe(true);
    await page.screenshot({ path: `scratch/maintenance-${theme || 'light'}.png` });
    await page.evaluate(async () => { window.authorized = true; await gate.check({ getIdToken: async () => 'ADMIN_TOKEN' }); });
    await expect(page.locator('#covoMaintenancePanel')).toBeHidden(); expect(await page.evaluate(() => window.covoMaintenanceBlocked)).toBe(false);
    await page.evaluate(async () => {
      document.getElementById('settingsModal').classList.remove('hidden');
      document.querySelectorAll('#settingsModal .settings-content-section').forEach(el => el.classList.add('hidden'));
      document.getElementById('appinfoSection').classList.remove('hidden');
      document.getElementById('appinfoSection').classList.add('active');
      const { installReinstallUI } = await import('/js/reinstall_ui.js');
      window.nativeCalls = []; window.confirmed = false; window.showCustomConfirm = async () => window.confirmed;
      installReinstallUI({ invoke: async (command, args) => { window.nativeCalls.push({ command, args }); if (command === 'reinstall_app') await new Promise(resolve => { window.finishReinstall = resolve; }); }, listen: async (_, handler) => { window.downloadEvent = handler; return () => {}; }, busy: () => false, notify: () => {} });
    });
    const panel = page.locator('#appinfoSection .covo-reinstall-card');
    const button = panel.getByRole('button', { name: '再インストール', exact: true });
    await expect(panel.locator('input')).toBeChecked(); await button.click();
    expect(await page.evaluate(() => nativeCalls.filter(call => call.command === 'reinstall_app').length)).toBe(0);
    await panel.locator('.covo-reinstall-preserve').click(); await expect(panel.locator('input')).not.toBeChecked(); await expect(panel.locator('.covo-reinstall-warning')).toBeVisible();
    await page.evaluate(() => { window.confirmed = true; }); await button.click();
    await expect(button).toBeDisabled();
    expect(await page.evaluate(() => nativeCalls.find(call => call.command === 'reinstall_app').args)).toEqual({ eraseData: true });
    await page.evaluate(() => window.downloadEvent({ payload: { total: 100, downloaded: 50 } }));
    await expect(panel.locator('progress')).toHaveJSProperty('value', 50);
    await page.evaluate(() => window.finishReinstall()); await expect(button).toBeEnabled();
    await panel.locator('.covo-reinstall-preserve').click(); await expect(panel.locator('input')).toBeChecked(); await button.click();
    expect(await page.evaluate(() => nativeCalls.filter(call => call.command === 'reinstall_app').at(-1).args)).toEqual({ eraseData: false });
    await page.evaluate(() => window.finishReinstall()); await expect(button).toBeEnabled();
  });
}

test('installed mobile server panel has no gradient shadow and chrome follows navigation in all themes', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await routeApp(page, { standalone: true, ios: true });
  for (const theme of ['', 'dark-server-theme', 'discord-dark-theme']) {
    await page.evaluate(theme => { document.getElementById('appLoadingSplash')?.remove(); document.body.className = `auth-ready logged-in discord-ui-mode ${theme}`; window.covoViewport.refresh(); }, theme);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(await page.locator('#discordServerNav').evaluate(el => getComputedStyle(el).backgroundColor));
    expect(await page.locator('#userPanel').evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');
  }
});

for (const [name,width,ios] of [['phone',402,true],['ipad',1180,true],['desktop',1440,false]]) {
  test(name+': diagnostics remains inside app info without a duplicate settings entry',async({page})=>{
    await page.setViewportSize({width,height:1000});await routeApp(page,{ios,standalone:ios});
    await page.evaluate(async()=>{
      document.getElementById('appLoadingSplash').remove();document.body.className='auth-ready logged-in discord-ui-mode';
      if(innerWidth>=768){document.getElementById('settingsModal').classList.remove('hidden');(await import('/js/settings_feature.js')).installSettingsFeature({_appVersion:'1.1.286',updateE2EEStatusUI(){},updateLayoutDebugUI(){}});window.switchDiscordSettingsTab('appinfo');}
      (await import('/js/diagnostics_runtime.js')).installDiagnostics();
    });
    expect(await page.locator('[onclick="openCovoDiagnostics()"],.covo-mobile-diagnostics-entry,#mobileDetailDiagnostics').count()).toBe(0);
    const host=page.locator(width<768?'#mobileDetailAppInfo':'#appinfoSection');
    await host.evaluate(node=>{node.style.display='block';node.classList.add('active');});
    await host.getByRole('button',{name:'結果を表示',exact:true}).dispatchEvent('click');
    expect(JSON.parse(await host.locator('.covo-diagnostics pre').textContent()).viewport.ios).toBe(ios);
  });
}

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
