# Node.js 24.22.1 への更新作業記録

## 背景

- 対象: [Issue #31](https://github.com/mogya/fishlle-stock/issues/31)
- 2026年10月21日の[セキュリティリリース](https://nodejs.org/en/blog/release/v24.22.1/)を受け、開発環境とCIのコマンド実行用 Node.js を修正版に更新する。
- Node.js は開発・ビルド・テスト・Firebase CLI・レシピ取得に使用している。
- `@types/node` や npm パッケージの更新では Node.js 本体は更新されないため、ランタイム自体を更新する。
- 本番は Firebase Hosting の静的配信であり、この更新だけを理由とした再デプロイは不要と判断した。

## 2026年10月24日に実施した変更

- 作業環境の Node.js を **24.15.0 → 24.22.1** に更新し、nvm のデフォルトも24.22.1に変更した。
- [.nvmrc](../../../.nvmrc) に24.22.1を指定した。
- 以下4ワークフローの `node-version: 24` を `node-version-file: .nvmrc` に変更し、開発環境とCIの指定を揃えた。
  - [PR Quality Gate](../../../.github/workflows/pr-test.yml)
  - [本番デプロイ](../../../.github/workflows/firebase-hosting-merge.yml)
  - [PRプレビューデプロイ](../../../.github/workflows/firebase-hosting-pull-request.yml)
  - [Dependabot影響分析](../../../.github/workflows/dependabot-impact-analysis.yml)
- 各ワークフローに `Show Node.js version` ステップを追加し、実際のパッチバージョンをログに出力するようにした。
- [README](../../../README.md) に現在のNode.jsバージョンと利用手順を記載した。

## 確認済みの結果

### ローカル検証

Node.js **24.22.1** で以下がすべて成功した。

- `npm run lint`
- `npm run test:run`（24件）
- `npm run typecheck:rules`
- `npm run test:rules:emulator`（33件）
- `npm run build`

4ワークフローが共通の `.nvmrc` を参照し、バージョン出力ステップを持つことも確認した。
ビルドでは500 kBを超えるチャンクの警告が出たが、ビルド自体は成功した。

### 変更前のCI

[直近の Quality Gate](https://github.com/mogya/fishlle-stock/actions/runs/40036175016)のログでは以下を確認した。

- コマンド実行用 Node.js: **24.21.0**（修正前）
- ランナー: **2.338.0**
- イメージ: `ubuntu-24.04` / `20261012.334.1`

### JavaScript Action の内蔵 Node.js

`actions/setup-node` によるPATH上のNode.js更新と、Action自体の実行ランタイムは別管理。
2026年10月24日のAction定義の確認結果は以下のとおり。

- Quality Gate・デプロイで使う `actions/checkout@v7`、`actions/setup-node@v7`、`actions/setup-java@v6`、`actions/cache@v6`、`FirebaseExtended/action-hosting-deploy@v0` は `node24` を指定している。
- Dependabot分析の `actions/checkout@v4`、`actions/setup-node@v4`、`actions/upload-artifact@v4` は `node20` を指定している。
- Actionの指定だけでは、実際に実行されるパッチバージョンは確定できない。
- 公開済みの [runner v2.338.1 の定義](https://github.com/actions/runner/blob/v2.338.1/src/Misc/externals.sh)では、内蔵Node.jsは **24.22.1 / 20.20.2**。

## これから確認すること

変更後のGitHub CIは、この作業記録の作成時点では未実行。
未確認分は [Issue #31](https://github.com/mogya/fishlle-stock/issues/31) で追跡する。

- [ ] push後、変更後のPR Quality Gateがすべて成功することを確認する。
- [ ] 各ワークフローの `Show Node.js version` とセットアップログで、コマンド実行用Node.jsが **24.22.1** であることを確認する。
- [ ] `Set up job` のランナーバージョン・イメージ情報を確認し、修正版の内蔵Node.jsが実行ランナーに適用されているか確認する。
- [ ] Node.js 20側の修正状況と、Dependabot分析で使うActionの実際のランタイムを確認する。
- [ ] この作業環境以外の開発PC・クラウド環境も、修正済みNode.jsを使用していることを確認する。

ランナー側の対応状況は [actions/runner のリリース](https://github.com/actions/runner/releases)を参照する。
今後Node.jsを更新するときは `.nvmrc` とREADMEのバージョン記述を更新し、PR Quality Gateを確認する。