import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { createReadStream } from 'node:fs';
import { realpath, stat, readFile } from 'node:fs/promises';
import {networkInterfaces} from 'node:os';
import {isIP} from 'node:net';
import {previewRuntime,mobileSetup} from './dev_preview_runtime.mjs';
import {proxyDevelopmentWorker} from './dev_worker_proxy.mjs';
import {sensitivePath} from './check_secret_safety.mjs';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const worker = 'https://simplechat-api.astro-fray-server.workers.dev';
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.webp':'image/webp', '.gif':'image/gif', '.woff2':'font/woff2', '.woff':'font/woff', '.mp4':'video/mp4', '.webm':'video/webm', '.mp3':'audio/mpeg', '.wav':'audio/wav' };

// This endpoint exists only in the loopback preview process, never in public/ or the Worker.
export function localAddresses(interfaces=networkInterfaces()) {
  return [...new Set(Object.entries(interfaces).sort(([a],[b])=>Number(/virtual|vethernet|vmware|docker|wsl|vpn/i.test(a))-Number(/virtual|vethernet|vmware|docker|wsl|vpn/i.test(b))).flatMap(([,entries])=>entries).filter(entry=>!entry.internal && entry.family==='IPv4' && isIP(entry.address)===4 && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address)).map(entry=>entry.address))];
}
export function createWebPreviewServer({ fetcher = fetch, root = publicRoot, lanAddresses = [], tls = null, httpsPort = 5443, nativeDevelopment = false } = {}) {
  const handler=async (request, response) => {
    // A pipelined response may not have a socket assigned yet. The request owns
    // the connection even while its response waits behind an earlier request.
    const socket=request.socket;
    const active=()=>Boolean(socket && !socket.destroyed && !request.aborted && !response.destroyed && !response.writableEnded);
    if(!active())return;
    try {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy','no-referrer');
    const port = socket.localPort;
    if(!Number.isInteger(port))return;
    const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`,...lanAddresses.map(address=>`${address}:${port}`)]);
    let originAllowed = true;
    try { if (request.headers.origin) originAllowed = hosts.has(new URL(request.headers.origin).host); } catch (_) { originAllowed = false; }
    if (!hosts.has(request.headers.host) || !originAllowed) {
      response.writeHead(403).end(); return;
    }
      const url = new URL(request.url, 'http://' + request.headers.host);
      const lan=lanAddresses.includes(url.hostname),secure=Boolean(socket.encrypted);
      if(lan && !secure) {
        if(!['GET','HEAD'].includes(request.method)){response.writeHead(405).end();return;}
        if(url.pathname==='/__covo_dev__/covo-local-ca.cer') {
          if(!tls?.caDer){response.writeHead(404).end();return;}
          response.writeHead(200,{'Content-Type':'application/x-x509-ca-cert','Content-Disposition':'attachment; filename="covo-local-ca.cer"'});response.end(request.method==='HEAD'?undefined:tls.caDer);return;
        }
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        response.end(request.method==='HEAD'?undefined:mobileSetup({hostname:url.hostname,httpsPort,fingerprint:tls?.fingerprint || ''}));return;
      }
      if(url.pathname.startsWith('/__covo_dev__/worker/')) {await proxyDevelopmentWorker(request,response,url,fetcher);return;}
      if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      if(url.pathname==='/' && url.hostname==='127.0.0.1' && request.headers['sec-fetch-dest']==='document') {
        response.writeHead(302,{Location:(secure?'https':'http')+'://localhost:'+port+'/'}).end();return;
      }
      if(url.pathname==='/__covo_dev__/runtime.js') {
        response.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});response.end(request.method==='HEAD'?undefined:(`window.covoNativeDevelopment=${nativeDevelopment};\n`+previewRuntime));return;
      }
      if (url.pathname === '/__covo_dev__/maintenance') {
        const headers = request.headers.authorization ? { Authorization:request.headers.authorization } : {};
        const upstream = await fetcher(worker + '/api/maintenance', { headers, cache:'no-store', signal:AbortSignal.timeout(10000), redirect:'error' });
        const result = await upstream.json().catch(() => null);
        if(!active())return;
        // Only the exact legacy route-not-found response is eligible. Never mask outages or maintenance.
        const legacy = upstream.status === 404 && result?.error === 'Not Found' && Object.keys(result).length === 1;
        response.setHeader('Content-Type','application/json');
        response.writeHead(legacy ? 200 : upstream.status);
        response.end(request.method === 'HEAD' ? undefined : JSON.stringify(legacy ? { enabled:false, adminAllowed:false, revision:0, previewLegacyBackend:true } : result));
        return;
      }
      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      if (sensitivePath(pathname) || pathname.split('/').some(part => part.startsWith('.') || part === 'node_modules')) { response.writeHead(404).end(); return; }
      const requested = resolve(root, '.' + pathname);
      const base = await realpath(root);
      const file = await realpath(requested);
      if (!file.startsWith(base + sep)) { response.writeHead(404).end(); return; }
      const info = await stat(file);
      if(!active())return;
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type',types[extname(file).toLowerCase()] || 'application/octet-stream');
      if(file===resolve(base,'index.html')) {
        const html=(await readFile(file,'utf8')).replace(/<head>/i,'<head><script src="/__covo_dev__/runtime.js"></script>');
        if(!active())return;
        response.writeHead(200,{'Content-Length':Buffer.byteLength(html)});response.end(request.method==='HEAD'?undefined:html);return;
      }
      response.setHeader('Accept-Ranges','bytes');
      let start=0,end=info.size-1;
      if (request.headers.range) {
        const match=/^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (!match || (!match[1] && !match[2])) { response.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end(); return; }
        start=match[1] ? Number(match[1]) : Math.max(0,info.size-Number(match[2]));
        end=match[1] && match[2] ? Math.min(Number(match[2]),end) : end;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>end || start>=info.size) { response.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end(); return; }
        response.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${info.size}`,'Content-Length':end-start+1});
      } else response.writeHead(200,{'Content-Length':info.size});
      if (request.method === 'HEAD' || !info.size) { response.end(); return; }
      const stream=createReadStream(file,{start,end});
      stream.on('error',()=>response.destroy());response.on('close',()=>stream.destroy());stream.pipe(response);
    } catch (error) {
      if(!active())return;
      if (response.headersSent) { response.destroy(); return; }
      response.writeHead(['ENOENT','ENOTDIR','URIError'].includes(error.code || error.name) ? 404 : 502, {'Content-Type':'application/json'});
      response.end(JSON.stringify({error:'Local preview request failed'}));
    }
  };
  // HTTP also receives TLS metadata for the setup page, but never serves the app to LAN over HTTP.
  const listener=(request,response)=>{handler(request,response).catch(()=>response.destroy());};
  return tls?.serveTLS ? createSecureServer(tls,listener) : createServer(listener);
}

