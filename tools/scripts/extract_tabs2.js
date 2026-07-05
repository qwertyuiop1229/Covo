const fs = require('fs');

const indexStr = fs.readFileSync('index.html', 'utf8');
let migStr = fs.readFileSync('index_migrated.html', 'utf8');

const switchStart = indexStr.indexOf('let currentSsTab = "overview";');
const switchEnd = indexStr.indexOf('window.openServerSettings = async function() {', switchStart);
const switchCode = indexStr.substring(switchStart, switchEnd);

if(migStr.indexOf('let currentSsTab = "overview";') === -1) {
    const insertIdx = migStr.indexOf('function renderRoomsListUI');
    migStr = migStr.substring(0, insertIdx) + switchCode + '\n\n      ' + migStr.substring(insertIdx);
    fs.writeFileSync('index_migrated.html', migStr, 'utf8');
    console.log('Added switchServerSettingsTab');
}
