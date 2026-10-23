// Recovery diagnoses device storage without opening/creating old unscoped DBs,
// deleting keys, or clearing another account's encrypted history.
export async function inspectLocalStorage() {
  const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
  const cacheNames = typeof caches !== 'undefined' ? await caches.keys() : [];
  let malformedSettings = 0;
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    const value = key && localStorage.getItem(key);
    if (value && /^[\[{]/.test(value)) { try { JSON.parse(value); } catch (_) { malformedSettings++; } }
  }
  return { databases: databases.length, caches: cacheNames.length, malformedSettings };
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
  recoveryNotice(`端末保存領域 ${result.databases}件、キャッシュ ${result.caches}件を確認しました。${result.malformedSettings ? `形式を確認できない設定が${result.malformedSettings}件あります。` : ''}暗号鍵と履歴は保持しています。`);
  return result;
}
