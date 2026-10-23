import { createUpdateController } from './update_controller.js';
import { assertSupportedClient } from './client_protocol.js';

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
  const status = document.createElement('span'); status.id = 'desktopUpdateStatus'; status.setAttribute('role', 'status');
  const progress = document.createElement('progress'); progress.setAttribute('aria-label', '更新のダウンロード');
  const button = document.createElement('button'); button.type = 'button'; button.className = 'update-btn covo-button covo-button-small';
  const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'covo-button covo-button-secondary covo-button-small'; dismiss.textContent = 'あとで';
  dismiss.onclick = () => { panel.hidden = true; };
  panel.append(status, progress, button, dismiss); document.body.append(panel);
  const controller = createUpdateController({
    check: async options => (await import('../vendor/desktop-updater.js')).check(options), busy,
    changed(state) {
      window.__bgDownloading = state.phase === 'downloading'; window.__bgDownloaded = state.phase === 'ready';
      if (['available', 'ready', 'error'].includes(state.phase)) panel.hidden = false;
      status.textContent = ({ checking: '更新を確認中…', current: '最新バージョンです', available: `v${state.version} をダウンロードできます`, downloading: `v${state.version} をダウンロード中…`, ready: `v${state.version} を再起動して適用できます`, installing: '更新を適用中…', error: state.error })[state.phase] || '';
      progress.hidden = state.phase !== 'downloading';
      if (state.total) { progress.max = state.total; progress.value = state.downloaded; } else progress.removeAttribute('value');
      button.textContent = state.phase === 'ready' ? '再起動して更新' : state.phase === 'error' ? '再確認' : 'ダウンロード';
      button.disabled = ['checking', 'downloading', 'installing'].includes(state.phase);
      button.onclick = () => (state.phase === 'ready' ? controller.apply() : state.phase === 'error' ? controller.check() : controller.download()).catch(error => notify(error.message, 'warning'));
    }
  });
  window.covoUpdater = controller;
  window.covoCheckUpdate = async (manual = false) => {
    let required = false;
    try { assertSupportedClient(); } catch (_) { required = true; }
    if (!manual && (navigator.onLine === false || (!required && localStorage.getItem('covo_ignore_force_update') === '1'))) return false;
    const found = await controller.check();
    if (found && !busy()) await controller.download();
    if (manual && !found) notify('現在提供されている最新バージョンです。');
    return found;
  };
  const resume = async () => {
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
