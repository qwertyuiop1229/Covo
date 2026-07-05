import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('public/index.html', encoding='utf-8') as f:
    content = f.read()

start = content.find('async function loadOlderMessages')
if start != -1:
    end = content.find('}', start + 1000)
    print(content[start:end+1000])
