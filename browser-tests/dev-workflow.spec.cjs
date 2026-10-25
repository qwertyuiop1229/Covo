const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),https=require('node:https'),http=require('node:http');
const net=require('node:net');
const scratch=path.resolve('scratch');
async function temporary(){await fs.mkdir(scratch,{recursive:true});return fs.mkdtemp(path.join(scratch,'dev-workflow-'));}
async function remove(folder){const target=path.resolve(folder);if(!target.startsWith(scratch+path.sep))throw Error('unexpected cleanup target');await fs.rm(target,{recursive:true,force:true});}
async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return server.address().port;}
async function close(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
function request(port,pathname,{secure=false,ca,headers={},method='GET',body}={}){
  return new Promise((resolve,reject)=>{
    const r=(secure?https:http).request({hostname:'127.0.0.1',port,path:pathname,method,ca,headers},response=>{
      const parts=[];response.on('data',chunk=>parts.push(chunk));response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(parts)}));
    });r.on('error',reject);r.end(body);
  });
}

test('mobile CA stays stable across IP changes, verifies HTTPS, and never serves the private key',async()=>{
  const folder=await temporary();let server,guide;
  try{
    const {developmentTLS}=await import('../scripts/dev_tls.mjs');
    const {createWebPreviewServer}=await import('../scripts/serve_web_preview.mjs');
    const a=await developmentTLS(folder,['192.168.1.50']);
    const b=await developmentTLS(folder,['192.168.1.50','192.168.1.51']);expect(b.fingerprint).toBe(a.fingerprint);
    server=createWebPreviewServer({lanAddresses:['192.168.1.50'],tls:{...b,serveTLS:true},fetcher:async()=>new Response(JSON.stringify({error:'Not Found'}),{status:404})});
    const port=await listen(server);
    const metadata=await request(port,'/__covo_dev__/maintenance',{secure:true,ca:b.ca,headers:{Host:`192.168.1.50:${port}`}});
    expect(metadata.status).toBe(200);expect(JSON.parse(metadata.body).previewLegacyBackend).toBe(true);
    const manifest=JSON.parse((await request(port,'/manifest.json',{secure:true,ca:b.ca})).body);
    expect(manifest.display).toBe('standalone');
    const launch=new URL(manifest.start_url,`https://127.0.0.1:${port}/manifest.json`);
    const document=await request(port,launch.pathname,{secure:true,ca:b.ca});
    expect(document.status).toBe(200);expect(document.body.toString()).toContain('<script src="/__covo_dev__/runtime.js"></script>');
    expect((await request(port,'/.cache/dev-preview/tls/root-key.pem',{secure:true,ca:b.ca})).status).toBe(404);
    guide=createWebPreviewServer({lanAddresses:['192.168.1.50'],tls:b,httpsPort:port});const plainPort=await listen(guide);
    const page=await request(plainPort,'/',{headers:{Host:`192.168.1.50:${plainPort}`}});
    expect(page.body.toString()).toContain('証明書信頼設定');expect(page.body.toString()).toContain('192.168.1.50');expect(page.body.toString()).not.toContain('BEGIN RSA PRIVATE KEY');
    const certificate=await request(plainPort,'/__covo_dev__/covo-local-ca.cer',{headers:{Host:`192.168.1.50:${plainPort}`}});
    expect(certificate.body.equals(b.caDer)).toBe(true);
    expect((await request(plainPort,'/__covo_dev__/worker/api/signup',{method:'POST',headers:{Host:`192.168.1.50:${plainPort}`},body:'secret'})).status).toBe(405);
  }finally{if(server)await close(server);if(guide)await close(guide);await remove(folder);}
});

test('partial development CA is never overwritten silently',async()=>{
  const folder=await temporary();try{
    const {developmentTLS}=await import('../scripts/dev_tls.mjs');
    await developmentTLS(folder,['192.168.1.10']);const original=await fs.readFile(path.join(folder,'root.pem'));
    await fs.unlink(path.join(folder,'root-key.pem'));
    await expect(developmentTLS(folder,[])).rejects.toThrow('incomplete');
    expect((await fs.readFile(path.join(folder,'root.pem'))).equals(original)).toBe(true);
  }finally{await remove(folder);}
});

