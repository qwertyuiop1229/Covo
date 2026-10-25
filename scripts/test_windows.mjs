import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest,cacheMatches,recordCache} from './dev_build_cache.mjs';
import {startWebPreview} from './serve_web_preview.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const execute=promisify(execFile);
async function compilerIdentity() {
  try{return (await execute(process.env.RUSTC || 'rustc',['-vV'],{timeout:20000,windowsHide:true})).stdout.trim();}
  catch(error){if(error.code!=='ENOENT')throw error;return (await execute(resolve(homedir(),'.cargo/bin/rustc.exe'),['-vV'],{timeout:20000,windowsHide:true})).stdout.trim();}
}
const children=new Set();let stopping=false;
async function filesIn(folder) {
  try {const files=await readdir(folder,{withFileTypes:true});return (await Promise.all(files.map(file=>file.isDirectory()?filesIn(resolve(folder,file.name)):[resolve(folder,file.name)]))).flat();}
  catch(error){if(error.code==='ENOENT')return [];throw error;}
}
export async function nativeInputs(workspace=root) {
  const files=['Cargo.toml','Cargo.lock','build.rs','tauri.conf.json','tauri.dev.conf.json','tauri.windows.conf.json','.cargo/config.toml']
    .map(name=>resolve(workspace,'src-tauri',name));
  files.push(resolve(workspace,'.cargo/config.toml'),resolve(workspace,'node_modules/@tauri-apps/cli/package.json'));
  for(const name of ['src','capabilities','icons','windows'])files.push(...await filesIn(resolve(workspace,'src-tauri',name)));
  const relevant=files.filter(file=>!relative(workspace,file).replaceAll('\\','/').includes('/windows/bin/'));
  // Track both present files and the list itself, so additions/deletions invalidate the cache.
  const existing=[];for(const file of relevant){try{await readFile(file);existing.push(file);}catch(error){if(error.code!=='ENOENT')throw error;}}
  return existing.sort();
}
function run(executable,args,options={}) {
  return new Promise((resolve,reject)=>{
    const {onOutput,...spawnOptions}=options;
    const child=spawn(executable,args,{cwd:root,stdio:onOutput?['inherit','pipe','pipe']:'inherit',...spawnOptions});
    children.add(child);child.once('close',()=>children.delete(child));
    if(onOutput)for(const name of ['stdout','stderr'])child[name].on('data',chunk=>{process[name].write(chunk);onOutput(String(chunk));});
    child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(new Error(signal?'Stopped: '+signal:'Process exited: '+code)));
  });
}
export function finishedDevelopmentBuild(output) {
  return /Finished\s+`(?:dev|debug)`\s+profile/.test(output.replace(/\x1b\[[0-9;]*m/g,''));
}
export async function nativeCacheMatches(file,inputs,environment,executable) {
  try {
    const state=JSON.parse(await readFile(file,'utf8'));
    return JSON.stringify(state.inputs)===JSON.stringify(inputs) && state.environment===environment && await cacheMatches(file,[...inputs,executable]);
  }catch{return false;}
}
async function main() {
  if(process.platform!=='win32')throw new Error('test:win requires Windows.');
  const stop=async()=>{
    if(stopping)return;stopping=true;
    await Promise.all([...children].filter(child=>child.pid).map(child=>new Promise(resolve=>{
      const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
      killer.once('exit',resolve);killer.once('error',resolve);
    })));
    process.exit(130);
  };
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  process.chdir(root);
  await run(process.execPath,['scripts/build_firebase.mjs','--if-needed']);
  const server=await startWebPreview({port:5030,mobile:false,nativeDevelopment:true});
  try {
    const cacheFile=resolve(root,'.cache/dev-preview/native.json');
    const inputs=await nativeInputs();
    const executable=resolve(root,'src-tauri/target/debug/app.exe');
    const environment=JSON.stringify({compiler:await compilerIdentity(),RUSTFLAGS:process.env.RUSTFLAGS||'',RUSTC_WRAPPER:process.env.RUSTC_WRAPPER||'',RUSTC_WORKSPACE_WRAPPER:process.env.RUSTC_WORKSPACE_WRAPPER||'',RUSTUP_TOOLCHAIN:process.env.RUSTUP_TOOLCHAIN||'',CARGO_TARGET_DIR:process.env.CARGO_TARGET_DIR||'',CARGO_BUILD_TARGET:process.env.CARGO_BUILD_TARGET||'',TAURI_CONFIG:process.env.TAURI_CONFIG||''});
    const customTarget=process.env.CARGO_TARGET_DIR || process.env.CARGO_BUILD_TARGET;
    const force=process.argv.includes('--native') || customTarget;
    if(!force && await nativeCacheMatches(cacheFile,inputs,environment,executable)) {
      console.log('[test:win] Native sources and cached debug executable verified. Launching without Cargo.');
      console.log('[test:win] HTML/CSS/JS: Ctrl+R in the app. Rust changes: close and restart test:win.');
      await run(executable,[]);
    } else {
      console.log('[test:win] Native build required (first run, native change, or forced). Subsequent unchanged launches reuse the executable.');
      const before=await Promise.all(inputs.map(digest));
      const save=async()=>{
        const after=await nativeInputs();
        if(customTarget || JSON.stringify(inputs)!==JSON.stringify(after) || JSON.stringify(before)!==JSON.stringify(await Promise.all(after.map(digest))))return;
        await mkdir(resolve(root,'.cache/dev-preview'),{recursive:true});
        await recordCache(cacheFile,[...inputs,executable]);
        const state=JSON.parse(await readFile(cacheFile,'utf8'));Object.assign(state,{inputs,environment});await writeFile(cacheFile,JSON.stringify(state));
      };
      let output='',saved=false,saving=Promise.resolve();
      await run(process.execPath,['node_modules/@tauri-apps/cli/tauri.js','dev','--config','src-tauri/tauri.dev.conf.json','--no-watch'],{onOutput:chunk=>{
        output=(output+chunk).slice(-8192);
        if(!saved && finishedDevelopmentBuild(output)){saved=true;saving=save().catch(error=>console.warn('[test:win] Cache unavailable:',error.message));}
      }});
      if(!saved)await save();else await saving;
    }
  } finally {await server.close();}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{if(!stopping){console.error('[test:win]',error.message);process.exitCode=1;}});
