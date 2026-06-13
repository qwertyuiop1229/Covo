var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-trcHFY/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// src/index.js
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
var src_default = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      const origin = request.headers.get("Origin") || "*";
      return new Response(null, { headers: {
        ...corsHeaders,
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true"
      } });
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
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};
async function handleSignup(request, env) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password are required" }), { status: 400, headers: corsHeaders });
    }
    const cleanEmail = email.trim().toLowerCase();
    const workerToken = await getWorkerAuthToken(env);
    if (!workerToken) {
      return new Response(JSON.stringify({ error: "Internal Server Error: Worker Auth failed" }), { status: 500, headers: corsHeaders });
    }
    const result = await getAllowedEmails(workerToken, env);
    if (result.error) {
      return new Response(JSON.stringify({ error: `Firestore Error: ${result.error}` }), { status: 500, headers: corsHeaders });
    }
    const allowedEmails = result.emails.map((e) => e.trim().toLowerCase());
    if (!allowedEmails.includes(cleanEmail)) {
      return new Response(JSON.stringify({ error: "\u62DB\u5F85\u3055\u308C\u305F\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u7BA1\u7406\u8005\u306B\u304A\u554F\u3044\u5408\u308F\u305B\u304F\u3060\u3055\u3044\u3002" }), { status: 403, headers: corsHeaders });
    }
    const signUpResult = await signUpWithFirebase(cleanEmail, password, env);
    if (signUpResult.error) {
      return new Response(JSON.stringify({ error: signUpResult.error.message }), { status: 400, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ success: true, message: "Account created successfully" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Internal Server Error", details: error.toString() }), { status: 500, headers: corsHeaders });
  }
}
__name(handleSignup, "handleSignup");
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
__name(getWorkerAuthToken, "getWorkerAuthToken");
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
    if (data.error.code === 404 || data.error.status === "NOT_FOUND") {
      return { emails: [], error: null };
    }
    console.error("Firestore Error:", data.error);
    return { emails: [], error: data.error.message || "Unknown Firestore Error" };
  }
  if (data.fields && data.fields.emails && data.fields.emails.arrayValue && data.fields.emails.arrayValue.values) {
    const emails = data.fields.emails.arrayValue.values.map((v) => v.stringValue);
    return { emails, error: null };
  }
  return { emails: [], error: null };
}
__name(getAllowedEmails, "getAllowedEmails");
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
__name(signUpWithFirebase, "signUpWithFirebase");
async function getFirestoreAdminToken(serviceAccountJsonStr) {
  const serviceAccount = JSON.parse(serviceAccountJsonStr);
  const header = { alg: "RS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1e3);
  const exp = iat + 3600;
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform"
  };
  const encodeBase64Url = /* @__PURE__ */ __name((obj) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"), "encodeBase64Url");
  const unsignedToken = `${encodeBase64Url(header)}.${encodeBase64Url(payload)}`;
  const privateKey = serviceAccount.private_key;
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKey.substring(pemHeader.length, privateKey.length - pemFooter.length - 1).replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
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
  const jwt = `${unsignedToken}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  return data.access_token;
}
__name(getFirestoreAdminToken, "getFirestoreAdminToken");
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
    let valid = false;
    if (password) {
      let hash = null;
      let pwdRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/servers/${serverId}/secrets/auth`, {
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      let pwdData = await pwdRes.json();
      if (!pwdData.error && pwdData.fields && pwdData.fields.passwordHash) {
        hash = pwdData.fields.passwordHash.stringValue;
      } else {
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
      if (password !== hash) {
        return new Response(JSON.stringify({ success: false, error: "Incorrect password" }), { status: 401, headers: corsHeaders });
      }
      valid = true;
    } else if (inviteCode) {
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
__name(handleJoinServer, "handleJoinServer");
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
    const title = `${callerNickname || "\u4E0D\u660E\u306A\u30E6\u30FC\u30B6\u30FC"} \u304B\u3089\u7740\u4FE1`;
    const body = "\u97F3\u58F0\u901A\u8A71\u306E\u7740\u4FE1\u304C\u3042\u308A\u307E\u3059";
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
              callerNickname: callerNickname || "",
              callerAvatarUrl: callerAvatarUrl || "",
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
        if (errorCode === "UNREGISTERED" || errorCode === 404 || fcmResult.error.status === "NOT_FOUND" || fcmResult.error.message && fcmResult.error.message.includes("not a valid FCM")) {
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
                removeAllFromArray: { values: invalidTokens.map((t) => ({ stringValue: t })) }
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
__name(handleSendCallNotification, "handleSendCallNotification");
async function handleSendNotification(request, env) {
  const origin = request.headers.get("Origin") || "*";
  const dynamicCors = {
    ...corsHeaders,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true"
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
    if (!env.SERVICE_ACCOUNT_JSON) {
      return new Response(JSON.stringify({ success: false, error: "SERVICE_ACCOUNT_JSON secret is not set" }), { status: 500, headers: corsHeaders });
    }
    const fcmAccessToken = await getFCMToken(env.SERVICE_ACCOUNT_JSON);
    const results = [];
    for (const rid of receiverIds) {
      if (rid === senderId) continue;
      let shouldSend = true;
      try {
        const rtdbUrl = `https://${projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`;
        const rtdbToken = await getRTDBToken(env.SERVICE_ACCOUNT_JSON);
        const statusUrl = `${rtdbUrl}/status/${rid}.json?access_token=${rtdbToken}`;
        const statusRes = await fetch(statusUrl);
        const statusData = await statusRes.json();
        if (statusData && !statusData.error) {
          const state = statusData.state || "offline";
          if (state === "online") {
            const lastChangedRaw = statusData.fields?.last_changed?.timestampValue || statusData.fields?.last_changed?.integerValue || statusData.last_changed;
            let lastChangedMs = 0;
            if (typeof lastChangedRaw === "number") {
              lastChangedMs = lastChangedRaw;
            } else if (typeof lastChangedRaw === "string") {
              lastChangedMs = new Date(lastChangedRaw).getTime();
            }
            const ageMs = Date.now() - lastChangedMs;
            const isStale = ageMs > 5 * 60 * 1e3;
            const currentRoomIdStatus = statusData.fields?.currentRoomId?.stringValue || statusData.currentRoomId;
            if (!isStale && currentRoomIdStatus === roomId) {
              shouldSend = false;
            }
          }
        }
      } catch (statusErr) {
        console.error("RTDB status check failed:", statusErr);
        shouldSend = true;
      }
      if (shouldSend) {
        const userUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/users/${rid}`;
        const userRes = await fetch(userUrl, { headers: { "Authorization": `Bearer ${workerToken}` } });
        const userData = await userRes.json();
        if (!userData.error && userData.fields && userData.fields.fcmTokens) {
          const tokens = userData.fields.fcmTokens.arrayValue?.values || [];
          const invalidTokens = [];
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
                  // data フィールド: SW が受信して処理する
                  data: {
                    title,
                    body,
                    roomId: roomId || "",
                    senderId: senderId || "",
                    messageId: messageId || "",
                    type: "chat_message"
                  },
                  // Android: 高優先度通知チャンネル
                  android: {
                    priority: "high",
                    notification: {
                      title,
                      body,
                      channel_id: "covo_messages",
                      notification_priority: "PRIORITY_HIGH",
                      default_sound: true,
                      icon: "ic_notification",
                      tag: messageId ? `msg-${messageId}` : `chat-${roomId || "covo"}`
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
                          title,
                          body
                        },
                        sound: "default"
                      }
                    }
                  },
                  // Web Push (Chrome/Firefox): SW の onBackgroundMessage を起こす
                  webpush: {
                    headers: {
                      "Urgency": "high"
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
              const errorCode = fcmResult.error.details?.[0]?.errorCode || fcmResult.error.code;
              if (errorCode === "UNREGISTERED" || errorCode === 404 || fcmResult.error.status === "NOT_FOUND" || fcmResult.error.message && fcmResult.error.message.includes("not a valid FCM")) {
                invalidTokens.push(tokenStr);
              }
            } else {
              results.push({ token: tokenStr, success: true });
            }
          }
          if (invalidTokens.length > 0) {
            try {
              const removeBody = {
                writes: [{
                  transform: {
                    document: `projects/${projectId}/databases/(default)/documents/artifacts/${appId}/users/${rid}`,
                    fieldTransforms: [{
                      fieldPath: "fcmTokens",
                      removeAllFromArray: {
                        values: invalidTokens.map((t) => ({ stringValue: t }))
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
    if (env.FILES) {
      await env.FILES.put("debug_sendNotification_error", error.stack || error.toString());
    }
    return new Response(JSON.stringify({ success: false, error: error.toString() }), { status: 500, headers: dynamicCors });
  }
}
__name(handleSendNotification, "handleSendNotification");
async function getFCMToken(serviceAccountJsonStr) {
  return _getGoogleOAuthToken(serviceAccountJsonStr, "https://www.googleapis.com/auth/firebase.messaging");
}
__name(getFCMToken, "getFCMToken");
async function getRTDBToken(serviceAccountJsonStr) {
  return _getGoogleOAuthToken(serviceAccountJsonStr, "https://www.googleapis.com/auth/firebase.database");
}
__name(getRTDBToken, "getRTDBToken");
async function _getGoogleOAuthToken(serviceAccountJsonStr, scope) {
  const serviceAccount = JSON.parse(serviceAccountJsonStr);
  const header = { alg: "RS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1e3);
  const exp = iat + 3600;
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp,
    scope
  };
  const encodeBase64Url = /* @__PURE__ */ __name((obj) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"), "encodeBase64Url");
  const unsignedToken = `${encodeBase64Url(header)}.${encodeBase64Url(payload)}`;
  const privateKey = serviceAccount.private_key;
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKey.substring(pemHeader.length, privateKey.length - pemFooter.length - 1).replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );
  const signatureBase64Url = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const jwt = `${unsignedToken}.${signatureBase64Url}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await response.json();
  return data.access_token;
}
__name(_getGoogleOAuthToken, "_getGoogleOAuthToken");
async function handleUploadFile(request, env) {
  try {
    if (!env.FILES) {
      return new Response(JSON.stringify({ error: "KV\u30B9\u30C8\u30EC\u30FC\u30B8\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const formData = await request.formData();
    const file = formData.get("file");
    const uploaderId = formData.get("uploaderId") || "";
    const idToken = formData.get("idToken") || "";
    if (!file || !uploaderId || !idToken) {
      return new Response(JSON.stringify({ error: "\u5FC5\u9808\u30D1\u30E9\u30E1\u30FC\u30BF\u304C\u4E0D\u8DB3\u3057\u3066\u3044\u307E\u3059" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const verifiedUid = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUid || verifiedUid !== uploaderId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    if (file.size > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "\u30D5\u30A1\u30A4\u30EB\u306F25MB\u307E\u3067\u3067\u3059" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const arrayBuffer = await file.arrayBuffer();
    const key = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const folder = formData.get("folder") || "";
    const meta = { name: file.name, type: file.type || "application/octet-stream", size: file.size, uploaderId, folder };
    await env.FILES.put(key, arrayBuffer, {
      metadata: meta,
      expirationTtl: void 0
      // 期限なし
    });
    const fileUrl = `https://simplechat-api.astro-fray-server.workers.dev/api/file/${key}`;
    return new Response(JSON.stringify({ url: fileUrl, name: file.name }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u30A8\u30E9\u30FC", details: err.toString() }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(handleUploadFile, "handleUploadFile");
async function handleDeleteFile(request, env, url) {
  try {
    const key = url.pathname.replace("/api/file/", "");
    if (!key || !env.FILES) return new Response("Not Found", { status: 404, headers: corsHeaders });
    const requesterId = url.searchParams.get("userId") || "";
    const idToken = url.searchParams.get("idToken") || "";
    if (!requesterId || !idToken) {
      return new Response(JSON.stringify({ error: "Missing authentication parameters" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const verifiedUid = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUid || verifiedUid !== requesterId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const listed = await env.FILES.list({ prefix: key });
    const fileEntry = listed.keys.find((k) => k.name === key);
    if (!fileEntry) return new Response(JSON.stringify({ error: "\u30D5\u30A1\u30A4\u30EB\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
    const meta = fileEntry.metadata;
    const forceDelete = url.searchParams.get("forceDelete") === "1";
    const adminKey = url.searchParams.get("adminKey") || "";
    if (forceDelete) {
      if (!env.ADMIN_SECRET_KEY || adminKey !== env.ADMIN_SECRET_KEY) {
        return new Response(JSON.stringify({ error: "Forbidden: Admin privileges required for force delete" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else if (meta && meta.uploaderId && meta.uploaderId !== requesterId) {
      return new Response(JSON.stringify({ error: "\u524A\u9664\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    await env.FILES.delete(key);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.toString() }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(handleDeleteFile, "handleDeleteFile");
async function handleServeFile(request, env, url) {
  try {
    const key = url.pathname.replace("/api/file/", "");
    if (!key || !env.FILES) {
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    }
    const { value, metadata } = await env.FILES.getWithMetadata(key, { type: "arrayBuffer" });
    if (!value) return new Response("Not Found", { status: 404, headers: corsHeaders });
    const contentType = metadata && metadata.type || "application/octet-stream";
    const fileName = metadata && metadata.name ? metadata.name : key;
    const isPreview = url.searchParams.get("preview") === "1";
    return new Response(value, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": isPreview ? `inline; filename*=UTF-8''${encodeURIComponent(fileName)}` : `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "public, max-age=31536000"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.toString() }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(handleServeFile, "handleServeFile");
async function handleStorageStats(request, env) {
  try {
    const authHeader = request.headers.get("Authorization") || "";
    const idToken = authHeader.replace("Bearer ", "");
    if (!idToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const verifiedUid = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUid) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const kvStats = { fileCount: 0, totalBytes: 0 };
    if (env.FILES) {
      let cursor;
      do {
        const listed = await env.FILES.list({ cursor, limit: 1e3 });
        for (const key of listed.keys) {
          const folder = key.metadata?.folder || "";
          if (folder === "simplechat/avatars" || folder === "icons" || folder === "avatars") {
            continue;
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
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.toString() }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(handleStorageStats, "handleStorageStats");
async function handleBulkDeleteFiles(request, env) {
  try {
    const authHeader = request.headers.get("Authorization") || "";
    const idToken = authHeader.replace("Bearer ", "");
    if (!idToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const verifiedUid = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUid) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let kvDeleted = 0;
    if (env.FILES) {
      let cursor;
      do {
        const listed = await env.FILES.list({ cursor, limit: 1e3 });
        for (const key of listed.keys) {
          const folder = key.metadata?.folder || "";
          if (folder === "simplechat/avatars" || folder === "icons" || folder === "avatars") {
            continue;
          }
          await env.FILES.delete(key.name);
          kvDeleted++;
        }
        cursor = listed.cursor;
        if (listed.list_complete) break;
      } while (cursor);
    }
    return new Response(JSON.stringify({ success: true, kvDeleted }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.toString() }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(handleBulkDeleteFiles, "handleBulkDeleteFiles");
async function handleShareFile(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const idToken = formData.get("idToken") || "";
    const uploaderId = formData.get("uploaderId") || formData.get("userId") || "";
    if (!file || !idToken || !uploaderId) {
      return new Response(JSON.stringify({ error: "\u5FC5\u9808\u30D1\u30E9\u30E1\u30FC\u30BF\u304C\u4E0D\u8DB3\u3057\u3066\u3044\u307E\u3059" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const verifiedUid = await verifyFirebaseIdToken(idToken, env);
    if (!verifiedUid || verifiedUid !== uploaderId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type || "application/octet-stream" });
    const fileName = file.name || "file";
    try {
      const f1 = new FormData();
      f1.append("reqtype", "fileupload");
      f1.append("fileToUpload", blob, fileName);
      const r1 = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: f1 });
      const t1 = (await r1.text()).trim();
      if (t1.startsWith("https://")) {
        return new Response(JSON.stringify({ url: t1, service: "catbox.moe" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      console.warn("[shareFile] catbox.moe failed:", r1.status, t1.slice(0, 100));
    } catch (e1) {
      console.warn("[shareFile] catbox.moe error:", e1.toString());
    }
    try {
      const f2 = new FormData();
      f2.append("file", blob, fileName);
      const r2 = await fetch("https://0x0.st", { method: "POST", body: f2 });
      const t2 = (await r2.text()).trim();
      if (t2.startsWith("https://")) {
        return new Response(JSON.stringify({ url: t2, service: "0x0.st" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      console.warn("[shareFile] 0x0.st failed:", r2.status, t2.slice(0, 100));
    } catch (e2) {
      console.warn("[shareFile] 0x0.st error:", e2.toString());
    }
    return new Response(JSON.stringify({ error: "\u3059\u3079\u3066\u306E\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u30B5\u30FC\u30D3\u30B9\u306B\u5931\u6557\u3057\u307E\u3057\u305F" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Proxy error", details: err.toString() }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(handleShareFile, "handleShareFile");
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
__name(verifyFirebaseIdToken, "verifyFirebaseIdToken");
async function handleSetOffline(request, env) {
  const origin = request.headers.get("Origin") || "*";
  const corsSetOffline = {
    ...corsHeaders,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true"
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
    await fetch(`${rtdbUrl}/status/${userId}.json?access_token=${rtdbToken}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "offline",
        last_changed: Date.now()
        // RTDBはUnix msでOK
      })
    });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsSetOffline });
  } catch (error) {
    console.error("setOffline Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.toString() }), { status: 500, headers: corsSetOffline });
  }
}
__name(handleSetOffline, "handleSetOffline");

// ../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-trcHFY/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-trcHFY/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
