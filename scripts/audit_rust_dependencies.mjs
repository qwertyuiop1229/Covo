import {readFile,writeFile,mkdir} from 'node:fs/promises';
const lock=await readFile(new URL('../src-tauri/Cargo.lock',import.meta.url),'utf8');
const packages=lock.split('[[package]]').flatMap(block=>{
  const name=block.match(/^name = "([^"]+)"/m)?.[1],version=block.match(/^version = "([^"]+)"/m)?.[1];
  return name&&version&&/^source = "registry\+/m.test(block)?[{name,version}]:[];
});
const findings=[];
for(let offset=0;offset<packages.length;offset+=100){
  const batch=packages.slice(offset,offset+100);
  const response=await fetch('https://api.osv.dev/v1/querybatch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({queries:batch.map(({name,version})=>({package:{ecosystem:'crates.io',name},version}))}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`OSV dependency query failed: ${response.status}`);
  const data=await response.json();
  if(!Array.isArray(data.results)||data.results.length!==batch.length)throw new Error('Incomplete OSV response');
  data.results.forEach((result,index)=>{if(result.vulns?.length)findings.push({...batch[index],advisories:result.vulns});});
}
await mkdir(new URL('../scratch/',import.meta.url),{recursive:true});
await writeFile(new URL('../scratch/rust-security-audit.json',import.meta.url),JSON.stringify({checkedAt:new Date().toISOString(),packages:packages.length,findings},null,2));
console.log(`OSV: checked ${packages.length} locked Rust registry packages`);
for(const item of findings)console.log(item.name,item.version,item.advisories.map(advisory=>advisory.id).join(','));
if(findings.length)process.exitCode=1;
