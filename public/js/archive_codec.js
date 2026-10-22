const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const encode64 = buffer => {
  const bytes = new Uint8Array(buffer);
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
};
const decode64 = text => Uint8Array.from(atob(text), character => character.charCodeAt(0));
export function safeArchiveUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch (_) { return ''; }
}
export function validateArchive(container) {
  if (!container || container.covoBackup !== true || ![1, 2].includes(container.version)) throw new Error('未対応のバックアップ形式です');
  const iterations = container.version === 1 ? 100000 : container.iterations;
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) throw new Error('バックアップの暗号化設定が無効です');
  if (typeof container.data !== 'string' || container.data.length > MAX_ARCHIVE_BYTES * 1.4) throw new Error('バックアップのサイズが大きすぎます');
  const salt = decode64(container.salt), iv = decode64(container.iv);
  if (salt.length !== 16 || iv.length !== 12) throw new Error('バックアップの暗号化情報が無効です');
  return { iterations, salt, iv };
}
async function keyFor(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encodeArchive(payload, passphrase) {
  if (passphrase.length < 8) throw new Error('パスフレーズは8文字以上で設定してください');
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error('バックアップは128MiB以下に分けてください');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iterations = 310000;
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(passphrase, salt, iterations), bytes);
  return { covoBackup: true, version: 2, iterations, salt: encode64(salt), iv: encode64(iv), data: encode64(data), exportedAt: Date.now(), roomName: String(payload.roomName || 'アーカイブ').slice(0, 200) };
}
export async function decodeArchive(container, passphrase) {
  const { iterations, salt, iv } = validateArchive(container);
  const buffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await keyFor(passphrase, salt, iterations), decode64(container.data));
  const payload = JSON.parse(new TextDecoder().decode(buffer));
  if (!Array.isArray(payload.messages) || payload.messages.length > 100000) throw new Error('バックアップの履歴が無効です');
  payload.messages = payload.messages.map((message, index) => {
    if (!message || typeof message !== 'object') throw new Error('メッセージ形式が無効です');
    const clean = { ...message, id: /^[A-Za-z0-9_-]{1,160}$/.test(message.id) ? message.id : `archive_${index}` };
    delete clean._decryptedFileUrl;
    for (const key of ['fileData', 'kvFileUrl', 'senderAvatarUrl']) if (clean[key]) clean[key] = safeArchiveUrl(clean[key]);
    if (typeof clean.text !== 'string' && clean.text != null) clean.text = '';
    return clean;
  });
  return payload;
}
export const encodeArchiveBytes = encode64;
export const decodeArchiveBytes = decode64;
