const fs = require('fs');

let m = fs.readFileSync('index.html', 'utf8');

const targetStr = `await deleteDoc(doc(db, \`artifacts/\${appId}/servers/\${serverId}/rooms\`, roomId));`;

if (m.includes(targetStr)) {
    let replaceStr = `await deleteDoc(doc(db, \`artifacts/\${appId}/servers/\${serverId}/rooms\`, roomId));
          try {
            const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
            const rtdb = await _getOrInitRTDB();
            await remove(ref(rtdb, \`artifacts/\${appId}/servers/\${serverId}/rooms/\${roomId}\`));
          } catch(err) { console.error("RTDB Room Delete Failed", err); }`;
    
    m = m.replace(targetStr, replaceStr);
    console.log("Replaced deleteRoomAndMessages.");
    fs.writeFileSync('index.html', m, 'utf8');
} else {
    console.log("Could not find deleteRoomAndMessages.");
}
