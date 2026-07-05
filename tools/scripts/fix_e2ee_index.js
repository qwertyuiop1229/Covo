const fs = require('fs');

let m = fs.readFileSync('index.html', 'utf8');

// 1. fix createServer
let idx1 = m.indexOf('await addDoc(collection(db, `artifacts/${appId}/servers/${customId}/rooms`), {');
if (idx1 !== -1) {
    let endIdx1 = m.indexOf('});', idx1) + 3;
    let originalStr = m.substring(idx1, endIdx1);
    
    let replaceStr1 = `const newRoomRef = await addDoc(collection(db, \`artifacts/\${appId}/servers/\${customId}/rooms\`), {
        name: "一般",
        createdAt: serverTimestamp(),
        createdBy: userId
      });
      try {
        const b64 = await crypto.subtle.exportKey("raw", await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])).then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))));
        await updateDoc(newRoomRef, { sharedKey: b64, currentKeyVersion: 1 });
      } catch (e) { console.error("E2EE key gen failed", e); }`;
    
    m = m.replace(originalStr, replaceStr1);
    console.log("Replaced createServer room creation.");
} else {
    console.log("Could not find createServer room creation");
}

// 2. fix createRoomInServerBtn
let idx2 = m.indexOf('await addDoc(collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms`), {');
if (idx2 !== -1) {
    let endIdx2 = m.indexOf('});', idx2) + 3;
    let originalStr2 = m.substring(idx2, endIdx2);
    
    let replaceStr2 = `const newRoomRef = await addDoc(collection(db, \`artifacts/\${appId}/servers/\${currentServerId}/rooms\`), {
            name, categoryId, createdAt: serverTimestamp(), createdBy: userId
          });
          try {
            const b64 = await crypto.subtle.exportKey("raw", await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])).then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))));
            await updateDoc(newRoomRef, { sharedKey: b64, currentKeyVersion: 1 });
          } catch (e) { console.error("E2EE key gen failed", e); }`;
          
    m = m.replace(originalStr2, replaceStr2);
    console.log("Replaced createRoomInServerBtn room creation.");
} else {
    console.log("Could not find createRoomInServerBtn room creation");
}

fs.writeFileSync('index.html', m, 'utf8');
console.log("Done.");
