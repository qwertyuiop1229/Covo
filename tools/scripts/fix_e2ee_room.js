const fs = require('fs');

let migStr = fs.readFileSync('index_migrated.html', 'utf8');

const targetStr = `        try {\r
          await addDoc(collection(db, \`artifacts/\${appId}/servers/\${currentServerId}/rooms\`), {\r
            name, createdAt: serverTimestamp(), createdBy: userId\r
          });`;

const replaceStr = `        try {\r
          const catSelect = document.getElementById("newRoomCategorySelect");\r
          const categoryId = catSelect ? catSelect.value : "";\r
          const roomData = { name, createdAt: serverTimestamp(), createdBy: userId };\r
          if (categoryId) roomData.categoryId = categoryId;\r
          const newRoomRef = await addDoc(collection(db, \`artifacts/\${appId}/servers/\${currentServerId}/rooms\`), roomData);\r
          try {\r
            const b64 = await crypto.subtle.exportKey("raw", await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])).then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))));\r
            await updateDoc(newRoomRef, { sharedKey: b64, currentKeyVersion: 1 });\r
          } catch (e) { console.error("E2EE key gen failed", e); }`;

if (migStr.includes(targetStr)) {
    migStr = migStr.replace(targetStr, replaceStr);
    console.log('Fixed createRoomInServerBtn E2EE');
    fs.writeFileSync('index_migrated.html', migStr, 'utf8');
} else {
    console.log('Target not found');
}
