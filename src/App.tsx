import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { createStockItem } from './lib/stockItemFactory'
import { parseStockText } from './lib/stockParser'
import { loadStockItems, saveStockItems } from './lib/stockStorage'
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
  const [stockItems, setStockItems] = useState<StockItem[]>(() => loadStockItems())
  const [receivedDate, setReceivedDate] = useState<string>(getTodayDateString())
  const [inputText, setInputText] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    saveStockItems(stockItems)
  }, [stockItems])

  const sortedStockItems = useMemo(() => {
    return [...stockItems]
      .filter((item) => item.remainingCount > 0)
      .sort((a, b) => a.receivedDate.localeCompare(b.receivedDate))
  }, [stockItems])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

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

    setStockItems((prev) => [...prev, ...newItems])
    setInputText('')
  }

  const handleEat = (id: string) => {
    setStockItems((prev) =>
      prev
        .map((item) => {
          if (item.id !== id) {
            return item
          }
          const remainingCount = item.remainingCount - 1
          return { ...item, remainingCount, updatedAt: new Date().toISOString() }
        })
        .filter((item) => item.remainingCount > 0),
    )
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Fishlle Stock</p>
        <h1>フィシュルストック</h1>
        <p>フィシュルの冷凍在庫をスマホでさっと確認するためのアプリです。</p>
      </section>

      <section className="card">
        <h2>在庫を一括追加</h2>
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
          <button type="submit" className="primary-button">
            登録する
          </button>
        </form>
      </section>

      <section className="card stock-list">
        <h2>在庫一覧</h2>
        {sortedStockItems.length === 0 ? (
          <p className="empty-message">まだ在庫が登録されていません。</p>
        ) : (
          <ul>
            {sortedStockItems.map((item) => (
              <li key={item.id} className="stock-item">
                <div className="stock-info">
                  <span className="stock-name">{item.name}</span>
                  <span className="stock-meta">
                    残数 <strong>{item.remainingCount}</strong> · 届いた日 {formatDate(item.receivedDate)}
                  </span>
                </div>
                <button
                  type="button"
                  className="eat-button"
                  onClick={() => handleEat(item.id)}
                >
                  食べた
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

export default App
