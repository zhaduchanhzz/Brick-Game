import { GAME_IDS, MAX_LEVEL } from './registry'
import { nextRandom } from './prng'
import Tetris, { createNewTetris, originXY, speeds as tetrisSpeeds } from '../games/tetris/tetris'
import { blockShape } from '../games/tetris/block'
import Snake, { createNewSnake, speeds as snakeSpeeds } from '../games/snake/snake'
import Shooting, { createNewShooting, speeds as shootingSpeeds } from '../games/shooting/shooting'
import Racing, { createNewRacing, speeds as racingSpeeds } from '../games/racing'
import Breakout, { createNewBreakout, initPaddleY, initX, initY } from '../games/breakout/breakout'
import Tank, { createNewTank } from '../games/tank/tank'

export const RULES_VERSION = 2
export const TICK_RATE = 20
export const MAX_TICKS = 12000
export const MAX_EVENTS = 6000
export const SUPPORTED_RANKED_GAMES = GAME_IDS

const TICK_MS = 1000 / TICK_RATE
const directionActions = ['left', 'right', 'up', 'down']
const actionsByGame = {
  tank: [...directionActions, 'rotate'],
  tetris: [...directionActions, 'rotate'],
  snake: directionActions,
  shooting: ['left', 'right', 'up', 'rotate'],
  racing: ['left', 'right', 'up'],
  breakout: ['left', 'right']
}
export const isAllowedAction = (gameId, action) => Boolean(actionsByGame[gameId] && actionsByGame[gameId].includes(action))

const validSeed = (seed) => Number.isInteger(Number(seed)) && Number(seed) > 0 && Number(seed) <= 0xffffffff
const randomFor = (state) => () => nextRandom(state)
const cloneGame = (game) => JSON.parse(JSON.stringify(game))
const speedFor = (score) => Math.max(1, Math.min(6, Math.ceil(score / 3000)))
const breakoutSpeeds = [300, 275, 250, 225, 200, 175]
const tankEnemyTicks = [20, 18, 16, 14, 12, 10]

export const createInitialState = (gameId, seed, startLevel, startSpeed = 1) => {
  if (!GAME_IDS.includes(gameId) || !validSeed(seed) || !Number.isInteger(startLevel) || startLevel < 1 || startLevel > MAX_LEVEL ||
      !Number.isInteger(startSpeed) || startSpeed < 1 || startSpeed > 6) {
    throw new Error('Invalid game session')
  }
  const state = {
    gameId,
    tick: 0,
    startLevel,
    currentLevel: startLevel,
    speed: startSpeed,
    startSpeed,
    score: 0,
    rngState: Number(seed) >>> 0,
    terminal: false,
    paused: false,
    autoMs: 0,
    shotTicks: 0,
    bulletTicks: 0,
    enemyTicks: 0,
    game: null
  }
  const rng = randomFor(state)
  switch (gameId) {
  case 'tetris': state.game = createNewTetris({ levels: startLevel, rng }).toJsObj(); break
  case 'snake': state.game = createNewSnake({ levels: startLevel }, rng).toJsObj(); break
  case 'shooting': state.game = createNewShooting(rng).toJsObj(); break
  case 'racing': state.game = createNewRacing(rng).toJsObj(); break
  case 'breakout': state.game = createNewBreakout({ x: initX, y: initY, paddleY: initPaddleY }).toJsObj(); break
  case 'tank': state.game = createNewTank(rng).toJsObj(); break
  default: throw new Error('Unknown game')
  }
  return state
}

const moveTetris = (state, game, action, rng) => {
  if (action === 'up') {
    while (game.checkMove('down')) game.move('down')
    return
  }
  if (game.move(action)) return
  if (action !== 'down') return
  game.draw()
  const fullRows = game.matrix.filter(row => row.every(Boolean)).length
  if (fullRows > 0) {
    game.clear()
    game.incLevels()
  }
  game.xy = [...originXY]
  game.shape = blockShape[game.next]
  game.next = Tetris.getNextType(rng)
  state.currentLevel = game.levels
  state.score = game.score
}

const runSnake = (state, game) => {
  if (!game.direction) return true
  const [x, y] = game.getNextXY()
  if (x === game.bodies[1][0] && y === game.bodies[1][1]) return false
  const ate = game.move()
  if (ate) {
    state.score += 100
    state.currentLevel++
    return true
  }
  if (game.getDeath()) return false
  state.score += 10
  return true
}

const runShooting = (state, game) => {
  if (game.run()) state.score += 10
}

const runRacing = (state, game) => {
  game.run()
  if (game.death) return
  state.score += 10
  state.currentLevel = Math.max(state.startLevel, state.score / 10)
}

const runBreakout = (state, game) => {
  game.run()
  if (!game.death && game.collisionDetection()) state.score += 100
}

const runTank = (state, game) => {
  game.run()
  game.draw()
  game.enemiesFire()
  game.draw()
  state.score = game.score
}

