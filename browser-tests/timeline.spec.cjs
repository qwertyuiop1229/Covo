const { test, expect } = require('@playwright/test');
const fs = require('fs');
const parser = require('@babel/parser');
const main = fs.readFileSync('public/js/main.js', 'utf8');
const ast = parser.parse(main, { sourceType: 'module' });
const codeFor = name => {
  const node = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name);
  return main.slice(node.start, node.end);
};

test('real chat reconciliation keeps 10,000 messages bounded and stable through scroll, arrival and resize', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent(`<style>
    #messagesDisplay { height:600px; width:800px; overflow:auto; transform:scaleY(-1); overflow-anchor:none; }
    .message-row { transform:scaleY(-1); min-height:64px; margin-top:8px; box-sizing:border-box; }
    .message-content { display:block; white-space:normal; }
    .date-divider { height:24px; transform:scaleY(-1); }
  </style><div id="searchContainer"></div><div id="messagesDisplay"></div>`);
  await page.addScriptTag({ content: fs.readFileSync('public/js/virtual_timeline.js', 'utf8').replace(/\bexport /g, '') });
  await page.addScriptTag({ content: fs.readFileSync('public/js/chat_scroll.js', 'utf8').replace(/\bexport /g, '') });
  await page.addScriptTag({ content: `
    const messagesDisplay = document.getElementById('messagesDisplay'), searchContainer = document.getElementById('searchContainer');
    let currentDmId = null, currentServerId = 'server', currentRoomId = 'room', currentDmParticipant = null;
    let searchQuery = '', _searchHistoryResults = null, _searchVisibleCount = 50, isJumpView = false, isLoadingOlderMessages = false, hasMoreOlderMessages = true;
    let allLoadedMessages = Array.from({length:10000}, (_,i)=>({id:'m'+i,text:'message '+i,senderId:'alice',timestamp:1700000000000+i}));
    let jumpViewMessages = [], lastMessagesData = [], messagesIndexMap = {}, userId = 'alice', userNickname = 'Alice', cachedUsers = [], roomNames = {room:'Room'}, _outboxEntries = new Map();
    const _virtualTimeline = new VirtualTimeline(), _virtualRowObserver = null, _attachmentResources = {prune() {}};
    const _chatScroller=createChatScroller(messagesDisplay);let _activeChannelSessionId=1;
    const getMsgTimestamp = message => message.timestamp;
    const parseTimestampToMs = value => Number(value || 0);
    const countNewerMessages = (messages,id) => {const i=messages.findIndex(m=>m.id===id);return i<0?0:messages.length-i-1};
    const compareHistoryMessages = (a,b) => a.timestamp-b.timestamp;
    const isEncrypted = () => false;
    const escapeHtmlAndLinkUrls = text => text;
    const escapeHtml = text => text;
    const computeReadByCount = () => 0;
    const updateReactionsUI = () => {};
    const resolveUnreadBoundaryMessageId = () => null;
    const renderUnreadDivider = () => {};
    function createMessageElement(message) {
      const row=document.createElement('div');row.className='message-row';
      const bubble=document.createElement('div');bubble.className='message-bubble';bubble.dataset.messageId=message.id;
      const text=document.createElement('span');text.className='message-content';text.textContent=message.text;
      bubble.appendChild(text);row.appendChild(bubble);return row;
    }
    ${codeFor('virtualSpacer')}
    ${codeFor('patchMessageHtml')}
    ${codeFor('renderMessagesWithReadReceipts')}
    ${codeFor('doJumpHighlight')}
    window.testJump=doJumpHighlight;
    let pendingRender=null;messagesDisplay.addEventListener('scroll',()=>{if(pendingRender==null)pendingRender=requestAnimationFrame(()=>{pendingRender=null;renderMessagesWithReadReceipts();});});
    window.testRender = renderMessagesWithReadReceipts;
    window.testMove = offset => { messagesDisplay.scrollTop=offset;renderMessagesWithReadReceipts();renderMessagesWithReadReceipts(); };
    window.testArrive = () => { allLoadedMessages.push({id:'fresh',senderId:'alice',text:'new',timestamp:1800000000000});renderMessagesWithReadReceipts(); };
    window.testRender();window.testRender();
  ` });
  await expect(page.locator('.message-row')).toHaveCount(160);
  for (const offset of [10000, 250000, 500000, 800000]) {
    await page.evaluate(offset => window.testMove(offset), offset);
    expect(await page.locator('.message-row').count()).toBeLessThanOrEqual(160);
    expect(await page.locator('.message-row').count()).toBeGreaterThan(0);
  }
  const before = await page.evaluate(() => ({ id: _virtualTimeline.ids[_virtualTimeline.indexAt(messagesDisplay.scrollTop)], offset: messagesDisplay.scrollTop }));
  await page.evaluate(() => window.testArrive());
  const after = await page.evaluate(() => ({ id: _virtualTimeline.ids[_virtualTimeline.indexAt(messagesDisplay.scrollTop)], offset: messagesDisplay.scrollTop }));
  expect(after.id).toBe(before.id);
  expect(after.offset).toBeGreaterThan(before.offset);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { messagesDisplay.style.width='350px';window.testRender(); });
  expect(await page.locator('.message-row').count()).toBeLessThanOrEqual(160);
  expect(errors).toEqual([]);
  // Pin the pre-virtualization release so committing a newer release cannot change the baseline.
  const oldMain = fs.readFileSync(require('path').join(__dirname, 'fixtures/timeline-before-virtualization.js'), 'utf8');
  const oldNode = parser.parse(oldMain, { sourceType: 'module' }).program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'renderMessagesWithReadReceipts');
  const client = await page.context().newCDPSession(page);
  await client.send('Performance.enable');
  const metrics = async () => {
    await client.send('HeapProfiler.collectGarbage');
    const performance = await client.send('Performance.getMetrics');
    const memory = await client.send('Memory.getDOMCounters');
    return { heapBytes: performance.metrics.find(metric => metric.name === 'JSHeapUsedSize').value, domNodes: memory.nodes, rows: await page.locator('.message-row').count() };
  };
  await page.addScriptTag({ content: oldMain.slice(oldNode.start, oldNode.end) });
  const baselineMs = await page.evaluate(() => { messagesDisplay.replaceChildren(); messagesDisplay.scrollTop = 0; const start = performance.now(); renderMessagesWithReadReceipts(); return performance.now() - start; });
  const baseline = await metrics();
  await page.addScriptTag({ content: codeFor('renderMessagesWithReadReceipts') });
  const optimizedMs = await page.evaluate(() => { messagesDisplay.replaceChildren(); _virtualTimeline.reset(); messagesDisplay.scrollTop = 0; const start = performance.now(); renderMessagesWithReadReceipts(); return performance.now() - start; });
  const optimized = await metrics();
  await page.evaluate(() => { for (let i = 0; i < 100; i++) { messagesDisplay.scrollTop = i % 2 ? 0 : 20000; renderMessagesWithReadReceipts(); } });
  const repeated = await metrics();
  expect(baseline.rows).toBe(10001);
  expect(optimized.rows).toBeLessThanOrEqual(160);
  expect(repeated.rows).toBeLessThanOrEqual(160);
  expect(repeated.domNodes).toBeLessThan(baseline.domNodes / 5);
  expect(repeated.heapBytes).toBeLessThan(optimized.heapBytes + 1024 * 1024);
  const report = { fixture: 'Chrome on Windows, 10001 text messages, current reconciliation with mocked data services', baseline: { ...baseline, renderMs: baselineMs }, optimized: { ...optimized, renderMs: optimizedMs }, after100Scrolls: repeated };
  fs.mkdirSync('scratch', { recursive: true });
  fs.writeFileSync('scratch/timeline-performance.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await page.evaluate(()=>window.testJump('m1250'));
  await expect.poll(()=>page.evaluate(()=>{const row=document.querySelector('[data-message-id="m1250"]').closest('.message-row'),r=row.getBoundingClientRect(),c=messagesDisplay.getBoundingClientRect();return Math.abs((r.top+r.bottom-c.top-c.bottom)/2);})).toBeLessThanOrEqual(1);
  expect(await page.locator('.message-row').count()).toBeLessThanOrEqual(160);
  await page.evaluate(()=>_chatScroller.to(()=>0));
  expect(await page.evaluate(()=>messagesDisplay.scrollTop)).toBe(0);
});

