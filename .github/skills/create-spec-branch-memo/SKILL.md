---
name: create-spec-branch-memo
description: ユーザーが最初に説明した作業内容から mmdd_jobname 形式でブランチ名を自動決定し、origin/develop から新規ブランチを作成して docs/specs/ブランチ名/memo.md に指示文を保存します。キーワード： ブランチ作成, docs/specs, memo.md, mmdd_jobname
argument-hint: 最初にチャットで説明された作業内容
disable-model-invocation: false
---

# Create Spec Branch Memo

## 目的
ユーザーの最初の指示を起点に、以下を一気通貫で実行します。
1. `mmdd_jobname` 形式のブランチ名を決める（ユーザー確認なし）
2. `git fetch --prune && git checkout -b <branch-name> origin/develop` を実行する
3. `docs/specs/<branch-name>/` を作る
4. `docs/specs/<branch-name>/memo.md` にチャットの指示内容を貼り付ける

## いつ使うか
- 「ブランチを切ってメモまで作ってほしい」と依頼されたとき
- `docs/specs/<branch-name>/memo.md` を起点にタスク管理したいとき

## 手順
### 1. 入力の抽出
ユーザーの最初の説明文を `memo_text` として保持します。

### 2. ブランチ名を自動決定
現在日付を `mmdd` で取得し、作業内容から短い英小文字スラッグ `jobname` を作って `mmdd_jobname` にします。

命名ルール:
- 英小文字・数字・アンダースコアのみ
- 2語以上ならアンダースコア連結
- 例: `0630_prohibit_empty_proposal`, `0630_proposal_converter`, `0715_postgresql_backup`
- ユーザー確認は取らずに決定する

### 3. Git ブランチを作成して移動
必ず次の形で実行します。

```bash
git fetch && git checkout -b "${branch_name}" origin/develop
```

### 4. specs ディレクトリと memo.md を作成

```bash
spec_dir="docs/specs/${branch_name}"
mkdir -p "${spec_dir}"
printf '%s\n' "${memo_text}" > "${spec_dir}/memo.md"
```

## 分岐ルール
- すでに同名ブランチが存在する場合:
  - ユーザーに「同名ブランチが存在するため処理を終了した」旨を報告して終了する
- すでに `docs/specs/<branch-name>/memo.md` が存在する場合:
  - ユーザーに「memo.md がすでに存在するため処理を終了した」旨を報告して終了する

## 完了条件
- 作業ブランチが `origin/develop` から作成され、現在ブランチになっている
- `docs/specs/<branch-name>/memo.md` が存在する
- `memo.md` に最初のチャット指示が保存されている
- 最終報告でブランチ名と生成ファイルパスを示す
