import { decLevels, incLevels } from '../../store/reducer/levelsSlice'
import { incSpeed, decSpeed } from '../../store/reducer/speedSlice'
import { setGame } from '../../store/reducer/gameSlice'
import { toggle } from '../../store/reducer/musicSlice'
import { Music } from '../../utils/music'
import store from '../../store'
import { startGame, resetGame } from '../../engine/clientRun'

const left = () => {
  const state = store.getState()
  if (state.music && Music.move) {
    Music.move()
  }
  store.dispatch(decSpeed())
}

const right = () => {
  const state = store.getState()
  if (state.music && Music.move) {
    Music.move()
  }
  store.dispatch(incSpeed())
}

const up = () => {
  const state = store.getState()
  if (state.music && Music.move) {
    Music.move()
  }
  store.dispatch(incLevels())
}

const down = () => {
  const state = store.getState()
  if (state.music && Music.move) {
    Music.move()
  }
  store.dispatch(decLevels())
}

const p = () => {
  const { music } = store.getState()
  if (music && Music.start) {
    Music.start()
  }
  startGame()
}

const s = () => {
  store.dispatch(toggle())
}

const r = () => {
  resetGame()
}

const nextGameIndex = (games, game) => {
  let idx = game
  if (idx === games.length - 1) {
    return 0
  }
  return idx + 1
}

const rotate = () => {
  const { games, game, music } = store.getState()
  if (music && Music.rotate) {
    Music.rotate()
  }
  const idx = nextGameIndex(games, game)
  store.dispatch(setGame(idx))
}

export default {
  left,
  right,
  up,
  down,
  p,
  s,
  r,
  rotate,
}
