import React, { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import ThemeDialog from './ThemeDialog'
import { DEFAULT_PRESET_ID, THEME_STORAGE_VERSION } from '../../theme/presets'

const initialTheme = { version: THEME_STORAGE_VERSION, presetId: DEFAULT_PRESET_ID, overrides: {} }

function TestTheme() {
  const [theme, setTheme] = useState(initialTheme)
  const [gameTicks, setGameTicks] = useState(0)
  return (
    <>
      <button type="button" onClick={() => setGameTicks(value => value + 1)}>Tick game</button>
      <span data-testid="game-ticks">{gameTicks}</span>
      <ThemeDialog
        theme={theme}
        onPresetChange={presetId => setTheme({ ...initialTheme, presetId })}
        onColorChange={(key, color) => setTheme(current => ({ ...current, overrides: { ...current.overrides, [key]: color } }))}
        onReset={() => setTheme(initialTheme)}
      />
    </>
  )
}

test('one trigger opens the accessible preset and custom color dialog', () => {
  render(<TestTheme />)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getAllByRole('button', { name: 'Theme colors' })).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Theme colors' }).querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Theme colors' }))
  expect(screen.getByRole('dialog', { name: 'Theme colors' }).getAttribute('aria-modal')).toBe('true')
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close theme colors' }))
  expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1)
  expect(screen.getByLabelText('Machine body').value.toUpperCase()).toBe('#EFCC19')
})

test('preset and custom color changes leave sibling gameplay state intact', () => {
  render(<TestTheme />)
  fireEvent.click(screen.getByRole('button', { name: 'Tick game' }))
  fireEvent.click(screen.getByRole('button', { name: 'Theme colors' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ocean Blue' }))
  expect(screen.getByRole('button', { name: 'Ocean Blue' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.change(screen.getByLabelText('Machine body'), { target: { value: '#123456' } })
  expect(screen.getByLabelText('Machine body').value.toUpperCase()).toBe('#123456')
  expect(screen.getByTestId('game-ticks').textContent).toBe('1')
  fireEvent.click(screen.getByRole('button', { name: 'Reset to Classic Yellow' }))
  expect(screen.getByRole('button', { name: 'Classic Yellow' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByTestId('game-ticks').textContent).toBe('1')
})

test('Escape closes the dialog, restores focus, and Tab stays inside', () => {
  render(<TestTheme />)
  const trigger = screen.getByRole('button', { name: 'Theme colors' })
  fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog')
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reset to Classic Yellow' }))
  fireEvent.keyDown(dialog, { key: 'Tab' })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close theme colors' }))
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  expect(document.body.style.overflow).toBe('')
})
