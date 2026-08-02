先のPRで、firebase環境の導入を行った。
このブランチでは、開発用のFirebase Local Emulator Suiteの導入を行い、ローカルと本番/stagingを使い分ける開発体制をつくる

# 背景

現在プロジェクトは、DBとしてlocalStorageを用いたフロントエンドをGitHub Pagesにデプロイしている。
localStorageだとスマホとPC、家族間で共有ができないため、Firebaseを導入し、ログインすれば同じ物が見られる環境への移行を目指している。
localStorageはブラウザに付属しているので、特に開発環境を整えなくても手元で動作確認することが出来た。

Firebaseに移行すると、そういうわけには行かなくなる。クラウド環境であるため、環境は一つしか存在しない。
本番環境で動作確認を行うことは適切でないので、開発環境が必要となる。

また、先のPRではこの点を詰めきれていなかったため、環境変数を本番/開発でどう使い分けるかの点が不完全なままとなっている。

- firebase emulatorsを導入してローカル開発環境を整える
- 本番をfirebase Hostingに移行する
- もう一つfirebase projectを作成し、PRをstaging環境として動作確認できるようにする
- development(firebase emulators)/ staging / production による開発体制を確立する

# firebase emulatorsの導入

```
mogya@itamen:~/develop/fishlle-stock$ firebase init emulators

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

=== Emulators Setup
✔ Which Firebase emulators do you want to set up? Press Space to select emulators, then Enter to confirm your choices. Authentication Emulator, Firestore Emulator
i  Port for auth already configured: 9099
i  Port for firestore already configured: 8080
i  Emulator UI already enabled with port: (automatic)
✔ Would you like to download the emulators now? Yes

=== Agent Skills Setup
If you are using an AI coding agent, Firebase Agent Skills make it an expert at Firebase.
✔ Would you like to install agent skills for Firebase? Yes
i  Installing Agent skills in the background...
✔  Agent skills installation started

✔  Wrote configuration info to firebase.json
✔  Wrote project information to .firebaserc

✔  Firebase initialization complete!
```

開発環境として firebase emulatorを使う設定

サーバは引き続きVite サーバーをつかい、Auth / Firestore の Emulatorに接続する構成

```
$ sudo apt install default-jre -y
```

```
mogya@itamen:~/develop/fishlle-stock$ firebase emulators:start --only auth,firestore
i  emulators: Starting emulators: auth, firestore
i  firestore: Firestore Emulator logging to firestore-debug.log
✔  firestore: Firestore Emulator was started in standard edition.
✔  firestore: Firestore Emulator UI websocket is running on 9150.

┌─────────────────────────────────────────────────────────────┐
│ ✔  All emulators ready! It is now safe to connect your app. │
│ i  View Emulator UI at http://127.0.0.1:4000/               │
└─────────────────────────────────────────────────────────────┘

┌────────────────┬────────────────┬─────────────────────────────────┐
│ Emulator       │ Host:Port      │ View in Emulator UI             │
├────────────────┼────────────────┼─────────────────────────────────┤
│ Authentication │ 127.0.0.1:9099 │ http://127.0.0.1:4000/auth      │
├────────────────┼────────────────┼─────────────────────────────────┤
│ Firestore      │ 127.0.0.1:8080 │ http://127.0.0.1:4000/firestore │
└────────────────┴────────────────┴─────────────────────────────────┘
  Emulator Hub host: 127.0.0.1 port: 4400
  Other reserved ports: 4500, 9150

Issues? Report them at https://github.com/firebase/firebase-tools/issues and attach the *-debug.log files.
```


# 意思決定：本番ホスティングをgithub pagesからfirebase hostingに変える

理由
- firebase入れるのなら揃えるのが自然
- まだ開発段階で、本番URLが変わったとて困る人はいない
- PRごとのプレビューURL自動デプロイが魅力的

注意点として、firebaseはプレビュー環境でも基本的には同じ Firebase project の実バックエンドリソースに接続する。
これはデータ破壊の不安があるので避けたい。

現在production(firebase)/develop(firebase emulator)の２環境体制だが、プレビュー環境として staging(firebase)を作ったほうが良さそう。

なのでステップを分けて進める
- 本番をfirebase hostingに移行(この段階ではプレビュー環境は使わない)
- staging(firebase)を作り、PRごとのプレビューURL自動デプロイを行うようにする

# 本番ホスティングをgithub pagesからfirebase hostingに変える

実施内容
1. Firebase Hosting 設定を追加
- firebase.json
- 追加内容: public を dist、SPA 用 rewrite を index.html へ設定

2. Vite の base を GitHub Pages 用から本番ルート向けへ変更
- vite.config.ts
- /fishlle-stock/ → /

3. CI を GitHub Pages から Firebase Hosting へ切替
- deploy.yml
- main push 時に build 後、Firebase CLI で hosting deploy する構成へ変更
- GitHub Secrets に FIREBASE_TOKEN が必要

検証結果
1. npm run build: 成功
2. firebase deploy --only hosting: 成功
3. 公開URL: https://fishlle-stock-mogya.web.app

```
$ firebase deploy --only hosting
i  hosting[fishlle-stock-mogya]: finalizing version...
✔  hosting[fishlle-stock-mogya]: version finalized
i  hosting[fishlle-stock-mogya]: releasing new version...
✔  hosting[fishlle-stock-mogya]: release complete

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/fishlle-stock-mogya/overview
Hosting URL: https://fishlle-stock-mogya.web.app
```

