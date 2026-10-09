import { createSlice } from '@reduxjs/toolkit'
import { GAME_IDS } from '../../engine/registry'

export { GAME_IDS }

const emptyGames = () => Object.fromEntries(GAME_IDS.map(id => [id, { version: 0, entries: [] }]))

const leaderboardSlice = createSlice({
  name: 'leaderboard',
  initialState: { games: emptyGames(), status: 'loading', connection: 'connecting', error: null, globalVersion: 0 },
  reducers: {
    setLeaderboardSnapshot(state, action) {
      state.games = action.payload.games
      state.globalVersion = action.payload.globalVersion || 0
      state.status = 'ready'
      state.error = null
    },
    setLeaderboardGame(state, action) {
      const { gameId, version, entries, globalVersion } = action.payload
      if (state.games[gameId] && version > state.games[gameId].version) {
        state.games[gameId] = { version, entries }
      }
      if (Number.isSafeInteger(globalVersion)) state.globalVersion = Math.max(state.globalVersion, globalVersion)
    },
    setLeaderboardError(state, action) {
      state.status = 'error'
      state.error = action.payload
    },
    setLeaderboardConnection(state, action) {
      state.connection = action.payload
    },
  },
})

export const { setLeaderboardSnapshot, setLeaderboardGame, setLeaderboardError, setLeaderboardConnection } = leaderboardSlice.actions
export default leaderboardSlice.reducer
