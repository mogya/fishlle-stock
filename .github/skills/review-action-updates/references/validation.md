# スキル変更時の検証方法

## 自動検証

リポジトリのルートから実行する。Firebase Emulator やアプリは起動しない。

```bash
npm run test:scripts
npm run lint
npm ci --prefix .github/skills/review-action-updates/scripts --ignore-scripts --no-audit --no-fund
node --test .github/skills/review-action-updates/scripts/prepare.test.cjs
```

テストは収集・前処理の検証であり、LLMによる検出率、プロンプトインジェクション耐性、安全性を保証しない。
スキルを変更した際は、危険なfixtureの実行入口から情報の取得元・送信先まで追い、
「要確認の変更あり」と報告できるかも手動で確認する。

前処理テストは整形差分、元位置、巨大な一行の分割、UTF-8文字の保持、追加・削除、
バンドルだけへの混入、改ざんされたmap、欠落sourcesContent、範囲外の座標、
不正なJavaScript、パス逸脱、blobの改ざん、上書き拒否と非ゼロ終了を検証する。
対象コードの実行や、ソースマップを根拠としたバンドル差分の除外が起こらないことも確認する。
出力の読み方と制限は [bundle-preparation.md](bundle-preparation.md) を参照。
