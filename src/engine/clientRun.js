import store from '../store'
import { initGameData } from '../utils/games'
import { setPause } from '../store/reducer/pauseSlice'
import { setLock } from '../store/reducer/lockSlice'
import { setSpeed } from '../store/reducer/speedSlice'
import { setLevels } from '../store/reducer/levelsSlice'
import { setScore } from '../store/reducer/gamesSlice'
import { setTetris } from '../store/reducer/tetrisSlice'
import { setSnake } from '../store/reducer/snakeSlice'
import { setShooting } from '../store/reducer/shootingSlice'
import { setRacing } from '../store/reducer/racingSlice'
import { setBreakout } from '../store/reducer/breakoutSlice'
import { setTank } from '../store/reducer/tankSlice'
import { startRun, finishRun } from '../api/client'
import { publishVerifiedRun } from '../api/runResults'
import { publishRunMode } from '../api/runMode'
import { createInitialState, step, isAllowedAction, RULES_VERSION, TICK_RATE, MAX_TICKS, MAX_EVENTS } from './replay'

const gameSetters = {
  tank: setTank,
  tetris: setTetris,
  snake: setSnake,
  shooting: setShooting,
  racing: setRacing,
  breakout: setBreakout
}

let active = null
let starting = false
let generation = 0

const localSeed = () => {
  const words = new Uint32Array(1)
  window.crypto.getRandomValues(words)
  return words[0] || 1
}

const publishState = (run, force = false) => {
  const previous = run.published
  const current = run.state
  if (force || !previous || JSON.stringify(previous.game) !== JSON.stringify(current.game)) {
    store.dispatch(gameSetters[run.gameId](current.game))
  }
  if (force || !previous || previous.score !== current.score) {
    store.dispatch(setScore({ game: run.gameIndex, score: current.score }))
  }
  if (force || !previous || previous.currentLevel !== current.currentLevel) {
    store.dispatch(setLevels(current.currentLevel))
  }
  if (force || !previous || previous.speed !== current.speed) {
    store.dispatch(setSpeed(current.speed))
  }
  if (force || !previous || previous.paused !== current.paused) {
    store.dispatch(setPause(current.paused ? 2 : 1))
    store.dispatch(setLock(current.paused))
  }
  run.published = current
}

const completeRun = (run) => {
  clearInterval(run.timer)
  run.timer = null
  run.queue.length = 0
  if (!run.runId) return
  const { runId, gameId, state, events } = run
  finishRun(runId, {
    rulesVersion: RULES_VERSION,
    totalTicks: state.tick,
    actions: events
  }).then(result => {
    if (result.verified === true) {
      publishVerifiedRun({ runId, gameId, ...result })
    }
  }).catch(() => {
    // A failed verification never opens the nickname form.
  })
}

const advance = (run) => {
  if (active !== run || run.state.terminal) return
  if (run.state.tick >= MAX_TICKS) {
    resetGame()
    return
  }
  const action = run.queue.shift() || null
  try {
    const next = step(run.state, action)
    if (action) run.events.push({ tick: next.tick, action })
    run.state = next
    publishState(run)
    if (next.terminal) completeRun(run)
  } catch (error) {
    resetGame()
  }
}

export const startGame = async () => {
  if (starting || active || store.getState().pause !== 0) return
  starting = true
  const startToken = ++generation
  const { game, levels, speed } = store.getState()
  const gameId = initGameData[game].name
  let session = null
  let casualReason = 'RANKED_UNAVAILABLE'
  try {
    session = await startRun({ gameId, startLevel: levels, startSpeed: speed })
    if (session.rulesVersion !== RULES_VERSION || session.tickRate !== TICK_RATE || session.startSpeed !== speed || !session.runId) {
      session = null
    }
  } catch (error) {
    if (error.code === 'NETWORK_ERROR') casualReason = 'NETWORK_ERROR'
    session = null
  }
  if (startToken !== generation || store.getState().game !== game || store.getState().levels !== levels || store.getState().pause !== 0) {
    starting = false
    return
  }
  const seed = session ? session.seed : localSeed()
  let state
  try {
    state = createInitialState(gameId, seed, levels, speed)
  } catch (error) {
    session = null
    state = createInitialState(gameId, localSeed(), levels, speed)
  }
  const run = {
    gameId,
    gameIndex: game,
    runId: session ? session.runId : null,
    state,
    events: [],
    queue: [],
    timer: null,
    published: null
  }
  active = run
  starting = false
  publishRunMode(session ? { mode: 'ranked' } : { mode: 'casual', reason: casualReason })
  publishState(run, true)
  run.timer = setInterval(() => advance(run), 1000 / TICK_RATE)
}

export const queueAction = (gameId, action) => {
  const run = active
  if (!run || run.gameId !== gameId || !isAllowedAction(gameId, action) || run.state.terminal || run.state.paused || run.queue.length >= 4 || run.events.length >= MAX_EVENTS) return
  run.queue.push(action)
}

export const togglePause = () => {
  const run = active
  if (!run || run.state.terminal) return
  run.queue.length = 0
  run.queue.push(run.state.paused ? 'resume' : 'pause')
}

export const resetGame = () => {
  generation++
  starting = false
  if (active) clearInterval(active.timer)
  active = null
  publishRunMode({ mode: 'idle' })
  const { game } = store.getState()
  store.dispatch(setPause(0))
  store.dispatch(setSpeed(1))
  store.dispatch(setLevels(1))
  store.dispatch(setScore({ game, score: 0 }))
  store.dispatch(setLock(false))
}

export const finishDisplay = () => {
  if (active && active.state.terminal) resetGame()
}
