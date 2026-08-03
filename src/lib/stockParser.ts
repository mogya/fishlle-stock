import type { StockInputItem } from '../types/stock'

export type ParseStockTextResult =
  | { ok: true; items: StockInputItem[] }
  | { ok: false; message: string }

const COLON_PATTERN = /[:\uff1a]/

export function parseStockText(text: string): ParseStockTextResult {
  const lines = text.split(/\r?\n/)
  const itemsByName = new Map<string, StockInputItem>()
  const errors: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const line = rawLine.trim()
    if (line.length === 0) {
      continue
    }

    const match = line.match(COLON_PATTERN)
    if (!match) {
      errors.push(`${i + 1}行目：区切り文字（: または ：）が見つかりません`)
      continue
    }

    const index = match.index ?? 0
    const name = line.slice(0, index).trim()
    const countText = line.slice(index + 1).trim()

    if (name.length === 0) {
      errors.push(`${i + 1}行目：商品名が空です`)
      continue
    }

    const count = Number(countText)
    if (!Number.isFinite(count) || !Number.isInteger(count) || count <= 0 || count > 99) {
      errors.push(`${i + 1}行目：数量は1以上99以下の整数で入力してください`)
      continue
    }

    const existing = itemsByName.get(name)
    if (existing) {
      existing.count += count
    } else {
      itemsByName.set(name, { name, count })
    }
  }

  for (const item of itemsByName.values()) {
    if (item.count > 99) {
      errors.push(`${item.name}：合計数量が99を超えています`)
    }
  }

  if (errors.length > 0) {
    return { ok: false, message: errors.join('\n') }
  }

  return { ok: true, items: Array.from(itemsByName.values()) }
}
