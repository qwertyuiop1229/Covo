import { traffic } from './communication_runtime.js';
import { CLIENT_PROTOCOL, WORKER_ORIGIN } from './client_protocol.js';

export function createDiagnostics(now = () => Date.now(), initialStartedAt = now()) {
  let startedAt = initialStartedAt, transferBytes = 0, unknownTransfers = 0, resources = 0, longTasks = 0, longTaskMs = 0, layoutShift = 0;
  const timings = new Map(), failures = Object.create(null);
  const safeName = name => /^[a-zA-Z0-9._/-]{1,64}$/.test(name) ? name : 'other';
  return {
    get startedAt() { return startedAt; },
    timing(name, ms) {
      if (!Number.isFinite(ms) || ms < 0) return;
      name = safeName(name);
      if (!timings.has(name) && timings.size >= 32) name = 'other';
      if (!timings.has(name)) timings.set(name, { count: 0, samples: [] });
      const entry = timings.get(name); entry.count++; entry.samples.push(ms); if (entry.samples.length > 64) entry.samples.shift();
    },
    failure(name) { name = safeName(name); if (!(name in failures) && Object.keys(failures).length >= 32) name = 'other'; failures[name] = (failures[name] || 0) + 1; },
    resource(entry) { resources++; if (entry.transferSize > 0) transferBytes += entry.transferSize; else unknownTransfers++; },
    longTask(ms) { if (Number.isFinite(ms) && ms >= 0) { longTasks++; longTaskMs += ms; } },
    shift(value) { if (Number.isFinite(value) && value > 0) layoutShift += value; },
    report(context = {}) {
      return { schema: 1, app: { version: /^\d+\.\d+\.\d+$/.test(context.version) ? context.version : 'unknown', nativeVersion: /^\d+\.\d+\.\d+$/.test(context.nativeVersion) ? context.nativeVersion : null, protocol: CLIENT_PROTOCOL, desktop: Boolean(context.desktop) },
        startedAt, elapsedMs: Math.max(0, now() - startedAt), sdk: traffic.snapshot(),
        network: { observedHttpTransferBytes: transferBytes, resourceCount: resources, zeroOrUnknownTransferCount: unknownTransfers,
          scope: 'Observed HTTP response transferSize only, not uploads. Zero may mean cache or missing cross-origin timing permission. Excludes WebSocket frames and Firebase billing; this is NOT total traffic or a bill.' },
        stability: { longTasks, longTaskMs, layoutShift, failures: { ...failures }, timings: Object.fromEntries([...timings].map(([name, entry]) => {
          const sorted = [...entry.samples].sort((a,b) => a-b);
          return [name, { count: entry.count, sampleCount: sorted.length, p50Ms: sorted[Math.ceil(sorted.length * .5) - 1], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] }];
        })) },
        realtime: { connected: Boolean(context.realtimeConnected), pendingMessages: Number.isSafeInteger(context.pendingMessages) && context.pendingMessages >= 0 ? context.pendingMessages : null },
        memory: { jsHeapUsedBytes: Number.isFinite(context.jsHeapUsedBytes) ? context.jsHeapUsedBytes : null, scope: 'JS heap when available; not Windows process RSS.' },
        notifications: { permission: String(context.permission || 'unknown'), serviceWorkerControlled: Boolean(context.serviceWorkerControlled),
          pushTokenRegistered: Boolean(context.pushTokenRegistered), standalone: Boolean(context.standalone), paused: Boolean(context.paused),
          delivery: 'OS delivery and closed-process Windows delivery are not guaranteed or measured here.' },
        viewport: typeof window !== 'undefined' && window.covoViewport ? window.covoViewport.snapshot() : null,
        privacy: 'Local aggregates only. No message text, filenames, URLs, account IDs, tokens or automatic uploads.' };
    },
    reset() { startedAt = now(); transferBytes = unknownTransfers = resources = longTasks = longTaskMs = layoutShift = 0; timings.clear(); for (const key of Object.keys(failures)) delete failures[key]; traffic.reset(); }
  };
}

