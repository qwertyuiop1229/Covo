const fs = require('fs');

const indexStr = fs.readFileSync('index.html', 'utf8');
const migStr = fs.readFileSync('index_migrated.html', 'utf8');

const modalStartTag = '<div id="serverSettingsModal" class="fixed inset-0 modal-overlay flex items-center justify-center z-50 hidden p-4">';
const appContainerTag = '<!-- チャットアプリ本体 -->';

let modalStartIdx = indexStr.indexOf(modalStartTag);
if(modalStartIdx === -1) {
    modalStartIdx = indexStr.indexOf('<div id="serverSettingsModal" class="fixed inset-0 modal-overlay flex items-center justify-center z-50 hidden p-4">');
}

const modalEndIdx = indexStr.indexOf(appContainerTag, modalStartIdx);
let snippet = indexStr.substring(modalStartIdx, modalEndIdx).trim();

const migModalStartTag = '<div id="serverSettingsModal" class="fixed inset-0 modal-overlay overflow-y-auto z-50 hidden">';
const migModalStartIdx = migStr.indexOf(migModalStartTag);
const migModalEndIdx = migStr.indexOf(appContainerTag, migModalStartIdx);

let newMigStr = migStr.substring(0, migModalStartIdx) + snippet + '\n\n      ' + migStr.substring(migModalEndIdx);
fs.writeFileSync('index_migrated.html', newMigStr, 'utf8');
console.log('done replacing html');
