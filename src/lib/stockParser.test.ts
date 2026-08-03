import { describe, expect, it } from 'vitest'
import { parseStockText } from './stockParser'

describe('parseStockText', () => {
  it('parses lines and merges duplicate names', () => {
    const result = parseStockText('さば:1\nさば：2\nぶり:3')

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.items).toEqual([
      { name: 'さば', count: 3 },
      { name: 'ぶり', count: 3 },
    ])
  })

  it('ignores blank lines', () => {
    const result = parseStockText('\n  \nかつお:2\n')

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.items).toEqual([{ name: 'かつお', count: 2 }])
  })

  it('returns validation errors for invalid lines', () => {
    const result = parseStockText('不正行\n:1\nたい:0\nあじ:1.5')

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.message).toContain('1行目：区切り文字（: または ：）が見つかりません')
    expect(result.message).toContain('2行目：商品名が空です')
    expect(result.message).toContain('3行目：数量は1以上99以下の整数で入力してください')
    expect(result.message).toContain('4行目：数量は1以上99以下の整数で入力してください')
  })

  it('rejects counts over 99', () => {
    const result = parseStockText('さば:100')

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.message).toContain('数量は1以上99以下の整数で入力してください')
  })

  it('rejects combined counts over 99', () => {
    const result = parseStockText('さば:60\nさば：50')

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.message).toContain('合計数量が99を超えています')
  })
})
