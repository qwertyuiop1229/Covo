const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
async function setup(page){
  await page.setContent('<div id="scroller" style="height:400px;width:400px;overflow:auto;overflow-anchor:none;transform:scaleY(-1)"><div id="before" style="height:900px"></div><div id="target" style="height:120px;transform:scaleY(-1)">target</div><div style="height:1200px"></div></div>');
  await page.addScriptTag({content:fs.readFileSync('public/js/chat_scroll.js','utf8').replace(/\bexport /g,'')});
  await page.evaluate(()=>{window.s=document.getElementById('scroller');window.controller=createChatScroller(s);window.target=()=>{const c=s.getBoundingClientRect(),r=document.getElementById('target').getBoundingClientRect();return s.scrollTop+(c.top+c.bottom-r.top-r.bottom)/2;};});
}
test('inverted scroll eases, tracks changing geometry and stops at the target',async({page})=>{
  await setup(page);await page.evaluate(()=>{window.result=controller.to(target);});
  await expect.poll(()=>page.evaluate(()=>s.scrollTop)).toBeGreaterThan(0);expect(await page.evaluate(()=>controller.running)).toBe(true);
  await page.evaluate(()=>{document.getElementById('before').style.height='1120px';s.style.height='350px';});
  expect(await page.evaluate(()=>window.result)).toBe(true);
  expect(await page.evaluate(()=>Math.abs(target()-s.scrollTop))).toBeLessThanOrEqual(0.6);expect(await page.evaluate(()=>controller.running)).toBe(false);
});
test('manual input cancels alignment and later layout changes cannot pull the reader back',async({page})=>{
  await setup(page);await page.evaluate(()=>{window.result=controller.to(target);});await page.waitForTimeout(80);
  await page.evaluate(()=>s.dispatchEvent(new Event('touchstart')));expect(await page.evaluate(()=>window.result)).toBe(false);
  const offset=await page.evaluate(()=>s.scrollTop);await page.evaluate(()=>document.getElementById('before').style.height='1500px');await page.waitForTimeout(250);
  expect(await page.evaluate(()=>s.scrollTop)).toBe(offset);
});
test('a replacement jump, channel change and reduced motion release the animation',async({page})=>{
  await setup(page);await page.evaluate(()=>{window.first=controller.to(target);window.second=controller.to(()=>0);});
  expect(await page.evaluate(()=>window.first)).toBe(false);expect(await page.evaluate(()=>window.second)).toBe(true);
  await page.evaluate(()=>{window.active=true;window.third=controller.to(target,{active:()=>active});active=false;});expect(await page.evaluate(()=>window.third)).toBe(false);
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{window.fourth=controller.to(target);});await page.waitForTimeout(50);
  expect(await page.evaluate(()=>Math.abs(target()-s.scrollTop))).toBeLessThanOrEqual(0.6);expect(await page.evaluate(()=>window.fourth)).toBe(true);
});
