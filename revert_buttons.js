const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'public', 'index.html');
let html = fs.readFileSync(targetPath, 'utf8');

const buttonClasses = 'transition-transform duration-300 ease-spring-bounce hover:-translate-y-1 hover:scale-105 active:scale-95 active:translate-y-0';

// Replace with a leading space if it was appended
html = html.split(' ' + buttonClasses).join('');
html = html.split(buttonClasses).join('');

// Sometimes class="" might end up empty or have extra spaces.
// E.g., class=" " or class=""
html = html.replace(/class="\s+"/g, 'class=""');

fs.writeFileSync(targetPath, html);
console.log('Reverted button classes.');
