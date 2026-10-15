---
name: create-pullrequest
description: origin/main..HEAD の差分コミットを解析し、コミットメッセージ（概要・背景・詳細）を活用して高品質な Pull Request のタイトルと本文を作成・起票します。
argument-hint: "必要なら PR の補足（目的・懸念点・レビュー観点）、エビデンス優先順位、Draft/Ready指定を記載"
---

# Create Pull Request

## このスキルが行うこと
- `git log -p origin/main..HEAD` を主軸に、複数コミットの差分とコミットメッセージを横断して変更意図を要約します。
- 呼び出し元からの指示（引数）を根拠として取り込みます。具体的な背景・成果物・参照ファイルが渡された場合はそれを優先します。
- 会話履歴を参照するのは、呼び出し元が明示した場合に限ります。
- 変更ファイルだけでなく、コミット本文の背景情報・判断理由を PR 本文へ反映します。
- PR のタイトル、要約、変更点、確認観点、テスト観点を整えて `gh pr create` で起票します。確認なしで起票し、指定がなければ Ready for review とします。

## このリポジトリでの前提
- 主な変更対象は `src/`, `src/lib/`, `src/types/` と設定ファイル（`package.json`, `vite.config.ts`, `tsconfig*.json`）。
- 検証は `npm run lint` / `npm run build` / `npm run test:run` を基本に、必要なら `npm run test:rules:emulator` と手動確認も記述する。

## いつ使うか
- `staged` や `modified` をそのままコミットして PR を作るのではなく、既存コミット列から PR を構成したいとき
- コミットメッセージに背景・制約・補足が十分に書かれており、PR本文に活かしたいとき
- 複数コミットを 1 本の PR 説明へ整理したいとき
- 他のスキルから対象範囲や PR ステータスを指定されて呼び出されるとき

## 呼び出し元が指定できるパラメータ
- **エビデンス優先順位**: 未指定なら「引数で渡された情報 > コミット本文 > 差分」の順。会話履歴の利用を明示した場合は会話履歴を最優先にする。
- **参照ファイル**: `docs/features/<branch>/todo.md` など、背景情報の根拠として読むべきファイルを指定できる。指定があればコミット本文と同等以上の根拠として扱う。
- **PR ステータス**: `ready`（既定）または `draft` を指定できる。

## 実行手順

### 1. 解析範囲を確定
1. ベースブランチは `main` 固定です。`origin` の所有者と現在のブランチに対応する open PR を検索し、既存 PR があれば base にかかわらず URL と base を報告して停止します。別 fork の同名ブランチは対象に含めません。
2. `git fetch origin --prune` の後に `origin/main` が存在することを確認し、コミット収集の範囲を `origin/main..HEAD` とします。

```bash
branch_name="$(git symbolic-ref --quiet --short HEAD)" || exit 1
origin_repo="$(gh repo view "$(git remote get-url origin)" --json nameWithOwner --jq '.nameWithOwner')" || exit 1
existing_prs="$(gh api -X GET "repos/$origin_repo/pulls" -f state=open -f head="${origin_repo%%/*}:$branch_name" --jq '.[] | [.base.ref, .html_url] | @tsv')" || exit 1
if [[ -n "$existing_prs" ]]; then
	echo "既存PRがあります (base / URL): $existing_prs" >&2
	exit 1
fi
git fetch origin --prune
if ! git show-ref --verify --quiet refs/remotes/origin/main; then
	echo "origin/main を取得できません" >&2
	exit 1
fi
```

### 2. コミット情報を収集（必須）
1. まず全体像を取得します。
```bash
git log --reverse --pretty=format:'%H%n%s%n%b%n---END---' origin/main..HEAD
```
2. 次に差分詳細を取得します。
```bash
git log -p origin/main..HEAD
```
3. 必要ならファイル一覧も取得します。
```bash
git diff --name-status origin/main...HEAD
```

