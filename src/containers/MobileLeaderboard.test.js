import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MobileLeaderboard } from './index'
import { translate } from '../i18n'

const panelProps = {
  gameId: 'snake', board: { version: 2, entries: [] }, status: 'ready',
  connection: 'online', error: null, onRetry: jest.fn(), lastVerified: null,
}

test('mobile Top 10 opens an accessible overlay and restores focus on close', () => {
  render(<MobileLeaderboard panelProps={panelProps} />)
  const trigger = screen.getByRole('button', { name: translate('vi', 'app.topTenButton') })
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: translate('vi', 'app.topTenTitle') })
  expect(dialog.getAttribute('aria-modal')).toBe('true')
  expect(screen.getByLabelText(translate('vi', 'leaderboard.aria', { game: translate('vi', 'game.snake') }))).toBeTruthy()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: translate('vi', 'app.closeLeaderboard') }))
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  expect(document.body.style.overflow).toBe('')
})
