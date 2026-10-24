# CovoのデプロイとCI

## 今回の停止原因と修正（2026-10-24）

1. `prepare_windows.ps1` と `build_windows_setup.ps1` にあるUTF-8 BOMなしの日本語文字列を、Tauriが起動するWindows PowerShell 5.1がANSIとして解釈した。日本語が文字化けし、文字列終端の構文エラーになった。これらのスクリプトをASCIIだけに統一し、JSONを読む際はUTF-8を明示した。PowerShell 7のCIステップが成功していても、Tauri内部が別途 `powershell` を起動するため発生する。[Microsoftの文字コード説明](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding)
2. タイムライン性能比較テストが `git show 8c6e23c:public/js/main.js` に依存していた。CIの浅いチェックアウトにはその過去コミットが存在しない。元の関数だけを固定fixtureへ抽出してコミット対象にし、SHA-256で比較対象の変更を検出する。Git履歴の追加ダウンロードを行わず、CIとローカルで同じ比較を実行する。
3. デプロイスクリプトはReleaseの最初のジョブだけを監視し、完了前に完了表示を出していた。今回、3ジョブと両ワークフロー全体の成功を確認し、最後だけ完了を表示するよう変更した。

## なぜ3つあるのか

実際には2つのワークフロー、計3ジョブ。

| ワークフロー | ジョブ | 役割 |
| --- | --- | --- |
| Validate Covo (`validate.yml`) | web-and-rules | Firebaseルール・ロジック・ブラウザの回帰テスト |
| Validate Covo (`validate.yml`) | native | Windowsネイティブテスト、検証用インストーラーのビルド。ここでは正式リリースしない |
| Release (`release.yml`) | release (windows-latest) | リリース用の検証、署名付き更新ファイル・独自インストーラーの作成と公開 |

Validateは対象ブランチへのpush/PR、Releaseはバージョンタグへのpushで起動する。`npm run deploy` はブランチとタグをpushするため、通常はこの3ジョブが動く。Release内でも公開前の回帰テストを実行するので一部の検証は重複している。GitHubのCI実行であり、利用者のFirebaseデータを大量に読み出す検証ではない（ルール検証はエミュレーター）。

## npm run deployの実行順序

0. CSSの生成。
1. アプリのバージョンとキャッシュ更新番号を揃える。
2. Repomix生成後、変更をGitへコミット。
3. バージョンタグ作成。
4. ブランチとタグをGitHubへpush。
5. 同じコミット・対象ブランチ/タグの3ジョブと両ワークフロー全体の成功を待ち、正式リリースに `CovoSetup.exe`、`latest.json`、`.exe.sig` があることを確認。
6. 待機中にHEADや作業ファイルが変わっていないことを確認し、Firebaseルール、Worker、Hostingを本番反映。WorkerはHostingのpredeployフックが実行する。

GitHub側のリリース作成だけではFirebaseへ反映されない。最後の本番反映をするのは、手元で動いている `deploy.ps1`。ターミナルを閉じると、この処理は自動継続しない。

進捗は3ジョブそれぞれの状態・実際の完了ステップ数・進行中ステップ名・リンクを表示する。以前の推定ログ行数や推定進捗率は表示しない。最新版の監視頻度・読み取り制限対策は末尾の「1.1.284成功後の最適化」を参照。API失敗・ジョブ失敗/キャンセル・60分タイムアウト・配布物不足なら本番へ進まない。

## 今回の再実行

失敗した1.1.282のジョブをそのまま再実行しても、そのタグの古いコードで実行される。今回の修正を含む状態から `npm run deploy` を実行して、新しいバージョンとして公開する。現在のローカル版1.1.282からなら次は1.1.283。既存タグを上書きする必要はない。

今回の確認: 関連Jest 50件、ブラウザ30件が成功。Jest内でWindows PowerShell 5.1による実行を含み、監視・配布物・文字コードの29項目を確認。PowerShell 7でも同じ29項目を確認。MSVCがないローカル環境ではWindowsアプリ全体のコンパイル成功までは確認していない。修正はローカル作業ファイルにあり、この修正後のpush・タグ作成・本番デプロイはまだ行っていない。

## 1.1.283のReleaseだけが停止した件（2026-10-24追記）

