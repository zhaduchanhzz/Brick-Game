import store from '../store'
import control from '.'
import { initGameData } from '../utils/games'

const legacyKeyboard = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  32: 'rotate',
  88: 'rotate',
  83: 's',
  82: 'r',
  80: 'p',
}

const namedKeyboard = {
  ArrowLeft: 'left',
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  Space: 'rotate',
  Spacebar: 'rotate',
  ' ': 'rotate',
  x: 'rotate',
  s: 's',
  r: 'r',
  p: 'p',
}

let keydownActive

const actionForKey = (event) => {
  const key = typeof event.key === 'string' ? event.key : ''
  const code = typeof event.code === 'string' ? event.code : ''
  return namedKeyboard[key] || namedKeyboard[key.toLowerCase()] ||
    namedKeyboard[code] || namedKeyboard[code.replace(/^Key/, '').toLowerCase()] || legacyKeyboard[event.keyCode]
}

const keyIdentity = (event) => event.code || event.keyCode || event.key

const isSpaceKey = (event) => event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space' || event.keyCode === 32

const keyDown = (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[role="dialog"][aria-modal="true"]')) return
  const interactive = e.target && e.target.closest &&
    e.target.closest('button, input, select, textarea, summary, a, [contenteditable]')
  // Buttons keep their native Space activation; other shortcuts work even when
  // a machine or toolbar button retained focus after a click or dialog close.
  if (interactive && (!interactive.matches('button') || isSpaceKey(e))) return
  const type = actionForKey(e)
  if (!type) return
  e.preventDefault()
  if (e.repeat || (keydownActive && keyIdentity(e) === keydownActive.key)) return
  // Only one direction repeats at a time. Stop the old loop before replacing it.
  if (keydownActive) control.clearLoop()
  keydownActive = { key: keyIdentity(e), type }
  const { pause, game } = store.getState()
  if (pause === 0) {
    control['todo'][type]()
  } else {
    control[initGameData[game].name][type]()
  }
}

const keyUp = (e) => {
  if (keydownActive && keyIdentity(e) === keydownActive.key) {
    control.clearLoop()
    keydownActive = null
  }
}

document.addEventListener('keydown', keyDown, true)
document.addEventListener('keyup', keyUp, true)

