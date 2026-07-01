const fs = require('fs');

const indexStr = fs.readFileSync('index.html', 'utf8');
let migStr = fs.readFileSync('index_migrated.html', 'utf8');

function replaceFunction(funcName) {
    const startStr = 'function ' + funcName + '(';
    const idxStart = indexStr.indexOf(startStr);
    if(idxStart === -1) return;
    
    // Find the end of the function by counting braces
    let i = indexStr.indexOf('{', idxStart);
    let braces = 1;
    i++;
    while(braces > 0 && i < indexStr.length) {
        if(indexStr[i] === '{') braces++;
        if(indexStr[i] === '}') braces--;
        i++;
    }
    const funcBody = indexStr.substring(idxStart, i);
    
    const migIdxStart = migStr.indexOf(startStr);
    if(migIdxStart === -1) return;
    
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

replaceFunction('renderRooms');
replaceFunction('renderRoomsListUI');

fs.writeFileSync('index_migrated.html', migStr, 'utf8');
console.log('Done replacing JS functions');
