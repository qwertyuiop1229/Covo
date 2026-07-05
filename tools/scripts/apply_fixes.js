const fs = require('fs');
let code = fs.readFileSync('public/index.html', 'utf8');

// Fix 1: PC App Info Bug Report Button
const pcTarget = `                      <button class="" id="pcCheckUpdateBtn" onclick="manualCheckUpdate('pcCheckUpdateBtn','pcCheckUpdateStatus')" style="padding:7px 16px;background:#1f2937;color:white;border:none;border-radius:8px;font-size:0.82rem;font-weight:600;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='#374151'" onmouseout="this.style.background='#1f2937'">アップデートを確認</button>
                      <span id="pcCheckUpdateStatus" style="font-size:0.8rem;color:#6b7280"></span>
                    </div>
                    <div class="flex justify-between items-center" id="pcCreateShortcutRow" style="display:none!important">`;
const pcReplacement = `                      <button class="" id="pcCheckUpdateBtn" onclick="manualCheckUpdate('pcCheckUpdateBtn','pcCheckUpdateStatus')" style="padding:7px 16px;background:#1f2937;color:white;border:none;border-radius:8px;font-size:0.82rem;font-weight:600;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='#374151'" onmouseout="this.style.background='#1f2937'">アップデートを確認</button>
                      <span id="pcCheckUpdateStatus" style="font-size:0.8rem;color:#6b7280"></span>
                    </div>
                    <div class="flex justify-between items-center">
                      <span class="text-sm text-gray-500"><i class="fas fa-bug mr-1"></i>ご意見・バグ報告</span>
                      <button class="" onclick="window.openFeedbackModal()" style="padding:7px 16px;background:#ef4444;color:white;border:none;border-radius:8px;font-size:0.82rem;font-weight:600;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">報告する</button>
                    </div>
                    <div class="flex justify-between items-center" id="pcCreateShortcutRow" style="display:none!important">`;
if(code.includes(pcTarget)) {
    code = code.replace(pcTarget, pcReplacement);
    console.log("PC App Info updated.");
}

// Fix 2: Mobile App Info Bug Report Button
const mobileTarget = `        <div id="mobileCheckUpdateBtn" class="mobile-settings-row" onclick="manualCheckUpdate('mobileCheckUpdateBtn','mobileCheckUpdateStatus')">
          <div class="mobile-settings-row-icon" style="background:#374151;color:#e5e7eb"><i class="fas fa-sync-alt"></i></div>
          <span class="mobile-settings-row-text">アップデートを確認</span>
          <span id="mobileCheckUpdateStatus" style="font-size:0.75rem;color:#6b7280;margin-left:auto"></span>
        </div>
        <div id="mobileCreateShortcutBtn" class="mobile-settings-row"`;
const mobileReplacement = `        <div id="mobileCheckUpdateBtn" class="mobile-settings-row" onclick="manualCheckUpdate('mobileCheckUpdateBtn','mobileCheckUpdateStatus')">
          <div class="mobile-settings-row-icon" style="background:#374151;color:#e5e7eb"><i class="fas fa-sync-alt"></i></div>
          <span class="mobile-settings-row-text">アップデートを確認</span>
          <span id="mobileCheckUpdateStatus" style="font-size:0.75rem;color:#6b7280;margin-left:auto"></span>
        </div>
        <div class="mobile-settings-row" onclick="window.openFeedbackModal()">
          <div class="mobile-settings-row-icon" style="background:#ef4444;color:white"><i class="fas fa-bug"></i></div>
          <span class="mobile-settings-row-text" style="color:#dc2626;font-weight:600">ご意見・バグ報告</span>
          <i class="fas fa-chevron-right mobile-settings-row-arrow"></i>
        </div>
        <div id="mobileCreateShortcutBtn" class="mobile-settings-row"`;
if(code.includes(mobileTarget)) {
    code = code.replace(mobileTarget, mobileReplacement);
    console.log("Mobile App Info updated.");
}

// Fix 3: Duplicate RTDB Delete Logic
const rtdbTarget = `      // 3. Firestore / D1 メッセージ削除
      try {
        
          await deleteDoc(doc(db, \`artifacts/\${appId}/servers/\${currentServerId}/rooms/\${currentRoomId}/messages\`, msgToDelete.id));
          try {
            const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
            const rtdb = await _getOrInitRTDB();
            await remove(ref(rtdb, \`artifacts/\${appId}/servers/\${currentServerId}/rooms/\${currentRoomId}/messages/\${msgToDelete.id}\`));
          } catch(err) { console.error("RTDB Dual Delete Failed", err); }
          try {
            const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
            const rtdb = await _getOrInitRTDB();
            await remove(ref(rtdb, \`artifacts/\${appId}/servers/\${currentServerId}/rooms/\${currentRoomId}/messages/\${msgToDelete.id}\`));
          } catch(e) { console.error("RTDB Delete Failed", e); }
        
        allLoadedMessages`;
const rtdbReplacement = `      // 3. Firestore / D1 / RTDB メッセージ削除
      try {
          await deleteDoc(doc(db, \`artifacts/\${appId}/servers/\${currentServerId}/rooms/\${currentRoomId}/messages\`, msgToDelete.id));
          try {
            const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
            const rtdb = await _getOrInitRTDB();
            await remove(ref(rtdb, \`artifacts/\${appId}/servers/\${currentServerId}/rooms/\${currentRoomId}/messages/\${msgToDelete.id}\`));
          } catch(e) { console.error("RTDB Delete Failed", e); }
        
        allLoadedMessages`;
if(code.includes(rtdbTarget)) {
    code = code.replace(rtdbTarget, rtdbReplacement);
    console.log("Duplicate RTDB delete updated.");
}

// Fix 4: Add RTDB to Server Cascade Delete
const serverDeleteTarget = `      await batchDeleteCollection(collection(db, \`\${base}/inviteCodes\`));
      await batchDeleteCollection(collection(db, \`\${base}/secrets\`));
      await deleteDoc(doc(db, \`artifacts/\${appId}/servers\`, serverId));
    }`;
const serverDeleteReplacement = `      await batchDeleteCollection(collection(db, \`\${base}/inviteCodes\`));
      await batchDeleteCollection(collection(db, \`\${base}/secrets\`));
      await deleteDoc(doc(db, \`artifacts/\${appId}/servers\`, serverId));
      try {
        const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
        const rtdb = await _getOrInitRTDB();
        await remove(ref(rtdb, \`artifacts/\${appId}/servers/\${serverId}\`));
      } catch(err) { console.error("RTDB Server Delete Failed", err); }
    }`;
if(code.includes(serverDeleteTarget)) {
    code = code.replace(serverDeleteTarget, serverDeleteReplacement);
    console.log("Server Cascade RTDB delete updated.");
}

fs.writeFileSync('public/index.html', code, 'utf8');
console.log('Update complete.');
