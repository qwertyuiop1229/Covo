const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const main = fs.readFileSync('public/js/main.js', 'utf8');
const tree = parser.parse(main, { sourceType: 'module' });
const functionCode = name => { const node = tree.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name); return main.slice(node.start, node.end); };

async function fixture(page, theme = '') {
  await page.route('https://covo.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/styles.css"><link rel="stylesheet" href="/css/font-awesome.min.css"><link rel="stylesheet" href="/css/main.css"></head><body style="color:var(--covo-text)"><header id="currentRoomHeader"></header><button id="outside">メッセージ入力に戻る</button></body></html>' });
    const file = path.resolve('public', '.' + pathname);
    if (!file.startsWith(path.resolve('public') + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ path: file });
  });
  await page.goto('https://covo.test/');
  await page.evaluate(theme => { document.body.className = `discord-ui-mode ${theme}`; if (theme) document.documentElement.classList.add('dark'); }, theme);
  await page.evaluate(html => {
    const header = document.importNode(new DOMParser().parseFromString(html, 'text/html').getElementById('currentRoomHeader'), true);
    header.classList.remove('hidden'); document.getElementById('currentRoomHeader').replaceWith(header);
    document.getElementById('currentRoomTitleText').textContent = 'デザイン確認';
  }, fs.readFileSync('public/index.html', 'utf8'));
  await page.addScriptTag({ content: fs.readFileSync('public/js/notification_ui.js', 'utf8').replace(/\bexport /g, '') + `
    window.destination={owner:'alice',server:'server',room:'room',key:'server:room',session:1};
    window.prefs={servers:{server:'mentions'},channels:{}};window.writes=[];
    window.ui=installConversationNotificationUI({header:document.getElementById('currentRoomHeader'),target:()=>destination,preferences:()=>prefs,
      save:async(owner,group,key,mode)=>{writes.push({owner,group,key,mode});if(window.failSave)throw Error('offline');
        if(window.deferSave)await new Promise(resolve=>window.finishSave=resolve);
        if(destination.owner!==owner)return;
        prefs[group]||={};if(mode==='inherit')delete prefs[group][key];else prefs[group][key]=mode;
      }});
  ` });
}

for (const theme of ['', 'dark-server-theme', 'discord-dark-theme']) {
  test(`notification preferences match ${theme || 'light'} theme and support saving, failure and dismissal`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await fixture(page, theme);
    const button = page.locator('#conversationNotificationButton');
    await expect(button).toHaveAttribute('data-mode', 'mentions');
    await button.click();
    const panel = page.locator('#conversationNotificationSettings');
    await expect(panel).toBeVisible(); await expect(button).toHaveAttribute('aria-expanded', 'true');
    const inherited = panel.locator('input[value="inherit"]'); await expect(inherited).toBeChecked();
    const contrast = await panel.evaluate(element => {
      const luminance = color => { const values = color.match(/\d+/g).slice(0, 3).map(value => { value = Number(value) / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }); return .2126 * values[0] + .7152 * values[1] + .0722 * values[2]; };
      const style = getComputedStyle(element), one = luminance(style.color), two = luminance(style.backgroundColor);
      return (Math.max(one, two) + .05) / (Math.min(one, two) + .05);
    });
    expect(contrast).toBeGreaterThan(4.5);
    await panel.locator('fieldset').last().getByLabel('通知しない', { exact: true }).check();
    await expect(panel.getByRole('status')).toHaveText('通知設定を保存しました');
    await page.evaluate(() => ui.refresh());
    await expect(button).toHaveAttribute('data-mode', 'none');
    await page.screenshot({ path: `scratch/ui-notifications-${theme || 'light'}.png` });
    await page.evaluate(() => { window.failSave = true; });
    await inherited.click();
    await expect(panel.getByRole('status')).toContainText('保存できませんでした');
    await expect(panel.locator('fieldset').last().getByLabel('通知しない', { exact: true })).toBeChecked();
    await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0); await expect(button).toBeFocused();
    await button.click(); await page.locator('#outside').click(); await expect(panel).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('DM preferences stay within a narrow viewport and discard a late save after switching account', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await fixture(page, 'dark-server-theme');
  await expect(page.locator('#currentRoomActions #conversationNotificationButton')).toHaveCount(1);
  const headerBounds = await page.locator('#conversationNotificationButton').boundingBox();
  expect(headerBounds.x + headerBounds.width).toBeLessThanOrEqual(390);
  await page.evaluate(() => { destination={owner:'alice',server:null,room:'alice_bob',key:'dm:alice_bob',session:2};window.deferSave=true;ui.refresh(); });
  await page.locator('#conversationNotificationButton').click();
  const panel = page.locator('#conversationNotificationSettings');
  await expect(panel.getByRole('group')).toHaveCount(1);
  await expect(panel.getByLabel('メンションのみ')).toHaveCount(0);
  const bounds = await panel.boundingBox(); expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390); expect(bounds.y + bounds.height).toBeLessThanOrEqual(700);
  await panel.getByLabel('通知しない', { exact: true }).check();
  await expect(panel.getByRole('status')).toHaveText('保存中…');
  await page.evaluate(() => { destination={owner:'carol',server:null,room:'carol_bob',key:'dm:carol_bob',session:3};prefs={};ui.refresh();finishSave(); });
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => writes)).toEqual([{ owner: 'alice', group: 'channels', key: 'dm:alice_bob', mode: 'none' }]);
  await page.locator('#conversationNotificationButton').click(); await expect(page.getByLabel('すべてのメッセージ', { exact: true })).toBeChecked();
});

