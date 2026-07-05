const fs = require('fs');

const indexStr = fs.readFileSync('index.html', 'utf8');
let migStr = fs.readFileSync('index_migrated.html', 'utf8');

function extractFunction(funcName) {
    const startStr = 'window.' + funcName + ' = function(';
    let idxStart = indexStr.indexOf(startStr);
    if(idxStart === -1) {
        const altStart = 'function ' + funcName + '(';
        idxStart = indexStr.indexOf(altStart);
        if(idxStart === -1) return null;
    }
    
    let i = indexStr.indexOf('{', idxStart);
    let braces = 1;
    i++;
    while(braces > 0 && i < indexStr.length) {
        if(indexStr[i] === '{') braces++;
        if(indexStr[i] === '}') braces--;
        i++;
    }
    return indexStr.substring(idxStart, i);
}

const switchFn = extractFunction('switchServerSettingsTab');
if (switchFn && migStr.indexOf('switchServerSettingsTab') === -1) {
    const renderRoomsListUIIdx = migStr.indexOf('function renderRoomsListUI');
    migStr = migStr.substring(0, renderRoomsListUIIdx) + switchFn + '\n\n      ' + migStr.substring(renderRoomsListUIIdx);
    fs.writeFileSync('index_migrated.html', migStr, 'utf8');
    console.log('Appended switchServerSettingsTab');
} else {
    console.log('switchServerSettingsTab missing or already exists');
}

