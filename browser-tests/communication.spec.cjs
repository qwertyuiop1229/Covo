const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
async function fixture(page, theme = '') {
  await page.route('https://covo.test/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/styles.css"><link rel="stylesheet" href="/css/main.css"><link rel="stylesheet" href="/css/desktop.css"></head><body style="color:var(--covo-text)"><div id="desktopSettingsContainer"></div></body></html>' });
    const file = path.resolve('public', '.' + pathname);
    if (!file.startsWith(path.resolve('public') + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ path: file, contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : undefined });
  });
  await page.goto('https://covo.test/');
  await page.evaluate(theme => { document.body.className = theme; }, theme);
}

test('slow optional fonts and emoji CDN do not block the application module or DOM readiness', async ({ page }) => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  const font = html.match(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/)[0];
  const emoji = html.match(/<script[^>]+twemoji\.min\.js[^>]*><\/script>/)[0];
  const waiting = [];
  await page.route('https://fonts.googleapis.com/**', route => new Promise(resolve => { waiting.push(() => route.abort().then(resolve)); }));
  await page.route('https://cdn.jsdelivr.net/**', route => new Promise(resolve => { waiting.push(() => route.abort().then(resolve)); }));
  await page.route('https://covo.test/', route => route.fulfill({ contentType: 'text/html', body: `<html><head>${font}${emoji}<script type="module">window.shellReady=true;</script></head><body>起動中</body></html>` }));
  await page.goto('https://covo.test/', { waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => window.shellReady)).toBe(true);
  for (const release of waiting) await release();
});

test('bundled Firebase services share the same app without any CDN imports', async ({ page }) => {
  await fixture(page);
  const external = [], errors = [];
  page.on('request', request => { if (!request.url().startsWith('https://covo.test/')) external.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  const result = await page.evaluate(async () => {
    const appModule = await import('/vendor/firebase/firebase-app.js');
    const [authModule, firestoreModule, databaseModule] = await Promise.all(['auth', 'firestore', 'database'].map(name => import('/vendor/firebase/firebase-' + name + '.js')));
    const app = appModule.initializeApp({ apiKey: 'test-key', projectId: 'demo-covo', databaseURL: 'https://demo-covo.firebaseio.com', appId: 'test' });
    return { count: appModule.getApps().length, auth: authModule.getAuth(app).app === app, firestore: firestoreModule.getFirestore(app).app === app, database: databaseModule.getDatabase(app).app === app };
  });
  expect(result).toEqual({ count: 1, auth: true, firestore: true, database: true });
  expect(external).toEqual([]); expect(errors).toEqual([]);
});

for (const theme of ['', 'dark-server-theme', 'discord-dark-theme']) {
  test(`Windows update UI respects ${theme || 'light'} and never applies during a call`, async ({ page }) => {
    await fixture(page, theme);
    await page.route('https://covo.test/vendor/desktop-updater.js', route => route.fulfill({ contentType: 'text/javascript', body: `export async function check() { return {version:'2.0.0', download:async callback=>{window.downloads++;callback({event:'Started',data:{contentLength:100}});callback({event:'Progress',data:{chunkLength:100}});},install:async()=>{window.installs++;},close:async()=>{}}; }` }));
    await page.evaluate(async () => {
      window.downloads = 0; window.installs = 0; window.busy = false; window.calls = []; window.events = {}; window.notices = [];
      window.alertMessage = message => window.notices.push(message);
      window.covoDesktopBusy = () => window.busy;
      window.__TAURI__ = { core: { invoke: async (command, args) => window.calls.push({ command, args }) }, event: { listen: async (event, callback) => { window.events[event] = callback; } } };
      await import('/js/desktop_runtime.js'); await window.covoCheckUpdate(true);
    });
    const panel = page.locator('.covo-desktop-update');
    await expect(panel).toBeVisible(); await expect(panel.getByRole('status')).toContainText('再起動して適用');
    const colors = await panel.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, expected: getComputedStyle(document.body).getPropertyValue('--covo-surface').trim() }));
    expect(colors.background).toBe(theme ? theme === 'discord-dark-theme' ? 'rgb(43, 45, 49)' : 'rgb(30, 41, 59)' : 'rgb(255, 255, 255)');
    await page.evaluate(() => { window.busy = true; });
    await panel.getByRole('button', { name: '再起動して更新' }).click();
    expect(await page.evaluate(() => window.installs)).toBe(0);
    expect(await page.evaluate(() => window.notices.some(text => text.includes('通話')))).toBe(true);
    await page.locator('#covoMicrophoneShortcut').check();
    expect(await page.evaluate(() => window.calls.some(call => call.command === 'set_microphone_shortcut' && call.args.enabled))).toBe(true);
    await page.evaluate(() => { window.events['desktop-action']({ payload: 'pause-notifications' }); });
    expect(await page.evaluate(() => Number(localStorage.getItem('covo_notifications_paused_until')) > Date.now())).toBe(true);
    await page.screenshot({ path: `scratch/desktop-update-${theme || 'light'}.png` });
    await page.evaluate(() => { window.busy = false; });
    await panel.getByRole('button', { name: '再起動して更新' }).click();
    expect(await page.evaluate(() => window.installs)).toBe(1);
  });
}


