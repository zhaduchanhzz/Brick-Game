import React from 'react'
import { render, screen } from '@testing-library/react'
import { DEFAULT_LOCALE, I18nProvider, LOCALE_STORAGE_KEY, loadLocale, normalizeLocale, saveLocale, translate, useI18n } from './index'

function Probe() {
  const { locale, t } = useI18n()
  return <p>{locale}: {t('claim.description', { game: t('game.snake') })}</p>
}

beforeEach(() => window.localStorage.clear())

test('Vietnamese is the safe default and selected locale persists', () => {
  expect(DEFAULT_LOCALE).toBe('vi')
  expect(loadLocale()).toBe('vi')
  saveLocale('zh-CN')
  expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-CN')
  expect(loadLocale()).toBe('zh-CN')
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'not-a-locale')
  expect(loadLocale()).toBe('vi')
  expect(normalizeLocale('en')).toBe('en')
})

test('all three languages interpolate game names without altering game IDs', () => {
  expect(translate('vi', 'game.snake')).toBe('RẮN SĂN MỒI')
  expect(translate('en', 'game.snake')).toBe('SNAKE')
  expect(translate('zh-CN', 'game.snake')).toBe('贪吃蛇')
  expect(translate('vi', 'device.sound', { key: 'M' })).toBe('ÂM(M)')
  expect(translate('zh-CN', 'leaderboard.level', { level: 5 })).toBe('等级 5')
})

test('components respond to locale changes through context', () => {
  const view = render(<I18nProvider locale="vi"><Probe /></I18nProvider>)
  expect(screen.getByText(/vi: Nhập tên/)).toBeTruthy()
  view.rerender(<I18nProvider locale="zh-CN"><Probe /></I18nProvider>)
  expect(screen.getByText(/zh-CN: 输入姓名/)).toBeTruthy()
})
