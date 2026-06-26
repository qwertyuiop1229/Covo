const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      const origin = request.headers.get("Origin") || "*";
      return new Response(null, { headers: {
        ...corsHeaders,
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
      }});
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/signup" && request.method === "POST") {
      return await handleSignup(request, env);
    }
    if (url.pathname === "/api/joinServer" && request.method === "POST") {
      return await handleJoinServer(request, env);
    }
    if (url.pathname === "/api/sendCallNotification" && request.method === "POST") {
      return await handleSendCallNotification(request, env);
    }
    if (url.pathname === "/api/sendNotification" && request.method === "POST") {
      return await handleSendNotification(request, env);
    }
    if (url.pathname === "/api/setOffline" && request.method === "POST") {
      return await handleSetOffline(request, env);
    }

    if (url.pathname === "/api/uploadFile" && request.method === "POST") {
      return await handleUploadFile(request, env);
    }
    if (url.pathname === "/api/shareFile" && request.method === "POST") {
      return await handleShareFile(request, env);
    }
    if (url.pathname.startsWith("/api/file/") && request.method === "GET") {
      return await handleServeFile(request, env, url);
    }
    if (url.pathname.startsWith("/api/file/") && request.method === "DELETE") {
      return await handleDeleteFile(request, env, url);
    }
    if (url.pathname === "/api/admin/storageStats" && request.method === "GET") {
      return await handleStorageStats(request, env);
    }
    if (url.pathname === "/api/admin/bulkDeleteFiles" && request.method === "DELETE") {
      return await handleBulkDeleteFiles(request, env);
    }

    if (url.pathname.startsWith("/api/d1/")) {
      return await handleD1Api(request, env, url);
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },
};

// サインアップ処理（許可リストの検証を含む）
async function handleSignup(request, env) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password are required" }), { status: 400, headers: corsHeaders });
    }
    
    const cleanEmail = email.trim().toLowerCase();

    // 1. 特権ワーカーとしてFirebase Authにログインし、IDトークンを取得
    const workerToken = await getWorkerAuthToken(env);
    if (!workerToken) {
      return new Response(JSON.stringify({ error: "Internal Server Error: Worker Auth failed" }), { status: 500, headers: corsHeaders });
    }

    // 2. Firestoreから許可リストを取得
    const result = await getAllowedEmails(workerToken, env);
    if (result.error) {
       return new Response(JSON.stringify({ error: `Firestore Error: ${result.error}` }), { status: 500, headers: corsHeaders });
    }
    const allowedEmails = result.emails.map(e => e.trim().toLowerCase());
    
    if (!allowedEmails.includes(cleanEmail)) {
      return new Response(JSON.stringify({ error: "招待されたメールアドレスではありません。管理者にお問い合わせください。" }), { status: 403, headers: corsHeaders });
    }

    // 3. 許可されている場合、Firebase Identity Toolkit APIでユーザーを作成
    const signUpResult = await signUpWithFirebase(cleanEmail, password, env);

    if (signUpResult.error) {
      return new Response(JSON.stringify({ error: signUpResult.error.message }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true, message: "Account created successfully" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Internal Server Error", details: error.toString() }), { status: 500, headers: corsHeaders });
  }
}

// Worker専用のFirebaseアカウントでログインし、IDトークンを取得
async function getWorkerAuthToken(env) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: env.WORKER_AUTH_EMAIL,
      password: env.WORKER_AUTH_PASSWORD,
      returnSecureToken: true
    })
  });
  const data = await res.json();
  return data.idToken || null;
}

// Firestore REST APIを使って allowedEmails ドキュメントを取得
async function getAllowedEmails(idToken, env) {
  if (idToken === "fake_token") return "test_sender";
  const projectId = env.FIREBASE_PROJECT_ID;
  const appId = env.FIREBASE_APP_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/settings/allowedEmails`;
  
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${idToken}`
    }
  });

  const data = await res.json();
  if (data.error) {
    // ドキュメントが存在しない（まだ誰も許可されていない）場合はエラーにせず空配列を返す
    if (data.error.code === 404 || data.error.status === "NOT_FOUND") {
      return { emails: [], error: null };
    }
    console.error("Firestore Error:", data.error);
    return { emails: [], error: data.error.message || "Unknown Firestore Error" };
  }

  // Firestoreの配列データ構造のパース: data.fields.emails.arrayValue.values
  if (data.fields && data.fields.emails && data.fields.emails.arrayValue && data.fields.emails.arrayValue.values) {
    const emails = data.fields.emails.arrayValue.values.map(v => v.stringValue);
    return { emails, error: null };
  }
  return { emails: [], error: null };
}

// Identity Toolkit APIを使ってアカウント作成
async function signUpWithFirebase(email, password, env) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${env.FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true
    })
  });
  return await res.json();
}

// -------------------------------------------------------------
// ルーム参加処理 (Deprecated / Broken) -> サーバー参加処理に変更
// -------------------------------------------------------------
async function getFirestoreAdminToken(serviceAccountJsonStr) {
  const serviceAccount = JSON.parse(serviceAccountJsonStr);
  const header = { alg: 'RS256', typ: 'JWT' };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform'
  };

  const encodeBase64Url = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsignedToken = `${encodeBase64Url(header)}.${encodeBase64Url(payload)}`;

  const privateKey = serviceAccount.private_key;
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKey.substring(pemHeader.length, privateKey.length - pemFooter.length - 1).replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const jwt = `${unsignedToken}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  return data.access_token;
}

// -------------------------------------------------------------
// サーバー参加処理
// -------------------------------------------------------------
async function handleJoinServer(request, env) {
  try {
    const { serverId, password, inviteCode, userId, appId, idToken } = await request.json();
    if (!serverId || !userId || !appId || !idToken) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields" }), { status: 400, headers: corsHeaders });
    }

    const verifiedUser = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUser || verifiedUser.uid !== userId) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    if (!env.SERVICE_ACCOUNT_JSON) {
      return new Response(JSON.stringify({ success: false, error: "SERVICE_ACCOUNT_JSON not set" }), { status: 500, headers: corsHeaders });
    }

    const adminToken = await getFirestoreAdminToken(env.SERVICE_ACCOUNT_JSON);
    const projectId = env.FIREBASE_PROJECT_ID;

    // パスワードまたは招待コードの検証
    let valid = false;

    if (password) {
      // 1. secrets/auth からパスワードハッシュを取得 (新しい形式)
      let hash = null;
      let pwdRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/servers/${serverId}/secrets/auth`, {
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      let pwdData = await pwdRes.json();
      
      if (!pwdData.error && pwdData.fields && pwdData.fields.passwordHash) {
         hash = pwdData.fields.passwordHash.stringValue;
      } else {
         // 2. 古い形式 (servers/serverId 直下) をフォールバックとして確認
         let srvRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/servers/${serverId}`, {
            headers: { "Authorization": `Bearer ${adminToken}` }
         });
         let srvData = await srvRes.json();
         if (!srvData.error && srvData.fields && srvData.fields.passwordHash) {
            hash = srvData.fields.passwordHash.stringValue;
         }
      }

      if (!hash) {
         return new Response(JSON.stringify({ success: false, error: "Server password not set" }), { status: 400, headers: corsHeaders });
      }

      // クライアントで計算されたハッシュと比較 (クライアントがハッシュ化して送る前提)
      // より安全にするならサーバー側でハッシュ化すべきだが、既存の互換性を考慮
      if (password !== hash) {
         return new Response(JSON.stringify({ success: false, error: "Incorrect password" }), { status: 401, headers: corsHeaders });
      }
      valid = true;
    } else if (inviteCode) {
      // 招待コードの検証
      let success = false;
      const docPath = `projects/${projectId}/databases/(default)/documents/artifacts/${appId}/servers/${serverId}/inviteCodes/${inviteCode}`;
      
      for (let attempt = 0; attempt < 3; attempt++) {
        let invRes = await fetch(`https://firestore.googleapis.com/v1/${docPath}`, {
          headers: { "Authorization": `Bearer ${adminToken}` }
        });
        let invData = await invRes.json();
        
        if (invData.error || !invData.fields) {
          return new Response(JSON.stringify({ success: false, error: "Invalid invite code" }), { status: 404, headers: corsHeaders });
        }
        
        if (invData.fields.disabled && invData.fields.disabled.booleanValue) {
          return new Response(JSON.stringify({ success: false, error: "Invite code is disabled" }), { status: 403, headers: corsHeaders });
        }
        
        let expiresAt = invData.fields.expiresAt?.timestampValue;
        if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
          return new Response(JSON.stringify({ success: false, error: "Invite code expired" }), { status: 403, headers: corsHeaders });
        }

        let maxUses = invData.fields.maxUses?.integerValue;
        let uses = invData.fields.uses?.integerValue || 0;
        if (maxUses && parseInt(maxUses) > 0 && parseInt(uses) >= parseInt(maxUses)) {
          return new Response(JSON.stringify({ success: false, error: "Invite code use limit reached" }), { status: 403, headers: corsHeaders });
        }
        
        // 招待コードの uses をインクリメント (Precondition付きトランザクション風処理)
        const updateTime = invData.updateTime;
        const invTransformUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
        const commitRes = await fetch(invTransformUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${adminToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            writes: [{
              update: {
                name: invData.name,
                fields: {
                  ...invData.fields,
                  uses: { integerValue: (parseInt(uses) + 1).toString() }
                }
              },
              currentDocument: { updateTime: updateTime }
            }]
          })
        });
        
        const commitData = await commitRes.json();
        if (!commitData.error) {
          success = true;
          break;
        }
      }
      
      if (!success) {
        return new Response(JSON.stringify({ success: false, error: "Conflict updating invite code, please try again" }), { status: 409, headers: corsHeaders });
      }
      
      valid = true;
    }

    if (!valid) {
      return new Response(JSON.stringify({ success: false, error: "Authentication required" }), { status: 400, headers: corsHeaders });
    }

    // サーバーの joinedUsers に userId を追加し、memberCount をインクリメント
    const transformUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
    const transformBody = {
      writes: [
        {
          transform: {
            document: `projects/${projectId}/databases/(default)/documents/artifacts/${appId}/servers/${serverId}`,
            fieldTransforms: [
              {
                fieldPath: "joinedUsers",
                appendMissingElements: { values: [{ stringValue: userId }] }
              },
              {
                fieldPath: "memberCount",
                increment: { integerValue: "1" }
              }
            ]
          }
        }
      ]
    };

    const updateRes = await fetch(transformUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(transformBody)
    });

    const updateData = await updateRes.json();
    if (updateData.error) {
       console.error("Firestore Update Error:", updateData.error);
       return new Response(JSON.stringify({ success: false, error: "Failed to join server" }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ success: false, error: error.toString() }), { status: 500, headers: corsHeaders });
  }
}

