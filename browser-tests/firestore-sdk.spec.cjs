const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
test('bundled Firestore survives repeated target teardown, reconnect and retained-cache restart',async({page})=>{
  test.setTimeout(60000);
  test.skip(!process.env.FIRESTORE_EMULATOR_HOST,'Run npm run test:firebase-runtime with the local emulator.');
  expect(process.env.FIRESTORE_EMULATOR_HOST).toMatch(/^(?:127\.0\.0\.1|localhost):8088$/);
  await page.context().grantPermissions(['local-network-access'],{origin:'http://127.0.0.1:5019'});
  const failures=[];page.on('pageerror',error=>failures.push(error.message));
  page.on('console',message=>{if(/INTERNAL ASSERTION FAILED|Target ID already exists/.test(message.text()))failures.push(message.text());});
  await page.route('http://127.0.0.1:5019/**',route=>{const name=new URL(route.request().url()).pathname;if(name==='/')return route.fulfill({body:'<!doctype html><html><body>Local SDK regression</body></html>',contentType:'text/html'});const file=path.resolve('public','.'+name);return file.startsWith(path.resolve('public')+path.sep)&&fs.existsSync(file)?route.fulfill({path:file,contentType:'text/javascript'}):route.fulfill({status:404});});
  await page.goto('http://127.0.0.1:5019/');
  const initialize=async()=>{
    const [app,fs]=await Promise.all([import('/vendor/firebase/firebase-app.js'),import('/vendor/firebase/firebase-firestore.js')]);
    const instance=app.initializeApp({projectId:'demo-covo-security-test',apiKey:'local-emulator-test'},'target-recovery');
    const db=fs.initializeFirestore(instance,{experimentalForceLongPolling:true,localCache:fs.persistentLocalCache({tabManager:fs.persistentMultipleTabManager()})});
    fs.connectFirestoreEmulator(db,'127.0.0.1',8088,{mockUserToken:{sub:'alice',email:'alice@example.com'}});
    window.sdk={fs,db,ref:fs.doc(db,'artifacts/testApp/users/alice/private/sdk-recovery-check')};
    return app.SDK_VERSION;
  };
  expect(await page.evaluate(initialize)).toBe('12.14.0');
  const result=await page.evaluate(async()=>{
    const {fs,db,ref}=sdk,errors=[];await fs.setDoc(ref,{value:'retained'});
    for(let cycle=0;cycle<30;cycle++){
      const stops=Array.from({length:6},()=>fs.onSnapshot(ref,()=>{},error=>errors.push(error.message)));
      await new Promise(resolve=>setTimeout(resolve,cycle%2?2:0));for(const stop of stops)stop();
    }
    const final=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('snapshot timeout')),10000);const stop=fs.onSnapshot(ref,{includeMetadataChanges:true},snapshot=>{if(snapshot.exists()&&!snapshot.metadata.fromCache){clearTimeout(timer);stop();resolve(snapshot.data().value);}},reject);});
    await fs.disableNetwork(db);await fs.enableNetwork(db);const after=(await fs.getDocFromServer(ref)).data().value;
    await fs.terminate(db);return {final,after,errors};
  });expect(result).toEqual({final:'retained',after:'retained',errors:[]});
  await page.reload();await page.evaluate(initialize);
  expect(await page.evaluate(async()=>{await sdk.fs.disableNetwork(sdk.db);return (await sdk.fs.getDocFromCache(sdk.ref)).data().value;})).toBe('retained');
  await page.evaluate(()=>sdk.fs.enableNetwork(sdk.db));
  expect(await page.evaluate(async()=>(await sdk.fs.getDocFromServer(sdk.ref)).data().value)).toBe('retained');
  await page.evaluate(()=>sdk.fs.terminate(sdk.db));expect(failures).toEqual([]);
});
