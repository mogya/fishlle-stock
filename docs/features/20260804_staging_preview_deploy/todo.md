# staging プロジェクト作成 + PR プレビュー自動デプロイ

## 背景 / ゴール
- 現状は Firebase プロジェクトが本番 `fishlle-stock-mogya` の 1 つのみ。
- Firebase の preview チャンネルは同一プロジェクト内に作られ、そのプロジェクトの
  Firestore/Auth 実バックエンドを共有する。標準構成のまま preview を有効化すると
  **PR プレビューが本番データに書き込んでしまう**。
- これを避けるため **staging プロジェクトを新設し、PR プレビューは staging に接続する**。
- 最終的に `development(emulator) / staging(preview) / production` の 3 環境体制にする。

## 設計方針
- フロントは `import.meta.env.VITE_FIREBASE_ENV` で接続先を切り替える。
  - `import.meta.env.DEV`（vite dev） → emulator
  - `VITE_FIREBASE_ENV=staging` のビルド → staging プロジェクト
  - それ以外（本番ビルド） → production プロジェクト
- PR プレビューのビルドは `VITE_FIREBASE_ENV=staging` で行い、staging プロジェクトの
  preview チャンネルへデプロイする。本番プロジェクトには一切書き込まない。

## 実装済み（このブランチ内で完了）
- `src/vite-env.d.ts`: `VITE_FIREBASE_ENV` の型定義を追加。
- `src/config/firebase.staging.ts`: staging 用 SDK config（**値は要差し替え**）。
- `src/config/firebase.ts`: development / staging / production の 3 分岐に変更。
- `.firebaserc`: `production` / `staging` エイリアスを追加。
- `.github/workflows/firebase-hosting-pull-request.yml`: PR プレビューを staging へ
  デプロイするワークフローを新設。
- `.github/workflows/firebase-hosting-merge.yml`: 本番ビルドに
  `VITE_FIREBASE_ENV=production` を明示。

## 手動で実施が必要な作業（クラウド操作・要ログイン）
> これらはクラウドリソースの作成・シークレット発行のため、本人が手元で実行すること。

### 1. staging プロジェクト作成
```bash
firebase projects:create fishlle-stock-mogya-staging -n "fishlle-stock (staging)"
```

### 2. staging に Firestore / Web アプリを用意
```bash
# Firestore データベース作成（本番と同じロケーション）
firebase firestore:databases:create "(default)" \
  --location asia-northeast2 --edition standard \
  --project fishlle-stock-mogya-staging

# rules / indexes をデプロイ
firebase deploy --only firestore --project fishlle-stock-mogya-staging

# Web アプリ登録 & SDK config 取得
firebase apps:create WEB "Staging Web App" --project fishlle-stock-mogya-staging
firebase apps:list --project fishlle-stock-mogya-staging
firebase apps:sdkconfig WEB <APP_ID> --project fishlle-stock-mogya-staging
```
→ 取得した `apiKey` / `messagingSenderId` / `appId` などを
`src/config/firebase.staging.ts` の `REPLACE_WITH_*` に差し替える。

### 3. staging の Auth (Google Sign-In) 有効化
```bash
firebase deploy --only auth --project fishlle-stock-mogya-staging
```
- `firebase.json` の `auth.authorizedDomains` は本番プロジェクト向け。staging の
  承認済みドメインは Firebase Console（staging プロジェクト）側で設定する。

### 4. GitHub Actions 用サービスアカウントと secret
```bash
# staging プロジェクトを選択したうえで実行するのが確実
firebase use staging
firebase init hosting:github
```
- リポジトリ `mogya/fishlle-stock` を指定。
- 生成される secret 名を **`FIREBASE_SERVICE_ACCOUNT_FISHLLE_STOCK_MOGYA_STAGING`**
  に揃える（`firebase-hosting-pull-request.yml` が参照している名前）。
  - `firebase init` が別名の secret を作った場合は、GitHub の
    Settings > Secrets で同名にコピーするか、ワークフロー側の参照名を合わせる。
- `firebase init hosting:github` が本番ワークフローを上書き生成しようとするので、
  既存の `firebase-hosting-merge.yml` / `firebase-hosting-pull-request.yml` を
  誤って壊さないよう差分を確認する。

## 既知の制約 / 注意点
- **preview URL での Google ログイン**: preview チャンネル URL は
  `fishlle-stock-mogya-staging--pr-<n>-<hash>.web.app` のように毎回変わる。
  Firebase Auth の承認済みドメインは固定指定のため、preview URL では
  Google サインインのポップアップ/リダイレクトが弾かれる。
  → 当面は「UI 確認は preview、認証フロー確認は staging の live チャンネル
    (`fishlle-stock-mogya-staging.web.app`)」で運用する。
    必要なら preview URL を都度承認済みドメインに追加する。
- **staging rules の上書き**: preview ワークフローは PR ごとに staging へ
  Firestore rules をデプロイする。複数 PR が同時進行すると rules が相互に
  上書きされうる（ホビー規模なので許容。気になれば rules デプロイを merge 側へ移す）。
- preview チャンネルは `expires: 7d` で自動失効する。

## 検証
- ローカル: `npm run lint` / `npm run build`（実装済み分は確認済み）。
- staging 構築後: 実際に PR を作成し、
  - preview URL が `fishlle-stock-mogya-staging--...` になっていること
  - preview で staging の Firestore に接続していること（本番に書き込まないこと）
  を確認する。
