import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: loadOlderMessages array index
content = content.replace(
    'const oldestMessage = allLoadedMessages[allLoadedMessages.length - 1];',
    'const oldestMessage = allLoadedMessages[0];'
)

# Fix 2: topLoadingSpinner location and styling
# Replace the spinner HTML inside messagesDisplay
old_spinner = '''              <!-- 過去メッセージ読み込み用スピナー -->
              <div id="topLoadingSpinner" class="flex flex-shrink-0 items-center justify-center py-3 w-full flipped" style="display: none;">
                <div class="top-spinner"></div>
                <span class="text-xs text-gray-400 ml-2">読み込み中...</span>
              </div>'''

new_spinner = '''              <!-- 過去メッセージ読み込み用スピナー -->
              <!-- 移動しました (messagesDisplayの外側) -->'''
content = content.replace(old_spinner, new_spinner)

# Insert the spinner outside messagesDisplay (before it)
spinner_insertion = '''          <div class="relative flex-1 flex flex-col min-h-0">
            <!-- 過去メッセージ読み込み用スピナー (中央上固定) -->
            <div id="topLoadingSpinner" class="absolute left-0 right-0 flex justify-center z-20 pointer-events-none" style="top: 1rem; display: none;">
              <div class="bg-white px-4 py-2 rounded-full shadow-md flex items-center justify-center border border-gray-100">
                <div class="top-spinner" style="box-sizing: border-box;"></div>
                <span class="text-xs text-gray-500 ml-2 font-medium">読み込み中...</span>
              </div>
            </div>'''
            
content = content.replace('<div class="relative flex-1 flex flex-col min-h-0">', spinner_insertion)

# Remove appendChild(spinner) logic
content = content.replace("if (spinner) messagesDisplay.appendChild(spinner);", "")
content = content.replace("messagesDisplay.appendChild(spinner);", "")


# Fix 3: Context menu fix
# Looking for document.addEventListener('contextmenu'
contextmenu_code = '''document.addEventListener('contextmenu', event => {
    event.preventDefault(); // デフォルトの右クリックメニューを無効化
'''
new_contextmenu_code = '''document.addEventListener('contextmenu', event => {
    // 入力欄では標準の右クリックメニュー（コピペ等）を許可する
    const tag = event.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
        return;
    }
    event.preventDefault(); // デフォルトの右クリックメニューを無効化
'''
content = content.replace(contextmenu_code, new_contextmenu_code)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done applying fixes")
