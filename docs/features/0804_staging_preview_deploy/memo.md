staging(firebase)を作り、PRごとのプレビューURL自動デプロイを行うようにする

### 1. staging プロジェクト作成

```
mogya@itamen:~/develop/fishlle-stock$ firebase projects:create fishlle-stock-mogya-staging -n "fishlle-stock-staging"
✔ Creating Google Cloud Platform project
✔ Adding Firebase resources to Google Cloud Platform project

🎉🎉🎉 Your Firebase project is ready! 🎉🎉🎉

Project information:
   - Project ID: fishlle-stock-mogya-staging
   - Project Name: fishlle-stock-staging

Firebase console is available at
https://console.firebase.google.com/project/fishlle-stock-mogya-staging/overview
```

※ `project display name contains invalid characters`とのことだったのでdisplay nameを変えました

### 2. staging に Firestore / Web アプリを用意
```
mogya@itamen:~/develop/fishlle-stock$ firebase firestore:databases:create "(default)"   --location asia-northeast2 --edition standard   --project fishlle-stock-mogya-staging

Error: Request to https://firestore.googleapis.com/v1/projects/fishlle-stock-mogya-staging/databases?databaseId=%28default%29 had HTTP Error: 403, Cloud Firestore API has not been used in project fishlle-stock-mogya-staging before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=fishlle-stock-mogya-staging then retry. If you enabled this API recently, wait a few minutes for the action to propagate to our systems and retry.

Having trouble? Try firebase [command] --help
mogya@itamen:~/develop/fishlle-stock$ gcloud services enable firestore.googleapis.com --project=fishlle-stock-mogya-staging
Reauthentication required.
Please enter your password:
Reauthentication successful.
mogya@itamen:~/develop/fishlle-stock$ firebase firestore:databases:create "(default)"   --location asia-northeast2 --edition standard   --project fishlle-stock-mogya-staging
Successfully created projects/fishlle-stock-mogya-staging/databases/(default)
Please be sure to configure Firebase rules in your Firebase config file for
the new database. By default, created databases will have closed rules that
block any incoming third-party traffic.
Your database may be viewed at https://console.firebase.google.com/project/fishlle-stock-mogya-staging/firestore/databases/-default-/data
```

```
mogya@itamen:~/develop/fishlle-stock$ firebase deploy --only firestore --project fishlle-stock-mogya-staging

=== Deploying to 'fishlle-stock-mogya-staging'...

i  deploying firestore
i  firestore: ensuring required API firestore.googleapis.com is enabled...
✔  firestore: required API firestore.googleapis.com is enabled
i  firestore: ensuring required API firestore.googleapis.com is enabled...
i  firestore: reading indexes from firestore.indexes.json...
i  cloud.firestore: checking firestore.rules for compilation errors...
✔  cloud.firestore: rules file firestore.rules compiled successfully
i  firestore: uploading rules firestore.rules...
i  firestore: deploying indexes...
✔  firestore: deployed indexes in firestore.indexes.json successfully for (default) database
✔  firestore: released rules firestore.rules to cloud.firestore

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/fishlle-stock-mogya-staging/overview
```

```
mogya@itamen:~/develop/fishlle-stock$ firebase apps:create WEB "Staging Web App" --project fishlle-stock-mogya-staging
Create your WEB app in project fishlle-stock-mogya-staging:
✔ Creating your Web app

🎉🎉🎉 Your Firebase WEB App is ready! 🎉🎉🎉

App information:
  - App ID: 1:318634661088:web:dbb67db2e2d1ed789cac85
  - Display name: Staging Web App

You can run this command to print out your new app's Google Services config:
  firebase apps:sdkconfig WEB 1:318634661088:web:dbb67db2e2d1ed789cac85
mogya@itamen:~/develop/fishlle-stock$ firebase apps:list --project fishlle-stock-mogya-staging
✔ Preparing the list of your Firebase apps
┌──────────────────┬───────────────────────────────────────────┬──────────┐
│ App Display Name │ App ID                                    │ Platform │
├──────────────────┼───────────────────────────────────────────┼──────────┤
│ Staging Web App  │ 1:318634661088:web:dbb67db2e2d1ed789cac85 │ WEB      │
└──────────────────┴───────────────────────────────────────────┴──────────┘

1 app(s) total.
mogya@itamen:~/develop/fishlle-stock$ firebase apps:sdkconfig WEB 1:318634661088:web:dbb67db2e2d1ed789cac85 --project fishlle-stock-mogya-staging
✔ Downloading configuration data of your Firebase WEB app
{
  "projectId": "fishlle-stock-mogya-staging",
  "appId": "1:318634661088:web:dbb67db2e2d1ed789cac85",
  "storageBucket": "fishlle-stock-mogya-staging.firebasestorage.app",
  "apiKey": "AIzaSyDRD2dnU0ePHgjQWR3zdt7GW2oTqo0ps3s",
  "authDomain": "fishlle-stock-mogya-staging.firebaseapp.com",
  "messagingSenderId": "318634661088",
  "projectNumber": "318634661088",
  "version": "2"
}
```

`src/config/firebase.staging.ts` の `REPLACE_WITH_*` に反映した

### 3. staging の Auth (Google Sign-In) 有効化

```
mogya@itamen:~/develop/fishlle-stock$ firebase deploy --only auth --project fishlle-stock-mogya-staging

=== Deploying to 'fishlle-stock-mogya-staging'...

i  deploying auth
Enabling auth providers: Google sign-in...
✔  Auth providers enabled: Google sign-in

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/fishlle-stock-mogya-staging/overview
```

### 4. GitHub Actions 用サービスアカウントと secret

```
mogya@itamen:~/develop/fishlle-stock$ firebase init hosting:github

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

i  Using project fishlle-stock-mogya-staging (fishlle-stock-staging) .

=== Hosting:github Setup

i  Detected a .git folder at /home/mogya/develop/fishlle-stock
i  Authorizing with GitHub to upload your service account to a GitHub repository's secrets store.

Visit this URL on this device to log in:
https://github.com/login/oauth/authorize?client_id=＊＊＊＊&redirect_uri=http%3A%2F%2Flocalhost%3A9005&scope=read%3Auser%20repo%20public_repo

Waiting for authentication...

✔  Success! Logged into GitHub as mogya

✔ For which GitHub repository would you like to set up a GitHub workflow? (format: user/repository) mogya/fishlle-stock

✔  Created service account github-action-1314670210 with Firebase Hosting admin permissions.
✔  Uploaded service account JSON to GitHub as secret FIREBASE_SERVICE_ACCOUNT_FISHLLE_STOCK_MOGYA_STAGING.
i  You can manage your secrets at https://github.com/mogya/fishlle-stock/settings/secrets.
```

secret名 は `FIREBASE_SERVICE_ACCOUNT_FISHLLE_STOCK_MOGYA_STAGING`となっていて、既存とは別のものが作成されたのでこれで良いはず

`firebase-hosting-merge.yml` / `firebase-hosting-pull-request.yml`の変更もなし

