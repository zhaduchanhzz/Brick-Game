import control from '.'
import './keyboad'

jest.mock('../store', () => ({
  __esModule: true,
  default: { getState: () => ({ pause: 0, game: 0 }) },
}))

jest.mock('.', () => ({
  __esModule: true,
  default: {
    todo: { down: jest.fn(), rotate: jest.fn() },
    clearLoop: jest.fn(),
  },
}))

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
