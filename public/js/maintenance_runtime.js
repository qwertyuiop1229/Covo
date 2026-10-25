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
          display('修正と動作確認を行っています。しばらくしてから再確認してください。端末の暗号鍵・履歴・送信待ちは保持しています。');
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
    async changed(user) { state = null; return check(user); } };
}
