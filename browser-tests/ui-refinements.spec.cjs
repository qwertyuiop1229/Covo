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
