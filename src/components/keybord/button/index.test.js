import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import Button from './index'
import control from '../../../control'
import { publishKeyboardFeedback } from '../../../control/keyboardFeedback'

jest.mock('react-redux', () => ({
  useSelector: selector => selector({ pause: 0, game: 0 }),
  shallowEqual: (left, right) => left === right,
}))

jest.mock('../../../control', () => ({
  __esModule: true,
  default: { todo: { left: jest.fn() }, clearLoop: jest.fn() },
}))

jest.mock('./index.module.less', () => ({ button: 'button', blue: 'blue', s1: 's1', active: 'active' }))

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

test('a quick tap keeps the physical button visibly pressed without repeating the game action', () => {
  render(<Button color="blue" size="s1" top={0} left={0} label="LEFT" type="left" />)
  const button = screen.getByRole('button', { name: 'LEFT' })
  const surface = button.querySelector('i')

  fireEvent.pointerDown(button, { pointerId: 1 })
  expect(control.todo.left).toHaveBeenCalledTimes(1)
  expect(surface.classList.contains('active')).toBe(true)
  fireEvent.pointerUp(button, { pointerId: 1 })
  expect(control.todo.left).toHaveBeenCalledTimes(1)
  expect(control.clearLoop).toHaveBeenCalledTimes(1)
  expect(surface.classList.contains('active')).toBe(true)

  act(() => jest.advanceTimersByTime(89))
  expect(surface.classList.contains('active')).toBe(true)
  act(() => jest.advanceTimersByTime(1))
  expect(surface.classList.contains('active')).toBe(false)
  expect(control.todo.left).toHaveBeenCalledTimes(1)
})

test('a desktop shortcut depresses the matching physical button without firing the action twice', () => {
  render(<Button color="blue" size="s1" top={0} left={0} label="LEFT" type="left" />)
  const surface = screen.getByRole('button', { name: 'LEFT' }).querySelector('i')
  act(() => publishKeyboardFeedback('left', true))
  expect(surface.classList.contains('active')).toBe(true)
  expect(control.todo.left).not.toHaveBeenCalled()
  act(() => publishKeyboardFeedback('left', false))
  expect(surface.classList.contains('active')).toBe(true)
  act(() => jest.advanceTimersByTime(90))
  expect(surface.classList.contains('active')).toBe(false)
})

test('releasing a shortcut does not lift a button still held by the pointer', () => {
  render(<Button color="blue" size="s1" top={0} left={0} label="LEFT" type="left" />)
  const button = screen.getByRole('button', { name: 'LEFT' })
  const surface = button.querySelector('i')
  fireEvent.pointerDown(button, { pointerId: 1 })
  act(() => publishKeyboardFeedback('left', true))
  act(() => publishKeyboardFeedback('left', false))
  expect(surface.classList.contains('active')).toBe(true)
  fireEvent.pointerUp(button, { pointerId: 1 })
  act(() => jest.advanceTimersByTime(90))
  expect(surface.classList.contains('active')).toBe(false)
  expect(control.todo.left).toHaveBeenCalledTimes(1)
})
