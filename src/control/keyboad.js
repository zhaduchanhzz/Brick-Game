import store from '../store'
import control from '.'
import { initGameData } from '../utils/games'
import { getKeyboardMode, subscribeKeyboardMode } from './keyboardMode'
import { publishKeyboardFeedback } from './keyboardFeedback'

const commonKeys = {
  Space: 'rotate',
  Spacebar: 'rotate',
  ' ': 'rotate',
  x: 'rotate',
  p: 'p',
  r: 'r',
  m: 's',
}

const arrowKeys = {
  ArrowLeft: 'left',
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  s: 's',
}

const wasdKeys = {
  a: 'left',
  w: 'up',
  d: 'right',
  s: 'down',
}

const commonLegacyKeys = {
  32: 'rotate',
  88: 'rotate',
  80: 'p',
  82: 'r',
  77: 's',
}

const arrowLegacyKeys = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  83: 's',
}

const wasdLegacyKeys = {
  65: 'left',
  87: 'up',
  68: 'right',
  83: 'down',
}

let keydownActive

const actionForKey = (event) => {
  const keys = getKeyboardMode() === 'wasd' ? wasdKeys : arrowKeys
  const legacyKeys = getKeyboardMode() === 'wasd' ? wasdLegacyKeys : arrowLegacyKeys
  const key = typeof event.key === 'string' ? event.key : ''
  const code = typeof event.code === 'string' ? event.code : ''
  const candidates = [code, code.replace(/^Key/, '').toLowerCase(), key, key.toLowerCase()]
  for (const candidate of candidates) {
    const action = commonKeys[candidate] || keys[candidate]
    if (action) return action
  }
  return commonLegacyKeys[event.keyCode] || legacyKeys[event.keyCode]
}

const keyIdentity = (event) => event.code || event.keyCode || event.key

const isSpaceKey = (event) => event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space' || event.keyCode === 32

const releaseActiveKey = () => {
  if (!keydownActive) return
  control.clearLoop()
  publishKeyboardFeedback(keydownActive.type, false)
  keydownActive = null
}

const keyDown = (e) => {
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
    releaseActiveKey()
    return
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const interactive = e.target && e.target.closest &&
    e.target.closest('button, input, select, textarea, summary, a, [contenteditable]')
  // Buttons keep their native Space activation; other shortcuts work even when
  // a machine or toolbar button retained focus after a click or dialog close.
  if (interactive && (!interactive.matches('button') || isSpaceKey(e))) return
  const type = actionForKey(e)
  if (!type) return
  e.preventDefault()
  if (e.repeat || (keydownActive && keyIdentity(e) === keydownActive.key)) return
  // Only one direction repeats at a time. Release the old key and its visual.
  releaseActiveKey()
  keydownActive = { key: keyIdentity(e), type }
  publishKeyboardFeedback(type, true)
  const { pause, game } = store.getState()
  if (pause === 0) {
    control['todo'][type]()
  } else {
    control[initGameData[game].name][type]()
  }
}

const keyUp = (e) => {
  if (keydownActive && keyIdentity(e) === keydownActive.key) {
    releaseActiveKey()
  }
}

document.addEventListener('keydown', keyDown, true)
document.addEventListener('keyup', keyUp, true)
document.addEventListener('focusin', event => {
  if (event.target && event.target.closest && event.target.closest('[role="dialog"][aria-modal="true"]')) {
    releaseActiveKey()
  }
}, true)
window.addEventListener('blur', releaseActiveKey)
subscribeKeyboardMode(releaseActiveKey)

