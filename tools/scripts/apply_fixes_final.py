import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix viewport first
viewport_pattern = r'<meta name="viewport" content="([^"]+)">'
def viewport_repl(m):
    val = m.group(1)
    val = re.sub(r'user-scalable\s*=\s*(no|0)', '', val)
    val = re.sub(r'maximum-scale\s*=\s*[0-9.]+', '', val)
    val = re.sub(r',\s*,', ',', val).strip(', ')
    return f'<meta name="viewport" content="{val}">'
content = re.sub(viewport_pattern, viewport_repl, content)

# Extract script
script_start = content.find('<script>\n// サーバーアイコン変更用JS')
if script_start != -1:
    script_end = content.find('</script>', script_start)
    if script_end != -1:
        # Get the JS content without <script> and </script> tags
        js_content = content[script_start+8:script_end].strip()
        
        # Remove the <script>...</script> block from the html
        content = content[:script_start] + content[script_end+9:]
        
        # Find where to inject it in the main module.
        # We can inject it before the last `});` or right at the end of the module.
        # Let's search for `// --- 初期化 ---` or `const checkWindowSize = () => {`
        # No, let's just insert it right after `window.leaveServer = leaveServer;`
        injection_point = content.find('window.leaveServer = leaveServer;')
        if injection_point != -1:
            # Insert after the line
            insert_idx = content.find('\n', injection_point) + 1
            content = content[:insert_idx] + '\n' + js_content + '\n' + content[insert_idx:]
            print("Successfully injected JS into module.")
        else:
            print("Could not find injection point")

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

