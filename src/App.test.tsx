import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('adds stock items and allows decrementing until removal', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('注文テキスト'), 'さば:2')
    await user.click(screen.getByRole('button', { name: '登録する' }))

    expect(screen.getByText('さば')).toBeInTheDocument()
    expect(screen.getByText(/残数/)).toHaveTextContent('残数 2')

    await user.click(screen.getByRole('button', { name: '食べた' }))
    expect(screen.getByText(/残数/)).toHaveTextContent('残数 1')

    await user.click(screen.getByRole('button', { name: '食べた' }))
    expect(screen.queryByText('さば')).not.toBeInTheDocument()
  })

  it('shows parse errors for invalid input', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('注文テキスト'), '不正行')
    await user.click(screen.getByRole('button', { name: '登録する' }))

    expect(screen.getByText('1行目：区切り文字（: または ：）が見つかりません')).toBeInTheDocument()
  })
})
