import re
import subprocess

# get old file content
result = subprocess.run(['git', 'show', 'HEAD:public/index.html'], capture_output=True)
old_content = result.stdout.decode('utf-8')

# Extract script
script_start = old_content.find('const serverIconUploadInput = document.getElementById("serverIconUploadInput");')
if script_start != -1:
    # backtrack to find the <script> tag
    start_tag = old_content.rfind('<script>', 0, script_start)
    end_tag = old_content.find('</script>', script_start)
    
    js_content = old_content[start_tag:end_tag]
    js_content = js_content[js_content.find('>')+1:].strip()
    
    # Now read the current index.html
    with open('public/index.html', 'r', encoding='utf-8') as f:
        content = f.read()
        
    # check if we already injected it
    if 'serverIconUploadInput = document.getElementById' not in content:
        # inject it right after window.leaveServer = leaveServer;
        injection_point = content.find('window.leaveServer = leaveServer;')
        if injection_point != -1:
            insert_idx = content.find('\n', injection_point) + 1
            content = content[:insert_idx] + '\n// Injected missing script\n' + js_content + '\n' + content[insert_idx:]
            
            with open('public/index.html', 'w', encoding='utf-8') as f:
                f.write(content)
            print("Successfully injected missing JS script back into index.html")
        else:
            print("Could not find injection point")
    else:
        print("Script is already in index.html")
else:
    print("Could not find script in old index.html")

