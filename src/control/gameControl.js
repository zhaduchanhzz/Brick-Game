import store from '../store'
import { toggle } from '../store/reducer/musicSlice'
import { Music } from '../utils/music'
import control from '.'
import { queueAction, togglePause, resetGame, finishDisplay } from '../engine/clientRun'
import { isAllowedAction } from '../engine/replay'

export const makeGameControl = (gameId) => {
  const input = (action, repeat = true) => {
    const state = store.getState()
    if (state.lock || state.pause !== 1 || !isAllowedAction(gameId, action)) return
    if (state.music && Music.move) Music.move()
    queueAction(gameId, action)
    if (repeat) control.eventLoop[action] = setTimeout(() => input(action, true), 100)
  }
  return {
    left: () => input('left'),
    right: () => input('right'),
    up: () => input('up', gameId === 'tetris' ? false : true),
    down: () => input('down'),
    rotate: () => input('rotate', false),
    p: togglePause,
    r: resetGame,
    s: () => store.dispatch(toggle())
  }
}

export const gameover = finishDisplay