test('native development skips production updater checks and reinstall while retaining desktop controls', async ({ page }) => {
  await fixture(page);
  let checks=0;
  await page.route('https://covo.test/vendor/desktop-updater.js',route=>{checks++;return route.abort();});
  await page.evaluate(async()=>{
    window.covoNativeDevelopment=true;window.covoDesktopBusy=()=>false;window.notices=[];
    window.alertMessage=message=>window.notices.push(message);
    window.__TAURI__={core:{invoke:async()=>{}},event:{listen:async()=>()=>{}}};
    await import('/js/desktop_runtime.js');await window.covoCheckUpdate(true);
  });
  expect(checks).toBe(0);expect(await page.evaluate(()=>window.notices.some(text=>text.includes('開発実行中')))).toBe(true);
  await expect(page.locator('#covoMicrophoneShortcut')).toBeVisible();
  await expect(page.locator('.covo-reinstall-card')).toHaveCount(0);
});

test('complete anonymous application boots with external services offline and no uncaught module errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://covo.test') return route.abort();
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.resolve('public', '.' + pathname);
    if (!file.startsWith(path.resolve('public') + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404 });
    return route.fulfill({ path: file, contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.json') ? 'application/json' : undefined });
  });
  await page.goto('https://covo.test/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => typeof window.covoDesktopBusy), { timeout: 15000 }).toBe('function');
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('maintenance preflight precedes Firebase data access and blocked startup never reads application data', async ({ page }) => {
  const dataRequests = []; let release;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (/firestore\.googleapis\.com|firebasedatabase\.app/.test(url.hostname)) dataRequests.push(url.hostname);
    if (url.pathname === '/api/maintenance') {
      await new Promise(resolve => { release = resolve; });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ enabled: true, adminAllowed: false, revision: 1 }) });
    }
    if (url.origin !== 'https://covo.test') return route.abort();
    const file = path.resolve('public', '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(path.resolve('public') + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404 });
    return route.fulfill({ path: file, contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : undefined });
  });
  await page.goto('https://covo.test/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => Boolean(release)).toBe(true); expect(dataRequests).toEqual([]);
  release(); await expect(page.locator('#covoMaintenancePanel')).toBeVisible();
  await page.waitForTimeout(400); expect(dataRequests).toEqual([]);
  expect(await page.evaluate(() => window.covoMaintenanceBlocked)).toBe(true);
});


test('an update-required response blocks bundled SDK writes locally and leaves read/update paths usable', async ({ page }) => {
  await fixture(page);
  const requests = [];
  await page.route('https://simplechat-api.astro-fray-server.workers.dev/**', route => {
    requests.push({ method: route.request().method(), protocol: route.request().headers()['x-covo-protocol'] });
    return route.fulfill({ status: route.request().method() === 'GET' ? 200 : 426, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '{}' });
  });
  const result = await page.evaluate(async () => {
    const protocol = await import('/js/client_protocol.js');
    const [{ initializeApp }, fs, db] = await Promise.all([import('/vendor/firebase/firebase-app.js'), import('/vendor/firebase/firebase-firestore.js'), import('/vendor/firebase/firebase-database.js')]);
    const app = initializeApp({ apiKey: 'test', projectId: 'demo-protocol', databaseURL: 'https://demo-protocol.firebaseio.com' });
    let notices = 0; window.addEventListener('covo-update-required', () => notices++);
    await fetch(protocol.WORKER_ORIGIN + '/api/reportError', { method: 'POST', body: '{}' });
    const failures = [];
    for (const action of [
      () => fetch(protocol.WORKER_ORIGIN + '/api/reportError', { method: 'POST', body: '{}' }),
      () => fs.setDoc(fs.doc(fs.getFirestore(app), 'collection/document'), { value: 1 }),
      () => fs.writeBatch(fs.getFirestore(app)).set(fs.doc(fs.getFirestore(app), 'collection/document'), { value: 1 }).commit(),
      () => db.set(db.ref(db.getDatabase(app), 'messages/test'), { value: 1 })
    ]) { try { await action(); } catch (error) { failures.push(error.code || 'missing-code'); } }
    const health = await fetch(protocol.WORKER_ORIGIN + '/api/health');
    return { notices, failures, health: health.status };
  });
  expect(result).toEqual({ notices: 1, failures: Array(4).fill('covo/update-required'), health: 200 });
  expect(requests.filter(request => request.method === 'POST')).toHaveLength(1);
  expect(requests.find(request => request.method === 'POST').protocol).toBe('2');
});


