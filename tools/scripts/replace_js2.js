const fs = require('fs');

const indexStr = fs.readFileSync('index.html', 'utf8');
let migStr = fs.readFileSync('index_migrated.html', 'utf8');

function extractFunction(funcName) {
    const startStr = 'function ' + funcName + '(';
    const idxStart = indexStr.indexOf(startStr);
    if(idxStart === -1) return null;
    
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

function replaceFunction(funcName) {
    const funcBody = extractFunction(funcName);
    if(!funcBody) return;
    
    const startStr = 'function ' + funcName + '(';
    const migIdxStart = migStr.indexOf(startStr);
    if(migIdxStart === -1) {
        // If it doesn't exist in migStr, just append it before unction renderRoomsListUI
        const insertIdx = migStr.indexOf('function renderRoomsListUI');
        migStr = migStr.substring(0, insertIdx) + funcBody + '\n\n      ' + migStr.substring(insertIdx);
        console.log('Appended ' + funcName);
        return;
    }
    
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

replaceFunction('toggleCategory');

// also replace document.getElementById("createRoomInServerBtn").addEventListener("click", async () => {
// Let's just find that block and replace it manually.
const createBtnStart = 'document.getElementById("createRoomInServerBtn").addEventListener("click", async () => {';
const crIdx = indexStr.indexOf(createBtnStart);
let crEnd = indexStr.indexOf('});', crIdx) + 3;
const crBody = indexStr.substring(crIdx, crEnd);

const migCrIdx = migStr.indexOf(createBtnStart);
if(migCrIdx !== -1) {
    let migCrEnd = migStr.indexOf('});', migCrIdx) + 3;
    migStr = migStr.substring(0, migCrIdx) + crBody + migStr.substring(migCrEnd);
    console.log('Replaced createRoomInServerBtn listener');
}

fs.writeFileSync('index_migrated.html', migStr, 'utf8');
console.log('Done replacing category JS logic');
