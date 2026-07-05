const fs = require('fs');
let indexStr = fs.readFileSync('index.html', 'utf8');
let migStr = fs.readFileSync('index_migrated.html', 'utf8');

function extractFunction(funcName) {
    const startStr = 'function ' + funcName + '(';
    
    let idxStart = indexStr.indexOf(startStr);
    if(idxStart === -1) {
        idxStart = indexStr.indexOf('async ' + startStr);
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

const loadRoomMessagesBothCode = extractFunction('loadRoomMessagesBoth');
const loadRoomMessagesCode = extractFunction('loadRoomMessages');

if (loadRoomMessagesBothCode) {
    // replace loadRoomMessagesBoth in index_migrated
    const startStr = 'async function loadRoomMessagesBoth(';
    let migIdxStart = migStr.indexOf(startStr);
    if (migIdxStart !== -1) {
        let j = migStr.indexOf('{', migIdxStart);
        let migBraces = 1;
        j++;
        while(migBraces > 0 && j < migStr.length) {
            if(migStr[j] === '{') migBraces++;
            if(migStr[j] === '}') migBraces--;
            j++;
        }
        migStr = migStr.substring(0, migIdxStart) + loadRoomMessagesBothCode + migStr.substring(j);
        console.log('Replaced loadRoomMessagesBoth');
    }
}

if (loadRoomMessagesCode) {
    // replace loadRoomMessages in index_migrated
    const startStr = 'async function loadRoomMessages(';
    let migIdxStart = migStr.indexOf(startStr);
    if (migIdxStart !== -1) {
        let j = migStr.indexOf('{', migIdxStart);
        let migBraces = 1;
        j++;
        while(migBraces > 0 && j < migStr.length) {
            if(migStr[j] === '{') migBraces++;
            if(migStr[j] === '}') migBraces--;
            j++;
        }
        migStr = migStr.substring(0, migIdxStart) + loadRoomMessagesCode + migStr.substring(j);
        console.log('Replaced loadRoomMessages');
    }
}

const mergeMessagesCode = extractFunction('mergeMessages');
if (mergeMessagesCode && migStr.indexOf('function mergeMessages') === -1) {
    const insertIdx = migStr.indexOf('async function loadRoomMessagesBoth');
    migStr = migStr.substring(0, insertIdx) + mergeMessagesCode + '\n\n      ' + migStr.substring(insertIdx);
    console.log('Inserted mergeMessages');
}

fs.writeFileSync('index_migrated.html', migStr, 'utf8');
console.log('Done replacing loadRoomMessagesBoth');
