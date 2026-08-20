import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app-check.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  onIdTokenChanged,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  persistentMultipleTabManager,
  memoryLocalCache,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  query,
  where,
  serverTimestamp,
  orderBy,
  getDocs,
  writeBatch,
  limit,
  startAfter,
  startAt,
  arrayUnion,
  arrayRemove,
  increment,
  documentId,
  collectionGroup,
  deleteField
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
  getMessaging,
  getToken,
  onMessage,
  deleteToken
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging.js";

import { E2EE_PREFIX, E2EE_LS_PRIV, E2EE_LS_PUB, _e2ee, _subtleOK, _td, _te, initCryptoContext, __lsGet, __lsSet, __genUserKeyPair, __importPriv, __importPub, _ensureE2EEKeys, __ensureE2EEKeysImpl, __backupKeysToFirestore, __getUserPublicKey, __getEscrowPublicKey, _requestEscrowRescue, _ensureEscrowKey, _getOrCreateRoomKey, __getOrCreateRoomKeyImpl, _getRoomKeyWithWait, _rotateAllRoomKeys, __distributeRoomKeyVersion, _backfillRoomKeysForMembers, _encryptText, _isEncrypted, _decryptText, _decryptMessagesInPlace, _encryptFileE2EE, _decryptFileE2EE, _updateE2EEStatusUI } from '../crypto_helpers.js';
import { _abToB64, _b64ToAb, formatBytes, getMsgTimestamp, safeCopy, _execCopyFallback, emailInitial, processHeicFile } from '../utils.js';
import { escapeHtml, getEmojiHtml, _twemojiParse, escapeHtmlAndLinkUrls } from '../text_formatter.js';
import { alertMessage, openAvatarLightbox, playNotificationSound } from '../ui_helpers.js';
import { checkFileAllowed as _checkFileAllowed, _uploadToExternalService } from '../file_uploader.js';
import { _runShadowHunter, _updateLayoutDebugUI, __clearInspectHighlight, __showInspectHighlight, _inspectPoint, _lineColor as __lineColor, _appendConsoleLine as __appendConsoleLine } from '../debug_ui.js';

// ================= UPDATER MODULE ================
// =========================================================================
// 🛡️ リリース履歴取得＆強制アプデ回避機能管理（設定モーダル＆リカバリー用）
// =========================================================================
window.updateForceOverrideUI = function () {
  const cb = document.getElementById('toggleForceOverrideCheckbox');
  if (!cb) return;
  cb.checked = localStorage.getItem('covo_ignore_force_update') === '1';
};

