export const previewRuntime = `(() => {
  window.covoLocalPreview = true;
  const target = input => {
    const url = new URL(input, location.href);
    return url.origin === 'https://simplechat-api.astro-fray-server.workers.dev' && url.pathname.startsWith('/api/')
      ? location.origin + '/__covo_dev__/worker' + url.pathname + url.search : null;
  };
  const fetcher = window.fetch.bind(window);
  window.fetch = (input, options) => {
    const next = target(input instanceof Request ? input.url : String(input));
    return fetcher(next ? (input instanceof Request ? new Request(next, input) : next) : input, options);
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(...args) { args[1] = target(String(args[1])) || args[1]; return open.apply(this,args); };
  // URL properties and HTML media loads do not use window.fetch. Keep them on
  // the same authenticated Worker proxy too, without broadening production CORS.
  const mediaUrl = value => {try{return target(String(value)) || value;}catch(_){return value;}};
  const attributes = new Set(['src','poster','href']);
  const rewriteAttribute = (name,value) => attributes.has(name) ? mediaUrl(value)
    : name === 'srcset' ? String(value).replaceAll('https://simplechat-api.astro-fray-server.workers.dev/api/',location.origin+'/__covo_dev__/worker/api/') : value;
  const setAttribute=Element.prototype.setAttribute;
  Element.prototype.setAttribute=function(name,value){return setAttribute.call(this,name,rewriteAttribute(String(name).toLowerCase(),value));};
  for(const [type,names] of [[HTMLImageElement,['src','srcset']],[HTMLMediaElement,['src']],[HTMLVideoElement,['poster']],[HTMLSourceElement,['src','srcset']],[HTMLAnchorElement,['href']]]) {
    for(const name of names){const property=Object.getOwnPropertyDescriptor(type.prototype,name);if(property?.set)Object.defineProperty(type.prototype,name,{...property,set(value){property.set.call(this,rewriteAttribute(name,value));}});}
  }
  const html=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  Object.defineProperty(Element.prototype,'innerHTML',{...html,set(value){
    if(typeof value==='string' && value.includes('https://simplechat-api.astro-fray-server.workers.dev/api/')){
      const template=document.createElement('template');html.set.call(template,value);
      for(const node of template.content.querySelectorAll('[src],[srcset],[poster],[href]'))for(const name of ['src','srcset','poster','href'])if(node.hasAttribute(name))setAttribute.call(node,name,rewriteAttribute(name,node.getAttribute(name)));
      value=html.get.call(template);
    }
    html.set.call(this,value);
  }});
})();`;

export function mobileSetup({hostname,httpsPort,fingerprint}) {
  // hostname is selected from validated local IPv4 addresses, never arbitrary request text.
  const url='https://'+hostname+':'+httpsPort+'/';
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Covo スマホ検証</title>
  <style>:root{color-scheme:light dark;font:16px/1.7 system-ui;background:#f1f5f9;color:#1e293b}body{max-width:640px;margin:auto;padding:28px 20px}section{background:white;padding:24px;border-radius:20px;margin:20px 0}h1{font-size:26px}h2{font-size:19px}a{color:#4752c4;overflow-wrap:anywhere}.button{display:inline-block;background:#4752c4;color:white;padding:12px 20px;border-radius:12px;text-decoration:none}code{overflow-wrap:anywhere}small{display:block;overflow-wrap:anywhere}@media(prefers-color-scheme:dark){:root{background:#1e2430;color:#eef2ff}section{background:#2b3342}a{color:#a5b4fc}.button{color:white}}</style>
  <h1>Covo スマホ検証</h1><p>PCと同じWi-Fiに接続して、初回だけ次の設定をしてください。画面の配信はこのPCから行います。アカウントや会話の接続先は本番環境です。</p>
  <section><h2>1. HTTPS用の証明書</h2><p>暗号化・録音・PWAの検証にはHTTPSが必要です。</p><a class="button" href="/__covo_dev__/covo-local-ca.cer">このPCの開発用証明書を取得</a>
  <p>iPhone / iPad：設定 → ダウンロード済みプロファイルからインストール後、一般 → 情報 → 証明書信頼設定で「Covo Local Development CA」を信頼します。</p>
  <p>Android：設定の「証明書をインストール」→「CA証明書」から追加します。項目名は端末によって異なります。</p>
  <p>自分のPCの証明書であることを、ターミナルの指紋と照合してください。検証が不要になったら設定から削除できます。秘密鍵をスマホへ配布することはありません。</p><small>SHA-256：${fingerprint}</small>
  <details><summary>次回も証明書の設定が必要ですか？</summary><p>同じPCでCAの保存データを保持していれば、通常は初回だけです。IPが変わった場合も同じCAを再利用します。CAを作り直した場合や期限切れ時は再設定が必要です。</p><p>このCAの信頼はCovoだけに限定されません。PC側の秘密鍵を守り、検証をしない期間は証明書の信頼をオフにするか削除してください。本番Covoの利用には不要です。</p></details></section>
  <section><h2>2. アプリを開く</h2><a class="button" href="${url}">HTTPSでCovoを開く</a><p><a href="${url}">${url}</a></p><p>証明書の警告が残る場合は、信頼設定を確認してブラウザを開き直してください。</p></section>
  <section><h2>3. Googleログインを試す場合</h2><p>Firebase ConsoleがIPを有効なドメインとして受け付けないため、このLAN URLではメールとパスワードで検証してください。以前の「IPを承認済みドメインへ追加」という案内は誤りでした。</p><p>スマホでGoogleログインを検証する場合は、PCで <code>npm run test:web:google</code> を実行し、表示されたFirebase HostingのプレビューURLを開きます。フロントエンドを1日限定の公開URLへアップロードするため、Hostingの転送量を使用します。会話とアカウントは本番データです。通常のtest:webではアップロードしません。</p><p>プレビューのドメインはCLIが承認設定へ追加します。未承認エラーが残る場合は、そのプレビューURLのホスト名だけをAuthentication → 設定 → 承認済みドメインへ追加してください。PCのローカル検証には <code>localhost</code> を使用します。</p></section>
  <section><h2>4. PWAで検証する場合</h2><p>上のHTTPSのCovo画面をSafariで開き、共有 →「ホーム画面に追加」→「Webアプリとして開く」をオンにします。設定案内のHTTPページではなく、HTTPSのアプリ画面を追加してください。</p><p>名前を「Covoテスト」にして、追加したアイコンから起動します。本番用のCovoは削除しないでください。PCと開発サーバーを起動したまま、同じWi-Fiで使います。</p><p>IPが変わると古いアイコンのURLも確認が必要です。コードを変更した後はテスト用PWAを終了して開き直してください。</p></section>
  <p>接続できない場合：PCのファイアウォールでNode.jsをプライベートネットワークに許可してください。ゲストWi-Fiや端末間通信を禁止したWi-Fiでは接続できません。</p></html>`;
}