test('the entire settings close button receives pointer events and account identity refreshes safely', async ({ page }) => {
  await fixture(page);
  const html = fs.readFileSync('public/index.html', 'utf8');
  await page.evaluate(html => {
    const modal = new DOMParser().parseFromString(html, 'text/html').getElementById('settingsModal');
    document.body.appendChild(document.importNode(modal, true));
    document.getElementById('settingsModal').classList.remove('hidden');
    window.testClosed=0;document.getElementById('closeSettingsButton').onclick=()=>window.testClosed++;
  }, html);
  await page.addScriptTag({ content: `let userNickname='山田 <img src=x onerror=alert(1)>',userAuthEmail='alice@example.test',userId='alice',userAvatarUrl=null;const auth={currentUser:{}};
    const isUsableAvatarUrl=url=>typeof url==='string'&&url.startsWith('data:image/');const unmarkAvatarAsInvalid=()=>{},markAvatarAsInvalid=()=>{};
    ${functionCode('__setAvatarImg')}
    ${functionCode('updateAccountIdentityUI')}
    updateAccountIdentityUI();
  ` });
  await expect(page.locator('#accountSectionName')).toHaveText('山田 <img src=x onerror=alert(1)>');
  await expect(page.locator('#accountSectionName img')).toHaveCount(0);
  await expect(page.locator('#accountSectionTag')).toHaveText('alice@example.test');
  await expect(page.locator('#accountSectionAvatarPreview')).toHaveText('山');
  const button = page.locator('#closeSettingsButton');
  await button.scrollIntoViewIfNeeded();
  const targets = await button.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return [[.15,.15],[.85,.15],[.15,.85],[.85,.85],[.5,.5]].map(([x,y])=>element.contains(document.elementFromPoint(rect.x+rect.width*x,rect.y+rect.height*y)));
  });
  expect(targets).toEqual([true,true,true,true,true]);
  const box = await button.boundingBox();
  for (const [x,y] of [[.2,.2],[.8,.2],[.2,.8],[.8,.8]]) await page.mouse.click(box.x+box.width*x, box.y+box.height*y);
  expect(await page.evaluate(() => testClosed)).toBe(4);
  await page.evaluate(() => { userNickname='更新後';userAvatarUrl='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="green"/></svg>');updateAccountIdentityUI(); });
  await expect(page.locator('#accountSectionName')).toHaveText('更新後'); await expect(page.locator('#accountSectionAvatarPreview img')).toHaveCount(1);
});