[Releaseジョブ](https://github.com/qwertyuiop1229/Covo/actions/runs/40049977101/job/120740283972)の全ログを確認。Jest 268件とブラウザ30件は成功した。その後 `cargo test` がコンパイラ情報を取得する `sccache ... rustc.exe -vV` で停止した。根本のエラーは `Server startup failed: cache storage failed to read` とGitHubキャッシュAPIのHTTP 400・サービス利用不可応答。提示された `aws_lc_0_41_0_jent_entropy_switch_notime_impl` はこの失敗に伴うバックトレース内のシンボルであり、これだけでCovo本体の暗号処理が壊れたとは判断しない。

同じコミットの [native検証](https://github.com/qwertyuiop1229/Covo/actions/runs/40049977100/job/120740283614)は、Rustテスト・NSISビルド・独自セットアップ生成まで成功済み。web-and-rulesも成功済み。

修正: Releaseから `mozilla-actions/sccache-action` と `SCCACHE_GHA_ENABLED` / `RUSTC_WRAPPER=sccache` の設定を削除した。Cargo成果物用の `Swatinem/rust-cache` は維持する。コンパイラの各起動を外部キャッシュサービスの可用性へ依存させず、native検証と同じ直接コンパイル方式に揃える。テスト失敗を無視する設定は追加していない。

修正はまだローカルのみ。現在のローカル版1.1.283から次に `npm run deploy` を実行すると1.1.284になる。1.1.283の失敗ジョブを再実行しても古いsccache設定は残る。Release失敗により、この試行でのFirebase/Worker本番反映は開始されていない。正式な署名付きRelease全体の成功は、修正版CIで引き続き確認する必要がある。

## 1.1.284成功後の最適化（2026-10-24）

[1.1.284のRelease](https://github.com/qwertyuiop1229/Covo/actions/runs/40052612781)は成功。ワークフロー全体は11:04:14〜11:22:30 JST（18分16秒）。最適化コンパイル自体は4分47秒。Firebase CLIのグローバルインストールは11:06:08〜11:11:35 JST（約5分27秒）を占め、Rustキャッシュは `No cache found` だった。今回の黄色の警告は未使用 `tauri::Manager` importで、コンパイルエラーではない。

次回向けの変更:

- Firebase CLIはバージョン・OS・CPU・Node 22で区切った専用フォルダにインストールして再利用。エミュレーターJARも再利用する。初回キャッシュ未作成時は通常どおりインストールする。認証情報やユーザーデータはキャッシュしない。
- native/ReleaseでRustキャッシュの共有キーを揃え、後段の失敗でも完了済み依存ビルドを保存する。`Cargo.lock` 固定で依存解決を実施する。sccacheは再導入しない。テスト・署名・配布物確認は維持。
- 未使用importを削除。
- 完了確認は両ワークフローの一覧1要求へ集約。通常間隔は未認証30秒、認証あり10秒。ステップ詳細は未認証5分・認証あり1分ごとで、ワークフロー状態変更・再実行・完了時には即座に取り直す。完了済み詳細は繰り返し取得しない。
- `GITHUB_TOKEN` がなければ、既にログイン済みのGitHub CLIの認証も利用する。新規ログインは強制せず、トークンをログやファイルへ出力しない。
- ETagを送って変更のない応答を再利用。認証付き304応答はGitHubのprimary rate limitを消費しない。[GitHub公式説明](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)
- 応答の `X-RateLimit-Remaining` と `X-RateLimit-Reset` を確認。未認証で残量12以下なら間隔を延ばし、8以下ではリセットまで待つ。自プロセスの未認証要求にも50回/直近1時間の上限を設け、`Retry-After` も尊重する。他のプロセスの突発利用まで保証はできないが、取得済み残量を無視して連打しない。

30秒/10秒は通常の確認周期であり、完了検知の保証時間ではない。残量不足・GitHub応答遅延・通信障害時は待機が長くなる。ビルド高速化の削減時間は次のCIの実測で判断する。初回キャッシュ未ヒットでは効果が小さい場合がある。

検証: 関連Jest 51件成功。Windows PowerShell 5.1/7で43項目を検証（304再利用・残量・Retry-After・一部成功/別コミットの拒否・詳細取得の間引き・完了時の即時再確認を含む）。HTTP処理はローカルHTTPサーバーに対するWindows PowerShell実行でも検証。3つのYAML、Rust構文/書式、Cargo固定メタデータを確認。最適化後のWindows正式ビルド・キャッシュヒット時間は未計測。変更は元の作業フォルダに適用済みで、まだpush/本番公開していない。既存の `public/css/styles.css` の変更は保持した。
