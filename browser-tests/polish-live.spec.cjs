const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
async function fixture(page,theme=''){
  await page.route('https://covo.test/**',route=>{const p=new URL(route.request().url()).pathname;
    if(p==='/')return route.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/css/styles.css"><link rel="stylesheet" href="/css/main.css"><link rel="stylesheet" href="/css/desktop.css"></head><body><div class="container" style="display:none"></div><div id="appinfoSection"></div></body></html>'});
    const file=path.resolve('public','.'+p);return file.startsWith(path.resolve('public')+path.sep)&&fs.existsSync(file)?route.fulfill({path:file,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':undefined}):route.fulfill({status:404});});
  await page.goto('https://covo.test/');await page.evaluate(theme=>document.body.className=theme,theme);
}
for(const theme of ['','dark-server-theme','discord-dark-theme'])test('repair card and indeterminate progress use themed colors ('+(theme||'light')+')',async({page})=>{
  await fixture(page,theme);await page.setViewportSize({width:402,height:874});
  await page.evaluate(async()=>{window.showCustomConfirm=async()=>true;(await import('/js/reinstall_ui.js')).installReinstallUI({busy:()=>false,notify(){},invoke:async command=>{if(command==='reinstall_app')await new Promise(resolve=>window.finishReinstall=resolve);},listen:async(event,callback)=>{window.progressCallback=callback;return()=>{};}});});
  const card=page.locator('.covo-reinstall-card');await card.getByRole('button',{name:'再インストール',exact:true}).click();
  const progress=card.locator('progress');await expect(progress).toBeVisible();
  expect(await progress.evaluate(node=>({appearance:getComputedStyle(node).appearance,image:getComputedStyle(node).backgroundImage}))).toMatchObject({appearance:'none',image:expect.stringContaining('linear-gradient')});
  expect(await card.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.screenshot({path:'scratch/reinstall-polish-'+(theme||'light')+'.png'});
  await page.evaluate(()=>progressCallback({payload:{downloaded:40,total:100}}));await expect(progress).toHaveJSProperty('value',40);await expect(card.getByRole('status')).toContainText('40%');
  await page.evaluate(()=>finishReinstall());
});
test('admin wheel scroll is horizontal, idempotent, and releases the wheel at edges',async({page})=>{
  await fixture(page);
  await page.evaluate(async()=>{const wrapper=document.createElement('div');wrapper.style.width='260px';wrapper.innerHTML='<div class="covo-admin-tabs" style="display:flex;overflow:auto"><button style="min-width:500px">管理項目</button></div>';document.body.append(wrapper);const {installNavigationUI}=await import('/js/navigation_ui.js');const options={};installNavigationUI(options);installNavigationUI(options);window.tabs=wrapper.firstChild;window.fireWheel=()=>{const e=new WheelEvent('wheel',{deltaY:100,cancelable:true,bubbles:true});tabs.dispatchEvent(e);return e.defaultPrevented;};});
  expect(await page.evaluate(()=>fireWheel())).toBe(true);expect(await page.evaluate(()=>tabs.scrollLeft)).toBe(100);
  await page.evaluate(()=>tabs.scrollLeft=10000);expect(await page.evaluate(()=>fireWheel())).toBe(false);
});
test('URL cards and images stay compact on narrow layouts',async({page})=>{
  await fixture(page);await page.setViewportSize({width:402,height:874});
  const source=fs.readFileSync('public/js/main.js','utf8'),parser=require('@babel/parser');const n=parser.parse(source,{sourceType:'module'}).program.body.find(n=>n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.property?.name==='attachDiscordOgEmbed');
  await page.route('https://covo.test/preview.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"></svg>'}));
  const loader=parser.parse(source,{sourceType:'module'}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='loadOgPreviewImage');
  await page.evaluate(code=>{window.escapeHtml=v=>String(v).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');window._covoOgCache=new Map([['https://example.com',{success:true,title:'Preview',description:'Preview description',image:'https://covo.test/preview.svg'}]]);window.eval(code);},source.slice(loader.start,loader.end)+'\n'+source.slice(n.start,n.end));
  await page.evaluate(()=>window.attachDiscordOgEmbed(document.getElementById('appinfoSection'),'https://example.com'));
  const card=page.locator('.covo-og-embed-card');expect(await card.evaluate(node=>node.getBoundingClientRect().width)).toBeLessThanOrEqual(340);
  await expect.poll(()=>page.locator('.covo-og-image img').evaluate(img=>img.complete)).toBe(true);expect(await page.locator('.covo-og-image').evaluate(node=>node.getBoundingClientRect().height)).toBeLessThanOrEqual(128);
});
test('repeated preview images share a request and a rate-limited image keeps its card text',async({page})=>{
  await fixture(page);let requests=0;
  await page.route('https://covo.test/rate-limited.png',route=>{requests++;return route.fulfill({status:429,body:'rate limited'});});
  const source=fs.readFileSync('public/js/main.js','utf8'),parser=require('@babel/parser');
  const node=parser.parse(source,{sourceType:'module'}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='loadOgPreviewImage');
  await page.evaluate(async code=>{
    window.eval(code);
    const load=async()=>{const card=document.createElement('div');card.innerHTML='<a>リンクは利用できます</a><div><img></div>';document.body.appendChild(card);await loadOgPreviewImage(card.querySelector('img'),'https://covo.test/rate-limited.png');return card;};
    await Promise.all(Array.from({length:10},load));await load();
  },source.slice(node.start,node.end));
  expect(requests).toBe(1);await expect(page.locator('img')).toHaveCount(0);await expect(page.locator('a')).toHaveCount(11);
});
test('maintenance boolean changes revalidate authority and unblock without polling',async({page})=>{
  await fixture(page);let enabled=false,requests=0;
  await page.route('https://covo.test/api/maintenance',route=>{requests++;return route.fulfill({json:{enabled,adminAllowed:false,revision:requests}});});
  await page.evaluate(async()=>{
    document.body.insertAdjacentHTML('beforeend','<div id="covoMaintenancePanel" hidden><h1></h1><p data-maintenance-message></p><button data-maintenance-retry></button><button data-maintenance-login></button></div><div id="authMessage"></div>');
    const {createMaintenanceGate,createMaintenanceSignalHandler}=await import('/js/maintenance_runtime.js');window.stops=0;window.resumes=0;
    window.gate=createMaintenanceGate({endpoint:location.origin+'/api/maintenance',stopped:async()=>stops++});await gate.check();
    window.signal=createMaintenanceSignalHandler({enabled:()=>gate.state?.enabled,blocked:()=>window.covoMaintenanceBlocked,block:()=>{window.covoMaintenanceBlocked=true;document.querySelector('.container').inert=true;},refresh:()=>gate.changed(null),recovered:async()=>resumes++});
    await signal(false);
  });expect(requests).toBe(1);
  enabled=true;await page.evaluate(()=>signal(true));await expect(page.locator('#covoMaintenancePanel')).toBeVisible();expect(await page.evaluate(()=>stops)).toBe(1);
  await page.evaluate(()=>signal(true));expect(requests).toBe(2);
  enabled=false;await page.evaluate(()=>signal(false));await expect(page.locator('#covoMaintenancePanel')).toBeHidden();expect(await page.evaluate(()=>resumes)).toBe(1);expect(requests).toBe(3);
});

test('a replacement maintenance watcher waits for an old check before confirming release',async({page})=>{
  await fixture(page);let requests=0;
  await page.route('https://covo.test/api/maintenance',route=>{requests++;return route.fulfill({json:{enabled:requests===1,adminAllowed:false,revision:requests}});});
  await page.evaluate(async()=>{
    document.body.insertAdjacentHTML('beforeend','<div id="covoMaintenancePanel" hidden><h1></h1><p data-maintenance-message></p><button data-maintenance-retry></button><button data-maintenance-login></button></div><div id="authMessage"></div>');
    const {createMaintenanceGate,createMaintenanceSignalHandler}=await import('/js/maintenance_runtime.js');
    window.gate=createMaintenanceGate({endpoint:location.origin+'/api/maintenance',stopped:async()=>{window.releaseCheck=gate.changed(null);}});
    await gate.check();await window.releaseCheck;
  });
  expect(requests).toBe(2);expect(await page.evaluate(()=>window.covoMaintenanceBlocked)).toBe(false);await expect(page.locator('#covoMaintenancePanel')).toBeHidden();
});
