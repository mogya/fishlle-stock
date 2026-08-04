import {
  onSnapshot,
  type DocumentReference,
  type DocumentSnapshot,
  type FirestoreError,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore'

// household 作成/参加直後は関連ドキュメントがサーバー確定する前に購読が走り、
// 一時的に permission-denied になることがある。onSnapshot はエラーでリスナーを終了し
// 自動再試行しないため、その場合だけ数回リトライして自己回復させる。
const PERMISSION_RETRY_LIMIT = 5
const PERMISSION_RETRY_BASE_MS = 300

function subscribeWithPermissionRetry<TSnapshot>(
  subscribe: (
    onNext: (snapshot: TSnapshot) => void,
    onError: (error: FirestoreError) => void,
  ) => () => void,
  onNext: (snapshot: TSnapshot) => void,
  onError?: (error: FirestoreError) => void,
): () => void {
  let unsubscribe: (() => void) | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryCount = 0
  let cancelled = false

  const start = () => {
    unsubscribe = subscribe(
      (snapshot) => {
        retryCount = 0
        onNext(snapshot)
      },
      (error) => {
        if (error.code === 'permission-denied' && retryCount < PERMISSION_RETRY_LIMIT && !cancelled) {
          retryCount += 1
          retryTimer = setTimeout(start, PERMISSION_RETRY_BASE_MS * retryCount)
          return
        }
        onError?.(error)
      },
    )
  }

  start()

  return () => {
    cancelled = true
    if (retryTimer) {
      clearTimeout(retryTimer)
    }
    if (unsubscribe) {
      unsubscribe()
    }
  }
}

export function subscribeDocWithPermissionRetry<T>(
  ref: DocumentReference<T>,
  onNext: (snapshot: DocumentSnapshot<T>) => void,
  onError?: (error: FirestoreError) => void,
): () => void {
  return subscribeWithPermissionRetry<DocumentSnapshot<T>>(
    (next, error) => onSnapshot(ref, next, error),
    onNext,
    onError,
  )
}

export function subscribeQueryWithPermissionRetry<T>(
  q: Query<T>,
  onNext: (snapshot: QuerySnapshot<T>) => void,
  onError?: (error: FirestoreError) => void,
): () => void {
  return subscribeWithPermissionRetry<QuerySnapshot<T>>(
    (next, error) => onSnapshot(q, next, error),
    onNext,
    onError,
  )
}
