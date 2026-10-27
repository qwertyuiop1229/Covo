// Independent local/remote reads. A slow cache must never delay a realtime subscription.
export function createDecryptRecovery({pending,decrypt,render,active=()=>true,waiting=()=>{},delays=[2500,6000,12000]}) {
  let closed=false,work=null,timer=null,slow=null,attempt=0,dirty=false;
  const live=()=>!closed&&active();
  const run=(reset=false)=>{
    if(!live())return;
    if(reset){attempt=0;clearTimeout(timer);timer=null;}
    if(work){dirty=true;return work;}
    if(!pending().length)return;
    const records=pending();dirty=false;
    slow=setTimeout(()=>{if(live())waiting();},5000);
    work=Promise.resolve().then(()=>decrypt(records)).catch(()=>{if(live())waiting();}).finally(()=>{
      clearTimeout(slow);work=null;if(!live())return;
      render();
      if(dirty){dirty=false;run();return;}
      if(pending().length){waiting();if(attempt<delays.length)timer=setTimeout(()=>{timer=null;run();},delays[attempt++]);}
    });
    return work;
  };
  return {run,close(){closed=true;clearTimeout(timer);clearTimeout(slow);}};
}
export function startIndependentReads({ local, remote, apply, active = () => true, error = () => {} }) {
  let closed = false;
  let unsubscribe = null;
  const live = () => !closed && active();
  const publish = (records, source) => {
    if (!live()) return;
    try { apply(records, source); }
    catch (err) { error(err, 'apply'); }
  };
  Promise.resolve().then(() => local()).then(records => publish(records, 'local')).catch(err => { if (live()) error(err, 'local'); });
  Promise.resolve().then(() => remote(records => publish(records, 'remote'))).then(cleanup => {
    if (!live()) cleanup?.(); else unsubscribe = cleanup;
  }).catch(err => { if (live()) error(err, 'remote'); });
  return () => { closed = true; unsubscribe?.(); unsubscribe = null; };
}

export function mergeChannelRecords(current, incoming, protectedIds = new Set()) {
  const merged = new Map(current.map(record => [record.id, record]));
  for (const record of incoming || []) {
    if (!protectedIds.has(record.id)) {
      const old = merged.get(record.id);
      // Pending decrypts mutate the incoming object. Copy only a completed plaintext result;
      // copying an encrypted cache entry would detach the visible row from its async decrypt.
      const completed = old?._decrypted === true && typeof old.text === 'string' && !old.text.startsWith('enc::') &&
        typeof old._originalText === 'string' && old._originalText === record.text;
      merged.set(record.id, completed ? { ...old, ...record, text: old.text, _originalText: old._originalText, _decrypted: true } : record);
    }
  }
  return [...merged.values()];
}

export function withReadDeadline(promise, ms = 8000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('接続に時間がかかっています。再試行してください。'), { code: 'read-timeout' })), ms);
  })]).finally(() => clearTimeout(timer));
}

export function parseNotificationTarget(input, uid) {
  if (!input || !uid) return null;
  const valid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
  if (input.ownerId && input.ownerId !== uid) return null;
  if (valid(input.serverId) && valid(input.roomId)) return { serverId: input.serverId, roomId: input.roomId };
  const dmId = String(input.dmId || input.roomId || '').replace(/^dm_/, '');
  const participants = dmId.split('_');
  if (participants.length !== 2 || !participants.includes(uid) || !participants.every(valid)) return null;
  return { dmId, targetUid: participants.find(id => id !== uid) };
}

export function roomLayoutSignature(rooms, categories, permissions) {
  return JSON.stringify({ categories, permissions, rooms: rooms.map(room => [room.id,
    Object.fromEntries(Object.entries(room.data).filter(([key]) => !/^(lastMessage|sharedKey|legacyKeyMigrated|currentKeyVersion)/.test(key)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
  ]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0) });
}
