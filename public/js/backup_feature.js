// Optional feature: dependencies are live getters, never a snapshot of the selected account/channel.
export function installBackupFeature(context) {
// チャット履歴のエクスポート & バックアップ復号ビューア (#101 - 実用化完了)
// ==========================================
let _cachedViewerMessages = [];
let _viewerPage = 0, _viewerRenderGeneration = 0;
async function _derivePassphraseKey(passphrase, salt) {
  const pwUtf8 = new TextEncoder().encode(passphrase);
  const baseKey = await crypto.subtle.importKey('raw', pwUtf8, 'PBKDF2', false, ['deriveKey']);
  return await crypto.subtle.deriveKey({
    name: 'PBKDF2',
    salt: salt,
    iterations: 100000,
    hash: 'SHA-256'
  }, baseKey, {
    name: 'AES-GCM',
    length: 256
  }, false, ['encrypt', 'decrypt']);
}
// 現在のチャットから全メッセージを取得して完全復号するヘルパー
async function _fetchCurrentChannelDecryptedMessages() {
  const serverId = context.currentServerId,
    roomId = context.currentRoomId,
    dmId = context.currentDmId,
    owner = context.userId;
  const participants = [...(context.currentDmParticipants || [])],
    members = [...(context.currentServerData?.joinedUsers || [])];
  if (!roomId && !dmId) return null;
  const currentName = serverId ? `${context.currentServerData?.name || 'server'}_#${context.roomNames[roomId] || roomId}` : `DM_@${context.currentDmParticipant?.nickname || 'user'}`;
  const channelId = dmId ? `dm_${dmId}` : `${serverId}_${roomId}`;
  const merged = new Map();
  let cursor = null;
  while (owner === context.userId) {
    const page = await context.withReadDeadline(context.LocalStore.getMessages(channelId, cursor ? context.getMsgTimestamp(cursor) : null, 100, cursor?.id || null), 3000);
    for (const message of page) merged.set(message.id, message);
    if (page.length < 100) break;
    cursor = [...page].sort(context.compareHistoryMessages)[0];
  }
  const base = dmId ? `artifacts/${context.appId}/dm_messages/${dmId}` : `artifacts/${context.appId}/servers/${serverId}/rooms/${roomId}/messages`;
  let incomplete = false;
  try {
    const rtdb = await context._getOrInitRTDB();
    const {
      endBefore
    } = await import('../vendor/firebase/firebase-database.js');
    cursor = null;
    while (owner === context.userId) {
      const constraints = [context.orderByChild('timestamp'), context.limitToLast(100)];
      if (cursor) constraints.push(endBefore(context.getMsgTimestamp(cursor), cursor.id));
      const snapshot = await context.withReadDeadline(context.get(context.rtdbQuery(context.ref(rtdb, base), ...constraints)));
      const page = Object.entries(snapshot.val() || {}).map(([id, message]) => ({
        ...message,
        id,
        channelId
      })).sort(context.compareHistoryMessages);
      for (const message of page) merged.set(message.id, message);
      if (page.length < 100) break;
      cursor = page[0];
    }
  } catch (_) {
    incomplete = true;
  }
  if (owner !== context.userId) throw new Error('アカウントが変更されました');
  const msgs = [...merged.values()].sort(context.compareHistoryMessages);
  for (let i = 0; i < msgs.length; i += 50) {
    const batch = msgs.slice(i, i + 50);
    if (dmId) await context._decryptDmMessagesInPlace(batch, dmId, participants);else await context.decryptMessagesInPlace(batch, serverId, roomId, members);
    if (owner !== context.userId) throw new Error('アカウントが変更されました');
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (incomplete) context.alertMessage('接続できない履歴は含まれません。端末に保存された履歴を出力します。', 'warning');
  return {
    msgs,
    currentName,
    source: {
      ownerId: owner,
      serverId,
      roomId,
      dmId,
      participants,
      members
    },
    incomplete
  };
}
window.openChatExportModal = function () {
  if (!context.currentRoomId && !context.currentDmId) {
    context.alertMessage('エクスポートするチャット（ルームまたはDM）を開いてください。', 'warning');
    return;
  }
  const modal = document.getElementById('chatExportModal');
  const titleEl = document.getElementById('chatExportChannelTitle');
  if (titleEl) {
    const name = context.currentServerId ? `#${context.roomNames[context.currentRoomId] || context.currentRoomId}` : `@${context.currentDmParticipant?.nickname || 'ユーザー'}`;
    titleEl.textContent = `対象: ${name} のチャット履歴`;
  }
  if (modal) modal.classList.remove('hidden');
};
window.closeChatExportModal = function () {
  const modal = document.getElementById('chatExportModal');
  if (modal) modal.classList.add('hidden');
};
window.executeExportChatFormat = async function (format) {
  context.closeChatExportModal();
  context.alertMessage('チャット履歴を抽出・処理しています...', 'info');
  try {
    const data = await _fetchCurrentChannelDecryptedMessages();
    if (!data) return;
    const {
      msgs,
      currentName,
      source
    } = data;
    const dateStr = new Date().toISOString().slice(0, 10);
    const safeName = currentName.replace(/[\/\\?%*:|"<>]/g, '_');
    if (format === 'txt') {
      let txt = `=== Covo チャットログ: ${currentName} ===\nエクスポート日時: ${new Date().toLocaleString('ja-JP')}\nメッセージ件数: ${msgs.length} 件\n\n`;
      msgs.forEach(m => {
        const time = new Date(m.timestamp || m.createdAt || Date.now()).toLocaleString('ja-JP');
        const sender = m.senderNickname || m.userNickname || 'ユーザー';
        const body = m.text || (m.sticker ? `[スタンプ: ${m.sticker}]` : m.fileName ? `[ファイル: ${m.fileName}]` : '');
        txt += `[${time}] ${sender}: ${body}\n`;
      });
      const blob = new Blob([txt], {
        type: 'text/plain;charset=utf-8'
      });
      _triggerBlobDownload(blob, `covo-${safeName}-${dateStr}.txt`);
      context.alertMessage(`テキストファイル (.txt) を保存しました！`, 'success');
    } else if (format === 'md') {
      let md = `# Covo チャット履歴: ${currentName}\n\n- **エクスポート日時**: ${new Date().toLocaleString('ja-JP')}\n- **メッセージ数**: ${msgs.length} 件\n\n---\n\n`;
      msgs.forEach(m => {
        const time = new Date(m.timestamp || m.createdAt || Date.now()).toLocaleString('ja-JP');
        const sender = m.senderNickname || m.userNickname || 'ユーザー';
        const body = m.text || (m.sticker ? `**[スタンプ]** ${m.sticker}` : m.fileName ? `📁 [${m.fileName}](${m.fileData || m.kvFileUrl || '#'})` : '');
        md += `### ${sender}  <small>(${time})</small>\n${body}\n\n`;
      });
      const blob = new Blob([md], {
        type: 'text/markdown;charset=utf-8'
      });
      _triggerBlobDownload(blob, `covo-${safeName}-${dateStr}.md`);
      context.alertMessage(`Markdownファイル (.md) を保存しました！`, 'success');
    } else if (format === 'json') {
      const payload = {
        app: 'Covo',
        version: 1,
        exportedAt: Date.now(),
        channel: currentName,
        messageCount: msgs.length,
        messages: msgs
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json'
      });
      _triggerBlobDownload(blob, `covo-${safeName}-${dateStr}.json`);
      context.alertMessage(`JSONデータ (.json) を保存しました！`, 'success');
    } else if (format === 'encrypted') {
      const passphrase = await window.showCustomPrompt('バックアップのパスフレーズ（8文字以上）:', '', '暗号化して保存', 'キャンセル', 'password');
      if (!passphrase) return;
      const {
        encodeArchive,
        encodeArchiveBytes
      } = await import('./archive_codec.js');
      const includeFiles = await context.showCustomConfirm('取得できる添付ファイルも含めますか？ 合計64MiBまで同梱し、取得できない添付は一覧に記録します。');
      const attachments = Object.create(null),
        missingAttachments = [];
      let attachmentBytes = 0;
      if (includeFiles) for (const message of msgs) {
        if (source.ownerId !== context.userId) throw new Error('アカウントが変更されました');
        const url = message.fileData || message.kvFileUrl;
        if (!url) continue;
        try {
          if (attachmentBytes + (message.fileSize || 0) > 64 * 1024 * 1024) throw new Error('容量上限');
          const response = await context.withReadDeadline(context.fetchWithMediaCache(url));
          if (!response.ok) throw new Error('取得できません');
          let bytes = await response.arrayBuffer();
          if (message.isFileEncrypted) {
            const key = source.dmId ? await context._getDmKeyWithWait(source.dmId, source.participants, 2000) : await context.getRoomKeyWithWait(source.serverId, source.roomId, source.members, 2000, true);
            bytes = await context.decryptFileE2EE(bytes, key, source.serverId, source.roomId);
          }
          attachmentBytes += bytes.byteLength;
          if (attachmentBytes > 64 * 1024 * 1024) throw new Error('容量上限');
          attachments[message.id] = {
            data: encodeArchiveBytes(bytes),
            type: message.fileType || 'application/octet-stream'
          };
        } catch (error) {
          missingAttachments.push({
            id: message.id,
            name: message.fileName,
            reason: error.message
          });
        }
      }
      if (source.ownerId !== context.userId) throw new Error('アカウントが変更されました');
      const backupContainer = await encodeArchive({
        format: 'covo-backup',
        version: 2,
        exportedAt: Date.now(),
        roomName: currentName,
        messages: msgs,
        attachments,
        missingAttachments
      }, passphrase);
      if (source.ownerId !== context.userId) throw new Error('アカウントが変更されました');
      const blob = new Blob([JSON.stringify(backupContainer)], {
        type: 'application/json'
      });
      _triggerBlobDownload(blob, `covo-backup-${safeName}-${dateStr}.covo-backup`);
      context.alertMessage(`暗号化バックアップを保存しました（未収録の添付: ${missingAttachments.length}件）`, 'success');
    }
  } catch (err) {
    console.error('[Export Error]', err);
    context.alertMessage(`エクスポートに失敗しました: ${err.message}`, 'error');
  }
};
function _triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// インポートしたメッセージ内の暗号文を自端末で復号試行するリカバリー関数
async function _tryDecryptImportedMessages(msgs) {
  if (!msgs || !Array.isArray(msgs)) return;
  for (const m of msgs) {
    if (m.text && typeof m.text === 'string' && context.isEncrypted(m.text)) {
      try {
        if (context.currentServerId && context.currentRoomId) {
          const members = context.currentServerData && context.currentServerData.joinedUsers || [];
          const dec = await context.decryptText(m.text, context.currentServerId, context.currentRoomId, members);
          if (dec && !dec.startsWith('（復号化エラー')) m.text = dec;
        } else if (context.currentDmId) {
          const dmKey = await context._getDmKeyWithWait(context.currentDmId, context.currentDmParticipants, 1500);
          const dec = await context._decryptDmText(m.text, dmKey);
          if (dec && !dec.startsWith('（復号化エラー')) m.text = dec;
        }
      } catch (_) {}
    }
  }
}

// バックアップインポート & ビューア展開
window.openChatBackupViewerFilePicker = function () {
  const fileInp = document.createElement('input');
  fileInp.type = 'file';
  fileInp.accept = '.covo-backup,.json,.txt,.md';
  fileInp.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.name.endsWith('.covo-backup')) {
        if (file.size > 180 * 1024 * 1024) throw new Error('バックアップのサイズが大きすぎます');
        const backupData = JSON.parse(await file.text());
        await context.openEncryptedLocalArchive(backupData, true);
      } else if (file.name.endsWith('.json')) {
        const text = await file.text();
        const payload = JSON.parse(text);
        const msgs = Array.isArray(payload) ? payload : payload.messages || [];
        await _tryDecryptImportedMessages(msgs);
        context.openChatBackupViewerModal(payload.channel || payload.roomName || file.name, msgs, payload.exportedAt, false);
      } else if (file.name.endsWith('.md')) {
        const text = await file.text();
        const parsed = _parseCovoMdBackup(file.name, text);
        context.openChatBackupViewerModal(parsed.title, parsed.messages, parsed.exportedAt, false);
      } else {
        const text = await file.text();
        const parsed = _parseCovoTxtBackup(file.name, text);
        context.openChatBackupViewerModal(parsed.title, parsed.messages, parsed.exportedAt, false);
      }
    } catch (err) {
      console.error('[Backup View Error]', err);
      context.alertMessage(`ファイル読み込みエラー: ${err.message}`, 'error');
    }
  };
  fileInp.click();
};

