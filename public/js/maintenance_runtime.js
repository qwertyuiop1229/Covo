export function maintenanceStatusEndpoint(endpoint, pageUrl = typeof location === 'undefined' ? null : location.href) {
  if (!pageUrl) return endpoint;
  const page = new URL(pageUrl);
  const parts=page.hostname.split('.').map(Number);
  const privateIP=parts.length===4 && parts.every(part=>Number.isInteger(part)&&part>=0&&part<=255) &&
    (parts[0]===10 || parts[0]===192&&parts[1]===168 || parts[0]===172&&parts[1]>=16&&parts[1]<=31);
  const previewLAN=typeof window!=='undefined' && window.covoLocalPreview===true && privateIP;
  return ['http:','https:'].includes(page.protocol) && (['localhost','127.0.0.1'].includes(page.hostname) || previewLAN)
    ? new URL('/__covo_dev__/maintenance',page.origin).href : endpoint;
}

// A public boolean is a change signal, never an authorization decision. Fetch
// authoritative state only on transitions and drain rapid toggles in order.
export function createMaintenanceSignalHandler({enabled,blocked,block,refresh,recovered,error=()=>{},settling=()=>false,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  let latest,revision=0,running=null;
  return value=>{
    if(typeof value!=='boolean'||value===latest)return running||Promise.resolve();
    latest=value;
    if(value===enabled()&&!running)return Promise.resolve();
    revision++;
    if(value)block();
    if(!running)running=Promise.resolve().then(async()=>{
      try{
        let observed;
        do{
          observed=revision;const wasBlocked=blocked();
          let allowed=await refresh(),retry=0;
          // A release hint can arrive before the cross-database commit finishes.
          // Confirm only this transition; do not poll normal sessions.
          while(observed===revision&&latest===false&&!allowed&&settling()&&retry<5){
            await wait([250,750,1500,3000,5000][retry++]);
            if(observed!==revision)break;
            allowed=await refresh();
          }
          if(observed===revision&&allowed&&wasBlocked&&enabled()===false)await recovered();
        }while(observed!==revision);
      }catch(reason){error(reason);}finally{running=null;}
    });
    return running;
  };
}

export function createMaintenanceGate({ endpoint, stopped = async () => {}, resume = () => {}, getOwner }) {
  const statusEndpoint = maintenanceStatusEndpoint(endpoint);
  const panel = document.getElementById('covoMaintenancePanel');
  const heading = panel.querySelector('h1'), message = panel.querySelector('[data-maintenance-message]');
  const retry = panel.querySelector('[data-maintenance-retry]'), login = panel.querySelector('[data-maintenance-login]');
  let state = null, pending = null, pendingOwner = null;
  window.covoMaintenanceBlocked = true;
  document.querySelector('.container').inert = true;
  function display(text, title = 'ただいまメンテナンス中です') {
    panel.hidden = false; heading.textContent = title; message.textContent = text;
    document.querySelector('.container').inert = true;
    document.body.classList.add('auth-ready'); document.getElementById('appLoadingSplash')?.remove();
    login.disabled = state === null;
  }
  async function check(user = null) {
    const owner = user?.uid || null;
    if (pending) return pendingOwner === owner ? pending : pending.then(() => check(user));
    pendingOwner = owner;
    state = null;
    window.covoMaintenanceChecking = true;
    pending = (async () => {
      retry.disabled = true;
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
      try {
        const token = user ? await Promise.race([user.getIdToken(), new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('token-timeout')), { once: true }))]) : null;
        const response = await fetch(statusEndpoint, { cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal });
        if (!response.ok) throw Object.assign(new Error('maintenance-status-unavailable'), { status:response.status });
        const result = await response.json();
        if (getOwner && owner !== (getOwner() || null)) return false;
        if (typeof result.enabled !== 'boolean' || typeof result.adminAllowed !== 'boolean') throw new Error('invalid-maintenance-status');
        state = { ...result, previewLegacyBackend: statusEndpoint !== endpoint && result.previewLegacyBackend === true };
        if (state.previewLegacyBackend) console.info('[test:web] 旧Workerとのローカル互換プレビューです。メンテナンス切り替えはWorkerの更新後に利用できます。');
        if (result.enabled && !result.adminAllowed) {
          window.covoMaintenanceBlocked = true;
          display(result.transitioning?'設定を同期しています。接続準備が完了するまでお待ちください。':'修正と動作確認を行っています。しばらくしてから再確認してください。端末の暗号鍵・履歴・送信待ちは保持しています。');
          await stopped(); return false;
        }
        window.covoMaintenanceBlocked = false; panel.hidden = true;
        document.querySelector('.container').inert = Boolean(window.covoAuthTransitionBusy);
        return true;
      } catch (error) {
        window.covoMaintenanceBlocked = true;
        display(error.status === 404
          ? 'メンテナンス確認APIが見つかりません。ローカル検証は最新の npm run test:web を起動し直してください。本番ではWorkerの更新が必要です。'
          : '接続状態を確認できませんでした。通信を確認して再試行してください。', error.status === 404 ? '接続先の更新が必要です' : '接続を確認しています');
        await stopped(); return false;
      } finally { clearTimeout(timer); retry.disabled = false; window.covoMaintenanceChecking = false; }
    })().finally(() => { pending = null; });
    return pending;
  }
  retry.onclick = () => resume();
  login.onclick = () => {
    panel.hidden = true; document.querySelector('.container').inert = false;
    document.body.classList.add('auth-ready'); document.body.classList.remove('logged-in', 'needs-nickname');
    document.getElementById('authContainer')?.classList.remove('hidden');
    document.getElementById('authMessage').textContent = 'アプリ全体管理者のアカウントでログインしてください。';
  };
  return { check, get state() { return state; }, async authorize(user) {
      if (state?.enabled && !user) return false;
      return state?.enabled === false && !window.covoMaintenanceBlocked ? true : check(user);
    },
    async changed(user) { if(pending)await pending;state = null; return check(user); } };
}
