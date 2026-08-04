import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onSnapshot } from 'firebase/firestore'
import { subscribeQueryWithPermissionRetry } from './firestoreListener'

vi.mock('firebase/firestore', () => ({
  onSnapshot: vi.fn(),
}))

const mockOnSnapshot = vi.mocked(onSnapshot)

type NextFn = (snapshot: unknown) => void
type ErrorFn = (error: { code: string }) => void

const permissionDenied = { code: 'permission-denied' } as never

function cacheSnapshot() {
  return { metadata: { fromCache: true }, size: 0, docs: [] }
}

function serverSnapshot() {
  return { metadata: { fromCache: false }, size: 0, docs: [] }
}

function latestHandlers() {
  const call = mockOnSnapshot.mock.calls.at(-1)
  if (!call) {
    throw new Error('onSnapshot has not been called')
  }
  return { next: call[1] as unknown as NextFn, error: call[2] as unknown as ErrorFn }
}

describe('subscribeQueryWithPermissionRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockOnSnapshot.mockReset()
    mockOnSnapshot.mockReturnValue(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('キャッシュ配信では再試行カウンタをリセットせず、permission-denied 継続時に上限で onError に到達する', () => {
    const onNext = vi.fn()
    const onError = vi.fn()
    subscribeQueryWithPermissionRetry({} as never, onNext, onError)

    // 各リトライで新しいリスナーになる。1 リスナーにつき「キャッシュ配信 → サーバー拒否」を 1 回ずつ。
    for (let i = 0; i < 10; i++) {
      const { next, error } = latestHandlers()
      next(cacheSnapshot())
      error(permissionDenied)
      vi.advanceTimersByTime(2000)
      if (onError.mock.calls.length > 0) break
    }

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(permissionDenied)
  })

  it('サーバー確定スナップショットが届くと再試行カウンタがリセットされる', () => {
    const onNext = vi.fn()
    const onError = vi.fn()
    subscribeQueryWithPermissionRetry({} as never, onNext, onError)

    for (let i = 0; i < 4; i++) {
      latestHandlers().error(permissionDenied)
      vi.advanceTimersByTime(2000)
    }
    latestHandlers().next(serverSnapshot())
    expect(onNext).toHaveBeenCalledTimes(1)

    // リセット後は再び上限まで onError を呼ばない。
    for (let i = 0; i < 5; i++) {
      latestHandlers().error(permissionDenied)
      vi.advanceTimersByTime(2000)
    }
    expect(onError).not.toHaveBeenCalled()

    latestHandlers().error(permissionDenied)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('permission-denied 以外はリトライせず即座に onError を呼ぶ', () => {
    const onError = vi.fn()
    subscribeQueryWithPermissionRetry({} as never, vi.fn(), onError)

    latestHandlers().error({ code: 'unavailable' })
    vi.advanceTimersByTime(2000)

    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('unsubscribe すると予約中のリトライが破棄され再購読しない', () => {
    const inner = vi.fn()
    mockOnSnapshot.mockReturnValue(inner)
    const unsubscribe = subscribeQueryWithPermissionRetry({} as never, vi.fn(), vi.fn())

    latestHandlers().error(permissionDenied)
    const callsBefore = mockOnSnapshot.mock.calls.length
    unsubscribe()
    vi.advanceTimersByTime(2000)

    expect(inner).toHaveBeenCalled()
    expect(mockOnSnapshot.mock.calls.length).toBe(callsBefore)
  })
})
