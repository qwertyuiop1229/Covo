with open('public/index.html', encoding='utf-8') as f:
    content = f.read()

mod = content.find('type="module"')
if mod != -1:
    script_start = content.rfind('<script', 0, mod)
    script_end = content.find('</script>', mod)
    
target_script_start = content.find('<script>\\n    // サーバーアイコン変更用JS'.replace('\\n', '\n'))

if target_script_start != -1:
    target_script_end = content.find('</script>', target_script_start)
    
    inject_pos = content.find('if (typeof renderDiscordServerNav === \\'function\\') renderDiscordServerNav();\\n    };'.replace('\\n', '\n'))
    if inject_pos != -1:
        # Move it!
        target_code = content[target_script_start:target_script_end + 9]
        target_inner_code = target_code.replace('<script>', '').replace('</script>', '').strip()
        
        # Remove original
        new_content = content[:target_script_start] + content[target_script_end + 9:]
        
        # Adjust inject_pos in new_content
        inject_pos = new_content.find('if (typeof renderDiscordServerNav === \\'function\\') renderDiscordServerNav();\\n    };'.replace('\\n', '\n'))
        inject_pos = new_content.find('};', inject_pos) + 2
        
        # Inject
        new_content = new_content[:inject_pos] + '\n\n    // サーバーアイコン変更用JS (Moved from global scope)\n' + target_inner_code + '\n' + new_content[inject_pos:]
        
        with open('public/index.html', 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        print('Successfully moved the script into the module!')
    else:
        print('Could not find injection point.')
else:
    print('Target script not found. It might have already been moved.')
