import React from 'react'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n'
import LeaderboardPanel from './LeaderboardPanel'

const board = {
  version: 2,
  entries: [{ rank: 1, nickname: 'Ace', startLevel: 4, finalScore: 12000, achievedAt: '2026-10-10T00:00:00.000Z' }],
}

function panel(locale, props = {}) {
  return <I18nProvider locale={locale}><LeaderboardPanel gameId="tetris" board={board} status="ready" connection="online" onRetry={() => {}} {...props} /></I18nProvider>
}

test('leaderboard copy, game names and numbers follow the chosen language', () => {
  const view = render(panel('vi'))
  expect(screen.getByRole('complementary', { name: 'Bảng xếp hạng XẾP HÌNH' })).toBeTruthy()
  expect(screen.getByRole('columnheader', { name: 'Người chơi' })).toBeTruthy()
  expect(screen.getByText('12.000')).toBeTruthy()

  view.rerender(panel('en'))
  expect(screen.getByRole('complementary', { name: 'TETRIS leaderboard' })).toBeTruthy()
  expect(screen.getByRole('columnheader', { name: 'Player' })).toBeTruthy()
  expect(screen.getByText('12,000')).toBeTruthy()

  view.rerender(panel('zh-CN'))
  expect(screen.getByRole('complementary', { name: '俄罗斯方块 排行榜' })).toBeTruthy()
  expect(screen.getByRole('columnheader', { name: '玩家' })).toBeTruthy()
})

test('network errors display translated messages, not raw backend text', () => {
  render(panel('vi', { status: 'error', error: 'NETWORK_ERROR' }))
  expect(screen.getByRole('alert').textContent).toContain('Không kết nối được máy chủ')
  expect(screen.getByRole('alert').textContent).not.toContain('NETWORK_ERROR')
})
