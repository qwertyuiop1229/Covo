import * as fs from 'firebase-runtime/firestore';
import { traffic, assertDatabaseWriteAllowed } from '../public/js/communication_runtime.js';
export * from 'firebase-runtime/firestore';
export const getDoc = (...args) => { traffic.count('firestore.getDoc'); return fs.getDoc(...args); };
export const getDocs = (...args) => { traffic.count('firestore.getDocs'); return fs.getDocs(...args); };
export const setDoc = async (...args) => { assertDatabaseWriteAllowed(); traffic.count('firestore.setDoc'); return fs.setDoc(...args); };
export const updateDoc = async (...args) => { assertDatabaseWriteAllowed(); traffic.count('firestore.updateDoc'); return fs.updateDoc(...args); };
export const deleteDoc = async (...args) => { assertDatabaseWriteAllowed(); traffic.count('firestore.deleteDoc'); return fs.deleteDoc(...args); };
export const writeBatch = (...args) => {
  const batch = fs.writeBatch(...args);
  const commit = batch.commit.bind(batch);
  batch.commit = async () => { assertDatabaseWriteAllowed(); traffic.count('firestore.batch'); return commit(); };
  return batch;
};
export const runTransaction = async (...args) => {
  assertDatabaseWriteAllowed();
  traffic.count('firestore.transaction');
  const [db, callback, options] = args;
  return fs.runTransaction(db, tx => {
    const wrapped = Object.create(tx);
    for (const method of ['get', 'set', 'update', 'delete']) wrapped[method] = (...a) => {
      if (method !== 'get') assertDatabaseWriteAllowed();
      traffic.count(`firestore.transaction.${method}`);
      const result = tx[method](...a);
      return result === tx ? wrapped : result;
    };
    return callback(wrapped);
  }, options);
};
export const onSnapshot = (...args) => {
  traffic.count('firestore.subscribe');
  traffic.listeners.firestore = (traffic.listeners.firestore || 0) + 1;
  let stop;
  try { stop = fs.onSnapshot(...args); }
  catch (error) { traffic.listeners.firestore--; throw error; }
  let stopped = false;
  return () => { if (!stopped) { stopped = true; traffic.listeners.firestore--; stop(); } };
};
