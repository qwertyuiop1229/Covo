import { assertSupportedClient } from './client_protocol.js';
export function assertDatabaseWriteAllowed() {
  assertSupportedClient();
  if (typeof window !== 'undefined' && window.covoMaintenanceBlocked) { const error = new Error('ただいまメンテナンス中です。'); error.code = 'covo/maintenance'; throw error; }
}
// No payloads or credentials are recorded here. Counters stay on this device.
export const traffic = {
  startedAt: Date.now(), counters: Object.create(null), listeners: Object.create(null),
  count(name, amount = 1) { this.counters[name] = (this.counters[name] || 0) + amount; },
  snapshot() { return { startedAt: this.startedAt, counters: { ...this.counters }, listeners: { ...this.listeners } }; },
  reset() { this.startedAt = Date.now(); this.counters = Object.create(null); }
};
if (typeof window !== 'undefined') window.covoTraffic = traffic;

// Only successful writes are remembered. Concurrent changes are drained in order;
// a failed request must not suppress the next retry, or overwrite a newer state.
export function createStatePublisher(write) {
  let confirmed, pending, running;
  return function publish(key, value) {
    if (!running && key === confirmed) return Promise.resolve();
    pending = { key, value };
    if (!running) {
      // Start after assigning running, and clear it inside the drain itself.
      // A separate Promise.finally leaves a microtask gap where a new pending
      // value can be accepted after the loop has already finished.
      running = Promise.resolve().then(async () => {
        let failure;
        try {
          while (pending) {
            const next = pending;
            pending = null;
            if (next.key === confirmed) continue;
            try { await write(next.value); confirmed = next.key; }
            catch (error) { failure = error; }
          }
          if (failure) throw failure;
        } finally { running = null; }
      });
    }
    return running;
  };
}

export function usesRealtimeOnly(message) { return Number(message?.storageVersion) >= 2; }
export function metadataRefersToMessage(metadata, messageId, messageTimestamp, metadataTimestamp) {
  if (!metadata || !(messageTimestamp > 0) || metadataTimestamp !== messageTimestamp) return false;
  // Older clients update lastMessageAt without clearing newer format fields.
  // Only trust the ID when its paired timestamp still identifies this update.
  return Number(metadata.lastMessageStorageTimestamp) === metadataTimestamp && metadata.lastMessageId
    ? metadata.lastMessageId === messageId : true;
}
export function requiredMessageBackends(entry) {
  // A previously acknowledged legacy FS body is retained, never mirrored anew.
  return !usesRealtimeOnly(entry.data) && entry.ack?.firestore ? ['firestore'] : ['rtdb'];
}

export function selectWindowsInstaller(assets) {
  if (!Array.isArray(assets)) return undefined;
  return assets.find(asset => asset?.name?.toLowerCase() === 'covosetup.exe') ||
    assets.find(asset => typeof asset?.name === 'string' && asset.name.toLowerCase().endsWith('.exe'));
}

export function missingProfileFields(current, candidate) {
  return Object.fromEntries(Object.entries(candidate).filter(([key, value]) =>
    value !== undefined && !Object.prototype.hasOwnProperty.call(current || {}, key)));
}

export async function fetchWithTimeout(fetcher, url, options, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetcher(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

// Preserve unchanged subscribers, including the SDK's cached/live stream state.
export function createSubscriptionRegistry() {
  const subscriptions = new Map();
  return {
    reconcile(keys, subscribe) {
      const wanted = new Set(keys);
      for (const [key, stop] of subscriptions) if (!wanted.has(key)) { stop(); subscriptions.delete(key); }
      for (const key of wanted) if (!subscriptions.has(key)) {
        let stop, invalidated = false;
        const cleanup = () => { invalidated = true; stop?.(); };
        subscriptions.set(key, cleanup);
        try { stop = subscribe(key); if (invalidated) stop?.(); }
        catch (error) { subscriptions.delete(key); throw error; }
      }
    },
    invalidate(key) { const stop = subscriptions.get(key); subscriptions.delete(key); stop?.(); },
    clear() { for (const stop of subscriptions.values()) stop(); subscriptions.clear(); },
    get size() { return subscriptions.size; }
  };
}
