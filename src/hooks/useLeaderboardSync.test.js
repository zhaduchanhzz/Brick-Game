import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import useLeaderboardSync from './useLeaderboardSync'
import leaderboardReducer, { GAME_IDS } from '../store/reducer/leaderboardSlice'

class FakeSocket {
  constructor() {
    this.readyState = FakeSocket.CONNECTING
    FakeSocket.instances.push(this)
  }
  close() { this.readyState = FakeSocket.CLOSED }
  emit(payload) { if (this.onmessage) this.onmessage({ data: JSON.stringify(payload) }) }
}

FakeSocket.instances = []
FakeSocket.CONNECTING = 0
FakeSocket.OPEN = 1
FakeSocket.CLOSING = 2
FakeSocket.CLOSED = 3

function HookView({ gameId }) {
  const { games, status } = useLeaderboardSync()
  return <div>{status}: {gameId} v{games[gameId].version}</div>
}

test('one bootstrap, no fetch on game switch, and only changed boards refresh on WS versions', async () => {
  const snapshot = { globalVersion: 0, games: Object.fromEntries(GAME_IDS.map(id => [id, { version: 0, entries: [] }])) }
  const calls = []
  window.fetch = jest.fn(async url => {
    calls.push(url)
    if (url === '/api/leaderboards') return { ok: true, json: async () => snapshot }
    const gameId = new URL(url, 'https://example.test').searchParams.get('gameId')
    return { ok: true, json: async () => ({ gameId, version: gameId === 'snake' ? 2 : 1, entries: [], globalVersion: 2 }) }
  })
  window.WebSocket = FakeSocket
  const store = configureStore({ reducer: { leaderboard: leaderboardReducer } })
  const view = render(<React.StrictMode><Provider store={store}><HookView gameId="tank" /></Provider></React.StrictMode>)
  await waitFor(() => expect(screen.getByText('ready: tank v0')).toBeTruthy())
  expect(calls).toEqual(['/api/leaderboards'])

  view.rerender(<React.StrictMode><Provider store={store}><HookView gameId="tetris" /></Provider></React.StrictMode>)
  expect(screen.getByText('ready: tetris v0')).toBeTruthy()
  expect(calls).toEqual(['/api/leaderboards'])

  const socket = FakeSocket.instances[FakeSocket.instances.length - 1]
  act(() => {
    socket.emit({ type: 'leaderboard.updated', gameId: 'tetris', version: 1 })
    socket.emit({ type: 'leaderboard.updated', gameId: 'tetris', version: 1 })
  })
  await waitFor(() => expect(screen.getByText('ready: tetris v1')).toBeTruthy())
  expect(calls.filter(url => url.includes('gameId=tetris'))).toHaveLength(1)

  act(() => socket.emit({ type: 'leaderboard.sync', versions: { ...Object.fromEntries(GAME_IDS.map(id => [id, 0])), tetris: 1, snake: 2 } }))
  await waitFor(() => expect(store.getState().leaderboard.games.snake.version).toBe(2))
  expect(calls.filter(url => url.includes('gameId=snake'))).toHaveLength(1)
  expect(calls).toHaveLength(3)
  view.unmount()
})
