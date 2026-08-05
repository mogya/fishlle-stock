/// <reference types="vite/client" />

interface ImportMetaEnv {
  // 'staging' のときのみ staging Firebase プロジェクトへ接続する。未指定なら本番。
  readonly VITE_FIREBASE_ENV?: 'staging' | 'production'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
