# Covo プロジェクト構成メモ

このファイルは「どこに何があるか」を日本語でまとめたメモです。
整理された新しいフォルダ構成を反映しています。

---

## 🚀 デプロイ方法

```
npm run deploy
```

これ一発で以下が全部公開されます（`deploy.ps1` が実行される）:
1. バージョン番号を自動で +0.0.1 する
2. Tailwind CSS をビルド
3. Cloudflare Worker（`server/`）をデプロイ
4. Firebase Hosting（`public/`）と Firestore ルールをデプロイ
5. git コミット＋タグ＋GitHub へ push

公開先: https://simplechat-65a0d.web.app

---

## 📁 フォルダ・ファイルの役割

### アプリ本体 (フロントエンド)
| 場所 | 役割 |
|------|------|
| `public/` | **アプリ本体**。Firebase Hosting で公開される |
| `public/index.html` | メインのHTMLファイル。CSSやJSは外部ファイルとして読み込む |
| `public/css/` | CSSフォルダ。抽出された `main.css` や Tailwindが生成した `styles.css` など |
| `public/js/` | JavaScriptフォルダ。抽出されたメインロジック `main.js` が入る |
| `public/img/` | 画像・アイコン類 (`favicon.ico`, `icon-*.png` など) |
| `public/firebase-messaging-sw.js` | プッシュ通知用の Service Worker（バックグラウンド通知用） |
| `public/manifest.json` | PWA設定（ホーム画面追加時の名前・アイコン等） |
| `public/version.json` | 現在のバージョン番号（デプロイ時に自動更新） |
| `public/404.html` | 404エラーページ |
| `public/recovery.html` | アカウント・E2EE鍵復元用のページ |

### サーバー（バックエンド）
| 場所 | 役割 |
|------|------|
| `server/` | **Cloudflare Worker（バックエンドAPI）** |
| `server/src/index.js` | Worker の本体。プッシュ通知の送信等のAPI。※UTF-16LEで保存されている点に注意 |
| `server/wrangler.toml` | Worker の設定（KV・環境変数・シークレット） |

### 補助ツール・ログ・バックアップ
| 場所 | 役割 |
|------|------|
| `tools/scripts/` | プロジェクト整理・バグ修正などに使われた Python/JS スクリプト群 |
| `tools/logs/` | 過去の差分ログ (`*.diff`, `*.patch`, `*.txt`) |
| `tools/snippets/` | 一時的に抽出・作成された HTMLスニペットなど |
| `tools/backups/` | 古い index.html のバックアップなど |
| `scripts/` | デプロイ補助スクリプト（バージョン更新など npm scripts で呼ばれるもの） |

### デスクトップアプリ
| 場所 | 役割 |
|------|------|
| `src-tauri/` | **Tauri（Windows等のデスクトップEXE）の設定**。`public/` を中身として表示する |
| `src-tauri/tauri.conf.json` | Tauri の設定（バージョンは deploy 時に自動同期） |

### 設定・ツール（ルートに置く必要があるもの＝動かさない）
| ファイル | 役割 |
|----------|------|
| `firebase.json` | Firebase Hosting / Firestore の設定。デプロイ対象や predeploy 処理を定義 |
| `.firebaserc` | Firebase プロジェクトID（simplechat-65a0d） |
| `firestore.rules` | **Firestore のセキュリティルール**。誰が何を読み書きできるか。E2EE鍵の保護もここ |
| `deploy.ps1` | デプロイ手順をまとめた PowerShell スクリプト（`npm run deploy` の中身） |
| `package.json` / `package-lock.json` | npm の設定・依存関係 |
| `tailwind.config.js` / `tailwind.input.css` | Tailwind CSS の設定（`public/css/styles.css` を生成する元） |
| `.github/` | GitHub Actions（Windowsインストーラーの自動ビルド等） |
| `.gitignore` | git で無視するファイルの一覧 |

### その他
| 場所 | 役割 |
|------|------|
| `assets/` | コードから参照されない素材ファイル置き場（スクショ等） |
| `covo スタンプ/` | スタンプ用画像群（ルート） |
| `keys/` | 鍵ファイル置き場。⚠️ 下の「注意」参照 |
| `.backups/` | 手動バックアップ置き場（公開されない） |
| `node_modules/` | npm が入れた依存ライブラリ（自動生成・git管理外） |
| `.firebase/` | Firebase のキャッシュ（自動生成） |

---

## 🛠 開発者ツール（アプリ内）

iPhone等で開発者コンソールが無くてもデバッグできるよう、アプリ内に診断機能を入れてある。
**設定 → あなた → 開発者ツール** から:
- **要素を検査**: ONにして画面を長押しすると、その要素の情報を調べてコピー
- **レイアウト診断**: safe-area やナビ位置、影の有無などを表示
- **コンソール**: `console.log` 等を画面で見られる
- **診断情報をまとめてコピー**: バージョン・ログをまとめてコピー

---

## ⚠️ 注意

- **`keys/` の鍵ファイルは過去に git にコミットされている**ため、GitHub の履歴に残っている可能性があります。もし秘密の鍵なら、新しい鍵に作り直す（ローテーションする）ことを検討してください。
- `server/src/index.js` は **UTF-16LE** で保存されています（通常のエディタで文字化けする場合あり）。
