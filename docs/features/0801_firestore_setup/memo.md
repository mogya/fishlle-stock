今このプロジェクトはlocalStorageを使っているが、
家族共有ができないのみならず、自分のスマホとPCすら共有できないことが分かったので、データベースを使うようにする。
このブランチでは、Firebaseを利用するのに必要な設定や環境整備を行う

# データベース選定

データベースとしてはFirestoreとSupabaseを検討した。

## Supabase

- PROS: 2プロジェクトまで無料で使え、ホビープロジェクトであるこのプロジェクトのコスト感覚にあっている
- CONS: postgresqlとはいうものの、フロントエンドから使うための概念は独特で、実質的に新しい技術を導入しているに近い
- CONS: 非アクティブだと一時停止という制限がある

## Firestore
- PROS: Blaze plan でも無料枠があり、ホビープロジェクトであればほぼ無料か数百点程度に収まりそう
- PROS: 非アクティブだと一時停止といった制限はない
- PROS: GoogleログインやGemini導入が同じFirebaseで実現できる
- PROS: Google Cloudは他のプロジェクトで導入済みのため、管理対象が増えない
- CONS: 新しい技術導入である点は同じ
- CONS: クエリ設計と集計の弱さ。複雑な集計などをやり始めると辛くなることが予想される
  - このプロジェクトでは、商品数は「冷凍庫に入る個数」という上限があるため、そんなに複雑な検索やソートは必要にならないと判断した

今考えている未来像が「在庫を軸に、少量のレシピ情報を引いて、AIチャットで提案する」で、
これは SQL の強みである複雑な JOIN や集計より、ユーザーごとの小さなJSONデータ + レシピ文書 + AI用の検索/前処理 のほうが中心になると判断し、Firebaseに決定した

# Firebaseプロジェクトの作成

```
mogya@itamen:~/develop/fishlle-stock$ firebase projects:create fishlle-stock-mogya -n "fishlle-stock"
✔ Creating Google Cloud Platform project
✔ Adding Firebase resources to Google Cloud Platform project

🎉🎉🎉 Your Firebase project is ready! 🎉🎉🎉

Project information:
   - Project ID: fishlle-stock-mogya
   - Project Name: fishlle-stock

Firebase console is available at
https://console.firebase.google.com/project/fishlle-stock-mogya/overview
mogya@itamen:~/develop/fishlle-stock$ firebase init

     ######## #### ########  ######## ########     ###     ######  ########
     ##        ##  ##     ## ##       ##     ##  ##   ##  ##       ##
     ######    ##  ########  ######   ########  #########  ######  ######
     ##        ##  ##    ##  ##       ##     ## ##     ##       ## ##
     ##       #### ##     ## ######## ########  ##     ##  ######  ########

You're about to initialize a Firebase project in this directory:

  /home/mogya/develop/fishlle-stock

✔ Which Firebase features do you want to set up for this directory? Press Space to select features, then Enter to confirm your choices. Firestore: Configure security 
rules and indexes files for Firestore

=== Project Setup

First, let's associate this project directory with a Firebase project.
You can create multiple project aliases by running firebase use --add, 

✔ Please select an option: Use an existing project
✔ Select a default Firebase project for this directory: fishlle-stock-mogya (fishlle-stock)

=== Firestore Setup
i  firestore: ensuring required API firestore.googleapis.com is enabled...
⚠  firestore: missing required API firestore.googleapis.com. Enabling now...
✔ Please select the location of your Firestore database: asia-northeast2

Firestore Security Rules allow you to define how and when to allow
requests. You can keep these rules in your project directory
and publish them with firebase deploy.

✔ What file should be used for Firestore Rules? firestore.rules

Firestore indexes allow you to perform complex queries while
maintaining performance that scales with the size of the result
set. You can keep index definitions in your project directory
and publish them with firebase deploy.

✔ What file should be used for Firestore indexes? firestore.indexes.json
✔  Wrote firestore.rules
✔  Wrote firestore.indexes.json

=== Agent Skills Setup
If you are using an AI coding agent, Firebase Agent Skills make it an expert at Firebase.
✔ Would you like to install agent skills for Firebase? Yes
i  Installing Agent skills in the background...
✔  Agent skills installation started

✔  Wrote configuration info to firebase.json
✔  Wrote project information to .firebaserc

✔  Firebase initialization complete!

mogya@itamen:~/develop/fishlle-stock$ firebase init auth

     ######## #### ########  ######## ########     ###     ######  ########
     ##        ##  ##     ## ##       ##     ##  ##   ##  ##       ##
     ######    ##  ########  ######   ########  #########  ######  ######
     ##        ##  ##    ##  ##       ##     ## ##     ##       ## ##
     ##       #### ##     ## ######## ########  ##     ##  ######  ########

You're about to initialize a Firebase project in this directory:

  /home/mogya/develop/fishlle-stock

Before we get started, keep in mind:

  * You are initializing within an existing Firebase project directory


=== Project Setup

First, let's associate this project directory with a Firebase project.
You can create multiple project aliases by running firebase use --add, 

i  Using project fishlle-stock-mogya (fishlle-stock) .

=== Authentication Setup
✔ Which providers would you like to enable? If you don't see a provider here, go to the Firebase Console to set it up. Google Sign-In

Configuring Google Sign-In...
✔ What display name would you like to use for your OAuth brand? fishlle-stock
✔ What support email would you like to register for your OAuth brand? mogya@mogya.com
✔  Wrote configuration info to firebase.json

Generated firebase.json with auth configuration.
Run firebase deploy to enable these providers.

=== Agent Skills Setup
If you are using an AI coding agent, Firebase Agent Skills make it an expert at Firebase.
✔ Would you like to install agent skills for Firebase? Yes
i  Installing Agent skills in the background...
✔  Agent skills installation started

✔  Wrote configuration info to firebase.json
✔  Wrote project information to .firebaserc

✔  Firebase initialization complete!
mogya@itamen:~/develop/fishlle-stock$ firebase firestore:databases:list
No databases found.
mogya@itamen:~/develop/fishlle-stock$ firebase firestore:databases:create "(default)" --location asia-northeast2 --edition standard
Successfully created projects/fishlle-stock-mogya/databases/(default)
Please be sure to configure Firebase rules in your Firebase config file for
the new database. By default, created databases will have closed rules that
block any incoming third-party traffic.
Your database may be viewed at https://console.firebase.google.com/project/fishlle-stock-mogya/firestore/databases/-default-/data
mogya@itamen:~/develop/fishlle-stock$ firebase deploy --only firestore

=== Deploying to 'fishlle-stock-mogya'...

i  deploying firestore
i  firestore: ensuring required API firestore.googleapis.com is enabled...
i  firestore: ensuring required API firestore.googleapis.com is enabled...
i  firestore: reading indexes from firestore.indexes.json...
i  cloud.firestore: checking firestore.rules for compilation errors...
✔  cloud.firestore: rules file firestore.rules compiled successfully
i  firestore: uploading rules firestore.rules...
i  firestore: deploying indexes...
✔  firestore: deployed indexes in firestore.indexes.json successfully for (default) database
✔  firestore: released rules firestore.rules to cloud.firestore

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/fishlle-stock-mogya/overview
```

