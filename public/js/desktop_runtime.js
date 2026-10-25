import { createUpdateController } from './update_controller.js';
import { assertSupportedClient } from './client_protocol.js';
import { installReinstallUI } from './reinstall_ui.js';

if (window.__TAURI__?.core?.invoke) {
  const invoke = window.__TAURI__.core.invoke;
  invoke('plugin:app|version').then(version => { window.covoNativeVersion = version; }).catch(() => {});
  const busy = () => window.covoDesktopBusy ? window.covoDesktopBusy() : true;
  const notify = (message, type = 'info') => {
    if (window.alertMessage) window.alertMessage(message, type);
    else { const status = document.getElementById('desktopUpdateStatus'); if (status) status.textContent = message; }
  };
  const panel = document.createElement('aside');
  panel.className = 'covo-desktop-update'; panel.hidden = true; panel.setAttribute('aria-label', 'Covoの更新');
  const heading=document.createElement('strong');heading.className='covo-update-heading';heading.textContent='Covoのアップデート';
  const status = document.createElement('span'); status.id = 'desktopUpdateStatus'; status.setAttribute('role', 'status');
  const detail=document.createElement('p');detail.className='covo-update-detail';
  const progress = document.createElement('progress'); progress.setAttribute('aria-label', '更新のダウンロード');
  const button = document.createElement('button'); button.type = 'button'; button.className = 'covo-button covo-button-small covo-update-primary';
  const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'covo-button covo-button-secondary covo-button-small'; dismiss.textContent = 'あとで';
  dismiss.onclick = () => { panel.hidden = true; notify('更新は「設定 → アプリ情報 → 更新画面を開く」から再開できます。'); };
  const actions=document.createElement('div');actions.className='covo-update-actions';actions.append(button,dismiss);
  panel.append(heading,status,detail,progress,actions); document.body.append(panel);
  function renderUpdate(state) {
    const percent=state.total>0?Math.min(100,Math.floor(state.downloaded/state.total*100)):null;
    const label=({idle:'更新を確認',checking:'更新を確認しています…',current:'最新バージョンです',available:`v${state.version} の更新があります`,downloading:`v${state.version} をダウンロード中${percent===null?'…':`（${percent}%）`}`,ready:`v${state.version} の準備ができました。再起動して適用できます`,installing:'更新を適用しています。完了までお待ちください。',error:'更新を完了できませんでした。もう一度お試しください。'})[state.phase]||'';
    status.textContent=label;
    detail.textContent=state.phase==='ready'?'「再起動して更新」を押すとアプリを終了し、更新を適用します。後で行う場合はアプリ情報からこの画面を開けます。':state.phase==='downloading'?'このままアプリを使えます。ダウンロード後に更新するタイミングを選べます。':state.phase==='available'?'通話・録音・転送・送信が終わるとダウンロードを開始します。':state.phase==='error'?String(state.error||'接続を確認してください。'):'';
    progress.hidden=state.phase!=='downloading';
    if(state.total>0){progress.max=state.total;progress.value=Math.min(state.downloaded,state.total);}else progress.removeAttribute('value');
    button.textContent=state.phase==='ready'?'再起動して更新':state.phase==='error'?'もう一度確認':'ダウンロード';
    button.hidden=['idle','current'].includes(state.phase);button.disabled=['checking','downloading','installing'].includes(state.phase);
    dismiss.disabled=state.phase==='installing';
    button.onclick=()=> (state.phase==='ready'?controller.apply():state.phase==='error'?controller.check():controller.download()).catch(error=>notify(error.message,'warning'));
    for(const id of ['pcCheckUpdateStatus','mobileCheckUpdateStatus']){const node=document.getElementById(id);if(node)node.textContent=label;}
    const checkButton=document.getElementById('pcCheckUpdateBtn');if(checkButton){checkButton.textContent=['available','downloading','ready','installing'].includes(state.phase)?'更新画面を開く':'更新を確認';checkButton.disabled=state.phase==='checking';}
    window.dispatchEvent(new CustomEvent('covo-update-state',{detail:state}));
  }
  const controller = createUpdateController({
    check: async options => (await import('../vendor/desktop-updater.js')).check(options), busy: () => busy() || Boolean(window.covoReinstalling) || Boolean(window.covoMaintenanceBlocked) || Boolean(window.covoNativeDevelopment),
    changed(state) {
      window.__bgDownloading = state.phase === 'downloading'; window.__bgDownloaded = state.phase === 'ready';
      if (['available', 'ready', 'error'].includes(state.phase)) panel.hidden = false;
      renderUpdate(state);
    }
  });
  window.covoUpdater = controller;
  installReinstallUI({ invoke, listen: window.__TAURI__.event?.listen, busy: () => busy() || ['downloading','installing'].includes(controller.state.phase), notify });
  window.covoCheckUpdate = async (manual = false) => {
    if (window.covoNativeDevelopment) { if (manual) notify('開発実行中は本番版への更新を停止しています。'); return false; }
    if (window.covoReinstalling || window.covoMaintenanceBlocked) return false;
    if(manual){panel.hidden=false;renderUpdate(controller.state);}
    if(['ready','downloading','installing'].includes(controller.state.phase))return true;
    let required = false;
    try { assertSupportedClient(); } catch (_) { required = true; }
    if (!manual && (navigator.onLine === false || (!required && localStorage.getItem('covo_ignore_force_update') === '1'))) return false;
    const found = await controller.check();
    if (found && !busy()) await controller.download();
    if(manual){panel.hidden=false;renderUpdate(controller.state);}
    if (manual && !found) notify('現在提供されている最新バージョンです。');
    return found;
  };
  const resume = async () => {
    if (window.covoNativeDevelopment) return;
    if (controller.state.phase === 'available' && !busy() && navigator.onLine !== false) await controller.download();
  };
  setInterval(() => resume().catch(() => {}), 30000);
  setInterval(() => window.covoCheckUpdate().catch(() => {}), 6 * 60 * 60 * 1000);
  setTimeout(() => window.covoCheckUpdate().catch(() => {}), 10000);
  window.addEventListener('online', () => resume().catch(() => {}));
  // This proves the local shell booted, independently of Firebase/auth/network.
  invoke('notify_app_loaded').catch(() => {});
  window.__TAURI__.event?.listen('desktop-action', event => {
    if (event.payload === 'pause-notifications') {
      const paused = Number(localStorage.getItem('covo_notifications_paused_until') || 0) > Date.now();
      localStorage.setItem('covo_notifications_paused_until', String(paused ? 0 : Date.now() + 60 * 60 * 1000));
      notify(paused ? '通知を再開しました。' : '通知を1時間停止しました。');
    }
    if (event.payload === 'mute-microphone') window.covoToggleMicrophone?.();
  });
  window.__TAURI__.event?.listen('request-update-check', () => window.covoCheckUpdate(true).catch(error => notify(error.message, 'warning')));
  const settings = document.getElementById('desktopSettingsContainer');
  if (settings) {
    const row = document.createElement('div'); row.className = 'setting-row';
    const label = document.createElement('label'); label.className = 'setting-label'; label.htmlFor = 'covoMicrophoneShortcut'; label.textContent = 'Ctrl + Shift + M でマイクを切り替える';
    const toggle = document.createElement('label'); toggle.className = 'toggle-switch';
    const input = document.createElement('input'); input.type = 'checkbox'; input.id = 'covoMicrophoneShortcut'; input.checked = localStorage.getItem('covo_microphone_shortcut') === 'true';
    const slider = document.createElement('span'); slider.className = 'toggle-slider';
    input.onchange = async () => {
      try { await invoke('set_microphone_shortcut', { enabled: input.checked }); localStorage.setItem('covo_microphone_shortcut', String(input.checked)); }
      catch (error) { input.checked = !input.checked; notify(String(error), 'warning'); }
    };
    toggle.append(input, slider); row.append(label, toggle); settings.append(row);
    if (input.checked) invoke('set_microphone_shortcut', { enabled: true }).catch(error => { input.checked = false; notify(String(error), 'warning'); });
  }
  let previousBusy, previousTick = Date.now();
  setInterval(() => {
    const currentBusy = busy();
    if (currentBusy !== previousBusy) {
      previousBusy = currentBusy; invoke('set_desktop_busy', { busy: currentBusy }).catch(() => { previousBusy = undefined; });
      if (!currentBusy) resume().catch(() => {});
    }
    const now = Date.now();
    if (now - previousTick > 45000) window.dispatchEvent(new Event('covo-system-resume'));
    previousTick = now;
  }, 1000);
}
