const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'public', 'index.html');
let html = fs.readFileSync(targetPath, 'utf8');

// 1. Add classes to <button> tags
const buttonClasses = 'transition-transform duration-300 ease-spring-bounce hover:-translate-y-1 hover:scale-105 active:scale-95 active:translate-y-0';

// For buttons with existing class attribute
html = html.replace(/<button([^>]*)class="([^"]*)"([^>]*)>/gi, (match, p1, p2, p3) => {
    if (p2.includes('transition-transform') || 
        p2.includes('no-inject') || 
        p2.includes('mobile-nav-tab') || 
        p2.includes('flex-1') || 
        p2.includes('w-full') || 
        p2.includes('modal-btn') || 
        p2.includes('update-btn') || 
        p2.includes('tab-btn') || 
        p2.includes('nav-btn') || 
        p2.includes('close-btn')) {
        return match;
    }
    return `<button${p1}class="${p2} ${buttonClasses}"${p3}>`;
});

// For buttons without class attribute
html = html.replace(/<button([^>]*)>/gi, (match, p1) => {
    if (match.includes('class=')) return match;
    return `<button class="${buttonClasses}"${p1}>`;
});

// 2. Add pop-in animation to Modals
html = html.replace(/class="([^"]*modal-box[^"]*)"/gi, (match, p1) => {
    if (p1.includes('animate-pop-in')) return match;
    return `class="${p1} animate-pop-in"`;
});

fs.writeFileSync(targetPath, html);
console.log('Successfully injected Tailwind animation classes with mobile layout safeguards.');
