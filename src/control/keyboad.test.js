import control from '.'
import store from '../store'
import { getKeyboardMode, setKeyboardMode } from './keyboardMode'
import { subscribeKeyboardFeedback } from './keyboardFeedback'
import './keyboad'

jest.mock('../store', () => ({
  __esModule: true,
  default: { getState: jest.fn() },
}))

jest.mock('.', () => ({
  __esModule: true,
  default: {
    todo: { left: jest.fn(), up: jest.fn(), right: jest.fn(), down: jest.fn(), rotate: jest.fn(), p: jest.fn(), r: jest.fn(), s: jest.fn() },
    tetris: { rotate: jest.fn() },
    clearLoop: jest.fn(),
  },
}))

beforeEach(() => {
  setKeyboardMode('arrows')
  store.getState.mockReturnValue({ pause: 0, game: 0 })
})

function keyEvent(target, name, key, keyCode, options = {}) {
  const event = new KeyboardEvent(name, { key, bubbles: true, cancelable: true, ...options })
  Object.defineProperty(event, 'keyCode', { value: keyCode })
  target.dispatchEvent(event)
  return event
}

test('Space on the focused palette disclosure does not rotate the game', () => {
  const summary = document.createElement('summary')
  document.body.appendChild(summary)
  const event = keyEvent(summary, 'keydown', ' ', 32)
  expect(control.todo.rotate).not.toHaveBeenCalled()
  expect(event.defaultPrevented).toBe(false)
  summary.remove()
})

test('handled gameplay arrows prevent page scroll, including key repeats', () => {
  const first = keyEvent(document.body, 'keydown', 'ArrowDown', 40)
  const repeat = keyEvent(document.body, 'keydown', 'ArrowDown', 40, { repeat: true })
  expect(first.defaultPrevented).toBe(true)
  expect(repeat.defaultPrevented).toBe(true)
  expect(control.todo.down).toHaveBeenCalledTimes(1)
  keyEvent(document.body, 'keyup', 'ArrowDown', 40)
  const modified = keyEvent(document.body, 'keydown', 'ArrowDown', 40, { ctrlKey: true })
  expect(modified.defaultPrevented).toBe(false)
  expect(control.todo.down).toHaveBeenCalledTimes(1)
})

test('desktop shortcuts still work after a machine button receives focus', () => {
  const machineButton = document.createElement('button')
  machineButton.setAttribute('aria-label', 'LEFT')
  document.body.appendChild(machineButton)
  machineButton.focus()

  const left = keyEvent(machineButton, 'keydown', 'ArrowLeft', 37, { code: 'ArrowLeft' })
  expect(left.defaultPrevented).toBe(true)
  expect(control.todo.left).toHaveBeenCalledTimes(1)
  keyEvent(machineButton, 'keyup', 'ArrowLeft', 37, { code: 'ArrowLeft' })

  const action = keyEvent(machineButton, 'keydown', 'x', 88, { code: 'KeyX' })
  expect(action.defaultPrevented).toBe(true)
  expect(control.todo.rotate).toHaveBeenCalledTimes(1)
  keyEvent(machineButton, 'keyup', 'x', 88, { code: 'KeyX' })

  const space = keyEvent(machineButton, 'keydown', ' ', 32, { code: 'Space' })
  expect(space.defaultPrevented).toBe(false)
  expect(control.todo.rotate).toHaveBeenCalledTimes(1)
  keyEvent(machineButton, 'keyup', ' ', 32, { code: 'Space' })
  machineButton.remove()
})

test('shortcuts work after a toolbar closes, but Space still activates its button', () => {
  const toolbarButton = document.createElement('button')
  document.body.appendChild(toolbarButton)
  const onToolbar = keyEvent(toolbarButton, 'keydown', 'x', 88, { code: 'KeyX' })
  expect(onToolbar.defaultPrevented).toBe(true)
  expect(control.todo.rotate).toHaveBeenCalledTimes(1)
  keyEvent(toolbarButton, 'keyup', 'x', 88, { code: 'KeyX' })
  const space = keyEvent(toolbarButton, 'keydown', ' ', 32, { code: 'Space' })
  expect(space.defaultPrevented).toBe(false)
  expect(control.todo.rotate).toHaveBeenCalledTimes(1)
  toolbarButton.remove()
})

test('X invokes the current game action while playing', () => {
  store.getState.mockReturnValue({ pause: 1, game: 1 })
  const action = keyEvent(document.body, 'keydown', 'x', 88, { code: 'KeyX' })
  expect(action.defaultPrevented).toBe(true)
  expect(control.tetris.rotate).toHaveBeenCalledTimes(1)
  expect(control.todo.rotate).not.toHaveBeenCalled()
  keyEvent(document.body, 'keyup', 'x', 88, { code: 'KeyX' })
})

test('editable controls and open dialogs keep gameplay shortcuts inactive', () => {
  const input = document.createElement('input')
  document.body.appendChild(input)
  const editing = keyEvent(input, 'keydown', 'x', 88, { code: 'KeyX' })
  expect(editing.defaultPrevented).toBe(false)
  expect(control.todo.rotate).not.toHaveBeenCalled()
  input.remove()
  const dialog = document.createElement('section')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  document.body.appendChild(dialog)
  const underDialog = keyEvent(document.body, 'keydown', 'ArrowLeft', 37, { code: 'ArrowLeft' })
  expect(underDialog.defaultPrevented).toBe(false)
  expect(control.todo.left).not.toHaveBeenCalled()
  dialog.remove()
})

