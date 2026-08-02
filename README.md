# フィシュルストック

フィシュルの冷凍在庫をスマホで確認・更新するための小さなWebアプリです。

## 開発

### 通常の開発サーバー

```bash
npm install
npm run dev
```

ブラウザは通常の Vite サーバーで開きます。

### Firebase Emulator を使った開発

Auth / Firestore の Emulator を使って開発する場合は、別ターミナルで次を起動します。

```bash
firebase emulators:start --only auth,firestore
```

その後、Vite の開発サーバーを起動します。

```bash
npm run dev
```

- アプリ: http://localhost:5173
- Auth Emulator: http://localhost:9099
- Firestore Emulator: http://localhost:8080
- Emulator UI: http://localhost:4000

## ビルド

```bash
npm run build
```

## スコープ

在庫管理機能、ローカル保存、GitHub Pagesへのデプロイ設定 が実装されています。

GitHub Pagesで使ってみて次の課題を洗い出している状況です