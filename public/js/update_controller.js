// One checked Update resource and one operation at a time. The official updater
// verifies the signed artifact; installation is always a separate user action.
export function createUpdateController({ check, busy = () => false, changed = () => {} }) {
  let resource = null, running = null, activeOperation = null;
  let state = { phase: 'idle', version: '', downloaded: 0, total: 0 };
  const emit = patch => { state = { ...state, ...patch }; changed({ ...state }); };
  const operation = (name, fn) => {
    if (running) {
      if (activeOperation === name) return running;
      // A check's result is not a download/apply result. Serialize unlike
      // operations and re-evaluate their preconditions after the current task.
      return running.catch(() => {}).then(() => operation(name, fn));
    }
    activeOperation = name;
    running = Promise.resolve().then(fn).catch(error => {
      emit({ phase: state.phase === 'ready' ? 'ready' : 'error', error: String(error?.message || error) });
      throw error;
    }).finally(() => { running = null; activeOperation = null; });
    return running;
  };
  return {
    get state() { return { ...state }; },
    check: () => operation('check', async () => {
      // Retain downloaded bytes instead of checking/replacing their resource.
      if (resource && state.phase === 'ready') return true;
      emit({ phase: 'checking', error: '' });
      await resource?.close(); resource = null;
      resource = await check({ timeout: 15000 });
      emit({ phase: resource ? 'available' : 'current', version: resource?.version || '', body: resource?.body || '', downloaded: 0, total: 0 });
      return Boolean(resource);
    }),
    download: () => operation('download', async () => {
      if (!resource || state.phase === 'ready') return;
      if (busy()) { emit({ phase: 'available' }); return; }
      emit({ phase: 'downloading', downloaded: 0, total: 0, error: '' });
      await resource.download(event => {
        if (event.event === 'Started') emit({ total: event.data.contentLength || 0 });
        if (event.event === 'Progress') emit({ downloaded: state.downloaded + event.data.chunkLength });
      }, { timeout: 120000 });
      emit({ phase: 'ready' });
    }),
    apply: () => operation('apply', async () => {
      if (!resource || state.phase !== 'ready') throw new Error('更新をダウンロードしてから適用してください。');
      if (busy()) throw new Error('通話・録音・転送・送信が終わってから更新してください。');
      emit({ phase: 'installing' });
      try { await resource.install(); }
      catch (error) { emit({ phase: 'ready' }); throw error; }
    })
  };
}
