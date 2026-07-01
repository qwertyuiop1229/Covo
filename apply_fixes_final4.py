import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix viewport first
for i in range(len(lines)):
    if '<meta name="viewport" content=' in lines[i]:
        val = re.search(r'content="([^"]+)"', lines[i]).group(1)
        val = re.sub(r'user-scalable\s*=\s*(no|0)', '', val)
        val = re.sub(r'maximum-scale\s*=\s*[0-9.]+', '', val)
        val = re.sub(r',\s*,', ',', val).strip(', ')
        lines[i] = re.sub(r'content="([^"]+)"', f'content="{val}"', lines[i])

# Extract script
# The script is from line 17464 to 17662 (roughly)
script_start = -1
for i, line in enumerate(lines):
    if 'serverIconUploadInput = document.getElementById("serverIconUploadInput")' in line:
        # found it, backtrack to <script>
        for j in range(i, i-50, -1):
            if '<script>' in lines[j]:
                script_start = j
                break
        break

if script_start != -1:
    script_end = -1
    for j in range(script_start, len(lines)):
        if '</script>' in lines[j]:
            script_end = j
            break
            
    if script_end != -1:
        # Extract and remove
        js_lines = lines[script_start+1:script_end]
        del lines[script_start:script_end+1]
        
        # Now find the </script> tag of the main module, which was at 17212 originally
        # Since we haven't deleted anything before it, we can just search for it from line 17000 onwards
        module_end = -1
        for j in range(16000, len(lines)):
            if '</script>' in lines[j]:
                module_end = j
                break
                
        if module_end != -1:
            lines = lines[:module_end] + js_lines + lines[module_end:]
            print("Successfully injected JS into module.")
        else:
            print("Could not find module end")
else:
    print("Could not find script block")

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.writelines(lines)

