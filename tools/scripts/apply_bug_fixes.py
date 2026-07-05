import os

def fix_index_html():
    with open('index.html', 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = []
    skip = 0
    for i, line in enumerate(lines):
        if skip > 0:
            skip -= 1
            continue

        if 'const closeAdminModalButton = document.getElementById("closeAdminModalButton");' in line:
            continue
        
        if 'const promptCreateRoomButton = document.getElementById("promptCreateRoomButton");' in line:
            continue
            
        if 'if (document.getElementById("promptCreateRoomButton")) {' in line:
            skip = 2
            continue

        if 'const endMsg = document.getElementById(\'endOfMessagesIndicator\');' in line:
            continue
            
        if 'if (endMsg) messagesDisplay.appendChild(endMsg);' in line:
            continue

        if 'if (endMsg) {' in line and 'messagesDisplay.appendChild(endMsg);' in lines[i+1]:
            skip = 2
            continue

        # mobileToggleD1Mode を含む <div class="mobile-settings-row">
        if '<div class="mobile-settings-row" style="background:#eef2ff;' in line and 'mobileToggleD1Mode' in "".join(lines[i:i+4]):
            skip = 4
            continue

        # startFirestoreToD1Migration を含む <div class="mobile-settings-row">
        if '<div class="mobile-settings-row" onclick="startFirestoreToD1Migration()"' in line:
            skip = 4
            continue

        new_lines.append(line)

    with open('index.html', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("Fixes applied.")

if __name__ == "__main__":
    fix_index_html()
