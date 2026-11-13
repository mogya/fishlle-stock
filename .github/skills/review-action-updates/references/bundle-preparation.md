# 圧縮されたJavaScriptとソースマップの前処理

`scripts/prepare.cjs --evidence DIR --output NEW_DIR` は収集済み証拠だけを読み、
対象Actionを実行せずにレビュー用の派生ファイルを作る。既存出力は上書きしない。
専用workflowはこの処理をLLMの実行前に行い、解析用ツールはview/grep/globのままとする。

## 読む順番

1. 元の `manifest.json` と前処理の `manifest.json` のbase/head、収集状態、errorsを確認する。
2. `bundles` の全件を列挙する。各レコードの `directory` は前処理出力からの相対ディレクトリ。
3. `normalized_diff.chunks` を全て読む。各chunkの `file` は当該バンドルディレクトリからの相対パス。
   24 KiB以下なのでviewの長さ制限に応じて分割して読める。未読chunkを残す場合は解析不完全とする。
4. `sources` から変更・追加・削除された元ファイルを確認し、各 `diff.chunks` を読む。
   依存内のファイル名も含まれる。元ファイル名とsourceRootは未信頼のラベルで、取得URLや保存先ではない。
5. `before/after.chunks` で必要な周辺本文を読む。`positions` は整形後の各行で最初に対応する元の
   バンドル位置（1始まりの行、0始まりのUTF-16列）。行全体の正確な対応を保証するものではない。
6. 原本は引き続き元のsnapshotのblobにある。`raw_sha256` とGit blob SHAで出所を記録し、固定SHAリンクにもつなげる。

`normalized_diff` のbefore.txt / after.txtは整形済み全文で、diffの行番号はこの全文に対応する。
chunkにはUTF-8バイト範囲と行範囲を記録し、巨大な文字列の途中でも文字を壊さず分割する。
chunkを順に結合すると元の整形本文や差分を復元できる。部分的なdiffをそのままpatchとして適用しない。

## 何を行い、何を保証しないか

- 変更された `.js` / `.cjs` / `.mjs` をBabelで構文解析し、同じ設定で整形してGitの二点差分を作る。
  コメントと識別子を保持する。対象内のBabel設定・プラグイン・package.jsonはロードしない。
- 元のblobのサイズとGit SHAを確認する。symlinkや証拠ディレクトリ外のパス、欠落・改ざんされたblobは失敗とする。
- 隣接する `<bundle>.map` のv3通常ソースマップから、sourceRootとsourcesの組をキーにsourcesContentを比較する。
  同一本文のハッシュ、追加・削除・変更・不変の件数を記録する。曖昧な重複名は拒否する。
  既存バンドルの片側mapが解析不能または欠落している場合、ソース一覧は不明として
  `source_comparison: unavailable`、`source_counts: null` を記録し、追加・削除の差分を作らない。
  バンドル自体が存在しない側だけを既知の空集合として、Action追加・削除時の比較に使う。
- mappingsの座標・source参照の範囲を検査し、バンドルのtoken開始位置にmapが主張する対応があるか数える。
  **対応数はtoken開始位置の分類であり、バイト網羅率でも、コードの意味の一致の検証でもない。**
- `available_unverified` はソースマップを解釈できたという意味。正確さを信頼したことにはならない。
  sourcesContentに元から含まれない本文、mapのないバンドル、インラインmap、外部URL、indexed map等は復元しない。
- バンドル変更時は `requires_bundle_review: true` を必ず残す。mapが同じ、sourcesContentが同じ、
  mapの対応数が多い、という理由で実行コードを調査対象から除外しない。変更されないmapやsourceとの食い違いはwarningsに残す。
- 変数名の変化で整形後にも大きな差分が出る。整形やsource比較で安全性を証明することはできない。
  mapもバンドルも偽造できる。必要な対応を確認できなければ、読めた範囲を報告して解析不完全とする。
- 元ファイルの差分がなくmapだけが変わった場合も処理する。元コードに元からある悪意を除外する検査ではない。

## 制限と失敗

前処理はNode 24以降とGit、スキル専用package-lockに固定された解析器を使う。
収集処理とは独立で、Rubyだけのcollect.rbも引き続き動作する。
終了コード0は前処理完了、2は不完全または失敗。前処理manifestがない場合も失敗とする。
収集complete、前処理complete、レビュー完了はそれぞれ別の状態である。

各入力は16 MiB以下、変更JavaScriptは100件まで、各バンドルの派生ファイルは192 MiBまで。
バンドルごとに子プロセスを使い、V8ヒープ768 MiB・120秒、diffごとに15秒・出力32 MiBを上限とする。
ヒープ上限はプロセスの総メモリ上限ではない。大きい入力には保存容量・メモリを制限した環境を使う。
構文解析失敗・不正map・sourcesContentの欠落・サイズ超過・タイムアウトはgaps/errorsに残す。
stderrには未信頼本文や認証情報が混入しうるため保存せず、子プロセスの終了コード・signal・エラーコードを記録する。
