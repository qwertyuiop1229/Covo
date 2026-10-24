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

進捗は3ジョブそれぞれの状態・実際の完了ステップ数・進行中ステップ名・リンクを表示する。以前の推定ログ行数や推定進捗率は表示しない。GitHub APIの残量を守るため、トークンなしでは4分間隔、設定済みでは20秒間隔。未認証の通常監視は最大3要求/回、約45要求/時（他のツールによる利用とは共有）。API失敗・ジョブ失敗/キャンセル・60分タイムアウト・配布物不足なら本番へ進まない。

## 今回の再実行

失敗した1.1.282のジョブをそのまま再実行しても、そのタグの古いコードで実行される。今回の修正を含む状態から `npm run deploy` を実行して、新しいバージョンとして公開する。現在のローカル版1.1.282からなら次は1.1.283。既存タグを上書きする必要はない。

今回の確認: 関連Jest 50件、ブラウザ30件が成功。Jest内でWindows PowerShell 5.1による実行を含み、監視・配布物・文字コードの29項目を確認。PowerShell 7でも同じ29項目を確認。MSVCがないローカル環境ではWindowsアプリ全体のコンパイル成功までは確認していない。修正はローカル作業ファイルにあり、この修正後のpush・タグ作成・本番デプロイはまだ行っていない。