test('development proxy forwards the fixed API path, protocol, credential and body without granting roles',async()=>{
  const {createWebPreviewServer}=await import('../scripts/serve_web_preview.mjs');let captured;
  const server=createWebPreviewServer({fetcher:async(url,options)=>{captured={url,options};return new Response(JSON.stringify({error:'Forbidden'}),{status:403});}});
  const port=await listen(server);try{
    const response=await request(port,'/__covo_dev__/worker/api/setMaintenance',{method:'POST',headers:{Authorization:'Bearer test-token','X-Covo-Protocol':'2','Content-Type':'application/json'},body:'{"enabled":true}'});
    expect(response.status).toBe(403);expect(captured.url).toBe('https://simplechat-api.astro-fray-server.workers.dev/api/setMaintenance');
    expect(captured.options.headers.get('authorization')).toBe('Bearer test-token');expect(captured.options.headers.get('x-covo-protocol')).toBe('2');expect(captured.options.body.toString()).toBe('{"enabled":true}');
    expect((await request(port,'/__covo_dev__/worker/not-api')).status).toBe(404);
  }finally{await close(server);}
});

test('LAN address selection includes private adapters, puts Wi-Fi first and excludes public/invalid IPs',async()=>{
  const {localAddresses}=await import('../scripts/serve_web_preview.mjs');
  const entry=address=>({address,family:'IPv4',internal:false});
  expect(localAddresses({'vEthernet':[entry('172.16.0.1')],'Wi-Fi':[entry('192.168.1.4'),entry('8.8.8.8'),entry('10.999.0.1')],'loopback':[{...entry('127.0.0.1'),internal:true}]})).toEqual(['192.168.1.4','172.16.0.1']);
});

test('native cache detects source, executable, environment and file-list changes but ignores frontend edits',async()=>{
  const folder=await temporary();try{
    const {nativeInputs,nativeCacheMatches,finishedDevelopmentBuild}=await import('../scripts/test_windows.mjs');
    const {recordCache}=await import('../scripts/dev_build_cache.mjs');
    await fs.mkdir(path.join(folder,'src-tauri/src'),{recursive:true});await fs.mkdir(path.join(folder,'public'));
    const source=path.join(folder,'src-tauri/src/lib.rs'),exe=path.join(folder,'app.exe'),cache=path.join(folder,'native.json');
    await fs.writeFile(source,'fn main() {}');await fs.writeFile(exe,'test executable fixture');
    const inputs=await nativeInputs(folder);await recordCache(cache,[...inputs,exe]);
    const state=JSON.parse(await fs.readFile(cache));Object.assign(state,{inputs,environment:'toolchain-a'});await fs.writeFile(cache,JSON.stringify(state));
    expect(await nativeCacheMatches(cache,inputs,'toolchain-a',exe)).toBe(true);
    await fs.writeFile(path.join(folder,'public/main.js'),'changed frontend');expect(await nativeCacheMatches(cache,await nativeInputs(folder),'toolchain-a',exe)).toBe(true);
    await fs.writeFile(path.join(folder,'package-lock.json'),'changed JavaScript dependencies');expect(await nativeCacheMatches(cache,await nativeInputs(folder),'toolchain-a',exe)).toBe(true);
    expect(await nativeCacheMatches(cache,inputs,'toolchain-b',exe)).toBe(false);
    await fs.writeFile(source,'fn changed() {}');expect(await nativeCacheMatches(cache,inputs,'toolchain-a',exe)).toBe(false);
    await fs.writeFile(source,'fn main() {}');await fs.writeFile(exe,'changed executable');expect(await nativeCacheMatches(cache,inputs,'toolchain-a',exe)).toBe(false);
    await fs.writeFile(exe,'test executable fixture');await fs.writeFile(path.join(folder,'src-tauri/src/new.rs'),'new native file');expect(await nativeCacheMatches(cache,await nativeInputs(folder),'toolchain-a',exe)).toBe(false);
    expect(finishedDevelopmentBuild('\x1b[32mFinished\x1b[0m `dev` profile [unoptimized + debuginfo]')).toBe(true);
    expect(finishedDevelopmentBuild('error: could not compile')).toBe(false);
  }finally{await remove(folder);}
});

