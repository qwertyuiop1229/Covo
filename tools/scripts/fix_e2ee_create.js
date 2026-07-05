const fs = require('fs');

let migStr = fs.readFileSync('index_migrated.html', 'utf8');

// 1. Fix createServer
const createServerTarget = `      await addDoc(collection(db, \`artifacts/\${appId}/servers/\${customId}/rooms\`), {
        name: "一般",
        createdAt: serverTimestamp(),
        createdBy: userId
      });`.replace(/\n/g, '\r\n');

const createServerReplace = `      const newRoomRef = await addDoc(collection(db, \`artifacts/\${appId}/servers/\${customId}/rooms\`), {
        name: "一般",
        createdAt: serverTimestamp(),
        createdBy: userId
      });
      try {
        const b64 = await crypto.subtle.exportKey("raw", await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])).then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))));
        await updateDoc(newRoomRef, { sharedKey: b64, currentKeyVersion: 1 });
      } catch (e) { console.error("E2EE key gen failed", e); }`.replace(/\n/g, '\r\n');

if (migStr.includes(createServerTarget)) {
    migStr = migStr.replace(createServerTarget, createServerReplace);
    console.log('Fixed createServer E2EE');
} else {
    console.log('Target 1 not found');
}

// 2. Fix createRoomInServerBtn
const createRoomTarget = `        try {
          await addDoc(collection(db, \`artifacts/\${appId}/servers/\${currentServerId}/rooms\`), {
            name, createdAt: serverTimestamp(), createdBy: userId
          });`.replace(/\n/g, '\r\n');

const createRoomReplace = `        try {
          const catSelect = document.getElementById("newRoomCategorySelect");
          const categoryId = catSelect ? catSelect.value : "";
          const roomData = { name, createdAt: serverTimestamp(), createdBy: userId };
          if (categoryId) roomData.categoryId = categoryId;
          const newRoomRef = await addDoc(collection(db, \`artifacts/\${appId}/servers/\${currentServerId}/rooms\`), roomData);
          try {
            const b64 = await crypto.subtle.exportKey("raw", await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])).then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))));
            await updateDoc(newRoomRef, { sharedKey: b64, currentKeyVersion: 1 });
          } catch (e) { console.error("E2EE key gen failed", e); }`.replace(/\n/g, '\r\n');

if (migStr.includes(createRoomTarget)) {
    migStr = migStr.replace(createRoomTarget, createRoomReplace);
    console.log('Fixed createRoomInServerBtn E2EE');
} else {
    console.log('Target 2 not found');
}

fs.writeFileSync('index_migrated.html', migStr, 'utf8');
console.log('Done fixing E2EE on creation');
