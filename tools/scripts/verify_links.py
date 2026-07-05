import os
import re

public_dir = r'c:\Users\qwert\Desktop\covo\public'
index_path = os.path.join(public_dir, 'index.html')

with open(index_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Find all href and src attributes
links = re.findall(r'(?:href|src)="([^"]+)"', html)
missing = []

for link in links:
    # Ignore absolute URLs
    if link.startswith('http') or link.startswith('//') or link.startswith('mailto:') or link.startswith('tel:'):
        continue
    # Remove query params
    link_clean = link.split('?')[0]
    
    # Path relative to public directory
    file_path = os.path.join(public_dir, link_clean)
    
    if not os.path.exists(file_path):
        missing.append(link)

if missing:
    print("WARNING: Found broken links in index.html:")
    for m in set(missing):
        print(f" - {m}")
else:
    print("SUCCESS: All local links in index.html are valid and files exist!")