### 3. PR本文を構成
1. タイトル案は、コミット件名群の共通目的を 1 行で要約して作成します。
2. 本文では次の優先度で情報を採用します。
- 会話履歴の利用が指示された場合: 第1優先は会話履歴、第2優先は指定された参照ファイル・コミット本文
- 指示されていない場合: 第1優先は指定された参照ファイル・引数、第2優先はコミット本文。会話履歴は根拠に含めません
- 第3優先: パッチ差分から読み取れる実装詳細
- 第4優先: 必要最小限の推測（推測は明示）
3. 背景と意思決定理由の説明は省略せず、コミット本文・指定された参照ファイルから抽出します。
4. コミット単位の断片をそのまま列挙せず、テーマごとに統合して記述します。
5. テスト記載は「コミット本文に書かれた確認」と「差分から必要と判断できる確認」を分けて書きます。
6. 会話履歴の利用が指示された場合に限り、由来する内容を背景・変更内容・リスクへ統合します。
7. このリポジトリで実施した lint・build・テストの結果と未実施項目は正確に記述します。

### 4. 品質チェック
- `staged` / `modified` だけを根拠に本文を書いていない
- 会話履歴の利用が指示された場合、明示された意図・経緯・懸念が PR に反映されている
- `git log -p origin/main..HEAD` で確認した内容と矛盾がない
- コミット本文・指定された参照ファイルの背景情報が PR に反映されている
- 影響範囲とリスクが本文に含まれる
- タイトルが変更の目的を表し、曖昧語だけで終わっていない

### 5. 起票
1. タイトル案と本文案を作成したら、まず PR 本文ファイルを作成します。
```bash
# 起票用の本文ファイルを作る
mkdir -p tmp
pr_body_file="tmp/pr_body_$(date +%Y%m%d_%H%M%S).md"
cat <<'EOF' > "$pr_body_file"
<PR_BODY>
EOF
echo "PR本文ファイル: $pr_body_file"
```
2. ユーザーへの事前確認なしで、作成した本文を最終版とします。
3. 起票直前に手順1と同じ所有者付き head で open PR を再検索します。既存 PR があれば base と URL を報告して停止し、API 取得に失敗した場合も起票しません。
```bash
existing_prs="$(gh api -X GET "repos/$origin_repo/pulls" -f state=open -f head="${origin_repo%%/*}:$branch_name" --jq '.[] | [.base.ref, .html_url] | @tsv')" || exit 1
if [[ -n "$existing_prs" ]]; then
	echo "既存PRがあります (base / URL): $existing_prs" >&2
	exit 1
fi
```
4. 指定されたステータスに応じて起票します。
```bash
# 既定（Ready for review）
gh pr create --base main --title "<PR_TITLE>" --body-file "$pr_body_file"

# Draft が指定された場合
gh pr create --base main --title "<PR_TITLE>" --body-file "$pr_body_file" --draft
```
5. 起票後に本文ファイルは削除します。

## PR 本文テンプレート
```markdown
## 背景
- この変更が必要な理由
- 関連する制約・前提

## 変更内容
- 変更点をテーマごとに要約
- 必要なら主要ファイルを列挙

## コミットからの補足
- コミット本文にある判断理由・設計意図・注意点

## テスト
- 実施済み確認（コミット本文由来）
- 追加で必要な確認
- `npm run lint` / `npm run build` / `npm run test:run` の結果
- 必要な場合は `npm run test:rules:emulator` の結果
- 手動確認の手順と結果

## リスクと影響範囲
- 影響を受ける機能
- リリース/運用上の注意
```

## 判断ルール（分岐）
- 会話履歴の利用が指示され、かつ具体的な意図がある場合: コミット本文より優先して背景・ゴールへ反映
- 会話履歴の利用が指示されていない場合: 指定された参照ファイル・引数を最優先の根拠にする
- コミット本文が薄い場合: 差分読解を主にし、不明点は対話相手がいれば質問し、いなければ推測である旨を明示する
- コミットが多すぎる場合: まずテーマ分類（機能追加/修正/リファクタ/テスト）してから要約
- マージコミットが含まれる場合: 原則除外し、実変更コミットを優先して要約
- `gh` が失敗した場合、未認証の場合: PR本文まで生成し、起票コマンドのみ提示
- PR ステータスが指定されない場合: Ready for review を既定とする

## 完了条件
- `origin/main..HEAD` のコミット情報と指定された根拠を基に PR タイトルと本文が完成している
- PR 本文ファイルが作成され、コミット本文・参照ファイルの背景情報が反映されている
- ユーザー確認なしに、指定されたステータス（既定は Ready for review）で `gh pr create` まで実行できている（または実行不能理由を明示している）
