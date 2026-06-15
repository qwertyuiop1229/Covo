const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf-8');
const lines = html.split('\n');
lines.forEach((line, i) => {
  if (line.includes('addEventListener') || line.includes('setTimeout') || line.includes('onSnapshot')) {
    console.log((i+1) + ': ' + line.trim());
  }
});
