const fs = require('fs');

const indexStr = fs.readFileSync('index.html', 'utf8');
let migStr = fs.readFileSync('index_migrated.html', 'utf8');

function extractFunction(funcName) {
    const startStr = 'window.' + funcName + ' = function(';
    let idxStart = indexStr.indexOf(startStr);
    if(idxStart === -1) {
        idxStart = indexStr.indexOf('async ' + startStr);
        if(idxStart === -1) {
            idxStart = indexStr.indexOf('function ' + funcName + '(');
            if(idxStart === -1) {
                idxStart = indexStr.indexOf('async function ' + funcName + '(');
                if(idxStart === -1) return null;
            }
        }
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

const openFn = extractFunction('openFeedbackModal');
const closeFn = extractFunction('closeFeedbackModal');
const submitFn = extractFunction('submitFeedback');

if (openFn && migStr.indexOf('openFeedbackModal') === -1) {
    const insertIdx = migStr.indexOf('function renderRoomsListUI');
    migStr = migStr.substring(0, insertIdx) + openFn + '\n\n' + closeFn + '\n\n' + submitFn + '\n\n      ' + migStr.substring(insertIdx);
    console.log('Appended feedback JS functions');
} else {
    console.log('Feedback JS functions missing or already exist');
}

fs.writeFileSync('index_migrated.html', migStr, 'utf8');
