import React from 'react'
import { act, render } from '@testing-library/react'
import Matrix from './index'

const mockState = { music: false, pause: 1 }
const mockDispatch = jest.fn()

jest.mock('react-redux', () => ({
  useSelector: selector => selector(mockState),
  useDispatch: () => mockDispatch
}))

const boardAt = column => Array.from({ length: 20 }, (_, row) =>
  Array.from({ length: 10 }, (_, col) => Number(row === 0 && col === column)))

test('a fresh run replaces a game-over wipe even when reset and start occur before a ready render', () => {
  jest.useFakeTimers()
  const gameover = jest.fn()
  const first = boardAt(0)
  const restarted = boardAt(1)
  const { container, rerender, unmount } = render(<Matrix matrix={first} isDead={false} gameover={gameover} />)

  rerender(<Matrix matrix={first} isDead={true} gameover={gameover} />)
  // React may batch RESET and START, so Matrix can receive a new live board
  // without ever observing pause=0 between the two sessions.
  rerender(<Matrix matrix={restarted} isDead={false} gameover={gameover} />)
  expect(container.querySelectorAll('p')[0].children[1].classList.contains('c')).toBe(true)

  act(() => jest.advanceTimersByTime(2000))
  expect(gameover).not.toHaveBeenCalled()
  expect(container.querySelectorAll('p')[0].children[1].classList.contains('c')).toBe(true)
  unmount()
  jest.useRealTimers()
})
