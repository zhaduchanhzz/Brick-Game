import { useCallback, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { ApiError, getLeaderboard, getLeaderboards } from '../api/client'
import { GAME_IDS, setLeaderboardConnection, setLeaderboardError, setLeaderboardGame, setLeaderboardSnapshot } from '../store/reducer/leaderboardSlice'

const GAME_ID_SET = new Set(GAME_IDS)
let initialSnapshotRequest = null

function loadInitialSnapshot() {
  if (!initialSnapshotRequest) {
    initialSnapshotRequest = getLeaderboards().catch(error => {
      initialSnapshotRequest = null
      throw error
    })
  }
  return initialSnapshotRequest
}

function validBoard(board) {
  return board && Number.isSafeInteger(board.version) && board.version >= 0 && Array.isArray(board.entries)
}

function validateSnapshot(snapshot) {
  if (!snapshot || !snapshot.games || GAME_IDS.some(id => !validBoard(snapshot.games[id]))) {
    throw new ApiError('INCOMPLETE_LEADERBOARD', 0, 'INCOMPLETE_LEADERBOARD')
  }
  return snapshot
}

function websocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/leaderboards`
}

export default function useLeaderboardSync() {
  const dispatch = useDispatch()
  const leaderboard = useSelector(state => state.leaderboard)
  const notifyRef = useRef(() => {})
  const retryRef = useRef(() => {})

  useEffect(() => {
    let stopped = false
    let socket = null
    let reconnectTimer = null
    let reconnectAttempt = 0
    const refreshTimers = new Map()
    const inFlight = new Set()
    const wantedVersions = {}
    const cachedVersions = {}

    function scheduleRefresh(gameId, delay = 80) {
      if (refreshTimers.has(gameId) || inFlight.has(gameId) || stopped) return
      const timer = window.setTimeout(() => {
        refreshTimers.delete(gameId)
        refreshGame(gameId)
      }, delay)
      refreshTimers.set(gameId, timer)
    }

    async function refreshGame(gameId) {
      if (stopped || inFlight.has(gameId) || wantedVersions[gameId] <= cachedVersions[gameId]) return
      inFlight.add(gameId)
      let retryDelay = 500
      try {
        const board = await getLeaderboard(gameId)
        if (!validBoard(board) || board.gameId !== gameId) throw new Error('Invalid leaderboard response.')
        if (stopped) return
        if (board.version > cachedVersions[gameId]) {
          cachedVersions[gameId] = board.version
          dispatch(setLeaderboardGame(board))
        }
      } catch (_error) {
        retryDelay = 3000
      } finally {
        inFlight.delete(gameId)
        if (!stopped && wantedVersions[gameId] > cachedVersions[gameId]) scheduleRefresh(gameId, retryDelay)
      }
    }

    function noticeVersion(gameId, version) {
      if (!GAME_ID_SET.has(gameId) || !Number.isSafeInteger(version) || version < 0) return
      wantedVersions[gameId] = Math.max(wantedVersions[gameId] || 0, version)
      if (version > (cachedVersions[gameId] || 0)) scheduleRefresh(gameId)
    }

    notifyRef.current = noticeVersion

    function scheduleReconnect() {
      if (stopped || reconnectTimer !== null) return
      dispatch(setLeaderboardConnection('offline'))
      const cap = Math.min(30000, 1000 * (2 ** Math.min(reconnectAttempt, 5)))
      const wait = Math.round(cap * (0.8 + Math.random() * 0.4))
      reconnectAttempt += 1
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        connect()
      }, wait)
    }

    function connect() {
      if (stopped) return
      if (!window.WebSocket) {
        dispatch(setLeaderboardConnection('offline'))
        return
      }
      if (socket && socket.readyState < WebSocket.CLOSING) return
      let currentSocket
      try {
        currentSocket = new WebSocket(websocketUrl())
        socket = currentSocket
      } catch (_error) {
        scheduleReconnect()
        return
      }
      dispatch(setLeaderboardConnection('connecting'))
      currentSocket.onopen = () => {
        if (stopped || socket !== currentSocket) return
        reconnectAttempt = 0
        dispatch(setLeaderboardConnection('online'))
      }
      currentSocket.onmessage = event => {
        if (stopped || socket !== currentSocket) return
        let message
        try { message = JSON.parse(event.data) } catch (_error) { return }
        if (message.type === 'leaderboard.updated') {
          noticeVersion(message.gameId, message.version)
        } else if (message.type === 'leaderboard.sync' && message.versions && typeof message.versions === 'object') {
          GAME_IDS.forEach(id => noticeVersion(id, message.versions[id]))
        }
      }
      currentSocket.onclose = () => {
        if (socket === currentSocket) scheduleReconnect()
      }
      currentSocket.onerror = () => currentSocket.close()
    }

    async function bootstrap() {
      try {
        const snapshot = validateSnapshot(await loadInitialSnapshot())
        if (stopped) return
        GAME_IDS.forEach(id => {
          cachedVersions[id] = snapshot.games[id].version
          wantedVersions[id] = snapshot.games[id].version
        })
        dispatch(setLeaderboardSnapshot(snapshot))
        connect()
      } catch (error) {
        if (!stopped) dispatch(setLeaderboardError(error.code || 'REQUEST_FAILED'))
      }
    }

    retryRef.current = bootstrap
    bootstrap()

    function onVisibilityChange() {
      if (document.visibilityState !== 'visible' || stopped) return
      if (!socket || socket.readyState >= WebSocket.CLOSING) {
        if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
        reconnectTimer = null
        connect()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      stopped = true
      notifyRef.current = () => {}
      retryRef.current = () => {}
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      refreshTimers.forEach(timer => window.clearTimeout(timer))
      if (socket) {
        socket.onclose = null
        socket.close()
      }
    }
  }, [dispatch])

  const notifyVersion = useCallback((gameId, version) => notifyRef.current(gameId, version), [])
  const retry = useCallback(() => retryRef.current(), [])
  return { ...leaderboard, notifyVersion, retry }
}
