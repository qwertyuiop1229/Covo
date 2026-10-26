const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
async function fixture(page){
  await page.route('https://covo.test/**',route=>{const name=new URL(route.request().url()).pathname;if(name==='/')return route.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/css/main.css"></head><body class="discord-dark-theme"></body></html>'});const file=path.resolve('public','.'+name);return file.startsWith(path.resolve('public')+path.sep)&&fs.existsSync(file)?route.fulfill({path:file,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':undefined}):route.fulfill({status:404});});
  await page.goto('https://covo.test/');
}
test('Firestore fatal errors show one non-destructive recovery action without automatic reloads',async({page})=>{
  await fixture(page);await page.evaluate(async()=>{
    localStorage.setItem('test-key','KEEP_KEY');localStorage.setItem('test-outbox','KEEP_PENDING');window.reloads=0;window.saves=0;window.notices=[];window.isBusy=false;
    const {installFirestoreRecovery,isFatalFirestoreError}=await import('/js/firestore_health.js');
    window.health=installFirestoreRecovery({onLog:callback=>window.sdkLog=callback,reload:()=>reloads++,saveDraft:()=>saves++,busy:()=>isBusy,confirm:async()=>false,notify:text=>notices.push(text)});
    window.same=installFirestoreRecovery()===health;
    window.falsePositive=isFatalFirestoreError('Tracking Prevention blocked access to storage')||isFatalFirestoreError('Target ID already exists: 24');
    for(let i=0;i<30;i++)sdkLog({message:'Firestore (11.6.1): INTERNAL ASSERTION FAILED: Unexpected state (ID: ca9)'});
  });
  await expect(page.locator('#covoFirestoreRecovery')).toHaveCount(1);expect(await page.evaluate(()=>({same,falsePositive,reloads}))).toEqual({same:true,falsePositive:false,reloads:0});
  await page.evaluate(()=>isBusy=true);await page.getByRole('button',{name:'接続を再起動',exact:true}).click();expect(await page.evaluate(()=>reloads)).toBe(0);
  await page.evaluate(()=>isBusy=false);await page.getByRole('button',{name:'接続を再起動',exact:true}).click();
  expect(await page.evaluate(()=>({reloads,saves,key:localStorage.getItem('test-key'),outbox:localStorage.getItem('test-outbox')}))).toEqual({reloads:1,saves:1,key:'KEEP_KEY',outbox:'KEEP_PENDING'});
  await expect(page.getByRole('button',{name:'接続を再起動',exact:true})).toBeDisabled();
});
test('a failed draft save or active installer prevents reload and leaves a retry path',async({page})=>{
  await fixture(page);await page.evaluate(async()=>{
    window.reloads=0;window.messages=[];const {installFirestoreRecovery}=await import('/js/firestore_health.js');
    installFirestoreRecovery({onLog:callback=>window.sdkLog=callback,reload:()=>reloads++,saveDraft:()=>false,notify:text=>messages.push(text)});
    sdkLog({message:'FIRESTORE INTERNAL ASSERTION FAILED (ID: b815)'});window.covoReinstalling=true;
  });
  const button=page.getByRole('button',{name:'接続を再起動',exact:true});await button.click();expect(await page.evaluate(()=>reloads)).toBe(0);
  await page.evaluate(()=>window.covoReinstalling=false);await button.click();await expect(button).toBeEnabled();expect(await page.evaluate(()=>reloads)).toBe(0);expect(await page.evaluate(()=>messages.length)).toBe(2);
});
