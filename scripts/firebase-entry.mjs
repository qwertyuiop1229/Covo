import * as fs from 'firebase-runtime/firestore';
import { traffic, readSupervisor, createReadCoalescer, assertDatabaseWriteAllowed } from '../public/js/communication_runtime.js';
export * from 'firebase-runtime/firestore';
const recover = instance => async canResume => { await fs.disableNetwork(instance); if(canResume())await fs.enableNetwork(instance); };
const reads=createReadCoalescer({equal:(a,b)=>a.type==='document'&&b.type==='document'?fs.refEqual(a,b):a.type!=='document'&&b.type!=='document'&&fs.queryEqual(a,b),owner:()=>readSupervisor.identity(),onJoin:()=>traffic.count('firestore.readCoalesced')});
const read = (method,args) => { const instance=args[0].firestore;return reads.read(instance,method,args[0],()=>{traffic.count('firestore.'+method);return readSupervisor.track('firestore',instance,recover(instance),()=>fs[method](...args));}); };
const write=async(method,args)=>{assertDatabaseWriteAllowed();const instance=args[0].firestore;reads.invalidate(instance);traffic.count('firestore.'+method);try{return await fs[method](...args);}finally{reads.invalidate(instance);}};
export const getDoc = (...args) => read('getDoc',args);
export const getDocs = (...args) => read('getDocs',args);
export const getDocFromServer = (...args) => read('getDocFromServer',args);
export const getDocsFromServer = (...args) => read('getDocsFromServer',args);
export const setDoc = (...args) => write('setDoc',args);
export const updateDoc = (...args) => write('updateDoc',args);
export const deleteDoc = (...args) => write('deleteDoc',args);
export const addDoc = (...args) => write('addDoc',args);
export const writeBatch = (...args) => {
  const batch = fs.writeBatch(...args);
  const commit = batch.commit.bind(batch);
  batch.commit = async () => { assertDatabaseWriteAllowed();reads.invalidate(args[0]); traffic.count('firestore.batch');try{return await commit();}finally{reads.invalidate(args[0]);} };
  return batch;
};
export const runTransaction = async (...args) => {
  assertDatabaseWriteAllowed();
  traffic.count('firestore.transaction');
  const [db, callback, options] = args;
  reads.invalidate(db);
  try {return await fs.runTransaction(db, tx => {
    const wrapped = Object.create(tx);
    for (const method of ['get', 'set', 'update', 'delete']) wrapped[method] = (...a) => {
      if (method !== 'get') assertDatabaseWriteAllowed();
      traffic.count(`firestore.transaction.${method}`);
      const result = tx[method](...a);
      return result === tx ? wrapped : result;
    };
    return callback(wrapped);
  }, options);} finally {reads.invalidate(db);}
};
export const onSnapshot = (...args) => {
  traffic.count('firestore.subscribe');
  traffic.listeners.firestore = (traffic.listeners.firestore || 0) + 1;
  const instance=args[0].firestore;
  const finish=readSupervisor.begin('firestore',instance,recover(instance));
  const received=snapshot=>{finish('success');if(snapshot.metadata?.fromCache===false&&!snapshot.metadata.hasPendingWrites)readSupervisor.progress(instance);};
  const failed=(error,handler)=>{finish('error');release();traffic.count('firestore.listenError');if(handler)handler(error);else console.error('[Firestore] 読み取り監視に失敗しました:',error);};
  const wrapped=[...args];
  const index=args.findIndex((value,index)=>index>0&&(typeof value==='function'||(value&&typeof value==='object'&&('next' in value||'error' in value||'complete' in value))));
  if(index>=0){
    const observer=args[index];
    if(typeof observer==='function'){
      wrapped[index]=snapshot=>{received(snapshot);observer(snapshot);};
      wrapped[index+1]=error=>failed(error,args[index+1]);
    }else wrapped[index]={next(snapshot){received(snapshot);observer.next?.(snapshot);},error(error){failed(error,observer.error?.bind(observer));},complete(){finish('cancel');release();observer.complete?.();}};
  }
  let stopped = false;
  const release=()=>{if(!stopped){stopped=true;traffic.listeners.firestore--;}};
  let stop;
  try { stop = fs.onSnapshot(...wrapped); }
  catch (error) { finish('error');release();throw error; }
  return () => { finish('cancel');release();stop(); };
};
