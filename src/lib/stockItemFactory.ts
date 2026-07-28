import type { CreateStockItemParams, StockItem } from '../types/stock'

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createStockItem(params: CreateStockItemParams): StockItem {
  const now = new Date().toISOString()
  return {
    id: generateId(),
    name: params.name,
    remainingCount: params.count,
    receivedDate: params.receivedDate,
    createdAt: now,
    updatedAt: now,
  }
}
