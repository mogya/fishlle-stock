現状のアプリは在庫データを `localStorage` に保存しているため、同じ人でもスマホとPCで在庫が共有されません。これを Firebase Auth + Firestore に寄せて、Googleログインしたユーザーが household 単位の在庫を共有できるようにします。
