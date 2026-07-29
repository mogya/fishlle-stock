import type { StockItem } from '../types/stock'

const STORAGE_KEY = 'fishlle-stock-items'

export function loadStockItems(): StockItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed as StockItem[]
  } catch {
    return []
  }
}

export function saveStockItems(items: StockItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // localStorage が使えない環境でもアプリが落ちないように無視する
  }
}
