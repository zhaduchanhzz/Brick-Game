import store from '../store'
import { startRun } from '../api/client'
import { queueAction, resetGame, startGame } from './clientRun'
import { RULES_VERSION, TICK_RATE } from './replay'

jest.mock('../api/client', () => ({ startRun: jest.fn(), finishRun: jest.fn() }))

const session = (runId, seed) => ({ runId, seed, rulesVersion: RULES_VERSION, tickRate: TICK_RATE, startSpeed: 1 })

test('Tank creates a fresh ticking run after reset', async () => {
  jest.useFakeTimers()
  try {
    startRun.mockResolvedValueOnce(session('first', 7)).mockResolvedValueOnce(session('second', 10))

    await startGame()
    expect(store.getState().pause).toBe(1)
    queueAction('tank', 'rotate')
    jest.advanceTimersByTime(50)
    expect(store.getState().tank.bullet).not.toBeNull()

    resetGame()
    expect(store.getState().pause).toBe(0)
    await startGame()
    expect(store.getState().pause).toBe(1)
    expect(store.getState().tank.bullet).toBeNull()
    let sawEnemy = false
    let sawEnemyMovement = false
    let previousEnemies = JSON.stringify(store.getState().tank.enemies)
    let previousEnemyCount = store.getState().tank.enemies.length
    for (let tick = 0; tick < 200 && !sawEnemyMovement; tick++) {
      jest.advanceTimersByTime(50)
      const enemies = store.getState().tank.enemies
      const currentEnemies = JSON.stringify(enemies)
      if (enemies.length) sawEnemy = true
      if (previousEnemyCount && enemies.length && currentEnemies !== previousEnemies) sawEnemyMovement = true
      previousEnemies = currentEnemies
      previousEnemyCount = enemies.length
    }
    expect(sawEnemy).toBe(true)
    expect(sawEnemyMovement).toBe(true)
    queueAction('tank', 'rotate')
    jest.advanceTimersByTime(50)
    expect(store.getState().tank.bullet).not.toBeNull()
  } finally {
    resetGame()
    jest.useRealTimers()
  }
})
