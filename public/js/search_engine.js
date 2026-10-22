export function parseSearch(query) {
  const filters = { terms: [], from: [], in: [], before: null, after: null, hasFile: false };
  const date = (value, inclusive) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日付は YYYY-MM-DD で指定してください');
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) throw new Error('日付が無効です');
    if (inclusive) parsed.setDate(parsed.getDate() + 1);
    return parsed.getTime();
  };
  for (const match of String(query).matchAll(/(?:(from|in|before|after|has):)?(?:"([^"]*)"|(\S+))/g)) {
    const [, key, quoted, raw] = match;
    const value = (quoted ?? raw).toLowerCase();
    if (key === 'from' || key === 'in') filters[key].push(value.replace(/^[@#]/, ''));
    else if (key === 'before') filters.before = date(value, true);
    else if (key === 'after') filters.after = date(value, false);
    else if (key === 'has' && value === 'file') filters.hasFile = true;
    else filters.terms.push(key ? `${key}:${value}` : value);
  }
  return filters;
}

export function matchesSearch(message, filters, { timestamp, userId, roomId, roomName = '' } = {}) {
  const nickname = String(message.senderNickname || message.senderName || message.userNickname || '').toLowerCase();
  if (filters.from.length && !filters.from.some(from => from === String(message.senderId).toLowerCase() || from === nickname || from === 'me' && message.senderId === userId)) return false;
  if (filters.in.length && !filters.in.some(room => room === String(roomId).toLowerCase() || room === roomName.toLowerCase())) return false;
  if (filters.hasFile && !(message.fileData || message.kvFileUrl || message.fileName)) return false;
  if (filters.before != null && !(timestamp < filters.before)) return false;
  if (filters.after != null && !(timestamp >= filters.after)) return false;
  const haystack = `${message.text || message._decryptedText || ''}\n${nickname}\n${message.fileName || ''}`.toLowerCase();
  return filters.terms.every(term => haystack.includes(term));
}

// Concurrent searches reuse ciphertext fetches; each query still decrypts and filters independently.
export function createFetchCoalescer() {
  const pending = new Map();
  return (key, fetch) => {
    if (pending.has(key)) return pending.get(key);
    const task = Promise.resolve().then(fetch).finally(() => { if (pending.get(key) === task) pending.delete(key); });
    pending.set(key, task);
    return task;
  };
}
