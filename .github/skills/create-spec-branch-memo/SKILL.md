---
name: create-spec-branch-memo
description: ユーザーが最初に説明した作業内容から mmdd_jobname 形式でブランチ名を自動決定し、origin/main から新規ブランチを作成して docs/features/ブランチ名/memo.md に指示文を保存します。キーワード： ブランチ作成, docs/features, memo.md, mmdd_jobname
argument-hint: 最初にチャットで説明された作業内容
disable-model-invocation: false
---

# Create Feature Branch Memo

## 目的
ユーザーの最初の指示を起点に、以下を一気通貫で実行します。
1. `mmdd_jobname` 形式のブランチ名を決める（ユーザー確認なし）
2. `origin/main` を最新化したうえで `git checkout -b <branch-name> origin/main` を実行する
3. `docs/features/<branch-name>/` を作る
4. `docs/features/<branch-name>/memo.md` にチャットの指示内容を貼り付ける

## いつ使うか
- 「ブランチを切ってメモまで作ってほしい」と依頼されたとき
- `docs/features/<branch-name>/memo.md` を起点にタスク管理したいとき

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
git fetch --prune origin
git checkout -b "${branch_name}" origin/main
```

ブランチ作成前チェック:
- ローカル同名ブランチの存在: `git show-ref --verify --quiet "refs/heads/${branch_name}"`
- リモート同名ブランチの存在: `git ls-remote --exit-code --heads origin "${branch_name}"`

### 4. features ディレクトリと memo.md を作成

```bash
spec_dir="docs/features/${branch_name}"
mkdir -p "${spec_dir}"
if [ -e "${spec_dir}/memo.md" ]; then
  echo "memo.md がすでに存在するため処理を終了します: ${spec_dir}/memo.md"
  exit 1
fi
printf '%s\n' "${memo_text}" > "${spec_dir}/memo.md"
```

補足:
- 既存ファイルを誤って上書きしないため、`memo.md` の存在確認を先に行ってから書き込みます。
- メモ本文はユーザーの初回指示を原文のまま保存し、解釈や要約は混ぜません。

## 分岐ルール
- すでに同名ブランチが存在する場合:
  - ユーザーに「同名ブランチが存在するため処理を終了した」旨を報告して終了する
- すでに `docs/features/<branch-name>/memo.md` が存在する場合:
  - ユーザーに「memo.md がすでに存在するため処理を終了した」旨を報告して終了する

## 完了条件
- 作業ブランチが `origin/main` から作成され、現在ブランチになっている
- `docs/features/<branch-name>/memo.md` が存在する
- `memo.md` に最初のチャット指示が保存されている
- 最終報告でブランチ名と生成ファイルパスを示す

## このリポジトリでの前提
- 実装本体は主に `src/` 配下にあるため、`memo.md` の次工程では `src/`, `src/lib/`, `src/types/` を優先して調査する。
- 検証の基本は `npm run lint` と `npm run build`、および手動動作確認。
