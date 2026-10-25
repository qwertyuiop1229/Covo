const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const scratch=path.resolve('scratch');
async function fixture(run){
  await fs.mkdir(scratch,{recursive:true});const root=await fs.mkdtemp(path.join(scratch,'secret-safety-'));
  try{execFileSync('git',['init','--quiet'],{cwd:root});await fs.copyFile('.gitignore',path.join(root,'.gitignore'));await fs.mkdir(path.join(root,'public'));await run(root);}
  finally{const target=path.resolve(root);if(!target.startsWith(scratch+path.sep))throw Error('unexpected cleanup target');await fs.rm(target,{recursive:true,force:true});}
}
function privateMaterial(){return ['-----BEGIN'+' PRIVATE KEY-----','A'.repeat(128),'-----END'+' PRIVATE KEY-----'].join('\n');}
test('deployment refuses a Git lock before modifying versions or running builds',async()=>fixture(async root=>{
  await fs.copyFile('deploy.ps1',path.join(root,'deploy.ps1'));await fs.writeFile(path.join(root,'public/version.json'),JSON.stringify({version:'1.1.286'}));
  await fs.writeFile(path.join(root,'.git/index.lock'),'');
  const {spawnSync}=require('node:child_process');const run=spawnSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'deploy.ps1'),'-y'],{cwd:root,encoding:'utf8'});
  expect(run.status).not.toBe(0);expect(run.stderr).toContain('Git index is locked');
  expect(JSON.parse(await fs.readFile(path.join(root,'public/version.json'),'utf8')).version).toBe('1.1.286');
  expect((await fs.stat(path.join(root,'.git/index.lock'))).size).toBe(0);
}));
test('ignored development keys stay outside Git; force-staged keys stop publication without printing values',async()=>fixture(async root=>{
  const {assertSecretSafety}=await import('../scripts/check_secret_safety.mjs');
  await fs.mkdir(path.join(root,'.cache/dev-preview/tls'),{recursive:true});await fs.writeFile(path.join(root,'.cache/dev-preview/tls/root-key.pem'),privateMaterial());
  await expect(assertSecretSafety({root})).resolves.toBeTruthy();
  execFileSync('git',['add','-f','.cache/dev-preview/tls/root-key.pem'],{cwd:root});
  await expect(assertSecretSafety({root})).rejects.toThrow('sensitive-filename');
}));
test('ignored public keys and embedded private material are blocked; marker handling and public configuration are allowed',async()=>fixture(async root=>{
  const {assertSecretSafety}=await import('../scripts/check_secret_safety.mjs');
  const file=path.join(root,'public','accidental.pem');await fs.writeFile(file,privateMaterial());
  await expect(assertSecretSafety({root})).rejects.toThrow('sensitive-filename');await fs.unlink(file);
  const js=path.join(root,'public','config.js');await fs.writeFile(js,privateMaterial());
  let error;try{await assertSecretSafety({root});}catch(value){error=value;}
  expect(error.message).toContain('private-key-material');expect(error.message).not.toContain('A'.repeat(128));
  await fs.writeFile(js,"const strip = value => value.replace('-----BEGIN PRIVATE KEY-----', ''); const vapidKey='public-web-push-key';");
  await expect(assertSecretSafety({root})).resolves.toBeTruthy();
}));
test('private JWKs and unexpected publication roots stop the build',async()=>fixture(async root=>{
  const {assertSecretSafety}=await import('../scripts/check_secret_safety.mjs');const file=path.join(root,'public/config.json');
  await fs.writeFile(file,JSON.stringify({kty:'EC',d:'a'.repeat(43)}));await expect(assertSecretSafety({root})).rejects.toThrow('private-jwk');await fs.unlink(file);
  await fs.writeFile(path.join(root,'firebase.json'),JSON.stringify({hosting:{public:'.'}}));await expect(assertSecretSafety({root})).rejects.toThrow('unexpected-publication-root');
}));
test('preview refuses a private key copied into its public directory after startup',async()=>fixture(async root=>{
  const {createWebPreviewServer}=await import('../scripts/serve_web_preview.mjs');const server=createWebPreviewServer({root:path.join(root,'public')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await fs.writeFile(path.join(root,'public/accidental.pem'),privateMaterial());
    const status=await new Promise((resolve,reject)=>http.get(`http://127.0.0.1:${server.address().port}/accidental.pem`,res=>{res.resume();resolve(res.statusCode);}).on('error',reject));expect(status).toBe(404);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}));
