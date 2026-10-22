// Only encrypted payloads/attachment references are persisted; plaintext previews stay in memory.
export function createOutbox({ uid, persist, write, changed, timeoutMs = 8000 }) {
  const running = new Map();
  async function attempt(envelope) {
    if (uid() !== envelope.ownerId) throw new Error('送信者が変更されました');
    if (running.has(envelope.id)) return running.get(envelope.id);
    const save = () => { if (uid() === envelope.ownerId) Promise.resolve(persist(envelope)).catch(() => {}); };
    envelope.state = 'sending';
    changed(envelope);
    save();
    let timer;
    const work = Promise.resolve().then(() => write(envelope, (backend) => {
      envelope.ack[backend] = true;
      save();
      if (uid() === envelope.ownerId) changed(envelope);
    })).then(() => {
      envelope.state = 'sent';
    }, error => {
      envelope.state = 'failed';
      envelope.error = String(error?.message || error);
    }).finally(() => {
      clearTimeout(timer);
      running.delete(envelope.id);
      save();
      if (uid() === envelope.ownerId) changed(envelope);
    });
    const result = Promise.race([work, new Promise(resolve => {
      timer = setTimeout(() => { envelope.state = 'waiting'; save(); if (uid() === envelope.ownerId) changed(envelope); resolve(); }, timeoutMs);
    })]).then(() => envelope);
    running.set(envelope.id, result);
    return result;
  }
  return { attempt, running };
}