test('bundled output cache verifies bytes instead of trusting timestamps',async()=>{
  const folder=await temporary();try{
    const {recordCache,cacheMatches}=await import('../scripts/dev_build_cache.mjs');
    const input=path.join(folder,'source.js'),output=path.join(folder,'bundle.js'),cache=path.join(folder,'cache.json');
    await fs.writeFile(input,'source');await fs.writeFile(output,'bundle');await recordCache(cache,[input,output]);
    expect(await cacheMatches(cache,[input])).toBe(true);
    await fs.writeFile(output,'tampered');expect(await cacheMatches(cache,[input])).toBe(false);
    await fs.writeFile(output,'bundle');await fs.unlink(input);expect(await cacheMatches(cache,[input])).toBe(false);
  }finally{await remove(folder);}
});

test('mobile setup instructions fit a phone in light and dark themes without horizontal overflow',async({page})=>{
  const {mobileSetup}=await import('../scripts/dev_preview_runtime.mjs');
  await page.setViewportSize({width:402,height:874});
  for(const colorScheme of ['light','dark']){
    await page.emulateMedia({colorScheme});
    await page.setContent(mobileSetup({hostname:'192.168.0.4',httpsPort:5443,fingerprint:'AA:BB:CC:DD:EE:FF'}));
    await expect(page.getByRole('heading',{name:'Covo スマホ検証',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'4. PWAで検証する場合',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.getByRole('link',{name:'HTTPSでCovoを開く',exact:true})).toHaveAttribute('href','https://192.168.0.4:5443/');
    await page.screenshot({path:`scratch/dev-mobile-setup-${colorScheme}.png`,fullPage:true});
  }
});

test('HTTP pipelining serves queued responses even while response.socket is null',async()=>{
  const {createWebPreviewServer}=await import('../scripts/serve_web_preview.mjs');let release,queued=false,waitingSocketWasNull=false;
  const server=createWebPreviewServer({fetcher:()=>new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify({enabled:false,adminAllowed:false,revision:0})));})});
  server.on('request',(req,res)=>{if(req.url==='/manifest.json'){queued=true;waitingSocketWasNull=res.socket===null;}});
  const port=await listen(server);let socket;
  try{
    const received=new Promise((resolve,reject)=>{
      socket=net.connect(port,'127.0.0.1',()=>socket.write(`GET /__covo_dev__/maintenance HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\nGET /manifest.json HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`));
      const chunks=[];socket.on('data',chunk=>chunks.push(chunk));socket.on('error',reject);socket.on('end',()=>resolve(Buffer.concat(chunks).toString()));
    });
    await expect.poll(()=>queued).toBe(true);expect(waitingSocketWasNull).toBe(true);release();
    const body=await received;expect(body.match(/HTTP\/1\.1 200 OK/g)).toHaveLength(2);expect(body).toContain('"standalone"');
    expect((await request(port,'/manifest.json')).status).toBe(200);
  }finally{release?.();socket?.destroy();await close(server);}
});

test('closing a proxied request during an upstream read does not stop the server or retain its body',async()=>{
  const {createWebPreviewServer}=await import('../scripts/serve_web_preview.mjs');let release,signal,upstream;
  const server=createWebPreviewServer({fetcher:(_,options)=>{signal=options.signal;return new Promise(resolve=>{release=()=>{upstream=new Response('late response');resolve(upstream);};});}});
  const port=await listen(server);let pending;
  try{
    pending=http.get(`http://127.0.0.1:${port}/__covo_dev__/worker/api/getErrors`);pending.on('error',()=>{});
    await expect.poll(()=>Boolean(release)).toBe(true);pending.destroy();await expect.poll(()=>signal.aborted).toBe(true);
    release();await new Promise(setImmediate);await new Promise(setImmediate);
    expect((await upstream.body.getReader().read()).done).toBe(true);
    expect((await request(port,'/manifest.json')).status).toBe(200);
  }finally{pending?.destroy();await close(server);}
});