// Covo エクスポート TXT のスマートパーサー
function _parseCovoTxtBackup(filename, rawText) {
  const lines = rawText.split(/\r?\n/);
  let title = filename.replace(/\.[^/.]+$/, "");
  let exportedAt = Date.now();
  const messages = [];
  let currentMsg = null;

  // メッセージ行判定: [2026/09/30 21:01:23] 送信者名: 本文
  const msgRegex = /^\[(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*?):\s*(.*)$/;
  // ヘッダー判定: === Covo チャットログ: ... ===
  const headerRegex = /^===\s*Covo\s*チャットログ:\s*(.*?)\s*===$/;
  const exportDateRegex = /^エクスポート日時:\s*(.*?)$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    // ヘッダー情報の抽出（メッセージには含めない）
    const headerMatch = trimmed.match(headerRegex);
    if (headerMatch) {
      title = headerMatch[1];
      continue;
    }
    const exportDateMatch = trimmed.match(exportDateRegex);
    if (exportDateMatch) {
      const parsedDate = new Date(exportDateMatch[1]).getTime();
      if (!isNaN(parsedDate) && parsedDate > 0) exportedAt = parsedDate;
      continue;
    }
    if (trimmed.startsWith('メッセージ件数:')) {
      continue;
    }

    // メッセージ行のパース
    const msgMatch = line.match(msgRegex);
    if (msgMatch) {
      if (currentMsg) messages.push(currentMsg);
      const timeStr = msgMatch[1];
      const sender = msgMatch[2].trim() || 'ユーザー';
      let content = msgMatch[3];
      const ts = new Date(timeStr).getTime() || Date.now();
      let sticker = null;
      let fileName = null;
      // [スタンプ: 👍] の抽出
      const stickerMatch = content.match(/^\[スタンプ:\s*(.*)\]$/);
      if (stickerMatch) {
        sticker = stickerMatch[1].trim();
        content = '';
      }
      // [ファイル: photo.png] の抽出
      const fileMatch = content.match(/^\[ファイル:\s*(.*)\]$/);
      if (fileMatch) {
        fileName = fileMatch[1].trim();
        content = '';
      }
      currentMsg = {
        id: `txt_${messages.length}_${Date.now()}`,
        senderNickname: sender,
        text: content,
        sticker,
        fileName,
        timestamp: ts
      };
    } else if (currentMsg) {
      // 直前メッセージの複数行本文
      currentMsg.text = currentMsg.text ? `${currentMsg.text}\n${line}` : line;
    } else {
      // 形式に合わない一般的なテキスト行
      messages.push({
        id: `txt_raw_${messages.length}`,
        senderNickname: 'ログ',
        text: line,
        timestamp: exportedAt
      });
    }
  }
  if (currentMsg) messages.push(currentMsg);
  return {
    title,
    messages,
    exportedAt
  };
}

