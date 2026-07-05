const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

// 1. HTML内のすべてのidを取得
const idRegex = /id=["']([^"']+)["']/g;
const htmlIds = new Set();
let match;
while ((match = idRegex.exec(html)) !== null) {
    htmlIds.add(match[1]);
}

// 2. JS内の document.getElementById('...') や querySelector('#...') を取得
const getElementByIdRegex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
const querySelectorRegex = /(?:document|el)\.querySelector\(['"]#([^'"]+)['"]\)/g;

const missingIds = new Set();

while ((match = getElementByIdRegex.exec(html)) !== null) {
    if (!htmlIds.has(match[1])) {
        // 変数展開などを含まないリテラル文字列のみチェック
        if (!match[1].includes('${') && !match[1].includes(' + ')) {
             missingIds.add(match[1]);
        }
    }
}

while ((match = querySelectorRegex.exec(html)) !== null) {
    if (!htmlIds.has(match[1])) {
        if (!match[1].includes('${') && !match[1].includes(' + ')) {
             missingIds.add(match[1]);
        }
    }
}

console.log("Missing IDs accessed by JS:");
missingIds.forEach(id => console.log(id));

// 3. onclick="..." などのイベントハンドラで呼び出されている関数が存在するか
const eventHandlerRegex = /on[a-z]+=["']([a-zA-Z0-9_]+)\(/g;
const calledFunctions = new Set();
while ((match = eventHandlerRegex.exec(html)) !== null) {
    calledFunctions.add(match[1]);
}

// 簡単な関数定義の抽出
const functionDefRegex = /function\s+([a-zA-Z0-9_]+)\s*\(|([a-zA-Z0-9_]+)\s*=\s*(?:function|\([^)]*\)\s*=>|async\s+function|async\s*\([^)]*\)\s*=>)/g;
const definedFunctions = new Set();
while ((match = functionDefRegex.exec(html)) !== null) {
    if (match[1]) definedFunctions.add(match[1]);
    if (match[2]) definedFunctions.add(match[2]);
}

// window に代入されている関数も追加
const windowFuncRegex = /window\.([a-zA-Z0-9_]+)\s*=\s*(?:function|async\s+function)/g;
while ((match = windowFuncRegex.exec(html)) !== null) {
    definedFunctions.add(match[1]);
}

console.log("\nMissing Event Handlers:");
calledFunctions.forEach(func => {
    if (!definedFunctions.has(func) && func !== 'console' && func !== 'alert' && func !== 'event') {
        console.log(func);
    }
});
