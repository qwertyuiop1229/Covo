const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'public', 'index.html');
let html = fs.readFileSync(targetPath, 'utf8');

// The reason it fails on iPhone is because Safari ignores e.preventDefault() on touchmove 
// if it's not called immediately on the first touchmove that crosses a small threshold, or if vertical scrolling has started.
// We must lock the gesture direction early.

// Old touchmove logic:
// if (swipeTargetRow && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
//   e.preventDefault(); // Prevent native horizontal scroll/swipe-back
//   const bubble = swipeTargetRow.querySelector(".message-bubble");

const oldLogic = `      if (swipeTargetRow && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        e.preventDefault(); // Prevent native horizontal scroll/swipe-back`;

const newLogic = `      if (swipeTargetRow) {
        if (!swipeTargetRow.dataset.sDir) {
           if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 5) swipeTargetRow.dataset.sDir = 'h';
           else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 5) swipeTargetRow.dataset.sDir = 'v';
        }
        if (swipeTargetRow.dataset.sDir === 'h') {
          if (e.cancelable) e.preventDefault(); // Lock horizontal swipe for iOS Safari
`;

html = html.replace(oldLogic, newLogic);

// Reset sDir in touchend and touchcancel
html = html.replace(/swipeTargetRow = null;\s*swipeCurrentX = 0;/g, 'if (swipeTargetRow) swipeTargetRow.dataset.sDir = "";\n      swipeTargetRow = null;\n      swipeCurrentX = 0;');


// We also need to fix the touchstart passive option.
// In iOS 11.3+, if a touchstart listener is passive, its touchmove listener is also treated as passive unless explicitly passive: false,
// But the touchmove IS { passive: false }. Wait, iOS sometimes ignores preventDefault if touchstart is passive.
// Let's just make touchstart { passive: false } too to be safe.
html = html.replace(/messagesDisplay\.addEventListener\("touchstart", \(e\) => \{([\s\S]*?)\}, \{ passive: true \}\);/, 'messagesDisplay.addEventListener("touchstart", (e) => {$1}, { passive: false });');


// Write it back
fs.writeFileSync(targetPath, html);
console.log('Patched iOS Safari touch logic.');
