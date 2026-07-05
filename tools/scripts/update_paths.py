import os
import re

public_dir = r'c:\Users\qwert\Desktop\covo\public'
index_path = os.path.join(public_dir, 'index.html')
manifest_path = os.path.join(public_dir, 'manifest.json')

# 1. Update index.html
with open(index_path, 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('href="styles.css"', 'href="css/styles.css"')
html = html.replace('href="index.css"', 'href="css/index.css"')
html = html.replace('href="font-awesome.min.css"', 'href="css/font-awesome.min.css"')

html = html.replace('href="favicon.ico', 'href="img/favicon.ico')
html = html.replace('href="icon-32x32.png', 'href="img/icon-32x32.png')
html = html.replace('href="icon-192x192.png', 'href="img/icon-192x192.png')
html = html.replace('href="apple-touch-icon.png', 'href="img/apple-touch-icon.png')

with open(index_path, 'w', encoding='utf-8') as f:
    f.write(html)

# 2. Update manifest.json
if os.path.exists(manifest_path):
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = f.read()
    
    manifest = manifest.replace('"src": "icon-', '"src": "img/icon-')
    manifest = manifest.replace('"src": "icon512x512', '"src": "img/icon512x512')
    manifest = manifest.replace('"src": "icon-512x512', '"src": "img/icon-512x512')
    
    with open(manifest_path, 'w', encoding='utf-8') as f:
        f.write(manifest)
    print("Updated manifest.json")
else:
    print("manifest.json not found")

print("Updated index.html references")
