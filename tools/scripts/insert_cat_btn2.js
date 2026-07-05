const fs = require('fs');
let migStr = fs.readFileSync('index_migrated.html', 'utf8');

const sIdx = migStr.indexOf('<div id="ssRoomsSection"');
if(sIdx !== -1) {
    const listIdx = migStr.indexOf('<div id="serverRoomsList"', sIdx);
    
    // Replace everything between the <h2> and the <div id="serverRoomsList">
    const h2Idx = migStr.indexOf('</h2>', sIdx) + 5;
    
    const replaceStr = `\n                  <div class="flex flex-col md:flex-row gap-3 mb-4 mt-4">\n                    <div class="flex-1 flex gap-2">\n                      <input type="text" id="newRoomNameInput" placeholder="新しいルーム名"\n                        class="flex-1 p-2.5 bg-[#1e1f22] rounded focus:outline-none text-sm text-white" />\n                      <select id="newRoomCategorySelect" class="p-2.5 bg-[#1e1f22] rounded focus:outline-none text-sm text-white border-l border-gray-800">\n                        <option value="">カテゴリーなし</option>\n                      </select>\n                      <button id="createRoomInServerBtn" class="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2.5 rounded text-sm font-bold transition-colors">追加</button>\n                    </div>\n                    <button id="createCategoryBtn" class="bg-[#4e5058] hover:bg-[#6d6f78] text-white px-4 py-2.5 rounded text-sm font-bold whitespace-nowrap transition-colors"><i class="fas fa-folder-plus mr-1"></i>カテゴリー作成</button>\n                  </div>\n                  <div class="h-px bg-gray-700 w-full my-4"></div>\n                  `;
    
    migStr = migStr.substring(0, h2Idx) + replaceStr + migStr.substring(listIdx);
    fs.writeFileSync('index_migrated.html', migStr, 'utf8');
    console.log("Replaced successfully via substring");
}
