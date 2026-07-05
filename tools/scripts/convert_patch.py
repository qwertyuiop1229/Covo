import codecs

with open('index_diff_new.txt', 'rb') as f:
    content = f.read()

# PowerShell '>' usually writes UTF-16LE with BOM
if content.startswith(codecs.BOM_UTF16_LE):
    text = content.decode('utf-16-le')
else:
    text = content.decode('utf-8', errors='replace')

with open('index_diff_utf8.patch', 'w', encoding='utf-8') as f:
    f.write(text)

print("Converted to index_diff_utf8.patch")