test('quick switcher shows empty results, keeps the selected row visible and closes without stale handlers', async ({ page }) => {
  await fixture(page, 'discord-dark-theme');
  await page.addScriptTag({ content: fs.readFileSync('public/js/navigation_ui.js', 'utf8').replace(/\bexport /g, '') + `
    window.opened=[];installNavigationUI({conversations:()=>Array.from({length:30},(_,i)=>({name:'# チャンネル '+i,id:i})),openConversation:item=>opened.push(item.id),openSearch(){},moveChannel(){},cancelRecording:()=>false,closeOverlay:()=>false});
  ` });
  await page.locator('#outside').focus(); await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox'); await input.fill('見つからない');
  await expect(page.getByRole('status')).toHaveText('一致する会話が見つかりません');
  await input.fill(''); for(let i=0;i<25;i++)await page.keyboard.press('ArrowDown');
  expect(await page.locator('#quickConversationResults').evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('Tab'); await expect(page.getByRole('button',{name:'会話の切替を閉じる'})).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#quickConversationSwitcher')).toHaveCount(0); expect(await page.evaluate(()=>opened)).toEqual([]);
  await page.keyboard.press('Control+k'); await page.keyboard.press('Control+k'); await expect(page.locator('#quickConversationSwitcher')).toHaveCount(0); await expect(page.locator('#outside')).toBeFocused();
});

async function archiveFixture(page, theme = '', mobile = false) {
  if (mobile) await page.setViewportSize({ width: 390, height: 740 });
  await fixture(page, theme);
  await page.evaluate(({ html, mobile }) => {
    const source = new DOMParser().parseFromString(html, 'text/html');
    for (const id of ['settingsModal', 'mobileDetailChatBackup', 'localArchivesPanel', 'chatBackupViewerModal', 'customConfirmModal', 'customPromptModal', 'customAlertModal', 'notifStack', 'mobileNotifContainer']) document.body.appendChild(document.importNode(source.getElementById(id), true));
    if (mobile) document.getElementById('mobileDetailChatBackup').classList.add('active');
    else {
      document.getElementById('settingsModal').classList.remove('hidden');
      document.querySelectorAll('.settings-content-section').forEach(element => element.classList.remove('active'));
      document.getElementById('chatbackupSection').classList.add('active');
    }
  }, { html: fs.readFileSync('public/index.html', 'utf8'), mobile });
  for (const file of ['ui_helpers.js', 'local_archive_ui.js', 'navigation_ui.js']) await page.addScriptTag({ content: fs.readFileSync('public/js/' + file, 'utf8').replace(/\bexport /g, '') });
  const install = tree.program.body.find(node => node.type === 'ExpressionStatement' && node.expression.type === 'CallExpression' && node.expression.callee.name === 'installNavigationUI');
  const close = install.expression.arguments[0].properties.find(property => property.key.name === 'closeOverlay').value;
  await page.addScriptTag({ content: `
    ${functionCode('openModal')}
    ${functionCode('showCustomConfirm')}
    window.owner='alice';window.archiveRows=[];window.deleted=[];window.archiveOpens=[];window.readCompleters=[];
    window.archivesUI=installLocalArchiveUI({account:()=>owner,store:{
      getSettingsByPrefix:async()=>{if(window.readFailure)throw Error('read failed');const rows=archiveRows;if(window.deferRead)await new Promise(resolve=>readCompleters.push(resolve));return rows;},
      deleteSetting:async key=>{deleted.push(key);return !window.deleteFailure;}
    },openArchive:async archive=>{archiveOpens.push(archive);if(window.openFailure)throw Error('パスフレーズを確認してください');},alertMessage,confirm:showCustomConfirm,openModal});
    window.openLocalArchives=trigger=>archivesUI.open(trigger);
    window.closeLocalArchives=()=>archivesUI.close();
    installNavigationUI({conversations:()=>[],openConversation(){},openSearch(){},moveChannel(){},cancelRecording:()=>false,closeOverlay:${main.slice(close.start, close.end)}});
  ` });
  return page.locator(mobile ? '#mobileOpenLocalArchivesButton' : '#openLocalArchivesButton');
}

for (const theme of ['', 'dark-server-theme', 'discord-dark-theme']) {
  test(`archive controls reuse backup styles and common notifications in ${theme || 'light'} theme`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const trigger = await archiveFixture(page, theme);
    const comparison = await page.evaluate(() => {
      const original = getComputedStyle(document.querySelector('#chatbackupSection button[onclick="openChatBackupViewerFilePicker()"]'));
      const added = getComputedStyle(document.getElementById('openLocalArchivesButton'));
      return ['backgroundColor', 'color', 'borderRadius', 'fontSize', 'fontWeight', 'minHeight'].every(key => original[key] === added[key]);
    }); expect(comparison).toBe(true);
    await page.screenshot({path:`scratch/archive-settings-${theme || 'light'}.png`});
    await trigger.click();
    await expect(page.locator('#localArchivesPanel')).toBeHidden();
    await expect(page.locator('#notifStack')).toContainText('保存されたアーカイブはありません');
    await page.evaluate(() => { archiveRows=[{key:'archive:one',value:{roomName:'# 一般',exportedAt:1800000000000}},{key:'archive:two',value:{roomName:'<img src=x onerror=alert(1)>'.repeat(6)}}]; });
    await trigger.click();
    const modal = page.locator('#localArchivesPanel'); await expect(modal).toBeVisible();
    await expect(modal.locator('.local-archive-row')).toHaveCount(2); await expect(modal.locator('.local-archive-details img')).toHaveCount(0);
    await expect(page.locator('#localArchivesCount')).toHaveText('2件のアーカイブ');
    await page.locator('#notifStack').evaluate(element => element.replaceChildren());
    await page.screenshot({path:`scratch/archive-controls-${theme || 'light'}.png`});
    await modal.getByRole('button',{name:'# 一般を端末から削除',exact:true}).click();
    await expect(page.locator('#customConfirmModal')).toBeVisible();
    expect(await page.evaluate(()=>Number(getComputedStyle(document.getElementById('customConfirmModal')).zIndex)>Number(getComputedStyle(document.getElementById('localArchivesPanel')).zIndex))).toBe(true);
    await page.keyboard.press('Escape'); await expect(page.locator('#customConfirmModal')).toBeHidden(); await expect(modal).toBeVisible();
    expect(await page.evaluate(()=>deleted)).toEqual([]);
    await page.evaluate(()=>{window.deleteFailure=true;});
    await modal.getByRole('button',{name:'# 一般を端末から削除',exact:true}).click(); await page.locator('#customConfirmOk').click();
    await expect(modal.locator('.local-archive-row')).toHaveCount(2); await expect(page.locator('#notifStack')).toContainText('削除できませんでした');
    await page.keyboard.press('Escape'); await expect(modal).toBeHidden(); await expect(trigger).toBeFocused();
    expect(errors).toEqual([]);
  });

  test(`mobile archive feedback and list fit ${theme || 'light'} theme`, async ({ page }) => {
    const trigger = await archiveFixture(page, theme, true);
    await trigger.click(); await expect(page.locator('#mobileNotifContainer')).toContainText('保存されたアーカイブはありません');
    await expect(page.locator('#mobileNotifContainer > [role="status"]')).toBeVisible();
    await page.evaluate(()=>{archiveRows=[{key:'archive:one',value:{roomName:'長い会話名'.repeat(20),exportedAt:1800000000000}}];});
    await trigger.click();
    const modal=page.locator('#localArchivesPanel'); await expect(modal).toBeVisible();
    await page.locator('#mobileNotifContainer').evaluate(element => element.replaceChildren());
    for(const selector of ['.local-archive-row','.local-archive-actions']) {
      const bounds=await modal.locator(selector).boundingBox(); expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
    }
    await page.screenshot({path:`scratch/archive-controls-mobile-${theme || 'light'}.png`});
    await modal.getByRole('button',{name:'削除',exact:false}).click();await page.locator('#customConfirmOk').click();
    await expect(modal).toBeHidden();await expect(page.locator('#mobileNotifContainer')).toContainText('この端末から削除しました');
    await expect(trigger).toBeFocused();
  });
}

