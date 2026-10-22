import { getMsgTimestamp } from './utils.js';

export function compareHistoryMessages(a, b) {
  const time = getMsgTimestamp(a) - getMsgTimestamp(b);
  if (time) return time;
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
}

// Appending older rows at the end of the inverted timeline does not move existing rows.
export function olderHistoryScrollTop(previousTop) { return previousTop; }

export function countNewerMessages(messages, previousNewestId) {
  if (!previousNewestId) return 0;
  const index = messages.findIndex(message => message.id === previousNewestId);
  return index < 0 ? 0 : messages.length - index - 1;
}

export class HistoryLoadGate {
  constructor() { this.reset(); }
  reset() { this.armed = true; }
  intent(loading) { if (!loading) this.armed = true; }
  take(distance, loading) {
    if (distance >= 350) this.armed = true;
    if (loading || distance >= 300 || !this.armed) return false;
    this.armed = false;
    return true;
  }
}

// A bounded session ledger: identical message IDs must not become new after a focus change.
export class NotificationLedger {
  constructor(limit = 2048) { this.limit = limit; this.keys = new Set(); }
  claim(key) {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    while (this.keys.size > this.limit) this.keys.delete(this.keys.values().next().value);
    return true;
  }
  clear() { this.keys.clear(); }
}

export function microphoneErrorMessage(error) {
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name)) {
    return 'マイクへのアクセスが許可されていません。SafariのWebサイト設定と端末のマイク権限を確認し、この画面の録音ボタンから再試行してください。';
  }
  if (error?.name === 'NotFoundError') return '利用できるマイクがありません。接続と端末の設定を確認してください。';
  if (error?.name === 'NotReadableError') return 'マイクを開始できません。他のアプリでの使用状況を確認してください。';
  return null;
}

export class AttachmentResources {
  constructor(createUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url), maxBytes = 64 * 1024 * 1024) {
    this.createUrl = createUrl;
    this.revokeUrl = revokeUrl;
    this.generation = 0;
    this.pending = new Map();
    this.urls = new Set();
    this.messages = new Set();
    this.entries = new Map();
    this.maxBytes = maxBytes;
  }
  async resolve(message, loadBlob) {
    const key = message.fileData || message.kvFileUrl;
    const generation = this.generation;
    if (!this.pending.has(key)) {
      const task = Promise.resolve().then(loadBlob).then(blob => {
        if (generation !== this.generation) throw new DOMException('Channel changed', 'AbortError');
        const url = this.createUrl(blob);
        this.urls.add(url);
        this.entries.set(key, { url, size: blob.size, used: Date.now() });
        return url;
      });
      this.pending.set(key, task);
      task.catch(() => { if (this.pending.get(key) === task) this.pending.delete(key); });
    }
    const url = await this.pending.get(key);
    if (generation !== this.generation) throw new DOMException('Channel changed', 'AbortError');
    message._decryptedFileUrl = url;
    const entry = this.entries.get(key);
    if (entry) entry.used = Date.now();
    this.messages.add(message);
    return url;
  }
  prune(activeUrls = new Set()) {
    let bytes = [...this.entries.values()].reduce((sum, entry) => sum + entry.size, 0);
    for (const [key, entry] of [...this.entries].sort((a, b) => a[1].used - b[1].used)) {
      if (bytes <= this.maxBytes) break;
      if (activeUrls.has(entry.url)) continue;
      this.revokeUrl(entry.url);
      this.urls.delete(entry.url);
      this.pending.delete(key);
      this.entries.delete(key);
      bytes -= entry.size;
      for (const message of this.messages) if (message._decryptedFileUrl === entry.url) { delete message._decryptedFileUrl; this.messages.delete(message); }
    }
  }
  clear() {
    this.generation++;
    for (const url of this.urls) this.revokeUrl(url);
    for (const message of this.messages) delete message._decryptedFileUrl;
    this.pending.clear();
    this.urls.clear();
    this.messages.clear();
    this.entries.clear();
  }
}
