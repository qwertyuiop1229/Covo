import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const digest=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
export async function cacheMatches(file,required=[]) {
  try {
    const state=JSON.parse(await readFile(file,'utf8'));
    if(state.schema!==1 || !required.every(path=>Object.hasOwn(state.files,path)))return false;
    return (await Promise.all(Object.entries(state.files).map(async([path,hash])=>await digest(path)===hash))).every(Boolean);
  } catch{return false;}
}
export async function recordCache(file,files) {
  const entries=await Promise.all([...new Set(files)].map(async path=>[path,await digest(path)]));
  await writeFile(file,JSON.stringify({schema:1,files:Object.fromEntries(entries)}));
}
