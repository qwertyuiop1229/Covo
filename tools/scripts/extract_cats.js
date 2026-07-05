const fs = require('fs');

const indexStr = fs.readFileSync('index.html', 'utf8');
let migStr = fs.readFileSync('index_migrated.html', 'utf8');

// 1. toggleCategory JS
const toggleStart = 'window.toggleCategory = function(catId) {';
const toggleIdx = indexStr.indexOf(toggleStart);
if (toggleIdx !== -1) {
    let toggleEnd = indexStr.indexOf('};', toggleIdx) + 2;
    const toggleBody = indexStr.substring(toggleIdx, toggleEnd);
    
    if (migStr.indexOf('window.toggleCategory') === -1) {
        const renderRoomsListUIIdx = migStr.indexOf('function renderRoomsListUI');
        migStr = migStr.substring(0, renderRoomsListUIIdx) + toggleBody + '\n\n      ' + migStr.substring(renderRoomsListUIIdx);
    }
}

// 2. createCategoryModal HTML
const catModalStart = '<div id="createCategoryModal"';
const catModalIdx = indexStr.indexOf(catModalStart);
if (catModalIdx !== -1) {
    let catModalEnd = indexStr.indexOf('</div>\n      </div>\n      </div>', catModalIdx) + 33; // rough approximation of closing tags
    // Let's use exact substring search for ending
    const exactEnd = indexStr.indexOf('</div>', indexStr.indexOf('</div>', indexStr.indexOf('</div>', catModalIdx) + 1) + 1) + 6;
    const catModalBody = indexStr.substring(catModalIdx, exactEnd);
    
    if (migStr.indexOf('id="createCategoryModal"') === -1) {
        const serverSettingsModalIdx = migStr.indexOf('<div id="serverSettingsModal"');
        migStr = migStr.substring(0, serverSettingsModalIdx) + catModalBody + '\n\n      ' + migStr.substring(serverSettingsModalIdx);
    }
}

// 3. createCategoryBtn click listener
const catBtnListenerStr = 'document.getElementById("createCategoryBtn").addEventListener("click"';
const catBtnIdx = indexStr.indexOf(catBtnListenerStr);
if (catBtnIdx !== -1) {
    let catBtnEnd = indexStr.indexOf('});', catBtnIdx) + 3;
    const catBtnBody = indexStr.substring(catBtnIdx, catBtnEnd);
    
    if (migStr.indexOf('createCategoryBtn') === -1 || migStr.indexOf(catBtnListenerStr) === -1) {
        // Find a good place to append event listener. 
        // e.g. after document.getElementById("createRoomInServerBtn").addEventListener
        const crRoomIdx = migStr.indexOf('document.getElementById("createRoomInServerBtn").addEventListener');
        if (crRoomIdx !== -1) {
            let crRoomEnd = migStr.indexOf('});', crRoomIdx) + 3;
            migStr = migStr.substring(0, crRoomEnd) + '\n\n      ' + catBtnBody + migStr.substring(crRoomEnd);
        }
    }
}

fs.writeFileSync('index_migrated.html', migStr, 'utf8');
console.log('Categories JS and HTML extracted!');
