import { inspectLocalStorage, repairPresentation, recoveryNotice } from './recovery_runtime.js';
import { supportsWindowsVersion } from './client_protocol.js';

const invoke = window.__TAURI__?.core?.invoke;
const status = document.getElementById('recoveryStatus');
const output = document.getElementById('recoveryReport');
let report = null, page = 1, hasMore = true;
const inspect = async () => { report = await inspectLocalStorage(); output.textContent = JSON.stringify(report, null, 2); status.textContent = report.partial ? '一部の保存領域を確認できませんでした。アクセス制限や端末の状態を確認してください。' : '診断が完了しました。保存されている履歴と暗号鍵は変更していません。'; return report; };
const actions = {
  inspect,
  repair: async () => { await repairPresentation(); status.textContent = '修復操作を実行しました。アプリへ戻って読み込みを確認してください。'; },
  copy: async () => {
    if (!report) await inspect();
    try { await navigator.clipboard.writeText(output.textContent); status.textContent = '診断結果をコピーしました。'; }
    catch (_) { output.focus(); const range = document.createRange(); range.selectNodeContents(output); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); status.textContent = '結果を選択しました。端末のコピー操作でコピーしてください。'; }
  },
  update: async () => {
    if (!invoke) { status.textContent = 'Web版はアプリへ戻り、読み込みを再試行してください。端末の保存データを消す必要はありません。'; return; }
    await window.__TAURI__.event.emitTo('main', 'request-update-check', {}); await invoke('show_main_window');
    status.textContent = 'メイン画面に更新の確認を依頼しました。';
  },
  return: async () => {
    if (invoke) { await invoke('show_main_window'); const win = window.__TAURI__.window?.getCurrentWindow?.(); if (win && win.label !== 'main') { await win.hide(); return; } }
    location.href = './index.html';
  },
  logs: () => invoke('open_log_dir'),
  quit: () => invoke('exit_app'),
  releases: async button => {
    if (!hasMore) return;
    const response = await fetch(`https://api.github.com/repos/qwertyuiop1229/Covo/releases?per_page=10&page=${page}`, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`バージョン一覧を取得できませんでした（HTTP ${response.status}）。もう一度お試しください。`);
    const releases = await response.json();
    if (!Array.isArray(releases)) throw new Error('バージョン一覧の形式を確認できませんでした。');
    const list = document.getElementById('recoveryReleases');
    for (const release of releases) {
      if (!release || release.draft || release.prerelease) continue;
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const asset = assets.find(a => a?.name?.endsWith('.exe') && assets.some(s => s?.name === a.name + '.sig'));
      const row = document.createElement('div'); row.className = 'covo-recovery-release';
      const name = document.createElement('span'); name.textContent = String(release.tag_name);
      const install = document.createElement('button'); install.className = 'covo-button covo-button-secondary covo-button-small';
      const supported = supportsWindowsVersion(release.tag_name);
      const url = asset?.browser_download_url;
      const safe = typeof url === 'string' && url.startsWith('https://github.com/qwertyuiop1229/Covo/releases/download/');
      install.disabled = !invoke || !supported || !safe;
      install.textContent = !supported ? '更新対象外' : !invoke ? 'Windows版専用' : !safe ? '配布物なし' : 'インストール';
      install.onclick = async () => {
        if (!confirm(`${release.tag_name}をインストールします。メイン画面での通話やファイル転送を終了してから実行してください。`)) return;
        install.disabled = true;
        try { await invoke('silent_install_past_version', { url, tag: release.tag_name }); status.textContent = '署名を確認してインストールを開始しました。'; }
        catch (error) { status.textContent = String(error.message || error); recoveryNotice(status.textContent); install.disabled = false; }
      };
      row.append(name, install); list.append(row);
    }
    page++; hasMore = releases.length === 10;
    button.textContent = hasMore ? 'さらに表示' : '一覧の終わり';
    if (!list.children.length) { const empty = document.createElement('p'); empty.textContent = '公開バージョンがありません。'; list.append(empty); }
  }
};
for (const button of document.querySelectorAll('[data-action]')) {
  const action = button.dataset.action;
  if (!invoke && ['logs', 'quit'].includes(action)) { button.disabled = true; button.title = 'Windows版専用の操作です'; }
  button.onclick = async () => {
    button.disabled = true; button.setAttribute('aria-busy', 'true'); status.textContent = '操作を実行中…';
    try { await actions[action](button); }
    catch (error) { status.textContent = String(error.message || error); recoveryNotice(status.textContent); }
    finally { button.disabled = action === 'releases' && !hasMore; button.removeAttribute('aria-busy'); }
  };
}
