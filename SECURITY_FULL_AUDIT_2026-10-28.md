# Covo横断セキュリティ・不具合監査（2026-10-28）

## 結論

現在のソースに、追加対応が必要な問題がある。既存テストの成功や`npm audit --omit=dev`の0件だけで安全とは判断できない。今回、ローカルエミュレーターと外部通信を模擬したWorker実行で、**10種類の問題の挙動を再現**した。さらに、CDN経由で読み込むPDF.jsに公表済み脆弱性の該当条件がある。

これはソース、ローカル設定、既存テスト、追加の認可・競合プローブ、公開アドバイザリーを使った監査。本番に対する侵入・負荷試験、実データ変更、秘密情報の読み出しは行っていない。本番設定やデプロイ済みルールがローカルと同じかは未確認。「全コードの全条件に欠陥がない」という保証ではない。

製品コードへの今回の修正はWindowsビルド設定のみ。以下のセキュリティ指摘は**未修正**として報告する。

## 構成と調査対象

| 層 | 実装・役割 | 確認した境界 |
|---|---|---|
| Web/PWA | JavaScript ES Modules、Firebase SDK 12.19.0、Service Worker、IndexedDB、Tailwind | DOM出力、アカウント切替、キャッシュ、通知、ローカル保存、CDN依存 |
| Desktop | Tauri、Rust、Windows API、署名付きUpdater | capabilities、CSP、外部URL、インストール元、コールバック、通知XML |
| 認証・メタデータ | Firebase Auth、Firestore | ロール、許可リスト、所属、鍵配布、復旧、招待、プロフィール |
| リアルタイム | Firebase RTDB | 本文、既読、入力、在席、音声状態、旧経路、権限ミラー |
| バックエンド | Cloudflare Worker | トークン検証、管理API、ファイル、通知、招待、復旧、外向きfetch |
| Cloudflare保存 | D1とWorkers KV | SQLのバインド、管理者ゲート、監査ログ、ファイル取得・削除 |
| 暗号 | AES-GCM 256、RSA-OAEP/SHA-256、PBKDF2、escrow | IV、保存鍵、復旧権限、ローテーション、暗号化と認証の区別 |
| 外部サービス | Agora、Cloudinary、FCM、CDN PDF.js | 発行権限、公開URL、実行コードの取得元 |

Tauriの実解決版はCargo.lockで2.12.5、アプリが直接使うwindowsクレートは0.61.3。設定に書かれた最小バージョンとロックファイルの実バージョンを区別した。D1の広いレガシー処理は、入口でアプリ管理者または初期設定用シークレット保持者に制限されている。内部処理だけを読んで一般ユーザーのIDORがあるとは判定していない。

## 優先対応が必要な問題

### A01 高: PDF.jsの既知の任意JavaScript実行脆弱性

`public/js/dependency_loader.js:30`がPDF.js **3.11.174**をCDNからロードし、`public/js/main.js:19227`は`getDocument({url, withCredentials:false})`を実行する。`isEvalSupported:false`を指定していない。[MozillaのGHSA-wgrm-67xf-hhpq / CVE-2024-4367](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq)が示す影響バージョン・設定に該当する。PDFサムネイル表示の経路から悪意あるPDFを処理し得る。

アプリのオリジンでコード実行が成立すると、そのオリジンにある認証状態・ローカル秘密鍵への影響が考えられる。Tauri側CSPは`unsafe-eval`も許可している。今回、実際の悪意あるPDFを使ったコード実行は試していないが、該当版と該当設定はソースで確認済み。npm管理外のCDN依存なので、npm auditが0件でも検出されない。

対策は修正済みの保守版へ更新し、本体・workerを同じ版にすること。公式回避策の`isEvalSupported:false`も適用する。ロードできることに加え、通常PDFのサムネイルと悪意あるフォントを含むPDFの拒否を検証する。

### A02 高: 管理者追加時のメール→UID照合が編集可能なプロフィールを信用する（F4）

`public/js/main.js:5118`付近の管理者追加は、`users`の`email`検索からUIDを選び、そのUIDを`adminList.admins`へ追加する。しかし`firestore.rules:193`は本人のプロフィールの`email`をFirebase Authの検証済みメールへ束縛していない。

