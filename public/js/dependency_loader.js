const pendingScripts = new Map();

export function loadOptionalScript(src, globalName, timeoutMs = 20000) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (pendingScripts.has(src)) return pendingScripts.get(src);
  const pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let timer;
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error(`${globalName} の読み込みに失敗しました。接続を確認して再試行してください。`));
    };
    script.src = src;
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      if (window[globalName]) resolve(window[globalName]);
      else fail();
    };
    script.onerror = fail;
    timer = setTimeout(fail, timeoutMs);
    document.head.appendChild(script);
  });
  pendingScripts.set(src, pending);
  pending.catch(() => { if (pendingScripts.get(src) === pending) pendingScripts.delete(src); });
  return pending;
}

export async function loadPdfLibrary() {
  const library = await loadOptionalScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
  library.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  return library;
}

export async function loadAgoraLibrary() {
  const sdk = await loadOptionalScript('https://download.agora.io/sdk/release/AgoraRTC_N-4.22.2.js', 'AgoraRTC');
  sdk.setLogLevel(4);
  return sdk;
}