firestore.rulesの作成

- 認証必須
- household の作成は ownerUid が自分自身の場合のみ許可
- household の参照・更新・削除は、その household の members に自分の uid がある場合のみ許可
- members の作成・更新は household オーナーのみ許可
- members の削除は household オーナー、または自分自身の退出のみ許可
- items の読み書きは household メンバーのみ許可
- それ以外のパスは全拒否

```
mogya@itamen:~/develop/fishlle-stock$  cd /home/mogya/develop/fishlle-stock && firebase deploy --only firestore

=== Deploying to 'fishlle-stock-mogya'...

i  deploying firestore
i  firestore: ensuring required API firestore.googleapis.com is enabled...
i  firestore: ensuring required API firestore.googleapis.com is enabled...
i  firestore: reading indexes from firestore.indexes.json...
i  cloud.firestore: checking firestore.rules for compilation errors...
✔  cloud.firestore: rules file firestore.rules compiled successfully
i  firestore: uploading rules firestore.rules...
i  firestore: deploying indexes...
✔  firestore: deployed indexes in firestore.indexes.json successfully for (default) database
✔  firestore: released rules firestore.rules to cloud.firestore

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/fishlle-stock-mogya/overview
mogya@itamen:~/develop/fishlle-stock$ firebase apps:list
✔ Preparing the list of your Firebase apps
┌──────────────────┬───────────────────────────────────────────┬──────────┐
│ App Display Name │ App ID                                    │ Platform │
├──────────────────┼───────────────────────────────────────────┼──────────┤
│ Default Web App  │ 1:446445036597:web:6e4204f695328d21253d7c │ WEB      │
└──────────────────┴───────────────────────────────────────────┴──────────┘

1 app(s) total.
mogya@itamen:~/develop/fishlle-stock$ firebase apps:sdkconfig WEB 1:446445036597:web:6e4204f695328d21253d7c
✔ Downloading configuration data of your Firebase WEB app
{
  "projectId": "fishlle-stock-mogya",
  "appId": "1:446445036597:web:6e4204f695328d21253d7c",
  "storageBucket": "fishlle-stock-mogya.firebasestorage.app",
  :
```