test('switching shortcuts stops the previous held movement loop', () => {
  keyEvent(document.body, 'keydown', 'ArrowDown', 40, { code: 'ArrowDown' })
  keyEvent(document.body, 'keydown', 'x', 88, { code: 'KeyX' })
  expect(control.clearLoop).toHaveBeenCalledTimes(1)
  expect(control.todo.down).toHaveBeenCalledTimes(1)
  expect(control.todo.rotate).toHaveBeenCalledTimes(1)

  keyEvent(document.body, 'keyup', 'ArrowDown', 40, { code: 'ArrowDown' })
  expect(control.clearLoop).toHaveBeenCalledTimes(1)
  keyEvent(document.body, 'keyup', 'x', 88, { code: 'KeyX' })
  expect(control.clearLoop).toHaveBeenCalledTimes(2)
})

test('modern key and code work without keyCode, with legacy fallback', () => {
  keyEvent(document.body, 'keydown', 'Unidentified', 0, { code: 'KeyX' })
  expect(control.todo.rotate).toHaveBeenCalledTimes(1)
  keyEvent(document.body, 'keyup', 'Unidentified', 0, { code: 'KeyX' })

  keyEvent(document.body, 'keydown', 'Unidentified', 32)
  expect(control.todo.rotate).toHaveBeenCalledTimes(2)
  keyEvent(document.body, 'keyup', 'Unidentified', 32)

  keyEvent(document.body, 'keydown', 'ArrowDown', 0)
  expect(control.todo.down).toHaveBeenCalledTimes(1)
  keyEvent(document.body, 'keyup', 'ArrowDown', 0)
})

test('WASD replaces arrows and S becomes down while M controls sound', () => {
  setKeyboardMode('wasd')
  expect(getKeyboardMode()).toBe('wasd')
  for (const [key, code, keyCode, type] of [
    ['w', 'KeyW', 87, 'up'], ['a', 'KeyA', 65, 'left'],
    ['s', 'KeyS', 83, 'down'], ['d', 'KeyD', 68, 'right'],
  ]) {
    const event = keyEvent(document.body, 'keydown', key, keyCode, { code })
    expect(event.defaultPrevented).toBe(true)
    expect(control.todo[type]).toHaveBeenCalledTimes(1)
    keyEvent(document.body, 'keyup', key, keyCode, { code })
  }
  expect(control.todo.s).not.toHaveBeenCalled()
  const oldArrow = keyEvent(document.body, 'keydown', 'ArrowDown', 40, { code: 'ArrowDown' })
  expect(oldArrow.defaultPrevented).toBe(false)
  expect(control.todo.down).toHaveBeenCalledTimes(1)
  const sound = keyEvent(document.body, 'keydown', 'm', 77, { code: 'KeyM' })
  expect(sound.defaultPrevented).toBe(true)
  expect(control.todo.s).toHaveBeenCalledTimes(1)
  keyEvent(document.body, 'keyup', 'm', 77, { code: 'KeyM' })
})

test('S remains sound in arrow mode', () => {
  const sound = keyEvent(document.body, 'keydown', 's', 83, { code: 'KeyS' })
  expect(sound.defaultPrevented).toBe(true)
  expect(control.todo.s).toHaveBeenCalledTimes(1)
  expect(control.todo.down).not.toHaveBeenCalled()
  keyEvent(document.body, 'keyup', 's', 83, { code: 'KeyS' })
})

test('switching mode or losing window focus releases held key and button feedback', () => {
  const feedback = []
  const unsubscribe = subscribeKeyboardFeedback((type, pressed) => feedback.push([type, pressed]))
  keyEvent(document.body, 'keydown', 'ArrowDown', 40, { code: 'ArrowDown' })
  setKeyboardMode('wasd')
  expect(feedback).toEqual([['down', true], ['down', false]])
  expect(control.clearLoop).toHaveBeenCalledTimes(1)
  keyEvent(document.body, 'keydown', 'a', 65, { code: 'KeyA' })
  window.dispatchEvent(new Event('blur'))
  expect(feedback.slice(-2)).toEqual([['left', true], ['left', false]])
  expect(control.clearLoop).toHaveBeenCalledTimes(2)
  unsubscribe()
})

test('opening a modal releases a held movement key', () => {
  const feedback = []
  const unsubscribe = subscribeKeyboardFeedback((type, pressed) => feedback.push([type, pressed]))
  keyEvent(document.body, 'keydown', 'ArrowDown', 40, { code: 'ArrowDown' })
  const dialog = document.createElement('section')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  const close = document.createElement('button')
  dialog.appendChild(close)
  document.body.appendChild(dialog)
  close.focus()
  expect(feedback).toEqual([['down', true], ['down', false]])
  expect(control.clearLoop).toHaveBeenCalledTimes(1)
  dialog.remove()
  unsubscribe()
})
