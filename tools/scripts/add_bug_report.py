with open('public/index.html', encoding='utf-8') as f:
    content = f.read()

pc_target = '''<div class="flex justify-between items-center" id="pcCreateShortcutRow" style="display:none!important">
                      <button class="" id="pcCreateShortcutBtn" onclick="createDesktopShortcut('pcCreateShortcutBtn','pcCreateShortcutStatus')" style="padding:7px 16px;background:#1f2937;color:white;border:none;border-radius:8px;font-size:0.82rem;font-weight:600;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='#374151'" onmouseout="this.style.background='#1f2937'">デスクトップにショートカットを作成</button>
                      <span id="pcCreateShortcutStatus" style="font-size:0.8rem;color:#6b7280"></span>
                    </div>'''

pc_replacement = pc_target + '''
                    <div class="flex justify-between items-center mt-2">
                      <button class="hover:bg-red-600 transition-colors" onclick="window.openFeedbackModal && window.openFeedbackModal()" style="padding:7px 16px;background:#ef4444;color:white;border:none;border-radius:8px;font-size:0.82rem;font-weight:600;cursor:pointer;">バグを報告する</button>
                    </div>'''

mobile_target = '''<div id="mobileCreateShortcutBtn" class="mobile-settings-row" style="display:none" onclick="createDesktopShortcut('mobileCreateShortcutBtn','mobileCreateShortcutStatus')">
          <div class="mobile-settings-row-icon" style="background:#374151;color:#e5e7eb"><i class="fas fa-desktop"></i></div>
          <span class="mobile-settings-row-text">デスクトップにショートカットを作成</span>
          <span id="mobileCreateShortcutStatus" style="font-size:0.75rem;color:#6b7280;margin-left:auto"></span>
        </div>'''

mobile_replacement = mobile_target + '''
        <div class="mobile-settings-row" onclick="window.openFeedbackModal && window.openFeedbackModal()">
          <div class="mobile-settings-row-icon" style="background:#ef4444;color:#ffffff"><i class="fas fa-bug"></i></div>
          <span class="mobile-settings-row-text text-red-500">バグを報告する</span>
        </div>'''

content = content.replace(pc_target, pc_replacement)
content = content.replace(mobile_target, mobile_replacement)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Bug report buttons added successfully!")
