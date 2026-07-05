import os
import re

index_path = r'c:\Users\qwert\Desktop\covo\public\index.html'
css_path = r'c:\Users\qwert\Desktop\covo\public\css\main.css'
js_path = r'c:\Users\qwert\Desktop\covo\public\js\main.js'

with open(index_path, 'r', encoding='utf-8') as f:
    content = f.read()

# We need to extract the massive style block (assuming it's the largest or the first style block)
# Actually, the user's HTML starts with <style> at line 39. Let's find it.
# We'll use a regex that matches the first large style block.
style_pattern = re.compile(r'<style>([\s\S]*?)</style>', re.IGNORECASE)
matches = style_pattern.finditer(content)

largest_style = None
largest_style_len = 0
for match in matches:
    if len(match.group(1)) > largest_style_len:
        largest_style = match
        largest_style_len = len(match.group(1))

if largest_style:
    with open(css_path, 'w', encoding='utf-8') as f:
        f.write(largest_style.group(1).strip())
    # Replace it in HTML
    content = content[:largest_style.start()] + '<link rel="stylesheet" href="css/main.css" />\n' + content[largest_style.end():]


# Now extract the massive module script
script_pattern = re.compile(r'<script type="module">([\s\S]*?)</script>', re.IGNORECASE)
script_matches = script_pattern.finditer(content)

largest_script = None
largest_script_len = 0
for match in script_matches:
    if len(match.group(1)) > largest_script_len:
        largest_script = match
        largest_script_len = len(match.group(1))

if largest_script:
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(largest_script.group(1).strip())
    # Replace it in HTML
    content = content[:largest_script.start()] + '<script type="module" src="js/main.js"></script>\n' + content[largest_script.end():]

with open(index_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Extracted {largest_style_len} chars to main.css")
print(f"Extracted {largest_script_len} chars to main.js")
