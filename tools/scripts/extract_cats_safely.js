const fs = require('fs');

const indexStr = fs.readFileSync('index.html', 'utf8');
let migStr = fs.readFileSync('index_migrated.html', 'utf8');

function replaceFunction(funcName) {
    const startStr = 'function ' + funcName + '(';
    
    let idxStart = indexStr.indexOf(startStr);
    if(idxStart === -1) {
        idxStart = indexStr.indexOf('async ' + startStr);
        if(idxStart === -1) return;
    }
    
    let i = indexStr.indexOf('{', idxStart);
    let braces = 1;
    i++;
    while(braces > 0 && i < indexStr.length) {
        if(indexStr[i] === '{') braces++;
        if(indexStr[i] === '}') braces--;
        i++;
    }
    const funcBody = indexStr.substring(idxStart, i);
    
    let migIdxStart = migStr.indexOf(startStr);
    if(migIdxStart === -1) {
        migIdxStart = migStr.indexOf('async ' + startStr);
        if(migIdxStart === -1) return;
    }
    
    let j = migStr.indexOf('{', migIdxStart);
    let migBraces = 1;
    j++;
    while(migBraces > 0 && j < migStr.length) {
        if(migStr[j] === '{') migBraces++;
        if(migStr[j] === '}') migBraces--;
        j++;
    }
    
    migStr = migStr.substring(0, migIdxStart) + funcBody + migStr.substring(j);
    console.log('Replaced ' + funcName);
}

replaceFunction('renderRoomsListUI');
replaceFunction('renderRooms');

const toggleCode = `
    window.toggleCategory = function(catId) {
      if(!currentServerData) return;
      let cats = currentServerData.categories || {};
      if(Array.isArray(cats)) {
         let newCats = {};
         cats.forEach(c => { newCats[c.id] = c; });
         cats = newCats;
      }
      if(cats[catId]) {
         cats[catId].isExpanded = !(cats[catId].isExpanded !== false);
         import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js").then(module => {
            const { doc, updateDoc } = module;
            updateDoc(doc(db, \`artifacts/\${appId}/servers/\${currentServerId}\`), { categories: cats });
         });
         const btn = document.querySelector(\`div[onclick="toggleCategory('\${catId}')"] i\`);
         if(btn) {
           btn.style.transform = cats[catId].isExpanded ? "rotate(0deg)" : "rotate(-90deg)";
         }
         const container = document.getElementById(\`cat-rooms-\${catId}\`);
         if(container) {
           container.style.display = cats[catId].isExpanded ? "block" : "none";
         }
      }
    };
`;

const listenerCode = `
    const createCategoryBtn = document.getElementById("createCategoryBtn");
    if(createCategoryBtn) {
      createCategoryBtn.addEventListener("click", async () => {
          const name = prompt("カテゴリー名を入力してください");
          if(!name) return;
          loadingOverlay.classList.remove("hidden");
          try {
            const { doc, updateDoc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            const serverRef = doc(db, \`artifacts/\${appId}/servers/\${currentServerId}\`);
            const snap = await getDoc(serverRef);
            if(snap.exists()) {
                const data = snap.data();
                let cats = data.categories || [];
                if(!Array.isArray(cats)) cats = Object.values(cats);
                const newId = "cat_" + Date.now();
                cats.push({ id: newId, name: name, order: cats.length, isExpanded: true });
                await updateDoc(serverRef, { categories: cats });
                alert("カテゴリーを作成しました");
            }
          } catch(e) {
            console.error("カテゴリー作成エラー", e);
            alert("エラーが発生しました");
          }
          loadingOverlay.classList.add("hidden");
      });
    }
`;

if (migStr.indexOf('toggleCategory') === -1) {
    const renderRoomsListUIIdx = migStr.indexOf('function renderRoomsListUI');
    migStr = migStr.substring(0, renderRoomsListUIIdx) + toggleCode + '\\n\\n' + listenerCode + '\\n\\n      ' + migStr.substring(renderRoomsListUIIdx);
    console.log('Appended toggleCategory and listener');
}

fs.writeFileSync('index_migrated.html', migStr, 'utf8');
console.log('Categories JS ported');
