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
mogya@itamen:~/develop/fishlle-stock$ gcloud projects add-iam-policy-binding fishlle-stock-mogya --member="serviceAccount:github-action-＊＊＊＊@fishlle-stock-mogya.iam.gserviceaccount.com" --role="roles/firebaserules.admin"
Updated IAM policy for project [fishlle-stock-mogya].
bindings:
:
mogya@itamen:~/develop/fishlle-stock$ gcloud projects add-iam-policy-binding fishlle-stock-mogya --member="serviceAccount:github-action-＊＊＊＊@fishlle-stock-mogya.iam.gserviceaccount.com" --role="roles/datastore.indexAdmin"
Updated IAM policy for project [fishlle-stock-mogya].
bindings:
:
mogya@itamen:~/develop/fishlle-stock$ gcloud projects get-iam-policy fishlle-stock-mogya     --flatten="bindings[].members"     --filter="bindings.members=serviceAccount:github-action-＊＊＊＊@fishlle-stock-mogya.iam.gserviceaccount.com"     --format="table(bindings.role)"
ROLE
roles/cloudfunctions.developer
roles/datastore.indexAdmin
roles/firebaseauth.admin
roles/firebasehosting.admin
roles/firebaserules.admin
roles/run.viewer
roles/serviceusage.apiKeysViewer
roles/serviceusage.serviceUsageConsumer
```
