import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadStockItems, saveStockItems } from './stockStorage'

describe('stockStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty array when storage is empty', () => {
    expect(loadStockItems()).toEqual([])
  })

  it('returns empty array for malformed JSON', () => {
    localStorage.setItem('fishlle-stock-items', '{not-json')
    expect(loadStockItems()).toEqual([])
  })

  it('returns empty array when stored value is not an array', () => {
    localStorage.setItem('fishlle-stock-items', JSON.stringify({ foo: 'bar' }))
    expect(loadStockItems()).toEqual([])
  })

  it('saves and loads stock items', () => {
    const items = [
      {
        id: 'id-1',
        name: 'さば',
        remainingCount: 2,
        receivedDate: '2026-08-03',
        createdAt: '2026-08-03T00:00:00.000Z',
        updatedAt: '2026-08-03T00:00:00.000Z',
      },
    ]

    saveStockItems(items)
    expect(loadStockItems()).toEqual(items)
  })

  it('does not throw when localStorage.setItem fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })

    expect(() => {
      saveStockItems([])
    }).not.toThrow()
  })
})
