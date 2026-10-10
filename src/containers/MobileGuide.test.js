import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MobileGuide } from './index'
import { I18nProvider, translate } from '../i18n'

test.each([
  ['vi', 'Hướng dẫn chơi'],
  ['en', 'How to play'],
  ['zh-CN', '玩法指南'],
])('mobile guide has a translated heading in %s', (locale, heading) => {
  render(<I18nProvider locale={locale}><MobileGuide /></I18nProvider>)
  fireEvent.click(screen.getByRole('button', { name: translate(locale, 'app.mobileGuideButton') }))
  expect(screen.getByRole('dialog', { name: heading })).toBeTruthy()
})

test('mobile guide opens a localized modal, traps focus, and restores focus on Escape', () => {
  render(<I18nProvider locale="en"><MobileGuide /></I18nProvider>)
  const trigger = screen.getByRole('button', { name: translate('en', 'app.mobileGuideButton') })
  expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(trigger)

  const dialog = screen.getByRole('dialog', { name: translate('en', 'app.mobileGuideTitle') })
  const close = screen.getByRole('button', { name: translate('en', 'app.closeGuide') })
  expect(dialog.getAttribute('aria-modal')).toBe('true')
  expect(dialog.textContent).toContain(translate('en', 'app.mobileGuideMove'))
  expect(dialog.textContent).toContain(translate('en', 'app.mobileGuideAction'))
  expect(dialog.textContent).toContain(translate('en', 'app.mobileGuideGames'))
  expect(dialog.textContent).toContain(translate('en', 'app.mobileGuideDifficulty'))
  expect(document.activeElement).toBe(close)
  expect(document.body.style.overflow).toBe('hidden')

  fireEvent.keyDown(dialog, { key: 'Tab' })
  expect(document.activeElement).toBe(close)
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(trigger)
  expect(document.body.style.overflow).toBe('')
})

test('mobile guide closes when tapping the backdrop but not its contents', () => {
  render(<MobileGuide />)
  const trigger = screen.getByRole('button', { name: translate('vi', 'app.mobileGuideButton') })
  fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog')
  fireEvent.mouseDown(dialog)
  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.mouseDown(dialog.parentElement)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})
