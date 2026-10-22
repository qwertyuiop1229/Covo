const { test, expect } = require('@playwright/test');
const fs = require('fs');
const parser = require('@babel/parser');
const cp = require('child_process');
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
  await page.addScriptTag({ content: `
    const messagesDisplay = document.getElementById('messagesDisplay'), searchContainer = document.getElementById('searchContainer');
    let currentDmId = null, currentServerId = 'server', currentRoomId = 'room', currentDmParticipant = null;
    let searchQuery = '', _searchHistoryResults = null, _searchVisibleCount = 50, isJumpView = false, isLoadingOlderMessages = false, hasMoreOlderMessages = true;
    let allLoadedMessages = Array.from({length:10000}, (_,i)=>({id:'m'+i,text:'message '+i,senderId:'alice',timestamp:1700000000000+i}));
    let jumpViewMessages = [], lastMessagesData = [], messagesIndexMap = {}, userId = 'alice', userNickname = 'Alice', cachedUsers = [], roomNames = {room:'Room'}, _outboxEntries = new Map();
    const _virtualTimeline = new VirtualTimeline(), _virtualRowObserver = null, _attachmentResources = {prune() {}};
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
  // Compare the same renderer fixture against HEAD before this change. No production Firebase calls.
  const oldMain = cp.execFileSync('git', ['show', 'HEAD:public/js/main.js'], { encoding: 'utf8', maxBuffer: 5e6 });
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
});

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
