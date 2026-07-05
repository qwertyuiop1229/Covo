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
# Since the script is near the end, let's find it.
# The script starts with <script> and ends with </script>.
# It contains `serverIconUploadInput = document.getElementById("serverIconUploadInput")`
script_content = ""
script_start = content.rfind('<script>', 0, content.find('serverIconUploadInput = document.getElementById("serverIconUploadInput")'))
if script_start != -1:
    script_end = content.find('</script>', script_start) + 9
    full_script = content[script_start:script_end]
    js_content = full_script[full_script.find('>')+1:full_script.rfind('</script>')].strip()
    
    # Remove the <script>...</script> block
    content = content[:script_start] + content[script_end:]
    
    # Find where to inject it in the main module.
    # The main module is `type="module"`. Let's find its end.
    # We can search backwards for `</script>` from `script_start` but wait, there are other scripts.
    # Better to find `window.leaveServer = leaveServer;`
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

