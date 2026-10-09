import { GAME_IDS } from './registry'
import { createInitialState, isAllowedAction, step, stepReplay, verifyReplay, MAX_TICKS } from './replay'
import Tetris from '../games/tetris/tetris'

const firstActions = {
  tank: 'rotate',
  tetris: 'down',
  snake: 'right',
  shooting: 'rotate',
  racing: 'left',
  breakout: 'left'
}

describe('shared deterministic game engine', () => {
  test.each(GAME_IDS)('%s starts and steps identically for the same seed', gameId => {
    const original = createInitialState(gameId, 123456789, 3)
    const snapshot = JSON.stringify(original)
    const action = firstActions[gameId]
    const first = step(original, action)
    const second = step(createInitialState(gameId, 123456789, 3), action)
    expect(first).toEqual(second)
    expect(JSON.stringify(original)).toBe(snapshot)
    expect(first.tick).toBe(1)
    expect(Number.isSafeInteger(first.score)).toBe(true)
  })

  test('random seeds produce different starting pieces and boards', () => {
    expect(createInitialState('tetris', 1, 5).game).not.toEqual(createInitialState('tetris', 2, 5).game)
  })

  test.each([[1, 100], [2, 300], [3, 700], [4, 1500]])('Tetris clear of %i lines awards %i points', (lines, points) => {
    const matrix = Array.from({ length: 20 }, (_, row) => Array(10).fill(row >= 20 - lines ? 1 : 0))
    const game = new Tetris({ levels: 1, matrix, next: 'O', shape: [[1]], xy: [0, 0], score: 0 })
    game.clear()
    expect(game.score).toBe(points)
    expect(game.matrix).toHaveLength(20)
  })

  test('invalid actions, fabricated early finish, and continued play are rejected', () => {
    expect(isAllowedAction('breakout', 'down')).toBe(false)
    expect(() => step(createInitialState('breakout', 1, 1), 'down')).toThrow()
    expect(() => verifyReplay({ gameId: 'breakout', seed: 1, startLevel: 1, totalTicks: 1, events: [] })).toThrow()
    expect(() => verifyReplay({ gameId: 'snake', seed: 1, startLevel: 1, totalTicks: 2,
      events: [{ tick: 1, action: 'right' }, { tick: 1, action: 'up' }] })).toThrow()
  })

  test('a real terminal Snake trace verifies its score, while changed input does not', () => {
    let state = createInitialState('snake', 89, 1)
    const events = [{ tick: 1, action: 'left' }]
    while (!state.terminal && state.tick < 500) {
      state = step(state, state.tick === 0 ? 'left' : null)
    }
    expect(state.terminal).toBe(true)
    expect(verifyReplay({ gameId: 'snake', seed: 89, startLevel: 1, totalTicks: state.tick, events })).toEqual({
      terminal: true, rawScore: state.score
    })
    expect(() => verifyReplay({ gameId: 'snake', seed: 89, startLevel: 1, totalTicks: state.tick,
      events: [{ tick: 1, action: 'right' }] })).toThrow()
  })

  test('pause consumes ticks without changing the game or score', () => {
    const start = createInitialState('racing', 7, 2)
    const paused = step(start, 'pause')
    let state = paused
    for (let i = 0; i < 25; i++) state = step(state)
    expect(state.game).toEqual(start.game)
    expect(state.score).toBe(0)
    expect(step(state, 'resume').paused).toBe(false)
  })

  test('selected speed is pinned for the run and affects timed movement', () => {
    let fast = createInitialState('racing', 7, 1, 6)
    let slow = createInitialState('racing', 7, 1, 1)
    for (let i = 0; i < 4; i++) {
      fast = step(fast)
      slow = step(slow)
    }
    expect(fast.speed).toBe(6)
    expect(slow.speed).toBe(1)
    expect(fast.score).toBe(10)
    expect(slow.score).toBe(0)
    expect(step(createInitialState('tetris', 7, 1, 6)).speed).toBe(6)
  })

  test.each(GAME_IDS)('%s stays deterministic across seeds, levels, and input timing', gameId => {
    for (const seed of [1, 89, 0xffffffff]) {
      for (const level of [1, 7]) {
        const speed = level === 1 ? 1 : 6
        let a = createInitialState(gameId, seed, level, speed)
        let b = createInitialState(gameId, seed, level, speed)
        for (let tick = 1; tick <= 240 && !a.terminal; tick++) {
          let action = null
          if (gameId === 'tetris' && tick % 3 === 0) action = 'down'
          if (gameId === 'snake' && tick === 1) action = 'right'
          if (gameId === 'shooting' && tick % 17 === 0) action = 'rotate'
          if (gameId === 'racing' && tick % 29 === 0) action = tick % 2 ? 'left' : 'right'
          if (gameId === 'breakout' && tick % 37 === 0) action = tick % 2 ? 'left' : 'right'
          if (gameId === 'tank' && tick % 11 === 0) action = 'rotate'
          a = step(a, action)
          b = step(b, action)
        }
        expect(a).toEqual(b)
      }
    }
  })

  test.each(GAME_IDS)('%s optimized replay step matches the immutable UI step', gameId => {
    for (const seed of [1, 4343]) {
      for (const level of [1, 7]) {
        for (const speed of [1, 6]) {
          let client = createInitialState(gameId, seed, level, speed)
          let replay = createInitialState(gameId, seed, level, speed)
          for (let tick = 1; tick <= 240 && !client.terminal; tick++) {
            const action = tick === 2 ? 'pause' : tick === 12 ? 'resume' :
              !client.paused && tick % 7 === 0 ? firstActions[gameId] : null
            client = step(client, action)
            replay = stepReplay(replay, action)
            expect(replay).toEqual(client)
          }
        }
      }
    }
  })

  test.each(GAME_IDS)('%s verifies an exact 12k-tick pause-padded terminal trace', gameId => {
    let state = createInitialState(gameId, 4343, 1, 6)
    const events = []
    while (!state.terminal && state.tick < MAX_TICKS) {
      const action = gameId === 'tetris' && state.tick % 2 === 0 ? 'down' :
        gameId === 'snake' && state.tick === 0 ? 'left' : null
      state = step(state, action)
      if (action) events.push({ tick: state.tick, action })
    }
    expect(state.terminal).toBe(true)
    const shift = MAX_TICKS - state.tick
    expect(shift).toBeGreaterThan(1)
    const padded = [{ tick: 1, action: 'pause' }, { tick: shift, action: 'resume' },
      ...events.map(event => ({ tick: event.tick + shift, action: event.action }))]
    const session = { gameId, seed: 4343, startLevel: 1, startSpeed: 6, totalTicks: MAX_TICKS }
    expect(verifyReplay({ ...session, events: padded })).toEqual({ terminal: true, rawScore: state.score })
    expect(() => verifyReplay({ ...session, events: [padded[0], { tick: 2, action: 'left' }, ...padded.slice(1)] })).toThrow()
  })

  test.each(['tetris', 'shooting', 'racing', 'breakout', 'tank'])('%s terminal trace replays exactly', gameId => {
    let state = createInitialState(gameId, 4343, 1, 6)
    const events = []
    while (!state.terminal && state.tick < 6000) {
      const action = gameId === 'tetris' && state.tick % 2 === 0 ? 'down' : null
      state = step(state, action)
      if (action) events.push({ tick: state.tick, action })
    }
    expect(state.terminal).toBe(true)
    expect(verifyReplay({ gameId, seed: 4343, startLevel: 1, startSpeed: 6, totalTicks: state.tick, events })).toEqual({
      terminal: true, rawScore: state.score
    })
  })
})
