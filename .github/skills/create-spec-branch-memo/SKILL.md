---
name: create-spec-branch-memo
description: ユーザーが最初に説明した作業内容から yyyymmdd_jobname 形式でブランチ名を自動決定し、origin/main から新規ブランチを作成して docs/features/ブランチ名/memo.md に指示文を保存します。キーワード： ブランチ作成, docs/features, memo.md, yyyymmdd_jobname
argument-hint: 最初にチャットで説明された作業内容
disable-model-invocation: false
---

# Create Spec Branch Memo

## 目的
ユーザーの最初の指示を起点に、以下を一気通貫で実行します。
1. `yyyymmdd_jobname` 形式のブランチ名を決める（ユーザー確認なし）
2. `scripts/create_spec_branch <branch-name>` を実行する
3. スクリプトの成功後、`docs/features/<branch-name>/memo.md` にチャットの指示内容を記録する

## いつ使うか
- 「ブランチを切ってメモまで作ってほしい」と依頼されたとき
- `docs/features/<branch-name>/memo.md` を起点にタスク管理したいとき

## 手順
### 1. 入力の抽出
ユーザーの最初の説明文を `memo_text` として保持します。

### 2. ブランチ名を自動決定
現在日付を `yyyymmdd` で取得し、作業内容から短い英小文字スラッグ `jobname` を作って `yyyymmdd_jobname` にします。

命名ルール:
- 英小文字・数字・アンダースコアのみ
- 2語以上ならアンダースコア連結
- 全体で40文字以内
- 例: `20260630_prohibit_empty_proposal`, `20260630_proposal_converter`
- ユーザー確認は取らずに決定する

### 3. ブランチと空の memo.md を作成
作業名を決めたら、次のスクリプトを実行します。ブランチ作成とファイル生成はスクリプトに任せます。

```bash
scripts/create_spec_branch "${branch_name}"
```

### 4. memo.md に指示内容を記録
スクリプトが成功し、指定したブランチへ移動したことと `memo.md` の存在を確認してから、`memo_text` を `memo.md` に書き込みます。記録内容は元のチャット指示を復元できるものにします。

```bash
feature_dir="docs/features/${branch_name}"
printf '%s\n' "${memo_text}" > "${feature_dir}/memo.md"
```

## 分岐ルール
- すでに同名ブランチが存在する場合:
  - スクリプトのエラーをそのまま扱い、ユーザーに「同名ブランチが存在するため処理を終了した」旨を報告して終了する
- すでに `docs/features/<branch-name>/` が存在する場合:
  - スクリプトのエラーをそのまま扱い、ユーザーに「feature ディレクトリがすでに存在するため処理を終了した」旨を報告して終了する
- スクリプトが失敗した場合:
  - `memo.md` への記録を行わず、失敗理由を報告して終了する

## 完了条件
- 作業ブランチが `origin/main` から作成され、現在ブランチになっている
- `docs/features/<branch-name>/memo.md` が存在する
- `memo.md` に最初のチャット指示が保存されている
- 最終報告でブランチ名と生成ファイルパスを示す
