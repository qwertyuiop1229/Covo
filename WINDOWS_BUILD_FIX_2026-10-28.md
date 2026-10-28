# Windowsビルド停止の原因と修正（2026-10-28）

対象はv1.1.294（dfeba920377b9bb2ae84e70d9e145ae6a65d52be）。[失敗したnativeジョブ](https://github.com/qwertyuiop1229/Covo/actions/runs/40696739156/job/122845412800)の実ログと、ローカルのwindowsクレート生成ソースを照合した。

## なにが起きたか

アプリがWindowsの未読バッジ表示と外部ブラウザー起動に使うAPIを、Rustライブラリの設定で有効にしていなかった。Cargoの`features`は、使う機能をコンパイル対象へ含める指定。OSの権限要求や、利用者が変更するWindows設定ではない。

`windows 0.61.3`では、`WindowsAndMessaging`モジュール、`SetOverlayIcon`、`ShellExecuteW`は`Win32_UI_WindowsAndMessaging`という機能指定を必要とする。

| エラー | 意味 | 今回の発生理由 |
|---|---|---|
| E0432 | 指定した名前をimportできない | モジュールとShellExecuteWが機能指定で除外されている |
| E0433 | 指定したモジュールを解決できない | HICONの属するWindowsAndMessagingが除外されている |
| E0599 | その型に指定したメソッドがない | SetOverlayIconが機能指定で除外されている |

7件は、別々の7個の故障ではなく、この設定不足による連鎖。キャッシュ削除や同じジョブの再実行だけでは、設定不足は解消しない。

## なぜ以前は動いたのか

直前のCargo.lockにあるTauri 2.10.3は`windows 0.61`を使い、必要な機能も自分で有効にしていた。アプリも`windows 0.61.3`を使っていたため、Cargoの機能統合によって、アプリ側の指定漏れが隠れていた。

v1.1.294ではTauriの指定を`2.11.6`へ更新し、Cargo.lock上の実バージョンは**2.12.5**になっている。Cargoの`version = "2.11.6"`は通常、2.11.6だけに固定する指定ではない。このTauriは`windows 0.62.2`を使う。一方、アプリ側は0.61.3のままなので、Tauriが0.62側で有効にした機能がアプリの0.61側には届かなくなった。

つまり、依存更新で「他のライブラリが偶然有効にしてくれていた機能」への依存が表面化した。過去のすべてのCI失敗が同じ原因だったという意味ではない。

## 修正

`src-tauri/Cargo.toml`のwindows依存に`Win32_UI_WindowsAndMessaging`を直接追加した。必要な機能をアプリ自身で宣言するため、別の依存の機能統合に頼らなくなる。APIの削除、未読バッジの無効化、Tauriのダウングレードは必要ない。バージョンやCargo.lockは変更していない。

## 検証と制約

- `cargo tree --locked --manifest-path src-tauri/Cargo.toml -e features -i windows@0.61.3`が成功。アプリ自身から必要な機能が有効になっていることを確認。
- ローカルのwindows 0.61.3生成ソースで、失敗したAPIの機能条件と修正が一致することを確認。
- `cargo check --locked --manifest-path src-tauri/Cargo.toml --tests`を実行したが、このPCにMSVCの`link.exe`がなく、依存のビルドスクリプトで停止。アプリの修正後コンパイル成功はまだ確認できていない。
- GitHub Actionsの修正後の実行、タグ作成、push、本番デプロイは行っていない。公開前にはWindows CIのnative・releaseの成功が必要。

`npm run deploy`は、バージョン更新→コミット／タグ→GitHubへpush→CI待機→Firebase／Worker反映、という順序。今回はnativeジョブが失敗したため、最後の本番反映へ進まなかった。ログにある停止メッセージは、この安全確認が働いた結果。作成済みのv1.1.294タグはそのまま残るので、古い失敗ジョブを再実行しても修正は含まれない。修正を新しいコミットに含めて次のリリースとして検証する必要がある。

Windowsのネイティブコードや依存を変えた際は、MSVC Developer PowerShellで`cargo test --locked --manifest-path src-tauri/Cargo.toml --lib`を実行すると、公開処理を始める前に同種のコンパイルエラーを発見できる。既存CIの失敗時停止は維持する。
