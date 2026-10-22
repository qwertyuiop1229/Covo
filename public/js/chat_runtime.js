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
  constructor(createUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url)) {
    this.createUrl = createUrl;
    this.revokeUrl = revokeUrl;
    this.generation = 0;
    this.pending = new Map();
    this.urls = new Set();
    this.messages = new Set();
  }
  async resolve(message, loadBlob) {
    const key = message.fileData || message.kvFileUrl;
    const generation = this.generation;
    if (!this.pending.has(key)) {
      const task = Promise.resolve().then(loadBlob).then(blob => {
        if (generation !== this.generation) throw new DOMException('Channel changed', 'AbortError');
        const url = this.createUrl(blob);
        this.urls.add(url);
        return url;
      });
      this.pending.set(key, task);
      task.catch(() => { if (this.pending.get(key) === task) this.pending.delete(key); });
    }
    const url = await this.pending.get(key);
    if (generation !== this.generation) throw new DOMException('Channel changed', 'AbortError');
    message._decryptedFileUrl = url;
    this.messages.add(message);
    return url;
  }
  clear() {
    this.generation++;
    for (const url of this.urls) this.revokeUrl(url);
    for (const message of this.messages) delete message._decryptedFileUrl;
    this.pending.clear();
    this.urls.clear();
    this.messages.clear();
  }
}
