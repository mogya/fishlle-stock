# サービアカウントに権限を追加する

firestoreへのデプロイ(mainにマージしたところで動作する .github/workflows/firebase-hosting-merge.yml )が失敗した。
https://github.com/mogya/fishlle-stock/actions/runs/30796870970

```
=== Deploying to 'fishlle-stock-mogya'...

i  deploying firestore
i  firestore: ensuring required API firestore.googleapis.com is enabled...
✔  firestore: required API firestore.googleapis.com is enabled
i  firestore: ensuring required API firestore.googleapis.com is enabled...
i  firestore: reading indexes from firestore.indexes.json...
i  cloud.firestore: checking firestore.rules for compilation errors...

Error: Request to https://firebaserules.googleapis.com/v1/projects/fishlle-stock-mogya:test had HTTP Error: 403, The caller does not have permission
Error: Process completed with exit code 1.
```

権限を追加

```
mogya@itamen:~/develop/fishlle-stock$ gcloud projects add-iam-policy-binding fishlle-stock-mogya --member="serviceAccount:github-action-＊＊＊＊@fishlle-stock-mogya.iam.gserviceaccount.com" --role="roles/datastore.indexAdmin"
Updated IAM policy for project [fishlle-stock-mogya].
bindings:
- members:
  - serviceAccount:github-action-＊＊＊＊@fishlle-stock-mogya.iam.gserviceaccount.com
  role: roles/cloudfunctions.developer
- members:
  - serviceAccount:github-action-＊＊＊＊@fishlle-stock-mogya.iam.gserviceaccount.com
  role: roles/datastore.indexAdmin
- members:
  - serviceAccount:service-446445036597@gcp-sa-firebase.iam.gserviceaccount.com
  role: roles/firebase.managementServiceAgent
- members:
  - serviceAccount:firebase-adminsdk-fbsvc@fishlle-stock-mogya.iam.gserviceaccount.com
  role: roles/firebase.sdkAdminServiceAgent
- members:
  - serviceAccount:firebase-adminsdk-fbsvc@fishlle-stock-mogya.iam.gserviceaccount.com
  - serviceAccount:github-action-＊＊＊＊@fishlle-stock-mogya.iam.gserviceaccount.com
  role: roles/firebaseauth.admin
- members:
  - serviceAccount:github-action-＊＊＊＊@fishlle-stock-mogya.iam.gserviceaccount.com
  role: roles/firebasehosting.admin
- members:
  - serviceAccount:service-446445036597@firebase-rules.iam.gserviceaccount.com
  role: roles/firebaserules.system
- members:
  - serviceAccount:service-446445036597@gcp-sa-firestore.iam.gserviceaccount.com
  role: roles/firestore.serviceAgent
- members:
  - serviceAccount:firebase-adminsdk-fbsvc@fishlle-stock-mogya.iam.gserviceaccount.com
  role: roles/iam.serviceAccountTokenCreator
- members:
  - user:mogya@mogya.com
  role: roles/owner
- members:
  - serviceAccount:github-action-＊＊＊＊@fishlle-stock-mogya.iam.gserviceaccount.com
  role: roles/run.viewer
- members:
  - serviceAccount:github-action-＊＊＊＊@fishlle-stock-mogya.iam.gserviceaccount.com
  role: roles/serviceusage.apiKeysViewer
- members:
  - serviceAccount:github-action-＊＊＊＊@fishlle-stock-mogya.iam.gserviceaccount.com
  role: roles/serviceusage.serviceUsageConsumer
version: 1
```
