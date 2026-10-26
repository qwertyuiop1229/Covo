const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),parser=require('@babel/parser');
const main=fs.readFileSync('public/js/main.js','utf8');
test.use({hasTouch:true});
const ast=parser.parse(main,{sourceType:'module'});
const declaration=name=>{const node=ast.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);return main.slice(node.start,node.end);};
async function fixture(page){
  await page.route('https://covo.test/**',route=>{
    const name=new URL(route.request().url()).pathname;
    if(name==='/')return route.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/css/main.css"></head><body><button id="gesture">操作</button><div id="imageLightbox" style="display:none"><img id="lightboxImage"></div></body></html>'});
    if(name==='/js/gallery-fixture.js')return route.fulfill({contentType:'text/javascript',body:`let _photoSwipeCSS=null,_photoSwipeOpening=false,_activePhotoSwipe=null;${declaration('ensurePhotoSwipeCSS')}\n${declaration('openPhotoSwipeModal')}\nwindow.openPhotoSwipeModal=openPhotoSwipeModal;window.active=()=>_activePhotoSwipe;`});
    const file=path.resolve('public','.'+name);return file.startsWith(path.resolve('public')+path.sep)&&fs.existsSync(file)?route.fulfill({path:file,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':undefined}):route.fulfill({status:404});
  });
  await page.goto('https://covo.test/');
}
test('notification audio waits for a trusted gesture, never resumes in background and respects mute',async({page})=>{
  await fixture(page);await page.evaluate(async()=>{
    window.created=0;window.resumed=0;window.played=0;
    window.AudioContext=class {constructor(){created++;this.state='suspended';window.ctx=this;this.currentTime=0;}resume(){resumed++;this.state='running';return Promise.resolve();}createOscillator(){return {frequency:{setValueAtTime(){}},connect(){},start(){played++;},stop(){}};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}};
    window.sound=(await import('/js/ui_helpers.js')).playNotificationSound;
    sound();sound();
  });
  expect(await page.evaluate(()=>created)).toBe(0);await page.locator('#gesture').click();
  await page.evaluate(()=>sound());expect(await page.evaluate(()=>({created,resumed,played}))).toEqual({created:1,resumed:1,played:3});
  await page.evaluate(()=>{ctx.state='suspended';sound();sound();});expect(await page.evaluate(()=>resumed)).toBe(1);
  await page.locator('#gesture').click();expect(await page.evaluate(()=>played)).toBe(3);
  await page.evaluate(()=>{localStorage.setItem('simplechat_sound','false');sound();});expect(await page.evaluate(()=>played)).toBe(3);
});
test('local image viewer zooms and closes by vertical drag without a CDN or duplicate overlays',async({page})=>{
  await fixture(page);await page.setViewportSize({width:820,height:1180});
  const external=[];page.on('request',request=>{if(!request.url().startsWith('https://covo.test/')&&!request.url().startsWith('data:'))external.push(request.url());});
  await page.evaluate(async()=>{
    await import('/js/gallery-fixture.js');
    const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1200;window.photo=canvas.toDataURL();
    await Promise.all([openPhotoSwipeModal(photo,'photo.png'),openPhotoSwipeModal(photo,'photo.png')]);
  });
  await expect(page.locator('.pswp')).toHaveCount(1);await expect(page.locator('.pswp')).toBeVisible();
  await page.waitForFunction(()=>active()?.currSlide?.currZoomLevel>0);
  await page.waitForFunction(()=>active()?.opener?.isOpen);
  const fit=await page.evaluate(()=>active().currSlide.currZoomLevel);
  await page.getByRole('button',{name:'拡大・縮小'}).click();
  await expect.poll(()=>page.evaluate(()=>active().currSlide.currZoomLevel)).toBeGreaterThan(fit);
  await page.keyboard.press('Escape');await expect(page.locator('.pswp')).toHaveCount(0);
  await page.evaluate(()=>openPhotoSwipeModal(photo,'photo.png'));
  await page.waitForFunction(()=>active()?.opener?.isOpen);
  await page.mouse.move(400,500);await page.mouse.down();await page.mouse.move(400,1050,{steps:15});await page.mouse.up();
  await expect(page.locator('.pswp')).toHaveCount(0);expect(external).toEqual([]);
});
for(const device of ['', 'covo-ios-phone','covo-ios-tablet'])test(`navy server context shares the channel header surface while server rail stays distinct: ${device||'desktop'}`,async({page})=>{
  await fixture(page);await page.evaluate(device=>{document.documentElement.className=device?`covo-ios-standalone ${device}`:'';document.documentElement.style.setProperty('--covo-shell-background','#0b0f19');document.documentElement.style.setProperty('--safe-top','24px');document.body.className='discord-ui-mode dark-server-theme';document.body.innerHTML='<div id="discordTitleBar"></div><div id="appContainer"><div id="serverHeader"></div><div id="currentRoomHeader"></div><div id="discordServerNav"></div></div>';},device);
  const colors=await page.evaluate(()=>Object.fromEntries(['discordTitleBar','serverHeader','currentRoomHeader','discordServerNav'].map(id=>[id,getComputedStyle(document.getElementById(id)).backgroundColor])));
  expect(colors.discordTitleBar).toBe(colors.currentRoomHeader);expect(colors.serverHeader).toBe(colors.currentRoomHeader);expect(colors.discordServerNav).not.toBe(colors.serverHeader);
});

test('tablet two-finger pinch zoom and downward swipe work with touch input',async({page})=>{
  await fixture(page);await page.setViewportSize({width:820,height:1180});
  await page.evaluate(async()=>{await import('/js/gallery-fixture.js');const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1200;window.photo=canvas.toDataURL();await openPhotoSwipeModal(photo,'photo.png');});
  await page.waitForFunction(()=>active()?.opener?.isOpen);
  const fit=await page.evaluate(()=>active().currSlide.currZoomLevel);
  const client=await page.context().newCDPSession(page);
  const touch=(type,points)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id])=>({x,y,id,radiusX:3,radiusY:3}))});
  await touch('touchStart',[[350,590,1],[470,590,2]]);
  for(let i=1;i<=12;i++){await touch('touchMove',[[350-i*12,590,1],[470+i*12,590,2]]);await page.evaluate(()=>new Promise(requestAnimationFrame));}
  await touch('touchEnd',[]);
  await expect.poll(()=>page.evaluate(()=>active().currSlide.currZoomLevel)).toBeGreaterThan(fit*1.3);
  await page.getByRole('button',{name:'閉じる',exact:true}).click();await expect(page.locator('.pswp')).toHaveCount(0);
  await page.evaluate(()=>openPhotoSwipeModal(photo,'photo.png'));await page.waitForFunction(()=>active()?.opener?.isOpen);
  await touch('touchStart',[[410,430,1]]);
  for(let i=1;i<=15;i++){await touch('touchMove',[[410,430+i*35,1]]);await page.evaluate(()=>new Promise(requestAnimationFrame));}
  await touch('touchEnd',[]);await expect(page.locator('.pswp')).toHaveCount(0);
});
