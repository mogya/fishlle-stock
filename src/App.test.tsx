import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import * as auth from './lib/auth'
import type { User } from './lib/auth'
import * as householdRepository from './lib/householdRepository'
import * as inviteRepository from './lib/inviteRepository'
import * as stockRepository from './lib/stockRepository'
import type { StockItem } from './types/stock'

vi.mock('./lib/auth', () => ({
  subscribeAuth: vi.fn(),
  signInWithGoogle: vi.fn(() => Promise.resolve()),
  signOutUser: vi.fn(() => Promise.resolve()),
}))

vi.mock('./lib/householdRepository', () => ({
  subscribeHouseholdForUser: vi.fn(),
  createHouseholdForUser: vi.fn(),
  joinHouseholdByInviteCode: vi.fn(),
}))

vi.mock('./lib/stockRepository', () => ({
  subscribeStockItems: vi.fn(),
  addStockItems: vi.fn(),
  eatStockItem: vi.fn(),
}))

vi.mock('./lib/inviteRepository', () => ({
  createInvite: vi.fn(),
}))

describe('App', () => {
  const mockUser = { uid: 'user-1', displayName: 'User One', email: 'user1@example.com' } as unknown as User
  const mockHousehold = { id: 'h1', ownerUid: 'user-1', name: 'my household' }
  let mockItems: StockItem[] = []
  let stockCallback: ((items: StockItem[]) => void) | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    mockItems = []
    stockCallback = null

    vi.mocked(auth.subscribeAuth).mockImplementation((callback) => {
      callback(mockUser)
      return vi.fn()
    })
    vi.mocked(householdRepository.subscribeHouseholdForUser).mockImplementation((_, callback) => {
      callback(mockHousehold)
      return vi.fn()
    })
    vi.mocked(stockRepository.subscribeStockItems).mockImplementation((_, callback) => {
      stockCallback = callback
      callback(mockItems)
      return vi.fn()
    })
    vi.mocked(stockRepository.addStockItems).mockImplementation(async (_, items) => {
      mockItems.push(...items)
      stockCallback?.([...mockItems])
    })
    vi.mocked(stockRepository.eatStockItem).mockImplementation(async (_, itemId) => {
      mockItems = mockItems.map((item) =>
        item.id === itemId ? { ...item, remainingCount: item.remainingCount - 1 } : item,
      )
      stockCallback?.([...mockItems])
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows Google sign-in when user is not logged in', async () => {
    vi.mocked(auth.subscribeAuth).mockImplementation((callback) => {
      callback(null)
      return vi.fn()
    })
    vi.mocked(householdRepository.subscribeHouseholdForUser).mockImplementation((_, callback) => {
      callback(null)
      return vi.fn()
    })

    render(<App />)

    expect(screen.getByRole('button', { name: 'Googleでログイン' })).toBeInTheDocument()
  })

  it('adds stock items and allows decrementing until removal', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByLabelText('注文テキスト')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('注文テキスト'), 'さば:2')
    await user.click(screen.getByRole('button', { name: '登録する' }))

    await waitFor(() => {
      expect(screen.getByText('さば')).toBeInTheDocument()
      expect(screen.getByText(/残数/)).toHaveTextContent('残数 2')
    })

    await user.click(screen.getByRole('button', { name: '食べた' }))
    await waitFor(() => {
      expect(screen.getByText(/残数/)).toHaveTextContent('残数 1')
    })

    await user.click(screen.getByRole('button', { name: '食べた' }))
    await waitFor(() => {
      expect(screen.queryByText('さば')).not.toBeInTheDocument()
    })
  })

  it('shows parse errors for invalid input', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByLabelText('注文テキスト')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('注文テキスト'), '不正行')
    await user.click(screen.getByRole('button', { name: '登録する' }))

    expect(screen.getByText('1行目：区切り文字（: または ：）が見つかりません')).toBeInTheDocument()
  })

  it('creates a household when no household exists', async () => {
    const user = userEvent.setup()
    vi.mocked(householdRepository.subscribeHouseholdForUser).mockImplementation((_, callback) => {
      callback(null)
      return vi.fn()
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'household を作成' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'household を作成' }))

    await waitFor(() => {
      expect(householdRepository.createHouseholdForUser).toHaveBeenCalledWith(mockUser)
    })
  })

  it('issues and displays an invite code', async () => {
    const user = userEvent.setup()
    vi.mocked(inviteRepository.createInvite).mockResolvedValue('ABCD1234')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '招待コードを発行' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '招待コードを発行' }))

    await waitFor(() => {
      expect(screen.getByText('ABCD1234')).toBeInTheDocument()
    })
  })

  it('joins a household using an invite code', async () => {
    const user = userEvent.setup()
    vi.mocked(householdRepository.subscribeHouseholdForUser).mockImplementation((_, callback) => {
      callback(null)
      return vi.fn()
    })
    vi.mocked(householdRepository.joinHouseholdByInviteCode).mockResolvedValue(mockHousehold)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByLabelText('招待コード')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('招待コード'), 'JOIN1234')
    await user.click(screen.getByRole('button', { name: '参加する' }))

    await waitFor(() => {
      expect(householdRepository.joinHouseholdByInviteCode).toHaveBeenCalledWith(mockUser, 'JOIN1234')
    })
  })
})
