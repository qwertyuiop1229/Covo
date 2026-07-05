import sys
import io

with open('public/index.html', encoding='utf-8') as f:
    content = f.read()

start = content.find('async function sendMessage')
if start != -1:
    end = content.find('}', start + 1000)
    with open('send_msg.txt', 'w', encoding='utf-8') as out:
        out.write(content[start:end+1000])