export async function startWebPreview({port=5000,httpsPort=5443,mobile=true,nativeDevelopment=false,print=console.log}={}) {
  const addresses=mobile?localAddresses():[];
  const tls=mobile?await (await import('./dev_tls.mjs')).developmentTLS(fileURLToPath(new URL('../.cache/dev-preview/tls',import.meta.url)),addresses):null;
  const http=createWebPreviewServer({lanAddresses:addresses,tls,httpsPort,nativeDevelopment});
  let https;
  try {
    await new Promise((resolve,reject)=>{http.once('error',reject);http.listen(port,mobile?'0.0.0.0':'127.0.0.1',resolve);});
    if(mobile){https=createWebPreviewServer({lanAddresses:addresses,tls:{...tls,serveTLS:true},httpsPort});await new Promise((resolve,reject)=>{https.once('error',reject);https.listen(httpsPort,'0.0.0.0',resolve);});}
  } catch(error){http.close();https?.close();throw error;}
  print(`[test:web] PC: http://localhost:${port}`);
  print('[test:web] Firebase and other APIs use production data. This preview does not isolate test data.');
  if(mobile) {
    print('[test:web] Same Wi-Fi / mobile setup (first-time HTTPS certificate instructions):');
    const QRCode=(await import('qrcode')).default;
    for(const address of addresses){const url=`http://${address}:${port}/__covo_dev__/setup`;print(url);print(await QRCode.toString(url,{type:'terminal',small:true}));print(`HTTPS: https://${address}:${httpsPort}/`);}
    if(!addresses.length)print('[test:web] No private IPv4 address found. Connect this PC to Wi-Fi and restart.');
    print('CA SHA-256: '+tls.fingerprint);
  }
  const close=async()=>{for(const server of [http,https].filter(Boolean)){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
  return {http,https,close};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2), index=args.indexOf('--port');
  const port=index<0 ? 5000 : Number(args[index+1]);
  if (!Number.isInteger(port) || port<1 || port>65535) throw new Error('Invalid --port');
  const secureIndex=args.indexOf('--https-port'),httpsPort=secureIndex<0?5443:Number(args[secureIndex+1]);
  if(!Number.isInteger(httpsPort)||httpsPort<1||httpsPort>65535)throw new Error('Invalid --https-port');
  try {
    const server=await startWebPreview({port,httpsPort,mobile:!args.includes('--desktop')});
    for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close().then(()=>process.exit()));
  } catch(error){console.error('[test:web]',error.message);process.exitCode=1;}
}