for (const theme of ['', 'discord-dark-theme']) test('attachment gradient fits the actual decoded portrait and reduced motion (' + (theme || 'light') + ')', async ({ page }) => {
  await fixture(page, theme); await page.emulateMedia({ reducedMotion: 'reduce' });
  const parser = require('@babel/parser'); const mainSource = fs.readFileSync('public/js/main.js', 'utf8'); const tree = parser.parse(mainSource,{sourceType:'module'}); let mediaSource;
  const walk = node => { if(!node||typeof node!=='object')return; if(node.type==='VariableDeclarator'&&node.id?.name==='setMediaSrc')mediaSource=mainSource.slice(node.init.start,node.init.end);for(const child of Object.values(node))if(Array.isArray(child))child.forEach(walk);else if(child&&typeof child==='object')walk(child); };walk(tree);
  let release; await page.route('https://covo.test/test-image.svg', route => new Promise(resolve => { release = () => route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="240"><rect width="120" height="240" fill="#5865f2"/></svg>'}).then(resolve); }));
  await page.evaluate(async source => {
    const {createMediaPlaceholder}=await import('/js/media_placeholder.js');
    const setSrc = Function('createMediaPlaceholder','message','targetAttachmentUrl','isFileMissing','scheduleMediaLoad','createExpiredFileCard','unmarkFileAsMissing','const setMediaSrc = '+source+'; return setMediaSrc;')(createMediaPlaceholder,{fileName:'portrait.svg'},'https://covo.test/test-image.svg',()=>false,(_,load)=>queueMicrotask(load),()=>{const card=document.createElement('button');card.className='media-error';card.textContent='再試行';return card;},()=>{});
    window.testSetMediaSrc=setSrc;
    const parent=document.createElement('div');parent.style.width='200px';document.body.append(parent);
    const image=document.createElement('img');image.style.maxHeight='250px';setSrc(image,'src');parent.append(image._covoShell);
  }, mediaSource);
  await expect(page.locator('.covo-media-shell')).toHaveClass(/is-loading/);
  expect(await page.locator('.covo-media-shell').evaluate(node => ({width:node.getBoundingClientRect().width,animation:getComputedStyle(node,'::after').animationName,opacity:getComputedStyle(node.firstElementChild).opacity}))).toEqual({width:200,animation:'none',opacity:'0'});
  await page.screenshot({path:'scratch/media-gradient-'+(theme || 'light')+'.png'});
  await expect.poll(() => Boolean(release)).toBe(true); await release();
  await expect(page.locator('.covo-media-shell')).not.toHaveClass(/is-loading/);
  expect(await page.locator('.covo-media-shell').evaluate(node => ({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height}))).toEqual({width:120,height:240});
  let retries=0;await page.route('https://covo.test/retry.svg',route=>route.fulfill(++retries===1?{status:503,body:'unavailable'}:{contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="240"/>'}));
  await page.evaluate(()=>window.testSetMediaSrc(document.querySelector('.covo-media-shell img'),'src','https://covo.test/retry.svg'));
  await expect(page.locator('.media-error')).toBeVisible();await page.locator('.media-error').press('Enter');
  await expect(page.locator('.covo-media-shell')).not.toHaveClass(/is-loading/);expect(retries).toBe(2);await expect(page.locator('.covo-media-shell img')).toHaveCount(1);
});

test('diagnostic copy is local, bounded and excludes private context', async ({ page }) => {
  await fixture(page); const apiRequests=[]; page.on('request',request=>{if(request.url().includes('/api/'))apiRequests.push(request.url());});
  await page.evaluate(async () => {
    const parent=document.createElement('div');parent.id='appinfoSection';document.body.append(parent);
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copiedReport=value;}}});
    const {installDiagnostics}=await import('/js/diagnostics_runtime.js');
    const metrics=installDiagnostics({context:()=>({version:'1.1.282',token:'PRIVATE_TOKEN',email:'PRIVATE_EMAIL',message:'PRIVATE_MESSAGE'})});
    metrics.timing('channel.first.remote',321);metrics.failure('http.404');
  });
  await page.getByRole('button',{name:'レポートを丸ごとコピー'}).click();
  const report=await page.evaluate(()=>window.copiedReport);expect(report).not.toContain('PRIVATE_');expect(JSON.parse(report).stability.timings['channel.first.remote'].p95Ms).toBe(321);expect(apiRequests).toEqual([]);
  await page.getByRole('button',{name:'端末内の計測をリセット'}).click();
  expect(JSON.parse(await page.locator('.covo-diagnostics pre').textContent()).stability.timings).toEqual({});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.body.className='discord-dark-theme';});
  expect(await page.locator('.covo-diagnostics').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  expect(await page.locator('.covo-diagnostics pre').evaluate(node=>getComputedStyle(node).backgroundColor)).toBe('rgb(30, 31, 34)');
  await page.screenshot({path:'scratch/diagnostics-mobile-dark.png'});
});
