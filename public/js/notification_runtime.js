import { parseNotificationTarget } from './loading_runtime.js';

export function notificationUrl(target) {
  const url = new URL('covo-notification://open');
  for (const key of ['ownerId', 'serverId', 'roomId', 'dmId']) if (target[key]) url.searchParams.set(key, target[key]);
  return url.href;
}

export function targetFromUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'covo-notification:' || url.hostname !== 'open' || url.username || url.password || url.port) return null;
    return Object.fromEntries(['ownerId', 'serverId', 'roomId', 'dmId'].map(key => [key, url.searchParams.get(key)]));
  } catch (_) { return null; }
}

export function createNotificationRouter({ uid, ready, focus, openServer, openDm }) {
  let generation = 0;
  return async input => {
    const mine = ++generation;
    await focus();
    const owner = uid();
    const target = parseNotificationTarget(input, owner);
    if (!target || !ready()) return false;
    if (mine !== generation || owner !== uid()) return false;
    if (target.serverId) await openServer(target.serverId, target.roomId);
    else await openDm(target.targetUid);
    return true;
  };
}

export function notificationMode(settings, serverId, roomId) {
  const modes = new Set(['all', 'mentions', 'none']);
  const channel = settings?.channels?.[serverId ? `${serverId}:${roomId}` : `dm:${roomId}`];
  const server = settings?.servers?.[serverId];
  return modes.has(channel) ? channel : modes.has(server) ? server : 'all';
}

export function allowsNotification(settings, serverId, roomId, mentioned = false) {
  const mode = notificationMode(settings, serverId, roomId);
  return mode === 'all' || (mode === 'mentions' && mentioned);
}
