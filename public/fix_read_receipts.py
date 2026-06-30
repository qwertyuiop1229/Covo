import re

def main():
    path = r"c:\Users\qwert\Desktop\covo\public\index.html"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update initReadStatesSync
    target_init = """    let readStatesUnsub = null;
    function initReadStatesSync() {
      if (!userId || !appId) return;
      if (readStatesUnsub) { readStatesUnsub(); readStatesUnsub = null; }
      readStatesUnsub = onSnapshot(collection(db, `artifacts/${appId}/users/${userId}/readStates`), (snap) => {
        let changed = false;
        let rm = {};
        try { rm = JSON.parse(localStorage.getItem('covo_last_read') || '{}'); } catch(e) {}
        snap.forEach(docSnap => {
          const remoteTime = docSnap.data().lastReadAt?.toMillis?.() || 0;
          const localTime = rm[docSnap.id] || 0;
          if (remoteTime && remoteTime > localTime) {
            rm[docSnap.id] = remoteTime;
            changed = true;
          }
        });
        if (changed) {
          localStorage.setItem('covo_last_read', JSON.stringify(rm));
          if (typeof scanAllUnreadAndRender === 'function') scanAllUnreadAndRender();
        }
      });
    }"""
    
    replace_init = """    let readStatesUnsub = null;
    function initReadStatesSync() {
      if (!userId || !appId) return;
      if (readStatesUnsub) { readStatesUnsub(); readStatesUnsub = null; }
      if (window.rtdbReadStatesUnsub) { window.rtdbReadStatesUnsub(); window.rtdbReadStatesUnsub = null; }

      if (window.globalUseRtdb) {
        import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js').then(async ({ ref, onValue, off }) => {
          const rtdb = await _getOrInitRTDB();
          const readRef = ref(rtdb, `artifacts/${appId}/users/${userId}/readStates`);
          const cb = onValue(readRef, (snapshot) => {
            let changed = false;
            let rm = {};
            try { rm = JSON.parse(localStorage.getItem('covo_last_read') || '{}'); } catch(e) {}
            const data = snapshot.val() || {};
            Object.keys(data).forEach(rId => {
              const remoteTime = data[rId].lastReadAt || 0;
              const localTime = rm[rId] || 0;
              if (remoteTime && remoteTime > localTime) {
                rm[rId] = remoteTime;
                changed = true;
              }
            });
            if (changed) {
              localStorage.setItem('covo_last_read', JSON.stringify(rm));
              if (typeof scanAllUnreadAndRender === 'function') scanAllUnreadAndRender();
            }
          });
          window.rtdbReadStatesUnsub = () => off(readRef, 'value', cb);
        });
      } else {
        readStatesUnsub = onSnapshot(collection(db, `artifacts/${appId}/users/${userId}/readStates`), (snap) => {
          let changed = false;
          let rm = {};
          try { rm = JSON.parse(localStorage.getItem('covo_last_read') || '{}'); } catch(e) {}
          snap.forEach(docSnap => {
            const data = docSnap.data();
            let remoteTime = 0;
            if (data.lastReadAt && data.lastReadAt.toMillis) {
               remoteTime = data.lastReadAt.toMillis();
            } else if (data.lastReadAt && typeof data.lastReadAt === 'number') {
               remoteTime = data.lastReadAt;
            }
            const localTime = rm[docSnap.id] || 0;
            if (remoteTime && remoteTime > localTime) {
              rm[docSnap.id] = remoteTime;
              changed = true;
            }
          });
          if (changed) {
            localStorage.setItem('covo_last_read', JSON.stringify(rm));
            if (typeof scanAllUnreadAndRender === 'function') scanAllUnreadAndRender();
          }
        });
      }
    }"""
    
    content = content.replace(target_init, replace_init)

    # 2. Update updateLocalAndRemoteReadState
    target_update = "                 setDoc(doc(db, `artifacts/${appId}/users/${userId}/readStates`, roomId), { lastReadAt: time }, { merge: true }).catch(()=>{});"
    replace_update = """                 setDoc(doc(db, `artifacts/${appId}/users/${userId}/readStates`, roomId), { lastReadAt: time }, { merge: true }).catch(()=>{});
                 try {
                   import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js').then(async ({ ref, set }) => {
                     const rtdb = await _getOrInitRTDB();
                     await set(ref(rtdb, `artifacts/${appId}/users/${userId}/readStates/${roomId}`), { lastReadAt: time });
                   });
                 } catch(e) {}"""
                 
    content = content.replace(target_update, replace_update)
    
    # 3. Trigger initReadStatesSync inside setupGlobalRtdbListener
    target_trigger = """            window.globalUseRtdb = useRtdb;
            if (currentRoomId && typeof subscribeToMessages === 'function') {
               subscribeToMessages();
            }"""
    replace_trigger = """            window.globalUseRtdb = useRtdb;
            if (currentRoomId && typeof subscribeToMessages === 'function') {
               subscribeToMessages();
            }
            if (typeof initReadStatesSync === 'function') {
               initReadStatesSync();
            }"""
            
    content = content.replace(target_trigger, replace_trigger)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
        
    print("Read receipts patched.")

if __name__ == "__main__":
    main()
