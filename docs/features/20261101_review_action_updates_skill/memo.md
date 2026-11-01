 

# 課題と対応方針

GitHub Actions を gh-actions-lock でコミット SHA に固定すると、タグやブランチが書き換えられても、次回の実行で更新が無条件に取り込まれることを防げる。
一方、Action の開発者アカウントが侵害されるなどして、正規の更新に攻撃コードが混入した場合、その更新自体は Dependabot の PR として届く可能性がある。
`actions.lock` の差分には SHA の値変更しか現れないので、その変更が安全なものであるかを見て判断することは出来ない。

既存の Dependabot Impact Analysis は、リリースノートや CHANGELOG を使って更新の影響を調べる。そのため、説明に記載されていない不正なコード変更を見つけるには、実際に実行されるコードの調査が必要である。

dengen_map#798 で作成した仕組みを、fishlle-stock の構成（Node.js / Vitest）に合わせて移植する。
そこで、まず GitHub Actions の更新に対象を絞り、`actions.lock` の旧 SHA と新 SHA から上流コードを収集し、セキュリティの観点でレビューする review-action-updates スキルを作成する。

補助スクリプトが旧新コードの差分とファイル本文を収集し、スキルが Action の実行入口から生成済み JavaScript、外部通信、認証情報の扱いなどを調査する。
結果は、根拠となるコードや利用側の権限とともに報告し、取得できなかった部分や未確認の範囲も明示する設計とした。対象コードを実行せずに調査し、収集成功を安全性の保証とは扱わない。

## 範囲外

この仕組みは、人が更新を判断するための材料を揃えるもの。
静的な調査には見落としがあり、元から存在する悪意も差分だけでは除外できない。
npm にも同じ問題があるが、それらは実際に配布されるパッケージの比較が必要なため、今回の対象外とした。

## fishlle-stock への移植

fishlle-stock には Ruby の実行環境がないため、dengen_map の `collect.rb` を Node.js の標準モジュールだけで動く `collect.mjs` に移植した。
GitHub Actions 上でも `npm ci` をせずに実行できるよう、lockfile の YAML は外部パッケージを使わず、`actions.lock` に必要な範囲だけを解釈する限定パーサーで読む。
anchor / alias、重複キー、型が曖昧なスカラーなどは dengen_map 版と同様に失敗扱いにする。
RSpec のテストは Vitest へ移植し、jsdom を使うアプリのテストと分けて `vitest.scripts.config.ts`（`npm run test:scripts`）で Node 環境として実行する。

## 初版の検証記録

### 自動検証の対象

テストは一時ディレクトリに二つの Git リポジトリ（利用側・Action側）を作る。
実際にコミット・fetch・tree比較・本文保存を行い、ネットワークには接続しない。

- 通常の更新、生成物だけの変更、未変更の実行入口の収集。
- 環境変数を外部へ送る検証用コードと、分析方針を変えようとするコメントが証拠に残ること。対象コードが実行されないこと。
- `.gitattributes` で diff を無効化したJavaScriptも差分に含まれること。
- symlink が展開されず、リンク先文字列として保存されること。
- 分岐した履歴の旧新tree直接比較、同一refのSHA変更、IDだけの変更。
- 追加・削除、複数バージョン、workflowだけの変更、未コミット変更の除外。
- 取得失敗、サイズ超過、binary/LFS、未対応lockfile、YAMLの曖昧な入力が成功扱いされないこと。
- 既存証拠の上書き拒否、コマンドの出力制限とタイムアウト。

これらは収集処理の検証であり、LLMによる検出率、プロンプトインジェクション耐性、安全性を保証するものではない。

### 検証用コードの手動調査

初版ではこのfixtureにもスキルを手動適用した。`action.yml` → `dist/index.js` →
`process.env.GITHUB_TOKEN` をPOST本文へ渡す箇所と、利用側workflowの環境変数設定まで追い、
「要確認の変更あり」と判定した。送信先の `.invalid` は検証用であり、送信成功は実証していない。
symlinkは実行経路に含まれないことを区別し、承認を求めるコード内コメントを指示として扱わなかった。

### 公開Actionからの取得確認

初版の作成時に、利用側のlockfileを模した一時Gitリポジトリを用意し、次を HTTPS で取得した。
実際の fishlle-stock のlockfileは変更していない。

- `actions/checkout@v7.0.0`: `9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0`
- `actions/checkout@v7.0.1`: `3d3c42e5aac5ba805825da76410c181273ba90b1`
- `source_mode: github_https`、`collection_status: complete`、差分全文 約 210,000 bytes を確認した。
- これはネットワーク取得と証拠生成の確認。この更新の全面的なセキュリティ監査は行っていない。

## PR への自動レビュー

Dependabot に限定せず `actions.lock` が変更された PR を対象とし、作成・更新・再オープン時にレビューする。PR 番号を指定した手動実行にも対応する。結果は人が判断するための PR コメントとして投稿し、自動承認・自動マージはしない。

PR のイベントはファイル数による paths フィルタの制限を避けるため全件受け、取得した固定 SHA 間で lockfile に差分がある場合だけ収集・レビューする。

workflow の信頼済み revision からスキルと収集スクリプトを使い、PR の head は checkout や実行をせず固定 SHA で証拠を収集する。利用側 workflow と `.github/actions` のファイルも blob として保存し、Copilot CLI には読み取りツールのみを許可する。追加取得が必要な範囲は未確認として扱う。レビューとコメント投稿は別ジョブにし、前者に PR 書き込み権限を渡さない。コメント直前に base/head を再確認し、古い結果を投稿しない。

収集が不完全なときはコメントに明示する。GitHub Actions 上での実行には Copilot CLI を利用できる権限が必要で、解析や投稿のエラーは workflow の失敗として扱う。

検証では、収集処理と workflow の分岐・投稿条件を Vitest で確認し、oxlint、workflow に actionlint、lockfile に `gh actions-lock --verify` を実行した。Copilot CLI の制限付き非対話実行は dengen_map での確認結果を踏襲し、fishlle-stock では未確認。GitHub Actions 上での実 PR への投稿も未実施。
