import * as db from 'firebase-runtime/database';
import { traffic, readSupervisor, createReadCoalescer, assertDatabaseWriteAllowed } from '../public/js/communication_runtime.js';
export * from 'firebase-runtime/database';
const recover = instance => canResume => { if(canResume()){db.goOffline(instance);db.goOnline(instance);} };
const reads=createReadCoalescer({equal:(a,b)=>a.isEqual(b),owner:()=>readSupervisor.identity(),onJoin:()=>traffic.count('rtdb.readCoalesced')});
export const get = (...args) => { const instance=args[0].ref.database;return reads.read(instance,'get',args[0],()=>{traffic.count('rtdb.get');return readSupervisor.track('rtdb',instance,recover(instance),()=>db.get(...args));}); };
const write=async(method,args)=>{assertDatabaseWriteAllowed();const instance=args[0].ref.database;reads.invalidate(instance);traffic.count('rtdb.'+(method==='runTransaction'?'transaction':method));try{return await db[method](...args);}finally{reads.invalidate(instance);}};
export const set = (...args) => write('set',args);
export const update = (...args) => write('update',args);
export const remove = (...args) => write('remove',args);
export const runTransaction = (...args) => write('runTransaction',args);
export const push = (...args) => {
  if(args[1]===undefined)return db.push(...args);
  assertDatabaseWriteAllowed();const instance=args[0].ref.database;reads.invalidate(instance);traffic.count('rtdb.push');
  const result=db.push(...args);Promise.resolve(result).then(()=>reads.invalidate(instance),()=>reads.invalidate(instance));return result;
};
const valueListeners = new Set();
// onValue wraps callbacks for metrics. Preserve off(query, 'value', original)
// as well as the returned unsubscribe; raw SDK off cannot match our wrapper.
export const off = (query,eventType,callback) => {
  if(!eventType || eventType==='value') {
    const allQueries=query.isEqual(query.ref),removed=[];
    for(const item of [...valueListeners]) {
      const matches=item.query.isEqual(query)||(allQueries&&item.query.ref.isEqual(query.ref));
      if(matches && (!callback || callback===item.callback) && (!callback||!removed.some(q=>q.isEqual(item.query)))) {
        item.stop();
        // A reference removes one matching registration in each query view.
        removed.push(item.query);
      }
    }
  }
  db.off(query,eventType,callback);
};
export const onValue = (query, callback, ...rest) => {
  traffic.count('rtdb.subscribe');
  traffic.listeners.rtdb = (traffic.listeners.rtdb || 0) + 1;
  let stopped = false;
  const registration={query,callback,stop:null};
  const release = () => { if (!stopped) { stopped = true; traffic.listeners.rtdb--; valueListeners.delete(registration); } };
  const cancel = typeof rest[0] === 'function' ? rest[0] : null;
  const options = typeof rest[0] === 'function' || rest[0] == null ? rest[1] : rest[0];
  const once = options?.onlyOnce === true;
  const instance=query.ref.database;
  const finish=readSupervisor.begin('rtdb',instance,recover(instance));
  let rawStop=null,closed=false;
  registration.stop=()=>{if(closed)return;closed=true;finish('cancel');release();rawStop?.();};
  valueListeners.add(registration);
  try {
    rawStop = db.onValue(query, snapshot => {
      if(closed || stopped)return;
      finish('success');
      readSupervisor.progress(instance);
      if (once) release();
      traffic.count('rtdb.snapshot'); callback(snapshot);
    }, error => { if(closed || stopped)return;finish('error');release(); traffic.count('rtdb.listenError'); cancel?.(error); }, options);
    if(closed)rawStop();
    return registration.stop;
  } catch (error) { finish('error');release(); throw error; }
};
