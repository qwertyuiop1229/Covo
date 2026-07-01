import sys
import re

def main():
    file_path = 'public/index.html'
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return

    # Replace the HTML block from 5083 to 5116
    start_str = '              <div id="ssRoomsSection">'
    end_str = '                  <div class="h-px bg-gray-700 w-full my-4"></div>'
    
    start_idx = content.find(start_str)
    end_idx = content.find(end_str, start_idx)
    
    if start_idx == -1 or end_idx == -1:
        print("Could not find the HTML block boundaries.")
        return
        
    replacement_html = """              <div id="ssRoomsSection">
                <div class="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm relative z-40">
                  <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">新しいルームを作成</label>
                  
                  <div class="flex flex-col gap-3">
                    <input type="text" id="newRoomNameInput" placeholder="新しいルーム名"
                      class="w-full p-3 bg-white border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all text-sm text-gray-700" />
                    
                    <div class="relative w-full" id="newRoomCategorySelectContainer">
                      <button type="button" id="newRoomCategoryCustomBtn" class="w-full bg-white border border-gray-300 rounded-xl p-3 flex items-center justify-between shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-400 transition-all text-sm text-gray-700 font-medium">
                        <span id="newRoomCategoryLabel" class="truncate mr-2">カテゴリーなし</span>
                        <i class="fas fa-chevron-down text-gray-400 transition-transform duration-200" id="newRoomCategoryIcon"></i>
                      </button>
                      <div id="newRoomCategoryDropdown" class="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto hidden opacity-0 transition-opacity duration-200 origin-top">
                        <ul id="newRoomCategoryList" class="py-1">
                           <li class="px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm text-gray-700 border-b border-gray-100 last:border-0 cat-select-option" data-val="">カテゴリーなし</li>
                        </ul>
                      </div>
                      <input type="hidden" id="newRoomCategorySelect" value="" />
                    </div>
                    
                    <div class="flex flex-col sm:flex-row gap-2 justify-end mt-2">
                      <button id="createCategoryBtn" class="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center justify-center w-full sm:w-auto">
                        <i class="fas fa-folder-plus mr-1.5 text-gray-400"></i>カテゴリー作成
                      </button>
                      <button id="createRoomInServerBtn" class="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center justify-center w-full sm:w-auto">
                        追加
                      </button>
                    </div>
                  </div>
                </div>
"""
    
    content = content[:start_idx] + replacement_html + content[end_idx:]
    
    # Update the JS for newRoomCategoryList
    js_old = """catList.innerHTML = `<li class="px-4 py-2 hover:bg-[#3f4147] cursor-pointer text-sm text-white cat-select-option" data-val="">カテゴリーなし</li>`;
          categories.forEach(cat => {
              const li = document.createElement("li");
              li.className = "px-4 py-2 hover:bg-[#3f4147] cursor-pointer text-sm text-white cat-select-option truncate";"""
              
    js_new = """catList.innerHTML = `<li class="px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm text-gray-700 border-b border-gray-100 last:border-0 cat-select-option" data-val="">カテゴリーなし</li>`;
          categories.forEach(cat => {
              const li = document.createElement("li");
              li.className = "px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm text-gray-700 border-b border-gray-100 last:border-0 cat-select-option truncate";"""
    
    if js_old in content:
        content = content.replace(js_old, js_new)
        print("JS replacement successful.")
    else:
        print("JS replacement failed! Could not find old JS.")
        return

    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Update applied successfully!")
    except Exception as e:
        print(f"Error writing to file: {e}")

if __name__ == '__main__':
    main()
