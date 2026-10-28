const {test,expect}=require('@playwright/test');
const http=require('node:http');
const fs=require('node:fs');

test('local messaging SDK loads in a real service worker without fetching a CDN',async({page})=>{
  const bundle=fs.readFileSync('public/vendor/firebase/firebase-messaging-worker.js');
  const server=http.createServer((request,response)=>{
    if(request.url==='/sdk.js') {response.setHeader('Content-Type','text/javascript');return response.end(bundle);}
    if(request.url==='/sw.js') {response.setHeader('Content-Type','text/javascript');return response.end("importScripts('/sdk.js');self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));self.addEventListener('message',event=>event.ports[0].postMessage({version:self.firebase.SDK_VERSION,messaging:typeof self.firebase.messaging}));");}
    response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Local messaging SDK check</title>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const result=await page.evaluate(async()=>{
      await navigator.serviceWorker.register('/sw.js');
      const registration=await navigator.serviceWorker.ready;
      return new Promise((resolve,reject)=>{
        const channel=new MessageChannel(),timer=setTimeout(()=>reject(Error('messaging worker SDK timeout')),5000);
        channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};
        registration.active.postMessage('sdk-check',[channel.port2]);
      });
    });
    expect(result).toEqual({version:'12.19.0',messaging:'function'});
    await page.evaluate(async()=>{for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();});
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
