
import sys
import re

sys.stdout.reconfigure(encoding='utf-8')
with open('server/src/index.js', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'async function handleSendNotification', text)
if m:
    start = max(0, m.start())
    end = min(len(text), m.end() + 2500)
    print(text[start:end])
else:
    print('Not found')
