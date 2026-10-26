const fs = require('fs');
const vm = require('vm');
const parser = require('@babel/parser');
const main = fs.readFileSync('public/js/main.js', 'utf8');
const ast = parser.parse(main, { sourceType:'module' });
function declaration(name) {
  const node = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === name);
  return main.slice(node.start,node.end);
}
const tick = () => new Promise(setImmediate);

test('a room-key repair refreshes partial cached history and unchanged wraps do not repeat reads',async()=>{
  let node,callback;const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='AssignmentExpression'&&n.left?.type==='MemberExpression'&&n.left.property?.name==='_activeMyRoomKeyUnsub')node=n;for(const value of Object.values(n))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);};walk(ast);
  const data={versions:{'1':'older-key','2':'current-key'}},scope='server:room';
  const decrypt=jest.fn(async()=>{}),render=jest.fn();
  const ctx=vm.createContext({window:{},myKeyRef:'own-key',onSnapshot:(_,fn)=>{callback=fn;return()=>{};},active:()=>true,activeServerId:'server',activeRoomId:'room',members:['alice'],roomKeyScope:()=>scope,
    _e2ee:{roomKeyCache:{[scope]:{latest:'only-v2'}},_roomKeyPromises:{},roomWrapSignatures:{}},allLoadedMessages:[{text:'encrypted'}],decryptMessagesInPlace:decrypt,renderMessagesWithReadReceipts:render});
  ctx.getOrCreateRoomKey=jest.fn(async()=>{ctx._e2ee.roomWrapSignatures[scope]=JSON.stringify(data);return {latest:'v2','1':'v1'};});
  vm.runInContext(main.slice(node.start,node.end),ctx);await callback({exists:()=>true,data:()=>data});
  expect(decrypt).toHaveBeenCalledTimes(1);expect(render).toHaveBeenCalledTimes(1);
  await callback({exists:()=>true,data:()=>data});expect(ctx.getOrCreateRoomKey).toHaveBeenCalledTimes(1);
});

