import re
import sys

def main():
    path = r"c:\Users\qwert\Desktop\covo\public\index.html"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. jumpToMessage
    target_jump = """      const qContext = query(
        collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`),
        orderBy("timestamp", "desc"),
        startAt(targetTimestamp),
        limit(10)
      );
      const qContextNewer = query(
        collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`),
        orderBy("timestamp", "asc"),
        startAfter(targetTimestamp),
        limit(10)
      );

      const [snap1, snap2] = await Promise.all([getDocs(qContext), getDocs(qContextNewer)]);"""
      
    replace_jump = """      let fetched = [];
      if (window.globalUseRtdb) {
        const { ref, get, query: rtdbQuery, limitToLast, limitToFirst, orderByChild, startAt: rtdbStartAt, startAfter: rtdbStartAfter } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
        const rtdb = await _getOrInitRTDB();
        const messagesRef = ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`);
        
        // RTDB orderByChild('timestamp') is naturally ascending.
        // limitToFirst(10) from targetTimestamp going up.
        const qNewer = rtdbQuery(messagesRef, orderByChild('timestamp'), rtdbStartAfter(targetTimestamp), limitToFirst(10));
        // We want 10 messages before or equal to targetTimestamp.
        // We can't reverse sort natively in RTDB, so we fetch limitToLast(10) ending at targetTimestamp.
        const { endAt: rtdbEndAt } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
        const qOlder = rtdbQuery(messagesRef, orderByChild('timestamp'), rtdbEndAt(targetTimestamp), limitToLast(10));
        
        const [snapOlder, snapNewer] = await Promise.all([get(qOlder), get(qNewer)]);
        let arrOlder = [];
        let arrNewer = [];
        if (snapOlder.exists()) {
           const d = snapOlder.val();
           arrOlder = Object.keys(d).map(k => ({...d[k], id: k}));
        }
        if (snapNewer.exists()) {
           const d = snapNewer.val();
           arrNewer = Object.keys(d).map(k => ({...d[k], id: k}));
        }
        // arrOlder needs to be reversed to match Firestore's desc order
        arrOlder.sort((a,b) => b.timestamp - a.timestamp);
        // arrNewer needs to be asc
        arrNewer.sort((a,b) => a.timestamp - b.timestamp);
        
        fetched = [...arrOlder];
        arrNewer.forEach(doc => fetched.push(doc));
      } else {
        const qContext = query(
          collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`),
          orderBy("timestamp", "desc"),
          startAt(targetTimestamp),
          limit(10)
        );
        const qContextNewer = query(
          collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`),
          orderBy("timestamp", "asc"),
          startAfter(targetTimestamp),
          limit(10)
        );
        const [snap1, snap2] = await Promise.all([getDocs(qContext), getDocs(qContextNewer)]);
        snap1.forEach(doc => fetched.push({ id: doc.id, ...doc.data() }));
        snap2.forEach(doc => fetched.push({ id: doc.id, ...doc.data() }));
      }"""
      
    content = content.replace(target_jump, replace_jump)
    
    # Next, we must fix the parsing in jumpToMessage below that
    target_parse = """      const fetched = [];
      snap1.forEach(doc => fetched.push({ id: doc.id, ...doc.data() }));
      snap2.forEach(doc => fetched.push({ id: doc.id, ...doc.data() }));"""
    content = content.replace(target_parse, "")

    # 2. loadJumpOlderMessages
    target_older = """        const q = query(
          collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`),
          orderBy("timestamp", "desc"),
          startAfter(oldestMsg.timestamp),
          limit(20)
        );
        const snap = await getDocs(q);
        if (snap.empty || snap.docs.length < 20) hasMoreJumpOlder = false;
        if (!snap.empty) {
          const fetched = [];
          snap.forEach(doc => fetched.push({ id: doc.id, ...doc.data() }));"""
          
    replace_older = """        let fetched = [];
        let fetchedCount = 0;
        if (window.globalUseRtdb) {
          const { ref, get, query: rtdbQuery, limitToLast, orderByChild, endBefore } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
          const rtdb = await _getOrInitRTDB();
          const q = rtdbQuery(ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`), orderByChild('timestamp'), endBefore(oldestMsg.timestamp), limitToLast(20));
          const snap = await get(q);
          if (snap.exists()) {
             const d = snap.val();
             fetched = Object.keys(d).map(k => ({...d[k], id: k}));
             fetched.sort((a,b) => b.timestamp - a.timestamp); // desc
             fetchedCount = fetched.length;
          }
        } else {
          const q = query(
            collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`),
            orderBy("timestamp", "desc"),
            startAfter(oldestMsg.timestamp),
            limit(20)
          );
          const snap = await getDocs(q);
          fetchedCount = snap.docs.length;
          if (!snap.empty) {
            snap.forEach(doc => fetched.push({ id: doc.id, ...doc.data() }));
          }
        }
        
        if (fetchedCount < 20) hasMoreJumpOlder = false;
        if (fetched.length > 0) {"""
        
    content = content.replace(target_older, replace_older)
    
    # 3. loadJumpNewerMessages
    target_newer = """        const q = query(
          collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`),
          orderBy("timestamp", "asc"),
          startAfter(newestMsg.timestamp),
          limit(20)
        );
        const snap = await getDocs(q);
        if (snap.empty || snap.docs.length < 20) hasMoreJumpNewer = false;
        if (!snap.empty) {
          const fetched = [];
          snap.forEach(doc => fetched.push({ id: doc.id, ...doc.data() }));"""
          
    replace_newer = """        let fetched = [];
        let fetchedCount = 0;
        if (window.globalUseRtdb) {
          const { ref, get, query: rtdbQuery, limitToFirst, orderByChild, startAfter: rtdbStartAfter } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
          const rtdb = await _getOrInitRTDB();
          const q = rtdbQuery(ref(rtdb, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`), orderByChild('timestamp'), rtdbStartAfter(newestMsg.timestamp), limitToFirst(20));
          const snap = await get(q);
          if (snap.exists()) {
             const d = snap.val();
             fetched = Object.keys(d).map(k => ({...d[k], id: k}));
             fetched.sort((a,b) => a.timestamp - b.timestamp); // asc
             fetchedCount = fetched.length;
          }
        } else {
          const q = query(
            collection(db, `artifacts/${appId}/servers/${currentServerId}/rooms/${currentRoomId}/messages`),
            orderBy("timestamp", "asc"),
            startAfter(newestMsg.timestamp),
            limit(20)
          );
          const snap = await getDocs(q);
          fetchedCount = snap.docs.length;
          if (!snap.empty) {
            snap.forEach(doc => fetched.push({ id: doc.id, ...doc.data() }));
          }
        }
        
        if (fetchedCount < 20) hasMoreJumpNewer = false;
        if (fetched.length > 0) {"""
        
    content = content.replace(target_newer, replace_newer)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
        
    print("Jump functions patched for RTDB.")

if __name__ == "__main__":
    main()
