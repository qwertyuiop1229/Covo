const fs = require('fs');
let code = fs.readFileSync('public/index.html', 'utf8');

// 1. HTML Replacement
const htmlTarget = `                  <div class="flex flex-col md:flex-row gap-3 mb-4 mt-4">
                    <div class="flex-1 flex gap-2">
                      <input type="text" id="newRoomNameInput" placeholder="新しいルーム名"
                        class="flex-1 p-2.5 bg-[#1e1f22] rounded focus:outline-none text-sm text-white" />
                      <select id="newRoomCategorySelect" class="p-2.5 bg-[#1e1f22] rounded focus:outline-none text-sm text-white border-l border-gray-800">
                        <option value="">カテゴリーなし</option>
                      </select>
                      <button id="createRoomInServerBtn" class="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2.5 rounded text-sm font-bold transition-colors">追加</button>
                    </div>
                    <button id="createCategoryBtn" class="bg-[#4e5058] hover:bg-[#6d6f78] text-white px-4 py-2.5 rounded text-sm font-bold whitespace-nowrap transition-colors"><i class="fas fa-folder-plus mr-1"></i>カテゴリー作成</button>
                  </div>`;
const htmlReplacement = `                  <div class="flex flex-col gap-3 mb-4 mt-4 relative">
                    <div class="flex gap-2 items-stretch w-full z-30">
                      <input type="text" id="newRoomNameInput" placeholder="新しいルーム名"
                        class="flex-1 p-2.5 bg-[#1e1f22] rounded focus:outline-none text-sm text-white min-w-0" />
                      
                      <!-- カスタムセレクト UI -->
                      <div class="relative w-36 sm:w-40 flex-shrink-0" id="newRoomCategorySelectContainer">
                        <button type="button" id="newRoomCategoryCustomBtn" class="w-full h-full bg-[#1e1f22] border-l border-gray-800 rounded-r p-2.5 flex items-center justify-between focus:outline-none text-sm text-white transition-all">
                          <span id="newRoomCategoryLabel" class="truncate mr-2">カテゴリーなし</span>
                          <i class="fas fa-chevron-down text-gray-400 transition-transform duration-200 flex-shrink-0 text-[10px]" id="newRoomCategoryIcon"></i>
                        </button>
                        <div id="newRoomCategoryDropdown" class="absolute right-0 z-[60] w-48 mt-1 bg-[#2b2d31] border border-gray-700 rounded shadow-xl max-h-60 overflow-y-auto hidden opacity-0 transition-opacity duration-200 origin-top">
                          <ul id="newRoomCategoryList" class="py-1">
                             <li class="px-4 py-2 hover:bg-[#3f4147] cursor-pointer text-sm text-white cat-select-option" data-val="">カテゴリーなし</li>
                          </ul>
                        </div>
                        <input type="hidden" id="newRoomCategorySelect" value="" />
                      </div>
                    </div>
                    
                    <div class="flex flex-col sm:flex-row gap-2 justify-end w-full">
                      <button id="createCategoryBtn" class="bg-[#4e5058] hover:bg-[#6d6f78] text-white px-4 py-2.5 rounded text-sm font-bold transition-colors w-full sm:w-auto text-center">
                        <i class="fas fa-folder-plus mr-1"></i>カテゴリー作成
                      </button>
                      <button id="createRoomInServerBtn" class="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2.5 rounded text-sm font-bold transition-colors w-full sm:w-auto text-center">追加</button>
                    </div>
                  </div>`;
if(code.includes(htmlTarget)) {
    code = code.replace(htmlTarget, htmlReplacement);
    console.log("HTML replaced.");
} else {
    console.log("HTML NOT FOUND.");
}

// 2. Fix the missing category populating logic in loadServerSettingsRooms
// I'll inject the category custom dropdown population logic inside loadServerSettingsRooms
const logicTarget = `      let categories = [];
      if (typeof currentServerData !== 'undefined' && currentServerData && currentServerData.categories) {
          categories = currentServerData.categories;
          if(!Array.isArray(categories)) categories = Object.values(categories);
          categories.sort((a,b) => a.order - b.order);
      }`;
