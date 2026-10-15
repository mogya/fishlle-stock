テストを追加する

# 検討

今の構成なら、第一候補は「Vitest + React Testing Library + jsdom」です。  
理由は、Vite + TypeScript + React との相性が最もよく、設定が軽く、ユニットから画面テストまで同じランナーで回せるためです。

**おすすめ構成**
1. 単体・コンポーネントテスト:
- Vitest
- React Testing Library
- @testing-library/user-event
- @testing-library/jest-dom
- jsdom

2. 将来の E2E:
- Playwright（まずは後回しで OK）

3. Firebase 連携が増えたら:
- MSW（HTTP モック）
- もしくは Emulator 接続の統合テスト

**まずテストすべき場所（優先順）**
1. パーサーの仕様固定  
対象: stockParser.ts  
- 正常系: 「商品名:数量」を複数行で渡して配列化できる  
- 全角コロン対応: 「：」でも通る  
- 空行スキップ  
- 同名商品の数量合算  
- 異常系: コロンなし、商品名空、数量が 0/負数/小数/文字列  
- 複数エラーを改行連結で返す挙動

2. ストレージ入出力の安全性  
対象: stockStorage.ts  
- localStorage が空なら空配列  
- JSON が壊れていても空配列で復帰  
- 配列以外の JSON なら空配列  
- save で例外が出ても落ちない

3. 在庫アイテム生成の不変条件  
対象: stockItemFactory.ts  
- id が生成される  
- remainingCount が入力 count と一致  
- createdAt/updatedAt が ISO 文字列  
- createdAt と updatedAt が初期は同値

4. 画面の主要フロー  
対象: App.tsx  
- 登録成功で一覧に追加される  
- 不正入力でエラー表示、追加されない  
- 「食べた」で残数が減る  
- 残数 0 で一覧から消える  
- 受取日昇順ソートが効く

**導入ステップ（小さく始める）**
1. まずはユニット中心
- stockParser
- stockStorage
- stockItemFactory

2. 次に App の主要 2〜3 ケース
- 登録成功
- バリデーションエラー
- 食べた操作

3. 最後に必要なら Playwright を追加

# テストの導入

テスト基盤を導入しPR品質ゲートにlint・test・buildを組み込む

- Vitest + React Testing Library + jsdom を導入し、テスト実行スクリプト test / test:run を package.json に追加
- vite.config.ts を vitest/config ベースへ変更し、jsdom 環境と src/test/setup.ts（jest-dom と cleanup）を設定
- tsconfig.app.json に vitest/globals と @testing-library/jest-dom の型定義を追加
- 単体/コンポーネントの初期テスト雛形を追加: src/lib/stockParser.test.ts, src/lib/stockStorage.test.ts, src/lib/stockItemFactory.test.ts, App.test.tsx
- PR 用 GitHub Actions を追加・拡張: pr-test.yml で pull_request 時に npm ci → npm run lint → npm run test:run → npm run build を実行

# ruleテストの追加

Firestore移行準備としてセキュリティルールテスト基盤を追加しPR品質ゲートへ統合

- LocalStorage から Firebase への切り替え予定と、既存ルールの継続的検証を目的に、Firestore ルールテストの実行基盤を追加
- ルールテスト用スクリプトを追加し、エミュレータ経由で再現可能に整備
- ルールテスト本体を新規追加し、未認証アクセス拒否、世帯作成条件、メンバー読取可否、items 書込可否、メンバー削除権限など主要な認可ケースをカバー
- 通常のフロント側テスト実行と干渉しないよう、ルールテスト専用の Vitest 設定を分離し、通常テスト側は除外設定を安全に拡張
- Node 組み込みモジュール参照に必要な型定義を追加してビルド整合性を確保
- PR ワークフローに Firestore ルールテスト実行ステップを追加し、既存の lint・test・build と合わせて品質ゲートを強化
- README にテスト実行手順とルールテスト手順を追記
