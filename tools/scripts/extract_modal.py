with open('old_index.html', encoding='utf-8') as f:
    content = f.read()
start = content.find('<div id="feedbackModal"')
if start != -1:
    end = content.find('</body>', start)
    print(content[start:end])
