import { getLeaderboards, startRun } from './client'
import { LOCALE_STORAGE_KEY } from '../i18n'

const originalFetch = window.fetch

afterEach(() => {
  window.fetch = originalFetch
  window.localStorage.clear()
})

test('API requests send the selected locale without changing the JSON contract', async () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'zh-CN')
  window.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ games: {} }) })

  await getLeaderboards()
  expect(window.fetch).toHaveBeenCalledWith('/api/leaderboards', expect.objectContaining({
    headers: { 'Accept-Language': 'zh-CN' },
  }))

  await startRun({ gameId: 'tetris', startLevel: 1, startSpeed: 1 })
  expect(window.fetch).toHaveBeenLastCalledWith('/api/runs', expect.objectContaining({
    method: 'POST',
    headers: { 'Accept-Language': 'zh-CN', 'Content-Type': 'application/json' },
  }))
})

test('API requests default to Vietnamese without a stored selection', async () => {
  window.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ games: {} }) })
  await getLeaderboards()
  expect(window.fetch.mock.calls[0][1].headers['Accept-Language']).toBe('vi')
})
