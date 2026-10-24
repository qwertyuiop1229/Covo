export function canManageServerProfile(server, uid, globalAdmin = false) {
  return Boolean(uid && server && (globalAdmin || server.createdBy === uid || (Array.isArray(server.serverAdmins) && server.serverAdmins.includes(uid))));
}

export function normalizeServerName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('サーバー名は空白以外の1〜100文字で入力してください。');
  return name;
}

export async function saveServerName({ target, name, getOwner, transact, globalAdmin = false }) {
  name = normalizeServerName(name);
  if (!target?.uid || getOwner() !== target.uid) throw new Error('アカウントが変更されました。設定を開き直してください。');
  if (name === target.name) return { name, changed: false };
  let changed = false;
  await transact(target.id, async (server, update) => {
    changed = false;
    if (getOwner() !== target.uid) throw new Error('アカウントが変更されました。');
    if (!canManageServerProfile(server, target.uid, globalAdmin)) throw new Error('サーバーを変更する権限がありません。');
    if (server.name !== target.name && server.name !== name) throw new Error('別の端末でサーバー名が変更されました。設定を開き直してください。');
    if (server.name !== name) { update({ name }); changed = true; }
  });
  return { name, changed };
}

export function createServerProfileEditor({ getOwner, transact, applied, confirmDiscard }) {
  const input = document.getElementById('renameServerInput'), save = document.getElementById('renameServerBtn');
  const reset = document.getElementById('resetServerProfileBtn'), bar = document.getElementById('serverProfileSaveBar');
  const status = document.getElementById('serverProfileStatus');
  let target = null, generation = 0, saving = false, closing = null;
  const dirty = () => Boolean(target && input.value.trim() !== target.name);
  function render() {
    bar.hidden = !dirty() && !saving;
    save.disabled = !target?.allowed || saving || !dirty();
    reset.disabled = saving; input.disabled = !target?.allowed || saving;
    const icon = document.getElementById('serverProfileIconBtn'); if (icon) icon.disabled = !target?.allowed || saving;
    save.textContent = saving ? '保存中…' : '変更を保存';
  }
  input.addEventListener('input', () => { status.textContent = ''; input.setAttribute('aria-invalid', 'false'); render(); });
  reset.onclick = () => { if (target && !saving) { input.value = target.name; input.setAttribute('aria-invalid', 'false'); status.textContent = '変更を取り消しました。'; render(); } };
  save.onclick = async () => {
    if (!target?.allowed || saving) return;
    const selected = { ...target }, current = generation;
    saving = true; status.textContent = ''; render();
    try {
      const result = await saveServerName({ target: selected, name: input.value, getOwner, transact, globalAdmin: selected.globalAdmin });
      if (current !== generation || getOwner() !== selected.uid) return;
      target.name = result.name; input.value = result.name; input.setAttribute('aria-invalid', 'false'); status.textContent = 'サーバー名を保存しました。';
      applied(selected.id, result.name);
    } catch (error) {
      if (current === generation) { status.textContent = error.message || '保存できませんでした。接続と権限を確認してください。'; input.setAttribute('aria-invalid', 'true'); }
    } finally { if (current === generation) { saving = false; render(); } }
  };
  return {
    open({ id, uid, server, globalAdmin }) {
      generation++; saving = false;
      target = { id, uid, name: String(server?.name || id), globalAdmin, allowed: canManageServerProfile(server, uid, globalAdmin) };
      input.value = target.name; input.setAttribute('aria-invalid', 'false'); status.textContent = target.allowed ? '' : '概要の閲覧のみ可能です。変更できるのはサーバー管理者です。'; render();
    },
    async close(close) {
      if (closing) return closing;
      if (saving) { status.textContent = '保存の完了を待ってから閉じてください。'; return false; }
      const current = generation;
      const pending = (async () => {
        if (dirty() && !await confirmDiscard()) return false;
        if (current !== generation) return false;
        generation++; target = null; close(); return true;
      })();
      closing = pending;
      try { return await pending; } finally { if (closing === pending) closing = null; }
    }
  };
}