追加プローブでは、outsiderがプロフィールのメールを管理者追加予定の別人のメールへ変更→管理者が現在のUIと同じ検索・UID登録を実行→outsiderが管理者専用設定を書き込む、まで成功した。**管理者による追加操作が必要**で、一般ユーザーがadminListを直接書き換えられるという意味ではない。それでも、管理者が意図した人物へ付与した権限が攻撃者のUIDへ渡る。

対策はWorkerでFirebase Authの正式なユーザー情報から検証済みメールとUIDを解決して付与すること。利用者が編集できるプロフィールやそのキャッシュを権限付与・復旧先判定の根拠にしない。

### A03 高: ログイン許可リストがDBアクセス時に強制されない（F1）

クライアントは`main.js:1445`以降で許可メールを確認し、未許可ユーザーをsignOutする。一方、Firestoreの`isAuthenticated()`は認証とメンテナンスを確認するだけで、許可リストを参照しない。Workerのsignupの許可判定も、直接DBへアクセスする既存認証ユーザーには効かない。

許可設定をactiveにしたエミュレーターで、未登録の認証ユーザーが他人のプロフィールを読み、自分のサーバーを作れることを再現。未認証ユーザーは拒否されることも確認した。Firebase Authで本番の任意登録が可能かは今回確認していないので、その部分を実証したとは扱わない。少なくとも既存アカウントの許可取消をDBのアクセス取消として期待する設計には不足がある。

対策はサーバー側の会員資格を確定し、Firestore・RTDB・Workerの保護対象すべてで共通して確認すること。複数メールの扱いを含めて移行方針を決める必要がある。

### A04 高: Agoraトークンの発行に会話・サーバーの所属確認がない（W1）

`server/src/index.js:1772`はFirebaseトークンとUIDの一致を確認するが、呼出側の`channel`をそのまま署名する。Firestoreのサーバー所属や部屋の存在を調べない。任意チャンネルへのトークンが発行され、所属参照が0回であることをWorkerプローブで確認した。

現行音声実装は`vc_${serverId}_${channelId}`を使うため、識別子を知る認証ユーザーが非参加チャンネルへのトークンを取得し得る。実Agoraへの参加・盗聴は未試験。トークン発行の認可欠落は再現済み。チャンネル名を64文字へ切り詰める処理にも衝突の設計上の懸念があり、資源IDから衝突しない名前を生成すべき。

対策はserverId/roomIdまたはDMの参加者をバックエンドで確認し、チャンネル名をバックエンドで生成すること。発行回数と有効期間も制限する。

### A05 高: 緊急復旧PINの消費とパスワード変更が競合する（W3）

`server/src/index.js:875`以降はPINを読む→検証→Firebaseのパスワード変更→PINをusedにする、という順序。消費コミットのHTTP失敗を確認しない。

同じ有効PINへの2並列リクエストで、パスワード変更が2回実行され、後の消費コミットを409にしても両方が200成功になることを再現。Firebase側のネットワークは模擬しており、実アカウントのパスワードは変更していない。PINまたはその値を持つ者による競合が前提。

誤PIN時のfailCount更新にも楽観ロック失敗の再評価がなく、並列試行を厳密な5回に制限する根拠にならない。対策は期限・未使用・試行回数をトランザクション等で予約／消費してからパスワード変更すること。外部Auth更新に失敗した場合の再試行方針まで定義する。

## その他の再現済み問題

