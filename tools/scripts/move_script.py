with open('public/index.html', encoding='utf-8') as f:
    content = f.read()

mod = content.find('type="module"')
print('type=module found at', mod)

if mod != -1:
    script_start = content.rfind('<script', 0, mod)
    print('script starts at', script_start)
    
    script_end = content.find('</script>', mod)
    print('script ends at', script_end)

target_script_start = content.find('<script>\\n    // サーバーアイコン変更用JS'.replace('\\n', '\n'))
print('target script start:', target_script_start)

if target_script_start != -1:
    target_script_end = content.find('</script>', target_script_start)
    print('target script end:', target_script_end)
    
    # We want to move it to inside the module script!
    # Where should we inject it?
    # Right before the end of the module script?
    # Or right after window.leaveServer = leaveServer;
    inject_pos = content.find('window.leaveServer = leaveServer;')
    print('inject_pos:', inject_pos)
    
    if inject_pos != -1:
        # Move it!
        target_code = content[target_script_start:target_script_end + 9]
        target_inner_code = target_code.replace('<script>', '').replace('</script>', '').strip()
        
        # Remove original
        new_content = content[:target_script_start] + content[target_script_end + 9:]
        
        # Adjust inject_pos in new_content
        inject_pos = new_content.find('window.leaveServer = leaveServer;')
        inject_pos = new_content.find('\n', inject_pos) + 1
        
        # Inject
        new_content = new_content[:inject_pos] + '\n' + target_inner_code + '\n' + new_content[inject_pos:]
        
        with open('public/index.html', 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        print('Successfully moved the script into the module!')
