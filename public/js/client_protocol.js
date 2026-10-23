// Compatibility is separate from authentication: this marker never grants access.
export const CLIENT_PROTOCOL = 2;
export const MINIMUM_WINDOWS_VERSION = '1.1.282';
export function supportsWindowsVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some(value => !Number.isSafeInteger(value))) return false;
  const floor = MINIMUM_WINDOWS_VERSION.split('.').map(Number);
  for (let index = 0; index < 3; index++) if (parts[index] !== floor[index]) return parts[index] > floor[index];
  return true;
}
export const WORKER_ORIGIN = 'https://simplechat-api.astro-fray-server.workers.dev';
export const UPDATE_REQUIRED_MESSAGE = 'このバージョンでは送信できません。Covoを最新版に更新してください。送信待ちの内容は端末に保持されています。';
let updateRequired = false;
export function requireClientUpdate() {
  if (updateRequired) return;
  updateRequired = true;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('covo-update-required'));
}
export function assertSupportedClient() {
  if (updateRequired) {
    const error = new Error(UPDATE_REQUIRED_MESSAGE);
    error.code = 'covo/update-required';
    throw error;
  }
}
export function createProtocolFetch(fetcher, onRejected = requireClientUpdate) {
  return async function protocolFetch(input, options) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url,
      typeof location !== 'undefined' ? location.href : WORKER_ORIGIN);
    const method = String(options?.method || input?.method || 'GET').toUpperCase();
    const mutation = url.origin === WORKER_ORIGIN && url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (!mutation) return fetcher(input, options);
    assertSupportedClient();
    // Keep Request body/signal/credentials intact; only merge the protocol header.
    const headers = new Headers(options?.headers ?? input?.headers);
    headers.set('X-Covo-Protocol', String(CLIENT_PROTOCOL));
    const response = await fetcher(input, { ...options, headers });
    if (response.status === 426) onRejected();
    return response;
  };
}
if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  window.fetch = createProtocolFetch(window.fetch.bind(window));
}
