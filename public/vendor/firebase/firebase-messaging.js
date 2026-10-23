import{Q as T,R as b,W as k,X as A,ca as m,da as I,la as O,oa as y,u as U,v as G,w as J,x as z,y as S}from"./chunk-Q4LTXTNA.js";var Q="@firebase/installations",P="0.6.13";var Z=1e4,ee=`w:${P}`,te="FIS_v2",Ne="https://firebaseinstallations.googleapis.com/v1",De=3600*1e3,Re="installations",Pe="Installations";var Me={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"not-registered":"Firebase Installation is not registered.","installation-not-found":"Firebase Installation not found.","request-failed":'{$requestName} request failed with error "{$serverCode} {$serverStatus}: {$serverMessage}"',"app-offline":"Could not process request. Application offline.","delete-pending-registration":"Can't delete installation while there is a pending registration request."},g=new S(Re,Pe,Me);function ne(e){return e instanceof z&&e.code.includes("request-failed")}function oe({projectId:e}){return`${Ne}/projects/${e}/installations`}function ie(e){return{token:e.token,requestStatus:2,expiresIn:Fe(e.expiresIn),creationTime:Date.now()}}async function re(e,t){let o=(await t.json()).error;return g.create("request-failed",{requestName:e,serverCode:o.code,serverMessage:o.message,serverStatus:o.status})}function ae({apiKey:e}){return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":e})}function je(e,{refreshToken:t}){let n=ae(e);return n.append("Authorization",Ke(t)),n}async function se(e){let t=await e();return t.status>=500&&t.status<600?e():t}function Fe(e){return Number(e.replace("s","000"))}function Ke(e){return`${te} ${e}`}async function qe({appConfig:e,heartbeatServiceProvider:t},{fid:n}){let o=oe(e),i=ae(e),r=t.getImmediate({optional:!0});if(r){let d=await r.getHeartbeatsHeader();d&&i.append("x-firebase-client",d)}let a={fid:n,authVersion:te,appId:e.appId,sdkVersion:ee},c={method:"POST",headers:i,body:JSON.stringify(a)},f=await se(()=>fetch(o,c));if(f.ok){let d=await f.json();return{fid:d.fid||n,registrationStatus:2,refreshToken:d.refreshToken,authToken:ie(d.authToken)}}else throw await re("Create Installation",f)}function ce(e){return new Promise(t=>{setTimeout(t,e)})}function Le(e){return btoa(String.fromCharCode(...e)).replace(/\+/g,"-").replace(/\//g,"_")}var xe=/^[cdef][\w-]{21}$/,R="";function Ve(){try{let e=new Uint8Array(17);(self.crypto||self.msCrypto).getRandomValues(e),e[0]=112+e[0]%16;let n=$e(e);return xe.test(n)?n:R}catch{return R}}function $e(e){return Le(e).substr(0,22)}function _(e){return`${e.appName}!${e.appId}`}var ue=new Map;function de(e,t){let n=_(e);fe(n,t),Be(n,t)}function fe(e,t){let n=ue.get(e);if(n)for(let o of n)o(t)}function Be(e,t){let n=He();n&&n.postMessage({key:e,fid:t}),We()}var p=null;function He(){return!p&&"BroadcastChannel"in self&&(p=new BroadcastChannel("[Firebase] FID Change"),p.onmessage=e=>{fe(e.data.key,e.data.fid)}),p}function We(){ue.size===0&&p&&(p.close(),p=null)}var Ue="firebase-installations-database",Ge=1,w="firebase-installations-store",N=null;function M(){return N||(N=k(Ue,Ge,{upgrade:(e,t)=>{switch(t){case 0:e.createObjectStore(w)}}})),N}async function E(e,t){let n=_(e),i=(await M()).transaction(w,"readwrite"),r=i.objectStore(w),a=await r.get(n);return await r.put(t,n),await i.done,(!a||a.fid!==t.fid)&&de(e,t.fid),t}async function le(e){let t=_(e),o=(await M()).transaction(w,"readwrite");await o.objectStore(w).delete(t),await o.done}async function C(e,t){let n=_(e),i=(await M()).transaction(w,"readwrite"),r=i.objectStore(w),a=await r.get(n),c=t(a);return c===void 0?await r.delete(n):await r.put(c,n),await i.done,c&&(!a||a.fid!==c.fid)&&de(e,c.fid),c}async function j(e){let t,n=await C(e.appConfig,o=>{let i=Je(o),r=ze(e,i);return t=r.registrationPromise,r.installationEntry});return n.fid===R?{installationEntry:await t}:{installationEntry:n,registrationPromise:t}}function Je(e){let t=e||{fid:Ve(),registrationStatus:0};return pe(t)}function ze(e,t){if(t.registrationStatus===0){if(!navigator.onLine){let i=Promise.reject(g.create("app-offline"));return{installationEntry:t,registrationPromise:i}}let n={fid:t.fid,registrationStatus:1,registrationTime:Date.now()},o=Ye(e,n);return{installationEntry:n,registrationPromise:o}}else return t.registrationStatus===1?{installationEntry:t,registrationPromise:Xe(e)}:{installationEntry:t}}async function Ye(e,t){try{let n=await qe(e,t);return E(e.appConfig,n)}catch(n){throw ne(n)&&n.customData.serverCode===409?await le(e.appConfig):await E(e.appConfig,{fid:t.fid,registrationStatus:0}),n}}async function Xe(e){let t=await Y(e.appConfig);for(;t.registrationStatus===1;)await ce(100),t=await Y(e.appConfig);if(t.registrationStatus===0){let{installationEntry:n,registrationPromise:o}=await j(e);return o||n}return t}function Y(e){return C(e,t=>{if(!t)throw g.create("installation-not-found");return pe(t)})}function pe(e){return Qe(e)?{fid:e.fid,registrationStatus:0}:e}function Qe(e){return e.registrationStatus===1&&e.registrationTime+Z<Date.now()}async function Ze({appConfig:e,heartbeatServiceProvider:t},n){let o=et(e,n),i=je(e,n),r=t.getImmediate({optional:!0});if(r){let d=await r.getHeartbeatsHeader();d&&i.append("x-firebase-client",d)}let a={installation:{sdkVersion:ee,appId:e.appId}},c={method:"POST",headers:i,body:JSON.stringify(a)},f=await se(()=>fetch(o,c));if(f.ok){let d=await f.json();return ie(d)}else throw await re("Generate Auth Token",f)}function et(e,{fid:t}){return`${oe(e)}/${t}/authTokens:generate`}async function F(e,t=!1){let n,o=await C(e.appConfig,r=>{if(!ge(r))throw g.create("not-registered");let a=r.authToken;if(!t&&ot(a))return r;if(a.requestStatus===1)return n=tt(e,t),r;{if(!navigator.onLine)throw g.create("app-offline");let c=rt(r);return n=nt(e,c),c}});return n?await n:o.authToken}async function tt(e,t){let n=await X(e.appConfig);for(;n.authToken.requestStatus===1;)await ce(100),n=await X(e.appConfig);let o=n.authToken;return o.requestStatus===0?F(e,t):o}function X(e){return C(e,t=>{if(!ge(t))throw g.create("not-registered");let n=t.authToken;return at(n)?Object.assign(Object.assign({},t),{authToken:{requestStatus:0}}):t})}async function nt(e,t){try{let n=await Ze(e,t),o=Object.assign(Object.assign({},t),{authToken:n});return await E(e.appConfig,o),n}catch(n){if(ne(n)&&(n.customData.serverCode===401||n.customData.serverCode===404))await le(e.appConfig);else{let o=Object.assign(Object.assign({},t),{authToken:{requestStatus:0}});await E(e.appConfig,o)}throw n}}function ge(e){return e!==void 0&&e.registrationStatus===2}function ot(e){return e.requestStatus===2&&!it(e)}function it(e){let t=Date.now();return t<e.creationTime||e.creationTime+e.expiresIn<t+De}function rt(e){let t={requestStatus:1,requestTime:Date.now()};return Object.assign(Object.assign({},e),{authToken:t})}function at(e){return e.requestStatus===1&&e.requestTime+Z<Date.now()}async function st(e){let t=e,{installationEntry:n,registrationPromise:o}=await j(t);return o?o.catch(console.error):F(t).catch(console.error),n.fid}async function ct(e,t=!1){let n=e;return await ut(n),(await F(n,t)).token}async function ut(e){let{registrationPromise:t}=await j(e);t&&await t}function dt(e){if(!e||!e.options)throw D("App Configuration");if(!e.name)throw D("App Name");let t=["projectId","apiKey","appId"];for(let n of t)if(!e.options[n])throw D(n);return{appName:e.name,projectId:e.options.projectId,apiKey:e.options.apiKey,appId:e.options.appId}}function D(e){return g.create("missing-app-config-values",{valueName:e})}var we="installations",ft="installations-internal",lt=e=>{let t=e.getProvider("app").getImmediate(),n=dt(t),o=I(t,"heartbeat");return{app:t,appConfig:n,heartbeatServiceProvider:o,_delete:()=>Promise.resolve()}},pt=e=>{let t=e.getProvider("app").getImmediate(),n=I(t,we).getImmediate();return{getId:()=>st(n),getToken:i=>ct(n,i)}};function gt(){m(new b(we,lt,"PUBLIC")),m(new b(ft,pt,"PRIVATE"))}gt();y(Q,P);y(Q,P,"esm2017");var wt="/firebase-messaging-sw.js",ht="/firebase-cloud-messaging-push-scope",ve="BDOU99-h67HcA6JeFXHbSNMu7e2yNNu3RzoMj8TM4W88jITfq7ZmPvIM1Iv-4_l2LxQcYwhqby2xGpWwzjfAnG4",bt="https://fcmregistrations.googleapis.com/v1",Se="google.c.a.c_id",mt="google.c.a.c_l",yt="google.c.a.ts",Tt="google.c.a.e",he=1e4,be;(function(e){e[e.DATA_MESSAGE=1]="DATA_MESSAGE",e[e.DISPLAY_NOTIFICATION=3]="DISPLAY_NOTIFICATION"})(be||(be={}));var v;(function(e){e.PUSH_RECEIVED="push-received",e.NOTIFICATION_CLICKED="notification-clicked"})(v||(v={}));function l(e){let t=new Uint8Array(e);return btoa(String.fromCharCode(...t)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}function kt(e){let t="=".repeat((4-e.length%4)%4),n=(e+t).replace(/\-/g,"+").replace(/_/g,"/"),o=atob(n),i=new Uint8Array(o.length);for(let r=0;r<o.length;++r)i[r]=o.charCodeAt(r);return i}var K="fcm_token_details_db",It=5,me="fcm_token_object_Store";async function vt(e){if("databases"in indexedDB&&!(await indexedDB.databases()).map(r=>r.name).includes(K))return null;let t=null;return(await k(K,It,{upgrade:async(o,i,r,a)=>{var c;if(i<2||!o.objectStoreNames.contains(me))return;let f=a.objectStore(me),d=await f.index("fcmSenderId").get(e);if(await f.clear(),!!d){if(i===2){let s=d;if(!s.auth||!s.p256dh||!s.endpoint)return;t={token:s.fcmToken,createTime:(c=s.createTime)!==null&&c!==void 0?c:Date.now(),subscriptionOptions:{auth:s.auth,p256dh:s.p256dh,endpoint:s.endpoint,swScope:s.swScope,vapidKey:typeof s.vapidKey=="string"?s.vapidKey:l(s.vapidKey)}}}else if(i===3){let s=d;t={token:s.fcmToken,createTime:s.createTime,subscriptionOptions:{auth:l(s.auth),p256dh:l(s.p256dh),endpoint:s.endpoint,swScope:s.swScope,vapidKey:l(s.vapidKey)}}}else if(i===4){let s=d;t={token:s.fcmToken,createTime:s.createTime,subscriptionOptions:{auth:l(s.auth),p256dh:l(s.p256dh),endpoint:s.endpoint,swScope:s.swScope,vapidKey:l(s.vapidKey)}}}}}})).close(),await A(K),await A("fcm_vapid_details_db"),await A("undefined"),St(t)?t:null}function St(e){if(!e||!e.subscriptionOptions)return!1;let{subscriptionOptions:t}=e;return typeof e.createTime=="number"&&e.createTime>0&&typeof e.token=="string"&&e.token.length>0&&typeof t.auth=="string"&&t.auth.length>0&&typeof t.p256dh=="string"&&t.p256dh.length>0&&typeof t.endpoint=="string"&&t.endpoint.length>0&&typeof t.swScope=="string"&&t.swScope.length>0&&typeof t.vapidKey=="string"&&t.vapidKey.length>0}var At="firebase-messaging-database",Et=1,h="firebase-messaging-store",q=null;function V(){return q||(q=k(At,Et,{upgrade:(e,t)=>{switch(t){case 0:e.createObjectStore(h)}}})),q}async function Ae(e){let t=B(e),o=await(await V()).transaction(h).objectStore(h).get(t);if(o)return o;{let i=await vt(e.appConfig.senderId);if(i)return await $(e,i),i}}async function $(e,t){let n=B(e),i=(await V()).transaction(h,"readwrite");return await i.objectStore(h).put(t,n),await i.done,t}async function _t(e){let t=B(e),o=(await V()).transaction(h,"readwrite");await o.objectStore(h).delete(t),await o.done}function B({appConfig:e}){return e.appId}var Ct={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"only-available-in-window":"This method is available in a Window context.","only-available-in-sw":"This method is available in a service worker context.","permission-default":"The notification permission was not granted and dismissed instead.","permission-blocked":"The notification permission was not granted and blocked instead.","unsupported-browser":"This browser doesn't support the API's required to use the Firebase SDK.","indexed-db-unsupported":"This browser doesn't support indexedDb.open() (ex. Safari iFrame, Firefox Private Browsing, etc)","failed-service-worker-registration":"We are unable to register the default service worker. {$browserErrorMessage}","token-subscribe-failed":"A problem occurred while subscribing the user to FCM: {$errorInfo}","token-subscribe-no-token":"FCM returned no token when subscribing the user to push.","token-unsubscribe-failed":"A problem occurred while unsubscribing the user from FCM: {$errorInfo}","token-update-failed":"A problem occurred while updating the user from FCM: {$errorInfo}","token-update-no-token":"FCM returned no token when updating the user to push.","use-sw-after-get-token":"The useServiceWorker() method may only be called once and must be called before calling getToken() to ensure your service worker is used.","invalid-sw-registration":"The input to useServiceWorker() must be a ServiceWorkerRegistration.","invalid-bg-handler":"The input to setBackgroundMessageHandler() must be a function.","invalid-vapid-key":"The public VAPID key must be a string.","use-vapid-key-after-get-token":"The usePublicVapidKey() method may only be called once and must be called before calling getToken() to ensure your VAPID key is used."},u=new S("messaging","Messaging",Ct);async function Ot(e,t){let n=await W(e),o=_e(t),i={method:"POST",headers:n,body:JSON.stringify(o)},r;try{r=await(await fetch(H(e.appConfig),i)).json()}catch(a){throw u.create("token-subscribe-failed",{errorInfo:a?.toString()})}if(r.error){let a=r.error.message;throw u.create("token-subscribe-failed",{errorInfo:a})}if(!r.token)throw u.create("token-subscribe-no-token");return r.token}async function Nt(e,t){let n=await W(e),o=_e(t.subscriptionOptions),i={method:"PATCH",headers:n,body:JSON.stringify(o)},r;try{r=await(await fetch(`${H(e.appConfig)}/${t.token}`,i)).json()}catch(a){throw u.create("token-update-failed",{errorInfo:a?.toString()})}if(r.error){let a=r.error.message;throw u.create("token-update-failed",{errorInfo:a})}if(!r.token)throw u.create("token-update-no-token");return r.token}async function Ee(e,t){let o={method:"DELETE",headers:await W(e)};try{let r=await(await fetch(`${H(e.appConfig)}/${t}`,o)).json();if(r.error){let a=r.error.message;throw u.create("token-unsubscribe-failed",{errorInfo:a})}}catch(i){throw u.create("token-unsubscribe-failed",{errorInfo:i?.toString()})}}function H({projectId:e}){return`${bt}/projects/${e}/registrations`}async function W({appConfig:e,installations:t}){let n=await t.getToken();return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":e.apiKey,"x-goog-firebase-installations-auth":`FIS ${n}`})}function _e({p256dh:e,auth:t,endpoint:n,vapidKey:o}){let i={web:{endpoint:n,auth:t,p256dh:e}};return o!==ve&&(i.web.applicationPubKey=o),i}var Dt=10080*60*1e3;async function Rt(e){let t=await jt(e.swRegistration,e.vapidKey),n={vapidKey:e.vapidKey,swScope:e.swRegistration.scope,endpoint:t.endpoint,auth:l(t.getKey("auth")),p256dh:l(t.getKey("p256dh"))},o=await Ae(e.firebaseDependencies);if(o){if(Ft(o.subscriptionOptions,n))return Date.now()>=o.createTime+Dt?Mt(e,{token:o.token,createTime:Date.now(),subscriptionOptions:n}):o.token;try{await Ee(e.firebaseDependencies,o.token)}catch(i){console.warn(i)}return ye(e.firebaseDependencies,n)}else return ye(e.firebaseDependencies,n)}async function Pt(e){let t=await Ae(e.firebaseDependencies);t&&(await Ee(e.firebaseDependencies,t.token),await _t(e.firebaseDependencies));let n=await e.swRegistration.pushManager.getSubscription();return n?n.unsubscribe():!0}async function Mt(e,t){try{let n=await Nt(e.firebaseDependencies,t),o=Object.assign(Object.assign({},t),{token:n,createTime:Date.now()});return await $(e.firebaseDependencies,o),n}catch(n){throw n}}async function ye(e,t){let o={token:await Ot(e,t),createTime:Date.now(),subscriptionOptions:t};return await $(e,o),o.token}async function jt(e,t){let n=await e.pushManager.getSubscription();return n||e.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:kt(t)})}function Ft(e,t){let n=t.vapidKey===e.vapidKey,o=t.endpoint===e.endpoint,i=t.auth===e.auth,r=t.p256dh===e.p256dh;return n&&o&&i&&r}function Te(e){let t={from:e.from,collapseKey:e.collapse_key,messageId:e.fcmMessageId};return Kt(t,e),qt(t,e),Lt(t,e),t}function Kt(e,t){if(!t.notification)return;e.notification={};let n=t.notification.title;n&&(e.notification.title=n);let o=t.notification.body;o&&(e.notification.body=o);let i=t.notification.image;i&&(e.notification.image=i);let r=t.notification.icon;r&&(e.notification.icon=r)}function qt(e,t){t.data&&(e.data=t.data)}function Lt(e,t){var n,o,i,r,a;if(!t.fcmOptions&&!(!((n=t.notification)===null||n===void 0)&&n.click_action))return;e.fcmOptions={};let c=(i=(o=t.fcmOptions)===null||o===void 0?void 0:o.link)!==null&&i!==void 0?i:(r=t.notification)===null||r===void 0?void 0:r.click_action;c&&(e.fcmOptions.link=c);let f=(a=t.fcmOptions)===null||a===void 0?void 0:a.analytics_label;f&&(e.fcmOptions.analyticsLabel=f)}function xt(e){return typeof e=="object"&&!!e&&Se in e}Vt("AzSCbw63g1R0nCw85jG8","Iaya3yLKwmgvh7cF0q4");function Vt(e,t){let n=[];for(let o=0;o<e.length;o++)n.push(e.charAt(o)),o<t.length&&n.push(t.charAt(o));return n.join("")}function $t(e){if(!e||!e.options)throw L("App Configuration Object");if(!e.name)throw L("App Name");let t=["projectId","apiKey","appId","messagingSenderId"],{options:n}=e;for(let o of t)if(!n[o])throw L(o);return{appName:e.name,projectId:n.projectId,apiKey:n.apiKey,appId:n.appId,senderId:n.messagingSenderId}}function L(e){return u.create("missing-app-config-values",{valueName:e})}var x=class{constructor(t,n,o){this.deliveryMetricsExportedToBigQueryEnabled=!1,this.onBackgroundMessageHandler=null,this.onMessageHandler=null,this.logEvents=[],this.isLogServiceStarted=!1;let i=$t(t);this.firebaseDependencies={app:t,appConfig:i,installations:n,analyticsProvider:o}}_delete(){return Promise.resolve()}};async function Ce(e){try{e.swRegistration=await navigator.serviceWorker.register(wt,{scope:ht}),e.swRegistration.update().catch(()=>{}),await Bt(e.swRegistration)}catch(t){throw u.create("failed-service-worker-registration",{browserErrorMessage:t?.message})}}async function Bt(e){return new Promise((t,n)=>{let o=setTimeout(()=>n(new Error(`Service worker not registered after ${he} ms`)),he),i=e.installing||e.waiting;e.active?(clearTimeout(o),t()):i?i.onstatechange=r=>{var a;((a=r.target)===null||a===void 0?void 0:a.state)==="activated"&&(i.onstatechange=null,clearTimeout(o),t())}:(clearTimeout(o),n(new Error("No incoming service worker found.")))})}async function Ht(e,t){if(!t&&!e.swRegistration&&await Ce(e),!(!t&&e.swRegistration)){if(!(t instanceof ServiceWorkerRegistration))throw u.create("invalid-sw-registration");e.swRegistration=t}}async function Wt(e,t){t?e.vapidKey=t:e.vapidKey||(e.vapidKey=ve)}async function Oe(e,t){if(!navigator)throw u.create("only-available-in-window");if(Notification.permission==="default"&&await Notification.requestPermission(),Notification.permission!=="granted")throw u.create("permission-blocked");return await Wt(e,t?.vapidKey),await Ht(e,t?.serviceWorkerRegistration),Rt(e)}async function Ut(e,t,n){let o=Gt(t);(await e.firebaseDependencies.analyticsProvider.get()).logEvent(o,{message_id:n[Se],message_name:n[mt],message_time:n[yt],message_device_time:Math.floor(Date.now()/1e3)})}function Gt(e){switch(e){case v.NOTIFICATION_CLICKED:return"notification_open";case v.PUSH_RECEIVED:return"notification_foreground";default:throw new Error}}async function Jt(e,t){let n=t.data;if(!n.isFirebaseMessaging)return;e.onMessageHandler&&n.messageType===v.PUSH_RECEIVED&&(typeof e.onMessageHandler=="function"?e.onMessageHandler(Te(n)):e.onMessageHandler.next(Te(n)));let o=n.data;xt(o)&&o[Tt]==="1"&&await Ut(e,n.messageType,o)}var ke="@firebase/messaging",Ie="0.12.17";var zt=e=>{let t=new x(e.getProvider("app").getImmediate(),e.getProvider("installations-internal").getImmediate(),e.getProvider("analytics-internal"));return navigator.serviceWorker.addEventListener("message",n=>Jt(t,n)),t},Yt=e=>{let t=e.getProvider("messaging").getImmediate();return{getToken:o=>Oe(t,o)}};function Xt(){m(new b("messaging",zt,"PUBLIC")),m(new b("messaging-internal",Yt,"PRIVATE")),y(ke,Ie),y(ke,Ie,"esm2017")}async function Qt(){try{await G()}catch{return!1}return typeof window<"u"&&U()&&J()&&"serviceWorker"in navigator&&"PushManager"in window&&"Notification"in window&&"fetch"in window&&ServiceWorkerRegistration.prototype.hasOwnProperty("showNotification")&&PushSubscription.prototype.hasOwnProperty("getKey")}async function Zt(e){if(!navigator)throw u.create("only-available-in-window");return e.swRegistration||await Ce(e),Pt(e)}function en(e,t){if(!navigator)throw u.create("only-available-in-window");return e.onMessageHandler=t,()=>{e.onMessageHandler=null}}function ln(e=O()){return Qt().then(t=>{if(!t)throw u.create("unsupported-browser")},t=>{throw u.create("indexed-db-unsupported")}),I(T(e),"messaging").getImmediate()}async function pn(e,t){return e=T(e),Oe(e,t)}function gn(e){return e=T(e),Zt(e)}function wn(e,t){return e=T(e),en(e,t)}Xt();export{gn as deleteToken,ln as getMessaging,pn as getToken,Qt as isSupported,wn as onMessage};
/*! Bundled license information:

@firebase/installations/dist/esm/index.esm2017.js:
@firebase/installations/dist/esm/index.esm2017.js:
@firebase/installations/dist/esm/index.esm2017.js:
@firebase/installations/dist/esm/index.esm2017.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/installations/dist/esm/index.esm2017.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/installations/dist/esm/index.esm2017.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/messaging/dist/esm/index.esm2017.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2018 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
   * in compliance with the License. You may obtain a copy of the License at
   *
   * http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software distributed under the License
   * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
   * or implied. See the License for the specific language governing permissions and limitations under
   * the License.
   *)
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
*/