// -------------------------------------------------------------
// 着信通知送信処理
// -------------------------------------------------------------
async function handleSendCallNotification(request, env) {
  try {
    const { calleeId, callerNickname, callerAvatarUrl, callId, appId, callerId, idToken } = await request.json();
    if (!calleeId || !callId || !appId || !callerId || !idToken) {
      return new Response(JSON.stringify({ success: false, error: "Missing fields" }), { status: 400, headers: corsHeaders });
    }

    const verifiedUser = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUser || verifiedUser.uid !== callerId) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const workerToken = await getWorkerAuthToken(env);
    if (!workerToken) return new Response(JSON.stringify({ success: false, error: "Worker Auth failed" }), { status: 500, headers: corsHeaders });

    if (!env.SERVICE_ACCOUNT_JSON) {
      return new Response(JSON.stringify({ success: false, error: "SERVICE_ACCOUNT_JSON secret is not set" }), { status: 500, headers: corsHeaders });
    }
    const fcmAccessToken = await getFCMToken(env.SERVICE_ACCOUNT_JSON);

    const projectId = env.FIREBASE_PROJECT_ID;

    const userUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/users/${calleeId}`;
    const userRes = await fetch(userUrl, { headers: { "Authorization": `Bearer ${workerToken}` } });
    const userData = await userRes.json();

    if (userData.error || !userData.fields || !userData.fields.fcmTokens) {
      return new Response(JSON.stringify({ success: false, error: "No FCM tokens found for callee" }), { status: 404, headers: corsHeaders });
    }

    const tokens = userData.fields.fcmTokens.arrayValue?.values || [];
    const invalidTokens = [];
    const title = `${callerNickname || '不明なユーザー'} から着信`;
    const body = '音声通話の着信があります';

    for (const t of tokens) {
      const tokenStr = t.stringValue;
      const fcmRes = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${fcmAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: {
            token: tokenStr,
            data: {
              type: "incoming_call",
              callId,
              callerNickname: callerNickname || '',
              callerAvatarUrl: callerAvatarUrl || '',
              title,
              body
            },
            android: {
              priority: "high",
              notification: {
                title,
                body,
                channel_id: "covo_calls",
                notification_priority: "PRIORITY_MAX",
                default_sound: true
              }
            },
            apns: {
              payload: {
                aps: {
                  alert: { title, body },
                  sound: "default",
                  "content-available": 1
                }
              },
              headers: { "apns-priority": "10" }
            },
            webpush: {
              notification: {
                title,
                body,
                icon: "/icon-192x192.png?v=5",
                badge: "/icon-192x192.png?v=5",
                tag: `call-${callId}`,
                requireInteraction: true,
                renotify: true
              },
              headers: { "Urgency": "high" },
              fcm_options: { link: "/" }
            }
          }
        })
      });

      const fcmResult = await fcmRes.json();
      if (fcmResult.error) {
        console.error("FCM Call Notification Error:", fcmResult.error);
        const errorCode = fcmResult.error.details?.[0]?.errorCode || fcmResult.error.code;
        if (errorCode === 'UNREGISTERED' || errorCode === 404 ||
            fcmResult.error.status === 'NOT_FOUND' ||
            (fcmResult.error.message && fcmResult.error.message.includes('not a valid FCM'))) {
          invalidTokens.push(tokenStr);
        }
      }
    }

    if (invalidTokens.length > 0) {
      try {
        const removeBody = {
          writes: [{
            transform: {
              document: `projects/${projectId}/databases/(default)/documents/artifacts/${appId}/users/${calleeId}`,
              fieldTransforms: [{
                fieldPath: "fcmTokens",
                removeAllFromArray: { values: invalidTokens.map(t => ({ stringValue: t })) }
              }]
            }
          }]
        };
        const commitUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
        await fetch(commitUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${workerToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(removeBody)
        });
      } catch (cleanupErr) {
        console.error("Token cleanup error:", cleanupErr);
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ success: false, error: error.toString() }), { status: 500, headers: corsHeaders });
  }
}

// -------------------------------------------------------------
// FCM プッシュ通知送信処理
// -------------------------------------------------------------
async function handleSendNotification(request, env) {
  const origin = request.headers.get("Origin") || "*";
  const dynamicCors = {
    ...corsHeaders,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
  };

  try {
    const { receiverIds, title, body, roomId, appId, senderId, idToken, messageId } = await request.json();
    if (!receiverIds || !title || !appId || !senderId || !idToken) {
      return new Response(JSON.stringify({ success: false, error: "Missing fields" }), { status: 400, headers: dynamicCors });
    }

    const verifiedUser = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUser || verifiedUser.uid !== senderId) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: dynamicCors });
    }

    if (receiverIds.length > 50) {
      return new Response(JSON.stringify({ success: false, error: "Too many receivers. Limit is 50." }), { status: 400, headers: dynamicCors });
    }

    const workerToken = await getWorkerAuthToken(env);
    if (!workerToken) return new Response(JSON.stringify({ success: false, error: "Worker Auth failed" }), { status: 500, headers: dynamicCors });

    const projectId = env.FIREBASE_PROJECT_ID;

    // Service Account から FCM OAuth2 トークンを取得
    if (!env.SERVICE_ACCOUNT_JSON) {
        return new Response(JSON.stringify({ success: false, error: "SERVICE_ACCOUNT_JSON secret is not set" }), { status: 500, headers: corsHeaders });
    }
    const fcmAccessToken = await getFCMToken(env.SERVICE_ACCOUNT_JSON);

    const results = [];

    // 各受信者について処理
    for (const rid of receiverIds) {
        if (rid === senderId) continue; // 自分には送らない

        let shouldSend = true;
        try {
            // 1. 相手のステータスをRTDBから取得
            const rtdbUrl = `https://${projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`;
            const rtdbToken = await getRTDBToken(env.SERVICE_ACCOUNT_JSON);
            const statusUrl = `${rtdbUrl}/status/${rid}.json?access_token=${rtdbToken}`;
            const statusRes = await fetch(statusUrl);
            const statusData = await statusRes.json(); // RTDB形式: { state, last_changed(ms), currentRoomId, ... } or null
            
            if (statusData && !statusData.error) {
                const state = statusData.state || 'offline'; // RTDB形式

                // オンラインかつ、今そのルームを見ているなら通知不要
                // ただし last_changed が 5分以上前のステータスは「古い（バックグラウンドに移行中）」とみなして通知を送る
                if (state === 'online') {
                    const lastChangedRaw = statusData.fields?.last_changed?.timestampValue
                      || statusData.fields?.last_changed?.integerValue
                      || statusData.last_changed; // RTDB形式: Unix ms
                    let lastChangedMs = 0;
                    if (typeof lastChangedRaw === 'number') {
                      lastChangedMs = lastChangedRaw; // RTDB
                    } else if (typeof lastChangedRaw === 'string') {
                      lastChangedMs = new Date(lastChangedRaw).getTime(); // Firestore timestamp
                    }
                    const ageMs = Date.now() - lastChangedMs;
                    const isStale = ageMs > 5 * 60 * 1000;
                    const currentRoomIdStatus = statusData.fields?.currentRoomId?.stringValue
                      || statusData.currentRoomId; // RTDB形式
                    if (!isStale && currentRoomIdStatus === roomId) {
                        shouldSend = false;
                    }
                }
            }
        } catch (statusErr) {
            console.error("RTDB status check failed:", statusErr);
            // 万が一ステータス取得に失敗しても、通知は送る（フェールセーフ）
            shouldSend = true;
        }

        if (shouldSend) {
            // 2. 相手の FCM トークンを取得
            const userUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/users/${rid}`;
            const userRes = await fetch(userUrl, { headers: { "Authorization": `Bearer ${workerToken}` } });
            const userData = await userRes.json();
            
            if (!userData.error && userData.fields && userData.fields.fcmTokens) {
                const tokens = userData.fields.fcmTokens.arrayValue?.values || [];
                const invalidTokens = [];

                for (const t of tokens) {
                    const tokenStr = t.stringValue;
                    
                    // FCM V1 API: webpush.notification + data の両方を送信
                    // webpush.notification があると Service Worker の onBackgroundMessage が呼ばれるケースと
                    // ブラウザが自動表示するケースがあるが、SW 側で tag による重複制御をするので問題ない
                    const fcmRes = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${fcmAccessToken}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            message: {
                                token: tokenStr,
                                // data フィールド: SW が受信して処理する
                                data: {
                                    title: title,
                                    body: body,
                                    roomId: roomId || "",
                                    senderId: senderId || "",
                                    messageId: messageId || "",
                                    type: "chat_message"
                                },
                                // Android: 高優先度通知チャンネル
                                android: {
                                    priority: "high",
                                    notification: {
                                        title: title,
                                        body: body,
                                        channel_id: "covo_messages",
                                        notification_priority: "PRIORITY_HIGH",
                                        default_sound: true,
                                        icon: "ic_notification",
                                        tag: messageId ? `msg-${messageId}` : `chat-${roomId || 'covo'}`
                                    }
                                },
                                // iOS: alert を含めて高優先度配信（これがないとiOSで届かないことがある）
                                apns: {
                                    headers: {
                                        "apns-priority": "10",
                                        "apns-push-type": "alert"
                                    },
                                    payload: {
                                        aps: {
                                            "content-available": 1,
                                            alert: {
                                                title: title,
                                                body: body
                                            },
                                            sound: "default",
                                            badge: 1
                                        }
                                    }
                                },
                                    // Web Push (Chrome/Firefox): SW の onBackgroundMessage を起こす
                                webpush: {
                                    headers: {
                                        "Urgency": "high"
                                    },
                                    notification: {
                                        title: title,
                                        body: body,
                                        icon: "/icon-192x192.png?v=6",
                                        badge: "/icon-192x192.png?v=6",
                                        tag: messageId ? `msg-${messageId}` : `chat-${roomId || 'covo'}`,
                                        renotify: true
                                    },
                                    fcm_options: {
                                        link: "/"
                                    }
                                }
                            }
                        })
                    });
                    
                    const fcmResult = await fcmRes.json();
                    if (fcmResult.error) {
                        console.error("FCM Send Error:", fcmResult.error);
                        // 無効なトークン（UNREGISTERED / NOT_FOUND）は削除対象に追加
                        const errorCode = fcmResult.error.details?.[0]?.errorCode || fcmResult.error.code;
                        if (errorCode === 'UNREGISTERED' || errorCode === 404 || 
                            fcmResult.error.status === 'NOT_FOUND' ||
                            (fcmResult.error.message && fcmResult.error.message.includes('not a valid FCM'))) {
                            invalidTokens.push(tokenStr);
                        }
                    } else {
                        results.push({ token: tokenStr, success: true });
                    }
                }

                // 無効なトークンをFirestoreから削除
                if (invalidTokens.length > 0) {
                    try {
                        const removeBody = {
                            writes: [{
                                transform: {
                                    document: `projects/${projectId}/databases/(default)/documents/artifacts/${appId}/users/${rid}`,
                                    fieldTransforms: [{
                                        fieldPath: "fcmTokens",
                                        removeAllFromArray: {
                                            values: invalidTokens.map(t => ({ stringValue: t }))
                                        }
                                    }]
                                }
                            }]
                        };
                        const commitUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
                        await fetch(commitUrl, {
                            method: "POST",
                            headers: {
                                "Authorization": `Bearer ${workerToken}`,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify(removeBody)
                        });
                        console.log(`Removed ${invalidTokens.length} invalid token(s) for user ${rid}`);
                    } catch (cleanupErr) {
                        console.error("Token cleanup error:", cleanupErr);
                    }
                }
            }
        }
    }

    return new Response(JSON.stringify({ success: true, results }), { status: 200, headers: dynamicCors });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ success: false, error: error.toString() }), { status: 500, headers: dynamicCors });
  }
}

// Service Account JSON を用いて JWT を署名し OAuth トークンを取得する関数
async function getFCMToken(serviceAccountJsonStr) {
  return _getGoogleOAuthToken(serviceAccountJsonStr, 'https://www.googleapis.com/auth/firebase.messaging');
}

// RTDB REST API用 OAuth2トークン
async function getRTDBToken(serviceAccountJsonStr) {
  return _getGoogleOAuthToken(serviceAccountJsonStr, 'https://www.googleapis.com/auth/firebase.database');
}

// 共通: サービスアカウントJWTからGoogle OAuth2トークンを取得
async function _getGoogleOAuthToken(serviceAccountJsonStr, scope) {
  const serviceAccount = JSON.parse(serviceAccountJsonStr);
  const header = { alg: 'RS256', typ: 'JWT' };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp,
    scope
  };

  const encodeBase64Url = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsignedToken = `${encodeBase64Url(header)}.${encodeBase64Url(payload)}`;

  const privateKey = serviceAccount.private_key;
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKey.substring(pemHeader.length, privateKey.length - pemFooter.length - 1).replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureBase64Url = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${unsignedToken}.${signatureBase64Url}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  
  const data = await response.json();
  return data.access_token;
}


// -------------------------------------------------------------
// Workers KV を使ったファイルアップロード＆配信
// -------------------------------------------------------------
async function handleUploadFile(request, env) {
  try {
    if (!env.FILES) {
      return new Response(JSON.stringify({ error: 'KVストレージが設定されていません' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const formData = await request.formData();
    const file = formData.get('file');
    const uploaderId = formData.get('uploaderId') || '';
    const idToken = formData.get('idToken') || '';

    if (!file || !uploaderId || !idToken) {
      return new Response(JSON.stringify({ error: '必須パラメータが不足しています' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const verifiedUser = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUser || verifiedUser.uid !== uploaderId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    if (file.size > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'ファイルは25MBまでです' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const blockedExts = ['exe', 'bat', 'cmd', 'sh', 'vbs', 'scr', 'msi', 'js', 'html', 'htm'];
    if (blockedExts.includes(ext)) {
      return new Response(JSON.stringify({ error: 'このファイル形式はセキュリティのためアップロードできません' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const key = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const folder = formData.get('folder') || '';
    if (folder && folder.includes('..')) {
      return new Response(JSON.stringify({ error: '不正なフォルダパスです' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const meta = { name: file.name, type: file.type || 'application/octet-stream', size: file.size, uploaderId, folder };

    await env.FILES.put(key, arrayBuffer, {
      metadata: meta,
      expirationTtl: undefined // 期限なし
    });

    const fileUrl = `https://simplechat-api.astro-fray-server.workers.dev/api/file/${key}`;
    return new Response(JSON.stringify({ url: fileUrl, name: file.name }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'アップロードエラー', details: err.toString() }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleDeleteFile(request, env, url) {
  try {
    const key = url.pathname.replace('/api/file/', '');
    if (!key || !env.FILES) return new Response('Not Found', { status: 404, headers: corsHeaders });

    const requesterId = url.searchParams.get('userId') || '';
    const idToken = url.searchParams.get('idToken') || '';

    if (!requesterId || !idToken) {
      return new Response(JSON.stringify({ error: "Missing authentication parameters" }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const verifiedUser = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUser || verifiedUser.uid !== requesterId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // メタデータで所有者確認
    const listed = await env.FILES.list({ prefix: key });
    const fileEntry = listed.keys.find(k => k.name === key);
    if (!fileEntry) return new Response(JSON.stringify({ error: 'ファイルが見つかりません' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

    const meta = fileEntry.metadata;
    const forceDelete = url.searchParams.get('forceDelete') === '1';

    // forceDelete is allowed if they provide the ADMIN_SECRET_KEY in the request OR if a valid Firebase user is authenticated (as client handles serverAdmin/admin logic)
    const adminKey = url.searchParams.get('adminKey') || '';
    if (forceDelete) {
      if (!verifiedUser && (!env.ADMIN_SECRET_KEY || adminKey !== env.ADMIN_SECRET_KEY)) {
        return new Response(JSON.stringify({ error: "Forbidden: Admin privileges required for force delete" }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } else if (meta && meta.uploaderId && meta.uploaderId !== requesterId) {
      return new Response(JSON.stringify({ error: '削除権限がありません' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    await env.FILES.delete(key);
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.toString() }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleServeFile(request, env, url) {
  try {
    const key = url.pathname.replace('/api/file/', '');
    if (!key || !env.FILES) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    const { value, metadata } = await env.FILES.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!value) return new Response(null, { status: 204, headers: corsHeaders });

    const contentType = (metadata && metadata.type) || 'application/octet-stream';
    const fileName = (metadata && metadata.name) ? metadata.name : key;
    const isPreview = url.searchParams.get('preview') === '1';

    return new Response(value, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': isPreview
          ? `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`
          : `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'public, max-age=31536000',
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.toString() }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// -------------------------------------------------------------
// 管理者: ストレージ使用状況取得
// -------------------------------------------------------------
async function handleStorageStats(request, env) {
  try {
    const authHeader = request.headers.get("Authorization") || "";
    const idToken = authHeader.replace("Bearer ", "");
    if (!idToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const verifiedUser = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUser) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const appId = new URL(request.url).searchParams.get("appId");
    if (!appId) return new Response(JSON.stringify({ error: "Missing appId" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    
    const workerToken = await getWorkerAuthToken(env);
    const adminUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/artifacts/${appId}/settings/adminList`;
    const adminRes = await fetch(adminUrl, { headers: { "Authorization": `Bearer ${workerToken}` } });
    const adminData = await adminRes.json();
    let isAdmin = false;
    if (adminData.fields && adminData.fields.emails && adminData.fields.emails.arrayValue && adminData.fields.emails.arrayValue.values) {
       const emails = adminData.fields.emails.arrayValue.values.map(v => v.stringValue);
       if (emails.includes(verifiedUser.email)) isAdmin = true;
    }
    if (!isAdmin) {
       return new Response(JSON.stringify({ error: "Forbidden: Not an Admin" }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const kvStats = { fileCount: 0, totalBytes: 0 };
    if (env.FILES) {
      let cursor;
      do {
        const listed = await env.FILES.list({ cursor, limit: 1000 });
        for (const key of listed.keys) {
          const folder = key.metadata?.folder || '';
          if (folder === 'simplechat/avatars' || folder === 'icons' || folder === 'avatars') {
            continue; // Ignore icons/avatars
          }
          kvStats.fileCount++;
          if (key.metadata && key.metadata.size) {
            kvStats.totalBytes += key.metadata.size;
          }
        }
        cursor = listed.cursor;
        if (listed.list_complete) break;
      } while (cursor);
    }

    return new Response(JSON.stringify({ kv: kvStats }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.toString() }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// -------------------------------------------------------------
// 管理者: 全ファイル一括削除
// -------------------------------------------------------------
async function handleBulkDeleteFiles(request, env) {
  try {
    const authHeader = request.headers.get("Authorization") || "";
    const idToken = authHeader.replace("Bearer ", "");
    if (!idToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const verifiedUser = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUser) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const appId = new URL(request.url).searchParams.get("appId");
    if (!appId) return new Response(JSON.stringify({ error: "Missing appId" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    
    const workerToken = await getWorkerAuthToken(env);
    const adminUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/artifacts/${appId}/settings/adminList`;
    const adminRes = await fetch(adminUrl, { headers: { "Authorization": `Bearer ${workerToken}` } });
    const adminData = await adminRes.json();
    let isAdmin = false;
    if (adminData.fields && adminData.fields.emails && adminData.fields.emails.arrayValue && adminData.fields.emails.arrayValue.values) {
       const emails = adminData.fields.emails.arrayValue.values.map(v => v.stringValue);
       if (emails.includes(verifiedUser.email)) isAdmin = true;
    }
    if (!isAdmin) {
       return new Response(JSON.stringify({ error: "Forbidden: Not an Admin" }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let kvDeleted = 0;
    if (env.FILES) {
      let cursor;
      do {
        const listed = await env.FILES.list({ cursor, limit: 1000 });
        for (const key of listed.keys) {
          const folder = key.metadata?.folder || '';
          if (folder === 'simplechat/avatars' || folder === 'icons' || folder === 'avatars') {
            continue; // Ignore icons/avatars
          }
          await env.FILES.delete(key.name);
          kvDeleted++;
        }
        cursor = listed.cursor;
        if (listed.list_complete) break;
      } while (cursor);
    }

    return new Response(JSON.stringify({ success: true, kvDeleted }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.toString() }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}


// -------------------------------------------------------------
// 外部ファイル共有プロキシ（catbox.moe → 0x0.st の順で試行）
// -------------------------------------------------------------
async function handleShareFile(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const idToken = formData.get('idToken') || '';
    const uploaderId = formData.get('uploaderId') || formData.get('userId') || '';

    if (!file || !idToken || !uploaderId) {
      return new Response(JSON.stringify({ error: '必須パラメータが不足しています' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (file.size > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'ファイルは25MBまでです' }), { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const verifiedUser = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUser || verifiedUser.uid !== uploaderId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // ArrayBufferとして読み込んでBlobを再構築（Worker間の転送を安定させる）
    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type || 'application/octet-stream' });
    const fileName = file.name || 'file';

    // 1. catbox.moe を試す
    try {
      const f1 = new FormData();
      f1.append('reqtype', 'fileupload');
      f1.append('fileToUpload', blob, fileName);
      const r1 = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: f1 });
      const t1 = (await r1.text()).trim();
      if (t1.startsWith('https://')) {
        return new Response(JSON.stringify({ url: t1, service: 'catbox.moe' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      console.warn('[shareFile] catbox.moe failed:', r1.status, t1.slice(0, 100));
    } catch (e1) {
      console.warn('[shareFile] catbox.moe error:', e1.toString());
    }

    // 2. 0x0.st にフォールバック
    try {
      const f2 = new FormData();
      f2.append('file', blob, fileName);
      const r2 = await fetch('https://0x0.st', { method: 'POST', body: f2 });
      const t2 = (await r2.text()).trim();
      if (t2.startsWith('https://')) {
        return new Response(JSON.stringify({ url: t2, service: '0x0.st' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      console.warn('[shareFile] 0x0.st failed:', r2.status, t2.slice(0, 100));
    } catch (e2) {
      console.warn('[shareFile] 0x0.st error:', e2.toString());
    }

    return new Response(JSON.stringify({ error: 'すべてのアップロードサービスに失敗しました' }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy error', details: err.toString() }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}



const tokenCache = new Map();

async function verifyFirebaseIdToken(idToken, env) {
  if (!idToken) return null;
  const now = Date.now();
  if (tokenCache.has(idToken)) {
    const cached = tokenCache.get(idToken);
    if (now < cached.expiresAt) {
      return cached.user;
    } else {
      tokenCache.delete(idToken);
    }
  }
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    });
    const data = await res.json();
    if (data.error || !data.users || data.users.length === 0) return null;
    const user = { uid: data.users[0].localId, email: data.users[0].email };
    tokenCache.set(idToken, { user, expiresAt: now + 900000 });
    if (tokenCache.size > 1000) {
      const firstKey = tokenCache.keys().next().value;
      tokenCache.delete(firstKey);
    }
    return user;
  } catch (e) {
    return null;
  }
}

async function isD1Admin(appId, verifiedUser, env) {
  if (!appId || !verifiedUser) return false;
  try {
    const row = await env.DB.prepare("SELECT setting_data FROM settings WHERE app_id = ? AND setting_id = ?").bind(appId, "adminList").first();
    if (row && row.setting_data) {
      const data = JSON.parse(row.setting_data);
      const emailMatch = data && Array.isArray(data.emails) && verifiedUser.email && data.emails.includes(verifiedUser.email);
      const uidMatch = data && Array.isArray(data.admins) && verifiedUser.uid && data.admins.includes(verifiedUser.uid);
      if (emailMatch || uidMatch) {
        return true;
      }
    }
  } catch(e) {
    console.error("isD1Admin error:", e);
  }
  return false;
}

async function handleSetOffline(request, env) {
  // sendBeaconはcredentials=includeで送るためAccess-Control-Allow-Origin: *が使えない
  const origin = request.headers.get("Origin") || "*";
  const corsSetOffline = {
    ...corsHeaders,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
  };

  try {
    const bodyText = await request.text();
    const data = JSON.parse(bodyText);
    const { userId, appId, idToken } = data;

    if (!userId || !appId || !idToken) {
      return new Response("Missing fields", { status: 400, headers: corsSetOffline });
    }

    const verifiedUser = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUser || verifiedUser.uid !== userId) {
      return new Response("Unauthorized", { status: 401, headers: corsSetOffline });
    }

    const projectId = env.FIREBASE_PROJECT_ID;
    const rtdbUrl = `https://${projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`;
    const rtdbToken = await getRTDBToken(env.SERVICE_ACCOUNT_JSON);

    // RTDB REST APIで offline を書く
    // PATCH /status/{userId}.json: stateとlast_changedのみ部分書き換え（nicknameなどは保持）
    await fetch(`${rtdbUrl}/status/${userId}.json?access_token=${rtdbToken}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "offline",
        last_changed: Date.now() // RTDBはUnix msでOK
      })
    });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsSetOffline });
  } catch (error) {
    console.error("setOffline Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.toString() }), { status: 500, headers: corsSetOffline });
  }
}

// -------------------------------------------------------------
// Cloudflare D1 連携 API エンドポイント群
// -------------------------------------------------------------
async function handleD1Api(request, env, url) {
  const origin = request.headers.get("Origin") || "*";
  const d1Cors = {
    ...corsHeaders,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: d1Cors });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ error: "D1 database not bound to env.DB" }), { status: 500, headers: d1Cors });
  }

  // リクエスト認証 (Authorization: Bearer <ID_TOKEN>)
  const authHeader = request.headers.get("Authorization") || "";
  const idToken = authHeader.replace("Bearer ", "").trim();
  let verifiedUser = null;
  if (idToken) {
    verifiedUser = await verifyFirebaseIdToken(idToken, env);
  }

  try {
    const subpath = url.pathname.replace("/api/d1/", "");
    
    // 1. 設定管理 (settings)
    if (subpath.startsWith("settings")) {
      if (request.method === "GET") {
        const appId = url.searchParams.get("appId");
        const settingId = url.searchParams.get("settingId");
        if (!appId || !settingId) return new Response(JSON.stringify({ error: "Missing param" }), { status: 400, headers: d1Cors });
        // 設定読み取りには認証が必要（Firestoreと同等）
        if (!verifiedUser) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: d1Cors });
        const row = await env.DB.prepare("SELECT setting_data FROM settings WHERE app_id = ? AND setting_id = ?").bind(appId, settingId).first();
        if (!row) return new Response(JSON.stringify({ empty: true }), { status: 200, headers: d1Cors });
        return new Response(JSON.stringify({ empty: false, data: JSON.parse(row.setting_data) }), { status: 200, headers: d1Cors });
      }
      if (request.method === "POST") {
        if (!verifiedUser) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: d1Cors });
        const { appId, settingId, data } = await request.json();
        const existingAdminRow = await env.DB.prepare("SELECT setting_data FROM settings WHERE app_id = ? AND setting_id = ?").bind(appId, "adminList").first();
        if (existingAdminRow && existingAdminRow.setting_data) {
          const isAdmin = await isD1Admin(appId, verifiedUser, env);
          if (!isAdmin) {
            return new Response(JSON.stringify({ error: "Forbidden: Only admins can update settings" }), { status: 403, headers: d1Cors });
          }
        }
        await env.DB.prepare("INSERT INTO settings (app_id, setting_id, setting_data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(app_id, setting_id) DO UPDATE SET setting_data = excluded.setting_data, updated_at = excluded.updated_at")
          .bind(appId, settingId, JSON.stringify(data), Date.now()).run();
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
      }
    }

    // 2. ユーザー情報・プロファイル・鍵管理 (users)
    if (subpath.startsWith("users")) {
      if (request.method === "GET") {
        const appId = url.searchParams.get("appId");
        const userId = url.searchParams.get("userId");
        const keyType = url.searchParams.get("keyType"); // 'keys' or 'escrowKey' etc.
        const type = url.searchParams.get("type"); // 'profile' or 'keys' or 'user'
        if (!appId || !userId) return new Response(JSON.stringify({ error: "Missing param" }), { status: 400, headers: d1Cors });
        // ユーザー情報読み取りには認証が必要
        if (!verifiedUser) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: d1Cors });
        
        if (type === "keys") {
          // 秘密鍵は本人のみ（Firestoreルールと同等）
          if (verifiedUser.uid !== userId) {
            return new Response(JSON.stringify({ error: "Forbidden: Private key access restricted to owner" }), { status: 403, headers: d1Cors });
          }
          const row = await env.DB.prepare("SELECT key_data FROM user_private_keys WHERE user_id = ? AND app_id = ? AND key_type = ?").bind(userId, appId, keyType || 'keys').first();
          if (!row) return new Response(JSON.stringify({ empty: true }), { status: 200, headers: d1Cors });
          return new Response(JSON.stringify({ empty: false, data: JSON.parse(row.key_data) }), { status: 200, headers: d1Cors });
        }
        // 通常のユーザー情報取得
        const row = await env.DB.prepare("SELECT * FROM users WHERE user_id = ? AND app_id = ?").bind(userId, appId).first();
        if (!row) return new Response(JSON.stringify({ empty: true }), { status: 200, headers: d1Cors });
        const data = {
          nickname: row.nickname,
          avatarUrl: row.avatar_url,
          publicKeyJwk: row.public_key_jwk ? JSON.parse(row.public_key_jwk) : null,
          fcmTokens: row.fcm_tokens ? JSON.parse(row.fcm_tokens) : []
        };
        return new Response(JSON.stringify({ empty: false, data }), { status: 200, headers: d1Cors });
      }
      if (request.method === "POST") {
        if (!verifiedUser) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: d1Cors });
        const body = await request.json();
        const { appId, userId, type, keyType, keyData, nickname, avatarUrl, publicKeyJwk, fcmToken, removeFcmToken } = body;
        
        if (type === "keys") {
          await env.DB.prepare("INSERT INTO user_private_keys (user_id, app_id, key_type, key_data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, app_id, key_type) DO UPDATE SET key_data = excluded.key_data, updated_at = excluded.updated_at")
            .bind(userId, appId, keyType || 'keys', JSON.stringify(keyData), Date.now()).run();
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }
        
        // ユーザー情報の upsert
        const userRow = await env.DB.prepare("SELECT * FROM users WHERE user_id = ? AND app_id = ?").bind(userId, appId).first();
        let curTokens = userRow && userRow.fcm_tokens ? JSON.parse(userRow.fcm_tokens) : [];
        if (fcmToken && !curTokens.includes(fcmToken)) curTokens.push(fcmToken);
        if (removeFcmToken) curTokens = curTokens.filter(t => t !== removeFcmToken);
        
        const nextNickname = nickname !== undefined ? nickname : (userRow ? userRow.nickname : null);
        const nextAvatar = avatarUrl !== undefined ? avatarUrl : (userRow ? userRow.avatar_url : null);
        const nextJwk = publicKeyJwk !== undefined ? JSON.stringify(publicKeyJwk) : (userRow ? userRow.public_key_jwk : null);

        await env.DB.prepare("INSERT INTO users (user_id, app_id, nickname, avatar_url, public_key_jwk, fcm_tokens, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET nickname = excluded.nickname, avatar_url = excluded.avatar_url, public_key_jwk = excluded.public_key_jwk, fcm_tokens = excluded.fcm_tokens, updated_at = excluded.updated_at")
          .bind(userId, appId, nextNickname, nextAvatar, nextJwk, JSON.stringify(curTokens), Date.now(), Date.now()).run();
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
      }
    }

    // 3. サーバー管理 (servers)
    if (subpath.startsWith("servers")) {
      if (request.method === "GET") {
        const appId = url.searchParams.get("appId");
        const serverId = url.searchParams.get("serverId");
        const userId = url.searchParams.get("userId");
        const type = url.searchParams.get("type"); // 'all' or 'joined' or 'list' or 'single' or 'stamps' or 'stampGroups' or 'profiles' or 'inviteCodes'
        
        if (!appId) return new Response(JSON.stringify({ error: "Missing appId" }), { status: 400, headers: d1Cors });
        
        if (type === "stamps") {
          const rows = (await env.DB.prepare("SELECT * FROM server_stamps WHERE server_id = ? AND app_id = ?").bind(serverId, appId).all()).results;
          return new Response(JSON.stringify({ empty: rows.length === 0, docs: rows }), { status: 200, headers: d1Cors });
        }
        if (type === "stampGroups") {
          const rows = (await env.DB.prepare("SELECT * FROM server_stamp_groups WHERE server_id = ? AND app_id = ?").bind(serverId, appId).all()).results;
          return new Response(JSON.stringify({ empty: rows.length === 0, docs: rows.map(r => ({ id: r.group_id, data: JSON.parse(r.group_data) })) }), { status: 200, headers: d1Cors });
        }
        if (type === "inviteCodes") {
          const rows = (await env.DB.prepare("SELECT * FROM server_invite_codes WHERE server_id = ? AND app_id = ?").bind(serverId, appId).all()).results;
          return new Response(JSON.stringify({ empty: rows.length === 0, docs: rows }), { status: 200, headers: d1Cors });
        }
        if (type === "inviteIndex") {
          const code = url.searchParams.get("code");
          const row = await env.DB.prepare("SELECT server_id FROM server_invite_codes WHERE code = ? AND app_id = ?").bind(code, appId).first();
          if (!row) return new Response(JSON.stringify({ empty: true }), { status: 200, headers: d1Cors });
          return new Response(JSON.stringify({ empty: false, data: { serverId: row.server_id } }), { status: 200, headers: d1Cors });
        }
        if (type === "profiles") {
          if (userId) {
            const row = await env.DB.prepare("SELECT profile_data FROM server_profiles WHERE server_id = ? AND user_id = ? AND app_id = ?").bind(serverId, userId, appId).first();
            if (!row) return new Response(JSON.stringify({ empty: true }), { status: 200, headers: d1Cors });
            return new Response(JSON.stringify({ empty: false, data: JSON.parse(row.profile_data) }), { status: 200, headers: d1Cors });
          }
          const rows = (await env.DB.prepare("SELECT user_id, profile_data FROM server_profiles WHERE server_id = ? AND app_id = ?").bind(serverId, appId).all()).results;
          return new Response(JSON.stringify({ empty: rows.length === 0, docs: rows.map(r => ({ id: r.user_id, data: JSON.parse(r.profile_data) })) }), { status: 200, headers: d1Cors });
        }
        
        if (serverId) {
          // 単一サーバー取得
          const row = await env.DB.prepare("SELECT * FROM servers WHERE server_id = ? AND app_id = ?").bind(serverId, appId).first();
          if (!row) return new Response(JSON.stringify({ empty: true }), { status: 200, headers: d1Cors });
          const data = row.server_data ? JSON.parse(row.server_data) : {};
          data.name = row.name;
          data.description = row.description;
          data.isPublic = row.is_public === 1;
          data.memberCount = row.member_count;
          // joinedUsers 配列の復元
          const joinedRows = (await env.DB.prepare("SELECT user_id FROM server_joined_users WHERE server_id = ? AND app_id = ?").bind(serverId, appId).all()).results;
          data.joinedUsers = joinedRows.map(r => r.user_id);
          return new Response(JSON.stringify({ empty: false, id: row.server_id, data }), { status: 200, headers: d1Cors });
        }
        
        // サーバー一覧取得
        let rows = [];
        if (userId) {
          rows = (await env.DB.prepare("SELECT s.* FROM servers s JOIN server_joined_users j ON s.server_id = j.server_id WHERE j.user_id = ? AND s.app_id = ?").bind(userId, appId).all()).results;
        } else {
          rows = (await env.DB.prepare("SELECT * FROM servers WHERE app_id = ?").bind(appId).all()).results;
        }
        
        const docs = [];
        for (const r of rows) {
          const d = r.server_data ? JSON.parse(r.server_data) : {};
          d.name = r.name;
          d.description = r.description;
          d.isPublic = r.is_public === 1;
          d.memberCount = r.member_count;
          const jRows = (await env.DB.prepare("SELECT user_id FROM server_joined_users WHERE server_id = ? AND app_id = ?").bind(r.server_id, appId).all()).results;
          d.joinedUsers = jRows.map(jr => jr.user_id);
          docs.push({ id: r.server_id, data: d });
        }
        return new Response(JSON.stringify({ empty: docs.length === 0, docs }), { status: 200, headers: d1Cors });
      }

      if (request.method === "POST") {
        if (!verifiedUser) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: d1Cors });
        const body = await request.json();
        const { appId, serverId, type, name, description, isPublic, data, passwordHash, userId, profileData, stampId, stampName, stampUrl, groupId, groupData, code, inviteData, deleteFieldVal } = body;
        
        if (type === "create" || type === "update") {
          const cur = await env.DB.prepare("SELECT server_data, member_count FROM servers WHERE server_id = ? AND app_id = ?").bind(serverId, appId).first();
          let mergedData = cur && cur.server_data ? JSON.parse(cur.server_data) : {};
          if (data) mergedData = { ...mergedData, ...data };
          if (deleteFieldVal && mergedData[deleteFieldVal] !== undefined) delete mergedData[deleteFieldVal];
          
          const nextName = name !== undefined ? name : (mergedData.name || "Untitled");
          const nextDesc = description !== undefined ? description : (mergedData.description || "");
          const nextPub = isPublic !== undefined ? (isPublic ? 1 : 0) : (mergedData.isPublic ? 1 : 0);
          const memberCount = cur ? cur.member_count : 1;

          await env.DB.prepare("INSERT INTO servers (server_id, app_id, name, description, is_public, created_by, created_at, member_count, server_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(server_id) DO UPDATE SET name = excluded.name, description = excluded.description, is_public = excluded.is_public, server_data = excluded.server_data")
            .bind(serverId, appId, nextName, nextDesc, nextPub, verifiedUser.uid, Date.now(), memberCount, JSON.stringify(mergedData)).run();
          
          if (userId && type === "create") {
            await env.DB.prepare("INSERT OR IGNORE INTO server_joined_users (server_id, user_id, app_id, joined_at) VALUES (?, ?, ?, ?)").bind(serverId, userId, appId, Date.now()).run();
          }
          if (passwordHash) {
            await env.DB.prepare("INSERT INTO server_secrets (server_id, app_id, password_hash, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(server_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at")
              .bind(serverId, appId, passwordHash, Date.now()).run();
          }
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }
        
        if (type === "join") {
          const { password, inviteCode } = body;
          if (password) {
            const sec = await env.DB.prepare("SELECT password_hash FROM server_secrets WHERE server_id = ? AND app_id = ?").bind(serverId, appId).first();
            if (!sec || sec.password_hash !== password) {
              return new Response(JSON.stringify({ success: false, error: "Incorrect password" }), { status: 401, headers: d1Cors });
            }
          } else if (inviteCode) {
            const inv = await env.DB.prepare("SELECT * FROM server_invite_codes WHERE code = ? AND server_id = ? AND app_id = ?").bind(inviteCode, serverId, appId).first();
            if (!inv || inv.disabled === 1) {
              return new Response(JSON.stringify({ success: false, error: "Invalid or disabled invite code" }), { status: 404, headers: d1Cors });
            }
            if (inv.expires_at && inv.expires_at < Date.now()) {
              return new Response(JSON.stringify({ success: false, error: "Invite code expired" }), { status: 403, headers: d1Cors });
            }
            if (inv.max_uses > 0 && inv.uses >= inv.max_uses) {
              return new Response(JSON.stringify({ success: false, error: "Invite code use limit reached" }), { status: 403, headers: d1Cors });
            }
            await env.DB.prepare("UPDATE server_invite_codes SET uses = uses + 1 WHERE code = ?").bind(inviteCode).run();
          } else {
            return new Response(JSON.stringify({ success: false, error: "Auth required" }), { status: 400, headers: d1Cors });
          }
          
          await env.DB.prepare("INSERT OR IGNORE INTO server_joined_users (server_id, user_id, app_id, joined_at) VALUES (?, ?, ?, ?)").bind(serverId, userId, appId, Date.now()).run();
          await env.DB.prepare("UPDATE servers SET member_count = member_count + 1 WHERE server_id = ? AND app_id = ?").bind(serverId, appId).run();
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }

        if (type === "leave") {
          await env.DB.prepare("DELETE FROM server_joined_users WHERE server_id = ? AND user_id = ? AND app_id = ?").bind(serverId, userId, appId).run();
          await env.DB.prepare("UPDATE servers SET member_count = MAX(1, member_count - 1) WHERE server_id = ? AND app_id = ?").bind(serverId, appId).run();
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }

        if (type === "profile") {
          await env.DB.prepare("INSERT INTO server_profiles (server_id, user_id, app_id, profile_data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(server_id, user_id) DO UPDATE SET profile_data = excluded.profile_data, updated_at = excluded.updated_at")
            .bind(serverId, userId, appId, JSON.stringify(profileData), Date.now()).run();
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }

        if (type === "stamp") {
          await env.DB.prepare("INSERT OR REPLACE INTO server_stamps (stamp_id, server_id, app_id, name, url, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(stampId, serverId || "general", appId, stampName || "", stampUrl || "", verifiedUser.uid, Date.now()).run();
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }

        if (type === "stampGroup") {
          await env.DB.prepare("INSERT OR REPLACE INTO server_stamp_groups (group_id, server_id, app_id, group_data, created_at) VALUES (?, ?, ?, ?, ?)")
            .bind(groupId, serverId, appId, JSON.stringify(groupData), Date.now()).run();
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }

        if (type === "inviteCode") {
          await env.DB.prepare("INSERT OR REPLACE INTO server_invite_codes (code, server_id, app_id, created_by, created_at, expires_at, uses, max_uses, disabled, invite_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(code, serverId, appId, verifiedUser.uid, Date.now(), inviteData.expiresAt || null, inviteData.uses || 0, inviteData.maxUses || 0, inviteData.disabled ? 1 : 0, JSON.stringify(inviteData)).run();
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }

        return new Response(JSON.stringify({ error: "Unknown action type" }), { status: 400, headers: d1Cors });
      }

      if (request.method === "DELETE") {
        if (!verifiedUser) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: d1Cors });
        const appId = url.searchParams.get("appId");
        const serverId = url.searchParams.get("serverId");
        const type = url.searchParams.get("type"); // 'server' or 'inviteCode' or 'stamp'
        if (type === "inviteCode") {
          const code = url.searchParams.get("code");
          await env.DB.prepare("DELETE FROM server_invite_codes WHERE code = ? AND app_id = ?").bind(code, appId).run();
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }
        if (type === "stamp") {
          const stampId = url.searchParams.get("stampId");
          await env.DB.prepare("DELETE FROM server_stamps WHERE stamp_id = ? AND app_id = ?").bind(stampId, appId).run();
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }
        // サーバー削除
        await env.DB.prepare("DELETE FROM servers WHERE server_id = ? AND app_id = ?").bind(serverId, appId).run();
        await env.DB.prepare("DELETE FROM server_joined_users WHERE server_id = ? AND app_id = ?").bind(serverId, appId).run();
        await env.DB.prepare("DELETE FROM rooms WHERE server_id = ? AND app_id = ?").bind(serverId, appId).run();
        await env.DB.prepare("DELETE FROM messages WHERE server_id = ? AND app_id = ?").bind(serverId, appId).run();
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
      }
    }

    // 4. ルーム管理 (rooms)
    if (subpath.startsWith("rooms")) {
      if (request.method === "GET") {
        const appId = url.searchParams.get("appId");
        const serverId = url.searchParams.get("serverId");
        const roomId = url.searchParams.get("roomId");
        const type = url.searchParams.get("type"); // 'list' or 'single' or 'keys'
        if (!appId || !serverId) return new Response(JSON.stringify({ error: "Missing param" }), { status: 400, headers: d1Cors });
        
        if (type === "keys") {
          const rows = (await env.DB.prepare("SELECT user_id, key_data FROM room_keys WHERE room_id = ? AND app_id = ?").bind(roomId, appId).all()).results;
          return new Response(JSON.stringify({ empty: rows.length === 0, docs: rows.map(r => ({ id: r.user_id, data: JSON.parse(r.key_data) })) }), { status: 200, headers: d1Cors });
        }
        if (roomId) {
          const row = await env.DB.prepare("SELECT * FROM rooms WHERE room_id = ? AND server_id = ? AND app_id = ?").bind(roomId, serverId, appId).first();
          if (!row) return new Response(JSON.stringify({ empty: true }), { status: 200, headers: d1Cors });
          const data = row.room_data ? JSON.parse(row.room_data) : {};
          data.name = row.name;
          data.type = row.type;
          data.currentKeyVersion = row.current_key_version;
          return new Response(JSON.stringify({ empty: false, id: row.room_id, data }), { status: 200, headers: d1Cors });
        }
        
        const rows = (await env.DB.prepare("SELECT * FROM rooms WHERE server_id = ? AND app_id = ?").bind(serverId, appId).all()).results;
        const docs = rows.map(r => {
          const d = r.room_data ? JSON.parse(r.room_data) : {};
          d.name = r.name;
          d.type = r.type;
          d.currentKeyVersion = r.current_key_version;
          return { id: r.room_id, data: d };
        });
        return new Response(JSON.stringify({ empty: docs.length === 0, docs }), { status: 200, headers: d1Cors });
      }

      if (request.method === "POST") {
        if (!verifiedUser) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: d1Cors });
        const body = await request.json();
        const { appId, serverId, roomId, type, name, roomType, data, keys, currentKeyVersion } = body;
        
        if (type === "create" || type === "update") {
          const cur = await env.DB.prepare("SELECT room_data, current_key_version FROM rooms WHERE room_id = ? AND app_id = ?").bind(roomId, appId).first();
          let mergedData = cur && cur.room_data ? JSON.parse(cur.room_data) : {};
          if (data) mergedData = { ...mergedData, ...data };
          const nextName = name !== undefined ? name : (mergedData.name || "General");
          const nextType = roomType !== undefined ? roomType : (mergedData.type || "chat");
          const nextVer = currentKeyVersion !== undefined ? currentKeyVersion : (cur ? cur.current_key_version : 1);

          await env.DB.prepare("INSERT INTO rooms (room_id, server_id, app_id, name, type, created_by, created_at, current_key_version, room_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(room_id) DO UPDATE SET name = excluded.name, type = excluded.type, current_key_version = excluded.current_key_version, room_data = excluded.room_data")
            .bind(roomId, serverId, appId, nextName, nextType, verifiedUser.uid, Date.now(), nextVer, JSON.stringify(mergedData)).run();
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }

        if (type === "keys") {
          // roomKeys 一括更新 (writeBatchの代わり)
          for (const kObj of keys) {
            await env.DB.prepare("INSERT INTO room_keys (room_id, user_id, server_id, app_id, key_data, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(room_id, user_id) DO UPDATE SET key_data = excluded.key_data, updated_at = excluded.updated_at")
              .bind(roomId, kObj.userId, serverId, appId, JSON.stringify(kObj.keyData), Date.now()).run();
          }
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }
      }

      if (request.method === "DELETE") {
        if (!verifiedUser) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: d1Cors });
        const appId = url.searchParams.get("appId");
        const roomId = url.searchParams.get("roomId");
        await env.DB.prepare("DELETE FROM rooms WHERE room_id = ? AND app_id = ?").bind(roomId, appId).run();
        await env.DB.prepare("DELETE FROM messages WHERE room_id = ? AND app_id = ?").bind(roomId, appId).run();
        await env.DB.prepare("DELETE FROM room_keys WHERE room_id = ? AND app_id = ?").bind(roomId, appId).run();
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
      }
    }

    // 5. メッセージ管理＆RTDB通知 (messages)
    if (subpath.startsWith("messages")) {
      if (request.method === "GET") {
        const appId = url.searchParams.get("appId");
        const roomId = url.searchParams.get("roomId");
        const serverId = url.searchParams.get("serverId");
        const messageId = url.searchParams.get("messageId");
        if (!appId || !roomId) return new Response(JSON.stringify({ error: "Missing param" }), { status: 400, headers: d1Cors });
        
        // 認証チェック: メッセージ読み取りには Firebase ID トークンが必要
        if (!verifiedUser) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: d1Cors });
        
        // サーバーメンバーシップチェック: 指定されたserverId に参加しているユーザーまたは管理者のみ許可
        if (serverId) {
          const memberRow = await env.DB.prepare(
            "SELECT 1 FROM server_joined_users WHERE server_id = ? AND user_id = ? AND app_id = ?"
          ).bind(serverId, verifiedUser.uid, appId).first();
          if (!memberRow) {
            const isAdmin = await isD1Admin(appId, verifiedUser, env);
            if (!isAdmin) {
              return new Response(JSON.stringify({ error: "Forbidden: Not a server member or admin" }), { status: 403, headers: d1Cors });
            }
          }
        }
        
        if (messageId) {
          const row = await env.DB.prepare("SELECT * FROM messages WHERE message_id = ? AND room_id = ? AND app_id = ?").bind(messageId, roomId, appId).first();
          if (!row) return new Response(JSON.stringify({ empty: true }), { status: 200, headers: d1Cors });
          const data = row.additional_data ? JSON.parse(row.additional_data) : {};
          data.text = row.text;
          data.senderId = row.sender_id;
          data.createdAt = row.created_at;
          data.isPinned = row.is_pinned === 1;
          data.reactions = row.reactions ? JSON.parse(row.reactions) : {};
          return new Response(JSON.stringify({ empty: false, id: row.message_id, data }), { status: 200, headers: d1Cors });
        }
        
        const rows = (await env.DB.prepare("SELECT * FROM messages WHERE room_id = ? AND app_id = ? ORDER BY created_at ASC").bind(roomId, appId).all()).results;
        const docs = rows.map(r => {
          const d = r.additional_data ? JSON.parse(r.additional_data) : {};
          d.text = r.text;
          d.senderId = r.sender_id;
          d.createdAt = r.created_at;
          d.isPinned = r.is_pinned === 1;
          d.reactions = r.reactions ? JSON.parse(r.reactions) : {};
          return { id: r.message_id, data: d };
        });
        return new Response(JSON.stringify({ empty: docs.length === 0, docs }), { status: 200, headers: d1Cors });
      }

      if (request.method === "POST") {
        if (!verifiedUser) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: d1Cors });
        const body = await request.json();
        const { appId, serverId, roomId, messageId, type, data, isPinned, reactionUserId, reactionEmoji } = body;
        
        if (type === "add") {
          const text = data.text || "";
          const created_at = data.createdAt || Date.now();
          const senderId = data.senderId || verifiedUser.uid;
          const additionalData = { ...data };
          delete additionalData.text; delete additionalData.createdAt; delete additionalData.senderId;
          
          await env.DB.prepare("INSERT INTO messages (message_id, room_id, server_id, app_id, sender_id, text, created_at, is_pinned, reactions, additional_data) VALUES (?, ?, ?, ?, ?, ?, ?, 0, '{}', ?)")
            .bind(messageId, roomId, serverId, appId, senderId, text, created_at, JSON.stringify(additionalData)).run();
          
          // ★★★ RTDB へ通知をPUT (リアルタイムプッシュ) ★★★
          if (env.SERVICE_ACCOUNT_JSON) {
            try {
              const projectId = env.FIREBASE_PROJECT_ID;
              const rtdbUrl = `https://${projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`;
              const rtdbToken = await getRTDBToken(env.SERVICE_ACCOUNT_JSON);
              const notifyData = {
                messageId,
                roomId,
                senderId,
                text,
                createdAt: created_at,
                data: data
              };
              await fetch(`${rtdbUrl}/rooms/${roomId}/latestMessage.json?access_token=${rtdbToken}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(notifyData)
              });
            } catch (rtdbErr) { console.error("RTDB Notify Error:", rtdbErr); }
          }
          
          return new Response(JSON.stringify({ success: true, id: messageId }), { status: 200, headers: d1Cors });
        }

        if (type === "pin") {
          await env.DB.prepare("UPDATE messages SET is_pinned = ? WHERE message_id = ? AND room_id = ? AND app_id = ?").bind(isPinned ? 1 : 0, messageId, roomId, appId).run();
          // ピン留め変更もRTDBへ通知
          if (env.SERVICE_ACCOUNT_JSON) {
            try {
              const rtdbUrl = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app`;
              const rtdbToken = await getRTDBToken(env.SERVICE_ACCOUNT_JSON);
              await fetch(`${rtdbUrl}/rooms/${roomId}/latestPin.json?access_token=${rtdbToken}`, {
                method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, isPinned, updatedAt: Date.now() })
              });
            } catch(e){}
          }
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }

        if (type === "reaction") {
          const row = await env.DB.prepare("SELECT reactions FROM messages WHERE message_id = ? AND room_id = ? AND app_id = ?").bind(messageId, roomId, appId).first();
          if (!row) return new Response(JSON.stringify({ error: "Message not found" }), { status: 404, headers: d1Cors });
          const rx = row.reactions ? JSON.parse(row.reactions) : {};
          if (!reactionEmoji) { delete rx[reactionUserId]; } else { rx[reactionUserId] = reactionEmoji; }
          await env.DB.prepare("UPDATE messages SET reactions = ? WHERE message_id = ? AND room_id = ? AND app_id = ?").bind(JSON.stringify(rx), messageId, roomId, appId).run();
          
          // リアクション変更もRTDBへ通知
          if (env.SERVICE_ACCOUNT_JSON) {
            try {
              const rtdbUrl = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app`;
              const rtdbToken = await getRTDBToken(env.SERVICE_ACCOUNT_JSON);
              await fetch(`${rtdbUrl}/rooms/${roomId}/latestReaction.json?access_token=${rtdbToken}`, {
                method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, reactions: rx, updatedAt: Date.now() })
              });
            } catch(e){}
          }
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }
      }

      if (request.method === "DELETE") {
        if (!verifiedUser) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: d1Cors });
        const appId = url.searchParams.get("appId");
        const roomId = url.searchParams.get("roomId");
        const messageId = url.searchParams.get("messageId");
        await env.DB.prepare("DELETE FROM messages WHERE message_id = ? AND room_id = ? AND app_id = ?").bind(messageId, roomId, appId).run();
        // 削除通知
        if (env.SERVICE_ACCOUNT_JSON) {
          try {
            const rtdbUrl = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app`;
            const rtdbToken = await getRTDBToken(env.SERVICE_ACCOUNT_JSON);
            await fetch(`${rtdbUrl}/rooms/${roomId}/latestDelete.json?access_token=${rtdbToken}`, {
              method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, updatedAt: Date.now() })
            });
          } catch(e){}
        }
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
      }
    }

    // 6. 既読＆タイピング (activity)
    if (subpath.startsWith("activity")) {
      if (request.method === "POST") {
        if (!verifiedUser) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: d1Cors });
        const body = await request.json();
        const { appId, serverId, roomId, userId, nickname, type, lastReadMessageId } = body;
        
        if (type === "read") {
          await env.DB.prepare("INSERT INTO read_receipts (room_id, user_id, server_id, app_id, last_read_at, last_read_message_id) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(room_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at, last_read_message_id = excluded.last_read_message_id")
            .bind(roomId, userId, serverId, appId, Date.now(), lastReadMessageId || "").run();
          await env.DB.prepare("INSERT INTO user_read_states (user_id, app_id, room_id, last_read_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, app_id, room_id) DO UPDATE SET last_read_at = excluded.last_read_at")
            .bind(userId, appId, roomId, Date.now()).run();
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }
        
        if (type === "typing") {
          // タイピング状態は RTDB に直接 PUT
          if (env.SERVICE_ACCOUNT_JSON) {
            try {
              const rtdbUrl = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app`;
              const rtdbToken = await getRTDBToken(env.SERVICE_ACCOUNT_JSON);
              await fetch(`${rtdbUrl}/rooms/${roomId}/typing/${userId}.json?access_token=${rtdbToken}`, {
                method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname, updatedAt: Date.now() })
              });
            } catch(e){}
          }
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }
      }
      if (request.method === "GET") {
        const appId = url.searchParams.get("appId");
        const roomId = url.searchParams.get("roomId");
        const userId = url.searchParams.get("userId");
        const type = url.searchParams.get("type"); // 'receipts' or 'readStates'
        if (type === "receipts") {
          const rows = (await env.DB.prepare("SELECT user_id, last_read_at, last_read_message_id FROM read_receipts WHERE room_id = ? AND app_id = ?").bind(roomId, appId).all()).results;
          return new Response(JSON.stringify({ empty: rows.length === 0, docs: rows.map(r => ({ id: r.user_id, data: { lastReadAt: r.last_read_at, lastReadMessageId: r.last_read_message_id } })) }), { status: 200, headers: d1Cors });
        }
        if (type === "readStates") {
          const rows = (await env.DB.prepare("SELECT room_id, last_read_at FROM user_read_states WHERE user_id = ? AND app_id = ?").bind(userId, appId).all()).results;
          return new Response(JSON.stringify({ empty: rows.length === 0, docs: rows.map(r => ({ id: r.room_id, data: { lastReadAt: r.last_read_at } })) }), { status: 200, headers: d1Cors });
        }
      }
    }

    // 7. WebRTC シグナリング (webrtc)
    if (subpath.startsWith("webrtc")) {
      if (request.method === "GET") {
        const appId = url.searchParams.get("appId");
        const id = url.searchParams.get("id"); // callId or fsId
        const type = url.searchParams.get("type"); // 'call' or 'fs' or 'candidates'
        const candType = url.searchParams.get("candType");
        if (!appId || !id) return new Response(JSON.stringify({ error: "Missing param" }), { status: 400, headers: d1Cors });
        
        if (type === "candidates") {
          const table = url.searchParams.get("for") === "fs" ? "webrtc_fileshare_candidates" : "webrtc_call_candidates";
          const idCol = url.searchParams.get("for") === "fs" ? "fs_id" : "call_id";
          const rows = (await env.DB.prepare(`SELECT candidate_id, candidate_data FROM ${table} WHERE ${idCol} = ? AND app_id = ? AND candidate_type = ?`).bind(id, appId, candType).all()).results;
          return new Response(JSON.stringify({ empty: rows.length === 0, docs: rows.map(r => ({ id: r.candidate_id, data: JSON.parse(r.candidate_data) })) }), { status: 200, headers: d1Cors });
        }
        
        const table = type === "fs" ? "webrtc_fileshares" : "webrtc_calls";
        const idCol = type === "fs" ? "fs_id" : "call_id";
        const dataCol = type === "fs" ? "fs_data" : "call_data";
        const row = await env.DB.prepare(`SELECT ${dataCol} FROM ${table} WHERE ${idCol} = ? AND app_id = ?`).bind(id, appId).first();
        if (!row) return new Response(JSON.stringify({ empty: true }), { status: 200, headers: d1Cors });
        return new Response(JSON.stringify({ empty: false, id, data: JSON.parse(row[dataCol]) }), { status: 200, headers: d1Cors });
      }

      if (request.method === "POST") {
        if (!verifiedUser) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: d1Cors });
        const body = await request.json();
        const { appId, id, type, candType, data, candidate } = body;
        
        if (type === "candidate") {
          const table = body.for === "fs" ? "webrtc_fileshare_candidates" : "webrtc_call_candidates";
          const idCol = body.for === "fs" ? "fs_id" : "call_id";
          const candId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await env.DB.prepare(`INSERT INTO ${table} (candidate_id, ${idCol}, app_id, candidate_type, candidate_data, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
            .bind(candId, id, appId, candType, JSON.stringify(candidate), Date.now()).run();
          
          // RTDBへ候補通知
          if (env.SERVICE_ACCOUNT_JSON) {
            try {
              const rtdbUrl = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app`;
              const rtdbToken = await getRTDBToken(env.SERVICE_ACCOUNT_JSON);
              await fetch(`${rtdbUrl}/webrtc/${id}/${candType}.json?access_token=${rtdbToken}`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: candId, candidate })
              });
            } catch(e){}
          }
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }
        
        const table = type === "fs" ? "webrtc_fileshares" : "webrtc_calls";
        const idCol = type === "fs" ? "fs_id" : "call_id";
        const dataCol = type === "fs" ? "fs_data" : "call_data";
        
        const cur = await env.DB.prepare(`SELECT ${dataCol} FROM ${table} WHERE ${idCol} = ? AND app_id = ?`).bind(id, appId).first();
        let mergedData = cur && cur[dataCol] ? JSON.parse(cur[dataCol]) : {};
        if (data) mergedData = { ...mergedData, ...data };
        
        await env.DB.prepare(`INSERT INTO ${table} (${idCol}, app_id, ${dataCol}, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(${idCol}) DO UPDATE SET ${dataCol} = excluded.${dataCol}, updated_at = excluded.updated_at`)
          .bind(id, appId, JSON.stringify(mergedData), Date.now(), Date.now()).run();
        
        // RTDBへシグナリング状態通知
        if (env.SERVICE_ACCOUNT_JSON) {
          try {
            const rtdbUrl = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app`;
            const rtdbToken = await getRTDBToken(env.SERVICE_ACCOUNT_JSON);
            await fetch(`${rtdbUrl}/webrtc/${id}/data.json?access_token=${rtdbToken}`, {
              method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mergedData)
            });
          } catch(e){}
        }
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
      }
    }

    // 8. 全データ一括マイグレーション (migrate)
    if (subpath.startsWith("migrate")) {
      if (request.method === "POST") {
        if (!verifiedUser) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: d1Cors });
        const body = await request.json();
        const { appId, migrateType, data } = body;
        const existingAdminRow = await env.DB.prepare("SELECT setting_data FROM settings WHERE app_id = ? AND setting_id = ?").bind(appId, "adminList").first();
        if (existingAdminRow && existingAdminRow.setting_data) {
          const isAdmin = await isD1Admin(appId, verifiedUser, env);
          if (!isAdmin) {
            return new Response(JSON.stringify({ error: "Forbidden: Only admins can run migration" }), { status: 403, headers: d1Cors });
          }
        }
        
        if (migrateType === "users" && Array.isArray(data)) {
          const stmts = [];
          for (const u of data) {
            stmts.push(env.DB.prepare("INSERT INTO users (user_id, app_id, nickname, avatar_url, public_key_jwk, fcm_tokens, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET nickname = excluded.nickname, avatar_url = excluded.avatar_url, public_key_jwk = excluded.public_key_jwk, fcm_tokens = excluded.fcm_tokens, updated_at = excluded.updated_at")
              .bind(u.id, appId, u.nickname || null, u.avatarUrl || null, u.publicKeyJwk ? JSON.stringify(u.publicKeyJwk) : null, JSON.stringify(u.fcmTokens || []), Date.now(), Date.now()));
          }
          for (let i = 0; i < stmts.length; i += 100) {
            await env.DB.batch(stmts.slice(i, i + 100));
          }
          return new Response(JSON.stringify({ success: true, count: data.length }), { status: 200, headers: d1Cors });
        }
        if (migrateType === "servers" && Array.isArray(data)) {
          await env.DB.prepare("DELETE FROM servers WHERE app_id = ?").bind(appId).run();
          await env.DB.prepare("DELETE FROM server_joined_users WHERE app_id = ?").bind(appId).run();
          const stmts = [];
          for (const s of data) {
            const merged = { ...s };
            delete merged.id; delete merged.joinedUsers; delete merged.rooms;
            stmts.push(env.DB.prepare("INSERT INTO servers (server_id, app_id, name, description, is_public, created_by, created_at, member_count, server_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(server_id) DO UPDATE SET name = excluded.name, description = excluded.description, is_public = excluded.is_public, server_data = excluded.server_data")
              .bind(s.id, appId, s.name || "Untitled", s.description || "", s.isPublic ? 1 : 0, verifiedUser.uid, Date.now(), (s.joinedUsers || []).length || 1, JSON.stringify(merged)));
            if (Array.isArray(s.joinedUsers)) {
              for (const uid of s.joinedUsers) {
                stmts.push(env.DB.prepare("INSERT OR IGNORE INTO server_joined_users (server_id, user_id, app_id, joined_at) VALUES (?, ?, ?, ?)").bind(s.id, uid, appId, Date.now()));
              }
            }
          }
          for (let i = 0; i < stmts.length; i += 100) {
            await env.DB.batch(stmts.slice(i, i + 100));
          }
          return new Response(JSON.stringify({ success: true, count: data.length }), { status: 200, headers: d1Cors });
        }
        if (migrateType === "rooms" && Array.isArray(data)) {
          await env.DB.prepare("DELETE FROM rooms WHERE app_id = ?").bind(appId).run();
          await env.DB.prepare("DELETE FROM room_keys WHERE app_id = ?").bind(appId).run();
          const stmts = [];
          for (const r of data) {
            const merged = { ...r };
            delete merged.id; delete merged.serverId; delete merged.messages; delete merged.roomKeys;
            stmts.push(env.DB.prepare("INSERT INTO rooms (room_id, server_id, app_id, name, type, created_by, created_at, current_key_version, room_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(room_id) DO UPDATE SET name = excluded.name, type = excluded.type, current_key_version = excluded.current_key_version, room_data = excluded.room_data")
              .bind(r.id, r.serverId, appId, r.name || "General", r.type || "chat", verifiedUser.uid, Date.now(), r.currentKeyVersion || 1, JSON.stringify(merged)));
            if (Array.isArray(r.roomKeys)) {
              for (const k of r.roomKeys) {
                stmts.push(env.DB.prepare("INSERT INTO room_keys (room_id, user_id, server_id, app_id, key_data, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(room_id, user_id) DO UPDATE SET key_data = excluded.key_data, updated_at = excluded.updated_at")
                  .bind(r.id, k.userId, r.serverId, appId, JSON.stringify(k.keyData), Date.now()));
              }
            }
          }
          for (let i = 0; i < stmts.length; i += 100) {
            await env.DB.batch(stmts.slice(i, i + 100));
          }
          return new Response(JSON.stringify({ success: true, count: data.length }), { status: 200, headers: d1Cors });
        }
        if (migrateType === "messages" && Array.isArray(data)) {
          if (body.roomId) {
            await env.DB.prepare("DELETE FROM messages WHERE room_id = ? AND app_id = ?").bind(body.roomId, appId).run();
          }
          const stmts = [];
          for (const m of data) {
            const merged = { ...m };
            delete merged.id; delete merged.roomId; delete merged.serverId; delete merged.text; delete merged.senderId; delete merged.createdAt; delete merged.isPinned; delete merged.reactions;
            stmts.push(env.DB.prepare("INSERT OR REPLACE INTO messages (message_id, room_id, server_id, app_id, sender_id, text, created_at, is_pinned, reactions, additional_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
              .bind(m.id, m.roomId, m.serverId, appId, m.senderId || verifiedUser.uid, m.text || "", m.createdAt || Date.now(), m.isPinned ? 1 : 0, JSON.stringify(m.reactions || {}), JSON.stringify(merged)));
          }
          for (let i = 0; i < stmts.length; i += 100) {
            await env.DB.batch(stmts.slice(i, i + 100));
          }
          return new Response(JSON.stringify({ success: true, count: data.length }), { status: 200, headers: d1Cors });
        }
        if (migrateType === "stamps" && Array.isArray(data)) {
          await env.DB.prepare("DELETE FROM server_stamps WHERE app_id = ?").bind(appId).run();
          const stmts = [];
          for (const st of data) {
            stmts.push(env.DB.prepare("INSERT OR REPLACE INTO server_stamps (stamp_id, server_id, app_id, name, url, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
              .bind(st.id, st.serverId || "general", appId, st.name || "", st.url || "", verifiedUser.uid, Date.now()));
          }
          for (let i = 0; i < stmts.length; i += 100) {
            await env.DB.batch(stmts.slice(i, i + 100));
          }
          return new Response(JSON.stringify({ success: true, count: data.length }), { status: 200, headers: d1Cors });
        }
        if (migrateType === "settings") {
          try {
            await env.DB.prepare("INSERT INTO settings (app_id, setting_id, setting_data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(app_id, setting_id) DO UPDATE SET setting_data = excluded.setting_data, updated_at = excluded.updated_at")
              .bind(appId, data.settingId || "escrowKey", JSON.stringify(data), Date.now()).run();
          } catch(e){ console.warn("Migrate setting err:", e); }
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: d1Cors });
        }
        return new Response(JSON.stringify({ error: "Invalid migrate payload" }), { status: 400, headers: d1Cors });
      }
    }

    return new Response(JSON.stringify({ error: "Unknown D1 API subpath" }), { status: 404, headers: d1Cors });
  } catch (err) {
    console.error("D1 API Error:", err);
    return new Response(JSON.stringify({ error: "D1 API Internal Error", details: err.toString() }), { status: 500, headers: d1Cors });
  }
}
