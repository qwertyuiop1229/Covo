var ie=()=>{};var F={NODE_CLIENT:!1,NODE_ADMIN:!1,SDK_VERSION:"${JSCORE_VERSION}"};var Me=function(t,e){if(!t)throw Le(e)},Le=function(t){return new Error("Firebase Database ("+F.SDK_VERSION+") INTERNAL ASSERT FAILED: "+t)};var ce=function(t){let e=[],n=0;for(let i=0;i<t.length;i++){let r=t.charCodeAt(i);r<128?e[n++]=r:r<2048?(e[n++]=r>>6|192,e[n++]=r&63|128):(r&64512)===55296&&i+1<t.length&&(t.charCodeAt(i+1)&64512)===56320?(r=65536+((r&1023)<<10)+(t.charCodeAt(++i)&1023),e[n++]=r>>18|240,e[n++]=r>>12&63|128,e[n++]=r>>6&63|128,e[n++]=r&63|128):(e[n++]=r>>12|224,e[n++]=r>>6&63|128,e[n++]=r&63|128)}return e},$e=function(t){let e=[],n=0,i=0;for(;n<t.length;){let r=t[n++];if(r<128)e[i++]=String.fromCharCode(r);else if(r>191&&r<224){let s=t[n++];e[i++]=String.fromCharCode((r&31)<<6|s&63)}else if(r>239&&r<365){let s=t[n++],o=t[n++],a=t[n++],c=((r&7)<<18|(s&63)<<12|(o&63)<<6|a&63)-65536;e[i++]=String.fromCharCode(55296+(c>>10)),e[i++]=String.fromCharCode(56320+(c&1023))}else{let s=t[n++],o=t[n++];e[i++]=String.fromCharCode((r&15)<<12|(s&63)<<6|o&63)}}return e.join("")},fe={byteToCharMap_:null,charToByteMap_:null,byteToCharMapWebSafe_:null,charToByteMapWebSafe_:null,ENCODED_VALS_BASE:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",get ENCODED_VALS(){return this.ENCODED_VALS_BASE+"+/="},get ENCODED_VALS_WEBSAFE(){return this.ENCODED_VALS_BASE+"-_."},HAS_NATIVE_SUPPORT:typeof atob=="function",encodeByteArray(t,e){if(!Array.isArray(t))throw Error("encodeByteArray takes an array as a parameter");this.init_();let n=e?this.byteToCharMapWebSafe_:this.byteToCharMap_,i=[];for(let r=0;r<t.length;r+=3){let s=t[r],o=r+1<t.length,a=o?t[r+1]:0,c=r+2<t.length,l=c?t[r+2]:0,p=s>>2,f=(s&3)<<4|a>>4,m=(a&15)<<2|l>>6,O=l&63;c||(O=64,o||(m=64)),i.push(n[p],n[f],n[m],n[O])}return i.join("")},encodeString(t,e){return this.HAS_NATIVE_SUPPORT&&!e?btoa(t):this.encodeByteArray(ce(t),e)},decodeString(t,e){return this.HAS_NATIVE_SUPPORT&&!e?atob(t):$e(this.decodeStringToByteArray(t,e))},decodeStringToByteArray(t,e){this.init_();let n=e?this.charToByteMapWebSafe_:this.charToByteMap_,i=[];for(let r=0;r<t.length;){let s=n[t.charAt(r++)],a=r<t.length?n[t.charAt(r)]:0;++r;let l=r<t.length?n[t.charAt(r)]:64;++r;let f=r<t.length?n[t.charAt(r)]:64;if(++r,s==null||a==null||l==null||f==null)throw new H;let m=s<<2|a>>4;if(i.push(m),l!==64){let O=a<<4&240|l>>2;if(i.push(O),f!==64){let Re=l<<6&192|f;i.push(Re)}}}return i},init_(){if(!this.byteToCharMap_){this.byteToCharMap_={},this.charToByteMap_={},this.byteToCharMapWebSafe_={},this.charToByteMapWebSafe_={};for(let t=0;t<this.ENCODED_VALS.length;t++)this.byteToCharMap_[t]=this.ENCODED_VALS.charAt(t),this.charToByteMap_[this.byteToCharMap_[t]]=t,this.byteToCharMapWebSafe_[t]=this.ENCODED_VALS_WEBSAFE.charAt(t),this.charToByteMapWebSafe_[this.byteToCharMapWebSafe_[t]]=t,t>=this.ENCODED_VALS_BASE.length&&(this.charToByteMap_[this.ENCODED_VALS_WEBSAFE.charAt(t)]=t,this.charToByteMapWebSafe_[this.ENCODED_VALS.charAt(t)]=t)}}},H=class extends Error{constructor(){super(...arguments),this.name="DecodeBase64StringError"}},ke=function(t){let e=ce(t);return fe.encodeByteArray(e,!0)},v=function(t){return ke(t).replace(/\./g,"")},w=function(t){try{return fe.decodeString(t,!0)}catch(e){console.error("base64Decode failed: ",e)}return null};function Zt(t){return le(void 0,t)}function le(t,e){if(!(e instanceof Object))return e;switch(e.constructor){case Date:let n=e;return new Date(n.getTime());case Object:t===void 0&&(t={});break;case Array:t=[];break;default:return e}for(let n in e)!e.hasOwnProperty(n)||!Pe(n)||(t[n]=le(t[n],e[n]));return t}function Pe(t){return t!=="__proto__"}function Fe(){if(typeof self<"u")return self;if(typeof window<"u")return window;if(typeof global<"u")return global;throw new Error("Unable to locate global object.")}var He=()=>Fe().__FIREBASE_DEFAULTS__,je=()=>{if(typeof process>"u"||typeof process.env>"u")return;let t=process.env.__FIREBASE_DEFAULTS__;if(t)return JSON.parse(t)},ze=()=>{if(typeof document>"u")return;let t;try{t=document.cookie.match(/__FIREBASE_DEFAULTS__=([^;]+)/)}catch{return}let e=t&&w(t[1]);return e&&JSON.parse(e)},B=()=>{try{return ie()||He()||je()||ze()}catch(t){console.info(`Unable to get __FIREBASE_DEFAULTS__ due to: ${t}`);return}},Ue=t=>{var e,n;return(n=(e=B())===null||e===void 0?void 0:e.emulatorHosts)===null||n===void 0?void 0:n[t]},en=t=>{let e=Ue(t);if(!e)return;let n=e.lastIndexOf(":");if(n<=0||n+1===e.length)throw new Error(`Invalid host ${e} with no separate hostname and port!`);let i=parseInt(e.substring(n+1),10);return e[0]==="["?[e.substring(1,n-1),i]:[e.substring(0,n),i]},z=()=>{var t;return(t=B())===null||t===void 0?void 0:t.config},tn=t=>{var e;return(e=B())===null||e===void 0?void 0:e[`_${t}`]};var x=class{constructor(){this.reject=()=>{},this.resolve=()=>{},this.promise=new Promise((e,n)=>{this.resolve=e,this.reject=n})}wrapCallback(e){return(n,i)=>{n?this.reject(n):this.resolve(i),typeof e=="function"&&(this.promise.catch(()=>{}),e.length===1?e(n):e(n,i))}}};function nn(t,e){if(t.uid)throw new Error('The "uid" field is no longer supported by mockUserToken. Please use "sub" instead for Firebase Auth User ID.');let n={alg:"none",type:"JWT"},i=e||"demo-project",r=t.iat||0,s=t.sub||t.user_id;if(!s)throw new Error("mockUserToken must contain 'sub' or 'user_id' field!");let o=Object.assign({iss:`https://securetoken.google.com/${i}`,aud:i,iat:r,exp:r+3600,auth_time:r,sub:s,user_id:s,firebase:{sign_in_provider:"custom",identities:{}}},t);return[v(JSON.stringify(n)),v(JSON.stringify(o)),""].join(".")}function de(){return typeof navigator<"u"&&typeof navigator.userAgent=="string"?navigator.userAgent:""}function rn(){return typeof window<"u"&&!!(window.cordova||window.phonegap||window.PhoneGap)&&/ios|iphone|ipod|ipad|android|blackberry|iemobile/i.test(de())}function Ve(){var t;let e=(t=B())===null||t===void 0?void 0:t.forceEnvironment;if(e==="node")return!0;if(e==="browser")return!1;try{return Object.prototype.toString.call(global.process)==="[object process]"}catch{return!1}}function he(){return typeof window<"u"||U()}function U(){return typeof WorkerGlobalScope<"u"&&typeof self<"u"&&self instanceof WorkerGlobalScope}function sn(){return typeof navigator<"u"&&navigator.userAgent==="Cloudflare-Workers"}function on(){let t=typeof chrome=="object"?chrome.runtime:typeof browser=="object"?browser.runtime:void 0;return typeof t=="object"&&t.id!==void 0}function an(){return typeof navigator=="object"&&navigator.product==="ReactNative"}function cn(){let t=de();return t.indexOf("MSIE ")>=0||t.indexOf("Trident/")>=0}function fn(){return F.NODE_CLIENT===!0||F.NODE_ADMIN===!0}function ln(){return!Ve()&&!!navigator.userAgent&&navigator.userAgent.includes("Safari")&&!navigator.userAgent.includes("Chrome")}function ue(){try{return typeof indexedDB=="object"}catch{return!1}}function pe(){return new Promise((t,e)=>{try{let n=!0,i="validate-browser-context-for-indexeddb-analytics-module",r=self.indexedDB.open(i);r.onsuccess=()=>{r.result.close(),n||self.indexedDB.deleteDatabase(i),t(!0)},r.onupgradeneeded=()=>{n=!1},r.onerror=()=>{var s;e(((s=r.error)===null||s===void 0?void 0:s.message)||"")}}catch(n){e(n)}})}function dn(){return!(typeof navigator>"u"||!navigator.cookieEnabled)}var We="FirebaseError",g=class t extends Error{constructor(e,n,i){super(n),this.code=e,this.customData=i,this.name=We,Object.setPrototypeOf(this,t.prototype),Error.captureStackTrace&&Error.captureStackTrace(this,D.prototype.create)}},D=class{constructor(e,n,i){this.service=e,this.serviceName=n,this.errors=i}create(e,...n){let i=n[0]||{},r=`${this.service}/${e}`,s=this.errors[e],o=s?Ge(s,i):"Error",a=`${this.serviceName}: ${o} (${r}).`;return new g(r,a,i)}};function Ge(t,e){return t.replace(Je,(n,i)=>{let r=e[i];return r!=null?String(r):`<${i}?>`})}var Je=/\{\$([^}]+)}/g;function se(t){return JSON.parse(t)}function hn(t){return JSON.stringify(t)}var me=function(t){let e={},n={},i={},r="";try{let s=t.split(".");e=se(w(s[0])||""),n=se(w(s[1])||""),r=s[2],i=n.d||{},delete n.d}catch{}return{header:e,claims:n,data:i,signature:r}};var un=function(t){let e=me(t),n=e.claims;return!!n&&typeof n=="object"&&n.hasOwnProperty("iat")},pn=function(t){let e=me(t).claims;return typeof e=="object"&&e.admin===!0};function mn(t,e){return Object.prototype.hasOwnProperty.call(t,e)}function bn(t,e){if(Object.prototype.hasOwnProperty.call(t,e))return t[e]}function gn(t){for(let e in t)if(Object.prototype.hasOwnProperty.call(t,e))return!1;return!0}function _n(t,e,n){let i={};for(let r in t)Object.prototype.hasOwnProperty.call(t,r)&&(i[r]=e.call(n,t[r],r,t));return i}function T(t,e){if(t===e)return!0;let n=Object.keys(t),i=Object.keys(e);for(let r of n){if(!i.includes(r))return!1;let s=t[r],o=e[r];if(oe(s)&&oe(o)){if(!T(s,o))return!1}else if(s!==o)return!1}for(let r of i)if(!n.includes(r))return!1;return!0}function oe(t){return t!==null&&typeof t=="object"}function yn(t){let e=[];for(let[n,i]of Object.entries(t))Array.isArray(i)?i.forEach(r=>{e.push(encodeURIComponent(n)+"="+encodeURIComponent(r))}):e.push(encodeURIComponent(n)+"="+encodeURIComponent(i));return e.length?"&"+e.join("&"):""}function En(t){let e={};return t.replace(/^\?/,"").split("&").forEach(i=>{if(i){let[r,s]=i.split("=");e[decodeURIComponent(r)]=decodeURIComponent(s)}}),e}function vn(t){let e=t.indexOf("?");if(!e)return"";let n=t.indexOf("#",e);return t.substring(e,n>0?n:void 0)}var ae=class{constructor(){this.chain_=[],this.buf_=[],this.W_=[],this.pad_=[],this.inbuf_=0,this.total_=0,this.blockSize=512/8,this.pad_[0]=128;for(let e=1;e<this.blockSize;++e)this.pad_[e]=0;this.reset()}reset(){this.chain_[0]=1732584193,this.chain_[1]=4023233417,this.chain_[2]=2562383102,this.chain_[3]=271733878,this.chain_[4]=3285377520,this.inbuf_=0,this.total_=0}compress_(e,n){n||(n=0);let i=this.W_;if(typeof e=="string")for(let f=0;f<16;f++)i[f]=e.charCodeAt(n)<<24|e.charCodeAt(n+1)<<16|e.charCodeAt(n+2)<<8|e.charCodeAt(n+3),n+=4;else for(let f=0;f<16;f++)i[f]=e[n]<<24|e[n+1]<<16|e[n+2]<<8|e[n+3],n+=4;for(let f=16;f<80;f++){let m=i[f-3]^i[f-8]^i[f-14]^i[f-16];i[f]=(m<<1|m>>>31)&4294967295}let r=this.chain_[0],s=this.chain_[1],o=this.chain_[2],a=this.chain_[3],c=this.chain_[4],l,p;for(let f=0;f<80;f++){f<40?f<20?(l=a^s&(o^a),p=1518500249):(l=s^o^a,p=1859775393):f<60?(l=s&o|a&(s|o),p=2400959708):(l=s^o^a,p=3395469782);let m=(r<<5|r>>>27)+l+c+p+i[f]&4294967295;c=a,a=o,o=(s<<30|s>>>2)&4294967295,s=r,r=m}this.chain_[0]=this.chain_[0]+r&4294967295,this.chain_[1]=this.chain_[1]+s&4294967295,this.chain_[2]=this.chain_[2]+o&4294967295,this.chain_[3]=this.chain_[3]+a&4294967295,this.chain_[4]=this.chain_[4]+c&4294967295}update(e,n){if(e==null)return;n===void 0&&(n=e.length);let i=n-this.blockSize,r=0,s=this.buf_,o=this.inbuf_;for(;r<n;){if(o===0)for(;r<=i;)this.compress_(e,r),r+=this.blockSize;if(typeof e=="string"){for(;r<n;)if(s[o]=e.charCodeAt(r),++o,++r,o===this.blockSize){this.compress_(s),o=0;break}}else for(;r<n;)if(s[o]=e[r],++o,++r,o===this.blockSize){this.compress_(s),o=0;break}}this.inbuf_=o,this.total_+=n}digest(){let e=[],n=this.total_*8;this.inbuf_<56?this.update(this.pad_,56-this.inbuf_):this.update(this.pad_,this.blockSize-(this.inbuf_-56));for(let r=this.blockSize-1;r>=56;r--)this.buf_[r]=n&255,n/=256;this.compress_(this.buf_);let i=0;for(let r=0;r<5;r++)for(let s=24;s>=0;s-=8)e[i]=this.chain_[r]>>s&255,++i;return e}};function wn(t,e){let n=new j(t,e);return n.subscribe.bind(n)}var j=class{constructor(e,n){this.observers=[],this.unsubscribes=[],this.observerCount=0,this.task=Promise.resolve(),this.finalized=!1,this.onNoObservers=n,this.task.then(()=>{e(this)}).catch(i=>{this.error(i)})}next(e){this.forEachObserver(n=>{n.next(e)})}error(e){this.forEachObserver(n=>{n.error(e)}),this.close(e)}complete(){this.forEachObserver(e=>{e.complete()}),this.close()}subscribe(e,n,i){let r;if(e===void 0&&n===void 0&&i===void 0)throw new Error("Missing Observer.");Ke(e,["next","error","complete"])?r=e:r={next:e,error:n,complete:i},r.next===void 0&&(r.next=P),r.error===void 0&&(r.error=P),r.complete===void 0&&(r.complete=P);let s=this.unsubscribeOne.bind(this,this.observers.length);return this.finalized&&this.task.then(()=>{try{this.finalError?r.error(this.finalError):r.complete()}catch{}}),this.observers.push(r),s}unsubscribeOne(e){this.observers===void 0||this.observers[e]===void 0||(delete this.observers[e],this.observerCount-=1,this.observerCount===0&&this.onNoObservers!==void 0&&this.onNoObservers(this))}forEachObserver(e){if(!this.finalized)for(let n=0;n<this.observers.length;n++)this.sendOne(n,e)}sendOne(e,n){this.task.then(()=>{if(this.observers!==void 0&&this.observers[e]!==void 0)try{n(this.observers[e])}catch(i){typeof console<"u"&&console.error&&console.error(i)}})}close(e){this.finalized||(this.finalized=!0,e!==void 0&&(this.finalError=e),this.task.then(()=>{this.observers=void 0,this.onNoObservers=void 0}))}};function Ke(t,e){if(typeof t!="object"||t===null)return!1;for(let n of e)if(n in t&&typeof t[n]=="function")return!0;return!1}function P(){}function Dn(t,e){return`${t} failed: ${e} argument `}var Sn=function(t){let e=[],n=0;for(let i=0;i<t.length;i++){let r=t.charCodeAt(i);if(r>=55296&&r<=56319){let s=r-55296;i++,Me(i<t.length,"Surrogate pair missing trail surrogate.");let o=t.charCodeAt(i)-56320;r=65536+(s<<10)+o}r<128?e[n++]=r:r<2048?(e[n++]=r>>6|192,e[n++]=r&63|128):r<65536?(e[n++]=r>>12|224,e[n++]=r>>6&63|128,e[n++]=r&63|128):(e[n++]=r>>18|240,e[n++]=r>>12&63|128,e[n++]=r>>6&63|128,e[n++]=r&63|128)}return e},Cn=function(t){let e=0;for(let n=0;n<t.length;n++){let i=t.charCodeAt(n);i<128?e++:i<2048?e+=2:i>=55296&&i<=56319?(e+=4,n++):e+=3}return e};var In=14400*1e3;function An(t){return t&&t._delegate?t._delegate:t}var y=class{constructor(e,n,i){this.name=e,this.instanceFactory=n,this.type=i,this.multipleInstances=!1,this.serviceProps={},this.instantiationMode="LAZY",this.onInstanceCreated=null}setInstantiationMode(e){return this.instantiationMode=e,this}setMultipleInstances(e){return this.multipleInstances=e,this}setServiceProps(e){return this.serviceProps=e,this}setInstanceCreatedCallback(e){return this.onInstanceCreated=e,this}};var _="[DEFAULT]";var V=class{constructor(e,n){this.name=e,this.container=n,this.component=null,this.instances=new Map,this.instancesDeferred=new Map,this.instancesOptions=new Map,this.onInitCallbacks=new Map}get(e){let n=this.normalizeInstanceIdentifier(e);if(!this.instancesDeferred.has(n)){let i=new x;if(this.instancesDeferred.set(n,i),this.isInitialized(n)||this.shouldAutoInitialize())try{let r=this.getOrInitializeService({instanceIdentifier:n});r&&i.resolve(r)}catch{}}return this.instancesDeferred.get(n).promise}getImmediate(e){var n;let i=this.normalizeInstanceIdentifier(e?.identifier),r=(n=e?.optional)!==null&&n!==void 0?n:!1;if(this.isInitialized(i)||this.shouldAutoInitialize())try{return this.getOrInitializeService({instanceIdentifier:i})}catch(s){if(r)return null;throw s}else{if(r)return null;throw Error(`Service ${this.name} is not available`)}}getComponent(){return this.component}setComponent(e){if(e.name!==this.name)throw Error(`Mismatching Component ${e.name} for Provider ${this.name}.`);if(this.component)throw Error(`Component for ${this.name} has already been provided`);if(this.component=e,!!this.shouldAutoInitialize()){if(qe(e))try{this.getOrInitializeService({instanceIdentifier:_})}catch{}for(let[n,i]of this.instancesDeferred.entries()){let r=this.normalizeInstanceIdentifier(n);try{let s=this.getOrInitializeService({instanceIdentifier:r});i.resolve(s)}catch{}}}}clearInstance(e=_){this.instancesDeferred.delete(e),this.instancesOptions.delete(e),this.instances.delete(e)}async delete(){let e=Array.from(this.instances.values());await Promise.all([...e.filter(n=>"INTERNAL"in n).map(n=>n.INTERNAL.delete()),...e.filter(n=>"_delete"in n).map(n=>n._delete())])}isComponentSet(){return this.component!=null}isInitialized(e=_){return this.instances.has(e)}getOptions(e=_){return this.instancesOptions.get(e)||{}}initialize(e={}){let{options:n={}}=e,i=this.normalizeInstanceIdentifier(e.instanceIdentifier);if(this.isInitialized(i))throw Error(`${this.name}(${i}) has already been initialized`);if(!this.isComponentSet())throw Error(`Component ${this.name} has not been registered yet`);let r=this.getOrInitializeService({instanceIdentifier:i,options:n});for(let[s,o]of this.instancesDeferred.entries()){let a=this.normalizeInstanceIdentifier(s);i===a&&o.resolve(r)}return r}onInit(e,n){var i;let r=this.normalizeInstanceIdentifier(n),s=(i=this.onInitCallbacks.get(r))!==null&&i!==void 0?i:new Set;s.add(e),this.onInitCallbacks.set(r,s);let o=this.instances.get(r);return o&&e(o,r),()=>{s.delete(e)}}invokeOnInitCallbacks(e,n){let i=this.onInitCallbacks.get(n);if(i)for(let r of i)try{r(e,n)}catch{}}getOrInitializeService({instanceIdentifier:e,options:n={}}){let i=this.instances.get(e);if(!i&&this.component&&(i=this.component.instanceFactory(this.container,{instanceIdentifier:Ye(e),options:n}),this.instances.set(e,i),this.instancesOptions.set(e,n),this.invokeOnInitCallbacks(i,e),this.component.onInstanceCreated))try{this.component.onInstanceCreated(this.container,e,i)}catch{}return i||null}normalizeInstanceIdentifier(e=_){return this.component?this.component.multipleInstances?e:_:e}shouldAutoInitialize(){return!!this.component&&this.component.instantiationMode!=="EXPLICIT"}};function Ye(t){return t===_?void 0:t}function qe(t){return t.instantiationMode==="EAGER"}var S=class{constructor(e){this.name=e,this.providers=new Map}addComponent(e){let n=this.getProvider(e.name);if(n.isComponentSet())throw new Error(`Component ${e.name} has already been registered with ${this.name}`);n.setComponent(e)}addOrOverwriteComponent(e){this.getProvider(e.name).isComponentSet()&&this.providers.delete(e.name),this.addComponent(e)}getProvider(e){if(this.providers.has(e))return this.providers.get(e);let n=new V(e,this);return this.providers.set(e,n),n}getProviders(){return Array.from(this.providers.values())}};var W=[],d;(function(t){t[t.DEBUG=0]="DEBUG",t[t.VERBOSE=1]="VERBOSE",t[t.INFO=2]="INFO",t[t.WARN=3]="WARN",t[t.ERROR=4]="ERROR",t[t.SILENT=5]="SILENT"})(d||(d={}));var be={debug:d.DEBUG,verbose:d.VERBOSE,info:d.INFO,warn:d.WARN,error:d.ERROR,silent:d.SILENT},Xe=d.INFO,Qe={[d.DEBUG]:"log",[d.VERBOSE]:"log",[d.INFO]:"info",[d.WARN]:"warn",[d.ERROR]:"error"},Ze=(t,e,...n)=>{if(e<t.logLevel)return;let i=new Date().toISOString(),r=Qe[e];if(r)console[r](`[${i}]  ${t.name}:`,...n);else throw new Error(`Attempted to log a message with an invalid logType (value: ${e})`)},N=class{constructor(e){this.name=e,this._logLevel=Xe,this._logHandler=Ze,this._userLogHandler=null,W.push(this)}get logLevel(){return this._logLevel}set logLevel(e){if(!(e in d))throw new TypeError(`Invalid value "${e}" assigned to \`logLevel\``);this._logLevel=e}setLogLevel(e){this._logLevel=typeof e=="string"?be[e]:e}get logHandler(){return this._logHandler}set logHandler(e){if(typeof e!="function")throw new TypeError("Value assigned to `logHandler` must be a function");this._logHandler=e}get userLogHandler(){return this._userLogHandler}set userLogHandler(e){this._userLogHandler=e}debug(...e){this._userLogHandler&&this._userLogHandler(this,d.DEBUG,...e),this._logHandler(this,d.DEBUG,...e)}log(...e){this._userLogHandler&&this._userLogHandler(this,d.VERBOSE,...e),this._logHandler(this,d.VERBOSE,...e)}info(...e){this._userLogHandler&&this._userLogHandler(this,d.INFO,...e),this._logHandler(this,d.INFO,...e)}warn(...e){this._userLogHandler&&this._userLogHandler(this,d.WARN,...e),this._logHandler(this,d.WARN,...e)}error(...e){this._userLogHandler&&this._userLogHandler(this,d.ERROR,...e),this._logHandler(this,d.ERROR,...e)}};function ge(t){W.forEach(e=>{e.setLogLevel(t)})}function _e(t,e){for(let n of W){let i=null;e&&e.level&&(i=be[e.level]),t===null?n.userLogHandler=null:n.userLogHandler=(r,s,...o)=>{let a=o.map(c=>{if(c==null)return null;if(typeof c=="string")return c;if(typeof c=="number"||typeof c=="boolean")return c.toString();if(c instanceof Error)return c.message;try{return JSON.stringify(c)}catch{return null}}).filter(c=>c).join(" ");s>=(i??r.logLevel)&&t({level:d[s].toLowerCase(),message:a,args:o,type:r.name})}}}var et=(t,e)=>e.some(n=>t instanceof n),ye,Ee;function tt(){return ye||(ye=[IDBDatabase,IDBObjectStore,IDBIndex,IDBCursor,IDBTransaction])}function nt(){return Ee||(Ee=[IDBCursor.prototype.advance,IDBCursor.prototype.continue,IDBCursor.prototype.continuePrimaryKey])}var ve=new WeakMap,J=new WeakMap,we=new WeakMap,G=new WeakMap,Y=new WeakMap;function rt(t){let e=new Promise((n,i)=>{let r=()=>{t.removeEventListener("success",s),t.removeEventListener("error",o)},s=()=>{n(u(t.result)),r()},o=()=>{i(t.error),r()};t.addEventListener("success",s),t.addEventListener("error",o)});return e.then(n=>{n instanceof IDBCursor&&ve.set(n,t)}).catch(()=>{}),Y.set(e,t),e}function it(t){if(J.has(t))return;let e=new Promise((n,i)=>{let r=()=>{t.removeEventListener("complete",s),t.removeEventListener("error",o),t.removeEventListener("abort",o)},s=()=>{n(),r()},o=()=>{i(t.error||new DOMException("AbortError","AbortError")),r()};t.addEventListener("complete",s),t.addEventListener("error",o),t.addEventListener("abort",o)});J.set(t,e)}var K={get(t,e,n){if(t instanceof IDBTransaction){if(e==="done")return J.get(t);if(e==="objectStoreNames")return t.objectStoreNames||we.get(t);if(e==="store")return n.objectStoreNames[1]?void 0:n.objectStore(n.objectStoreNames[0])}return u(t[e])},set(t,e,n){return t[e]=n,!0},has(t,e){return t instanceof IDBTransaction&&(e==="done"||e==="store")?!0:e in t}};function De(t){K=t(K)}function st(t){return t===IDBDatabase.prototype.transaction&&!("objectStoreNames"in IDBTransaction.prototype)?function(e,...n){let i=t.call(R(this),e,...n);return we.set(i,e.sort?e.sort():[e]),u(i)}:nt().includes(t)?function(...e){return t.apply(R(this),e),u(ve.get(this))}:function(...e){return u(t.apply(R(this),e))}}function ot(t){return typeof t=="function"?st(t):(t instanceof IDBTransaction&&it(t),et(t,tt())?new Proxy(t,K):t)}function u(t){if(t instanceof IDBRequest)return rt(t);if(G.has(t))return G.get(t);let e=ot(t);return e!==t&&(G.set(t,e),Y.set(e,t)),e}var R=t=>Y.get(t);function Ce(t,e,{blocked:n,upgrade:i,blocking:r,terminated:s}={}){let o=indexedDB.open(t,e),a=u(o);return i&&o.addEventListener("upgradeneeded",c=>{i(u(o.result),c.oldVersion,c.newVersion,u(o.transaction),c)}),n&&o.addEventListener("blocked",c=>n(c.oldVersion,c.newVersion,c)),a.then(c=>{s&&c.addEventListener("close",()=>s()),r&&c.addEventListener("versionchange",l=>r(l.oldVersion,l.newVersion,l))}).catch(()=>{}),a}function Mn(t,{blocked:e}={}){let n=indexedDB.deleteDatabase(t);return e&&n.addEventListener("blocked",i=>e(i.oldVersion,i)),u(n).then(()=>{})}var at=["get","getKey","getAll","getAllKeys","count"],ct=["put","add","delete","clear"],q=new Map;function Se(t,e){if(!(t instanceof IDBDatabase&&!(e in t)&&typeof e=="string"))return;if(q.get(e))return q.get(e);let n=e.replace(/FromIndex$/,""),i=e!==n,r=ct.includes(n);if(!(n in(i?IDBIndex:IDBObjectStore).prototype)||!(r||at.includes(n)))return;let s=async function(o,...a){let c=this.transaction(o,r?"readwrite":"readonly"),l=c.store;return i&&(l=l.index(a.shift())),(await Promise.all([l[n](...a),r&&c.done]))[0]};return q.set(e,s),s}De(t=>({...t,get:(e,n,i)=>Se(e,n)||t.get(e,n,i),has:(e,n)=>!!Se(e,n)||t.has(e,n)}));var Q=class{constructor(e){this.container=e}getPlatformInfoString(){return this.container.getProviders().map(n=>{if(ft(n)){let i=n.getImmediate();return`${i.library}/${i.version}`}else return null}).filter(n=>n).join(" ")}};function ft(t){let e=t.getComponent();return e?.type==="VERSION"}var L="@firebase/app",Z="0.11.5";var b=new N("@firebase/app"),lt="@firebase/app-compat",dt="@firebase/analytics-compat",ht="@firebase/analytics",ut="@firebase/app-check-compat",pt="@firebase/app-check",mt="@firebase/auth",bt="@firebase/auth-compat",gt="@firebase/database",_t="@firebase/data-connect",yt="@firebase/database-compat",Et="@firebase/functions",vt="@firebase/functions-compat",wt="@firebase/installations",Dt="@firebase/installations-compat",St="@firebase/messaging",Ct="@firebase/messaging-compat",It="@firebase/performance",At="@firebase/performance-compat",Ot="@firebase/remote-config",xt="@firebase/remote-config-compat",Bt="@firebase/storage",Tt="@firebase/storage-compat",Nt="@firebase/firestore",Rt="@firebase/vertexai",Mt="@firebase/firestore-compat",Lt="firebase",$t="11.6.1";var $="[DEFAULT]",kt={[L]:"fire-core",[lt]:"fire-core-compat",[ht]:"fire-analytics",[dt]:"fire-analytics-compat",[pt]:"fire-app-check",[ut]:"fire-app-check-compat",[mt]:"fire-auth",[bt]:"fire-auth-compat",[gt]:"fire-rtdb",[_t]:"fire-data-connect",[yt]:"fire-rtdb-compat",[Et]:"fire-fn",[vt]:"fire-fn-compat",[wt]:"fire-iid",[Dt]:"fire-iid-compat",[St]:"fire-fcm",[Ct]:"fire-fcm-compat",[It]:"fire-perf",[At]:"fire-perf-compat",[Ot]:"fire-rc",[xt]:"fire-rc-compat",[Bt]:"fire-gcs",[Tt]:"fire-gcs-compat",[Nt]:"fire-fst",[Mt]:"fire-fst-compat",[Rt]:"fire-vertex","fire-js":"fire-js",[Lt]:"fire-js-all"};var E=new Map,C=new Map,I=new Map;function Ie(t,e){try{t.container.addComponent(e)}catch(n){b.debug(`Component ${e.name} failed to register with FirebaseApp ${t.name}`,n)}}function jn(t,e){t.container.addOrOverwriteComponent(e)}function ee(t){let e=t.name;if(I.has(e))return b.debug(`There were multiple attempts to register component ${e}.`),!1;I.set(e,t);for(let n of E.values())Ie(n,t);for(let n of C.values())Ie(n,t);return!0}function Pt(t,e){let n=t.container.getProvider("heartbeat").getImmediate({optional:!0});return n&&n.triggerHeartbeat(),t.container.getProvider(e)}function zn(t,e,n=$){Pt(t,e).clearInstance(n)}function Ft(t){return t.options!==void 0}function Un(t){return t==null?!1:t.settings!==void 0}function Vn(){I.clear()}var Ht={"no-app":"No Firebase App '{$appName}' has been created - call initializeApp() first","bad-app-name":"Illegal App name: '{$appName}'","duplicate-app":"Firebase App named '{$appName}' already exists with different options or config","app-deleted":"Firebase App named '{$appName}' already deleted","server-app-deleted":"Firebase Server App has been deleted","no-options":"Need to provide options, when not being deployed to hosting via source.","invalid-app-argument":"firebase.{$appName}() takes either no argument or a Firebase App instance.","invalid-log-argument":"First argument to `onLog` must be null or a function.","idb-open":"Error thrown when opening IndexedDB. Original error: {$originalErrorMessage}.","idb-get":"Error thrown when reading from IndexedDB. Original error: {$originalErrorMessage}.","idb-set":"Error thrown when writing to IndexedDB. Original error: {$originalErrorMessage}.","idb-delete":"Error thrown when deleting from IndexedDB. Original error: {$originalErrorMessage}.","finalization-registry-not-supported":"FirebaseServerApp deleteOnDeref field defined but the JS runtime does not support FinalizationRegistry.","invalid-server-app-environment":"FirebaseServerApp is not for use in browser environments."},h=new D("app","Firebase",Ht);var k=class{constructor(e,n,i){this._isDeleted=!1,this._options=Object.assign({},e),this._config=Object.assign({},n),this._name=n.name,this._automaticDataCollectionEnabled=n.automaticDataCollectionEnabled,this._container=i,this.container.addComponent(new y("app",()=>this,"PUBLIC"))}get automaticDataCollectionEnabled(){return this.checkDestroyed(),this._automaticDataCollectionEnabled}set automaticDataCollectionEnabled(e){this.checkDestroyed(),this._automaticDataCollectionEnabled=e}get name(){return this.checkDestroyed(),this._name}get options(){return this.checkDestroyed(),this._options}get config(){return this.checkDestroyed(),this._config}get container(){return this._container}get isDeleted(){return this._isDeleted}set isDeleted(e){this._isDeleted=e}checkDestroyed(){if(this.isDeleted)throw h.create("app-deleted",{appName:this._name})}};function Ae(t,e){let n=w(t.split(".")[1]);if(n===null){console.error(`FirebaseServerApp ${e} is invalid: second part could not be parsed.`);return}if(JSON.parse(n).exp===void 0){console.error(`FirebaseServerApp ${e} is invalid: expiration claim could not be parsed`);return}let r=JSON.parse(n).exp*1e3,s=new Date().getTime();r-s<=0&&console.error(`FirebaseServerApp ${e} is invalid: the token has expired.`)}var te=class extends k{constructor(e,n,i,r){let s=n.automaticDataCollectionEnabled!==void 0?n.automaticDataCollectionEnabled:!1,o={name:i,automaticDataCollectionEnabled:s};if(e.apiKey!==void 0)super(e,o,r);else{let a=e;super(a.options,o,r)}this._serverConfig=Object.assign({automaticDataCollectionEnabled:s},n),this._serverConfig.authIdToken&&Ae(this._serverConfig.authIdToken,"authIdToken"),this._serverConfig.appCheckToken&&Ae(this._serverConfig.appCheckToken,"appCheckToken"),this._finalizationRegistry=null,typeof FinalizationRegistry<"u"&&(this._finalizationRegistry=new FinalizationRegistry(()=>{this.automaticCleanup()})),this._refCount=0,this.incRefCount(this._serverConfig.releaseOnDeref),this._serverConfig.releaseOnDeref=void 0,n.releaseOnDeref=void 0,M(L,Z,"serverapp")}toJSON(){}get refCount(){return this._refCount}incRefCount(e){this.isDeleted||(this._refCount++,e!==void 0&&this._finalizationRegistry!==null&&this._finalizationRegistry.register(e,this))}decRefCount(){return this.isDeleted?0:--this._refCount}automaticCleanup(){zt(this)}get settings(){return this.checkDestroyed(),this._serverConfig}checkDestroyed(){if(this.isDeleted)throw h.create("server-app-deleted")}};var Wn=$t;function jt(t,e={}){let n=t;typeof e!="object"&&(e={name:e});let i=Object.assign({name:$,automaticDataCollectionEnabled:!1},e),r=i.name;if(typeof r!="string"||!r)throw h.create("bad-app-name",{appName:String(r)});if(n||(n=z()),!n)throw h.create("no-options");let s=E.get(r);if(s){if(T(n,s.options)&&T(i,s.config))return s;throw h.create("duplicate-app",{appName:r})}let o=new S(r);for(let c of I.values())o.addComponent(c);let a=new k(n,i,o);return E.set(r,a),a}function Gn(t,e){if(he()&&!U())throw h.create("invalid-server-app-environment");e.automaticDataCollectionEnabled===void 0&&(e.automaticDataCollectionEnabled=!1);let n;Ft(t)?n=t.options:n=t;let i=Object.assign(Object.assign({},e),n);i.releaseOnDeref!==void 0&&delete i.releaseOnDeref;let r=l=>[...l].reduce((p,f)=>Math.imul(31,p)+f.charCodeAt(0)|0,0);if(e.releaseOnDeref!==void 0&&typeof FinalizationRegistry>"u")throw h.create("finalization-registry-not-supported",{});let s=""+r(JSON.stringify(i)),o=C.get(s);if(o)return o.incRefCount(e.releaseOnDeref),o;let a=new S(s);for(let l of I.values())a.addComponent(l);let c=new te(n,e,s,a);return C.set(s,c),c}function Jn(t=$){let e=E.get(t);if(!e&&t===$&&z())return jt();if(!e)throw h.create("no-app",{appName:t});return e}function Kn(){return Array.from(E.values())}async function zt(t){let e=!1,n=t.name;E.has(n)?(e=!0,E.delete(n)):C.has(n)&&t.decRefCount()<=0&&(C.delete(n),e=!0),e&&(await Promise.all(t.container.getProviders().map(i=>i.delete())),t.isDeleted=!0)}function M(t,e,n){var i;let r=(i=kt[t])!==null&&i!==void 0?i:t;n&&(r+=`-${n}`);let s=r.match(/\s|\//),o=e.match(/\s|\//);if(s||o){let a=[`Unable to register library "${r}" with version "${e}":`];s&&a.push(`library name "${r}" contains illegal characters (whitespace or "/")`),s&&o&&a.push("and"),o&&a.push(`version name "${e}" contains illegal characters (whitespace or "/")`),b.warn(a.join(" "));return}ee(new y(`${r}-version`,()=>({library:r,version:e}),"VERSION"))}function Yn(t,e){if(t!==null&&typeof t!="function")throw h.create("invalid-log-argument");_e(t,e)}function qn(t){ge(t)}var Ut="firebase-heartbeat-database",Vt=1,A="firebase-heartbeat-store",X=null;function Te(){return X||(X=Ce(Ut,Vt,{upgrade:(t,e)=>{switch(e){case 0:try{t.createObjectStore(A)}catch(n){console.warn(n)}}}}).catch(t=>{throw h.create("idb-open",{originalErrorMessage:t.message})})),X}async function Wt(t){try{let n=(await Te()).transaction(A),i=await n.objectStore(A).get(Ne(t));return await n.done,i}catch(e){if(e instanceof g)b.warn(e.message);else{let n=h.create("idb-get",{originalErrorMessage:e?.message});b.warn(n.message)}}}async function Oe(t,e){try{let i=(await Te()).transaction(A,"readwrite");await i.objectStore(A).put(e,Ne(t)),await i.done}catch(n){if(n instanceof g)b.warn(n.message);else{let i=h.create("idb-set",{originalErrorMessage:n?.message});b.warn(i.message)}}}function Ne(t){return`${t.name}!${t.options.appId}`}var Gt=1024,Jt=30,ne=class{constructor(e){this.container=e,this._heartbeatsCache=null;let n=this.container.getProvider("app").getImmediate();this._storage=new re(n),this._heartbeatsCachePromise=this._storage.read().then(i=>(this._heartbeatsCache=i,i))}async triggerHeartbeat(){var e,n;try{let r=this.container.getProvider("platform-logger").getImmediate().getPlatformInfoString(),s=xe();if(((e=this._heartbeatsCache)===null||e===void 0?void 0:e.heartbeats)==null&&(this._heartbeatsCache=await this._heartbeatsCachePromise,((n=this._heartbeatsCache)===null||n===void 0?void 0:n.heartbeats)==null)||this._heartbeatsCache.lastSentHeartbeatDate===s||this._heartbeatsCache.heartbeats.some(o=>o.date===s))return;if(this._heartbeatsCache.heartbeats.push({date:s,agent:r}),this._heartbeatsCache.heartbeats.length>Jt){let o=Yt(this._heartbeatsCache.heartbeats);this._heartbeatsCache.heartbeats.splice(o,1)}return this._storage.overwrite(this._heartbeatsCache)}catch(i){b.warn(i)}}async getHeartbeatsHeader(){var e;try{if(this._heartbeatsCache===null&&await this._heartbeatsCachePromise,((e=this._heartbeatsCache)===null||e===void 0?void 0:e.heartbeats)==null||this._heartbeatsCache.heartbeats.length===0)return"";let n=xe(),{heartbeatsToSend:i,unsentEntries:r}=Kt(this._heartbeatsCache.heartbeats),s=v(JSON.stringify({version:2,heartbeats:i}));return this._heartbeatsCache.lastSentHeartbeatDate=n,r.length>0?(this._heartbeatsCache.heartbeats=r,await this._storage.overwrite(this._heartbeatsCache)):(this._heartbeatsCache.heartbeats=[],this._storage.overwrite(this._heartbeatsCache)),s}catch(n){return b.warn(n),""}}};function xe(){return new Date().toISOString().substring(0,10)}function Kt(t,e=Gt){let n=[],i=t.slice();for(let r of t){let s=n.find(o=>o.agent===r.agent);if(s){if(s.dates.push(r.date),Be(n)>e){s.dates.pop();break}}else if(n.push({agent:r.agent,dates:[r.date]}),Be(n)>e){n.pop();break}i=i.slice(1)}return{heartbeatsToSend:n,unsentEntries:i}}var re=class{constructor(e){this.app=e,this._canUseIndexedDBPromise=this.runIndexedDBEnvironmentCheck()}async runIndexedDBEnvironmentCheck(){return ue()?pe().then(()=>!0).catch(()=>!1):!1}async read(){if(await this._canUseIndexedDBPromise){let n=await Wt(this.app);return n?.heartbeats?n:{heartbeats:[]}}else return{heartbeats:[]}}async overwrite(e){var n;if(await this._canUseIndexedDBPromise){let r=await this.read();return Oe(this.app,{lastSentHeartbeatDate:(n=e.lastSentHeartbeatDate)!==null&&n!==void 0?n:r.lastSentHeartbeatDate,heartbeats:e.heartbeats})}else return}async add(e){var n;if(await this._canUseIndexedDBPromise){let r=await this.read();return Oe(this.app,{lastSentHeartbeatDate:(n=e.lastSentHeartbeatDate)!==null&&n!==void 0?n:r.lastSentHeartbeatDate,heartbeats:[...r.heartbeats,...e.heartbeats]})}else return}};function Be(t){return v(JSON.stringify({version:2,heartbeats:t})).length}function Yt(t){if(t.length===0)return-1;let e=0,n=t[0].date;for(let i=1;i<t.length;i++)t[i].date<n&&(n=t[i].date,e=i);return e}function qt(t){ee(new y("platform-logger",e=>new Q(e),"PRIVATE")),ee(new y("heartbeat",e=>new ne(e),"PRIVATE")),M(L,Z,t),M(L,Z,"esm2017"),M("fire-js","")}qt("");export{Me as a,Le as b,fe as c,ke as d,w as e,Zt as f,Fe as g,Ue as h,en as i,tn as j,x as k,nn as l,de as m,rn as n,sn as o,on as p,an as q,cn as r,fn as s,ln as t,ue as u,pe as v,dn as w,g as x,D as y,se as z,hn as A,un as B,pn as C,mn as D,bn as E,gn as F,_n as G,T as H,yn as I,En as J,vn as K,ae as L,wn as M,Dn as N,Sn as O,Cn as P,An as Q,y as R,V as S,S as T,d as U,N as V,Ce as W,Mn as X,$ as Y,E as Z,C as _,I as $,Ie as aa,jn as ba,ee as ca,Pt as da,zn as ea,Ft as fa,Un as ga,Vn as ha,Wn as ia,jt as ja,Gn as ka,Jn as la,Kn as ma,zt as na,M as oa,Yn as pa,qn as qa};
/*! Bundled license information:

@firebase/util/dist/index.esm2017.js:
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
   * Copyright 2022 Google LLC
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
   * Copyright 2021 Google LLC
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

@firebase/util/dist/index.esm2017.js:
@firebase/util/dist/index.esm2017.js:
@firebase/util/dist/index.esm2017.js:
@firebase/logger/dist/esm/index.esm2017.js:
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

@firebase/util/dist/index.esm2017.js:
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
   * Copyright 2022 Google LLC
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

@firebase/util/dist/index.esm2017.js:
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

@firebase/util/dist/index.esm2017.js:
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

@firebase/util/dist/index.esm2017.js:
  (**
   * @license
   * Copyright 2021 Google LLC
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

@firebase/component/dist/esm/index.esm2017.js:
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

@firebase/app/dist/esm/index.esm2017.js:
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
   * Copyright 2023 Google LLC
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
   * Copyright 2021 Google LLC
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
