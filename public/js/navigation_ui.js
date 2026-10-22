export function installNavigationUI({ conversations, openConversation, openSearch, moveChannel, cancelRecording, closeOverlay }) {
  let returnFocus = null;
  const showSwitcher = () => {
    const existing = document.getElementById('quickConversationSwitcher');
    if (existing) { existing.close(); return; }
    returnFocus = document.activeElement;
    const dialog = document.createElement('div'); dialog.id = 'quickConversationSwitcher'; dialog.className = 'covo-quick-switcher'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', '会話を切り替える');
    const events = new AbortController();
    const heading = document.createElement('div'); heading.className = 'covo-switcher-heading';
    const title = document.createElement('span'); title.textContent = '会話を切り替える';
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'covo-icon-button'; dismiss.setAttribute('aria-label', '会話の切替を閉じる'); dismiss.textContent = '×';
    heading.append(title, dismiss);
    const input = document.createElement('input'); input.placeholder = 'チャンネル名・DMを検索'; input.setAttribute('aria-label', input.placeholder);
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-controls', 'quickConversationResults'); input.setAttribute('aria-autocomplete', 'list');
    const results = document.createElement('div'); results.id = 'quickConversationResults'; results.setAttribute('role', 'listbox'); results.setAttribute('aria-label', '会話'); let selected = 0, entries = [];
    const hint = document.createElement('p'); hint.className = 'covo-switcher-hint'; hint.textContent = '↑ ↓ で選択 · Enter で移動 · Esc で閉じる';
    const close = () => { events.abort(); dialog.remove(); if (returnFocus?.isConnected) returnFocus.focus(); };
    dialog.close = close; dismiss.onclick = close;
    const render = () => {
      entries = conversations().filter(item => item.name.toLowerCase().includes(input.value.toLowerCase())).slice(0, 30);
      selected = Math.max(0, Math.min(selected, entries.length - 1)); results.replaceChildren();
      if (!entries.length) {
        const empty = document.createElement('p'); empty.className = 'covo-switcher-empty'; empty.setAttribute('role', 'status'); empty.textContent = '一致する会話が見つかりません'; results.appendChild(empty); input.removeAttribute('aria-activedescendant');
      }
      entries.forEach((entry, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = entry.name; button.className = index === selected ? 'selected' : ''; button.tabIndex = -1;
        button.id = `quick-conversation-${index}`; button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(index === selected));
        button.onclick = () => { close(); openConversation(entry); }; results.appendChild(button);
        if (index === selected) { input.setAttribute('aria-activedescendant', button.id); button.scrollIntoView({ block: 'nearest' }); }
      });
    };
    input.oninput = () => { selected = 0; render(); };
    dialog.onkeydown = event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.target === input && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); selected = Math.max(0, Math.min(entries.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1))); render(); }
      if (event.target === input && event.key === 'Enter' && entries[selected]) { event.preventDefault(); close(); openConversation(entries[selected]); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'Tab') { event.preventDefault(); (document.activeElement === input ? dismiss : input).focus(); }
    };
    dialog.append(heading, input, results, hint); document.body.appendChild(dialog); render(); input.focus();
    document.addEventListener('pointerdown', event => { if (!dialog.contains(event.target)) close(); }, { signal: events.signal });
  };
  document.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229 || event.defaultPrevented) return;
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') { event.preventDefault(); event.stopImmediatePropagation(); showSwitcher(); }
    else if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'f') { event.preventDefault(); event.stopImmediatePropagation(); openSearch(); }
    else if (event.altKey && !event.ctrlKey && !event.metaKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); moveChannel(event.key === 'ArrowDown' ? 1 : -1); }
    else if (event.key === 'Escape' && !document.getElementById('quickConversationSwitcher')) {
      if (closeOverlay() || cancelRecording()) { event.preventDefault(); event.stopImmediatePropagation(); }
    }
  }, true);
  const visibility = () => document.body.classList.toggle('covo-background', document.visibilityState === 'hidden');
  document.addEventListener('visibilitychange', visibility); visibility();
}