const advance = (state, action, copyGame) => {
  if (!state || state.terminal || !GAME_IDS.includes(state.gameId) || !Number.isInteger(state.tick) || state.tick >= MAX_TICKS) {
    throw new Error('Game already finished or invalid')
  }
  if (action !== null && action !== 'pause' && action !== 'resume' && !actionsByGame[state.gameId].includes(action)) {
    throw new Error('Invalid game action')
  }
  const next = { ...state, tick: state.tick + 1, game: copyGame ? cloneGame(state.game) : state.game }
  if (action === 'pause') {
    if (next.paused) throw new Error('Already paused')
    next.paused = true
    return next
  }
  if (action === 'resume') {
    if (!next.paused) throw new Error('Not paused')
    next.paused = false
    return next
  }
  if (next.paused) {
    if (action !== null) throw new Error('Input while paused')
    return next
  }

  const rng = randomFor(next)
  let game
  switch (next.gameId) {
  case 'tetris': {
    game = new Tetris(next.game)
    if (action) moveTetris(next, game, action, rng)
    next.autoMs += TICK_MS
    const interval = tetrisSpeeds[next.speed - 1]
    if (next.autoMs >= interval) {
      next.autoMs -= interval
      moveTetris(next, game, 'down', rng)
    }
    next.score = game.score
    next.terminal = game.isDead()
    break
  }
  case 'snake': {
    game = new Snake({ ...next.game, rng })
    if (action && directionActions.includes(action)) {
      const oldDirection = game.direction
      game.direction = action
      if (!runSnake(next, game)) game.direction = oldDirection
    }
    next.autoMs += TICK_MS
    const interval = snakeSpeeds[next.speed - 1]
    if (next.autoMs >= interval && game.direction) {
      next.autoMs -= interval
      runSnake(next, game)
    }
    next.terminal = game.getDeath()
    break
  }
  case 'shooting': {
    game = new Shooting({ ...next.game, rng })
    if (action === 'left' || action === 'right') game.move(action)
    if (action === 'up') runShooting(next, game)
    if (next.shotTicks > 0 && --next.shotTicks === 0) {
      if (game.shootStone()) {
        next.score += 100
        next.currentLevel++
      }
      game.stopShoot()
    }
    if (action === 'rotate' && !game.fire) {
      game.shoot()
      next.shotTicks = 2
    }
    next.autoMs += TICK_MS
    const interval = shootingSpeeds[next.speed - 1]
    if (next.autoMs >= interval) {
      next.autoMs -= interval
      runShooting(next, game)
    }
    next.terminal = game.getDeath()
    break
  }
  case 'racing': {
    game = new Racing({ ...next.game, rng })
    if (action === 'left' || action === 'right') game.move(action)
    if (action === 'up') runRacing(next, game)
    next.autoMs += TICK_MS
    const interval = racingSpeeds[next.speed - 1]
    if (next.autoMs >= interval) {
      next.autoMs -= interval
      runRacing(next, game)
    }
    next.terminal = game.death
    break
  }
  case 'breakout': {
    game = new Breakout(next.game)
    if (action) game.move(action)
    next.autoMs += TICK_MS
    const interval = breakoutSpeeds[next.speed - 1]
    if (next.autoMs >= interval) {
      next.autoMs -= interval
      runBreakout(next, game)
    }
    next.terminal = game.death
    break
  }
  case 'tank': {
    game = new Tank({ ...next.game, rng })
    if (directionActions.includes(action)) game.move(action)
    if (action === 'rotate' && game.bullet === null) game.fire()
    game.draw()
    next.bulletTicks++
    if (next.bulletTicks >= 2) {
      next.bulletTicks = 0
      if (game.bullet) game.fire()
      game.runEnemiesBullet()
      game.draw()
    }
    next.enemyTicks++
    if (next.enemyTicks >= tankEnemyTicks[next.speed - 1]) {
      next.enemyTicks = 0
      runTank(next, game)
    }
    next.score = game.score
    next.terminal = game.death
    break
  }
  default: throw new Error('Unknown game')
  }
  next.speed = Math.max(next.startSpeed, speedFor(next.score))
  next.game = game.toJsObj()
  if (!Number.isSafeInteger(next.score) || next.score < 0) throw new Error('Invalid score')
  return next
}

// The UI retains prior states for rendering, so its public step remains immutable.
// Verification discards each prior state immediately and can avoid a JSON copy.
export const step = (state, action = null) => advance(state, action, true)
export const stepReplay = (state, action = null) => advance(state, action, false)

export const verifyReplay = ({ gameId, seed, startLevel, startSpeed = 1, totalTicks, events }) => {
  if (!Number.isInteger(totalTicks) || totalTicks < 1 || totalTicks > MAX_TICKS || !Array.isArray(events) || events.length > MAX_EVENTS) {
    throw new Error('Invalid replay bounds')
  }
  let state = createInitialState(gameId, seed, startLevel, startSpeed)
  let eventIndex = 0
  let previousTick = 0
  for (const event of events) {
    if (!event || !Number.isInteger(event.tick) || event.tick <= previousTick || event.tick > totalTicks || typeof event.action !== 'string') {
      throw new Error('Invalid replay event')
    }
    previousTick = event.tick
  }
  for (let tick = 1; tick <= totalTicks; tick++) {
    const action = eventIndex < events.length && events[eventIndex].tick === tick ? events[eventIndex++].action : null
    if (state.paused && action === null) {
      // No game state, RNG, or timer advances while paused. Jump over the
      // action-free interval without weakening event ordering or terminal checks.
      const nextEventTick = eventIndex < events.length ? events[eventIndex].tick : totalTicks + 1
      const lastPausedTick = Math.min(totalTicks, nextEventTick - 1)
      state = { ...state, tick: lastPausedTick }
      tick = lastPausedTick
      continue
    }
    state = stepReplay(state, action)
    if (state.terminal && tick !== totalTicks) throw new Error('Replay continued after game over')
  }
  if (!state.terminal || eventIndex !== events.length) throw new Error('Game did not end')
  return { terminal: true, rawScore: state.score }
}
