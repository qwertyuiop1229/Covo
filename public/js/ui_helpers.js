/**
 * UI補助機能 (ui_helpers.js)
 * アラートの表示、画像拡大表示、通知音など、画面描画・UIに特化した純粋な機能群です。
 * データベースや複雑なアプリ状態には依存していません。
 */

/**
 * 画面上にトースト（通知ポップアップ）を表示します。
 * @param {string} msg - 表示するメッセージ
 * @param {string} type - "info" または "error" (赤背景になる)
 */
export function alertMessage(msg, type = "info") {
  const stack = document.getElementById("notifStack");
  if (!stack) return;
  const box = document.createElement("div");
  let colorClass = "bg-gray-800 text-white";
  if (type === "error") colorClass = "bg-red-600 text-white";
  box.className = `px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${colorClass}`;
  box.style.cssText = "pointer-events:auto;animation:slideUpFade 0.22s ease both;";
  box.textContent = msg;
  stack.appendChild(box);
  setTimeout(() => {
    box.style.animation = "fadeIn 0.2s ease reverse forwards";
    setTimeout(() => box.remove(), 200);
  }, 2800);
}

/**
 * アバターや画像を全画面表示（ライトボックス表示）します。
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
 * 新着メッセージやメンションがあった際の通知音を再生します。
 * Web Audio API による洗練された和音チャイムを鳴らします。
 */
export function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // ブラウザのオートプレイポリシー対応: suspend状態のContextを再開してから使用する
    const play = () => {
      const now = ctx.currentTime;
      const notes = [659.25, 783.99, 1046.50]; // E5, G5, C6 の和音チャイム
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.09);
        gain.gain.setValueAtTime(0, now + i * 0.09);
        gain.gain.linearRampToValueAtTime(0.18, now + i * 0.09 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.09);
        osc.stop(now + i * 0.09 + 0.5);
      });
      setTimeout(() => ctx.close(), 1500);
    };
    if (ctx.state === 'suspended') {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  } catch (e) { }
}
