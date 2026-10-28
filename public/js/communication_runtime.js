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

// Observe demand, not silence: an idle realtime stream is healthy. Only reads or
// subscriptions that have never delivered a result can request transport recovery.
export function createReadSupervisor({now=()=>Date.now(),delay=12000,cooldown=60000,allowed=()=>false,session=()=>null}={}) {
  const groups=new Map();
  let epoch=0;
  const eligible=()=>allowed() && (typeof document==='undefined'||!document.hidden) && (typeof navigator==='undefined'||navigator.onLine!==false);
  const check=group=>{
    clearTimeout(group.timer);group.timer=null;
    if(groups.get(group.instance)!==group||group.running)return;
    const waiting=[...group.entries].filter(entry=>!entry.tried&&entry.owner===session());
    if(!waiting.length)return;
    const due=Math.max(Math.max(Math.min(...waiting.map(entry=>entry.started)),group.lastProgress)+delay,group.lastRecovery+cooldown);
    if(now()<due){group.timer=setTimeout(()=>check(group),due-now());return;}
    if(!eligible())return; // Foreground/online resumes it; no background polling.
    const owner=session(),generation=epoch;
    group.running=true;
    Promise.resolve().then(()=>{
      if(generation!==epoch||!eligible()||session()!==owner)return;
      if(!waiting.some(entry=>group.entries.has(entry))||now()-group.lastProgress<delay)return;
      for(const entry of group.entries)if(entry.owner===owner)entry.tried=true;
      group.lastRecovery=now();traffic.count(group.backend+'.readRecovery');
      // Once disconnected, restore even if the tab was hidden in the meantime.
      // Maintenance/sign-out still veto re-enabling the connection.
      return group.recover(()=>allowed());
    }).catch(()=>{traffic.count(group.backend+'.readRecoveryError');}).finally(()=>{group.running=false;check(group);});
  };
  return {
    configure(options){if(options.allowed)allowed=options.allowed;if(options.session)session=options.session;},
    identity(){return session();},
    begin(backend,instance,recover){
      let group=groups.get(instance);
      if(!group){group={instance,backend,recover,entries:new Set(),timer:null,running:false,lastRecovery:-Infinity,lastProgress:-Infinity};groups.set(instance,group);}
      const entry={started:now(),tried:false,owner:session()};group.entries.add(entry);check(group);
      let finished=false;
      return outcome=>{
        if(finished)return;finished=true;group.entries.delete(entry);
        if(outcome!=='cancel'){
          traffic.count(backend+'.read.'+(outcome==='error'?'error':'completed'));
          globalThis.covoDiagnostics?.timing(backend+'.read',now()-entry.started);
        }
        if(outcome==='success'&&entry.owner===session())group.lastProgress=now();
        if(groups.get(instance)===group)check(group);
      };
    },
    progress(instance){const group=groups.get(instance);if(group){group.lastProgress=now();check(group);}},
    track(backend,instance,recover,read){
      const finish=this.begin(backend,instance,recover);
      return Promise.resolve().then(read).then(value=>{finish('success');return value;},error=>{finish('error');throw error;});
    },
    resume(){for(const group of groups.values())check(group);},
    reset(){epoch++;for(const group of groups.values())clearTimeout(group.timer);groups.clear();},
    snapshot(){return Object.fromEntries(['firestore','rtdb'].map(backend=>{
      const pending=[...groups.values()].filter(group=>group.backend===backend).flatMap(group=>[...group.entries]);
      return [backend,{pending:pending.length,oldestPendingMs:pending.length?Math.max(...pending.map(entry=>now()-entry.started)):0}];
    }));}
  };
}
export const readSupervisor=createReadSupervisor();
if(typeof window!=='undefined'){
  window.addEventListener?.('online',()=>readSupervisor.resume());
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(!document.hidden)readSupervisor.resume();});
}

// Share only concurrent identical reads. Never retain a completed result as an
// authorization/key cache, and let a new request escape an old stalled promise.
export function createReadCoalescer({equal,owner=()=>null,now=()=>Date.now(),maxAgeMs=8000,onJoin=()=>{}}) {
  const instances=new WeakMap();
  return {
    invalidate(instance){instances.get(instance)?.clear();},
    read(instance,kind,target,fetcher){
      let entries=instances.get(instance);
      if(!entries){entries=new Set();instances.set(instance,entries);}
      const identity=owner(),time=now();
      for(const entry of entries){
        if(time-entry.started>=maxAgeMs){entries.delete(entry);continue;}
        if(entry.owner===identity&&entry.kind===kind&&equal(entry.target,target)){onJoin();return entry.promise;}
      }
      const entry={owner:identity,kind,target,started:time,promise:null};
      entry.promise=Promise.resolve().then(fetcher).finally(()=>entries.delete(entry));
      // An unusually large query burst must not build an unbounded comparison list.
      if(entries.size<128)entries.add(entry);
      return entry.promise;
    }
  };
}

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
