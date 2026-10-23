import * as db from 'firebase-runtime/database';
import { traffic, assertDatabaseWriteAllowed } from '../public/js/communication_runtime.js';
export * from 'firebase-runtime/database';
export const get = (...args) => { traffic.count('rtdb.get'); return db.get(...args); };
export const set = async (...args) => { assertDatabaseWriteAllowed(); traffic.count('rtdb.set'); return db.set(...args); };
export const update = async (...args) => { assertDatabaseWriteAllowed(); traffic.count('rtdb.update'); return db.update(...args); };
export const remove = async (...args) => { assertDatabaseWriteAllowed(); traffic.count('rtdb.remove'); return db.remove(...args); };
export const runTransaction = async (...args) => { assertDatabaseWriteAllowed(); traffic.count('rtdb.transaction'); return db.runTransaction(...args); };
export const onValue = (query, callback, ...rest) => {
  traffic.count('rtdb.subscribe');
  traffic.listeners.rtdb = (traffic.listeners.rtdb || 0) + 1;
  let stopped = false;
  const release = () => { if (!stopped) { stopped = true; traffic.listeners.rtdb--; } };
  const cancel = typeof rest[0] === 'function' ? rest[0] : null;
  const options = typeof rest[0] === 'function' || rest[0] == null ? rest[1] : rest[0];
  const once = options?.onlyOnce === true;
  try {
    const stop = db.onValue(query, snapshot => {
      if (once) release();
      traffic.count('rtdb.snapshot'); callback(snapshot);
    }, error => { release(); traffic.count('rtdb.listenError'); cancel?.(error); }, options);
    return () => { release(); stop(); };
  } catch (error) { release(); throw error; }
};
