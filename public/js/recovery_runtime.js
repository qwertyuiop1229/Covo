// Recovery diagnoses device storage without opening/creating old unscoped DBs,
// deleting keys, or clearing another account's encrypted history.
export async function inspectLocalStorage() {
  const limited = task => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('保存領域の確認がタイムアウトしました')), 4000);
    Promise.resolve().then(task).then(resolve, reject).finally(() => clearTimeout(timer));
  });
  const checks = await Promise.allSettled([
    limited(() => typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function' ? indexedDB.databases() : null),
    limited(() => typeof caches !== 'undefined' ? caches.keys() : null)
  ]);
  const databases = checks[0].status === 'fulfilled' ? checks[0].value : null;
  const cacheNames = checks[1].status === 'fulfilled' ? checks[1].value : null;
  let malformedSettings = 0;
  let settingsReadable = true;
  try { for (let index = 0; index < Math.min(localStorage.length, 500); index++) {
    const key = localStorage.key(index);
    const value = key && localStorage.getItem(key);
    if (value && /^[\[{]/.test(value)) { try { JSON.parse(value); } catch (_) { malformedSettings++; } }
  } } catch (_) { settingsReadable = false; }
  return { databases: databases?.length ?? null, caches: cacheNames?.length ?? null, malformedSettings, settingsReadable,
    partial: !databases || !cacheNames || !settingsReadable, viewport: window.covoViewport?.snapshot() || null };
}

export function recoveryNotice(message) {
  if (window.alertMessage) { window.alertMessage(message, 'info'); return; }
  let panel = document.getElementById('covoRecoveryNotice');
  if (!panel) {
    panel = document.createElement('div'); panel.id = 'covoRecoveryNotice'; panel.className = 'covo-settings-popover'; panel.setAttribute('role', 'status');
    const text = document.createElement('p'); text.className = 'covo-recovery-notice-text';
    const close = document.createElement('button'); close.type = 'button'; close.className = 'covo-button covo-button-secondary covo-button-small'; close.textContent = '閉じる'; close.onclick = () => panel.remove();
    panel.append(text, close); document.body.append(panel);
  }
  panel.querySelector('p').textContent = message;
}

export async function runRecoveryInspection() {
  const result = await inspectLocalStorage();
  recoveryNotice(`端末保存領域 ${result.databases ?? '確認不可'}件、キャッシュ ${result.caches ?? '確認不可'}件を確認しました。${result.malformedSettings ? `形式を確認できない設定が${result.malformedSettings}件あります。` : ''}暗号鍵と履歴は保持しています。`);
  return result;
}

export async function repairPresentation() {
  // Only transient failure hints. Never delete message/media caches, auth, keys or outbox.
  try { localStorage.removeItem('covo_missing_files_v3'); } catch (_) {}
  window.covoViewport?.refresh();
  if (typeof window.covoRepairLoading === 'function') {
    await window.covoRepairLoading();
    recoveryNotice('表示と接続を再確認しました。送信待ち・暗号鍵・端末の履歴は保持しています。');
    return { requested: true };
  }
  const event = window.__TAURI__?.event;
  if (event?.emitTo) {
    await event.emitTo('main', 'request-recovery-repair', {});
    await window.__TAURI__.core.invoke('show_main_window');
    recoveryNotice('メイン画面に修復を依頼しました。接続状況をメイン画面で確認してください。');
    return { requested: true };
  }
  recoveryNotice('一時的な読込失敗の記録を解除しました。アプリへ戻って表示を確認してください。');
  return { requested: false };
}
