# 調査観点

以下は調査の入口であり、キーワード検出だけで判定しない。変更の正当な用途と不正利用の両方を検討する。

| 観点 | 読む場所・確認する変化 |
| --- | --- |
| 実行入口 | `action.yml` / `action.yaml` の using、pre/main/post、条件、composite の run/uses、Docker entrypoint |
| 生成物 | `dist/` のコードだけの変更、srcと不釣り合いな追加、source mapとの不一致。minify・依存更新という説明だけで省略しない |
| 認証情報 | process.env、GitHub context、runner のファイル、`.git/config`、credential helper、SSH agent、クラウド資格情報、OIDC |
| 情報の出力 | HTTP/DNS等の送信、URL・ヘッダー・本文、標準出力、エラー、artifact/cache。エンコードしてから送信する経路も追う |
| 動的実行 | eval/Function、child_process、shell、base64等の復号、curl/wget後の実行、ダウンロード先やハッシュ検証の変更 |
| 条件付き動作 | 特定repo、ブランチ、日付、イベント、秘密情報の有無でのみ動くコード、post時だけの処理 |
| 永続化・改ざん | PATH/GITHUB_ENV/GITHUB_OUTPUT、後続step用ファイル、Git設定、ビルド成果物、cacheへの書き込み |
| 外部依存 | compositeの別Action、install script、package lock更新、固定されていないURL・コンテナ・release asset |
| repositoryの信頼 | owner/repoの置換、ID変更、同じrefのSHA変更、履歴の不連続。祖先関係は浅い取得から推定しない |

## 実行経路の最低確認

- workflow に書かれた `owner/repo/path@ref` と lockfile の repository 単位のエントリを対応させる。`actions/cache/restore` のような入口をルートの `action.yml` だけで済ませない。
- npm依存が生成物にbundleされていれば、その変更もコードとして読む。外部で install される依存の配布物は初版では未解析とする。
- 変更された関数の入力元と呼び出し箇所を読む。例としてURLが増えただけなら、テストfixtureか実行時の送信先かを区別する。
- symlink はリンク先文字列とtree内の参照先を確認する。作業ディレクトリへリンクを展開しない。tree外への参照は未追跡として扱う。
- 削除が危険になる場合もある。署名検証・マスキング・通信制限の削除や権限拡大を確認する。

## 指摘の品質

「ネットワーク通信が増えた」だけで終えず、読み取った値、送信先、到達条件、利用側の露出を示す。
悪意のあるアカウント侵害だと断定するには別の証拠が必要。コード上の疑わしい挙動と、攻撃者の意図の推定を混ぜない。
署名・provenance・immutable release は改変や出所の証拠であり、発行者自身や侵害されたアカウントが公開したコードの無害性を保証しない。
