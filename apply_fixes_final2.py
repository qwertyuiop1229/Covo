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
# Find line 17464-ish <script>
script_match = re.search(r'<script>(\s*//.*?const serverIconUploadInput = document\.getElementById.*?)</script>', content, flags=re.DOTALL)
if script_match:
    js_content = script_match.group(1).strip()
    
    # Remove the <script>...</script> block
    content = content[:script_match.start()] + content[script_match.end():]
    
    # Find where to inject it in the main module.
    injection_point = content.find('window.leaveServer = leaveServer;')
    if injection_point != -1:
        # Insert after the line
        insert_idx = content.find('\n', injection_point) + 1
        content = content[:insert_idx] + '\n' + js_content + '\n' + content[insert_idx:]
        print("Successfully injected JS into module.")
    else:
        print("Could not find injection point")
else:
    print("Could not find script block")

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

