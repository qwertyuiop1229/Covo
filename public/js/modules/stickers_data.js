import { doc, getDoc, updateDoc, collection, onSnapshot, serverTimestamp, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getEmojiHtml, _twemojiParse } from '../text_formatter.js';
import { alertMessage } from '../ui_helpers.js';

// ================= STICKERS DATA MODULE ================
/* =====================================================================
   スタンプ機能（Twemoji絵文字をLINE風スタンプとして送る）
   - カテゴリ別の絵文字グリッド + よく使う(お気に入り) + 最近使った
   - スタンプは message.sticker フィールドで送信し、受信側で大きく表示
   - お気に入り/最近は localStorage に保存（端末ごと）
   ===================================================================== */
let STICKER_CATEGORIES = [
  { id: 'recent', icon: '🕘', label: '最近' },
  { id: 'fav', icon: '⭐', label: 'よく使う' },
  { id: 'covo_new', icon: 'covonew:いいね', label: 'スタンプ', emojis: ['covonew:OKです', 'covonew:ありがとう', 'covonew:いいね', 'covonew:うーん', 'covonew:え！', 'covonew:おやすみ', 'covonew:がんばるぞ', 'covonew:ごめんなさい', 'covonew:ちら', 'covonew:ぴえん', 'covonew:ぺこり', 'covonew:またねー', 'covonew:やっほー', 'covonew:わーい！', 'covonew:了解', 'covonew:大好き'] },
  { id: 'covo', icon: 'covo:yay', label: 'Covo', emojis: ['covo:sleep', 'covo:yay', 'covo:love', 'covo:despair', 'covo:ok', 'covo:no', 'covo:roger', 'covo:lol', 'covo:good'] },
  {
    id: 'twitter', icon: '😀', label: 'Twitter', emojis: [
      ...['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '😌', '😔', '😪', '😴', '😷', '🤒', '🤕', '🤧', '🥵', '🥶', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '💀', '💩', '🤡', '👻'],
      ...['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '💪', '🦾', '🖕', '✍️', '💅', '🤳'],
      ...['❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '💋', '💯', '💢', '💥', '💫', '💦', '💨', '✨', '🌟', '⭐', '🔥'],
      ...['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🦄', '🐝', '🦋', '🐢', '🐙', '🐳', '🐬', '🐟', '🦈', '🐊', '🦖', '🐉'],
      ...['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🌽', '🥕', '🍞', '🧀', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🍣', '🍱', '🍜', '🍡', '🍦', '🍰', '🎂', '🍫', '🍬', '🍭', '🍩', '🍪', '☕', '🍵', '🍺', '🍻', '🥂', '🍷'],
      ...['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🥅', '⛳', '🎣', '🎮', '🕹️', '🎲', '🎯', '🎳', '🎤', '🎧', '🎵', '🎸', '🎹', '🥁', '🎺', '🎻', '🎬', '🏆', '🥇', '🥈', '🥉', '🎉', '🎊', '🎈', '🎁', '🎀'],
      ...['✅', '❌', '⭕', '❓', '❗', '‼️', '⁉️', '💤', '🆗', '🆖', '🆕', '🆒', '🔝', '🎶', '〽️', '⚠️', '🚫', '💮', '💢', '♨️', '🈵', '🉐', '㊗️', '㊙️', '🈳', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟥', '🟦', '✔️', '➕', '➖']
    ]
  }
];
let currentServerStampsUnsub = null;
let currentServerStampGroupsUnsub = null;

async function loadCurrentServerStamps() {
  if (!currentServerId) return;
  try {
    if (currentServerStampsUnsub) currentServerStampsUnsub();
    if (currentServerStampGroupsUnsub) currentServerStampGroupsUnsub();

    let stampsCache = [];
    let groupsCache = [];

    const renderStamps = () => {
      for (let i = STICKER_CATEGORIES.length - 1; i >= 0; i--) {
        if (STICKER_CATEGORIES[i].id === 'server_custom' || STICKER_CATEGORIES[i].id.startsWith('server_group_')) {
          STICKER_CATEGORIES.splice(i, 1);
        }
      }

      let customCategories = [];

      const processDocs = (docs) => {
        docs.forEach(d => {
          const s = d.data;
          if (s.isGroup || (s.stamps && s.stamps.length > 0)) {
            customCategories.push({
              id: 'server_group_' + d.id,
              icon: `serverstamp:${s.thumbnailUrl}`,
              label: s.name,
              emojis: s.stamps.map(st => `serverstamp:${st.url}`)
            });
          } else {
            customCategories.push({
              id: 'server_group_' + d.id,
              icon: `serverstamp:${s.url}`,
              label: s.name,
              emojis: [`serverstamp:${s.url}`]
            });
          }
        });
      };

      processDocs(stampsCache);
      processDocs(groupsCache);

      if (customCategories.length > 0) {
        STICKER_CATEGORIES.splice(2, 0, ...customCategories);
      }

      if (_skTabsBound) {
        _skRenderTabs();
        if (_stickerActiveCat === 'server_custom' || _stickerActiveCat.startsWith('server_group_')) {
          _skRenderGrid(_stickerActiveCat);
        }
      }
    };

    const stampsRef = collection(db, `artifacts/${appId}/servers/${currentServerId}/stamps`);
    const groupsRef = collection(db, `artifacts/${appId}/servers/${currentServerId}/stampGroups`);

    currentServerStampsUnsub = onSnapshot(stampsRef, (snap) => {
      stampsCache = snap.docs.map(d => ({ id: d.id, data: d.data() }));
      renderStamps();
    });

    currentServerStampGroupsUnsub = onSnapshot(groupsRef, (snap) => {
      groupsCache = snap.docs.map(d => ({ id: d.id, data: d.data() }));
      renderStamps();
    });

  } catch (e) {
    console.error("Failed to load server stamps", e);
  }
}
const SK_RECENT = 'covo_sticker_recent', SK_FAV = 'covo_sticker_fav';
let _stickerActiveCat = 'covo';

// Twemoji を「生きているCDN(jsDelivr)」のSVGで描画する共通関数。
// 旧デフォルトの maxcdn は閉鎖済みで画像が404→OS純正絵文字に戻ってしまうため base を明示する。

function _skLoad(key) { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; } }
function _skSave(key, arr) { try { localStorage.setItem(key, JSON.stringify(arr.slice(0, 40))); } catch (e) { } }
function _skPushRecent(emoji) {
  let r = _skLoad(SK_RECENT).filter(e => e !== emoji);
  r.unshift(emoji); _skSave(SK_RECENT, r);
}
function _skToggleFav(emoji) {
  let f = _skLoad(SK_FAV);
  if (f.includes(emoji)) f = f.filter(e => e !== emoji);
  else f.unshift(emoji);
  _skSave(SK_FAV, f);
  _skRenderGrid(_stickerActiveCat);
}

let _skTabsBound = false;
function _skRenderTabs() {
  const tabs = document.getElementById('stickerTabs');
  tabs.innerHTML = '';
  STICKER_CATEGORIES.forEach(cat => {
    const b = document.createElement('button');
    b.className = 'sticker-tab' + (cat.id === _stickerActiveCat ? ' active' : '');
    b.innerHTML = getEmojiHtml(cat.icon, 'sk-em');
    b.title = cat.label;
    b.dataset.cat = cat.id;
    tabs.appendChild(b);
  });
  // イベント委譲（twemojiでimg化されてもタブ全体で確実にクリックを拾う）
  if (!_skTabsBound) {
    _skTabsBound = true;
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.sticker-tab');
      if (!btn || !btn.dataset.cat) return;
      _stickerActiveCat = btn.dataset.cat;
      tabs.querySelectorAll('.sticker-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === _stickerActiveCat));
      _skRenderGrid(_stickerActiveCat);
    });
  }
  _twemojiParse(tabs);
}

function _skRenderGrid(catId) {
  const grid = document.getElementById('stickerGrid');
  grid.innerHTML = '';
  let emojis = [];
  if (catId === 'recent') emojis = _skLoad(SK_RECENT);
  else if (catId === 'fav') emojis = _skLoad(SK_FAV);
  else { const cat = STICKER_CATEGORIES.find(c => c.id === catId); emojis = cat ? (cat.emojis || []) : []; }
  if (emojis.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sticker-empty';
    empty.textContent = catId === 'recent' ? 'まだありません' : (catId === 'fav' ? 'スタンプを長押しでよく使うに追加' : '');
    grid.appendChild(empty);
  }
  const favs = _skLoad(SK_FAV);
  emojis.forEach(emoji => {
    const cell = document.createElement('button');
    cell.className = 'sticker-cell' + (favs.includes(emoji) ? ' is-fav' : '');
    cell.innerHTML = getEmojiHtml(emoji, 'sk-em') + `<span class="sticker-fav-star"><i class="fas fa-star"></i></span>`;
    // タップで送信
    let lp = null, lpFired = false;
    const fire = () => { lpFired = true; _skToggleFav(emoji); if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) { } };
    cell.addEventListener('touchstart', () => { lpFired = false; lp = setTimeout(fire, 450); }, { passive: true });
    cell.addEventListener('touchend', () => { if (lp) clearTimeout(lp); });
    cell.addEventListener('touchmove', () => { if (lp) clearTimeout(lp); });
    cell.onclick = () => { if (lpFired) { lpFired = false; return; } sendSticker(emoji); };
    // PC: 右クリックでお気に入りトグル
    cell.oncontextmenu = (e) => { e.preventDefault(); _skToggleFav(emoji); };
    grid.appendChild(cell);
  });
  _twemojiParse(grid);
}

window.toggleStickerPicker = function () {
  const p = document.getElementById('stickerPicker');
  if (!p) return;
  if (p.classList.contains('show')) {
    p.classList.remove('show');
    window._reactionTargetMessageId = null;
    return;
  }
  // 最近があればそれを初期表示、無ければcovoカテゴリ
  _stickerActiveCat = _skLoad(SK_RECENT).length ? 'recent' : 'covo';
  _skRenderTabs();
  _skRenderGrid(_stickerActiveCat);
  // 位置決め: 入力欄の上に出す
  const btn = document.getElementById('stickerButton');
  const r = btn.getBoundingClientRect();
  p.style.visibility = 'hidden'; p.classList.add('show');
  const pw = p.offsetWidth, ph = p.offsetHeight;
  let left = Math.min(Math.max(8, r.left - pw / 2 + r.width / 2), window.innerWidth - pw - 8);
  let top = r.top - ph - 10;
  if (top < 8) top = 8;
  p.style.left = left + 'px'; p.style.top = top + 'px';
  p.style.visibility = '';
};

async function sendSticker(emoji) {
  if (!currentRoomId) return;
  _skPushRecent(emoji);
  document.getElementById('stickerPicker').classList.remove('show');
  if (window._reactionTargetMessageId) {
    window.toggleReaction(window._reactionTargetMessageId, emoji);
    window._reactionTargetMessageId = null;
    return;
  }
  try {
    const data = { sticker: emoji, senderId: userId, senderNickname: currentServerNickname || userNickname, timestamp: serverTimestamp() };
    if (replyingToMessage) {
      data.replyTo = { messageId: replyingToMessage.id, senderNickname: replyingToMessage.senderNickname, text: replyingToMessage.text || "（ファイル）" };
    }
    const replyMsgRef = await addDoc(collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`), data);
    try {
      const { ref, set } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const rtdb = await _getOrInitRTDB();
      const rtdbMsgRef = ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages/${replyMsgRef.id}`);
      const rtdbData = { ...data, id: replyMsgRef.id, timestamp: Date.now() };
      await set(rtdbMsgRef, rtdbData);
    } catch (e) { console.error("RTDB Dual Write Failed in Reply", e); }
    await updateDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}`), {
      lastMessageAt: data.timestamp, lastMessageSender: userId, lastMessageText: 'スタンプ ' + emoji
    });
    cancelReply();
    resetAwayTimer();
    // 通知（スタンプ絵文字つき）
    try {
      const serverSnap = await getDoc(doc(db, `artifacts/${appId}/servers`, currentServerId));
      if (serverSnap.exists()) {
        const sd = serverSnap.data();
        const receiverIds = (sd.joinedUsers || []).filter(id => id !== userId);
        if (receiverIds.length > 0) {
          const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : "";
          fetch(`${WORKER_BASE_URL}/api/sendNotification`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ receiverIds, title: `${sd.name || 'Covo'} › #${roomNames[currentRoomId] || 'room'}`, body: `${userNickname}: ${emoji}`, roomId: currentRoomId, appId, senderId: userId, idToken })
          }).catch(() => { });
        }
      }
    } catch (e) { }
  } catch (e) {
    console.error('[Sticker] 送信失敗:', e);
    alertMessage('スタンプの送信に失敗しました', 'error');
  }
}

// スタンプボタン / 外側クリックで閉じる
document.addEventListener('DOMContentLoaded', () => { });
{
  const sbtn = document.getElementById('stickerButton');
  if (sbtn) sbtn.addEventListener('click', (e) => { e.stopPropagation(); if (!currentRoomId) return; toggleStickerPicker(); });
  document.addEventListener('click', (e) => {
    const p = document.getElementById('stickerPicker');
    if (p && p.classList.contains('show') && !p.contains(e.target) && e.target.id !== 'stickerButton' && !e.target.closest('#stickerButton')) {
      p.classList.remove('show');
      window._reactionTargetMessageId = null;
    }
  });
}

