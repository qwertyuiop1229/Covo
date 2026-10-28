// Audit characterization probes. REPRODUCED means an unsafe behavior was observed.
// Never connects to production: rules use demo-project emulators; Worker fetch is mocked.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const results = [];
async function probe(id, description, run) {
  try { const evidence = await run(); results.push({id, description, reproduced: true, evidence}); console.log('REPRODUCED', id, JSON.stringify(evidence)); }
  catch (error) { results.push({id, description, reproduced: false, error: error.message}); console.error('NOT REPRODUCED', id, error.message); process.exitCode = 1; }
}
function worker(fetcher) {
  const context = vm.createContext({Request, Response, Headers, URL, URLSearchParams, FormData, File, Blob, AbortSignal, AbortController, TextEncoder, TextDecoder, crypto: webcrypto, fetch: fetcher, console, setTimeout, clearTimeout, atob, btoa});
  vm.runInContext(fs.readFileSync(path.join(root, 'server/src/index.js'), 'utf8').replace('export default {', 'const worker = {'), context);
  context.readMaintenanceState = async () => ({enabled:false});
  context.getFirestoreAdminToken = async () => 'mock-service-token';
  return context;
}
const json = value => new Response(JSON.stringify(value), {headers:{'Content-Type':'application/json'}});
const request = (endpoint, body) => new Request('https://worker.invalid/api/'+endpoint, {method:'POST',headers:{'Content-Type':'application/json','X-Covo-Protocol':'2'},body:JSON.stringify(body)});
async function workerProbes() {
  await probe('W1', 'Agora token issued for arbitrary channel without membership reads', async () => {
    let reads = 0;
    const context = worker(async () => {reads++; throw Error('No network expected');});
    context.verifyFirebaseIdToken = async () => ({uid:'outsider'});
    const req = request('agoraToken',{channel:'private_server_room',uid:'outsider',idToken:'mock'});
    const response = await context.handleAgoraToken(req,{AGORA_APP_ID:'0'.repeat(32),AGORA_PRIMARY_CERTIFICATE:'1'.repeat(32)},new URL(req.url));
    const body = await response.json();
    assert.equal(response.status,200); assert.ok(body.token?.startsWith('006')); assert.equal(reads,0);
    return {status:response.status,tokenIssued:true,membershipReads:reads};
  });
  await probe('W2', 'Two concurrent joins exceed a maxUses=1 invitation', async () => {
    let inviteReads=0, release;
    const barrier = new Promise(resolve => {release=resolve;});
    let uses=0, joins=0;
    const context = worker(async (url,options={}) => {
      if(url.includes('/inviteCodes/') && !options.method) {
        if(++inviteReads===2)release(); await barrier;
        return json({fields:{maxUses:{integerValue:'1'},uses:{integerValue:'0'}}});
      }
      if(options.method==='POST') {
        const writes=JSON.parse(options.body).writes;
        if(writes[0].transform.document.includes('/inviteCodes/'))uses++; else joins++;
        return json({writeResults:[{}]});
      }
      return json({fields:{joinedUsers:{arrayValue:{values:[]}}}});
    });
    context.verifyFirebaseIdToken = async token => ({uid:token});
    const env={FIREBASE_APP_ID:'testApp',FIREBASE_PROJECT_ID:'demo-covo-security-test',SERVICE_ACCOUNT_JSON:'{}'};
    const responses=await Promise.all(['alice','bob'].map(uid=>context.handleJoinServer(request('joinServer',{appId:'testApp',serverId:'s',userId:uid,idToken:uid,inviteCode:'one-use'}),env)));
    assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.equal(uses,2);assert.equal(joins,2);
    return {maxUses:1,accepted:2,uses,joins};
  });
  await probe('W3', 'One-time recovery PIN resets password twice before consumption', async () => {
    let reads=0,release,resets=0,commits=0;
    const barrier=new Promise(resolve=>{release=resolve;});
    const salt='audit-salt',pin='A1B2C3';
    const hash=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+':'+pin))).toString('hex');
    const context=worker(async(url,options={})=>{
      if(url.includes('/admin_recovery_index/')) {
        if(++reads===2)release();await barrier;
        return json({name:'projects/demo-covo-security-test/databases/(default)/documents/artifacts/testApp/admin_recovery_index/example',updateTime:'2026-10-28T00:00:00Z',fields:{used:{booleanValue:false},salt:{stringValue:salt},pinHash:{stringValue:hash},userId:{stringValue:'victim'},expiresAt:{integerValue:String(Date.now()+600000)}}});
      }
      if(url.includes('accounts:update')){resets++;return json({localId:'victim'});}
      if(url.endsWith('documents:commit')) {commits++;return commits===1?json({writeResults:[{}]}):new Response(JSON.stringify({error:{code:409,message:'Precondition failed'}}),{status:409});}
      throw Error('Unexpected URL '+url);
    });
    const env={FIREBASE_APP_ID:'testApp',FIREBASE_PROJECT_ID:'demo-covo-security-test',SERVICE_ACCOUNT_JSON:'{}'};
    const responses=await Promise.all(['first-pass','second-pass'].map(newPassword=>context.handleEmergencyPasswordReset(request('emergencyPasswordReset',{appId:'testApp',email:'victim@example.invalid',code:pin,newPassword}),env)));
    assert.equal(resets,2);assert.deepEqual(responses.map(r=>r.status),[200,200]);
    return {passwordUpdates:resets,reportedSuccesses:2,consumptionCommits:commits,secondConsumptionStatus:409};
  });
}
async function ruleProbes() {
  const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
  const {doc,setDoc,getDoc,updateDoc,collection,query,where,limit,getDocs,arrayUnion}=require('firebase/firestore');
  const {ref,set,get}=require('firebase/database');
  const env=await initializeTestEnvironment({projectId:'demo-covo-audit-probes',firestore:{host:'127.0.0.1',port:8088,rules:fs.readFileSync(path.join(root,'firestore.rules'),'utf8')},database:{host:'127.0.0.1',port:9008,rules:fs.readFileSync(path.join(root,'database.rules.json'),'utf8')}});
  const app='artifacts/testApp',server=app+'/servers/privateServer';
  const outsider=env.authenticatedContext('outsider',{email:'outsider@example.invalid',email_verified:true}),member=env.authenticatedContext('alice');
  try {
    await env.clearFirestore();await env.clearDatabase();
    await env.withSecurityRulesDisabled(async c=>{
      await setDoc(doc(c.firestore(),app+'/settings/adminList'),{admins:['admin'],emails:[]});
      await setDoc(doc(c.firestore(),app+'/settings/allowedEmailsConfig'),{active:true});
      await setDoc(doc(c.firestore(),app+'/allowedEmails/allowed@example.invalid'),{addedBy:'admin'});
      await setDoc(doc(c.firestore(),server),{createdBy:'owner',serverAdmins:[],joinedUsers:['alice'],name:'Private',isPublic:false});
      await setDoc(doc(c.firestore(),app+'/users/victim'),{nickname:'Victim',email:'victim@example.invalid'});
      await set(ref(c.database(),server),{createdBy:'owner',members:{alice:true}});
      await set(ref(c.database(),server+'/rooms/r/readReceipts/alice'),{lastReadAt:123});
      await set(ref(c.database(),'voiceStates/privateServer/r/alice'),{nickname:'Alice'});
      await set(ref(c.database(),server+'/rooms/r/roomKeys/bob'),{versions:{1:'original'}});
    });
    await probe('F1','Active login allowlist does not block non-listed authenticated users',async()=>{
      const snapshot=await getDoc(doc(outsider.firestore(),app+'/users/victim'));assert.equal(snapshot.data().email,'victim@example.invalid');
      await setDoc(doc(outsider.firestore(),app+'/servers/outsiderServer'),{createdBy:'outsider',serverAdmins:['outsider'],joinedUsers:['outsider'],name:'Bypass'});
      await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),app+'/users/victim')));
      return {allowlistActive:true,listed:false,profileRead:true,serverCreated:true,unauthenticatedDenied:true};
    });
    await probe('F2','Non-member creates stamps inside a private server',async()=>{
      await setDoc(doc(outsider.firestore(),server+'/stamps/injected'),{createdBy:'outsider',name:'Injected',url:'https://example.invalid/a.png'});
      return {nonMemberCreate:true};
    });
    await probe('R1','Non-member reads receipts and voice presence',async()=>{
      assert.ok((await get(ref(outsider.database(),server+'/rooms/r/readReceipts'))).exists());
      assert.ok((await get(ref(outsider.database(),'voiceStates/privateServer/r'))).exists());
      return {receiptsRead:true,voicePresenceRead:true};
    });
    await probe('R2','Legacy RTDB room key can be overwritten by another member',async()=>{
      await set(ref(member.database(),server+'/rooms/r/roomKeys/bob'),{versions:{1:'replaced'}});
      return {target:'bob',writer:'alice',oldVersionReplaced:true};
    });
    await probe('R3','Non-member writes legacy room notification hints',async()=>{
      await set(ref(outsider.database(),'rooms/r/latestDelete'),{deletedBy:'outsider',messageId:'victim-message'});
      return {nonMemberDeleteHintWritten:true};
    });
    await probe('F3','Member replaces wrappedKey while preserving versions map',async()=>{
      const keyPath=server+'/rooms/r/roomKeys/bob';
      await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),keyPath),{wrappedKey:'original-v1'}));
      await updateDoc(doc(member.firestore(),keyPath),{versions:{2:'new-v2'},latestVersion:'2',wrappedKey:'replaced-v1'});
      return {legacyWrappedKeyReplaced:true,versions:{2:'new-v2'}};
    });
    await probe('F4','Admin email-to-UID lookup trusts an attacker-editable profile email',async()=>{
      // Reproduce addAdminEmailBtn's Firestore fallback lookup and UID grant.
      // An administrator must perform the grant; the attacker supplies the false identity mapping.
      await setDoc(doc(outsider.firestore(),app+'/users/outsider'),{email:'intended-admin@example.invalid',nickname:'Spoof'});
      const admin=env.authenticatedContext('admin').firestore();
      const matches=await getDocs(query(collection(admin,app+'/users'),where('email','==','intended-admin@example.invalid'),limit(1)));
      const selected=matches.docs[0].id;assert.equal(selected,'outsider');
      await updateDoc(doc(admin,app+'/settings/adminList'),{emails:['intended-admin@example.invalid'],admins:arrayUnion(selected)});
      await setDoc(doc(outsider.firestore(),app+'/settings/auditPrivilegeProof'),{changedBy:'outsider'});
      return {authenticatedEmail:'outsider@example.invalid',claimedProfileEmail:'intended-admin@example.invalid',adminActionRequired:true,grantedUid:selected,privilegedWrite:true};
    });
  } finally {await env.cleanup();}
}
(async()=>{
  if(process.argv.includes('--worker'))await workerProbes();
  else if(process.argv.includes('--rules'))await ruleProbes();
  else throw Error('Use --worker or --rules (local emulators only).');
  const suffix=process.argv.includes('--rules')?'rules':'worker';
  fs.mkdirSync(path.join(root,'scratch/security-full-audit'),{recursive:true});
  fs.writeFileSync(path.join(root,`scratch/security-full-audit/probes-${suffix}.json`),JSON.stringify(results,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