test('a queued attachment from Alice cannot start uploading after switching to Bob', async () => {
  const upload = jest.fn(async()=> 'https://files.test/private');
  const ctx = vm.createContext({ userId:'bob', auth:{currentUser:{uid:'bob'}}, window:{},
    currentDmId:null,currentRoomId:'room',currentServerId:'server', currentDmParticipants:[],currentServerData:{joinedUsers:['alice','bob']},currentServerNickname:'Bob',
    _subtleOK:true,_getOrInitRTDB:async()=>({}),getRoomKeyWithWait:async()=>({}),encryptFileE2EE:async()=>({}),File:class File{},
    document:{getElementById:()=>null},cacheLocalMediaFile:jest.fn(),commitChatMessage:async()=>({}),onMessageAcknowledged:jest.fn(),
    userNickname:'Bob',userAvatarUrl:null,uploadToExternalService:upload });
  vm.runInContext(declaration('sendSingleAttachmentMessage').replace(/import\('[^']+'\)/g,'Promise.resolve({})'),ctx);
  await expect(ctx.sendSingleAttachmentMessage({ name:'private.txt', file:{} }, {
    snapOwnerUid:'alice',snapServerId:'server',snapRoomId:'room',snapDmId:null
  })).rejects.toThrow(/送信者|アカウント/);
  expect(upload).not.toHaveBeenCalled();
});

test('account changes during attachment encryption stop before upload', async () => {
  let finish;
  const upload = jest.fn();
  const ctx = vm.createContext({ userId:'alice', auth:{currentUser:{uid:'alice'}},window:{},
    currentDmId:null,currentRoomId:'room',currentServerId:'server',currentDmParticipants:[],currentServerData:{joinedUsers:['alice']},currentServerNickname:'Alice',
    _subtleOK:true,_getOrInitRTDB:async()=>({}),getRoomKeyWithWait:async()=>({}),
    encryptFileE2EE:()=>new Promise(resolve=>{finish=resolve;}),File:class File{},document:{getElementById:()=>null},cacheLocalMediaFile:jest.fn(),uploadToExternalService:upload });
  vm.runInContext(declaration('sendSingleAttachmentMessage').replace(/import\('[^']+'\)/g,'Promise.resolve({})'),ctx);
  const work=ctx.sendSingleAttachmentMessage({name:'private.txt',file:{} });
  await tick(); ctx.userId='bob';ctx.auth.currentUser={uid:'bob'};finish({});
  await expect(work).rejects.toThrow(/送信者|アカウント/);expect(upload).not.toHaveBeenCalled();
});

test('a slow file selection cannot attach files to another conversation', async () => {
  let finish;
  const update=jest.fn();
  const ctx=vm.createContext({userId:'alice',window:{},_attachmentSelectionGeneration:0,
    currentServerId:'server',currentRoomId:'first',currentDmId:null,_activeChannelSessionId:1,
    processHeicFile:()=>new Promise(resolve=>{finish=resolve;}),checkFileAllowed:()=>true,alertMessage:jest.fn(),
    attachedFiles:[],attachedFile:null,updateFilePreview:update,document:{getElementById:()=>({focus(){}})} });
  vm.runInContext(declaration('handleFilesSelected'),ctx);
  const work=ctx.handleFilesSelected([{}]);
  ctx.currentRoomId='second';ctx._activeChannelSessionId=2;
  finish({name:'private.png',size:10,type:'image/png'});await work;
  expect(ctx.attachedFiles).toHaveLength(0);expect(update).not.toHaveBeenCalled();
});

test('restored metadata cannot write under a different account after its read resolves', async () => {
  let finish;
  const write=jest.fn();
  const ctx=vm.createContext({userId:'alice',auth:{currentUser:{uid:'alice'}},window:{},appId:'app',db:{},
    doc:(_,path)=>path,parseTimestampToMs:()=>0,Timestamp:{fromMillis:x=>x},
    tokenForMessageOwner:async()=>null,
    firestore:async()=>({runTransaction:(_,callback)=>callback({get:()=>new Promise(resolve=>{finish=resolve;}),set:write})})});
  vm.runInContext(declaration('finalizeRestoredMessage').replace(/import\('[^']+'\)/g,'firestore()'),ctx);
  const work=ctx.finalizeRestoredMessage({id:'message',ownerId:'alice',destination:{dmId:'alice_bob'},data:{timestamp:1}});
  await tick();ctx.userId='bob';ctx.auth.currentUser={uid:'bob'};finish({exists:()=>true,data:()=>({})});await work;
  expect(write).not.toHaveBeenCalled();
});

test('restoring an open channel preserves the in-flight outbox object and acknowledgement callback', async () => {
  const pending={id:'message',ownerId:'alice',state:'waiting',ack:{},destination:{dmId:'alice_bob'}};
  const entries=new Map([['message',pending]]), ack=jest.fn();
  const ctx=vm.createContext({userId:'alice',window:{},currentDmId:'alice_bob',currentServerId:null,currentRoomId:null,
    _outboxEntries:entries,_outbox:{running:new Map([['message',Promise.resolve()]])},onMessageAcknowledged:ack,
    finalizeRestoredMessage:jest.fn(),renderMessagesWithReadReceipts:jest.fn(),
    LocalStore:{getSettingsByPrefix:async()=>[{key:'outbox:message',value:{...pending,state:'sending'}}]} });
  vm.runInContext(declaration('restoreOutboxForChannel'),ctx);
  await ctx.restoreOutboxForChannel('dm_alice_bob');
  expect(entries.get('message')).toBe(pending);expect(ack).not.toHaveBeenCalled();
});

test('a late older-history read cannot persist or display data after maintenance stops the account', async () => {
  let finish;
  const persist=jest.fn(), render=jest.fn();
  const ctx=vm.createContext({userId:'alice',window:{covoMaintenanceBlocked:false},hasMoreOlderMessages:true,isLoadingOlderMessages:false,
    allLoadedMessages:[{id:'recent',timestamp:2}],_activeChannelSessionId:1,currentServerId:'server',currentRoomId:'room',currentDmId:null,currentDmParticipants:[],currentServerData:{},
    document:{getElementById:()=>null},getMsgTimestamp:m=>m.timestamp,compareHistoryMessages:(a,b)=>a.timestamp-b.timestamp,
    LocalStore:{getMessages:()=>new Promise(resolve=>{finish=resolve;}),upsertMessagesBatch:persist},
    decryptMessagesInPlace:async()=>{},renderMessagesWithReadReceipts:render,console});
  vm.runInContext(declaration('loadOlderMessages'),ctx);
  const work=ctx.loadOlderMessages();await tick();ctx.userId=null;ctx.window.covoMaintenanceBlocked=true;
  finish([{id:'private',timestamp:1}]);await work;
  expect(persist).not.toHaveBeenCalled();expect(render).not.toHaveBeenCalled();
});

function pinContext(update) {
  const scope={serverId:'server',roomId:'room',dmId:null,channelId:'server_room',path:'artifacts/app/servers/server/rooms/room/messages',active:()=>true};
  const ctx=vm.createContext({ userId:'alice',auth:{currentUser:{uid:'alice'}},window:{},db:{},
    _getOrInitRTDB:async()=>({}),usesRealtimeOnly:m=>m.storageVersion===2,doc:(_,path,id)=>path+'/'+id,
    updateDoc:jest.fn(async()=>{}),LocalStore:{putMessage:jest.fn(async()=>true)},allLoadedMessages:[],currentPinnedMessages:[],
    localStorage:{removeItem:jest.fn()},renderPinnedMessages:jest.fn(),compareHistoryMessages:()=>0,
    database:async()=>({ref:(_,path)=>path,update,get:jest.fn(async()=>({exists:()=>false}))}) });
  vm.runInContext(declaration('persistMessagePin').replace(/import\('[^']+'\)/g,'database()'),ctx);
  return {ctx,scope};
}

test('failed RTDB pinning cannot become a successful local pin or a persisted cache change', async () => {
  const {ctx,scope}=pinContext(async()=>{throw new Error('permission-denied');});
  const message={id:'message',storageVersion:2,isPinned:false};ctx.allLoadedMessages=[message];
  await expect(ctx.persistMessagePin(message,true,scope,'alice')).rejects.toThrow('permission-denied');
  expect(message.isPinned).toBe(false);expect(ctx.currentPinnedMessages).toHaveLength(0);
  expect(ctx.LocalStore.putMessage).not.toHaveBeenCalled();expect(ctx.updateDoc).not.toHaveBeenCalled();
});

test('pin writes keep their original destination across slow RTDB initialization and skip another channel UI', async () => {
  const update=jest.fn(async()=>{}),{ctx,scope}=pinContext(update);let finish;
  ctx._getOrInitRTDB=()=>new Promise(resolve=>{finish=resolve;});scope.active=()=>false;
  const work=ctx.persistMessagePin({id:'message',storageVersion:2},true,scope,'alice');await tick();
  ctx.currentRoomId='another';finish({});await work;
  expect(update).toHaveBeenCalledWith(scope.path+'/message',{isPinned:true});
  expect(ctx.LocalStore.putMessage.mock.calls[0][0].channelId).toBe('server_room');
  expect(ctx.renderPinnedMessages).not.toHaveBeenCalled();
});

test('legacy Firestore-only pinning never recreates a partial RTDB message', async () => {
  const update=jest.fn(),{ctx,scope}=pinContext(update);
  await ctx.persistMessagePin({id:'legacy',storageVersion:1},true,scope,'alice');
  expect(ctx.updateDoc).toHaveBeenCalledTimes(1);expect(update).not.toHaveBeenCalled();
});

test('a preview read completing after navigation cannot display its old conversation', async () => {
  let active=true,finish;
  const ui=jest.fn();
  const ctx=vm.createContext({lastMessagesData:[],captureJumpScope:()=>({serverId:'server',roomId:'first',channelId:'server_first',active:()=>active}),
    LocalStore:{getMessage:()=>new Promise(resolve=>{finish=resolve;})},withReadDeadline:p=>p,document:{getElementById:ui}});
  vm.runInContext(declaration('showUnloadedMessagePreview'),ctx);
  const work=ctx.showUnloadedMessagePreview('message');active=false;finish({id:'message',text:'private'});await work;
  expect(ui).not.toHaveBeenCalled();
});

test('delayed Firestore fallback cannot merge or decrypt the previous account history', async () => {
  let timer,finish;
  const render=jest.fn(),decrypt=jest.fn();
  const ctx=vm.createContext({userId:'alice',window:{rtdbMessagesUnsub:()=>{},__globalRoomsCache:{}},
    currentRoomId:'room',currentServerId:'server',currentDmId:null,_activeChannelSessionId:1,
    _resyncFallbackTimer:null,_lastResyncAt:0,allLoadedMessages:[],setTimeout:fn=>{timer=fn;},clearTimeout:()=>{},Date,
    withReadDeadline:p=>p,db:{},appId:'app',collection:()=>({}),query:()=>({}),orderBy:()=>({}),limit:()=>20,
    getDocs:()=>new Promise(resolve=>{finish=resolve;}),getMsgTimestamp:m=>m.timestamp,
    renderMessagesWithReadReceipts:render,decryptMessagesInPlace:decrypt});
  vm.runInContext(declaration('resyncActiveRoomMessages'),ctx);
  await ctx.resyncActiveRoomMessages(100);const work=timer();await tick();
  ctx.userId=null;ctx.window.covoMaintenanceBlocked=true;
  finish({docs:[{id:'private',data:()=>({text:'enc::cipher'})}]});await work;
  expect(ctx.allLoadedMessages).toHaveLength(0);expect(render).not.toHaveBeenCalled();expect(decrypt).not.toHaveBeenCalled();
});

test('the outbox cannot issue a write after the account changes during database initialization', async () => {
  let finish;
  const write=jest.fn();
  const outbox=ast.program.body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='_outbox'));
  const value=outbox.declarations[0].init.arguments[0].properties.find(p=>p.key.name==='write').value;
  const ctx=vm.createContext({userId:'alice',auth:{currentUser:{uid:'alice'}},window:{},assertSupportedClient:()=>{},
    withReadDeadline:p=>p,LocalStore:{putSetting:async()=>true},_getOrInitRTDB:()=>new Promise(resolve=>{finish=resolve;}),
    set:write,ref:(_,path)=>path,CLIENT_PROTOCOL:2,appId:'app',usesRealtimeOnly:()=>true});
  vm.runInContext('globalThis.write='+main.slice(value.start,value.end),ctx);
  const work=ctx.write({id:'pending',ownerId:'alice',destination:{dmId:'alice_bob'},data:{clientProtocol:2},ack:{}},jest.fn());
  await tick();ctx.userId='bob';ctx.auth.currentUser={uid:'bob'};finish({});
  await expect(work).rejects.toThrow('送信者');expect(write).not.toHaveBeenCalled();
});

test('an old send finishing after account change cannot unlock or refocus a new send composer', async () => {
  let finishKey;
  const input={value:'private draft',style:{},disabled:false,focus:jest.fn()}, button={disabled:false};
  const ctx=vm.createContext({userId:'alice',userNickname:'Alice',auth:{currentUser:{uid:'alice'}},window:{},
    messageInput:input,sendMessageButton:button,attachedFile:null,attachedKvFile:null,attachedFiles:[],
    isSendingMessage:false,_composerOperationGeneration:0,currentDmId:'alice_bob',currentDmParticipants:['alice','bob'],currentRoomId:null,currentServerId:null,
    currentServerData:null,currentServerNickname:null,replyingToMessage:null,isAdmin:false,isUserBlocked:()=>false,mentionedRecipients:()=>[],cachedUsers:[],
    _covoRateLimiter:{canSendMessage:()=>({allowed:true})},document:{getElementById:()=>null},TextEncoder,
    messagesDisplay:{querySelector:()=>null},typingTimeout:null,isCurrentlyTyping:false,setTypingStatus:()=>{},clearTimeout:()=>{},
    unreadBoundaryAt:0,unreadBoundaryMessageId:null,_subtleOK:true,_getDmKeyWithWait:()=>new Promise(resolve=>{finishKey=resolve;}),
    loadingOverlay:{classList:{add:jest.fn()}},toggleSendButtonState:jest.fn(),alertMessage:jest.fn(),console });
  vm.runInContext(declaration('sendMessage')+declaration('invalidateComposerOperation'),ctx);
  const work=ctx.sendMessage();await tick();
  ctx.invalidateComposerOperation();ctx.userId='bob';ctx.auth.currentUser={uid:'bob'};
  ctx.isSendingMessage=true;input.value='Bob draft';input.disabled=true;button.disabled=true;
  finishKey({});await work;
  expect(input.value).toBe('Bob draft');expect(input.disabled).toBe(true);expect(button.disabled).toBe(true);
  expect(ctx.isSendingMessage).toBe(true);expect(input.focus).not.toHaveBeenCalled();expect(ctx.alertMessage).not.toHaveBeenCalled();
});

test('preview decryption uses a copy so that live rows retain their original ciphertext', async () => {
  const message={id:'private',text:'enc::cipher',senderId:'alice'},elements={};
  for (const id of ['messagePreviewModal','previewModalName','previewModalText','previewModalAvatar']) elements[id]={style:{},dataset:{},classList:{remove:jest.fn()},querySelector:()=>({dataset:{}})};
  const ctx=vm.createContext({lastMessagesData:[message],captureJumpScope:()=>({serverId:'server',roomId:'room',channelId:'server_room',active:()=>true,
    decrypt:async records=>{records[0]._originalText=records[0].text;records[0].text='private plaintext';}}),cachedUsers:[],
    isEncrypted:text=>String(text).startsWith('enc::'),escapeHtml:x=>x,document:{getElementById:id=>elements[id]}});
  vm.runInContext(declaration('showUnloadedMessagePreview'),ctx);await ctx.showUnloadedMessagePreview('private');
  expect(message.text).toBe('enc::cipher');expect(elements.previewModalText.innerHTML).toBe('private plaintext');
});

test('unpin confirmation cannot act on the conversation opened while the dialog was pending', async () => {
  let finish,active=true;
  const persist=jest.fn();
  const ctx=vm.createContext({window:{},userId:'alice',auth:{currentUser:{uid:'alice'}},currentServerId:'server',currentRoomId:'first',currentDmId:null,
    currentServerData:{createdBy:'alice'},isAdmin:false,currentPinnedMessages:[{id:'message',senderId:'alice',isPinned:true}],allLoadedMessages:[],
    captureJumpScope:()=>({active:()=>active}),showCustomConfirm:()=>new Promise(resolve=>{finish=resolve;}),persistMessagePin:persist});
  const node=ast.program.body.find(n=>n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.object?.name==='window'&&n.expression.left.property?.name==='unpinMessage');
  vm.runInContext(main.slice(node.start,node.end),ctx);
  const work=ctx.window.unpinMessage('message');ctx.currentRoomId='second';active=false;finish(true);await work;
  expect(persist).not.toHaveBeenCalled();
});

test('peer history never replaces known records or trusts another device decryption flags', async () => {
  const ctx=vm.createContext({allLoadedMessages:[{id:'live',text:'enc::fresh'}],getMsgTimestamp:m=>m.timestamp,
    LocalStore:{getMessage:async(_,id)=>id==='saved'?{id,text:'enc::fresh'}:null}});
  vm.runInContext(declaration('preparePeerHistoryPage'),ctx);
  const peer=[null,...['live','saved','unknown'].map(id=>({id,channelId:'server_room',timestamp:1,text:'enc::cipher',_originalText:'injected plaintext',_decrypted:true,replyTo:{text:'enc::quote',_originalText:'injected quote'}}))];
  const result=await ctx.preparePeerHistoryPage(peer,'server_room',2,()=>true);
  expect(result.map(m=>m.id)).toEqual(['unknown']);expect(result[0]._originalText).toBeUndefined();expect(result[0]._decrypted).toBeUndefined();
  expect(result[0].replyTo._originalText).toBeUndefined();expect(result[0].text).toBe('enc::cipher');
});

test('peer arrival reopens older pagination only when it actually extends history, without arming another load', () => {
  const hide=jest.fn(),gate={armed:false},latest={id:'live',timestamp:10,text:'enc::fresh'};
  const ctx=vm.createContext({allLoadedMessages:[latest],hasMoreOlderMessages:false,hideTerminalBanner:hide,
    _historyLoadGate:gate,compareHistoryMessages:(a,b)=>a.timestamp-b.timestamp});
  vm.runInContext(declaration('appendPeerHistoryPage'),ctx);
  ctx.appendPeerHistoryPage([{...latest,text:'enc::stale'}]);expect(ctx.hasMoreOlderMessages).toBe(false);
  expect(ctx.allLoadedMessages[0]).toBe(latest);expect(hide).not.toHaveBeenCalled();
  ctx.appendPeerHistoryPage([{id:'older',timestamp:1}]);expect(ctx.hasMoreOlderMessages).toBe(true);
  expect(hide).toHaveBeenCalledTimes(1);expect(gate.armed).toBe(false);expect(ctx.allLoadedMessages).toHaveLength(2);
});