export function installDiagnostics({ context = () => ({}), notify = () => {} } = {}) {
  if (window.covoDiagnostics) return window.covoDiagnostics;
  const diagnostics = createDiagnostics(() => Date.now(), performance.timeOrigin || Date.now()); window.covoDiagnostics = diagnostics;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href);
    if (url.origin !== WORKER_ORIGIN || !url.pathname.startsWith('/api/')) return originalFetch(input, options);
    const started = Date.now();
    const route = url.pathname.startsWith('/api/file/') ? 'api/file' : ['fetchOg','syncRtdb','sendNotification','reportError','setOffline','uploadFile','pruneChannelMessages'].includes(url.pathname.slice(5)) ? url.pathname.slice(1) : 'api/other';
    try {
      const response = await originalFetch(input, options); diagnostics.timing(route, Date.now() - started);
      if (!response.ok) diagnostics.failure('http.' + response.status);
      return response;
    } catch (error) { diagnostics.failure(error?.code === 'covo/update-required' ? 'update-required' : 'fetch.failed'); throw error; }
  };
  if (typeof PerformanceObserver !== 'undefined') {
    for (const type of ['resource', 'longtask', 'layout-shift']) try {
      if (!PerformanceObserver.supportedEntryTypes?.includes(type)) continue;
      const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) {
        if (performance.timeOrigin + entry.startTime < diagnostics.startedAt) continue;
        if (type === 'resource') diagnostics.resource(entry);
        else if (type === 'longtask') diagnostics.longTask(entry.duration);
        else if (!entry.hadRecentInput) diagnostics.shift(entry.value);
      } }); observer.observe({ type, buffered: true });
    } catch (_) {}
  }
  window.addEventListener('error', () => diagnostics.failure('window.error'));
  window.addEventListener('unhandledrejection', () => diagnostics.failure('promise.unhandled'));
  for (const parent of [document.getElementById('appinfoSection'), document.querySelector('#mobileDetailAppInfo > div:last-child'), document.querySelector('[data-covo-diagnostics-host]')]) {
    if (!parent) continue;
    const section = document.createElement('section'); section.className = 'covo-diagnostics';
    const title = document.createElement('strong'); title.textContent = '通信・安定性の診断';
    const description = document.createElement('p'); description.textContent = '通常の利用を端末内で集計します。テスト通信や自動送信は行いません。通信量は観測できたHTTP分で、Firebaseの請求量とは異なります。';
    const output = document.createElement('pre'); output.setAttribute('aria-live', 'polite'); output.textContent = '「結果を表示」で現在の計測を確認できます。';
    const buttons = document.createElement('div'); buttons.className = 'covo-diagnostics-actions';
    const show = document.createElement('button'), copy = document.createElement('button'), reset = document.createElement('button');
    for (const button of [show, copy, reset]) { button.type = 'button'; button.className = 'covo-button covo-button-secondary covo-button-small'; }
    show.textContent = '結果を表示'; copy.textContent = 'レポートを丸ごとコピー'; reset.textContent = '端末内の計測をリセット';
    const render = () => { const report = diagnostics.report(context()); output.textContent = JSON.stringify(report, null, 2); return output.textContent; };
    show.onclick = render;
    copy.onclick = async () => { const text = render(); try { await navigator.clipboard.writeText(text); notify('診断レポートをコピーしました。', 'success'); } catch (_) { output.tabIndex = 0; output.focus(); const range = document.createRange(); range.selectNodeContents(output); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); notify('結果を選択しました。端末のコピー操作でコピーしてください。', 'info'); } };
    reset.onclick = () => { diagnostics.reset(); render(); };
    buttons.append(show, copy, reset); section.append(title, description, buttons, output); parent.append(section);
  }
  document.querySelectorAll('[data-covo-diagnostics-status]').forEach(element => { element.hidden = true; });
  return diagnostics;
}