// Covo エクスポート Markdown のスマートパーサー
function _parseCovoMdBackup(filename, rawText) {
  const lines = rawText.split(/\r?\n/);
  let title = filename.replace(/\.[^/.]+$/, "");
  let exportedAt = Date.now();
  const messages = [];
  let currentMsg = null;

  // # Covo チャット履歴: ...
  const titleRegex = /^#\s*Covo\s*チャット履歴:\s*(.*)$/;
  // ### 送信者  <small>(2026/09/30 21:01:23)</small>
  const msgHeaderRegex = /^###\s+(.*?)(?:\s+<small>\((.*?)\)<\/small>)?$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed === '---') continue;
    const titleMatch = trimmed.match(titleRegex);
    if (titleMatch) {
      title = titleMatch[1];
      continue;
    }
    if (trimmed.startsWith('- **エクスポート日時**:')) {
      const dStr = trimmed.replace('- **エクスポート日時**:', '').trim();
      const parsedDate = new Date(dStr).getTime();
      if (!isNaN(parsedDate) && parsedDate > 0) exportedAt = parsedDate;
      continue;
    }
    if (trimmed.startsWith('- **メッセージ数**:')) {
      continue;
    }
    const msgHeaderMatch = line.match(msgHeaderRegex);
    if (msgHeaderMatch) {
      if (currentMsg) messages.push(currentMsg);
      const sender = msgHeaderMatch[1].trim() || 'ユーザー';
      const timeStr = msgHeaderMatch[2] ? msgHeaderMatch[2].trim() : '';
      const ts = timeStr ? new Date(timeStr).getTime() || Date.now() : Date.now();
      currentMsg = {
        id: `md_${messages.length}_${Date.now()}`,
        senderNickname: sender,
        text: '',
        sticker: null,
        fileName: null,
        fileData: null,
        timestamp: ts
      };
    } else if (currentMsg) {
      // スタンプの抽出: **[スタンプ]** 👍
      const stickerMatch = trimmed.match(/^\*\*\[スタンプ\]\*\*\s*(.*)$/);
      if (stickerMatch) {
        currentMsg.sticker = stickerMatch[1].trim();
        continue;
      }
      // ファイルリンクの抽出: 📁 [fileName](url)
      const fileMatch = trimmed.match(/^📁\s*\[(.*?)\]\((.*?)\)$/);
      if (fileMatch) {
        currentMsg.fileName = fileMatch[1].trim();
        currentMsg.fileData = fileMatch[2].trim() !== '#' ? fileMatch[2].trim() : null;
        continue;
      }
      // 通常の本文行
      currentMsg.text = currentMsg.text ? `${currentMsg.text}\n${line}` : line;
    }
  }
  if (currentMsg) messages.push(currentMsg);
  return {
    title,
    messages,
    exportedAt
  };
}
let _viewerExportedDateStr = '';
let _viewerIsEncrypted = false;
window.openChatBackupViewerModal = async function (title, messages, exportedAt, isEncrypted = false) {
  _viewerPage = 0;
  _cachedViewerMessages = messages || [];
  _viewerIsEncrypted = isEncrypted;
  _viewerExportedDateStr = exportedAt ? new Date(exportedAt).toLocaleDateString('ja-JP') : '';
  const modal = document.getElementById('chatBackupViewerModal');
  const titleEl = document.getElementById('viewerHeaderTitle');
  const searchInp = document.getElementById('viewerSearchInput');
  const clearBtn = document.getElementById('viewerSearchClearBtn');
  if (searchInp) searchInp.value = '';
  if (clearBtn) clearBtn.classList.add('hidden');
  if (titleEl) titleEl.textContent = title || 'チャットバックアップ';
  updateViewerHeaderMeta(_cachedViewerMessages.length, _cachedViewerMessages.length);
  if (modal) modal.classList.remove('hidden');
  await renderViewerTimeline(_cachedViewerMessages);
};
function updateViewerHeaderMeta(matchedCount, totalCount) {
  const metaEl = document.getElementById('viewerHeaderMeta');
  if (!metaEl) return;
  const encBadge = _viewerIsEncrypted ? `<span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold mr-2"><i class="fas fa-lock text-[10px]"></i>暗号化保護</span>` : '';
  const countText = matchedCount === totalCount ? `${totalCount} 件のメッセージ ${_viewerExportedDateStr ? `• ${_viewerExportedDateStr}` : ''}` : `${matchedCount} 件ヒット / 全 ${totalCount} 件 ${_viewerExportedDateStr ? `• ${_viewerExportedDateStr}` : ''}`;
  metaEl.innerHTML = `${encBadge}<span>${countText}</span>`;
}
window.closeChatBackupViewerModal = function () {
  ++_viewerRenderGeneration;
  const modal = document.getElementById('chatBackupViewerModal');
  if (modal) modal.classList.add('hidden');
  _cachedViewerMessages = [];
  for (const url of context._archiveBlobUrls) URL.revokeObjectURL(url);
  context._archiveBlobUrls.clear();
  _viewerExportedDateStr = '';
  _viewerIsEncrypted = false;
};

