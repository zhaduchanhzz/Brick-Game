export const KEYBOARD_MODE_STORAGE_KEY = 'brick-game-keyboard-mode'

function loadKeyboardMode() {
  try {
    return window.localStorage.getItem(KEYBOARD_MODE_STORAGE_KEY) === 'wasd' ? 'wasd' : 'arrows'
  } catch (_error) {
    return 'arrows'
  }
}

let currentMode = loadKeyboardMode()
const listeners = new Set()

export const getKeyboardMode = () => currentMode

export function setKeyboardMode(nextMode) {
  if (nextMode !== 'arrows' && nextMode !== 'wasd') return currentMode
  if (nextMode === currentMode) return currentMode
  currentMode = nextMode
  try {
    window.localStorage.setItem(KEYBOARD_MODE_STORAGE_KEY, currentMode)
  } catch (_error) {
    // The selection remains usable when browser storage is unavailable.
  }
  listeners.forEach(listener => listener(currentMode))
  return currentMode
}

export function subscribeKeyboardMode(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
