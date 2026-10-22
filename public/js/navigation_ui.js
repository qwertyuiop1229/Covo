export function installNavigationUI({ conversations, openConversation, openSearch, moveChannel, cancelRecording, closeOverlay }) {
  let returnFocus = null;
  const showSwitcher = () => {
    document.getElementById('quickConversationSwitcher')?.remove();
    returnFocus = document.activeElement;
    const dialog = document.createElement('div'); dialog.id = 'quickConversationSwitcher'; dialog.className = 'covo-quick-switcher'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', '会話を切り替える');
    const input = document.createElement('input'); input.placeholder = 'チャンネル名・DMを検索'; input.setAttribute('aria-label', input.placeholder);
    const results = document.createElement('div'); let selected = 0, entries = [];
    const close = () => { dialog.remove(); returnFocus?.focus(); };
    const render = () => {
      entries = conversations().filter(item => item.name.toLowerCase().includes(input.value.toLowerCase())).slice(0, 30);
      selected = Math.max(0, Math.min(selected, entries.length - 1)); results.replaceChildren();
      entries.forEach((entry, index) => {
        const button = document.createElement('button'); button.textContent = entry.name; button.className = index === selected ? 'selected' : ''; button.tabIndex = -1;
        button.onclick = () => { close(); openConversation(entry); }; results.appendChild(button);
      });
    };
    input.oninput = () => { selected = 0; render(); };
    dialog.onkeydown = event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); selected = Math.max(0, Math.min(entries.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1))); render(); }
      if (event.key === 'Enter' && entries[selected]) { event.preventDefault(); close(); openConversation(entries[selected]); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'Tab') { event.preventDefault(); input.focus(); }
    };
    dialog.append(input, results); document.body.appendChild(dialog); render(); input.focus();
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
