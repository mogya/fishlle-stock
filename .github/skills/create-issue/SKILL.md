---
name: create-issue
description: ユーザーの曖昧な指示やチャット履歴から、ソースコードを積極的に調査して背景・ゴール・テスト項目を網羅した実装計画を docs/features/ブランチ名/todo.md に作成します。
---

# Create Issue Plan

## 実行プロセス

### 0. ブランチ名の取得
現在のブランチ名を取得し、`docs/features/<branch-name>/` の出力先を決めます。

使用コマンド例:
```bash
branch_name=$(git rev-parse --abbrev-ref HEAD)
spec_dir="docs/features/${branch_name}"
```

### 1. 出力先ディレクトリの確認
`docs/features/<branch-name>/` がすでに存在するか確認します。

- すでにディレクトリが存在する場合は、そのまま後続の処理を継続します。
- ディレクトリが存在しない場合は、`docs/features/<branch-name>/` を作成してから後続の処理を継続します。

使用コマンド例:
```bash
if [ ! -d "$spec_dir" ]; then
	mkdir -p "$spec_dir"
fi
```

### 2. ソースコード調査
ユーザーの指示から関係するファイルを特定し、以下の情報をコードから読み取ります。
ユーザーに質問する前に、自分でコードを調べて答えを見つけてください。

調査すべき観点：
- **現状の実装**: 変更対象のファイル・クラス・メソッドの現在の動作
- **関連ファイル**: `src/` 配下（例: `App.tsx`, `lib/`, `types/`）と設定ファイル（`package.json`, `vite.config.ts`, `tsconfig*.json`）の影響範囲
- **既存の検証手段**: テストフレームワークの有無、`npm run lint` / `npm run build` / 手動検証のどれで品質確認するか
- **設計パターン**: このコードベースで同様の処理がどう実装されているか（参考実装）

探索の優先パス:
- `src/`（実装本体）
- `src/lib/`（在庫ロジック・保存処理）
- `src/types/`（型定義）
- `README.md`（運用方針・スコープ）
- `package.json`（利用可能なスクリプト）

コード調査で判明しなかった情報（仕様の意図・ビジネス要件など）はユーザーに質問してください。

### 3. ドラフト作成
調査結果をもとに、以下のテンプレートに従って markdown 形式でドラフトを作成します。
`実装方針`のセクションで、抽象的な説明を避け **具体的なファイルパス・コードスニペット・手順** を用いてください。

`docs/features/<branch-name>/todo.md` に書き出します。

使用コマンド例:
```bash
todo_file="$spec_dir/todo.md"
cat <<'EOF' > "$todo_file"
BODY_CONTENT
EOF
```

---

## Todo テンプレート

### 📝 背景 / Background
- 現状の課題と、この修正が必要な理由

### 🎯 ゴール / Goals
- [ ] 完了とみなす具体的な状態 (Acceptance Criteria)

### 実装方針
- 変更が必要なファイル（パスを明記）と、それぞれに加えるべき変更の概要
- コードスニペットや疑似コードで変更後のイメージを示す
- 注意点・制約・考慮すべきエッジケース

### 🧪 テスト・検証内容 / Test Plan
- [ ] 手動で確認する操作手順（具体的なURLや操作を記載）
- [ ] 実行する静的検証・ビルド確認（例: `npm run lint`, `npm run build`）
- [ ] 自動テストを追加する場合の対象（このリポジトリでは必要に応じて `src/` 近傍に新規作成）

補足:
- このプロジェクトでは現時点で `package.json` に `test` スクリプトが定義されていないため、既存テスト探索は `spec/` や `test/` を前提にしない。
- まずは lint/build/手動操作での検証計画を明記し、自動テスト追加が必要な場合のみ場所と導入方針を具体化する。

---

## 使用コマンド例
```bash
branch_name=$(git rev-parse --abbrev-ref HEAD)
spec_dir="docs/features/${branch_name}"

if [ ! -d "$spec_dir" ]; then
	mkdir -p "$spec_dir"
fi

todo_file="$spec_dir/todo.md"
cat <<'EOF' > "$todo_file"
BODY_CONTENT
EOF
```
