const fs = require('fs');

const indexStr = fs.readFileSync('index.html', 'utf8');
let migStr = fs.readFileSync('index_migrated.html', 'utf8');

// 1. Feedback HTML
let htmlStart = indexStr.indexOf('<div id="feedbackModal"');
let htmlEnd = indexStr.indexOf('</div>\n    </div>\n  </div>', htmlStart);
if (htmlEnd !== -1) {
    htmlEnd += 26; // up to closing div
} else {
    // try different search
    htmlEnd = indexStr.indexOf('</div>', indexStr.indexOf('</div>', indexStr.indexOf('</div>', htmlStart)+1)+1) + 6;
}
const htmlBody = indexStr.substring(htmlStart, htmlEnd);

if(migStr.indexOf('id="feedbackModal"') === -1) {
    // Append it right before the closing body tag
    const bodyEndIdx = migStr.lastIndexOf('</body>');
    if (bodyEndIdx !== -1) {
        migStr = migStr.substring(0, bodyEndIdx) + '\n' + htmlBody + '\n' + migStr.substring(bodyEndIdx);
        console.log('Appended feedback modal HTML');
    }
}

// 2. Feedback JS
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

const openFn = extractFunction('openFeedbackModal');
const closeFn = extractFunction('closeFeedbackModal');
const submitFn = extractFunction('submitFeedback');

if (openFn && migStr.indexOf('openFeedbackModal') === -1) {
    const insertIdx = migStr.indexOf('function renderRoomsListUI');
    migStr = migStr.substring(0, insertIdx) + openFn + '\n\n' + closeFn + '\n\n' + submitFn + '\n\n      ' + migStr.substring(insertIdx);
    console.log('Appended feedback JS functions');
}

// 3. Feedback button in Left Sidebar
// <button onclick="openFeedbackModal()" class="w-12 h-12 rounded-full bg-slate-800 ...">
const btnStart = indexStr.indexOf('<button onclick="openFeedbackModal()"');
const btnEnd = indexStr.indexOf('</button>', btnStart) + 9;
const btnHTML = indexStr.substring(btnStart, btnEnd);

if (migStr.indexOf('openFeedbackModal()') === -1 || migStr.indexOf(btnHTML) === -1) {
    // find add server button
    const addServerBtn = '<button onclick="openCreateServerModal()"';
    const addServerIdx = migStr.indexOf(addServerBtn);
    if (addServerIdx !== -1) {
        migStr = migStr.substring(0, addServerIdx) + btnHTML + '\n        ' + migStr.substring(addServerIdx);
        console.log('Appended feedback button to sidebar');
    }
}

fs.writeFileSync('index_migrated.html', migStr, 'utf8');
console.log('Done feedback modal extraction');
