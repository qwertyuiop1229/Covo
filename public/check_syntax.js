const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// A simple regex to find all <script> contents that do not have a src attribute
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let hasError = false;

while ((match = scriptRegex.exec(html)) !== null) {
    const scriptTag = match[0];
    if (scriptTag.includes('src=')) {
        continue;
    }
    const scriptContent = match[1];
    
    // We will evaluate or parse the script content to check for syntax errors.
    // Instead of eval, let's use the 'vm' module to just compile it without executing.
    const vm = require('vm');
    try {
        new vm.Script(scriptContent);
    } catch (e) {
        console.error("Syntax Error in script block!");
        // Print the lines around the error
        const lines = scriptContent.split('\n');
        if (e.loc) {
            console.error(`Line: ${e.loc.line}, Col: ${e.loc.column}`);
            console.error(lines[e.loc.line - 1]);
        } else {
            console.error(e.message);
            // Try to find context using stack trace or regex
            const match = e.stack.match(/evalmachine\.<anonymous>:(\d+)/);
            if (match) {
                const lineNum = parseInt(match[1]);
                console.error("Around line", lineNum, "in script block:");
                for (let i = Math.max(0, lineNum - 3); i < Math.min(lines.length, lineNum + 3); i++) {
                    console.error(`${i + 1}: ${lines[i]}`);
                }
            }
        }
        hasError = true;
    }
}

if (!hasError) {
    console.log("No syntax errors found in inline scripts.");
} else {
    process.exit(1);
}