window.handleForceOverrideToggle = function (event) {
  const checked = event.target.checked;
  if (checked) {
    // オンにしようとしている → 確認モーダルを表示し、まずチェックをキャンセル
    event.target.checked = false;
    const modal = document.getElementById('forceOverrideConfirmModal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    }
  } else {
    // オフにする → そのまま保存
    localStorage.setItem('covo_ignore_force_update', '0');
    updateForceOverrideUI();
  }
};

window.confirmForceOverrideToggle = function () {
  localStorage.setItem('covo_ignore_force_update', '1');
  updateForceOverrideUI();
  const modal = document.getElementById('forceOverrideConfirmModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
};

window.cancelForceOverrideToggle = function () {
  const modal = document.getElementById('forceOverrideConfirmModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
  updateForceOverrideUI();
};

// 無限スクロール対応 過去バージョンモーダル

window.downloadLatestWindowsApp = async function (btn) {
  const origText = btn.textContent;
  btn.textContent = "準備中...";
  btn.disabled = true;
  try {
    const res = await fetch('https://api.github.com/repos/qwertyuiop1229/Covo/releases/latest', { cache: 'no-store' });
    if (!res.ok) throw new Error('API limit or network error');
    const release = await res.json();
    const exeAsset = release.assets?.find(a => a.name?.endsWith('.exe'));
    const url = exeAsset ? exeAsset.browser_download_url : release.html_url;
    window.open(url, '_blank');
  } catch (e) {
    alert("最新バージョンの取得に失敗しました。GitHubページを開きます。");
    window.open('https://github.com/qwertyuiop1229/Covo/releases/latest', '_blank');
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
};

// DOMロード後にTauri環境以外でのUI制御
document.addEventListener("DOMContentLoaded", () => {
  const isTauriEnv = window.__TAURI__ !== undefined;
  if (!isTauriEnv) {
    const vlc = document.getElementById("versionLockContainer");
    if (vlc) vlc.style.display = "none";

    const wdc = document.getElementById("windowsDownloadContainer");
    if (wdc) wdc.style.display = "flex";
  }
});

window.openPastVersionsModal = function () {
  const modal = document.getElementById('pastVersionsModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
  window.__pastVersionsPage = 1;
  window.__pastVersionsHasMore = true;
  window.__pastVersionsLoading = false;
  const listEl = document.getElementById('pastVersionsList');
  if (listEl) listEl.innerHTML = '';
  loadPastVersionsPage(1);
};

window.closePastVersionsModal = function () {
  const modal = document.getElementById('pastVersionsModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
};

window.loadPastVersionsPage = async function (page) {
  if (window.__pastVersionsLoading || !window.__pastVersionsHasMore) return;
  window.__pastVersionsLoading = true;
  const listEl = document.getElementById('pastVersionsList');
  const loadingEl = document.getElementById('pastVersionsLoading');
  if (!listEl) return;
  if (loadingEl) loadingEl.classList.remove('hidden');

  try {
    const res = await fetch(`https://api.github.com/repos/qwertyuiop1229/Covo/releases?per_page=10&page=${page}`, { cache: 'no-store' });
    if (!res.ok) {
      window.__pastVersionsHasMore = false;
      if (res.status === 403) {
        listEl.innerHTML = `
              <div class="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-200 text-xs leading-relaxed space-y-2">
                <p class="font-bold text-amber-400"><i class="fas fa-exclamation-triangle mr-1.5"></i>GitHub API の取得上限 (1時間60回) に到達しました</p>
                <p>ターミナルでのデプロイ監視 (<code>npm run deploy</code>) が匿名APIリクエスト枠をすべて消費したため、過去のリリース履歴を取得できませんでした。</p>
                <p class="pt-1 text-white font-semibold">💡 解決方法：</p>
                <p>Windows の環境変数に <code class="px-1.5 py-0.5 bg-amber-500/20 rounded font-mono text-amber-300">GITHUB_TOKEN</code> を設定してください。ターミナル監視が無料枠を消費しなくなり、アプリ内の履歴表示がいつでも正常に動作するようになります！</p>
              </div>
            `;
      } else {
        listEl.innerHTML = `<div class="text-center text-xs text-red-400 py-4">エラーが発生しました: HTTP ${res.status}</div>`;
      }
      if (loadingEl) loadingEl.classList.add('hidden');
      window.__pastVersionsLoading = false;
      return;
    }
    const releases = await res.json();
    if (!Array.isArray(releases) || releases.length === 0) {
      window.__pastVersionsHasMore = false;
      if (page === 1) {
        listEl.innerHTML = '<div class="text-center text-xs text-gray-500 py-4">リリース履歴が見つかりませんでした。</div>';
      }
      if (loadingEl) loadingEl.classList.add('hidden');
      window.__pastVersionsLoading = false;
      return;
    }

    if (releases.length < 10) {
      window.__pastVersionsHasMore = false;
    }

    releases.forEach(rel => {
      const exeAsset = rel.assets?.find(a => a.name?.endsWith('.exe'));
      const tag = rel.tag_name || '不明';
      const dateStr = rel.published_at ? new Date(rel.published_at).toLocaleDateString() : '';
      const bodyStr = (rel.body || '説明なし').substring(0, 100) + (rel.body?.length > 100 ? '...' : '');

      const card = document.createElement('div');
      card.className = 'p-4 bg-gray-800/60 border border-gray-700/60 rounded-2xl flex items-center justify-between gap-4 shadow-sm hover:shadow transition text-white';
      card.innerHTML = `
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-bold font-mono text-gray-100">${tag}</span>
                <span class="text-xs text-gray-400">(${dateStr})</span>
              </div>
              <p class="text-xs text-gray-300 mt-1 line-clamp-2">${bodyStr}</p>
            </div>
            <button class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-bold text-xs rounded-xl transition flex-shrink-0 flex items-center gap-1.5 shadow-sm" onclick="installPastRelease('${exeAsset ? exeAsset.browser_download_url : rel.html_url}', '${tag}', this)">
              <i class="fas fa-download"></i>${typeof window.__TAURI__ !== "undefined" ? "このバージョンをインストール" : "インストーラーをダウンロード"}
            </button>
          `;
      listEl.appendChild(card);
    });
    window.__pastVersionsPage = page;
  } catch (e) {
    console.warn('Failed to fetch GitHub releases:', e);
    if (page === 1) {
      listEl.innerHTML = '<div class="text-center text-xs text-red-500 py-4">リリース履歴の取得に失敗しました。</div>';
    }
  } finally {
    if (loadingEl) loadingEl.classList.add('hidden');
    window.__pastVersionsLoading = false;
  }
};

window.handlePastVersionsScroll = function (container) {
  if (container.scrollHeight - container.scrollTop <= container.clientHeight + 150) {
    loadPastVersionsPage(window.__pastVersionsPage + 1);
  }
};

window.installPastRelease = async function (url, tag, btnEl) {
  if (!url) return;
  console.log(`[Install Past Release] ${tag} -> ${url}`);
  localStorage.setItem('covo_ignore_force_update', '1');
  if (typeof updateForceOverrideUI === 'function') updateForceOverrideUI();

  // カード内に進捗UIを動的挿入
  let progressEl = null;
  if (btnEl) {
    btnEl.disabled = true;
    const card = btnEl.closest('.past-version-card') || btnEl.parentElement;
    if (card) {
      progressEl = document.createElement('div');
      progressEl.style.cssText = 'margin-top:0.75rem;';
      progressEl.innerHTML = `
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;">
              <span class="past-spinner" style="font-size:0.9rem;">⠋</span>
              <span class="past-progress-text" style="font-size:0.8rem;color:#a5b4fc;font-weight:600;">準備中...</span>
            </div>
            <div style="background:rgba(99,102,241,0.15);border-radius:999px;height:6px;overflow:hidden;border:1px solid rgba(99,102,241,0.3);">
              <div class="past-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#6366f1,#a78bfa);border-radius:999px;transition:width 0.25s ease;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:#64748b;margin-top:0.3rem;">
              <span class="past-bytes-text"></span>
              <span class="past-pct-text" style="font-weight:700;color:#818cf8;">0%</span>
            </div>
          `;
      card.appendChild(progressEl);
    }

    // スピナーアニメーション
    const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let si = 0;
    const spinTimer = setInterval(() => {
      const sp = progressEl?.querySelector('.past-spinner');
      if (sp) sp.textContent = SPINNERS[si++ % SPINNERS.length];
    }, 80);
    progressEl._spinTimer = spinTimer;
  }

  const updatePastProgress = ({ progress = 0, downloaded = 0, total = 0, text = '' } = {}) => {
    if (!progressEl) return;
    const bar = progressEl.querySelector('.past-progress-bar');
    const pct = progressEl.querySelector('.past-pct-text');
    const bytes = progressEl.querySelector('.past-bytes-text');
    const txt = progressEl.querySelector('.past-progress-text');
    if (bar) bar.style.width = Math.min(progress, 100) + '%';
    if (pct) pct.textContent = progress + '%';
    if (bytes && total > 0) bytes.textContent = (downloaded / (1024 * 1024)).toFixed(1) + ' MB / ' + (total / (1024 * 1024)).toFixed(1) + ' MB';
    else if (bytes && downloaded > 0) bytes.textContent = (downloaded / (1024 * 1024)).toFixed(1) + ' MB ダウンロード済み';
    if (txt && text) txt.textContent = text;
  };

  const invoke = window.__TAURI__?.core?.invoke;
  if (invoke && url.endsWith('.exe')) {
    // download-progress イベントをリッスン
    let unlisten = null;
    try {
      const tauriEvent = window.__TAURI__?.event;
      if (tauriEvent?.listen) {
        unlisten = await tauriEvent.listen('download-progress', (event) => {
          const { progress, downloaded, total } = event.payload;
          updatePastProgress({
            progress: Math.min(95, Math.round(5 + progress * 0.9)),
            downloaded, total,
            text: `ダウンロード中... (${progress}%)`
          });
        });
      }
    } catch (e) { console.warn('past version event listen unavailable:', e); }

    updatePastProgress({ progress: 2, text: 'ダウンロードを開始中...' });
    try {
      await invoke('silent_install_past_version', { url, tag });
      if (unlisten) unlisten();
      if (progressEl) clearInterval(progressEl._spinTimer);
      updatePastProgress({ progress: 100, text: '再起動します。更新を適用中...' });
      const sp = progressEl?.querySelector('.past-spinner');
      if (sp) { sp.textContent = '✔'; sp.style.animation = 'none'; }
    } catch (err) {
      console.warn('silent_install_past_version failed, fallback to shell open', err);
      if (unlisten) unlisten();
      if (progressEl) clearInterval(progressEl._spinTimer);
      updatePastProgress({ progress: 0, text: 'ブラウザでダウンロードページを開いています...' });
      invoke('plugin:shell|open', { path: url }).catch(() => window.open(url, '_blank'));
    }
  } else if (invoke) {
    invoke('plugin:shell|open', { path: url }).catch(() => window.open(url, '_blank'));
  } else {
    window.open(url, '_blank');
  }
};


window.emergencyCheckUpdate = async function (btn) {
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '確認中...';
  try {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) throw new Error('Tauri API unavailable');
    const metadata = await invoke('plugin:updater|check');
    if (metadata) {
      alert(`最新バージョン v${metadata.version} が利用可能です！ただちに自動更新を開始します。`);
      document.getElementById('emergencyRecoveryOverlay').classList.add('hidden');
      document.getElementById('emergencyRecoveryOverlay').style.display = 'none';
      localStorage.setItem('covo_ignore_force_update', '0');
      await blockingUpdateCheck();
    } else {
      alert('現在提供されている最新バージョンです。更新プログラムはありません。');
    }
  } catch (e) {
    alert('アップデートの確認に失敗しました: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
};

// 手動アップデート確認（設定のアプリ情報から呼ばれる）
window.manualCheckUpdate = async function (btnId, statusId) {
  const btn = document.getElementById(btnId);
  const statusEl = statusId ? document.getElementById(statusId) : null;
  if (!btn || btn.dataset.checking === '1') return;
  btn.dataset.checking = '1';
  if (btn.tagName === 'BUTTON') { btn.disabled = true; btn.textContent = '確認中…'; }
  if (statusEl) { statusEl.textContent = '確認中…'; statusEl.style.color = '#6b7280'; }

  const resetBtn = () => {
    if (btn) { btn.dataset.checking = '0'; if (btn.tagName === 'BUTTON') { btn.disabled = false; btn.textContent = 'アップデートを確認'; } }
  };

  if (!isTauri) {
    if (statusEl) { statusEl.textContent = 'キャッシュをクリアして再読み込み中...'; statusEl.style.color = '#6b7280'; }
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) {
          await r.unregister();
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const k of keys) {
          await caches.delete(k);
        }
      }
    } catch (e) { console.warn('[manualCheckUpdate] cache clear failed:', e); }
    window.location.href = window.location.pathname + '?v=' + new Date().getTime();
    return;
  }

  try {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) throw new Error('Tauri invoke unavailable');
    const metadata = await invoke('plugin:updater|check');
    if (metadata) {
      resetBtn();
      if (statusEl) { statusEl.textContent = ''; }

      localStorage.setItem('covo_ignore_force_update', '0');
      if (typeof updateForceOverrideUI === 'function') updateForceOverrideUI();

      const result = await blockingUpdateCheck();
      if (!result) {
        const overlay = document.getElementById('updateOverlay');
        const versionText = document.getElementById('updateVersionText');
        const bodyText = document.getElementById('updateBodyText');
        const closeBtn = document.getElementById('updateCloseButton');
        const updateBtn = document.getElementById('updateButton');
        const updateMainTitle = document.getElementById('updateMainTitle');
        if (overlay && versionText) {
          versionText.textContent = `v${metadata.version} を自動でダウンロード中...`;
          if (bodyText) bodyText.textContent = metadata.body || 'バグ修正とパフォーマンス改善が含まれています。';
          if (closeBtn) closeBtn.classList.add('hidden');
          if (updateBtn) updateBtn.classList.add('hidden');
          if (updateMainTitle) updateMainTitle.textContent = '最新アップデートをダウンロード中';
          overlay.classList.add('show');
          setTimeout(() => { performUpdate(); }, 500);
        }
      }
    } else {
      if (statusEl) { statusEl.textContent = '最新バージョンです'; statusEl.style.color = '#4f46e5'; }
      resetBtn();
    }
  } catch (e) {
    console.warn('[manualCheckUpdate] failed:', e);
    if (statusEl) { statusEl.textContent = '確認に失敗しました'; statusEl.style.color = '#ef4444'; }
    resetBtn();
  }
};

// デスクトップショートカット作成（設定のアプリ情報から呼ばれる）
window.createDesktopShortcut = async function (btnId, statusId) {
  const btn = document.getElementById(btnId);
  const statusEl = statusId ? document.getElementById(statusId) : null;
  if (!btn || btn.dataset.creating === '1') return;
  btn.dataset.creating = '1';
  const origText = btn.tagName === 'BUTTON' ? btn.textContent : null;
  if (origText) { btn.disabled = true; btn.textContent = '作成中…'; }
  if (statusEl) { statusEl.textContent = '作成中…'; statusEl.style.color = '#6b7280'; }

  const reset = () => {
    if (btn) { btn.dataset.creating = '0'; if (origText) { btn.disabled = false; btn.textContent = origText; } }
  };

  try {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) throw new Error('Tauri unavailable');
    await invoke('create_desktop_shortcut');
    if (statusEl) { statusEl.textContent = 'ショートカットを作成しました'; statusEl.style.color = '#4f46e5'; }
    reset();
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
  } catch (e) {
    console.warn('[createDesktopShortcut] failed:', e);
    if (statusEl) { statusEl.textContent = '作成に失敗しました'; statusEl.style.color = '#ef4444'; }
    reset();
  }
};

// ─────────────────────────────────────────────────────────────
// 進捗UI ヘルパー
// ─────────────────────────────────────────────────────────────
const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let _spinIdx = 0;
let _spinTimer = null;

function startSpinner() {
  const el = document.getElementById('updateSpinnerIcon');
  if (!el) return;
  _spinIdx = 0;
  _spinTimer = setInterval(() => {
    if (el) el.textContent = SPINNERS[_spinIdx++ % SPINNERS.length];
  }, 80);
}
function stopSpinner(symbol = '✔') {
  clearInterval(_spinTimer);
  _spinTimer = null;
  const el = document.getElementById('updateSpinnerIcon');
  if (el) { el.textContent = symbol; el.style.animation = 'none'; }
}

function formatDownloadBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function updateProgressUI({ progress = 0, downloaded = 0, total = 0, text = '' } = {}) {
  const bar = document.getElementById('updateProgressBar');
  const pct = document.getElementById('updatePercentText');
  const bytes = document.getElementById('updateBytesText');
  const statusText = document.getElementById('updateProgressText');
  const area = document.getElementById('updateProgressArea');

  if (area && area.classList.contains('hidden')) area.classList.remove('hidden');
  if (bar) bar.style.width = Math.min(progress, 100) + '%';
  if (pct) pct.textContent = progress + '%';
  if (bytes && total > 0) bytes.textContent = formatDownloadBytes(downloaded) + ' / ' + formatDownloadBytes(total);
  else if (bytes && downloaded > 0) bytes.textContent = formatDownloadBytes(downloaded) + ' ダウンロード済み';
  if (statusText && text) statusText.textContent = text;
}

// 自動再起動カウントダウン
function startAutoRestartCountdown(seconds = 3) {
  const el = document.getElementById('countdownSec');
  const restartContainer = document.getElementById('updateRestartContainer');
  if (restartContainer) restartContainer.classList.remove('hidden');
  let remaining = seconds;
  if (el) el.textContent = remaining;
  const timer = setInterval(() => {
    remaining--;
    if (el) el.textContent = Math.max(0, remaining);
    if (remaining <= 0) {
      clearInterval(timer);
      forceRestartNow();
    }
  }, 1000);
}

window.forceRestartNow = function () {
  const invoke = window.__TAURI__?.core?.invoke;
  if (invoke) {
    // Tauri環境では app.restart() 相当のコマンドを呼ぶ
    invoke('plugin:process|restart').catch(() => {
      // フォールバック: reload
      window.location.reload();
    });
  } else {
    window.location.reload();
  }
};

// アップデート実行（HTMLのonclickまたは自動更新から呼ばれる）
window.performUpdate = async function () {
  if (!pendingUpdate) return;
  const btn = document.getElementById('updateButton');
  const invoke = window.__TAURI__?.core?.invoke;

  if (btn) { btn.disabled = true; btn.classList.add('hidden'); }
  updateProgressUI({ progress: 20, text: 'アップデートを準備中...' });
  startSpinner();

  try {
    // Tauri標準の確実なビルトインアップデーターを実行
    // 完了後に自動的にインストーラー(Covoセットアップ)が起動するため、同時にアプリを自動終了させる
    updateProgressUI({ progress: 60, text: '更新データを取得中...' });
    await pendingUpdate.downloadAndInstall();
    updateProgressUI({ progress: 100, text: '完了。covoセットアップを起動します...' });
    stopSpinner('✔');
    if (invoke) {
      invoke('plugin:process|exit', { code: 0 }).catch(() => {
        invoke('tauri', { __tauriModule: 'Process', message: { cmd: 'exit', exitCode: 0 } }).catch(() => { });
      });
    }
  } catch (error) {
    stopSpinner('✖');
    console.error('Update failed:', error);
    const detail = error instanceof Error
      ? (error.message + (error.stack ? '\n\n' + error.stack : ''))
      : (typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error));

    if (detail.includes('The signature was created with a different key')) {
      const url = 'https://github.com/qwertyuiop1229/covo/releases/latest';
      if (invoke) {
        invoke('plugin:shell|open', { path: url }).catch(() => window.open(url, '_blank'));
      } else {
        window.open(url, '_blank');
      }
      updateProgressUI({ progress: 0, text: '手動でのアップデートが必要です。ブラウザを開いています...' });
      if (btn) {
        btn.innerHTML = '<i class="fas fa-external-link-alt"></i>&nbsp;&nbsp;ダウンロードページへ';
        btn.disabled = false; btn.classList.remove('hidden');
        btn.onclick = () => { if (invoke) invoke('plugin:shell|open', { path: url }).catch(() => window.open(url, '_blank')); else window.open(url, '_blank'); };
      }
      return;
    }

    updateProgressUI({ progress: 0, text: 'アップデート失敗（詳細は下のエラー欄を確認）' });
    const errBox = document.getElementById('updateErrorBox');
    const errArea = document.getElementById('updateErrorDetail');
    if (errBox && errArea) { errArea.value = detail; errBox.classList.remove('hidden'); }
    if (btn) { btn.disabled = false; btn.classList.remove('hidden'); btn.innerHTML = '<i class="fas fa-download"></i>&nbsp;&nbsp;もう一度試す'; }
  }
};

// エラーコピー
document.addEventListener('click', (e) => {
  if (e.target?.id === 'copyErrorBtn') {
    const ta = document.getElementById('updateErrorDetail');
    if (ta) {
      copyToClipboard(ta.value).then(() => {
        e.target.textContent = 'コピーしました ✓';
        setTimeout(() => { e.target.textContent = 'エラーをコピー'; }, 1500);
      });
    }
  }
});

// ===== Web版専用: Windowsインストーラー自動取得＆ダウンロード =====
// PWAインストールプロンプトの捕捉
let deferredPwaPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  window.__deferredPwaPrompt = e;
});

