import {Readable} from 'node:stream';

export async function proxyDevelopmentWorker(request,response,url,fetcher) {
  const active=()=>!request.aborted && !request.socket?.destroyed && !response.destroyed && !response.writableEnded;
  if(!active())return;
  if (!['GET','HEAD','POST','DELETE','OPTIONS'].includes(request.method)) { response.writeHead(405).end(); return; }
  const path=url.pathname.slice('/__covo_dev__/worker'.length);
  if (!path.startsWith('/api/') || path.includes('\\')) { response.writeHead(404).end(); return; }
  const headers=new Headers({Origin:'http://localhost'});
  for (const key of ['authorization','content-type','x-covo-protocol','range','accept']) if(request.headers[key])headers.set(key,request.headers[key]);
  let body;
  if(!['GET','HEAD'].includes(request.method)) {
    const chunks=[];let size=0;
    for await(const chunk of request) {
      size+=chunk.length;if(size>32*1024*1024){response.writeHead(413).end();return;}chunks.push(chunk);
    }
    body=Buffer.concat(chunks);
  }
  if(!active())return;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  const abort=()=>controller.abort();request.once('aborted',abort);response.once('close',abort);
  try {
    const upstream=await fetcher('https://simplechat-api.astro-fray-server.workers.dev'+path+url.search,{method:request.method,headers,body,signal:controller.signal,redirect:'error'});
    if(!active()) { await upstream.body?.cancel().catch(()=>{});return; }
    for(const key of ['content-type','content-disposition','content-range','accept-ranges','retry-after','x-covo-min-protocol'])if(upstream.headers.has(key))response.setHeader(key,upstream.headers.get(key));
    response.writeHead(upstream.status);
    if(!upstream.body || request.method==='HEAD'){response.end();return;}
    await new Promise((resolve,reject)=>{
      const stream=Readable.fromWeb(upstream.body);
      stream.on('error',reject);response.once('finish',resolve);response.once('close',()=>{stream.destroy();resolve();});stream.pipe(response);
    });
  } finally {clearTimeout(timer);request.off('aborted',abort);response.off('close',abort);}
}
