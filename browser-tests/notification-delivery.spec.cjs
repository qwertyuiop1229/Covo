const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),parser=require('@babel/parser');
const main=fs.readFileSync('public/js/main.js','utf8'),nodes=parser.parse(main,{sourceType:'module'}).program.body;
const declaration=name=>{const node=nodes.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);return main.slice(node.start,node.end);};
const assignment=name=>{const node=nodes.find(n=>n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.property?.name===name);return main.slice(node.start,node.end);};
async function setup(page){
  await page.route('https://covo.test/',route=>route.fulfill({body:'<html><body></body></html>',contentType:'text/html'}));await page.goto('https://covo.test/');
  await page.evaluate(()=>{
    window.sent=[];window.notices=[];window.fail=false;window.registration=null;
    window.Notification=class{static permission='granted';constructor(title,options){if(window.fail)throw Error('denied');sent.push({title,options});}};
    Object.defineProperty(navigator,'serviceWorker',{value:{getRegistration:async()=>window.registration},configurable:true});
    document.hasFocus=()=>true;localStorage.setItem('simplechat_browser_notif','false');localStorage.setItem('covo_notifications_paused_until',String(Date.now()+60000));
    window.alertMessage=(text,type)=>notices.push({text,type});
  });
  await page.addScriptTag({content:`let isTauri=false,userId='alice',lastNotificationTime=0,lastNotificationKey='';const formatNotificationBody=value=>value;const playNotificationSound=()=>{};${declaration('showNotification')} ${assignment('sendTestNotification')}`});
}
test('focused Chrome test notification bypasses foreground suppression and only reports success after requesting OS display',async({page})=>{
  await setup(page);await page.evaluate(()=>window.sendTestNotification());
  expect(await page.evaluate(()=>sent.length)).toBe(1);expect(await page.evaluate(()=>notices[0].text)).toContain('OSへ通知の表示を依頼');
});
test('notification API failure is reported and existing SW display works without waiting for ready',async({page})=>{
  await setup(page);await page.evaluate(()=>{fail=true;});await page.evaluate(()=>window.sendTestNotification());
  expect(await page.evaluate(()=>notices[0].type)).toBe('warning');
  await page.evaluate(()=>{notices=[];registration={showNotification:async(title,options)=>sent.push({title,options})};});await page.evaluate(()=>window.sendTestNotification());
  expect(await page.evaluate(()=>sent.length)).toBe(1);expect(await page.evaluate(()=>sent[0].options.data.serverId)).toBeNull();
});
