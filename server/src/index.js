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

    const verifiedUid = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUid || verifiedUid !== userId) {
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
      let invRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/servers/${serverId}/inviteCodes/${inviteCode}`, {
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
      
      // 招待コードの uses をインクリメント (トランザクションではないがREST APIで直接インクリメント)
      const invTransformUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
      await fetch(invTransformUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          writes: [{
            transform: {
              document: `projects/${projectId}/databases/(default)/documents/artifacts/${appId}/servers/${serverId}/inviteCodes/${inviteCode}`,
              fieldTransforms: [{ fieldPath: "uses", increment: { integerValue: "1" } }]
            }
          }]
        })
      });
      
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

    const verifiedUid = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUid || verifiedUid !== callerId) {
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

    const verifiedUid = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUid || verifiedUid !== senderId) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: dynamicCors });
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

    const verifiedUid = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUid || verifiedUid !== uploaderId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    if (file.size > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'ファイルは25MBまでです' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const key = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const folder = formData.get('folder') || '';
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

    const verifiedUid = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUid || verifiedUid !== requesterId) {
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

    // forceDelete is only allowed if they provide the ADMIN_SECRET_KEY in the request
    const adminKey = url.searchParams.get('adminKey') || '';
    if (forceDelete) {
      if (!env.ADMIN_SECRET_KEY || adminKey !== env.ADMIN_SECRET_KEY) {
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
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    }
    const { value, metadata } = await env.FILES.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!value) return new Response('Not Found', { status: 404, headers: corsHeaders });

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
    const verifiedUid = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUid) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
    const verifiedUid = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUid) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

    const verifiedUid = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUid || verifiedUid !== uploaderId) {
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



async function verifyFirebaseIdToken(idToken, env) {
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    });
    const data = await res.json();
    if (data.error || !data.users || data.users.length === 0) return null;
    return data.users[0].localId;
  } catch (e) {
    return null;
  }
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

    const verifiedUid = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUid || verifiedUid !== userId) {
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