// ===== デバイス判定＆ダウンロード / インストール分岐 =====
window.openWindowsDownloadModal = function () {
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isAndroid = /android/i.test(ua);

  // 1. iOS Safari の場合: ホーム画面追加ガイドモーダルを表示
  if (isIos && isSafari) {
    const iosModal = document.getElementById('iosPwaGuideModal');
    if (iosModal) {
      iosModal.classList.remove('hidden');
      return;
    }
  }

  // 2. Android の場合: ワンタップでPWAインストールプロンプトを起動
  if (isAndroid && deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    deferredPwaPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        alertMessage('ホーム画面に追加しました！', 'success');
      }
      deferredPwaPrompt = null;
    });
    return;
  }

  // 3. PC Web版の場合: Windows版ダウンロード案内モーダルを表示
  const modal = document.getElementById('windowsDownloadModal');
  if (modal) modal.classList.remove('hidden');
};

window.downloadLatestWindowsApp = async function (triggerBtn) {
  const btn = triggerBtn || document.getElementById('modalDownloadExeBtn');
  const orgHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> 最新版を取得中...';
  }

  try {
    const res = await fetch('https://api.github.com/repos/qwertyuiop1229/covo/releases/latest');
    if (!res.ok) throw new Error('Release API error: ' + res.status);
    const data = await res.json();
    
    // .exe ファイルを探す
    let downloadUrl = null;
    if (data.assets && data.assets.length > 0) {
      const exeAsset = data.assets.find(a => a.name.endsWith('.exe') || a.name.endsWith('-setup.exe'));
      if (exeAsset) {
        downloadUrl = exeAsset.browser_download_url;
      }
    }

    if (!downloadUrl) {
      downloadUrl = data.html_url || 'https://github.com/qwertyuiop1229/covo/releases/latest';
    }

    // ダウンロードを開始
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = '';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (btn) {
      btn.innerHTML = '<i class="fas fa-check"></i> ダウンロードを開始しました';
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = orgHtml;
        const modal = document.getElementById('windowsDownloadModal');
        if (modal) modal.classList.add('hidden');
      }, 2000);
    }
  } catch (err) {
    console.error('Download latest Windows app failed:', err);
    // フォールバック
    window.open('https://github.com/qwertyuiop1229/covo/releases/latest', '_blank');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = orgHtml;
    }
  }
};

