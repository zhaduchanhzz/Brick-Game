import { finishRun, startRun } from '../api/client'
import { publishRunMode, subscribeRunMode } from '../api/runMode'
import { subscribeVerifiedRun } from '../api/runResults'
import { finishDisplay, resetGame, startGame } from './clientRun'

jest.mock('../api/client', () => ({ startRun: jest.fn(), finishRun: jest.fn() }))
jest.mock('./replay', () => ({
  RULES_VERSION: 1,
  TICK_RATE: 20,
  MAX_TICKS: 12000,
  MAX_EVENTS: 1000,
  createInitialState: gameId => ({ gameId, game: {}, tick: 0, score: 0, currentLevel: 1, speed: 1, paused: false, terminal: false }),
  step: state => ({ ...state, tick: state.tick + 1, score: 10, terminal: true }),
  isAllowedAction: () => true,
}))

const session = { runId: 'run-1', seed: 1, rulesVersion: 1, tickRate: 20, startSpeed: 1 }

beforeEach(() => {
  jest.useFakeTimers()
  Object.defineProperty(window, 'crypto', {
    configurable: true,
    value: { getRandomValues: words => { words[0] = 123; return words } },
  })
  startRun.mockReset()
  startRun.mockResolvedValue(session)
  finishRun.mockReset()
  publishRunMode({ mode: 'idle' })
})

afterEach(() => {
  resetGame()
  jest.useRealTimers()
})

test('a terminal ranked run keeps verification visible after the machine resets, then opens a verified claim', async () => {
  const modes = []
  const results = []
  const unsubscribeMode = subscribeRunMode(value => modes.push(value.mode))
  const unsubscribeResult = subscribeVerifiedRun(value => results.push(value))
  finishRun.mockResolvedValue({ verified: true, eligibleToClaim: true, rawScore: 10, startLevel: 1, finalScore: 10 })

  await startGame()
  expect(modes[modes.length - 1]).toBe('ranked')
  jest.advanceTimersByTime(50)
  expect(modes[modes.length - 1]).toBe('verifying')
  finishDisplay()
  expect(modes[modes.length - 1]).toBe('verifying')
  await Promise.resolve()
  expect(modes[modes.length - 1]).toBe('qualified')
  expect(results).toEqual([expect.objectContaining({ runId: 'run-1', verified: true, eligibleToClaim: true })])

  unsubscribeMode()
  unsubscribeResult()
})

test('a failed finish request shows an error and never publishes a claim candidate', async () => {
  const modes = []
  const results = []
  const unsubscribeMode = subscribeRunMode(value => modes.push(value.mode))
  const unsubscribeResult = subscribeVerifiedRun(value => results.push(value))
  finishRun.mockRejectedValue({ code: 'NETWORK_ERROR' })

  await startGame()
  jest.advanceTimersByTime(50)
  finishDisplay()
  await Promise.resolve()
  await Promise.resolve()
  expect(modes[modes.length - 1]).toBe('verify-error')
  expect(results).toEqual([])

  unsubscribeMode()
  unsubscribeResult()
})

test('an explicitly reset run does not open a stale claim after verification returns', async () => {
  const results = []
  const unsubscribeResult = subscribeVerifiedRun(value => results.push(value))
  let resolveFinish
  finishRun.mockImplementation(() => new Promise(resolve => { resolveFinish = resolve }))

  await startGame()
  jest.advanceTimersByTime(50)
  resetGame()
  resolveFinish({ verified: true, eligibleToClaim: true, rawScore: 10, startLevel: 1, finalScore: 10 })
  await Promise.resolve()
  expect(results).toEqual([])

  unsubscribeResult()
})

test('an unavailable ranked server starts a casual run that cannot publish a claim candidate', async () => {
  const modes = []
  const results = []
  const unsubscribeMode = subscribeRunMode(value => modes.push(value))
  const unsubscribeResult = subscribeVerifiedRun(value => results.push(value))
  startRun.mockRejectedValue({ code: 'RANKED_UNAVAILABLE' })

  await startGame()
  expect(modes[modes.length - 1]).toEqual({ mode: 'casual', reason: 'RANKED_UNAVAILABLE' })
  jest.advanceTimersByTime(50)
  finishDisplay()
  expect(modes[modes.length - 1].mode).toBe('casual')
  expect(finishRun).not.toHaveBeenCalled()
  expect(results).toEqual([])

  unsubscribeMode()
  unsubscribeResult()
})
