import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStockItem } from './stockItemFactory'

describe('createStockItem', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('creates an item with generated id and timestamps', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-03T09:00:00.000Z'))
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('123e4567-e89b-12d3-a456-426614174000')

    const item = createStockItem({
      name: 'さば',
      count: 4,
      receivedDate: '2026-08-03',
    })

    expect(item).toEqual({
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'さば',
      remainingCount: 4,
      receivedDate: '2026-08-03',
      createdAt: '2026-08-03T09:00:00.000Z',
      updatedAt: '2026-08-03T09:00:00.000Z',
    })
  })
})
