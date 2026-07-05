const fs = require('fs');
let migStr = fs.readFileSync('index_migrated.html', 'utf8');

const targetStr = `                  <div class="flex gap-2">
                    <input type="text" id="newRoomNameInput" placeholder="新しいルーム名"
                      class="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none text-sm" />
                    <button id="createRoomInServerBtn"
                      class="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all">追加</button>
                  </div>`;

const replaceStr = `                  <div class="flex flex-col md:flex-row gap-3 mb-4">
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

if(migStr.indexOf(targetStr) !== -1) {
    migStr = migStr.replace(targetStr, replaceStr);
    fs.writeFileSync('index_migrated.html', migStr, 'utf8');
    console.log("Replaced ssRoomsSection");
} else {
    console.log("Target string not found, wait let me check variations");
}
