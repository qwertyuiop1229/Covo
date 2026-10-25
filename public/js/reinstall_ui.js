export function installReinstallUI({ invoke, listen, busy, notify }) {
  if (window.covoNativeDevelopment) return;
  const views = [];
  let running = false;
  const theme = () => document.body.classList.contains('discord-dark-theme') ? 'dark-discord' : document.body.classList.contains('dark-server-theme') ? 'dark-navy' : 'light';
  let savedTheme;
  const syncTheme = () => { const selected = theme(); if (savedTheme === selected) return; savedTheme = selected; invoke('set_installer_theme', { theme: selected }).catch(() => { savedTheme = undefined; }); };
  new MutationObserver(syncTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] }); syncTheme();
  for (const parent of [document.getElementById('appinfoSection'), document.querySelector('#mobileDetailAppInfo > div:last-child')]) {
    if (!parent) continue;
    const section = document.createElement('section'); section.className = 'covo-reinstall-card';
    section.innerHTML = '<h3>アプリを再インストール</h3><p>公式の署名付きパッケージで、このバージョンのアプリを入れ直します。</p><label class="covo-reinstall-preserve"><span>端末の暗号鍵・履歴・ログイン状態を保持する</span><span class="toggle-switch"><input type="checkbox" checked aria-label="端末データを保持する"><span class="toggle-slider"></span></span></label><p class="covo-reinstall-warning" hidden>保持をオフにすると、端末の暗号鍵・保存履歴・送信待ち・設定を削除します。復旧用のバックアップを先に確認してください。</p><button type="button" class="covo-button covo-button-secondary">再インストール</button><progress hidden aria-label="再インストールのダウンロード"></progress><p role="status" aria-live="polite"></p>';
    const preserve = section.querySelector('input'), warning = section.querySelector('.covo-reinstall-warning'), button = section.querySelector('button'), progress = section.querySelector('progress'), status = section.querySelector('[role=status]');
    const view = { button, preserve, progress, status }; views.push(view);
    preserve.onchange = () => { warning.hidden = preserve.checked; };
    button.onclick = async () => {
      if (running) return;
      if (busy()) { notify('通話・録音・転送・送信・更新が終わってから再試行してください。', 'warning'); return; }
      const eraseData = !preserve.checked;
      running = true; let unlisten;
      for (const item of views) { item.button.disabled = true; item.preserve.disabled = true; }
      try {
        if (!window.showCustomConfirm || !await window.showCustomConfirm(eraseData ? '端末データを削除して再インストールしますか？' : '端末データを保持して再インストールしますか？', '再インストール', 'キャンセル', eraseData ? '端末の暗号鍵・保存履歴・送信待ちは元に戻せません。公式パッケージの署名確認とインストールが成功した後に削除します。' : 'アプリを終了して入れ直します。暗号鍵・履歴・ログイン状態は保持します。')) return;
        if (busy()) throw new Error('処理状況が変わりました。通話・送信・更新が終わってから再試行してください。');
        window.covoReinstalling = true;
        for (const item of views) { item.progress.hidden = false; item.progress.removeAttribute('value'); item.status.textContent = '公式パッケージを確認しています…'; }
        if (listen) unlisten = await listen('download-progress', event => {
          const data = event.payload || {};
          for (const item of views) {
            if (Number.isFinite(data.total) && data.total > 0) { item.progress.max = data.total; item.progress.value = Math.max(0, Math.min(data.downloaded || 0, data.total)); }
            else item.progress.removeAttribute('value');
            item.status.textContent = 'ダウンロード中… 完了後に署名を検証して適用します。';
          }
        });
        await invoke('set_installer_theme', { theme: theme() });
        await invoke('reinstall_app', { eraseData });
        for (const item of views) item.status.textContent = '署名を確認しました。アプリを終了して再インストールします。';
      } catch (error) {
        for (const item of views) item.status.textContent = '再インストールを開始できませんでした。端末データは保持しています。';
        notify(String(error?.message || error), 'warning');
      } finally {
        unlisten?.(); running = false; window.covoReinstalling = false;
        for (const item of views) { item.button.disabled = false; item.preserve.disabled = false; item.progress.hidden = true; }
      }
    };
    parent.append(section);
  }
}
