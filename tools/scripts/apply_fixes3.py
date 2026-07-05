import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. HTML replacement
html_pattern = r'<div class="flex flex-col md:flex-row gap-3 mb-4 mt-4">.*?<button id="createCategoryBtn".*?</button>\s*</div>'
html_replacement = '''<div class="flex flex-col gap-3 mb-4 mt-4 relative">
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
                  </div>'''

if re.search(html_pattern, content, flags=re.DOTALL):
    content = re.sub(html_pattern, html_replacement, content, flags=re.DOTALL)
    print("HTML updated")
else:
    print("HTML NOT FOUND")

# 2. Logic Replacement
logic_pattern = r'(categories\.sort\(\(a,b\) => a\.order - b\.order\);\s*\})'
logic_replacement = r'''\1
      
      const catList = document.getElementById("newRoomCategoryList");
      if (catList) {
          catList.innerHTML = `<li class="px-4 py-2 hover:bg-[#3f4147] cursor-pointer text-sm text-white cat-select-option" data-val="">カテゴリーなし</li>`;
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
      }'''

if re.search(logic_pattern, content):
    content = re.sub(logic_pattern, logic_replacement, content, count=1)
    print("Logic updated")
else:
    print("Logic NOT FOUND")

# 3. Button Logic Replacement
btn_pattern = r'document\.getElementById\("createRoomInServerBtn"\)\.addEventListener\("click", async \(\) => \{\s*const name = document\.getElementById\("newRoomNameInput"\)\.value\.trim\(\);\s*if \(!name\) return;'
btn_replacement = r'''document.getElementById('newRoomCategoryCustomBtn')?.addEventListener('click', (e) => {
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
      if (!name) return;'''

if re.search(btn_pattern, content):
    content = re.sub(btn_pattern, btn_replacement, content)
    print("Btn logic updated")
else:
    print("Btn logic NOT FOUND")

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done!")
