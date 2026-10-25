const {test,expect}=require('@playwright/test');

test('preview media, HTML and API reads use the fixed proxy while other origins and access errors remain intact',async({page})=>{
  const calls=[];const local=await preview(async(url,options)=>{calls.push({url,options});return new Response('blocked',{status:403});});
  const direct=[];
  try{
    await page.route('https://**',route=>{direct.push(route.request().url());return route.abort();});
    await page.goto(local.url+'/manifest.json');
    const {previewRuntime}=await import('../scripts/dev_preview_runtime.mjs');await page.evaluate(previewRuntime);
    const result=await page.evaluate(async()=>{
      const base='https://simplechat-api.astro-fray-server.workers.dev/api/file/';
      const a=new Image();a.src=base+'property';document.body.append(a);
      const b=new Image();b.setAttribute('src',base+'attribute');document.body.append(b);
      const box=document.createElement('div');box.innerHTML='<img src="'+base+'html"><video poster="'+base+'poster"></video>';document.body.append(box);
      const srcset=new Image();srcset.srcset=base+'small 1x, '+base+'large 2x';
      const foreign=new Image();foreign.src='https://unrelated.example/file';
      const api=await fetch('https://simplechat-api.astro-fray-server.workers.dev/api/syncRtdb',{method:'POST',headers:{Authorization:'Bearer preview-test','X-Covo-Protocol':'2'},body:'{}'});
      return {sources:[a.src,b.src,...[...box.querySelectorAll('[src],[poster]')].map(n=>n.src||n.poster)],srcset:srcset.srcset,foreign:foreign.src,status:api.status};
    });
    expect(result.sources.every(url=>url.startsWith(local.url+'/__covo_dev__/worker/api/file/'))).toBe(true);
    expect(result.srcset).not.toContain('workers.dev');expect(result.foreign).toBe('https://unrelated.example/file');expect(result.status).toBe(403);
    await expect.poll(()=>calls.filter(c=>c.url.includes('/api/file/')).length).toBeGreaterThanOrEqual(4);
    expect(direct.filter(url=>url.includes('astro-fray-server'))).toEqual([]);
    const api=calls.find(c=>c.url.endsWith('/api/syncRtdb'));expect(api.options.headers.get('authorization')).toBe('Bearer preview-test');expect(api.options.headers.get('x-covo-protocol')).toBe('2');
  }finally{await page.close();await local.close();}
});

async function preview(fetcher) {
  const {createWebPreviewServer}=await import('../scripts/serve_web_preview.mjs');
  const server=createWebPreviewServer({fetcher});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {server,url:'http://127.0.0.1:'+server.address().port,close:async()=>{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }};
}

test('test:web opens the real application with the exact legacy Worker 404 and keeps production endpoints fail closed', async({page})=>{
  const calls=[];
  const local=await preview(async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({error:'Not Found'}),{status:404});});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.route('https://**',route=>route.abort());
    await page.goto(local.url);
    expect(new URL(page.url()).hostname).toBe('localhost');
    await expect.poll(()=>page.evaluate(()=>window.covoMaintenanceBlocked),{timeout:15000}).toBe(false);
    await expect(page.locator('#covoMaintenancePanel')).toBeHidden();
    const endpoints=await page.evaluate(async()=>{
      const {maintenanceStatusEndpoint}=await import('/js/maintenance_runtime.js');
      const original='https://simplechat-api.astro-fray-server.workers.dev/api/maintenance';
      return ['http://localhost:5000/','https://simplechat-65a0d.web.app/','http://tauri.localhost/','https://localhost.evil.test/'].map(url=>maintenanceStatusEndpoint(original,url));
    });
    expect(endpoints[0]).toBe('http://localhost:5000/__covo_dev__/maintenance');
    expect(endpoints.slice(1).every(url=>url==='https://simplechat-api.astro-fray-server.workers.dev/api/maintenance')).toBe(true);
    expect(calls.length).toBeGreaterThan(0);expect(calls.every(call=>call.url.endsWith('/api/maintenance'))).toBe(true);
    expect(errors).toEqual([]);
  } finally {await page.close();await local.close();}
});

test('test:web honours live maintenance, authorization, outages and unexpected 404s',async()=>{
  let answer;
  const local=await preview(async()=>{if(answer instanceof Error)throw answer;return answer.clone();});
  try {
    for (const status of [401,403,500,503,404]) {
      answer=new Response(JSON.stringify({error:'unavailable'}),{status});
      const result=await fetch(local.url+'/__covo_dev__/maintenance');
      expect(result.status).toBe(status);expect((await result.json()).previewLegacyBackend).toBeUndefined();
    }
    for (const adminAllowed of [false,true]) {
      answer=new Response(JSON.stringify({enabled:true,adminAllowed,revision:4}));
      const result=await fetch(local.url+'/__covo_dev__/maintenance');
      expect(await result.json()).toEqual({enabled:true,adminAllowed,revision:4});
    }
    answer=new Error('network down');expect((await fetch(local.url+'/__covo_dev__/maintenance')).status).toBe(502);
  } finally {await local.close();}
});

test('preview metadata forwards the admin credential only to the fixed Worker endpoint and rejects foreign origins',async()=>{
  const calls=[];
  const local=await preview(async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({enabled:false,adminAllowed:true,revision:2}));});
  try {
    await fetch(local.url+'/__covo_dev__/maintenance',{headers:{Authorization:'Bearer test-only-token'}});
    expect(calls[0].options.headers.Authorization).toBe('Bearer test-only-token');
    expect((await fetch(local.url+'/__covo_dev__/maintenance',{headers:{Origin:'https://foreign.test'}})).status).toBe(403);
    expect((await fetch(local.url+'/__covo_dev__/maintenance',{headers:{Origin:'invalid'}})).status).toBe(403);
    expect((await fetch(local.url+'/__covo_dev__/maintenance',{method:'POST'})).status).toBe(405);
    expect((await fetch(local.url+'/%2e%2e%2fpackage.json')).status).toBe(404);
    expect(calls).toHaveLength(1);
  } finally {await local.close();}
});

test('a real maintenance response blocks local startup before application data requests',async({page})=>{
  const local=await preview(async()=>new Response(JSON.stringify({enabled:true,adminAllowed:false,revision:1})));
  const data=[];
  try {
    await page.route('https://**',route=>{if(/firestore\.googleapis\.com|firebasedatabase\.app/.test(new URL(route.request().url()).hostname))data.push(route.request().url());return route.abort();});
    await page.goto(local.url);
    await expect(page.locator('#covoMaintenancePanel')).toBeVisible();
    await expect(page.locator('#covoMaintenancePanel h1')).toHaveText('ただいまメンテナンス中です');
    expect(await page.evaluate(()=>window.covoMaintenanceBlocked)).toBe(true);expect(data).toEqual([]);
  } finally {await page.close();await local.close();}
});
