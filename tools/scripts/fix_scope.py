import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix viewport
viewport_pattern = r'<meta name="viewport" content="([^"]+)">'
def viewport_repl(m):
    val = m.group(1)
    # Remove user-scalable=no and maximum-scale=1.0 if present
    val = re.sub(r'user-scalable\s*=\s*(no|0)', '', val)
    val = re.sub(r'maximum-scale\s*=\s*[0-9.]+', '', val)
    # Cleanup extra commas and spaces
    val = re.sub(r',\s*,', ',', val).strip(', ')
    return f'<meta name="viewport" content="{val}">'

content = re.sub(viewport_pattern, viewport_repl, content)

# Move script at 17464 into the main module ending at 17212
# The plain script is from <script>\n// サーバーアイコン変更用JS to </script>
script_pattern = r'<script>\s*//\s*(?:[^\n]*?サーバーアイコン変更用JS)[^\n]*\n(.*?)<\/script>'
match = re.search(script_pattern, content, flags=re.DOTALL)
if match:
    script_content = match.group(1)
    # Remove it from its original place
    content = content[:match.start()] + content[match.end():]
    
    # Insert it before the last </script> of the main module. The main module ends around line 17212, before <div class="modal-overlay hidden" id="serverIconCropModal"> maybe?
    # No, the easiest is to just find the end of the module.
    # The module starts with `<script type="module">` at line 5592. We can inject it right before `</script>` that closes it.
    # A reliable way: find the first </script> after `let currentServerId = null;` but wait, there might be other </script> if template strings contain it.
    # Let's search for `window.closeFeedbackModal = function()` or something near the end of the module.
    # Wait, in the log I saw the module ends at 17212. Let's find a unique string near there.
    # How about injecting right after `function leaveServer() { ... }` or at the very end of the module?
    # Let's just find the `<script type="module">` block.
    module_pattern = r'(<script type="module">.*?)(<\/script>)'
    
    # Wait, regex might fail on such a huge string (17000 lines) due to catastrophic backtracking if not careful.
    # It's better to do it by string manipulation.
    module_start = content.find('<script type="module">')
    module_end = content.find('</script>', module_start)
    # wait, there might be `</script>` inside strings in the module.
    # Let's search from the end backwards to find the `</script>` that corresponds to the module? No, there are other scripts after it.
    pass
