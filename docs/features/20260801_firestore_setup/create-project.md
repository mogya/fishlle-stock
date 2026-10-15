今このプロジェクトはlocalStorageを使っているが、
家族共有ができないのみならず、自分のスマホとPCすら共有できないことが分かったので、Firestoreをいれたい。
必然的にFirebase Authentication、Firebaeプロジェクトの作成も必要になる

1. **Firebaseプロジェクト作成**
   - 表示名: `fishlle-stock`
   - プロジェクトID: `fishlle-stock` を含む取得可能な文字列
     - プロジェクトIDはグローバル一意なので、取れなければ `fishlle-stock-mogya` など、取得できるものを利用する

2. **Firebase CLI設定をリポジトリに入れる**
   - `firebase.json`
   - `.firebaserc`
   - `firestore.rules`
   - `firestore.indexes.json`
   - 必要なら `scripts/firebase-bootstrap.sh` など

   Security Rulesをファイル化しておけば、PRレビューでちゃんと見られます。これはかなり良い判断です。Firebase CLIでもFirestore Rulesは `firebase deploy --only firestore` でデプロイ対象にできます。  
   参考: [Firebase CLI reference](https://firebase.google.com/docs/cli)

3. **Firestore作成**
   - database: `(default)`
   - mode: Native Mode
   - location: `asia-northeast2`. 大阪リージョンです。
   参考: [Firestore locations](https://firebase.google.com/docs/firestore/locations)

4. **Firebase Authentication**
   - Googleログインを有効化
   - 最近のFirebase CLIではAuth provider設定も扱えますが、GoogleログインはOAuth同意画面・サポートメール・承認済みドメインなど、Console確認が絡むことがあります。
   - なので「CLIでできるだけコード化、初回だけConsole確認が残るかも」くらいに見ておくのが現実的です。  
   参考: [Firebase Google Sign-In](https://firebase.google.com/docs/auth/web/google-signin)

5. **データモデル**
   家族共有前提なら、最初からこれがよさそうです。

   ```text
   households/{householdId}
   households/{householdId}/members/{uid}
   households/{householdId}/items/{itemId}
   ```

   `users/{uid}/items` にしてしまうと、あとで家族共有を足すときに設計をひっくり返しがちです。

6. **Security Rules**
   まず守るべきルールはシンプルで、

   - ログイン済みユーザーだけアクセス可能
   - 自分が `members` に入っている `household` だけ読める
   - 在庫追加・更新・削除も、その `household` のメンバーだけ可能

   という形です。

一点だけ追加で考えるなら、**Firebaseプロジェクトを作るスクリプトは「一回だけ実行するbootstrap」、Rulesやindexesの反映は「何度でも実行するdeploy」**に分けた方がきれいです。プロジェクト作成は再実行に弱いので、レビュー対象としてはコマンドを残しつつ、日常的には `firebase deploy --only firestore,auth` みたいな運用に寄せるのが扱いやすいです。