// 復号化ビューアのタイムライン描画 (いつものチャット画面と同じリッチスタイル)
async function renderViewerTimeline(msgs) {
  const generation = ++_viewerRenderGeneration, owner = context.userId;
  const container = document.getElementById('viewerTimelineContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!msgs || msgs.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-xs text-gray-400 dark:text-gray-500">表示できるメッセージがありません</div>';
    return;
  }

  // 暗号文が残っていれば復号を試みる
  const end = Math.max(0, msgs.length - _viewerPage * 100), start = Math.max(0, end - 100);
  const page = msgs.slice(start, end);
  await _tryDecryptImportedMessages(page);
  if (generation !== _viewerRenderGeneration || owner !== context.userId) return;
  if (msgs.length > 100) {
    const controls = document.createElement('nav'); controls.className = 'backup-viewer-pagination'; controls.setAttribute('aria-label', 'アーカイブのページ切替');
    const older = document.createElement('button'); older.type = 'button'; older.className = 'covo-button covo-button-secondary'; older.textContent = '前の100件'; older.disabled = start === 0; older.onclick = () => { ++_viewerPage; renderViewerTimeline(msgs); };
    const newer = document.createElement('button'); newer.type = 'button'; newer.className = 'covo-button covo-button-secondary'; newer.textContent = '次の100件'; newer.disabled = _viewerPage === 0; newer.onclick = () => { --_viewerPage; renderViewerTimeline(msgs); };
    const count = document.createElement('span'); count.className = 'backup-pagination-count'; count.setAttribute('role', 'status'); count.textContent = `${start + 1}–${end} / ${msgs.length}件`;
    controls.append(older, count, newer); container.appendChild(controls);
  }
  let lastDateStr = '';
  page.forEach(m => {
    const isMe = m.senderId === context.userId || m.userId === context.userId;
    const ts = m.timestamp || m.createdAt || Date.now();
    const d = new Date(ts);
    const dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    if (dateStr !== lastDateStr) {
      lastDateStr = dateStr;
      const div = document.createElement('div');
      div.className = 'date-divider my-4 text-center';
      div.innerHTML = `<span class="date-divider-inner px-3 py-1 rounded-full text-[11px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 select-none">${d.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        weekday: 'short'
      })}</span>`;
      container.appendChild(div);
    }
    const row = document.createElement('div');
    row.className = `w-full flex ${isMe ? 'justify-end' : 'justify-start items-start gap-2'} mb-3 select-text`;
    const nick = context.escapeHtml(m.senderNickname || m.userNickname || 'ユーザー');
    const timeStr = d.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit'
    });
    if (!isMe) {
      const avatar = document.createElement('div');
      avatar.className = 'w-8 h-8 rounded-full bg-slate-700 text-white font-bold flex items-center justify-center text-xs flex-shrink-0 overflow-hidden mt-0.5';
      if (m.senderAvatarUrl && context.isUsableAvatarUrl(m.senderAvatarUrl)) {
        context.__setAvatarImg(avatar, m.senderAvatarUrl, nick, {
          style: 'width:100%;height:100%;object-fit:cover;'
        });
      } else {
        avatar.textContent = nick.charAt(0).toUpperCase();
      }
      row.appendChild(avatar);
    }
    const bubbleCol = document.createElement('div');
    bubbleCol.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[80%]`;
    if (!isMe) {
      const nameEl = document.createElement('div');
      nameEl.className = 'text-[11px] font-bold text-gray-500 dark:text-slate-400 mb-1';
      nameEl.textContent = nick;
      bubbleCol.appendChild(nameEl);
    }

    // リプライ引用
    if (m.replyTo) {
      const replyDiv = document.createElement('div');
      replyDiv.className = `reply-quote text-xs text-gray-500 mb-1 ${isMe ? 'my-reply' : ''}`;
      replyDiv.innerHTML = `<span class="font-bold mr-1">${context.escapeHtml(m.replyTo.senderNickname || 'ユーザー')}:</span><span class="truncate">${context.escapeHtml(m.replyTo.text || '...')}</span>`;
      bubbleCol.appendChild(replyDiv);
    }
    const bubble = document.createElement('div');
    const isSticker = !!m.sticker;
    bubble.className = isSticker ? 'message-bubble sticker-bubble' : `message-bubble ${isMe ? 'my-message bg-gray-200 dark:bg-[#2a3a52] text-gray-900 dark:text-gray-100' : 'other-message bg-gray-100 dark:bg-[#243040] text-gray-900 dark:text-gray-100'} px-3.5 py-2 rounded-2xl text-xs leading-relaxed break-words shadow-xs`;
    if (m.sticker) {
      const stDiv = document.createElement('div');
      stDiv.className = 'sticker-content text-4xl';
      stDiv.innerHTML = context.getEmojiHtml(m.sticker, 'sk-em');
      bubble.appendChild(stDiv);
      context._twemojiParse(stDiv);
    } else if (m.text) {
      const txtSpan = document.createElement('span');
      txtSpan.className = 'message-content';
      txtSpan.innerHTML = context.escapeHtmlAndLinkUrls(m.text);
      bubble.appendChild(txtSpan);
    }

    // 画像・動画・添付ファイル
    if (m.fileData || m.kvFileUrl) {
      const rawFileUrl = m._decryptedFileUrl || m.fileData || m.kvFileUrl;
      const fUrl = context._archiveBlobUrls.has(rawFileUrl) || /^https?:\/\//i.test(String(rawFileUrl || '')) ? rawFileUrl : '';
      if (!fUrl) return;
      if (m.fileType && m.fileType.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = fUrl;
        img.className = 'mt-2 rounded-xl max-w-full max-h-48 object-contain cursor-pointer shadow-sm';
        img.onclick = () => context.openPhotoSwipeModal(fUrl, m.fileName);
        bubble.appendChild(img);
      } else if (m.fileType && m.fileType.startsWith('video/')) {
        const vid = document.createElement('video');
        vid.src = fUrl;
        vid.controls = true;
        vid.className = 'mt-2 rounded-xl max-w-full max-h-48 shadow-sm';
        bubble.appendChild(vid);
      } else {
        const fileCard = document.createElement('div');
        fileCard.className = 'mt-2 p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center gap-2 text-[11px] font-medium';
        fileCard.innerHTML = `<i class="fas fa-file text-indigo-500"></i><span class="truncate flex-1">${context.escapeHtml(m.fileName || '添付ファイル')}</span><a href="${context.escapeHtml(fUrl)}" download="${context.escapeHtml(m.fileName || 'file')}" class="text-indigo-500 hover:underline"><i class="fas fa-download"></i></a>`;
        bubble.appendChild(fileCard);
      }
    }
    const timeEl = document.createElement('span');
    timeEl.className = 'text-[9px] text-gray-400 font-mono mt-1 px-1';
    timeEl.textContent = timeStr;
    const rowWrapper = document.createElement('div');
    rowWrapper.className = `flex items-end gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`;
    rowWrapper.appendChild(bubble);
    rowWrapper.appendChild(timeEl);
    bubbleCol.appendChild(rowWrapper);
    row.appendChild(bubbleCol);
    container.appendChild(row);
  });
}
function openTextFileAsViewer(filename, text) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const fakeMsgs = lines.map((l, i) => ({
    id: `txt_${i}`,
    senderNickname: 'ログ',
    text: l,
    timestamp: Date.now()
  }));
  context.openChatBackupViewerModal(filename, fakeMsgs, Date.now());
}
window.clearViewerSearch = function () {
  const inp = document.getElementById('viewerSearchInput');
  if (inp) {
    inp.value = '';
    window.filterViewerMessages('');
  }
};
window.filterViewerMessages = function (query) {
  _viewerPage = 0;
  const clearBtn = document.getElementById('viewerSearchClearBtn');
  const q = (query || '').toLowerCase().trim();
  if (clearBtn) clearBtn.classList.toggle('hidden', !q);
  const totalCount = _cachedViewerMessages ? _cachedViewerMessages.length : 0;
  if (!q) {
    updateViewerHeaderMeta(totalCount, totalCount);
    renderViewerTimeline(_cachedViewerMessages);
    return;
  }
  const filtered = _cachedViewerMessages.filter(m => m.text && m.text.toLowerCase().includes(q) || m.senderNickname && m.senderNickname.toLowerCase().includes(q) || m.userNickname && m.userNickname.toLowerCase().includes(q) || m.fileName && m.fileName.toLowerCase().includes(q) || m.sticker && m.sticker.toLowerCase().includes(q));
  updateViewerHeaderMeta(filtered.length, totalCount);
  renderViewerTimeline(filtered);
};
window.saveViewerMessagesAsTxt = function () {
  if (!_cachedViewerMessages || _cachedViewerMessages.length === 0) return;
  const title = document.getElementById('viewerHeaderTitle')?.textContent || 'chat';
  let txt = `=== Covo チャットログ: ${title} ===\nエクスポート日時: ${new Date().toLocaleString('ja-JP')}\nメッセージ件数: ${_cachedViewerMessages.length} 件\n\n`;
  _cachedViewerMessages.forEach(m => {
    const time = new Date(m.timestamp || m.createdAt || Date.now()).toLocaleString('ja-JP');
    const sender = m.senderNickname || m.userNickname || 'ユーザー';
    const body = m.text || (m.sticker ? `[スタンプ: ${m.sticker}]` : m.fileName ? `[ファイル: ${m.fileName}]` : '');
    txt += `[${time}] ${sender}: ${body}\n`;
  });
  const blob = new Blob([txt], {
    type: 'text/plain;charset=utf-8'
  });
  _triggerBlobDownload(blob, `${title.replace(/[\/\\?%*:|"<>]/g, '_')}-export.txt`);
  context.alertMessage('テキストファイルとして保存しました！', 'success');
};

// =========================================================================

}