const logicReplacement = `      let categories = [];
      if (typeof currentServerData !== 'undefined' && currentServerData && currentServerData.categories) {
          categories = currentServerData.categories;
          if(!Array.isArray(categories)) categories = Object.values(categories);
          categories.sort((a,b) => a.order - b.order);
      }
      
      // Update custom select dropdown
      const catList = document.getElementById("newRoomCategoryList");
      if (catList) {
          catList.innerHTML = \`<li class="px-4 py-2 hover:bg-[#3f4147] cursor-pointer text-sm text-white cat-select-option" data-val="">カテゴリーなし</li>\`;
          categories.forEach(cat => {
              const li = document.createElement("li");
              li.className = "px-4 py-2 hover:bg-[#3f4147] cursor-pointer text-sm text-white cat-select-option truncate";
              li.dataset.val = cat.id;
              li.textContent = cat.name;
              catList.appendChild(li);
          });
          
          document.querySelectorAll('.cat-select-option').forEach(el => {
              el.addEventListener('click', (e) => {
                  const val = e.target.dataset.val;
                  const label = e.target.textContent;
                  document.getElementById('newRoomCategorySelect').value = val;
                  document.getElementById('newRoomCategoryLabel').textContent = label;
                  const dd = document.getElementById('newRoomCategoryDropdown');
                  dd.classList.add('opacity-0');
                  document.getElementById('newRoomCategoryIcon').classList.remove('rotate-180');
                  setTimeout(() => dd.classList.add('hidden'), 200);
              });
          });
      }`;
if(code.includes(logicTarget)) {
    code = code.replace(logicTarget, logicReplacement);
    console.log("Logic injected.");
} else {
    console.log("Logic target NOT FOUND.");
}

// 3. Add event listener for the custom dropdown button and document click-away
// Let's inject this globally in DOMContentLoaded or similar, but the button might not exist initially.
// We can just bind it at the end of loadServerSettingsRooms or in a setTimeout loop.
// Since the modal DOM is always there, we can inject it right after the button is added to DOM.
// We'll put it right after the place where createRoomInServerBtn logic is added.
const btnLogicTarget = `    document.getElementById("createRoomInServerBtn").addEventListener("click", async () => {
      const name = document.getElementById("newRoomNameInput").value.trim();
      if (!name) return;`;
const btnLogicReplacement = `    // Dropdown toggle logic
    document.getElementById('newRoomCategoryCustomBtn')?.addEventListener('click', (e) => {
      const dd = document.getElementById('newRoomCategoryDropdown');
      const icon = document.getElementById('newRoomCategoryIcon');
      if (dd.classList.contains('hidden')) {
        dd.classList.remove('hidden');
        setTimeout(() => { dd.classList.remove('opacity-0'); icon.classList.add('rotate-180'); }, 10);
      } else {
        dd.classList.add('opacity-0');
        icon.classList.remove('rotate-180');
        setTimeout(() => dd.classList.add('hidden'), 200);
      }
    });
    
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#newRoomCategorySelectContainer')) {
        const dd = document.getElementById('newRoomCategoryDropdown');
        if (dd && !dd.classList.contains('hidden')) {
          dd.classList.add('opacity-0');
          document.getElementById('newRoomCategoryIcon')?.classList.remove('rotate-180');
          setTimeout(() => dd.classList.add('hidden'), 200);
        }
      }
    });

    document.getElementById("createRoomInServerBtn").addEventListener("click", async () => {
      const name = document.getElementById("newRoomNameInput").value.trim();
      const categoryId = document.getElementById("newRoomCategorySelect").value || null;
      if (!name) return;`;
if(code.includes(btnLogicTarget)) {
    code = code.replace(btnLogicTarget, btnLogicReplacement);
    console.log("Button logic injected.");
} else {
    console.log("Button logic target NOT FOUND.");
}

fs.writeFileSync('public/index.html', code, 'utf8');
console.log('Update complete.');