| ID・優先度 | 問題と証拠 | 対応 |
|---|---|---|
| A06 中 / W2 | `handleJoinServer`は招待のmaxUsesを読み、その後別コミットでusesを増加。maxUses=1へ2人が並列参加して両方成功、uses=2。インクリメント自体の原子性と、上限確認の原子性は別。 | 招待の上限・失効・所属追加をトランザクション／前提条件で束縛。同じUIDの重複要求によるmemberCount増加も防ぐ。 |
| A07 中 / F3 | `firestore.rules:494`のroomKeys更新は、数値versionsへの追記に見せて他人の旧wrappedKeyを差し替えられる。wrappedKeyだけだったv1からversions={2:...}へ移行するとv1が保護されない。DM側には旧形式保護があるがルーム側に相当の条件がない。 | 既存wrappedKeyをv1へ保持する条件、既存世代の不変性、最新世代の整合性を検証。旧履歴を復号できる正常系も試験。 |
| A08 中・旧経路 / R2 | RTDBのroomKeysは、一般メンバーaliceがbobの既存versions/1を置換できる。現行の主要な鍵取得はFirestoreであり、この操作が直ちに現行クライアントの復号を壊すとは確認していない。 | 未使用なら旧経路を閉鎖。利用するならFirestore以上の不変性と宛先制限を適用。 |
| A09 中 / R1 | 非参加者がRTDBのサーバー別readReceiptsとvoiceStatesを読める。本文ではなく既読時刻・参加状態の漏えい。Firestoreの同種経路よりRTDB側が広い。 | 読み取りにも所属確認を要求。サーバー配下・ルート直下・DMの全経路を揃える。 |
| A10 中 / F2 | 非参加者が非公開サーバー内へスタンプを作成できる。Firestoreのstamps/createは本人createdByと形式を確認するが所属を確認しない。stampGroupsにも同様の構造がある。 | サーバーの参加者／管理者の製品上の方針に合わせて作成を制限。 |
| A11 低・旧経路 / R3 | ルート直下rooms/r/latestDeleteへ非参加者が自分をdeletedByにして書き込める。latestPin等も同様の本人フィールドだけの規則。現行クライアントがこの偽装ヒントで実本文を消すことは未確認。 | 未使用経路を閉鎖。継続利用ならサーバー・部屋・メッセージ・権限へ束縛。 |

## 暗号化と運用上の境界

**鍵バックアップの暗号化には、利用者固有の秘密がない。** `crypto_helpers.js:238`付近のv3は、公開可能なUID、固定コンテキスト、Workerから取得するpepperでPBKDF2鍵を作る。`/api/e2ee/pepper`は通常時に認証なしで取得でき、既定pepperもコード中にある。したがって、暗号化バックアップ・salt・IVがDB流出などで取得された場合、公開APIで得られる情報から復号できる構造。200,000回の反復やAES-256だけではこの性質は変わらない。通常のDBアクセスは本人に制限されており、今回、第三者のFirestore秘密鍵取得は実証していない。

また、端末localStorageに秘密鍵JWKを保存し、サーバールームには管理者／Workerによるescrow復旧がある。運営者を信頼する復旧設計と、運営者でも解読できない暗号化は異なる保証。必要な保証を明文化し、パスフレーズ等の利用者秘密、端末の安全な鍵保管、復旧手段のトレードオフを設計する必要がある。既存鍵を一括再生成すると履歴を失うため、移行は慎重に行う。

本文AES-GCMには毎回ランダムな12-byte IVを生成している。通常のアーカイブは利用者パスフレーズからPBKDF2/AES-GCMで暗号化され、上のUID＋公開pepperのバックアップとは条件が違う。本文は共有ルーム鍵による暗号化で、送信者ごとの暗号署名やラチェットによる前方秘匿性は確認できない。共有鍵を持つメンバーへの送信者真正性は主にDBルールに依存する。キック後の鍵交換だけで過去分の前方秘匿性を保証するとは説明しない。

