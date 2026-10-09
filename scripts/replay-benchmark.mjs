import { performance } from 'node:perf_hooks'
import { createRequire } from 'node:module'
import path from 'node:path'

// Transform only the local shared JS modules, in memory, so this runs without
// changing package module type or writing benchmark artifacts to the repo.
const require = createRequire(import.meta.url)
const babel = require('@babel/core')
const sourceRoot = path.resolve('src') + path.sep
const originalJsLoader = require.extensions['.js']
require.extensions['.js'] = (module, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalJsLoader(module, filename)
  const output = babel.transformFileSync(filename, {
    babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs']
  })
  module._compile(output.code, filename)
}
const { createInitialState, step, stepReplay, verifyReplay, MAX_TICKS } = require('../src/engine/replay.js')
const games = ['tank', 'tetris', 'snake', 'shooting', 'racing', 'breakout']

function actionFor(gameId, state) {
  if (gameId === 'snake' && state.tick === 0) return 'left'
  if (gameId === 'tetris' && state.tick % 2 === 0) return 'down'
  return null
}

function trace(gameId, seed = 4343) {
  let state = createInitialState(gameId, seed, 1, 1)
  const events = []
  while (!state.terminal && state.tick < MAX_TICKS) {
    const action = actionFor(gameId, state)
    state = step(state, action)
    if (action) events.push({ tick: state.tick, action })
  }
  if (!state.terminal) throw new Error(`${gameId} did not end within ${MAX_TICKS} ticks`)
  return { seed, totalTicks: state.tick, events, rawScore: state.score }
}

function medianMillis(run, repetitions = 7) {
  run() // warm the JIT before timing
  const samples = []
  for (let i = 0; i < repetitions; i++) {
    const start = performance.now()
    run()
    samples.push(performance.now() - start)
  }
  return Number(samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)].toFixed(3))
}

const results = []
for (const gameId of games) {
  // Stricter Tank spawn/collision rules let the old seed survive the cap.
  const natural = trace(gameId, gameId === 'tank' ? 3 : 4343)
  const verify = (totalTicks, events) => {
    const result = verifyReplay({ gameId, seed: natural.seed, startLevel: 1, startSpeed: 1, totalTicks, events })
    if (result.rawScore !== natural.rawScore) throw new Error(`${gameId} replay score changed`)
  }
  const naturalReplayMs = medianMillis(() => verify(natural.totalTicks, natural.events))

  // A legal 12k tick replay: pause before gameplay, then resume with enough
  // time remaining to play the same naturally terminal trace.
  const shift = MAX_TICKS - natural.totalTicks
  const paddedEvents = [{ tick: 1, action: 'pause' }, { tick: shift, action: 'resume' },
    ...natural.events.map(event => ({ tick: event.tick + shift, action: event.action }))]
  const maxTickReplayMs = medianMillis(() => verify(MAX_TICKS, paddedEvents), 3)

  // Active-step stress estimate across successive games. This is not a valid
  // single replay, but exercises 12k real gameplay steps for CPU comparison.
  const playActiveSteps = advance => {
    let state = createInitialState(gameId, 4343, 1, 1)
    let played = 0
    let runNumber = 0
    while (played < MAX_TICKS) {
      if (state.terminal) state = createInitialState(gameId, 4343 + ++runNumber, 1, 1)
      state = advance(state, actionFor(gameId, state))
      played++
    }
  }
  const activeStepMs = medianMillis(() => playActiveSteps(step), 3)
  const optimizedActiveStepMs = medianMillis(() => playActiveSteps(stepReplay), 3)
  results.push({ gameId, naturalTicks: natural.totalTicks, actions: natural.events.length,
    rawScore: natural.rawScore, naturalReplayMs, maxTickReplayMs,
    active12000StepsMs: activeStepMs, optimizedActive12000StepsMs: optimizedActiveStepMs })
}

console.log(JSON.stringify({ environment: 'Node local wall time; not Cloudflare billed CPU', maxTicks: MAX_TICKS, results }, null, 2))