test('archive deletion cannot cross accounts while the common confirmation dialog is open', async ({ page }) => {
  const trigger=await archiveFixture(page);
  await page.evaluate(()=>{archiveRows=[{key:'archive:one',value:{roomName:'Alice only'}}];});
  await trigger.click(); await page.locator('#localArchivesPanel').getByRole('button',{name:'削除',exact:false}).click();
  await page.evaluate(()=>{owner='bob';archivesUI.close(false);}); await page.locator('#customConfirmOk').click();
  expect(await page.evaluate(()=>deleted)).toEqual([]);await expect(page.locator('#localArchivesPanel')).toBeHidden();
});

test('archive read and open failures use the shared toast without leaving an empty or blocked dialog', async ({ page }) => {
  const trigger=await archiveFixture(page);
  await page.evaluate(()=>{window.readFailure=true;});await trigger.click();
  await expect(page.locator('#notifStack')).toContainText('読み込めませんでした');await expect(trigger).toBeEnabled();
  await page.evaluate(()=>{window.readFailure=false;archiveRows=[{key:'archive:one',value:{roomName:'Open test'}}];window.openFailure=true;});
  await trigger.click(); await page.locator('#localArchivesPanel').getByRole('button',{name:'Open testを開く',exact:true}).click();
  await expect(page.locator('#localArchivesPanel')).toBeHidden();await expect(page.locator('#notifStack')).toContainText('パスフレーズを確認してください');
  expect(await page.evaluate(()=>archiveOpens.length)).toBe(1);
});