// ===== Windows版 (Tauri) Discord風 カスタムタイトルバー ウィンドウ操作 =====
window.minimizeWindow = function () {
  if (window.__TAURI__?.window?.getCurrentWindow) {
    window.__TAURI__.window.getCurrentWindow().minimize().catch(console.error);
  } else if (window.__TAURI__?.core) {
    window.__TAURI__.core.invoke('plugin:window|minimize').catch(console.error);
  }
};

window.toggleMaximizeWindow = async function () {
  if (window.__TAURI__?.window?.getCurrentWindow) {
    const win = window.__TAURI__.window.getCurrentWindow();
    const isMax = await win.isMaximized().catch(() => false);
    if (isMax) win.unmaximize().catch(console.error);
    else win.maximize().catch(console.error);
  } else if (window.__TAURI__?.core) {
    window.__TAURI__.core.invoke('plugin:window|toggle_maximize').catch(console.error);
  }
};

window.closeWindow = function () {
  const closeBehavior = localStorage.getItem('covo_close_behavior') || 'minimize';
  if (closeBehavior === 'quit') {
    if (window.__TAURI__?.window?.getCurrentWindow) {
      window.__TAURI__.window.getCurrentWindow().close().catch(console.error);
    } else if (window.__TAURI__?.core) {
      window.__TAURI__.core.invoke('plugin:process|exit', { code: 0 }).catch(console.error);
    }
  } else if (closeBehavior === 'hide') {
    if (window.__TAURI__?.window?.getCurrentWindow) {
      window.__TAURI__.window.getCurrentWindow().hide().catch(console.error);
    } else if (window.__TAURI__?.core) {
      window.__TAURI__.core.invoke('plugin:window|hide').catch(console.error);
    }
  } else {
    // minimize
    window.minimizeWindow();
  }
};

// 環境判定とタイトルバー / ダウンロードボタンの表示初期化
(function initDesktopAndWebUI() {
  if (window.__TAURI__) {
    // Windowsデスクトップアプリ: タイトルバーを表示
    const titleBar = document.getElementById('discordTitleBar');
    if (titleBar) titleBar.style.display = 'flex';
  } else {
    // Web版: ダウンロードボタンを表示
    const dlBtn = document.getElementById('discordDownloadAppBtn');
    if (dlBtn) dlBtn.style.display = 'flex';
  }
})();

