# お魚ストック

家にあるお魚をスマホで確認・更新するための小さなWebアプリです。
[フィシュル](https://fishlle.com/) を管理することを想定して作りましたが、株式会社ベンナーズさんとはなんの関係もない趣味アプリです。

## 開発

### Node.js

開発・ビルド・テスト・Firebase CLI・レシピ取得には、[.nvmrc](./.nvmrc) で指定した
Node.js **24.22.1** を使用します。

nvm を利用している場合は、リポジトリのルートで次を実行してください。

```bash
nvm install
nvm use
node --version
```

別のバージョン管理ツールを使う場合も、同じバージョンをインストールしてください。
CI の4ワークフローも `.nvmrc` を参照し、`Show Node.js version` ステップで
実際のパッチバージョンを出力します。
PR Quality Gate では lint・単体テスト・ルール型チェック・Emulator テスト・ビルドを実行します。

#### GitHub Actions の内蔵 Node.js

`actions/setup-node` はコマンド実行用の Node.js を更新しますが、
JavaScript Action 自体の Node.js は GitHub Actions ランナーが管理します。
本番は Firebase Hosting で静的ファイルを配信しています。

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

### GitHub Actions の依存固定

ワークフローの `uses:` はタグ（例: `actions/checkout@v7.0.1`）で書き、実行するコミットは
`.github/workflows/actions.lock` で固定しています（[gh-actions-lock](https://github.com/github/gh-actions-lock) 方式）。
ワークフローの追加や `uses:` の変更時は `gh actions-lock` を再実行し、ワークフローと
`actions.lock` を同じコミットに含めてください。`actions.lock` は手で編集せず、
`gh actions-lock --verify` で検証します（CI の `verify-lockfile.yml` でも実行）。

```bash
gh extension install github/gh-actions-lock --pin v0.4.0
gh actions-lock
gh actions-lock --verify
```

## ビルド

```bash
npm run build
```

## テスト

```bash
npm run test:run
```

### Firestore ルールテスト

Firestore Emulator を起動してルールテストを実行します。

```bash
npm run test:rules:emulator
```

ルールテスト本体だけ実行する場合（Emulator がすでに起動済みの場合）は以下を使います。

```bash
npm run test:rules
```

## レシピデータの更新

在庫詳細に表示する公式レシピ一覧は `public/recipes.json` に含まれています。
`fishlle.com` のレシピカテゴリページから再取得する場合は以下を実行してください。

```bash
npm run scrape:recipes
```

実行後、生成された `public/recipes.json` をコミットしてデプロイしてください。
