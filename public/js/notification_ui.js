// Preferences remain account-owned; this module only manages the view and its lifecycle.
export function installConversationNotificationUI({ header, target, preferences, save }) {
  const button = document.createElement('button');
  button.id = 'conversationNotificationButton';
  button.type = 'button';
  button.className = 'topbar-btn conversation-notification-button';
  button.innerHTML = '<i class="fas fa-bell" aria-hidden="true"></i><span>通知</span>';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-controls', 'conversationNotificationSettings');
  button.setAttribute('aria-expanded', 'false');
  const actions = header.querySelector('#currentRoomActions') || header;
  actions.insertBefore(button, actions.querySelector('#toggleMembersSidebarBtn'));
  let opened = null;
  const identity = value => JSON.stringify([value.owner, value.server, value.room, value.session]);
  const modeFor = value => preferences().channels?.[value.key] || preferences().servers?.[value.server] || 'all';
  const close = (restoreFocus = true) => {
    if (!opened) return;
    const previous = opened; opened = null;
    previous.events.abort(); previous.panel.remove();
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus && button.isConnected && !button.hidden) button.focus();
  };
  const refresh = () => {
    const value = target();
    button.hidden = !value.owner || !value.room;
    const mode = modeFor(value), label = { all: 'すべてのメッセージ', mentions: 'メンションのみ', none: '通知しない' }[mode] || 'すべてのメッセージ';
    button.dataset.mode = mode;
    button.querySelector('i').className = `fas fa-${mode === 'none' ? 'bell-slash' : 'bell'}`;
    button.title = `この会話の通知設定：${label}`;
    button.setAttribute('aria-label', button.title);
    if (opened && identity(value) !== opened.identity) close(false);
    if (opened && !opened.saving) opened.sync();
  };
  button.onclick = () => {
    if (opened) { close(); return; }
    const value = target();
    if (!value.owner || !value.room) return;
    const panel = document.createElement('section');
    panel.id = 'conversationNotificationSettings'; panel.className = 'covo-settings-popover covo-notification-settings';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'conversationNotificationTitle');
    const events = new AbortController();
    const state = { panel, events, identity: identity(value), saving: false, sync: () => {} };
    opened = state;
    panel.close = () => close();
    button.setAttribute('aria-expanded', 'true');
    const heading = document.createElement('div'); heading.className = 'covo-popover-heading';
    const title = document.createElement('strong'); title.id = 'conversationNotificationTitle'; title.textContent = '通知設定';
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'covo-icon-button';
    dismiss.classList.add('topbar-btn');
    dismiss.setAttribute('aria-label', '通知設定を閉じる'); dismiss.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>'; dismiss.onclick = () => close();
    heading.append(title, dismiss); panel.appendChild(heading);
    const description = document.createElement('p'); description.className = 'covo-popover-description';
    description.textContent = value.server ? '会話ごとに受け取る通知を選べます。' : 'このDMで受け取る通知を選べます。'; panel.appendChild(description);
    const inputs = [];
    const choices = [['all', 'すべてのメッセージ'], ...(value.server ? [['mentions', 'メンションのみ']] : []), ['none', '通知しない']];
    const status = document.createElement('p'); status.className = 'covo-preference-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const active = () => opened === state && identity(target()) === state.identity;
    const addGroup = (titleText, group, key, inherit) => {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend'); legend.textContent = titleText; fieldset.appendChild(legend);
      const available = [...(inherit ? [['inherit', 'サーバー設定に合わせる']] : []), ...choices];
      for (const [mode, text] of available) {
        const label = document.createElement('label'); label.className = 'covo-notification-choice';
        const radio = document.createElement('input'); radio.type = 'radio'; radio.name = `notification-${group}`; radio.value = mode;
        const span = document.createElement('span'); span.textContent = text; label.append(radio, span); fieldset.appendChild(label);
        inputs.push({ radio, group, key, fallback: inherit ? 'inherit' : 'all' });
        radio.onchange = async () => {
          if (!radio.checked || state.saving || !active()) return;
          const previous = preferences()[group]?.[key] || (inherit ? 'inherit' : 'all');
          state.saving = true; inputs.forEach(item => { item.radio.disabled = true; });
          status.dataset.state = 'saving'; status.textContent = '保存中…';
          try {
            await save(value.owner, group, key, mode);
            if (!active()) return;
            status.dataset.state = 'success'; status.textContent = '通知設定を保存しました';
            refresh();
          } catch (_) {
            if (!active()) return;
            inputs.filter(item => item.group === group).forEach(item => { item.radio.checked = item.radio.value === previous; });
            status.dataset.state = 'error'; status.textContent = '保存できませんでした。接続を確認してもう一度選択してください。';
          } finally {
            state.saving = false;
            if (active()) { inputs.forEach(item => { item.radio.disabled = false; }); radio.focus(); }
          }
        };
      }
      panel.appendChild(fieldset);
    };
    if (value.server) addGroup('サーバー全体', 'servers', value.server, false);
    addGroup(value.server ? 'このチャンネル' : 'このDM', 'channels', value.key, Boolean(value.server));
    state.sync = () => inputs.forEach(item => { item.radio.checked = item.radio.value === (preferences()[item.group]?.[item.key] || item.fallback); });
    state.sync(); panel.appendChild(status);
    document.body.appendChild(panel);
    const position = () => {
      const rect = button.getBoundingClientRect();
      const width = panel.getBoundingClientRect().width;
      panel.style.right = 'auto';
      panel.style.left = `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`;
      panel.style.top = `${Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - panel.offsetHeight - 12))}px`;
    };
    position();
    window.addEventListener('resize', position, { signal: events.signal });
    document.addEventListener('pointerdown', event => { if (!panel.contains(event.target) && !button.contains(event.target)) close(false); }, { signal: events.signal });
    document.addEventListener('focusin', event => { if (!panel.contains(event.target) && !button.contains(event.target)) close(false); }, { signal: events.signal });
    panel.addEventListener('keydown', event => { if (!event.isComposing && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }, { signal: events.signal });
    inputs.find(item => item.radio.checked)?.radio.focus();
  };
  refresh();
  return { refresh, close };
}
