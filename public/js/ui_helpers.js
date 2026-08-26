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
 * アバターや画像を拡大表示（ライトボックス）
 * @param {string} url - 拡大表示する画像のURL
 */
export function openAvatarLightbox(url) {
  const lb = document.getElementById("avatarLightbox");
  const img = document.getElementById("avatarLightboxImg");
  if (lb && img) {
    img.src = url;
    lb.style.display = "flex";
  }
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
