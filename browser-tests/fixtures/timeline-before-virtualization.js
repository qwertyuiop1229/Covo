// Immutable performance baseline from 8c6e23cbbd939e7b680cd884113801f184cc3a63:public/js/main.js
// Only the original renderMessagesWithReadReceipts declaration is retained.
function renderMessagesWithReadReceipts() {
  const channelId = currentDmId ? `dm_${currentDmId}` : `${currentServerId}_${currentRoomId}`;
  const timeline = isJumpView ? lastMessagesData : allLoadedMessages;
  if (searchQuery && _searchHistoryResults?.channelId === channelId && _searchHistoryResults.query === searchQuery) {
    const combined = new Map(_searchHistoryResults.messages.map(message => [message.id, message]));
    for (const message of timeline) combined.set(message.id, message);
    lastMessagesData = [...combined.values()].sort(compareHistoryMessages);
  } else {
    lastMessagesData = [...timeline];
  }
  messagesIndexMap = {};
  lastMessagesData.forEach((message, index) => { messagesIndexMap[message.id] = index; });
  const filteredMessages = lastMessagesData.filter(msg => {
    if (!searchQuery) return true;
    const body = String(msg.text || msg._decryptedText || '').toLowerCase();
    const sender = String(msg.senderNickname || msg.senderName || '').toLowerCase();
    return body.includes(searchQuery) || sender.includes(searchQuery);
  });

  // スクロール中に新しいメッセージを受信した場合の「最新へジャンプ」バッジ連動
  const newMessageCount = countNewerMessages(filteredMessages, window._covoLastRenderedNewest);
  if (!searchQuery && newMessageCount > 0) {
    const diff = newMessageCount;
    if (messagesDisplay && messagesDisplay.scrollTop > 100) {
      window._covoUnreadScrolledCount = (window._covoUnreadScrolledCount || 0) + diff;
      const badge = document.getElementById("jumpModeUnreadBadge");
      if (badge) {
        badge.textContent = window._covoUnreadScrolledCount > 99 ? '99+' : window._covoUnreadScrolledCount;
        badge.classList.remove('hidden');
      }
      const exitBtn = document.getElementById("jumpModeExitBtn");
      if (exitBtn) {
        exitBtn.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-3');
        exitBtn.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
      }
    }
  }
  window._covoLastRenderedCount = filteredMessages.length;
  if (!searchQuery) window._covoLastRenderedNewest = filteredMessages[filteredMessages.length - 1]?.id || null;

  // 既存のDOMとの差分同期（innerHTML = "" や remove によるカクつき・アニメーション再発火防止）
  const existingRows = Array.from(messagesDisplay.querySelectorAll('.message-row'));
  const existingRowsMap = new Map();
  existingRows.forEach(row => {
    const bubble = row.querySelector('.message-bubble');
    if (bubble && bubble.dataset.messageId) {
      existingRowsMap.set(bubble.dataset.messageId, row);
    }
  });

  const existingDividers = Array.from(messagesDisplay.querySelectorAll('.date-divider'));
  const existingDividersMap = new Map();
  existingDividers.forEach(div => {
    const inner = div.querySelector('.date-divider-inner');
    if (inner) {
      existingDividersMap.set(inner.textContent.trim(), div);
    }
  });

  // DOM順序を新しい順にする（scaleY(-1)で反転表示するため）
  const reversedMessages = [...filteredMessages].reverse();
  const getDayString = (ts) => {
    const ms = parseTimestampToMs(ts);
    if (!ms || ms <= 0) return "";
    const d = new Date(ms);
    const today = new Date();
    const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    if (isToday) return "今日";
    const yday = new Date(today); yday.setDate(today.getDate() - 1);
    const isYday = d.getDate() === yday.getDate() && d.getMonth() === yday.getMonth() && d.getFullYear() === yday.getFullYear();
    if (isYday) return "昨日";
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`;
  };

  // 1. まず表示するべき全DOM要素をリスト化する（既存要素は再利用し、位置も維持する）
  const expectedElements = [];

  reversedMessages.forEach((msg, i) => {
    const idx = messagesIndexMap[msg.id];
    const readCount = computeReadByCount(msg, idx);
    const isMyMsg = (msg.senderId === userId || msg.userId === userId);
    let row = existingRowsMap.get(msg.id);
    if (row) {
      if (!isMyMsg) {
        const senderUser = cachedUsers.find(u => u.id === msg.senderId);
        const cachedProf = window._userProfileCache?.get(msg.senderId);
        const resolvedNickname = (currentDmParticipant?.uid === msg.senderId ? currentDmParticipant.nickname : null) || cachedProf?.nickname || senderUser?.nickname || msg.senderNickname || "ユーザー";
        const dmAvatar = (currentDmParticipant && currentDmParticipant.uid === msg.senderId) ? currentDmParticipant.avatarUrl : null;
        const resolvedAvatarUrl = isUsableAvatarUrl(dmAvatar)
          ? dmAvatar
          : (isUsableAvatarUrl(cachedProf?.avatarUrl)
              ? cachedProf.avatarUrl
              : (isUsableAvatarUrl(senderUser?.avatarUrl)
                  ? senderUser.avatarUrl
                  : (isUsableAvatarUrl(msg.senderAvatarUrl) ? msg.senderAvatarUrl : null)));
        const avatarDiv = row.querySelector('.msg-avatar');
        if (avatarDiv) {
          if (isUsableAvatarUrl(resolvedAvatarUrl)) {
            __setAvatarImg(avatarDiv, resolvedAvatarUrl, resolvedNickname, { style: '' });
          } else {
            avatarDiv.textContent = resolvedNickname.charAt(0).toUpperCase();
            if (msg.senderId && window.getUserProfile) {
              window.getUserProfile(msg.senderId).then(p => {
                if (p && isUsableAvatarUrl(p.avatarUrl) && avatarDiv.parentElement) {
                  __setAvatarImg(avatarDiv, p.avatarUrl, p.nickname || resolvedNickname, { style: '' });
                }
              }).catch(() => {});
            }
          }
        }
        const nameSpan = row.querySelector('.msg-sender-name');
        if (nameSpan) {
          nameSpan.textContent = resolvedNickname;
        }
      }
      const readSpan = row.querySelector('.read-receipt');
      if (readSpan) {
        if (readCount > 0) {
          readSpan.textContent = `既読${readCount > 1 ? `（${readCount}）` : ""}`;
          readSpan.style.display = "";
        } else {
          readSpan.style.display = "none";
        }
      }
      const timestampSpan = row.querySelector('.msg-timestamp');
      if (timestampSpan) {
        // Firestoreタイムスタンプ・D1シム・数値のいずれにも対応
        const _getDateU = (ts) => {
          if (!ts) return null;
          if (typeof ts.toDate === 'function') return ts.toDate();
          if (typeof ts === 'number') return new Date(ts);
          return null;
        };
        const _tsDU = _getDateU(msg.timestamp) || _getDateU(msg.createdAt);
        if (_tsDU) {
          timestampSpan.textContent = `${String(_tsDU.getHours()).padStart(2, "0")}:${String(_tsDU.getMinutes()).padStart(2, "0")}`;
        } else {
          timestampSpan.textContent = "送信中...";
        }
      }
      const textSpan = row.querySelector('.message-content');
      if (textSpan && msg.text) {
        const isEnc = isEncrypted(msg.text) || (msg._originalText && isEncrypted(msg._originalText)) || (typeof msg.text === 'string' && msg.text.startsWith('enc::'));
        if (msg._decrypted && typeof msg.text === 'string' && !msg.text.startsWith('enc::')) {
          textSpan.innerHTML = escapeHtmlAndLinkUrls(msg.text);
          const ogUrl = window.extractFirstOgUrl ? window.extractFirstOgUrl(msg.text) : null;
          if (ogUrl && window.attachDiscordOgEmbed) {
            const bEl = row.querySelector('.message-bubble');
            if (bEl) window.attachDiscordOgEmbed(bEl, ogUrl);
          }
        } else if (msg._decryptedErrorText) {
          textSpan.innerHTML = escapeHtml(msg._decryptedErrorText);
        } else if (isEnc) {
          textSpan.innerHTML = '<span class="covo-msg-loading-shimmer inline-block w-28 sm:w-36 h-3.5 bg-gray-300/60 dark:bg-slate-700/60 rounded-md animate-pulse align-middle" aria-label="読み込み中"></span>';
        } else {
          textSpan.innerHTML = escapeHtmlAndLinkUrls(msg.text);
          const ogUrl = window.extractFirstOgUrl ? window.extractFirstOgUrl(msg.text) : null;
          if (ogUrl && window.attachDiscordOgEmbed) {
            const bEl = row.querySelector('.message-bubble');
            if (bEl) window.attachDiscordOgEmbed(bEl, ogUrl);
          }
        }
      }
      const bubbleElement = row.querySelector('.message-bubble');
      if (bubbleElement) updateReactionsUI(bubbleElement, msg);
      const replyQuoteText = row.querySelector('.reply-quote-text');
      if (replyQuoteText && msg.replyTo) {
        const replyRaw = msg.replyTo._decryptedErrorText || msg.replyTo.text || '（ファイル）';
        const isReplyEnc = isEncrypted(replyRaw) || (typeof replyRaw === 'string' && replyRaw.startsWith('enc::'));
        if (isReplyEnc) {
          replyQuoteText.innerHTML = '<span class="inline-block w-20 h-2.5 bg-gray-300/60 dark:bg-slate-700/60 rounded animate-pulse align-middle"></span>';
        } else {
          replyQuoteText.textContent = replyRaw.length > 40 ? replyRaw.slice(0, 40) + '…' : replyRaw;
        }
      }
      existingRowsMap.delete(msg.id);
    } else {
      row = createMessageElement(msg, msg.id, readCount);
    }
    expectedElements.push(row);
    const currentDay = getDayString(getMsgTimestamp(msg));
    const nextMsgDay = (i < reversedMessages.length - 1) ? getDayString(getMsgTimestamp(reversedMessages[i + 1])) : null;
    if (currentDay && currentDay !== nextMsgDay) {
      let div = existingDividersMap.get(currentDay);
      if (div) {
        existingDividersMap.delete(currentDay);
      } else {
        div = document.createElement("div");
        div.className = "date-divider flipped";
        div.innerHTML = `<div class="date-divider-inner">${currentDay}</div>`;
      }
      expectedElements.push(div);
    }
  });

  // Discord本家完全準拠 DM Welcome Hero Header（画像2中央上部完全準拠）
  if (currentDmId && currentDmParticipant) {
    let hero = document.getElementById('dmHeroWelcomeBanner');
    if (!hero) {
      hero = document.createElement('div');
      hero.id = 'dmHeroWelcomeBanner';
      hero.className = 'dm-welcome-banner flipped select-none';
    }
    const safeNick = escapeHtml(currentDmParticipant.nickname || 'ユーザー');
    const safeAv = isUsableAvatarUrl(currentDmParticipant.avatarUrl) 
      ? `<img src="${escapeHtml(currentDmParticipant.avatarUrl)}" class="w-20 h-20 rounded-full object-cover shadow-lg border-2 border-indigo-500/20">`
      : `<div class="w-20 h-20 rounded-full bg-slate-700 text-white font-bold text-3xl flex items-center justify-center shadow-lg">${safeNick.charAt(0)}</div>`;
    const targetUid = currentDmParticipant.uid;
    const handleTag = targetUid ? `${targetUid.slice(-4).toLowerCase()}` : '';
    let mutualServersCount = 0;
    if (Array.isArray(allServersCache)) {
      mutualServersCount = allServersCache.filter(s => (s.joinedUsers || []).includes(targetUid) && (s.joinedUsers || []).includes(userId)).length;
    }
    const rel = friendRelationships[targetUid];
    const isFriend = rel?.status === 'friends';
    const friendActionText = isFriend ? 'フレンドを削除' : 'フレンド申請を送信';
    hero.innerHTML = `
      <div class="dm-hero-avatar mb-3.5">
        ${safeAv}
      </div>
      <h2 class="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mb-1 tracking-tight">${safeNick}</h2>
      <div class="text-sm font-semibold text-gray-500 dark:text-gray-400 font-mono mb-2">${handleTag}</div>
      <p class="text-xs sm:text-sm text-gray-600 dark:text-gray-300 font-normal mb-5 leading-relaxed">
        ここが、あなたと <strong>${safeNick}</strong> のDM履歴の先頭です。
      </p>
      <div class="flex items-center gap-2.5 flex-wrap">
        <button onclick="window.openUserProfileModal('${_jsq(targetUid)}', '${_jsq(currentDmParticipant.nickname || '')}', '${_jsq(currentDmParticipant.avatarUrl || '')}')" class="dm-hero-action-btn">
          <div class="w-4 h-4 rounded-full bg-slate-600 flex items-center justify-center text-[9px] text-white mr-1.5"><i class="fas fa-server"></i></div>
          <span>${mutualServersCount}個の共通サーバー</span>
        </button>
        <button onclick="window.handleDmHeroFriendAction('${_jsq(targetUid)}', '${_jsq(safeNick)}')" class="dm-hero-action-btn" id="dmHeroFriendBtn">
          ${isFriend ? '<i class="fas fa-user-minus mr-1.5 text-xs text-gray-400"></i>' : '<i class="fas fa-user-plus mr-1.5 text-xs text-[#5865f2]"></i>'}${friendActionText}
        </button>
        <button onclick="window.blockUser('${_jsq(targetUid)}')" class="dm-hero-action-btn !text-rose-500 hover:!bg-rose-50 dark:hover:!bg-rose-950/40">
          <i class="fas fa-ban mr-1.5 text-xs"></i>ブロック
        </button>
      </div>
    `;
    expectedElements.push(hero);
  } else {
    const hero = document.getElementById('dmHeroWelcomeBanner');
    if (hero) hero.remove();
  }

  // 2. 実際のDOMとexpectedElementsを先頭から順に照合。同一要素ならinsertBefore等の再配置を一切スキップ！
  // これにより既存要素のLayout Thrashingやアニメーション再発火（パッとなる現象）が100%根絶される
  let currentChild = messagesDisplay.firstElementChild;
  for (const expectedEl of expectedElements) {
    if (currentChild === expectedEl) {
      currentChild = currentChild.nextElementSibling;
    } else {
      messagesDisplay.insertBefore(expectedEl, currentChild);
    }
  }

  // 3. 削除された不要なメッセージや古くなったディバイダーを取り除く
  existingRowsMap.forEach(row => row.remove());
  existingDividersMap.forEach(div => div.remove());

  // スピナーや終端メッセージは過去のメッセージの「さらに上」（DOM上は最後尾）に配置
  const spinner = document.getElementById('topLoadingSpinner');
  if (spinner) {

    spinner.style.display = isLoadingOlderMessages ? 'flex' : 'none';
  }

  // 未読の境界線（検索中は出さない。filteredMessages は時系列昇順の filteredMessages を使う）
  if (!searchQuery) {
    const boundaryId = resolveUnreadBoundaryMessageId(filteredMessages);
    renderUnreadDivider(boundaryId);
  } else {
    const existing = messagesDisplay.querySelector('.unread-divider');
    if (existing) existing.remove();
  }
}
