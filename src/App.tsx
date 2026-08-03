import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { signInWithGoogle, signOutUser, subscribeAuth, type User } from './lib/auth'
import {
  createHouseholdForUser,
  joinHouseholdByInviteCode,
  subscribeHouseholdForUser,
  type Household,
} from './lib/householdRepository'
import { createInvite } from './lib/inviteRepository'
import { addStockItems, eatStockItem, subscribeStockItems, updateStockItem } from './lib/stockRepository'
import { createStockItem } from './lib/stockItemFactory'
import { parseStockText } from './lib/stockParser'
import type { StockItem } from './types/stock'

function getTodayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(dateString: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString)
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`
  }
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) {
    return dateString
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function App() {
  const [authUser, setAuthUser] = useState<User | null | undefined>(undefined)
  const [household, setHousehold] = useState<Household | null | undefined>(undefined)
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [receivedDate, setReceivedDate] = useState<string>(getTodayDateString())
  const [inputText, setInputText] = useState<string>('')
  const [inviteInput, setInviteInput] = useState<string>('')
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [detailRemainingCount, setDetailRemainingCount] = useState<number | ''>('')
  const [detailReceivedDate, setDetailReceivedDate] = useState<string>('')


  useEffect(() => {
    return subscribeAuth((user) => setAuthUser(user))
  }, [])

  useEffect(() => {
    if (authUser === undefined) {
      return
    }
    if (authUser === null) {
      setHousehold(null)
      return
    }
    setHousehold(undefined)
    return subscribeHouseholdForUser(
      authUser.uid,
      (h) => setHousehold(h),
      (err) => setError(err.message),
    )
  }, [authUser])

  useEffect(() => {
    if (!household) {
      setStockItems([])
      return
    }
    return subscribeStockItems(
      household.id,
      (items) => setStockItems(items),
      (err) => setError(err.message),
    )
  }, [household])

  useEffect(() => {
    setInviteCode(null)
  }, [authUser, household])

  const sortedStockItems = useMemo(() => {
    return [...stockItems]
      .filter((item) => item.remainingCount > 0)
      .sort((a, b) => a.receivedDate.localeCompare(b.receivedDate))
  }, [stockItems])

  const selectedItem = useMemo(() => {
    return stockItems.find((item) => item.id === selectedItemId) ?? null
  }, [stockItems, selectedItemId])

  useEffect(() => {
    const item = stockItems.find((i) => i.id === selectedItemId)
    if (!item) return
    if (item.remainingCount !== detailRemainingCount || item.receivedDate !== detailReceivedDate) {
      setDetailRemainingCount(item.remainingCount)
      setDetailReceivedDate(item.receivedDate)
    }
  }, [stockItems, selectedItemId, detailRemainingCount, detailReceivedDate])

  const handleSignIn = async () => {
    setError(null)
    try {
      setIsLoading(true)
      await signInWithGoogle()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    setError(null)
    try {
      setIsLoading(true)
      await signOutUser()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログアウトに失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateHousehold = async () => {
    if (!authUser) return
    setError(null)
    try {
      setIsLoading(true)
      await createHouseholdForUser(authUser)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'household の作成に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleJoinHousehold = async () => {
    if (!authUser || !inviteInput.trim()) return
    setError(null)
    try {
      setIsLoading(true)
      await joinHouseholdByInviteCode(authUser, inviteInput.trim())
      setInviteInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '参加に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    if (!authUser || !household) return

    const result = parseStockText(inputText)
    if (!result.ok) {
      setError(result.message)
      return
    }

    const newItems = result.items.map((item) =>
      createStockItem({
        name: item.name,
        count: item.count,
        receivedDate,
      }),
    )

    try {
      setIsLoading(true)
      await addStockItems(household.id, newItems, authUser)
      setInputText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEat = async (id: string) => {
    if (!authUser || !household || !selectedItem || selectedItem.remainingCount <= 0) return
    setError(null)
    try {
      setIsLoading(true)
      await eatStockItem(household.id, id, authUser)
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectItem = (id: string) => {
    setSelectedItemId(id)
    setError(null)
  }

  const handleBack = () => {
    setSelectedItemId(null)
    setError(null)
  }

  const handleUpdate = async () => {
    if (!authUser || !household || !selectedItem) return
    const count = detailRemainingCount === '' ? 0 : Number(detailRemainingCount)
    if (!Number.isInteger(count) || count < 0 || count > 99) {
      setError('残数は0〜99の整数を入力してください')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(detailReceivedDate)) {
      setError('届いた日を正しく入力してください')
      return
    }
    setError(null)
    setIsLoading(true)
    try {
      await updateStockItem(
        household.id,
        selectedItem.id,
        { remainingCount: count, receivedDate: detailReceivedDate },
        authUser,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateInvite = async () => {
    if (!authUser || !household) return
    setError(null)
    try {
      setIsLoading(true)
      const code = await createInvite(household.id, authUser)
      setInviteCode(code)
    } catch (err) {
      setError(err instanceof Error ? err.message : '招待コードの発行に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  if (authUser === undefined || household === undefined) {
    return (
      <main className="app-shell">
        <section className="hero">
          <p className="eyebrow">Fishlle Stock</p>
          <h1>フィシュルストック</h1>
        </section>
        <p className="loading-message">読み込み中...</p>
      </main>
    )
  }

  if (authUser === null) {
    return (
      <main className="app-shell">
        <section className="hero">
          <p className="eyebrow">Fishlle Stock</p>
          <h1>フィシュルストック</h1>
          <p>家にあるフィシュルをスマホでさっと確認するためのアプリです。</p>
        </section>
        <section className="card">
          <h2>ログイン</h2>
          <button type="button" className="primary-button" onClick={handleSignIn} disabled={isLoading}>
            Googleでログイン
          </button>
          {error && <p className="error-message">{error}</p>}
        </section>
      </main>
    )
  }

  if (household === null) {
    return (
      <main className="app-shell">
        <section className="hero">
          <p className="eyebrow">Fishlle Stock</p>
          <h1>フィシュルストック</h1>
        </section>
        <section className="card">
          <h2>リストを作成</h2>
          <p>新しいリストを作り、フィシュルを登録します。</p>
          <button type="button" className="primary-button" onClick={handleCreateHousehold} disabled={isLoading}>
            リストを作成
          </button>
        </section>
        <section className="card">
          <h2>招待コードで参加</h2>
          <p>家族から教えてもらった招待コードを入力してください。</p>
          <label className="form-field">
            <span className="form-label">招待コード</span>
            <input
              type="text"
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
              placeholder="ABCD1234"
            />
          </label>
          <button type="button" className="primary-button" onClick={handleJoinHousehold} disabled={isLoading || !inviteInput.trim()}>
            参加する
          </button>
          {error && <p className="error-message">{error}</p>}
        </section>
        <section className="card">
          <button type="button" className="secondary-button" onClick={handleSignOut} disabled={isLoading}>
            ログアウト
          </button>
        </section>
      </main>
    )
  }

  if (selectedItem) {
    return (
      <main className="app-shell">
        <section className="hero">
          <p className="eyebrow">Fishlle Stock</p>
          <h1>在庫詳細</h1>
        </section>

        <section className="card stock-detail">
          <h2 className="detail-name">{selectedItem.name}</h2>
          <div className="detail-form">
            <label className="form-field">
              <span className="form-label">残数</span>
              <input
                type="number"
                min={0}
                max={99}
                step={1}
                value={detailRemainingCount}
                onChange={(e) => setDetailRemainingCount(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </label>
            <label className="form-field">
              <span className="form-label">届いた日</span>
              <input
                type="date"
                value={detailReceivedDate}
                onChange={(e) => setDetailReceivedDate(e.target.value)}
                required
              />
            </label>
            {error && <p className="error-message">{error}</p>}
            <button
              type="button"
              className="primary-button"
              onClick={handleUpdate}
              disabled={isLoading}
            >
              更新
            </button>
          </div>
          <div className="detail-actions">
            <button
              type="button"
              className="eat-button"
              onClick={() => handleEat(selectedItem.id)}
              disabled={isLoading || selectedItem.remainingCount <= 0}
            >
              食べた(一個減らす)
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleBack}
              disabled={isLoading}
            >
              戻る
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Fishlle Stock</p>
        <h1>フィシュルストック</h1>
        <p>家にあるフィシュルをスマホでさっと確認するためのアプリです。</p>
      </section>

      <section className="card">
        <h2>フィシュルを一括追加</h2>
        <form className="add-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span className="form-label">届いた日</span>
            <input
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              required
            />
          </label>
          <label className="form-field">
            <span className="form-label">注文テキスト</span>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`中華風黒酢マリネ(生食用)：1\nごまだれ(生食用)：1\n梅みぞれ煮（加熱用）：2`}
              rows={6}
            />
          </label>
          <p className="input-hint">
            商品名と数量を「：」か「:」で区切って入力してください。空行は無視されます。
          </p>
          {error && <p className="error-message">{error}</p>}
          <button type="submit" className="primary-button" disabled={isLoading}>
            登録する
          </button>
        </form>
      </section>

      <section className="card stock-list">
        <h2>フィシュルリスト</h2>
        {sortedStockItems.length === 0 ? (
          <p className="empty-message">まだフィシュルが登録されていません。</p>
        ) : (
          <ul>
            {sortedStockItems.map((item) => (
              <li
                key={item.id}
                className="stock-item"
                onClick={() => handleSelectItem(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleSelectItem(item.id)
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="stock-info">
                  <span className="stock-name">{item.name}</span>
                  <span className="stock-meta">
                    残数 <strong>{item.remainingCount}</strong> · 届いた日 {formatDate(item.receivedDate)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {authUser.uid === household.ownerUid && (
        <section className="card">
          <h2>招待コード</h2>
          {inviteCode ? (
            <>
              <p className="invite-code">{inviteCode}</p>
              <p className="input-hint">有効期限は発行から7日間です。</p>
            </>
          ) : (
            <button type="button" className="primary-button" onClick={handleCreateInvite} disabled={isLoading}>
              招待コードを発行
            </button>
          )}
        </section>
      )}

      <section className="card">
        <button type="button" className="secondary-button" onClick={handleSignOut} disabled={isLoading}>
          ログアウト
        </button>
      </section>
    </main>
  )
}

export default App
