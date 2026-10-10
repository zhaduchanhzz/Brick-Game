import { getKeyboardMode, setKeyboardMode, subscribeKeyboardMode, KEYBOARD_MODE_STORAGE_KEY } from './keyboardMode'

beforeEach(() => {
  setKeyboardMode('wasd')
  setKeyboardMode('arrows')
})

test('the WASD selection is saved and listeners see only real changes', () => {
  const listener = jest.fn()
  const unsubscribe = subscribeKeyboardMode(listener)
  expect(getKeyboardMode()).toBe('arrows')
  expect(setKeyboardMode('wasd')).toBe('wasd')
  expect(window.localStorage.getItem(KEYBOARD_MODE_STORAGE_KEY)).toBe('wasd')
  expect(setKeyboardMode('wasd')).toBe('wasd')
  expect(setKeyboardMode('invalid')).toBe('wasd')
  expect(listener).toHaveBeenCalledTimes(1)
  expect(listener).toHaveBeenCalledWith('wasd')
  unsubscribe()
  setKeyboardMode('arrows')
  expect(listener).toHaveBeenCalledTimes(1)
})
