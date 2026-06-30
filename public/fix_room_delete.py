import re

def main():
    path = r"c:\Users\qwert\Desktop\covo\public\index.html"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # In deleteRoom()
    target_room = """      await batchDeleteCollection(collection(db, `${base}/messages`));
      await batchDeleteCollection(collection(db, `${base}/readReceipts`));
      await deleteDoc(doc(db, `artifacts/${appId}/servers/${serverId}/rooms`, roomId));"""
    replace_room = """      await batchDeleteCollection(collection(db, `${base}/messages`));
      await batchDeleteCollection(collection(db, `${base}/readReceipts`));
      try {
        const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
        const rtdb = await _getOrInitRTDB();
        await remove(ref(rtdb, `artifacts/${appId}/servers/${serverId}/rooms/${roomId}/messages`));
      } catch(e) {}
      await deleteDoc(doc(db, `artifacts/${appId}/servers/${serverId}/rooms`, roomId));"""
      
    content = content.replace(target_room, replace_room)
    
    # In deleteServer()
    target_server = """      for (const roomDoc of roomsSnap.docs) {
        const rb = `${base}/rooms/${roomDoc.id}`;
        await batchDeleteCollection(collection(db, `${rb}/messages`));
        await batchDeleteCollection(collection(db, `${rb}/readReceipts`));
      }"""
    replace_server = """      for (const roomDoc of roomsSnap.docs) {
        const rb = `${base}/rooms/${roomDoc.id}`;
        await batchDeleteCollection(collection(db, `${rb}/messages`));
        await batchDeleteCollection(collection(db, `${rb}/readReceipts`));
        try {
          const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
          const rtdb = await _getOrInitRTDB();
          await remove(ref(rtdb, `artifacts/${appId}/servers/${serverId}/rooms/${roomDoc.id}/messages`));
        } catch(e) {}
      }"""
      
    content = content.replace(target_server, replace_server)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
        
    print("Room and server deletion patched for RTDB.")

if __name__ == "__main__":
    main()
