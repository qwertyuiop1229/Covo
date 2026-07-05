const fs = require('fs');

let m = fs.readFileSync('index.html', 'utf8');

const target = `// 3. Firestore / D1 メチEージ削除
        try {
          
            await deleteDoc(doc(db, \`artifacts/\${appId}/servers/\${currentServerId}/rooms/\${currentRoomId}/messages\`, msgToDelete.id));
          alertMessage("削除しました", "success");
        } catch (e) {`;

const targetRegex = /\/\/ 3\. Firestore \/ D1 .*?\n\s*try \{\n\s*await deleteDoc\(doc\(db, `artifacts\/\$\{appId\}\/servers\/\$\{currentServerId\}\/rooms\/\$\{currentRoomId\}\/messages`, msgToDelete\.id\)\);\n\s*alertMessage\("削除しました", "success"\);\n\s*\} catch \(e\) \{/g;

// I'll search for 'await deleteDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`, msgToDelete.id));'
let targetStr = 'await deleteDoc(doc(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`, msgToDelete.id));';

if (m.includes(targetStr)) {
    let replaceStr = `await deleteDoc(doc(db, \`artifacts/\${appId}/servers/\${currentServerId}/rooms/\${currentRoomId}/messages\`, msgToDelete.id));
          try {
            const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
            const rtdb = await _getOrInitRTDB();
            await remove(ref(rtdb, \`artifacts/\${appId}/servers/\${currentServerId}/rooms/\${currentRoomId}/messages/\${msgToDelete.id}\`));
          } catch(err) { console.error("RTDB Dual Delete Failed", err); }`;
    
    m = m.replace(targetStr, replaceStr);
    console.log("Replaced deleteMessage.");
    fs.writeFileSync('index.html', m, 'utf8');
} else {
    console.log("Could not find deleteMessage.");
}
