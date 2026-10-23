// Local archive controls use the app's shared modal, toast and confirmation UI.
export function installLocalArchiveUI({ account, store, openArchive, alertMessage, confirm, openModal }) {
  const modal = document.getElementById('localArchivesPanel');
  const list = document.getElementById('localArchivesList');
  const count = document.getElementById('localArchivesCount');
  let generation = 0, opened = null, reading = null;
  const finishRead = request => {
    if (!request || reading !== request) return;
    reading = null;
    if (request.trigger?.tagName === 'BUTTON') { request.trigger.disabled = request.wasDisabled; request.trigger.removeAttribute('aria-busy'); }
  };
  const close = (restoreFocus = true) => {
    ++generation;
    finishRead(reading);
    const previous = opened; opened = null;
    previous?.events.abort();
    modal.classList.add('hidden'); list.replaceChildren();
    if (restoreFocus && previous?.trigger?.isConnected && previous.trigger.getClientRects().length) previous.trigger.focus();
  };
  modal.close = () => close();
  modal.querySelectorAll('[data-close-archives]').forEach(button => { button.onclick = () => close(); });
  modal.onclick = event => { if (event.target === modal) close(); };
  const open = async (trigger = document.activeElement) => {
    const owner = account();
    if (!owner) return;
    close(false);
    const request = generation;
    const valid = () => owner === account() && request === generation;
    const readState = { trigger, wasDisabled: Boolean(trigger?.disabled) }; reading = readState;
    if (trigger?.tagName === 'BUTTON') { trigger.disabled = true; trigger.setAttribute('aria-busy', 'true'); }
    try {
      const archives = await store.getSettingsByPrefix('archive:', { throwOnError: true });
      if (!valid()) return;
      if (!archives.length) {
        alertMessage('この端末に保存されたアーカイブはありません。復号ビューアからバックアップを開くと追加できます。', 'info');
        return;
      }
      const events = new AbortController();
      const state = { owner, trigger, events, busy: false };
      opened = state;
      const active = () => opened === state && valid();
      const updateCount = () => { count.textContent = `${list.children.length}件のアーカイブ`; };
      const buttons = () => list.querySelectorAll('button');
      for (const archive of [...archives].sort((a, b) => (Number(b.value?.exportedAt) || 0) - (Number(a.value?.exportedAt) || 0))) {
        const row = document.createElement('div'); row.className = 'local-archive-row';
        const icon = document.createElement('span'); icon.className = 'local-archive-icon'; icon.innerHTML = '<i class="fas fa-file-shield" aria-hidden="true"></i>';
        const details = document.createElement('div'); details.className = 'local-archive-details';
        const title = document.createElement('strong'); title.textContent = String(archive.value?.roomName || 'アーカイブ').slice(0, 200);
        const date = new Date(archive.value?.exportedAt);
        const metadata = document.createElement('span'); metadata.textContent = Number.isFinite(date.getTime()) ? date.toLocaleString('ja-JP') : '保存日時不明';
        details.append(title, metadata);
        const actions = document.createElement('div'); actions.className = 'local-archive-actions';
        const view = document.createElement('button'); view.type = 'button'; view.className = 'covo-button covo-button-secondary'; view.textContent = '開く';
        view.setAttribute('aria-label', `${title.textContent}を開く`);
        view.onclick = async () => {
          if (!active() || state.busy) return;
          close();
          try { await openArchive(archive.value); }
          catch (error) { if (owner === account()) alertMessage(error?.message || 'アーカイブを開けませんでした', 'error'); }
        };
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'covo-button covo-button-danger'; remove.textContent = '削除';
        remove.setAttribute('aria-label', `${title.textContent}を端末から削除`);
        remove.onclick = async () => {
          if (!active() || state.busy) return;
          state.busy = true; buttons().forEach(button => { button.disabled = true; });
          try {
            const accepted = await confirm(`「${title.textContent}」をこの端末から削除しますか？`, '削除する', 'キャンセル', 'バックアップファイルやサーバー上の会話は削除されません。');
            if (!accepted || !active()) return;
            const deleted = await store.deleteSetting(archive.key);
            if (!active()) return;
            if (deleted === false) throw new Error('アーカイブを削除できませんでした。もう一度お試しください。');
            row.remove(); updateCount();
            alertMessage('アーカイブをこの端末から削除しました', 'success');
            if (!list.children.length) close();
          } catch (error) {
            if (active()) alertMessage(error?.message || 'アーカイブを削除できませんでした', 'error');
          } finally {
            state.busy = false;
            if (active()) {
              buttons().forEach(button => { button.disabled = false; });
              (remove.isConnected ? remove : list.querySelector('button'))?.focus();
            }
          }
        };
        actions.append(view, remove); row.append(icon, details, actions); list.appendChild(row);
      }
      updateCount(); openModal(modal);
      modal.addEventListener('keydown', event => {
        if (event.isComposing || !active()) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key === 'Tab') {
          const focusable = [...modal.querySelectorAll('button:not(:disabled)')];
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }, { signal: events.signal });
      modal.querySelector('[data-close-archives]')?.focus();
    } catch (error) {
      if (valid()) alertMessage('端末のアーカイブを読み込めませんでした。もう一度お試しください。', 'error');
    } finally {
      finishRead(readState);
    }
  };
  return { open, close };
}
