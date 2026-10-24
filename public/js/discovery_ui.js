export function createDiscoveryCard(server, open) {
  const name = String(server.name || server.id || 'サーバー');
  const card = document.createElement('article'); card.className = 'discord-server-card'; card.tabIndex = 0;
  card.dataset.serverName = name.toLocaleLowerCase(); card.setAttribute('aria-label', name);
  const icon = document.createElement('div'); icon.className = 'discord-card-icon rounded-full overflow-hidden flex items-center justify-center';
  if (typeof server.iconUrl === 'string' && /^https?:\/\//i.test(server.iconUrl)) {
    const image = document.createElement('img'); image.src = server.iconUrl; image.alt = ''; image.loading = 'lazy'; image.className = 'w-full h-full object-cover';
    image.onerror = () => { icon.textContent = name.charAt(0).toUpperCase(); }; icon.append(image);
  } else icon.textContent = name.charAt(0).toUpperCase();
  const info = document.createElement('div'); info.className = 'discord-card-info';
  const title = document.createElement('strong'); title.className = 'block truncate'; title.textContent = name;
  const members = document.createElement('p'); members.className = 'discord-card-members';
  const count = Array.isArray(server.joinedUsers) ? server.joinedUsers.length : Object.values(server.joinedUsers || {}).filter(Boolean).length;
  members.textContent = `${count}名のメンバー`; info.append(title, members);
  const button = document.createElement('button'); button.type = 'button'; button.className = 'discord-card-btn'; button.textContent = '開く'; button.setAttribute('aria-label', `${name}を開く`);
  card.append(icon, info, button);
  card.onclick = () => open(server);
  card.onkeydown = event => { if (event.target === card && ['Enter', ' '].includes(event.key) && !event.isComposing) { event.preventDefault(); open(server); } };
  return card;
}

export function installDiscoveryFilter(grid, input, status) {
  if (!grid || !input) return;
  let empty = grid.querySelector('.covo-discovery-filter-empty');
  if (!empty) { empty = document.createElement('p'); empty.className = 'covo-discovery-empty covo-discovery-filter-empty'; empty.textContent = '一致するサーバーはありません。検索語を変えてください。'; grid.append(empty); }
  const filter = () => {
    const query = input.value.trim().toLocaleLowerCase(); let visible = 0;
    const cards = grid.querySelectorAll('.discord-server-card');
    for (const card of cards) { card.hidden = !card.dataset.serverName.includes(query); if (!card.hidden) visible++; }
    empty.hidden = !query || visible > 0;
    if (status) status.textContent = `${visible}件のサーバー${query ? 'が一致' : ''}`;
  };
  input.oninput = filter;
  input.onkeydown = event => { if (event.key === 'Escape' && input.value) { event.stopPropagation(); input.value = ''; filter(); } };
  filter();
}
