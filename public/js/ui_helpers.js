/**
 * UI補助機能 (ui_helpers.js)
 * トースト通知、アバター拡大、通知音などのUI表示用純粋関数群です。
 */

/**
 * 画面上にトースト（通知ポップアップ）を表示
 * @param {string} msg - 表示するメッセージ
 * @param {string} type - "info", "success", "error"
 */
export function alertMessage(msg, type = "info") {
  const stack = document.getElementById("notifStack");
  if (!stack) return;
  const box = document.createElement("div");
  let colorClass = "bg-gray-800 text-white";
  if (type === "error") colorClass = "bg-red-600 text-white";
  else if (type === "success") colorClass = "bg-emerald-600 text-white";
  
  box.className = `px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${colorClass} flex items-center gap-2`;
  box.style.cssText = "pointer-events:auto;animation:slideUpFade 0.22s ease both;";
  
  let icon = '<i class="fas fa-info-circle"></i>';
  if (type === "error") icon = '<i class="fas fa-exclamation-triangle"></i>';
  else if (type === "success") icon = '<i class="fas fa-check-circle"></i>';
  
  box.innerHTML = `${icon}<span>${msg}</span>`;
  stack.appendChild(box);
  setTimeout(() => {
    box.style.animation = "fadeIn 0.2s ease reverse forwards";
    setTimeout(() => box.remove(), 200);
  }, 2800);
}

/**
 * アバター高解像度拡大表示（Discord風ライトボックス）
 * @param {string} url - アバター画像のURL
 * @param {string} nickname - ユーザーニックネーム
 * @param {string} tag - ユーザータグ (#1234)
 */
export function openAvatarLightbox(url, nickname = '', tag = '') {
  const lb = document.getElementById("avatarLightbox");
  const img = document.getElementById("avatarLightboxImg");
  const initialEl = document.getElementById("avatarLightboxInitial");
  const titleEl = document.getElementById("avatarLightboxTitle");
  const tagEl = document.getElementById("avatarLightboxUserTag");
  
  if (!lb) return;

  if (titleEl) titleEl.textContent = nickname ? `${nickname} のアバター` : 'アバター';
  if (tagEl) tagEl.textContent = tag ? `#${tag}` : '';

  const isUsable = url && typeof url === 'string' && url.indexOf('res.cloudinary.com') < 0 && url.length > 0;

  if (isUsable) {
    if (img) {
      img.src = url;
      img.style.display = 'block';
    }
    if (initialEl) initialEl.style.display = 'none';
  } else {
    if (img) img.style.display = 'none';
    if (initialEl) {
      initialEl.textContent = (nickname || '?').charAt(0).toUpperCase();
      initialEl.style.display = 'block';
    }
  }

  lb.style.display = "flex";
  lb.classList.remove("hidden");
}

export function closeAvatarLightbox() {
  const lb = document.getElementById("avatarLightbox");
  if (lb) {
    lb.style.display = "none";
    lb.classList.add("hidden");
  }
}

export function downloadAvatarLightboxImage() {
  const img = document.getElementById("avatarLightboxImg");
  const titleEl = document.getElementById("avatarLightboxTitle");
  const url = img?.src;
  if (url && url.startsWith('http')) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(titleEl?.textContent || 'avatar').replace(/[^a-zA-Z0-9_\-\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/g, '_')}.png`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

if (typeof window !== 'undefined') {
  window.openAvatarLightbox = openAvatarLightbox;
  window.closeAvatarLightbox = closeAvatarLightbox;
  window.downloadAvatarLightboxImage = downloadAvatarLightboxImage;
}

/**
 * 新着メッセージやメンション通知音の再生（Web Audio API チャイム）
 */
let audioCtx = null;
export function playNotificationSound() {
  try {
    const soundEnabled = localStorage.getItem('simplechat_sound') !== 'false';
    const notifEnabled = localStorage.getItem('simplechat_browser_notif') !== 'false';
    if (!soundEnabled || !notifEnabled) return;

    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const play = () => {
      const now = audioCtx.currentTime;
      const notes = [659.25, 783.99, 1046.50]; // E5, G5, C6
      notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.09);
        gain.gain.setValueAtTime(0, now + i * 0.09);
        gain.gain.linearRampToValueAtTime(0.18, now + i * 0.09 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + i * 0.09);
        osc.stop(now + i * 0.09 + 0.5);
      });
    };
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  } catch (e) { }
}

// グローバル互換性
if (typeof window !== 'undefined') {
  window.alertMessage = alertMessage;
  window.openAvatarLightbox = openAvatarLightbox;
  window.playNotificationSound = playNotificationSound;
}
