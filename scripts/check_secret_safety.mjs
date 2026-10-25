import {execFileSync} from 'node:child_process';
import {readFile,readdir,lstat} from 'node:fs/promises';
import {resolve,relative,basename,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const workspace=fileURLToPath(new URL('../',import.meta.url));
// This is a preventive guard, not a guarantee that every possible secret format is detectable.
export function sensitivePath(file) {
  const name=basename(file.replaceAll('\\','/')).toLowerCase();
  return /\.(pem|key|p8|p12|pfx|jwk|jks|keystore)$/.test(name) ||
    /^(\.env(?:\..*)?|\.dev\.vars(?:\..*)?|id_rsa|id_ed25519|id_ecdsa)$/.test(name) ||
    /^(?:.*service[-_]?account.*|client_secret.*|credentials(?:\..*)?)\.json$/.test(name);
}
export function secretContentKinds(buffer) {
  const text=buffer[0]===0xff&&buffer[1]===0xfe ? buffer.toString('utf16le') : buffer.toString('utf8');
  const kinds=[];
  if(/-----BEGIN ((?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY)-----(?:[A-Za-z0-9+/=\s]|\\[rn]){64,}-----END \1-----/.test(text))kinds.push('private-key-material');
  const decoded=text.replaceAll('\\"','"');
  if(/["']kty["']\s*:\s*["'](?:RSA|EC|OKP)["']/.test(decoded) && /["']d["']\s*:\s*["'][A-Za-z0-9_-]{24,}["']/.test(decoded))kinds.push('private-jwk');
  if(/\b(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b|\bAKIA[0-9A-Z]{16}\b/.test(text))kinds.push('credential-token');
  const assignment=/(?:api_secret|client_secret|worker_auth_password|cloudflare_api_token|tauri_signing_private_key)["']?\s*[:=]\s*["']([^"'\r\n]{16,})["']/gi;
  for(const match of text.matchAll(assignment))if(!/^(?:\$\{|your[_ -]|replace[_ -]|example[_ -]|test[_ -]|dummy[_ -])/i.test(match[1])){kinds.push('credential-literal');break;}
  return [...new Set(kinds)];
}
async function publicFiles(directory) {
  let items;try{items=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return [];throw error;}
  return (await Promise.all(items.map(item=>item.isDirectory()?publicFiles(resolve(directory,item.name)):[resolve(directory,item.name)]))).flat();
}
export async function assertSecretSafety({root=workspace}={}) {
  root=resolve(root);const issues=[];
  const addable=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).split('\0').filter(Boolean);
  const files=new Set(addable.map(file=>resolve(root,file)));
  const frontend=resolve(root,'public');
  for(const file of await publicFiles(frontend))files.add(file);
  for(const [name,extract] of [
    ['src-tauri/tauri.conf.json',config=>config.build?.frontendDist],
    ['firebase.json',config=>config.hosting?.public]
  ]){
    try{const file=resolve(root,name),config=JSON.parse(await readFile(file,'utf8')),dist=extract(config);
      if(dist && resolve(name.startsWith('src-tauri/')?resolve(root,'src-tauri'):root,dist)!==frontend)issues.push({file:name,kind:'unexpected-publication-root'});
    }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  for(const file of files){
    if(!file.startsWith(root+sep)){issues.push({file:'[outside workspace]',kind:'unexpected-path'});continue;}
    const name=relative(root,file).replaceAll('\\','/');
    if(sensitivePath(name)){issues.push({file:name,kind:'sensitive-filename'});continue;}
    try{
      const info=await lstat(file);
      if(info.isSymbolicLink()){issues.push({file:name,kind:'publication-symlink'});continue;}
      if(!info.isFile())continue;
      const content=await readFile(file);
      for(const kind of secretContentKinds(content))issues.push({file:name,kind});
    }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  if(issues.length){
    const summary=issues.map(issue=>`${issue.file.replace(/[\r\n\x00-\x1f]/g,'?')} (${issue.kind})`).join('\n');
    throw new Error('Potential secret material in Git/publication inputs. Values are hidden.\n'+summary);
  }
  return {checkedFiles:files.size};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assertSecretSafety().then(result=>console.log(`[secrets] Checked ${result.checkedFiles} Git/publication inputs; no blocked material found.`)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
