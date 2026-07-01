
import sys
import re

sys.stdout.reconfigure(encoding='utf-8')
with open('server/src/index.js', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'/api/sendNotification', text)
if m:
    start = max(0, m.start() - 100)
    end = min(len(text), m.end() + 2000)
    print(text[start:end])
else:
    print('Not found')
