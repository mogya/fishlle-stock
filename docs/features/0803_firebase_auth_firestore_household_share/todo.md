## 📝 背景 / Background

現状のアプリは在庫データを `localStorage` に保存しているため、同じ人でもスマホとPCで在庫が共有されません。これを Firebase Auth + Firestore に寄せて、Googleログインしたユーザーが household 単位の在庫を共有できるようにします。

Firestore rules にはすでに `households/{householdId}/members/{uid}` と `items` の基本ルールが入っているので、それを活かします。


## 🎯 ゴール / Goals

- [ ] Googleログインできる
- [ ] 同じGoogleアカウントならスマホ/PCで同じ household の在庫を見られる
- [ ] household 作成時に `households/{householdId}` と owner 自身の `members/{uid}` が作られる
- [ ] 在庫は `households/{householdId}/items/{itemId}` に保存される
- [ ] owner が招待コードを発行できる
- [ ] 家族ユーザーはGoogleログイン後、招待コードを入力して同じ household に参加できる
- [ ] household member だけが共有在庫を読める/更新できる

## 実装方針

### 1. 認証状態を扱う層を追加

対象候補:

- `src/config/firebase.ts`
- `src/lib/auth.ts`
- `src/App.tsx`

Firebase Auth の `GoogleAuthProvider` を使って、Googleログイン/ログアウトを実装します。

UI としては、未ログイン時に「Googleでログイン」だけ出す形で十分です。ログイン後は `user.uid` を基準に household を探します。

### 2. household の探索/作成を追加

対象候補:

- `src/lib/householdRepository.ts`
- `src/types/household.ts`

ログイン後に、そのユーザーが member になっている household を探します。

ただし Firestore では全 household の subcollection を自然に一覧できないので、低工数でやるなら以下のどちらかです。

おすすめは **users 配下に所属 household を持つ方式** です。

```txt
users/{uid}
  currentHouseholdId
  householdIds: [...]
```

household 作成時に batch write で以下を同時に作ります。

```txt
households/{householdId}
  ownerUid
  name
  createdAt
  updatedAt

households/{householdId}/members/{uid}
  uid
  role: "owner"
  displayName
  email
  joinedAt

users/{uid}
  currentHouseholdId
  householdIds: [householdId]
```

既存 rules は「household 作成 + owner 自身の member 作成」に近い形を許可しているので、ここに `users/{uid}` の rules を足す想定です。

### 3. 在庫保存を Firestore に差し替える

対象候補:

- `src/lib/stockStorage.ts`
- `src/types/stock.ts`
- `src/App.tsx`

今の `localStorage` 保存を Firestore の購読に置き換えます。

保存先:

```txt
households/{householdId}/items/{itemId}
```

item には rules に合わせて以下を持たせます。

```txt
name
remainingCount
receivedDate
createdAt
updatedAt
createdBy
updatedBy
```

現在の `StockItem` には `createdBy` / `updatedBy` がないので型を追加します。`createdAt` / `updatedAt` は Firestore の `serverTimestamp()` を使います。

「食べた」は削除ではなく `remainingCount` を 1 減らして、0 になったら一覧から非表示にする方針を維持します。Firestore 上は `remainingCount: 0` のまま残す想定です。

### 4. 招待コード方式を追加

対象候補:

- `src/lib/inviteRepository.ts`
- `src/types/household.ts`
- `firestore.rules`
- `src/rules/firestore.rules.test.ts`
- `src/App.tsx`

招待コードは top-level collection に置くのがシンプルです。

```txt
householdInvites/{inviteCode}
  householdId
  createdBy
  createdAt
  expiresAt
```

owner が「招待コードを作成」すると、ランダムなコードを生成して保存します。

家族側はログイン後にコードを入力します。コードから `householdId` を取得し、自分の member doc と `users/{uid}` を作ります。

```txt
households/{householdId}/members/{uid}
  uid
  role: "member"
  displayName
  email
  joinedAt
  invitedBy
  inviteCode

users/{uid}
  currentHouseholdId
  householdIds: [householdId]
```

Firestore rules では、以下を許可します。

- owner だけが自分の household の invite を作れる
- invite は signed-in user が code 指定で `get` できる
- invite が未期限切れなら、ログインユーザー本人の `members/{uid}` 作成を許可する
- invite の一覧取得は不可

有効期限はまず 24時間〜7日くらいで十分そうです。個人的には家庭内共有なら **7日** が扱いやすいと思います。

### 5. 画面構成

`src/App.tsx` は少し責務が増えるので、必要なら小さく component 分割します。

画面状態はざっくり以下です。

```txt
未ログイン
  -> Googleログイン画面

ログイン済み / householdなし
  -> householdを作る
  -> 招待コードで参加する

ログイン済み / householdあり
  -> 在庫追加
  -> 在庫一覧
  -> 招待コード発行/表示
  -> ログアウト
```

最初は household 名の編集や member 一覧の管理までは必須にしなくてよさそうです。

### 6. Firestore rules の追加/調整

対象:

- `firestore.rules`

追加したいルール:

- `users/{uid}` は本人だけ read/write
- `householdInvites/{inviteCode}` は owner が create/delete
- signed-in user は invite code を直接指定して get できる
- invite を使った member 作成を許可する

既存 `items` ルールは基本そのまま使います。

### 7. テスト

対象:

- `src/rules/firestore.rules.test.ts`
- `src/App.test.tsx`
- 必要なら `src/lib/*Repository.test.ts`

rules テストでは最低限これを追加します。

- owner が invite を作れる
- member や outsider は invite を作れない
- signed-in user が有効な invite で自分を member に追加できる
- 他人の uid では member 追加できない
- 期限切れ invite では member 追加できない
- invite の list はできない
- `users/{uid}` は本人だけ読める/書ける

アプリ側テストは、Firebase を直接叩くより repository を mock して、ログイン状態ごとの画面遷移を確認するのが軽そうです。

## 🧪 Test Plan

- [ ] `npm run test:run`
- [ ] `npm run test:rules:emulator`
- [ ] `npm run build`
- [ ] Auth/Firestore Emulator で、ユーザーAが household 作成できることを確認
- [ ] ユーザーAが在庫を追加し、再読み込み後も表示されることを確認
- [ ] ユーザーAが招待コードを発行できることを確認
- [ ] ユーザーBがGoogleログイン後、招待コードで同じ household に参加できることを確認
- [ ] ユーザーBの画面でユーザーAが追加した在庫が見えることを確認
- [ ] ユーザーBが「食べた」を押すと、ユーザーA側にも反映されることを確認

## 注意事項

まだホビーユースなので、既存 localStorage 在庫から Firestore への移行措置は不要です。ユーザーは新たにデータを作り直す前提で構いません