**CSPとCDNの防御は弱い。** Tauriは`unsafe-inline`・`unsafe-eval`と複数CDNを許可し、Web HostingにはCSPヘッダー設定がない。optional script loaderにSRIはない。XSSが成立した場合の被害範囲が大きく、PDF.jsの問題と合わせて優先的に対処したい。これ自体を任意コード実行の実証とは数えない。Tauriの権限は複数ウィンドウにまとめられており、必要最小限への分割も検討する。[Tauri公式のcapabilities仕様](https://tauri.app/security/capabilities/)を照合した。

**レート制御には不足がある。** アプリコードでは、OG取得・アップロード・復旧等に共通した永続／分散レート制御を確認できない。復旧のMapによる制限はWorker isolateごとである。Cloudflare側のWAF等は未確認なので「本番にレート制限がない」とは断定しない。uploadはformData全体のパース後に認証・サイズ確認するため、早期に拒否する余地もある。負荷・課金試験は行っていない。

## 依存監査

- rootの`npm audit --omit=dev`: **0件**。
- serverの`npm audit`: **0件**。
- rootの開発依存込み: **34パッケージ**に指摘（high 29 / low 5）。主な根はZodとdeepmergeで、依存ツリー上の波及数を含む。34個の独立した本番攻撃があるという意味ではない。Jimpのアイコン生成・Jest等の開発ツール経路を区別する。
- Cargo.lockのregistryパッケージ**595個**をOSVへ照合し、7パッケージに指摘：block-buffer 0.10.4、glib 0.18.5、paste 1.0.15、proc-macro-error 1.0.4、zbus_names 4.3.5、zvariant 5.15.1、zvariant_derive 5.15.1。保守終了情報・ビルド時依存・他OS依存を含む。Windowsで到達可能な実行時脆弱性7件と解釈しない。今回の出力を既存報告と照合したが、すべてのアドバイザリーについてWindowsでの攻撃到達性を新たに実証したものではない。
- 上記のnpm監査とは別に、CDNのPDF.js問題を発見した。CDN、生成vendor、Rust、GitHub Actionsはnpm監査だけでは網羅できない。

再確認資料：[Mozilla PDF.js公式通知](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq)、[Zodの通知](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)、[deepmergeの通知](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)。

## 実行した検証

| 検証 | 今回の結果 |
|---|---|
| 既存security実行 | 13 suite中12成功、378件成功。Firestoreの1件が5秒タイムアウト。 |
| 失敗suiteの再検証 | browser全体実行後、Firestore suite全52件を30秒の上限で再実行し成功。単一の全体実行が379/379だったとは扱わない。 |
| ブラウザー全体 | 108 passed / 1 skipped。専用Firebase runtime試験はこの実行ではskip。 |
| 追加Workerプローブ | W1/W2/W3を再現。すべてのfetchは模擬、本番への書き込みなし。 |
| 追加Rulesプローブ | F1/F2/F3/F4/R1/R2/R3を実エミュレーターで再現。 |
| JavaScript静的確認 | 44ファイルの構文・ローカルnamed import整合性を確認。 |
| 秘密情報公開防止チェック | 351入力でブロック対象なし。万能な秘密情報検出器ではない。 |
| Windows | featuresの修正を依存グラフで確認。ビルドはローカルMSVC linker不足により未完了。 |

初回のエミュレーター起動は既定Java 8が古く失敗したため、既存の`scratch/java21`をプロセス限定で使用。初回の別テスト呼出にはエミュレーター外実行による失敗もあり、セキュリティ上の再現とは数えていない。

再現コードは`audit/2026-10-28/probes.cjs`。`REPRODUCED`は**脆弱な挙動を再現した**という意味で、安全性テストの合格ではない。ルールの検証用データ消去もdemoプロジェクトのローカルエミュレーターだけで行う。

```powershell
node audit/2026-10-28/probes.cjs --worker
# Java 21とローカルFirebase CLIが必要。PowerShellでは--only値を引用する。
firebase emulators:exec --config firebase.emulators.json --project demo-covo-security-test --only 'firestore,database' 'node audit/2026-10-28/probes.cjs --rules'
```

生成した詳細結果は`scratch/security-full-audit/`に保存した（Git管理外）。npm監査JSON、Worker/Rulesの再現JSON、テストログ、Windows機能グラフが含まれる。

## 本番で残る確認

Firebase Authのプロバイダー設定・アカウント登録ポリシー・App Check・IAM、公開済みFirestore/RTDBルール、CloudflareのWAF・バインディング・秘密設定・D1/KVの実データ・バックアップ、Cloudinary設定は今回アクセスしていない。実機iOS PWA、FCMのOSまでの配達、実Agora通話、Windowsインストーラー実行、実端末の長時間動作も未検証。

この監査で特に急ぐべきものは、PDF.jsの実行経路、管理者UID付与の本人確認、許可リストのバックエンド強制、音声トークンの所属認可、緊急復旧の競合対策。修正時には拒否テストと正常な復旧・参加・管理者付与の両方を追加し、Firestore・RTDB・Workerを合わせて検証する。