for (const channel of ['server', 'dm']) {
  test(`${channel}: cached ciphertext, textless arrivals and real decryption update existing rows`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://covo.test/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="searchContainer"></div><div id="messagesDisplay" style="height:600px;overflow:auto"></div>' }));
    await page.goto('https://covo.test/');
    for (const file of ['loading_runtime.js', 'virtual_timeline.js', 'crypto_helpers.js']) {
      await page.addScriptTag({ content: fs.readFileSync('public/js/' + file, 'utf8').replace(/^import[^\n]*\n/gm, '').replace(/\bexport /g, '') });
    }
    await page.addScriptTag({ content: `
      const channel = ${JSON.stringify(channel)};
      const messagesDisplay=document.getElementById('messagesDisplay'),searchContainer=document.getElementById('searchContainer');
      let currentDmId=channel==='dm'?'alice_bob':null,currentServerId=channel==='server'?'server':null,currentRoomId=channel==='server'?'room':null,currentDmParticipant=null;
      let userId='alice',userNickname='Alice',cachedUsers=[],roomNames={room:'Room'},_outboxEntries=new Map(),messagesIndexMap={};
      let searchQuery='',_searchHistoryResults=null,_searchVisibleCount=50,isJumpView=false,isLoadingOlderMessages=false,hasMoreOlderMessages=true;
      let allLoadedMessages=[],lastMessagesData=[],jumpViewMessages=[];
      const _virtualTimeline=new VirtualTimeline(),_virtualRowObserver=null,_attachmentResources={prune(){}};
      const _abToB64=buffer=>btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const _b64ToAb=value=>Uint8Array.from(atob(value),character=>character.charCodeAt(0)).buffer;
      const LocalStore={putMessage:async()=>{}},doc=(_,path)=>path;
      const getDoc=async path=>({exists:()=>true,data:()=>path.includes('/roomKeys/')?window.wrappedKeys:{currentKeyVersion:2}});
      const getMsgTimestamp=message=>message.timestamp,parseTimestampToMs=value=>Number(value||0),countNewerMessages=()=>0;
      const isEncrypted=_isEncrypted,escapeHtml=text=>String(text||''),escapeHtmlAndLinkUrls=escapeHtml;
      const computeReadByCount=()=>0,updateReactionsUI=()=>{},resolveUnreadBoundaryMessageId=()=>null,renderUnreadDivider=()=>{};
      function createMessageElement(message){
        const row=document.createElement('div');row.className='message-row';
        const bubble=document.createElement('div');bubble.className='message-bubble';bubble.dataset.messageId=message.id;
        const text=document.createElement('span');text.className='message-content';
        if(message.text?.startsWith('enc::')){const waiting=document.createElement('span');waiting.className='covo-msg-loading-shimmer';text.appendChild(waiting);}else text.textContent=message.text||'';
        bubble.appendChild(text);row.appendChild(bubble);return row;
      }
      ${codeFor('virtualSpacer')}
      ${codeFor('patchMessageHtml')}
      ${codeFor('renderMessagesWithReadReceipts')}
      initCryptoContext({getDb:()=>({}),getUserId:()=>userId,getAppId:()=>'testApp',getIsAdmin:()=>false});
      window.exerciseEncryptedTimeline=async()=>{
        const keys={};
        for(const version of ['1','2'])keys[version]=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
        const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
        Object.assign(_e2ee,{ready:true,privateKey:pair.privateKey,publicKey:pair.publicKey});
        const versions={};
        for(const version of ['1','2'])versions[version]=_abToB64(await crypto.subtle.encrypt({name:'RSA-OAEP'},pair.publicKey,await crypto.subtle.exportKey('raw',keys[version])));
        window.wrappedKeys={versions,latestVersion:'1'};
        observeRoomKeyVersion('server','room',2);
        if(channel==='dm')_e2ee.dmKeyCache.alice_bob={...keys,latest:keys['2'],latestVersion:'2'};
        const old=await _encryptText('保存済みの本文',{latest:keys['1'],latestVersion:'1'});
        const fresh=await _encryptText('新着の本文',{latest:keys['2'],latestVersion:'2'});
        allLoadedMessages=[{id:'old',senderId:'alice',timestamp:1,text:old,_originalText:old,_decrypted:false}];
        renderMessagesWithReadReceipts();
        const incoming=[{id:'old',senderId:'alice',timestamp:1,text:old},{id:'file',senderId:'alice',timestamp:2,fileName:'file',fileData:'https://covo.test/file'},{id:'sticker',senderId:'alice',timestamp:3,sticker:'🙂'},{id:'fresh',senderId:'alice',timestamp:4,text:fresh}];
        allLoadedMessages=mergeChannelRecords(allLoadedMessages,incoming);
        renderMessagesWithReadReceipts();
        if(channel==='dm')await _decryptDmMessagesInPlace(incoming,'alice_bob',['alice','bob']);
        else await _decryptMessagesInPlace(incoming,'server','room',['alice']);
        renderMessagesWithReadReceipts();renderMessagesWithReadReceipts();
        return allLoadedMessages.filter(message=>message.text).map(message=>({text:message.text,decrypted:message._decrypted}));
      };
    ` });
    expect(await page.evaluate(() => window.exerciseEncryptedTimeline())).toEqual([{ text: '保存済みの本文', decrypted: true }, { text: '新着の本文', decrypted: true }]);
    await expect(page.locator('.message-row')).toHaveCount(4);
    await expect(page.locator('.covo-msg-loading-shimmer')).toHaveCount(0);
    await expect(page.locator('[data-message-id="old"] .message-content')).toHaveText('保存済みの本文');
    await expect(page.locator('[data-message-id="fresh"] .message-content')).toHaveText('新着の本文');
    expect(errors).toEqual([]);
  });
}

test('quick switcher ignores IME Enter and closes with focus restored', async ({ page }) => {
  await page.setContent('<button id="origin">Open</button>');
  await page.addScriptTag({ content: fs.readFileSync('public/js/navigation_ui.js', 'utf8').replace(/\bexport /g, '') + `
    window.opened=[];
    installNavigationUI({conversations:()=>[{id:'one',name:'# general'}],openConversation:item=>window.opened.push(item.id),openSearch(){},moveChannel(){},cancelRecording:()=>false,closeOverlay:()=>false});
  ` });
  await page.locator('#origin').focus();
  await page.keyboard.press('Control+k');
  await expect(page.locator('#quickConversationSwitcher')).toBeVisible();
  await page.locator('#quickConversationSwitcher input').dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  expect(await page.evaluate(() => window.opened)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#quickConversationSwitcher')).toHaveCount(0);
  await expect(page.locator('#origin')).toBeFocused();
});