test('a late archive read cannot replace a new account list or unlock its pending button', async ({ page }) => {
  const trigger=await archiveFixture(page);
  await page.evaluate(()=>{window.deferRead=true;archiveRows=[{key:'archive:alice',value:{roomName:'Alice only'}}];});
  await trigger.click();await expect(trigger).toBeDisabled();
  await page.evaluate(()=>{owner='bob';archivesUI.close(false);});await expect(trigger).toBeEnabled();
  await page.evaluate(()=>{archiveRows=[{key:'archive:bob',value:{roomName:'Bob only'}}];openLocalArchives(document.getElementById('openLocalArchivesButton'));});
  await expect(trigger).toBeDisabled();await page.evaluate(()=>readCompleters[0]());
  await expect(trigger).toBeDisabled();await expect(page.locator('#localArchivesPanel')).toBeHidden();
  await page.evaluate(()=>readCompleters[1]());await expect(trigger).toBeEnabled();
  await expect(page.locator('#localArchivesList')).toContainText('Bob only');await expect(page.locator('#localArchivesList')).not.toContainText('Alice only');
});

test('backup pagination uses shared buttons and Escape closes the viewer above mobile settings', async ({ page }) => {
  await archiveFixture(page, 'discord-dark-theme', true);
  await page.addScriptTag({content:fs.readFileSync('public/js/backup_feature.js','utf8').replace(/\bexport /g,'')+`
    installBackupFeature({userId:'alice',isEncrypted:()=>false,escapeHtml:value=>String(value),escapeHtmlAndLinkUrls:value=>String(value),_archiveBlobUrls:new Set()});
  `});
  await page.evaluate(()=>window.openChatBackupViewerModal('ページ送り確認',Array.from({length:201},(_,index)=>({id:'m'+index,senderId:'alice',text:'本文 '+index,timestamp:1800000000000+index})),1800000000000,true));
  const viewer=page.locator('#chatBackupViewerModal');const older=viewer.getByRole('button',{name:'前の100件',exact:true});const newer=viewer.getByRole('button',{name:'次の100件',exact:true});
  await expect(viewer.locator('.backup-pagination-count')).toHaveText('102–201 / 201件');await expect(newer).toBeDisabled();
  await expect(older).toHaveClass(/covo-button-secondary/);await older.click();await expect(viewer.locator('.backup-pagination-count')).toHaveText('2–101 / 201件');
  await older.click();await expect(viewer.locator('.backup-pagination-count')).toHaveText('1–1 / 201件');await expect(older).toBeDisabled();
  await newer.click();await expect(viewer.locator('.backup-pagination-count')).toHaveText('2–101 / 201件');
  await page.keyboard.press('Escape');await expect(viewer).toBeHidden();await expect(page.locator('#mobileDetailChatBackup')).toHaveClass(/active/);
});
