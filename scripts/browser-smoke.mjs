import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BASE_URL = process.env.BRICK_SMOKE_URL || 'http://127.0.0.1:8787'
const GAME_IDS = ['tank', 'tetris', 'snake', 'shooting', 'racing', 'breakout']
const ROOT = process.cwd()
const OUTPUT = path.join(ROOT, '.wrangler', 'qa')
const BROWSER_CANDIDATES = process.env.CHROME_PATH ? [process.env.CHROME_PATH] : [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
]

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const fail = (message) => { throw new Error(message) }

async function until(read, predicate, label, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs
  let last
  do {
    try {
      last = await read()
      if (predicate(last)) return last
    } catch (error) {
      last = error.message
    }
    await sleep(100)
  } while (Date.now() < deadline)
  fail(`Timed out waiting for ${label}; last value: ${JSON.stringify(last)}`)
}

class Cdp {
  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    this.handlers = new Map()
    socket.addEventListener('message', event => {
      let message
      try { message = JSON.parse(String(event.data)) } catch { return }
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        clearTimeout(pending.timer)
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`))
        else pending.resolve(message.result || {})
      } else if (message.method) {
        for (const handler of this.handlers.get(message.method) || []) handler(message.params || {})
      }
    })
  }

  on(method, handler) {
    const handlers = this.handlers.get(method) || []
    handlers.push(handler)
    this.handlers.set(method, handlers)
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method}: CDP response timed out`))
      }, 12000)
      this.pending.set(id, { method, resolve, reject, timer })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) fail(`Browser expression failed: ${result.exceptionDetails.text}`)
    return result.result?.value
  }
}

async function connect(url) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP WebSocket connection timed out')), 10000)
    socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP WebSocket connection failed')) }, { once: true })
  })
  return new Cdp(socket)
}

async function clickButton(cdp, label) {
  const point = await cdp.eval(`(() => {
    const button = document.querySelector('button[aria-label=${JSON.stringify(label)}]')
    if (!button) return null
    const rect = button.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    return { x, y, disabled: button.disabled,
      inViewport: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight }
  })()`)
  if (!point || point.disabled) fail(`Machine button is missing or disabled: ${label}`)
  if (!point.inViewport) fail(`Machine button center is outside the viewport: ${label} ${JSON.stringify(point)}`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
}

async function clickSelector(cdp, selector, description) {
  const point = await cdp.eval(`(() => {
    const button = document.querySelector(${JSON.stringify(selector)})
    if (!button) return null
    const rect = button.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    return { x, y, disabled: button.disabled,
      inViewport: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight }
  })()`)
  if (!point || point.disabled || !point.inViewport) fail(`${description} cannot be clicked: ${JSON.stringify(point)}`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
}

async function pressKey(cdp, key, code, keyCode) {
  const params = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
}

async function pressKeyWithFeedback(cdp, key, code, keyCode, label) {
  const selector = `button[aria-label=${JSON.stringify(label)}] i`
  // The physical button has a short release animation; measure from its resting state.
  await sleep(110)
  const before = await cdp.eval(`(() => {
    const icon = document.querySelector(${JSON.stringify(selector)})
    return icon && { active: icon.className.includes('active'), transform: getComputedStyle(icon).transform }
  })()`)
  if (!before || before.active) fail(`${label} is missing or was already pressed before ${code}`)
  const params = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params })
  let held
  try {
    await until(() => cdp.eval(`document.querySelector(${JSON.stringify(selector)})?.className.includes('active')`),
      Boolean, `${code} presses ${label}`)
    await sleep(110)
    held = await cdp.eval(`(() => {
      const icon = document.querySelector(${JSON.stringify(selector)})
      return icon && { active: icon.className.includes('active'), transform: getComputedStyle(icon).transform }
    })()`)
  } finally {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
  }
  if (!held?.active || held.transform === before.transform || held.transform === 'none') {
    fail(`${code} did not visibly depress ${label}: ${JSON.stringify({ before, held })}`)
  }
  await until(() => cdp.eval(`!document.querySelector(${JSON.stringify(selector)})?.className.includes('active')`),
    Boolean, `${code} releases ${label}`)
  return held.transform
}

async function localeState(cdp) {
  return cdp.eval(`(() => {
    const select = document.querySelector('[data-testid="locale-select"]')
    const rect = select?.getBoundingClientRect()
    const theme = document.querySelector('button[aria-haspopup="dialog"][title]')
    const machine = document.querySelector('main[class*="GameDevice"]') || document.querySelector('main[aria-label]')
    const board = document.querySelector('[class*="desktopLeaderboard"] aside')
    return {
      value: select?.value,
      stored: localStorage.getItem('brick-game-locale'),
      lang: document.documentElement.lang,
      options: select && [...select.options].map(option => ({ value: option.value, text: option.textContent.trim() })),
      label: select?.getAttribute('aria-label'),
      bounds: rect && { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        width: rect.width, height: rect.height,
        visible: getComputedStyle(select).display !== 'none' && rect.width > 0 && rect.height > 0 },
      themeLabel: theme?.getAttribute('aria-label'),
      machineLabel: machine?.getAttribute('aria-label'),
      boardLabel: board?.getAttribute('aria-label'),
      boardKicker: board?.querySelector('[class*="kicker"]')?.textContent?.trim(),
      gameTitle: document.querySelector('[class*="gameTitle"] strong')?.textContent?.trim()
    }
  })()`)
}

async function chooseLocale(cdp, value) {
  const selected = await cdp.eval(`(() => {
    const select = document.querySelector('[data-testid="locale-select"]')
    if (!select || ![...select.options].some(option => option.value === ${JSON.stringify(value)})) return false
    select.value = ${JSON.stringify(value)}
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  if (!selected) fail(`Locale selector cannot choose ${value}`)
  return until(() => localeState(cdp), state => state.value === value && state.stored === value && state.lang === value,
    `${value} locale selection`)
}

async function checkLocaleSelectorFit(cdp, width, height) {
  const state = await localeState(cdp)
  const box = state.bounds
  if (!box?.visible || box.width < 40 || box.height < 28 || box.left < -1 || box.top < -1 ||
    box.right > width + 1 || box.bottom > height + 1) {
    fail(`${width}x${height} locale selector is not visible inside the viewport: ${JSON.stringify(state)}`)
  }
  const overlaps = await cdp.eval(`(() => {
    const select = document.querySelector('[data-testid="locale-select"]')
    const box = select.getBoundingClientRect()
    return [...select.parentElement.querySelectorAll('button')].filter(button => {
      const peer = button.getBoundingClientRect()
      return peer.width > 0 && peer.height > 0 && getComputedStyle(button).display !== 'none' &&
        box.left < peer.right - 1 && box.right > peer.left + 1 &&
        box.top < peer.bottom - 1 && box.bottom > peer.top + 1
    }).map(button => button.getAttribute('aria-label') || button.textContent.trim())
  })()`)
  if (overlaps.length) fail(`${width}x${height} locale selector overlaps toolbar controls: ${JSON.stringify(overlaps)}`)
  return box
}

async function expectLocalizedMenu(cdp, game, level, speed, phase) {
  return until(() => cdp.eval(`(() => ({
    game: document.querySelector('[class*="gameTitle"] strong')?.textContent?.trim(),
    level: Boolean(document.querySelector('[role="img"][aria-label=${JSON.stringify(level)}]')),
    speed: Boolean(document.querySelector('[role="img"][aria-label=${JSON.stringify(speed)}]'))
  }))()`), state => state.game === game && state.level && state.speed, phase)
}

async function exerciseLocales(cdp, network) {
  const width = 390
  const height = 844
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
  await cdp.send('Page.navigate', { url: BASE_URL })
  const vietnamese = await until(() => localeState(cdp), state => state.value === 'vi' &&
    state.stored === 'vi' && state.lang === 'vi' && state.themeLabel && state.machineLabel,
  'default Vietnamese locale')
  if (JSON.stringify(vietnamese.options?.map(option => option.value)) !==
    JSON.stringify(['vi', 'en', 'zh-CN']) || vietnamese.label !== 'Ngôn ngữ' ||
    vietnamese.themeLabel !== 'Đổi máy chơi' || vietnamese.machineLabel !== 'Máy chơi Brick Game' ||
    vietnamese.boardLabel !== 'Bảng xếp hạng XE TĂNG' ||
    vietnamese.boardKicker !== '🏆 TOP 10 · MỌI THỜI ĐẠI' || vietnamese.gameTitle !== 'XE TĂNG') {
    fail(`Fresh browser did not default to Vietnamese UI: ${JSON.stringify(vietnamese)}`)
  }
  const initialRequest = await until(() => Promise.resolve(network.leaderboardRequests.at(-1)),
    Boolean, 'Vietnamese leaderboard bootstrap request')
  if (initialRequest.language !== 'vi') {
    fail(`Vietnamese API request omitted its locale: ${JSON.stringify(initialRequest)}`)
  }
  const initialRequestCount = network.leaderboardRequests.length
  await checkLocaleSelectorFit(cdp, width, height)
  await checkViewportFit(cdp, width, height, true)
  await checkPageHeight(cdp, width, height, 'Vietnamese locale')
  const vietnameseScreenshot = await capture(cdp, 'locale-vi-mobile-390x844.png', width)
  await clickButton(cdp, 'XOAY')
  await clickButton(cdp, 'NHANH')
  await clickButton(cdp, 'PHẢI')
  const selectedMenu = await expectLocalizedMenu(cdp, 'XẾP HÌNH', 'CẤP 2', 'TỐC ĐỘ 2',
    'Vietnamese Tetris level 2 speed 2')

  const english = await chooseLocale(cdp, 'en')
  if (english.label !== 'Language' || english.themeLabel !== 'Change device' ||
    english.machineLabel !== 'Brick Game machine' || english.boardLabel !== 'TETRIS leaderboard' ||
    english.boardKicker !== '🏆 TOP 10 · ALL TIME' || english.gameTitle !== 'TETRIS') {
    fail(`English UI did not update without losing game state: ${JSON.stringify(english)}`)
  }
  await expectLocalizedMenu(cdp, 'TETRIS', 'LEVEL 2', 'SPEED 2', 'English preserves selected game settings')
  const englishScreenshot = await capture(cdp, 'locale-en-mobile-390x844.png', width)
  const chinese = await chooseLocale(cdp, 'zh-CN')
  if (chinese.label !== '语言' || chinese.themeLabel !== '更换掌机' ||
    chinese.machineLabel !== 'Brick Game 掌机' || chinese.boardLabel !== '俄罗斯方块 排行榜' ||
    chinese.boardKicker !== '🏆 前十名 · 历史总榜' || chinese.gameTitle !== '俄罗斯方块') {
    fail(`Chinese UI labels did not translate: ${JSON.stringify(chinese)}`)
  }
  await expectLocalizedMenu(cdp, '俄罗斯方块', '等级 2', '速度 2', 'Chinese preserves selected game settings')
  if (network.leaderboardRequests.length !== initialRequestCount) {
    fail('Switching languages unnecessarily reloaded leaderboard data')
  }
  await checkViewportFit(cdp, width, height, true)
  await checkPageHeight(cdp, width, height, 'Chinese locale')
  const chineseScreenshot = await capture(cdp, 'locale-zh-mobile-390x844.png', width)
  await cdp.send('Page.reload', { ignoreCache: true })
  const persisted = await until(() => localeState(cdp), state => state.value === 'zh-CN' &&
    state.stored === 'zh-CN' && state.lang === 'zh-CN' && state.themeLabel === chinese.themeLabel,
  'Chinese locale after reload')
  const reloadedRequest = await until(() => Promise.resolve(network.leaderboardRequests.at(-1)),
    request => network.leaderboardRequests.length > initialRequestCount && Boolean(request),
  'Chinese leaderboard request after reload')
  if (reloadedRequest.language !== 'zh-CN') {
    fail(`Persisted Chinese locale was not sent to Worker: ${JSON.stringify(reloadedRequest)}`)
  }
  await checkLocaleSelectorFit(cdp, width, height)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await until(() => cdp.eval('innerWidth'), value => value === 1440, 'desktop locale selector viewport')
  const desktopSelector = await checkLocaleSelectorFit(cdp, 1440, 900)
  const desktopChinese = await cdp.eval(`(() => ({
    guide: document.querySelector('button[class*="guideToggle"]')?.textContent?.trim(),
    movement: document.querySelector('#movement-keyboard-guide')?.getAttribute('aria-label'),
    action: document.querySelector('#action-keyboard-guide')?.getAttribute('aria-label'),
    mode: document.querySelector('button[data-testid="keyboard-mode-toggle"]')?.getAttribute('aria-label')
  }))()`)
  if (desktopChinese.guide !== '隐藏指南' || desktopChinese.movement !== '移动键盘操作说明' ||
    desktopChinese.action !== '动作和系统按键说明' || desktopChinese.mode !== 'WASD 移动') {
    fail(`Chinese desktop help did not translate: ${JSON.stringify(desktopChinese)}`)
  }
  await checkViewportFit(cdp, 1440, 900, false)
  await checkPageHeight(cdp, 1440, 900, 'Chinese desktop locale')
  const chineseDesktopScreenshot = await capture(cdp, 'locale-zh-desktop-1440x900.png', 1440)
  const restoredVietnamese = await chooseLocale(cdp, 'vi')
  if (restoredVietnamese.themeLabel !== vietnamese.themeLabel ||
    restoredVietnamese.machineLabel !== vietnamese.machineLabel) {
    fail(`Vietnamese UI did not restore: ${JSON.stringify(restoredVietnamese)}`)
  }
  const desktopVietnamese = await cdp.eval(`(() => ({
    guide: document.querySelector('button[class*="guideToggle"]')?.textContent?.trim(),
    movement: document.querySelector('#movement-keyboard-guide')?.getAttribute('aria-label'),
    mode: document.querySelector('button[data-testid="keyboard-mode-toggle"]')?.getAttribute('aria-label')
  }))()`)
  if (desktopVietnamese.guide !== 'Ẩn hướng dẫn' ||
    desktopVietnamese.movement !== 'Hướng dẫn phím di chuyển' ||
    desktopVietnamese.mode !== 'Di chuyển bằng WASD') {
    fail(`Vietnamese desktop help did not restore: ${JSON.stringify(desktopVietnamese)}`)
  }
  await checkPageHeight(cdp, 1440, 900, 'Vietnamese desktop locale')
  const vietnameseDesktopScreenshot = await capture(cdp, 'locale-vi-desktop-1440x900.png', 1440)
  await chooseLocale(cdp, 'en')
  await checkViewportFit(cdp, 1440, 900, false)
  await checkPageHeight(cdp, 1440, 900, 'English desktop locale')
  const englishDesktopScreenshot = await capture(cdp, 'locale-en-desktop-1440x900.png', 1440)
  return { default: vietnamese.value, options: vietnamese.options, switched: [english.value, chinese.value],
    persisted: persisted.value, restored: restoredVietnamese.value, selectedMenu, mobileSelector: vietnamese.bounds,
    desktopSelector, desktopChinese, desktopVietnamese, apiLanguages: [initialRequest.language, reloadedRequest.language],
    screenshots: [vietnameseScreenshot, englishScreenshot, chineseScreenshot,
      vietnameseDesktopScreenshot, englishDesktopScreenshot, chineseDesktopScreenshot] }
}

async function keyboardModeState(cdp) {
  return cdp.eval(`(() => {
    const button = document.querySelector('button[data-testid="keyboard-mode-toggle"]')
    const guide = document.querySelector('[aria-label="Movement keyboard controls"]')
    const keys = guide?.querySelector('[class*="directionKeys"]')
    const action = document.querySelector('[aria-label="Action and system keyboard controls"]')
    const box = button?.getBoundingClientRect()
    return { visible: Boolean(box?.width && box?.height && getComputedStyle(button).display !== 'none'),
      pressed: button?.getAttribute('aria-pressed'), text: button?.textContent?.trim(),
      stored: localStorage.getItem('brick-game-keyboard-mode'),
      keyLabel: keys?.getAttribute('aria-label'), keyText: keys?.textContent?.trim(),
      soundButton: Boolean(document.querySelector('button[aria-label="SOUND(M)"]')),
      soundGuide: action?.textContent?.includes('M') }
  })()`)
}

async function gameLabel(cdp) {
  return cdp.eval(`document.querySelector('[class*="gameTitle"] strong')?.textContent?.trim().toLowerCase() || null`)
}

async function selectRetro(cdp) {
  await clickButton(cdp, 'Change device')
  await until(() => cdp.eval(`document.querySelector('[role="dialog"]')?.querySelector('button[aria-pressed]') !== null`),
    Boolean, 'theme modal presets')
  const changed = await cdp.eval(`(() => {
    const card = [...document.querySelectorAll('[role="dialog"] button[aria-pressed]')]
      .find(button => button.textContent.includes('Retro Cream E-23'))
    if (!card) return false
    card.click()
    return true
  })()`)
  if (!changed) fail('Retro Cream preset card is missing')
  await until(() => cdp.eval(`(() => {
    const device = document.querySelector('main [class*="GameDevice_device"]')
    const card = [...document.querySelectorAll('[role="dialog"] button[aria-pressed]')]
      .find(button => button.textContent.includes('Retro Cream E-23'))
    return card?.getAttribute('aria-pressed') === 'true' &&
      device?.className.includes('GameDevice_retro') &&
      document.querySelector('main [class*="GameDevice_modelMark"]')?.textContent?.includes('E-23')
  })()`), Boolean, 'Retro E-23 shape')
  await clickButton(cdp, 'Close theme colors')
  await until(() => cdp.eval(`document.querySelector('[role="dialog"]') === null`), Boolean, 'theme modal close')
}

async function checkViewportFit(cdp, width, height, mobile) {
  const rect = await cdp.eval(`(() => {
    const device = document.querySelector('main [class*="GameDevice_device"]')
    const box = device?.getBoundingClientRect()
    const sidebar = document.querySelector('[class*="desktopLeaderboard"]')
    return box && {
      left: box.left, top: box.top, right: box.right, bottom: box.bottom,
      sidebarVisible: sidebar && getComputedStyle(sidebar).display !== 'none',
      headerVisible: getComputedStyle(document.querySelector('header')).display !== 'none'
    }
  })()`)
  if (!rect) fail(`${width}px game device is missing`)
  if (rect.left < -1 || rect.right > width + 1 || rect.top < -1 || rect.bottom > height + 1) {
    fail(`${width}x${height} machine does not fit one viewport: ${JSON.stringify(rect)}`)
  }
  if (Boolean(rect.sidebarVisible) === mobile) fail(`${width}px sidebar visibility is wrong`)
  return rect
}

async function checkDesktopComposition(cdp, width, height) {
  const layout = await cdp.eval(`(() => {
    const title = document.querySelector('[class*="brand"] h1')
    const device = document.querySelector('main [class*="GameDevice_device"]')
    const board = document.querySelector('[class*="desktopLeaderboard"] aside')
    const boardFrame = document.querySelector('[class*="desktopLeaderboard"]')
    const movementGuide = document.querySelector('[aria-label="Movement keyboard controls"]')
    const actionGuide = document.querySelector('[aria-label="Action and system keyboard controls"]')
    const guideToggle = document.querySelector('button[class*="guideToggle"]')
    const modeToggle = document.querySelector('button[data-testid="keyboard-mode-toggle"]')
    const themeButton = document.querySelector('button[aria-label="Change device"]')
    const bounds = element => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const computed = getComputedStyle(element)
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        width: rect.width, height: rect.height,
        visible: computed.display !== 'none' && computed.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 }
    }
    return { title: bounds(title), device: bounds(device), board: bounds(board), boardFrame: bounds(boardFrame),
      movementGuide: bounds(movementGuide), actionGuide: bounds(actionGuide),
      guideToggle: bounds(guideToggle), modeToggle: bounds(modeToggle), themeButton: bounds(themeButton), guideExpanded: guideToggle?.getAttribute('aria-expanded'),
      guideLabel: guideToggle?.textContent?.trim(),
      guideControls: guideToggle?.getAttribute('aria-controls')?.split(' ').every(id => Boolean(document.getElementById(id))),
      actionKey: actionGuide?.textContent?.includes('Action / fire / rotate'),
      changeDevice: themeButton?.textContent?.includes('Change device') }
  })()`)
  if (!layout.title?.visible || !layout.device?.visible || !layout.board?.visible || !layout.boardFrame?.visible ||
    !layout.movementGuide?.visible || !layout.actionGuide?.visible || !layout.guideToggle?.visible || !layout.modeToggle?.visible || !layout.themeButton?.visible ||
    layout.guideExpanded !== 'true' || layout.guideLabel !== 'Hide guide' || !layout.guideControls ||
    !layout.actionKey || !layout.changeDevice) {
    fail(`${width}x${height} desktop title, machine, leaderboard, or keyboard help is hidden: ${JSON.stringify(layout)}`)
  }
  const gap = width <= 1100 ? 8 : 12
  if (layout.title.right + gap > layout.device.left || layout.device.right + gap > layout.board.left ||
    layout.movementGuide.right + gap > layout.device.left || layout.device.right + gap > layout.actionGuide.left ||
    layout.board.bottom > layout.actionGuide.top || Math.abs(layout.movementGuide.width - layout.actionGuide.width) > 2) {
    fail(`${width}x${height} desktop title/machine/leaderboard order or spacing is wrong: ${JSON.stringify(layout)}`)
  }
  const machineCenter = (layout.device.left + layout.device.right) / 2
  if (Math.abs(machineCenter - width / 2) > Math.max(28, width * .05)) {
    fail(`${width}x${height} machine is not centered in the viewport: ${JSON.stringify(layout)}`)
  }
  if (layout.title.left < -1 || layout.title.top < -1 || layout.title.bottom > height + 1 ||
    layout.movementGuide.left < -1 || layout.movementGuide.bottom > height + 1 || layout.actionGuide.bottom > height + 1 ||
    layout.guideToggle.left < -1 || layout.guideToggle.right > layout.device.left - gap || layout.guideToggle.bottom > height + 1 ||
    layout.modeToggle.left < -1 || layout.modeToggle.right > layout.device.left - gap || layout.modeToggle.bottom > height + 1 ||
    layout.themeButton.left < -1 || layout.themeButton.right > layout.device.left - gap || layout.themeButton.bottom > height + 1 ||
    layout.boardFrame.right > width + 1 || layout.boardFrame.top < -1 || layout.boardFrame.bottom > height + 1) {
    fail(`${width}x${height} desktop side content exceeds the viewport: ${JSON.stringify(layout)}`)
  }
  return layout
}

async function clickGuideToggle(cdp, label) {
  const point = await cdp.eval(`(() => {
    const button = document.querySelector('button[class*="guideToggle"]')
    if (!button) return null
    const rect = button.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    return { x, y, label: button.textContent.trim(),
      visible: getComputedStyle(button).display !== 'none' && x >= 0 && x < innerWidth && y >= 0 && y < innerHeight }
  })()`)
  if (!point || !point.visible || point.label !== label) {
    fail(`Guide toggle cannot be clicked as ${label}: ${JSON.stringify(point)}`)
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
}

async function exerciseGuideToggle(cdp, width, height) {
  await clickGuideToggle(cdp, 'Hide guide')
  const hidden = await until(() => cdp.eval(`(() => {
    const button = document.querySelector('button[class*="guideToggle"]')
    const guides = ['movement-keyboard-guide', 'action-keyboard-guide'].map(id => document.getElementById(id))
    const board = document.querySelector('[class*="desktopLeaderboard"] aside')
    const device = document.querySelector('main [class*="GameDevice_device"]')
    return { expanded: button?.getAttribute('aria-expanded'), label: button?.textContent?.trim(),
      guidesHidden: guides.every(guide => guide?.hidden && getComputedStyle(guide).display === 'none' &&
        guide.getBoundingClientRect().height === 0),
      boardVisible: Boolean(board?.getBoundingClientRect().height),
      deviceVisible: Boolean(device?.getBoundingClientRect().height),
      stored: localStorage.getItem('brick-game-guide-visible') }
  })()`), state => state.expanded === 'false' && state.label === 'Show guide' && state.guidesHidden &&
    state.boardVisible && state.deviceVisible && state.stored === 'false', `${width}px hidden desktop guides`)
  await checkViewportFit(cdp, width, height, false)
  await checkPageHeight(cdp, width, height, 'hidden guides')
  await clickGuideToggle(cdp, 'Show guide')
  await until(() => cdp.eval(`(() => {
    const button = document.querySelector('button[class*="guideToggle"]')
    const guides = ['movement-keyboard-guide', 'action-keyboard-guide'].map(id => document.getElementById(id))
    return button?.getAttribute('aria-expanded') === 'true' && button.textContent.trim() === 'Hide guide' &&
      guides.every(guide => guide && !guide.hidden && getComputedStyle(guide).display !== 'none' &&
        guide.getBoundingClientRect().height > 0) && localStorage.getItem('brick-game-guide-visible') === 'true'
  })()`), Boolean, `${width}px restored desktop guides`)
  await checkDesktopComposition(cdp, width, height)
  return { hidden, restored: true }
}

async function checkMobileComposition(cdp, width, height) {
  const layout = await cdp.eval(`(() => {
    const bounds = element => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const computed = getComputedStyle(element)
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        width: rect.width, height: rect.height,
        visible: computed.display !== 'none' && computed.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 }
    }
    return {
      header: bounds(document.querySelector('header')),
      title: bounds(document.querySelector('[class*="brand"] h1')),
      gameTitle: bounds(document.querySelector('[class*="gameTitle"]')),
      board: bounds(document.querySelector('[class*="desktopLeaderboard"]')),
      device: (() => {
        const element = document.querySelector('main [class*="GameDevice_device"]')
        if (!element) return null
        const box = bounds(element)
        const scale = box.width / element.offsetWidth
        const style = getComputedStyle(element)
        return { ...box, innerLeft: box.left + parseFloat(style.borderLeftWidth) * scale,
          innerRight: box.right - parseFloat(style.borderRightWidth) * scale,
          scrollLeft: element.scrollLeft, scrollTop: element.scrollTop,
          scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }
      })(),
      lcdSurround: (() => {
        const element = document.querySelector('main [class*="GameDevice_rect"]')
        return element && { ...bounds(element), marginLeft: getComputedStyle(element).marginLeft,
          marginRight: getComputedStyle(element).marginRight }
      })(),
      screen: bounds(document.querySelector('main [class*="GameDevice_screen"]')),
      screenIntrinsic: (() => {
        const element = document.querySelector('main [class*="GameDevice_screen"]')
        return element && { width: element.offsetWidth, height: element.offsetHeight }
      })(),
      keyboard: (() => {
        const element = document.querySelector('main [class*="keyboard"]')
        return element && { ...bounds(element), transform: getComputedStyle(element).transform,
          intrinsicWidth: element.offsetWidth, intrinsicHeight: element.offsetHeight,
          offsetLeft: element.offsetLeft,
          marginLeft: getComputedStyle(element).marginLeft, marginRight: getComputedStyle(element).marginRight }
      })(),
      controlsDock: bounds(document.querySelector('main [class*="GameDevice_controlsDock"]')),
      scrollX: window.scrollX,
      controls: ['QUICK', 'DOWN', 'LEFT', 'RIGHT', 'ROTATE DIRECTION', 'START(P)',
        'SOUND(S)', 'RESET(R)'].map(label => ({
        label,
        circle: bounds(document.querySelector('button[aria-label="' + label + '"] i'))
      })),
      themeButton: bounds(document.querySelector('button[aria-label="Change device"]')),
      topTenButton: bounds([...document.querySelectorAll('button')].find(button => button.textContent.includes('Top 10'))),
      guideToggle: bounds(document.querySelector('button[class*="guideToggle"]')),
      modeToggle: bounds(document.querySelector('button[data-testid="keyboard-mode-toggle"]')),
      themeHasDeviceIcon: Boolean(document.querySelector('button[aria-label="Change device"] svg')),
      themeHasText: document.querySelector('button[aria-label="Change device"] span')?.textContent === 'Change device',
      themeHasOldPalette: Boolean(document.querySelector('button[aria-label="Change device"] [class*="triggerPalette"]'))
    }
  })()`)
  if (layout.title?.visible || layout.gameTitle?.visible || layout.board?.visible) {
    fail(`${width}x${height} mobile page exposes desktop title or leaderboard: ${JSON.stringify(layout)}`)
  }
  if (!layout.guideToggle || layout.guideToggle.visible) {
    fail(`${width}x${height} mobile page exposes the desktop guide toggle: ${JSON.stringify(layout.guideToggle)}`)
  }
  if (!layout.modeToggle || layout.modeToggle.visible) {
    fail(`${width}x${height} mobile page exposes the WASD mode toggle: ${JSON.stringify(layout.modeToggle)}`)
  }
  if (!layout.device?.visible || layout.device.width < Math.min(width * .8, height * .53) ||
    Math.abs((layout.device.left + layout.device.right) / 2 - width / 2) > Math.max(10, width * .03)) {
    fail(`${width}x${height} mobile machine is too small or off-center: ${JSON.stringify(layout)}`)
  }
  if (layout.device.scrollLeft !== 0 || layout.device.scrollTop !== 0) {
    fail(`${width}x${height} machine shell scrolled internally: ${JSON.stringify(layout.device)}`)
  }
  if (width <= 768 && height > width) {
    const usableHeight = height - Math.max(44, layout.header?.height || 0) - 16
    if (layout.device.height < usableHeight * .95) {
      fail(`${width}x${height} portrait machine leaves too much usable height empty: ${JSON.stringify({ deviceHeight: layout.device.height, usableHeight, header: layout.header })}`)
    }
  }
  if (!layout.screen?.visible || !layout.screenIntrinsic?.width || !layout.screenIntrinsic?.height) {
    fail(`${width}x${height} LCD screen is missing: ${JSON.stringify(layout.screen)}`)
  }
  const lcdScaleX = layout.screen.width / layout.screenIntrinsic.width
  const lcdScaleY = layout.screen.height / layout.screenIntrinsic.height
  if (Math.abs(lcdScaleX - lcdScaleY) > .01) {
    fail(`${width}x${height} LCD is distorted: ${JSON.stringify({ lcdScaleX, lcdScaleY, screen: layout.screen })}`)
  }
  for (const control of layout.controls) {
    if (!control.circle?.visible || Math.abs(control.circle.width - control.circle.height) > 1) {
      fail(`${width}x${height} ${control.label} button is missing or stretched: ${JSON.stringify(control.circle)}`)
    }
  }
  const withinDevice = box => box.left >= Math.max(layout.device.innerLeft, layout.device.left + 5) &&
    box.right <= Math.min(layout.device.innerRight, layout.device.right - 5) &&
    box.top >= layout.device.top + 5 && box.bottom <= layout.device.bottom - 5
  if (!withinDevice(layout.screen) || layout.controls.some(control => !withinDevice(control.circle))) {
    fail(`${width}x${height} LCD or control circle extends beyond the machine shell: ${JSON.stringify({ device: layout.device, lcdSurround: layout.lcdSurround, screen: layout.screen, controlsDock: layout.controlsDock, keyboard: layout.keyboard, scrollX: layout.scrollX, controls: layout.controls })}`)
  }
  const controlRowTop = Math.min(...layout.controls.map(control => control.circle.top))
  if (layout.screen.bottom > controlRowTop - 2) {
    fail(`${width}x${height} LCD overlaps the control row: ${JSON.stringify({ screenBottom: layout.screen.bottom, controlRowTop })}`)
  }
  if (height > width) {
    const lcdToButtonGap = controlRowTop - layout.screen.bottom
    const maxGap = height * .1
    if (lcdToButtonGap > maxGap + 1) {
      fail(`${width}x${height} LCD-to-button gap exceeds 10% of portrait viewport: ${JSON.stringify({
        lcdToButtonGap, maxGap, shellHeight: layout.device.height, screenBottom: layout.screen.bottom,
        nearestButtonTop: controlRowTop
      })}`)
    }
    layout.lcdToButtonGap = lcdToButtonGap
  }
  for (const [name, button] of [['theme', layout.themeButton], ['Top 10', layout.topTenButton]]) {
    if (!button?.visible || button.left < -1 || button.right > width + 1 || button.top < -1 || button.bottom > height + 1) {
      fail(`${width}x${height} mobile ${name} toolbar button is not visible inside the viewport: ${JSON.stringify(layout)}`)
    }
  }
  const near = (actual, expected) => Math.abs(actual - expected) <= 1
  if (!near(layout.themeButton.width, 136) || !near(layout.themeButton.height, 42) ||
    !near(layout.topTenButton.width, 84) || !near(layout.topTenButton.height, 42)) {
    fail(`${width}x${height} mobile toolbar buttons do not keep their fixed sizes: ${JSON.stringify({ theme: layout.themeButton, topTen: layout.topTenButton })}`)
  }
  if (!layout.themeHasDeviceIcon || !layout.themeHasText || layout.themeHasOldPalette) {
    fail(`${width}x${height} theme trigger must show the game-device SVG instead of palette dots`)
  }
  const overlaps = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1
  if (overlaps(layout.themeButton, layout.topTenButton) || overlaps(layout.themeButton, layout.device) || overlaps(layout.topTenButton, layout.device)) {
    fail(`${width}x${height} mobile toolbar buttons overlap each other or the machine: ${JSON.stringify(layout)}`)
  }
  return layout
}

async function checkPageHeight(cdp, width, height, phase) {
  const measured = await cdp.eval(`({ document: document.documentElement.scrollHeight,
    body: document.body.scrollHeight })`)
  if (Math.max(measured.document, measured.body) > height + 2) {
    fail(`${width}x${height} page scrolls vertically during ${phase}: ${JSON.stringify(measured)}`)
  }
}

async function exerciseMobileOverlays(cdp, width, height) {
  await clickButton(cdp, 'Change device')
  const themeDialog = await until(() => cdp.eval(`(() => {
    const element = document.querySelector('[role="dialog"][aria-labelledby="theme-dialog-title"]')
    if (!element) return null
    const box = element.getBoundingClientRect()
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }
  })()`), Boolean, 'mobile theme modal')
  if (themeDialog.left < -1 || themeDialog.right > width + 1 || themeDialog.top < -1 || themeDialog.bottom > height + 1) {
    fail(`${width}px theme modal exceeds viewport: ${JSON.stringify(themeDialog)}`)
  }
  const themeScreenshot = await capture(cdp, `theme-modal-${width}x${height}.png`, width)
  await clickButton(cdp, 'Close theme colors')
  await until(() => cdp.eval(`document.querySelector('[role="dialog"]') === null`), Boolean, 'theme modal closed')

  const opened = await cdp.eval(`(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes('Top 10'))
    if (!button) return false
    button.click()
    return true
  })()`)
  if (!opened) fail(`${width}px Top 10 trigger is missing`)
  await until(() => cdp.eval(`document.querySelector('[role="dialog"][aria-labelledby="mobile-leaderboard-title"]') !== null`),
    Boolean, 'mobile Top 10 overlay')
  const leaderboardDialog = await cdp.eval(`(() => {
    const element = document.querySelector('[role="dialog"][aria-labelledby="mobile-leaderboard-title"]')
    const box = element.getBoundingClientRect()
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }
  })()`)
  if (leaderboardDialog.left < -1 || leaderboardDialog.right > width + 1 ||
    leaderboardDialog.top < -1 || leaderboardDialog.bottom > height + 1) {
    fail(`${width}px Top 10 modal exceeds viewport: ${JSON.stringify(leaderboardDialog)}`)
  }
  const leaderboardScreenshot = await capture(cdp, `leaderboard-modal-${width}x${height}.png`, width)
  await clickButton(cdp, 'Close leaderboard')
  await until(() => cdp.eval(`document.querySelector('[role="dialog"]') === null`), Boolean, 'Top 10 overlay closed')
  return { themeDialog, leaderboardDialog, themeScreenshot, leaderboardScreenshot }
}

async function capture(cdp, filename, width) {
  await cdp.eval('window.scrollTo(0, 0)')
  const height = await cdp.eval('Math.ceil(document.documentElement.scrollHeight)')
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true, fromSurface: true,
    clip: { x: 0, y: 0, width, height, scale: 1 }
  })
  const file = path.join(OUTPUT, filename)
  const bytes = Buffer.from(result.data, 'base64')
  await fs.writeFile(file, bytes)
  if (bytes.readUInt32BE(16) !== width) fail(`Screenshot has unexpected width: ${filename}`)
  return file
}

async function checkLcdAndButtonFeedback(cdp, width) {
  await until(() => cdp.eval(`(() => {
    const cells = [...document.querySelectorAll('main [class*="index_matrix"] b')]
    return { total: cells.length, lit: cells.filter(cell => cell.classList.contains('c') || cell.classList.contains('d')).length }
  })()`), value => value?.total === 200 && value.lit > 0, 'active LCD pixels')
  // Let the brief LCD transition finish before comparing lit and idle cells.
  await sleep(100)
  const lcd = await cdp.eval(`(() => {
    const cells = [...document.querySelectorAll('main [class*="index_matrix"] b')]
    const idle = cells.find(cell => !cell.className)
    const litCells = cells.filter(cell => cell.classList.contains('c') || cell.classList.contains('d'))
    if (!idle || !litCells.length) return null
    const idleStyle = getComputedStyle(idle)
    const litStyle = getComputedStyle(litCells[0])
    const litOpacity = Math.max(...litCells.map(cell => Number(getComputedStyle(cell).opacity)))
    return { idleOpacity: Number(idleStyle.opacity), litOpacity,
      idleTransition: idleStyle.transitionDuration, litTransition: litStyle.transitionDuration,
      idleProperty: idleStyle.transitionProperty }
  })()`)
  const maxDurationMs = duration => Math.max(...duration.split(',').map(value => parseFloat(value) *
    (value.trim().endsWith('ms') ? 1 : 1000)))
  if (!lcd || lcd.idleOpacity > .25 || lcd.litOpacity < .85 ||
    !lcd.idleProperty.split(',').map(value => value.trim()).includes('opacity') ||
    maxDurationMs(lcd.idleTransition) > 90 || maxDurationMs(lcd.litTransition) > 90) {
    fail(`${width}px LCD pixels lack subdued idle ink or short opacity persistence: ${JSON.stringify(lcd)}`)
  }

  const button = await cdp.eval(`(() => {
    const element = document.querySelector('button[aria-label="LEFT"]')
    const icon = element?.querySelector('i')
    if (!icon) return null
    const box = element.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2,
      before: getComputedStyle(icon).transform }
  })()`)
  if (!button) fail(`${width}px LEFT physical button is missing`)
  let held = null
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: button.x, y: button.y, button: 'left', clickCount: 1
  })
  try {
    await until(() => cdp.eval(`document.querySelector('button[aria-label="LEFT"] i')?.className.includes('active')`),
      Boolean, 'held LEFT physical button')
    await sleep(110)
    held = await cdp.eval(`(() => {
      const icon = document.querySelector('button[aria-label="LEFT"] i')
      return { active: icon.className.includes('active'), transform: getComputedStyle(icon).transform }
    })()`)
  } finally {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: button.x, y: button.y, button: 'left', clickCount: 1
    })
  }
  if (!held?.active || held.transform === button.before || held.transform === 'none') {
    fail(`${width}px held physical button has no depressed visual transform: ${JSON.stringify({ button, held })}`)
  }
  await until(() => cdp.eval(`!document.querySelector('button[aria-label="LEFT"] i')?.className.includes('active')`),
    Boolean, 'released LEFT physical button')

  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  let reduced
  try {
    reduced = await cdp.eval(`(() => {
      const pixel = document.querySelector('main [class*="index_matrix"] b')
      const icon = document.querySelector('button[aria-label="LEFT"] i')
      return { enabled: matchMedia('(prefers-reduced-motion: reduce)').matches,
        pixelTransition: getComputedStyle(pixel).transitionDuration,
        buttonTransition: getComputedStyle(icon).transitionDuration }
    })()`)
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { features: [] })
  }
  if (!reduced.enabled || maxDurationMs(reduced.pixelTransition) !== 0 ||
    maxDurationMs(reduced.buttonTransition) !== 0) {
    fail(`${width}px reduced-motion preference did not disable LCD/button transitions: ${JSON.stringify(reduced)}`)
  }
  const screenshot = await capture(cdp, `lcd-active-mobile-${width}.png`, width)
  return { lcd, buttonDepressed: held.transform, reducedMotion: reduced, screenshot }
}

async function exerciseAllGames(cdp, network, bootstrapRequestCount) {
  const inputs = {
    tank: 'LEFT', tetris: 'DOWN', snake: 'DOWN',
    shooting: 'LEFT', racing: 'RIGHT', breakout: 'LEFT'
  }
  const exercised = []
  for (let i = 0; i < GAME_IDS.length; i++) {
    const gameId = GAME_IDS[i]
    if (await gameLabel(cdp) !== gameId) fail(`Expected ${gameId} menu before gameplay check`)
    await clickButton(cdp, 'START(P)')
    await until(() => cdp.eval(`document.querySelector('[role="img"][aria-label="Playing"]') !== null`),
      Boolean, `${gameId} start`, 15000)
    const beforeMatrix = await cdp.eval(`document.querySelector('main [class*="index_matrix"]')?.innerHTML || null`)
    if (!beforeMatrix) fail(`${gameId} matrix did not render`)
    await clickButton(cdp, inputs[gameId])
    await until(() => cdp.eval(`document.querySelector('main [class*="index_matrix"]')?.innerHTML || null`),
      value => Boolean(value && value !== beforeMatrix), `${gameId} on-screen ${inputs[gameId]} input`, 2000)
    await clickButton(cdp, 'RESET(R)')
    await until(() => cdp.eval(`document.querySelector('main[aria-label="Brick Game machine"]')?.textContent?.includes('WELCOME') &&
      document.querySelector('[role="img"][aria-label="Ready"]') !== null`), Boolean, `${gameId} reset`)
    exercised.push({ gameId, input: inputs[gameId], reset: true })
    await clickButton(cdp, 'ROTATE DIRECTION')
    await until(() => gameLabel(cdp), value => value === GAME_IDS[(i + 1) % GAME_IDS.length], `${gameId} next menu`)
  }
  if (network.leaderboardRequests.length !== bootstrapRequestCount) {
    fail('Starting and switching all six games triggered extra leaderboard GETs')
  }
  return exercised
}

async function exerciseKeyboardMode(cdp) {
  const initial = await keyboardModeState(cdp)
  if (!initial.visible || initial.pressed !== 'false' || initial.text !== 'Switch to WASD' ||
    initial.keyLabel !== 'Arrow keys') {
    fail(`Desktop keyboard mode did not start with arrows: ${JSON.stringify(initial)}`)
  }
  await clickSelector(cdp, 'button[data-testid="keyboard-mode-toggle"]', 'keyboard mode toggle')
  const wasd = await until(() => keyboardModeState(cdp), state => state.visible &&
    state.pressed === 'true' && state.text === 'Switch to arrows' && state.stored === 'wasd' &&
    state.keyLabel === 'WASD keys' && state.keyText === 'WASD' && state.soundButton && state.soundGuide,
  'WASD toggle, guide, and sound shortcut')

  await pressKeyWithFeedback(cdp, 'w', 'KeyW', 87, 'QUICK')
  await until(() => cdp.eval(`document.querySelector('[aria-label="LEVEL 2"]') !== null`), Boolean, 'W selects level 2')
  await pressKeyWithFeedback(cdp, 'd', 'KeyD', 68, 'RIGHT')
  await until(() => cdp.eval(`document.querySelector('[aria-label="SPEED 2"]') !== null`), Boolean, 'D selects speed 2')
  await pressKeyWithFeedback(cdp, 'a', 'KeyA', 65, 'LEFT')
  await until(() => cdp.eval(`document.querySelector('[aria-label="SPEED 1"]') !== null`), Boolean, 'A restores speed 1')
  const soundBeforeS = await cdp.eval(`document.querySelector('[role="img"][aria-label^="Sound "]')?.getAttribute('aria-label')`)
  await pressKeyWithFeedback(cdp, 's', 'KeyS', 83, 'DOWN')
  await until(() => cdp.eval(`document.querySelector('[aria-label="LEVEL 1"]') !== null`), Boolean, 'S restores level 1')
  const soundAfterS = await cdp.eval(`document.querySelector('[role="img"][aria-label^="Sound "]')?.getAttribute('aria-label')`)
  if (!soundBeforeS || soundAfterS !== soundBeforeS) fail('S changed sound instead of moving down in WASD mode')
  await pressKey(cdp, 'ArrowRight', 'ArrowRight', 39)
  const ignoredArrow = await cdp.eval(`({ speed1: document.querySelector('[aria-label="SPEED 1"]') !== null,
    visual: document.querySelector('button[aria-label="RIGHT"] i')?.className.includes('active') })`)
  if (!ignoredArrow.speed1 || ignoredArrow.visual) fail(`Arrow key remained active in WASD mode: ${JSON.stringify(ignoredArrow)}`)
  await pressKeyWithFeedback(cdp, 'm', 'KeyM', 77, 'SOUND(M)')
  const soundAfterM = await cdp.eval(`document.querySelector('[role="img"][aria-label^="Sound "]')?.getAttribute('aria-label')`)
  if (soundAfterM === soundBeforeS) fail('M did not toggle sound in WASD mode')
  await pressKeyWithFeedback(cdp, 'm', 'KeyM', 77, 'SOUND(M)')

  await clickSelector(cdp, 'button[data-testid="keyboard-mode-toggle"]', 'keyboard mode toggle')
  const arrows = await until(() => keyboardModeState(cdp), state => state.pressed === 'false' &&
    state.text === 'Switch to WASD' && state.stored === 'arrows' && state.keyLabel === 'Arrow keys' &&
    !state.soundButton, 'restored arrow mode')
  await pressKeyWithFeedback(cdp, 'ArrowRight', 'ArrowRight', 39, 'RIGHT')
  await until(() => cdp.eval(`document.querySelector('[aria-label="SPEED 2"]') !== null`), Boolean, 'arrow mode speed 2')
  await pressKeyWithFeedback(cdp, 'ArrowLeft', 'ArrowLeft', 37, 'LEFT')
  await until(() => cdp.eval(`document.querySelector('[aria-label="SPEED 1"]') !== null`), Boolean, 'arrow mode restored speed 1')
  return { wasd, arrows, keys: ['W', 'A', 'S', 'D', 'M', 'ArrowRight', 'ArrowLeft'], soundConflictAvoided: true }
}

async function exerciseDesktopKeyboard(cdp) {
  await clickButton(cdp, 'LEFT')
  const focused = await cdp.eval(`document.activeElement?.getAttribute('aria-label')`)
  if (focused !== 'LEFT') fail(`Machine button did not retain focus for keyboard regression test: ${focused}`)
  await pressKeyWithFeedback(cdp, 'ArrowRight', 'ArrowRight', 39, 'RIGHT')
  await until(() => cdp.eval(`document.querySelector('[aria-label="SPEED 2"]') !== null`), Boolean,
    'ArrowRight from focused machine button')
  await pressKeyWithFeedback(cdp, 'x', 'KeyX', 88, 'ROTATE DIRECTION')
  await until(() => gameLabel(cdp), value => value === 'tetris', 'X action from focused machine button')
  for (let index = 0; index < 5; index++) await pressKeyWithFeedback(cdp, 'x', 'KeyX', 88, 'ROTATE DIRECTION')
  await until(() => gameLabel(cdp), value => value === 'tank', 'X cycling back to Tank')
  await pressKeyWithFeedback(cdp, 'p', 'KeyP', 80, 'START(P)')
  await until(() => cdp.eval(`document.querySelector('[role="img"][aria-label="Playing"]') !== null`),
    Boolean, 'P start from focused machine button')
  await pressKeyWithFeedback(cdp, 'r', 'KeyR', 82, 'RESET(R)')
  await until(() => cdp.eval(`document.querySelector('[role="img"][aria-label="Ready"]') !== null`),
    Boolean, 'R reset from focused machine button')
  return { focusedButton: focused, arrowSpeed: 2, action: 'X', start: 'P', reset: 'R' }
}

async function runViewport(cdp, network, width, height, mobile, layoutOnly = false) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 })
  const before = network.leaderboardRequests.length
  const beforeSockets = network.webSocketHandshakes.length
  await cdp.send('Page.navigate', { url: BASE_URL })
  await until(() => gameLabel(cdp), value => value === 'tank', `${width}px game menu`)
    .catch(error => fail(`${error.message}; browser exceptions: ${network.exceptions.join(', ') || 'none'}`))
  await until(() => Promise.resolve(network.leaderboardRequests.length), value => value > before, 'leaderboard bootstrap GET')
  await until(() => Promise.resolve(network.leaderboardResponses.length), value => value > before, 'leaderboard bootstrap response')
  const bootRequests = network.leaderboardRequests.length - before
  if (bootRequests !== 1) fail(`${width}px boot made ${bootRequests} leaderboard GETs, expected one`)
  const bootstrap = network.leaderboardResponses.at(-1)
  if (bootstrap.status !== 200) fail(`${width}px leaderboard bootstrap returned ${bootstrap.status}`)
  if (network.leaderboardRequests.at(-1)?.language !== 'en') {
    fail(`${width}px English locale was not sent to Worker: ${JSON.stringify(network.leaderboardRequests.at(-1))}`)
  }
  await until(() => Promise.resolve(network.webSocketHandshakes.length), value => value > beforeSockets,
    `${width}px leaderboard WebSocket handshake`)
  if (network.webSocketHandshakes.at(-1).status !== 101) {
    fail(`${width}px leaderboard WebSocket returned ${network.webSocketHandshakes.at(-1).status}`)
  }
  await until(() => cdp.eval(`(() => {
    const board = document.querySelector('aside')
    const ready = board?.querySelector('table') || board?.textContent?.includes('No verified scores yet')
    return Boolean(ready && !board.textContent.includes('Live updates reconnecting'))
  })()`), Boolean, `${width}px online leaderboard status`)

  const measure = async () => cdp.eval(`({ viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth })`)
  const dimensions = await measure()
  if (dimensions.viewport !== width || dimensions.document > width + 1 || dimensions.body > width + 1) {
    fail(`${width}px horizontal overflow: ${JSON.stringify(dimensions)}`)
  }
  // visualViewport can settle a frame after navigation on small emulated phones.
  const composition = await until(() => mobile
    ? checkMobileComposition(cdp, width, height)
    : checkDesktopComposition(cdp, width, height), Boolean, `${width}x${height} initial composition`)
  const localeSelector = await checkLocaleSelectorFit(cdp, width, height)
  const selectedLocale = await localeState(cdp)
  if (selectedLocale.value !== 'en' || selectedLocale.stored !== 'en' || selectedLocale.lang !== 'en') {
    fail(`${width}x${height} English locale was lost during navigation: ${JSON.stringify(selectedLocale)}`)
  }
  const deviceRect = await checkViewportFit(cdp, width, height, mobile)
  await checkPageHeight(cdp, width, height, 'menu')
  const guideToggle = mobile ? null : await exerciseGuideToggle(cdp, width, height)
  if (layoutOnly) {
    const screenshot = await capture(cdp, `tablet-${width}x${height}.png`, width)
    return { viewport: `${width}x${height}`, dimensions, bootstrapGets: bootRequests,
      webSocketStatus: 101, deviceRect, composition, localeSelector, guideToggle, screenshot }
  }

  const overlays = mobile ? await exerciseMobileOverlays(cdp, width, height) : null
  const keyboardMode = mobile ? null : await exerciseKeyboardMode(cdp)

  for (let i = 1; i <= GAME_IDS.length; i++) {
    await clickButton(cdp, 'ROTATE DIRECTION')
    const expected = GAME_IDS[i % GAME_IDS.length]
    await until(() => gameLabel(cdp), value => value === expected, `${width}px selected game ${expected}`)
    const board = await cdp.eval(`document.querySelector('aside[aria-label=${JSON.stringify(`${expected.toUpperCase()} leaderboard`)}]') !== null`)
    if (!board) fail(`${width}px leaderboard does not follow ${expected}`)
  }
  if (network.leaderboardRequests.length !== before + 1) {
    fail(`${width}px game switching triggered an extra leaderboard GET`)
  }

  const exercisedGames = mobile ? null : await exerciseAllGames(cdp, network, before + 1)
  const desktopKeyboard = mobile ? null : await exerciseDesktopKeyboard(cdp)

  await clickButton(cdp, 'START(P)')
  await until(() => cdp.eval(`document.querySelector('main[aria-label="Brick Game machine"]')?.textContent?.includes('SCORE') &&
    !document.querySelector('main[aria-label="Brick Game machine"]')?.textContent?.includes('WELCOME')`), Boolean, `${width}px game start`, 15000)
  await until(() => cdp.eval(`document.querySelector('header [role="status"]') !== null`),
    Boolean, `${width}px run-mode notice`)
  const lcdFeedback = mobile && width === 390 ? await checkLcdAndButtonFeedback(cdp, width) : null
  await checkViewportFit(cdp, width, height, mobile)
  if (mobile) await until(() => checkMobileComposition(cdp, width, height),
    Boolean, `${width}x${height} active-run composition`)
  else await checkDesktopComposition(cdp, width, height)
  await checkPageHeight(cdp, width, height, 'active run')
  let retroScreenshot = null
  if (!mobile) {
    await selectRetro(cdp)
    const playing = await cdp.eval(`document.querySelector('[role="img"][aria-label="Playing"]') !== null &&
      !document.querySelector('main[aria-label="Brick Game machine"]')?.textContent?.includes('WELCOME')`)
    if (!playing) fail('Theme switching interrupted active gameplay')
    await checkViewportFit(cdp, width, height, mobile)
    await checkDesktopComposition(cdp, width, height)
    await checkPageHeight(cdp, width, height, 'retro theme')
    retroScreenshot = await capture(cdp, `retro-cream-${width}x${height}.png`, width)
  }
  await clickButton(cdp, 'START(P)')
  await until(() => cdp.eval(`document.querySelector('[role="img"][aria-label="Paused"]') !== null`), Boolean, `${width}px paused indicator`, 3000)
  await clickButton(cdp, 'RESET(R)')
  await until(() => cdp.eval(`document.querySelector('main[aria-label="Brick Game machine"]')?.textContent?.includes('WELCOME')`), Boolean, `${width}px reset to menu`)
  await checkViewportFit(cdp, width, height, mobile)
  if (mobile) await until(() => checkMobileComposition(cdp, width, height),
    Boolean, `${width}x${height} reset composition`)
  else await checkDesktopComposition(cdp, width, height)
  await checkPageHeight(cdp, width, height, 'reset')

  const after = await measure()
  if (after.document > width + 1 || after.body > width + 1) fail(`${width}px overflow after game controls: ${JSON.stringify(after)}`)
  const screenshot = await capture(cdp, `${mobile ? 'mobile' : 'desktop'}-${width}x${height}.png`, width)
  let retroReloadGets = null
  let persistedKeyboardMode = null
  if (!mobile) {
    const beforeReload = network.leaderboardRequests.length
    await clickSelector(cdp, 'button[data-testid="keyboard-mode-toggle"]', 'keyboard mode toggle')
    await until(() => keyboardModeState(cdp), state => state.stored === 'wasd' && state.pressed === 'true',
      'WASD mode before reload')
    await cdp.send('Page.reload', { ignoreCache: true })
    await until(() => gameLabel(cdp), value => value === 'tank', 'retro reload game menu')
    await until(() => cdp.eval(`document.querySelector('main [class*="GameDevice_retro"]') !== null &&
      document.querySelector('main [class*="GameDevice_modelMark"]')?.textContent?.includes('E-23')`), Boolean, 'persisted Retro Cream theme')
    const stored = await cdp.eval(`JSON.parse(localStorage.getItem('brick-game-theme') || '{}').presetId`)
    if (stored !== 'retro-cream') fail(`Retro Cream localStorage was not preserved: ${stored}`)
    persistedKeyboardMode = await until(() => keyboardModeState(cdp), state => state.pressed === 'true' &&
      state.text === 'Switch to arrows' && state.stored === 'wasd' && state.keyLabel === 'WASD keys' &&
      state.soundButton, 'persisted WASD mode after reload')
    await clickSelector(cdp, 'button[data-testid="keyboard-mode-toggle"]', 'keyboard mode toggle')
    await until(() => keyboardModeState(cdp), state => state.pressed === 'false' && state.stored === 'arrows',
      'arrow mode restored after reload')
    await until(() => Promise.resolve(network.leaderboardRequests.length), value => value > beforeReload, 'retro reload bootstrap GET')
    retroReloadGets = network.leaderboardRequests.length - beforeReload
    if (retroReloadGets !== 1) fail(`Retro reload made ${retroReloadGets} leaderboard GETs`)
  }
  return { viewport: `${width}x${height}`, dimensions: after, deviceRect, composition, localeSelector, guideToggle, keyboardMode, overlays, bootstrapGets: bootRequests,
    webSocketStatus: 101, switchingGets: 0, exercisedGames, desktopKeyboard, lcdFeedback, screenshot, retroScreenshot, retroReloadGets, persistedKeyboardMode }
}

async function runRankedSnake(cdp, network) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
  await cdp.send('Page.navigate', { url: BASE_URL })
  await until(() => gameLabel(cdp), value => value === 'tank', 'ranked game menu')
  await clickButton(cdp, 'ROTATE DIRECTION')
  await until(() => gameLabel(cdp), value => value === 'tetris', 'Tetris menu')
  await clickButton(cdp, 'ROTATE DIRECTION')
  await until(() => gameLabel(cdp), value => value === 'snake', 'Snake menu')
  await clickButton(cdp, 'START(P)')
  await until(() => Promise.resolve(network.apiResponses.find(response => response.path === '/api/runs' && response.status === 201)),
    Boolean, 'ranked run start')
  await until(() => cdp.eval(`document.querySelector('[role="img"][aria-label="Playing"]') !== null`), Boolean, 'Snake playing')
  const rankedNoticeVisible = await cdp.eval(`(() => {
    const notice = [...document.querySelectorAll('[role="status"]')]
      .find(element => element.textContent.includes('Ranked run:'))
    if (!notice) return false
    const rect = notice.getBoundingClientRect()
    const css = getComputedStyle(notice)
    return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight &&
      css.display !== 'none' && css.visibility !== 'hidden'
  })()`)
  if (!rankedNoticeVisible) fail('Mobile ranked status is not visibly rendered during play')
  const snakeHead = await until(() => cdp.eval(`(() => {
    const rows = [...document.querySelectorAll('main [class*="index_matrix"] p')]
    for (let x = 0; x < rows.length; x++) {
      const cells = [...rows[x].children]
      for (let y = 0; y < cells.length - 1; y++) {
        if (cells[y].classList.contains('d') && cells[y + 1].classList.contains('c')) return { x, y }
      }
    }
    return null
  })()`), Boolean, 'initial Snake head location')
  const safeInput = snakeHead.y > 0 ? 'LEFT' : snakeHead.x < 19 ? 'DOWN' : 'QUICK'
  await clickButton(cdp, safeInput)
  await until(() => cdp.eval(`(() => {
    const score = document.querySelector('main [role="img"][aria-label^="SCORE "]')?.getAttribute('aria-label')
    return Number(score?.slice('SCORE '.length)) > 0
  })()`), Boolean, 'positive verified Snake score')
  if (snakeHead.y === 0) await clickButton(cdp, 'LEFT')
  const openedTopTen = await cdp.eval(`(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes('Top 10'))
    if (!button) return false
    button.click()
    return true
  })()`)
  if (!openedTopTen) fail('Mobile Top 10 trigger is missing during ranked play')
  await until(() => cdp.eval(`document.querySelector('[role="dialog"][aria-labelledby="mobile-leaderboard-title"]') !== null`),
    Boolean, 'mobile Top 10 overlay during game over')
  await until(() => Promise.resolve(network.apiResponses.find(response => response.path.endsWith('/finish') && response.status === 200)),
    Boolean, 'verified Snake finish', 20000)
  await until(() => cdp.eval(`document.querySelector('[role="dialog"] #claim-nickname') !== null`),
    Boolean, 'verified Top 10 nickname dialog')
  const claimStack = await cdp.eval(`(() => {
    const input = document.querySelector('#claim-nickname')
    const claim = input?.closest('[role="dialog"]')
    const leaderboard = document.querySelector('[role="dialog"][aria-labelledby="mobile-leaderboard-title"]')
    if (!input || !claim || !leaderboard) return null
    const rect = input.getBoundingClientRect()
    const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return { claimZ: Number(getComputedStyle(claim.parentElement).zIndex),
      leaderboardZ: Number(getComputedStyle(leaderboard.parentElement).zIndex),
      inputTopmost: topmost === input, inputFocused: document.activeElement === input }
  })()`)
  if (!claimStack || claimStack.claimZ <= claimStack.leaderboardZ ||
    !claimStack.inputTopmost || !claimStack.inputFocused) {
    fail(`Verified name form is obscured by the mobile Top 10 overlay: ${JSON.stringify(claimStack)}`)
  }
  if (process.env.BRICK_PRODUCTION_MODAL_E2E === '1') {
    const screenshot = await capture(cdp, 'ranked-snake-modal-production-390x844.png', 390)
    return { rankedStart: 201, verifiedFinish: 200, eligibleModal: true,
      claimSubmitted: false, rankedNoticeVisible, claimStack, snakeHead, safeInput, screenshot }
  }
  await cdp.eval(`document.querySelector('#claim-nickname').focus()`)
  await cdp.send('Input.insertText', { text: 'SMOKE_PLAYER' })
  await cdp.eval(`document.querySelector('[role="dialog"] button[type="submit"]').click()`)
  await until(() => Promise.resolve(network.apiResponses.find(response => response.path.endsWith('/claim') && response.status === 200)),
    Boolean, 'successful score claim')
  await until(() => cdp.eval(`document.querySelector('aside[aria-label="SNAKE leaderboard"]')?.textContent?.includes('SMOKE_PLAYER')`),
    Boolean, 'claimed leaderboard entry')
  const boardText = await cdp.eval(`document.querySelector('aside[aria-label="SNAKE leaderboard"]')?.textContent`)
  if (!boardText.includes('v1')) fail('Snake leaderboard version did not advance to 1')
  const screenshot = await capture(cdp, 'ranked-snake-claimed-390x844.png', 390)
  return { rankedStart: 201, verifiedFinish: 200, claim: 200, leaderboardVersion: 1,
    nickname: 'SMOKE_PLAYER', rankedNoticeVisible, claimStack, snakeHead, safeInput, screenshot }
}

async function checkResizeCycle(cdp) {
  const measurements = []
  for (const [width, height] of [[390, 844], [844, 390], [390, 844]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
    await until(() => cdp.eval('innerWidth'), value => value === width, `${width}x${height} resize viewport`)
    const composition = await until(() => checkMobileComposition(cdp, width, height),
      Boolean, `${width}x${height} machine after live resize`)
    await checkViewportFit(cdp, width, height, true)
    await checkPageHeight(cdp, width, height, 'live resize')
    measurements.push({ viewport: `${width}x${height}`, machineHeight: Math.round(composition.device.height) })
  }
  return measurements
}

async function checkTopAnchoredPortraitGrowth(cdp, preset = 'default') {
  const retro = preset === 'Retro Cream'
  const measurements = []
  for (const [width, height] of [[388, 700], [388, 866]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
    const composition = await until(async () => {
      const composition = await checkMobileComposition(cdp, width, height)
      await checkViewportFit(cdp, width, height, true)
      return composition
    }, Boolean, `${width}x${height} portrait machine after live resize`)
    await checkPageHeight(cdp, width, height, 'portrait height comparison')
    const measurement = await cdp.eval(`(() => {
      const bounds = selector => {
        const element = document.querySelector(selector)
        if (!element) return null
        const rect = element.getBoundingClientRect()
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
          height: rect.height, width: rect.width,
          centerY: rect.top + rect.height / 2 }
      }
      return {
        retro: Boolean(document.querySelector('main [class*="GameDevice_device"]')?.className.includes('GameDevice_retro')),
        shell: bounds('main [class*="GameDevice_device"]'),
        screen: bounds('main [class*="GameDevice_screen"]'),
        controls: bounds('main [class*="GameDevice_controlsDock"]'),
        modelMark: bounds('main [class*="GameDevice_modelMark"]'),
        buttons: ['QUICK', 'DOWN', 'LEFT', 'RIGHT', 'ROTATE DIRECTION', 'START(P)',
          'SOUND(S)', 'RESET(R)'].map(label => ({
          label,
          box: bounds('button[aria-label="' + label + '"]'),
          circle: bounds('button[aria-label="' + label + '"] i')
        }))
      }
    })()`)
    if (!measurement.shell || !measurement.screen || !measurement.controls ||
      measurement.buttons.some(({ box, circle }) => !box || !circle)) {
      fail(`${width}x${height} portrait anchor measurement is incomplete: ${JSON.stringify(measurement)}`)
    }
    if (retro && (!measurement.retro || !measurement.modelMark)) {
      fail(`${width}x${height} Retro Cream machine shape or model mark is missing: ${JSON.stringify(measurement)}`)
    }
    const withinShell = box => box.left >= measurement.shell.left - 2 &&
      box.right <= measurement.shell.right + 2 && box.top >= measurement.shell.top - 2 &&
      box.bottom <= measurement.shell.bottom + 2
    if (![measurement.screen, ...measurement.buttons.map(button => button.box),
      ...measurement.buttons.map(button => button.circle),
      ...(retro ? [measurement.modelMark] : [])].every(withinShell)) {
      fail(`${width}x${height} ${preset} LCD, button, or model mark is clipped by the shell: ${JSON.stringify(measurement)}`)
    }
    if (measurement.screen.bottom >= measurement.controls.top - 2) {
      fail(`${width}x${height} LCD overlaps the controls group: ${JSON.stringify(measurement)}`)
    }
    if (retro && Math.max(...measurement.buttons.map(button => button.box.bottom)) >= measurement.modelMark.top - 2) {
      fail(`${width}x${height} Retro Cream control labels overlap the model mark: ${JSON.stringify(measurement)}`)
    }
    const screenshot = retro ? await capture(cdp, `retro-mobile-${width}x${height}.png`, width) : null
    measurements.push({ viewport: `${width}x${height}`, screenshot,
      lcdToButtonGap: composition.lcdToButtonGap, ...measurement })
  }
  const [short, tall] = measurements
  if (tall.shell.height - short.shell.height < 120 || Math.abs(tall.shell.width - short.shell.width) > 1) {
    fail(`Portrait comparison did not lengthen only the shell: ${JSON.stringify(measurements)}`)
  }
  const shellTopShift = tall.shell.top - short.shell.top
  const screenTopShift = tall.screen.top - short.screen.top
  if (Math.abs(shellTopShift) > 2 || Math.abs(screenTopShift) > 2) {
    fail(`Portrait top rim and LCD must remain anchored while the shell grows downward: ${JSON.stringify({
      shellTopShift, screenTopShift, measurements
    })}`)
  }
  if (tall.shell.bottom - short.shell.bottom < 120) {
    fail(`Portrait shell did not extend downward: ${JSON.stringify(measurements)}`)
  }
  const screenScaleX = tall.screen.width / short.screen.width
  const screenScaleY = tall.screen.height / short.screen.height
  const screenScale = (screenScaleX + screenScaleY) / 2
  if (screenScale < 1.05 || Math.abs(screenScaleX - screenScaleY) > .015) {
    fail(`Portrait LCD did not enlarge uniformly with the shell: ${JSON.stringify({
      screenScaleX, screenScaleY, measurements
    })}`)
  }
  const controlsTopShift = tall.controls.top - short.controls.top
  if (controlsTopShift < 5) {
    fail(`Portrait controls did not move down below the enlarged LCD: ${JSON.stringify({
      controlsTopShift, measurements
    })}`)
  }
  for (let index = 0; index < short.buttons.length; index++) {
    const shortButton = short.buttons[index]
    const tallButton = tall.buttons[index]
    const buttonScaleX = tallButton.circle.width / shortButton.circle.width
    const buttonScaleY = tallButton.circle.height / shortButton.circle.height
    if (buttonScaleX < 1.05 || Math.abs(buttonScaleX - buttonScaleY) > .02 ||
      Math.abs(buttonScaleX - screenScale) > .025) {
      fail(`Portrait ${shortButton.label} did not enlarge in proportion with the LCD: ${JSON.stringify({
        screenScale, buttonScaleX, buttonScaleY, measurements
      })}`)
    }
    if (tallButton.circle.centerY < shortButton.circle.centerY + 5) {
      fail(`Portrait ${shortButton.label} did not move down with the enlarged controls: ${JSON.stringify({
        shortButton, tallButton, measurements
      })}`)
    }
  }
  return measurements.map(({ viewport, screenshot, shell, lcdToButtonGap }) => ({
    viewport,
    preset,
    machineHeight: Math.round(shell.height),
    lcdToButtonGap: Math.round(lcdToButtonGap),
    maxAllowedGap: Math.round(Number(viewport.split('x')[1]) * .1),
    lcdAndButtonScale: Number(screenScale.toFixed(3)),
    shellTopShift: Math.round(shellTopShift),
    lcdTopShift: Math.round(screenTopShift),
    controlsTopShift: Math.round(controlsTopShift),
    screenshot
  }))
}

async function checkRetroPortraitGaps(cdp) {
  const results = []
  for (const [width, height] of [[320, 568], [360, 640], [388, 700], [388, 866],
    [390, 844], [412, 915], [600, 960], [768, 1024], [800, 1024]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
    await until(() => cdp.eval('innerWidth'), value => value === width, `${width}x${height} Retro portrait viewport`)
    const composition = await until(async () => {
      const measured = await checkMobileComposition(cdp, width, height)
      await checkViewportFit(cdp, width, height, true)
      return measured
    }, Boolean, `${width}x${height} Retro LCD-to-button gap`)
    const hasRetro = await cdp.eval(`document.querySelector('main [class*="GameDevice_device"]')?.className.includes('GameDevice_retro')`)
    if (!hasRetro) fail(`${width}x${height} Retro preset was lost during resize`)
    await checkPageHeight(cdp, width, height, 'Retro portrait gap')
    const screenshot = width === 320 ? await capture(cdp, 'retro-mobile-320x568.png', width) : null
    results.push({ viewport: `${width}x${height}`,
      lcdToButtonGap: Math.round(composition.lcdToButtonGap), maxAllowedGap: Math.round(height * .1),
      screenshot })
  }
  return results
}

async function main() {
  const url = new URL(BASE_URL)
  const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
  const isolatedPreview = process.env.BRICK_PREVIEW_E2E === '1' && process.env.BRICK_RANKED_E2E === '1' &&
    url.protocol === 'https:' && url.hostname === 'ranked-audit-brick-game.zhaduchanhzz.workers.dev' &&
    !url.port && url.pathname === '/' && !url.search && !url.hash
  const productionModalOnly = process.env.BRICK_PRODUCTION_MODAL_E2E === '1' && process.env.BRICK_RANKED_E2E === '1' &&
    url.protocol === 'https:' && url.hostname === 'brick-game.zhaduchanhzz.workers.dev' &&
    !url.port && url.pathname === '/' && !url.search && !url.hash
  if (!local && !isolatedPreview && !productionModalOnly) {
    fail('Browser smoke requires a local server, ranked QA Preview, or the modal-only production target')
  }
  const browser = (await Promise.all(BROWSER_CANDIDATES.map(async candidate => {
    if (!path.isAbsolute(candidate)) return null
    const info = await fs.stat(candidate).catch(() => null)
    return info?.isFile() ? candidate : null
  }))).find(Boolean)
  if (!browser) fail('Chrome or Edge executable not found; set CHROME_PATH')
  const health = await fetch(`${BASE_URL}/api/health`)
  if (!health.ok) fail(`Worker health returned ${health.status}`)
  await fs.mkdir(OUTPUT, { recursive: true })
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'brick-browser-smoke-'))
  const chrome = spawn(browser, [
    '--headless=new', '--disable-gpu', '--disable-gpu-sandbox', '--no-sandbox', '--disable-software-rasterizer',
    '--disable-extensions', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore', windowsHide: true })
  let cdp
  try {
    const portFile = path.join(profile, 'DevToolsActivePort')
    const port = await until(async () => {
      const contents = await fs.readFile(portFile, 'utf8')
      return Number(contents.split(/\r?\n/)[0])
    }, value => Number.isInteger(value) && value > 0, 'Chrome debugging port')
    const targets = await until(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      return response.json()
    }, value => Array.isArray(value) && value.some(target => target.type === 'page'), 'Chrome page target')
    const tab = targets.find(target => target.type === 'page')
    cdp = await connect(tab.webSocketDebuggerUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Network.enable')
    const network = { leaderboardRequests: [], leaderboardResponses: [], webSocketHandshakes: [], apiResponses: [], exceptions: [] }
    cdp.on('Network.requestWillBeSent', event => {
      const requestUrl = new URL(event.request.url)
      if (event.request.method === 'GET' && requestUrl.pathname === '/api/leaderboards') {
        const language = Object.entries(event.request.headers || {})
          .find(([name]) => name.toLowerCase() === 'accept-language')?.[1] || null
        network.leaderboardRequests.push({ url: requestUrl.pathname, time: event.timestamp, language })
      }
    })
    cdp.on('Network.responseReceived', event => {
      const responseUrl = new URL(event.response.url)
      if (responseUrl.pathname === '/api/leaderboards') network.leaderboardResponses.push({ status: event.response.status })
      if (responseUrl.pathname.startsWith('/api/runs')) network.apiResponses.push({ path: responseUrl.pathname, status: event.response.status })
    })
    cdp.on('Network.webSocketHandshakeResponseReceived', event => {
      network.webSocketHandshakes.push({ status: event.response.status })
    })
    cdp.on('Runtime.exceptionThrown', event => network.exceptions.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || 'unknown'))

    const locales = await exerciseLocales(cdp, network)
    if (process.env.BRICK_RANKED_E2E === '1') {
      const ranked = await runRankedSnake(cdp, network)
      if (network.exceptions.length) fail(`Browser exceptions: ${network.exceptions.join(', ')}`)
      console.log(JSON.stringify({ passed: true, locales, ranked }, null, 2))
      return
    }
    const smallMobile = await runViewport(cdp, network, 320, 568, true)
    const mobile = await runViewport(cdp, network, 390, 844, true)
    const desktop = await runViewport(cdp, network, 1440, 900, false)
    const tablet = await runViewport(cdp, network, 1024, 768, false, true)
    await cdp.eval(`localStorage.removeItem('brick-game-theme')`)
    const reference = await runViewport(cdp, network, 1848, 997, false, true)
    await cdp.eval(`localStorage.removeItem('brick-game-theme')`)
    const portrait = await runViewport(cdp, network, 800, 1024, true, true)
    const additionalViewports = []
    for (const [width, height, isMobile] of [
      [360, 640, true], [388, 866, true], [412, 915, true], [600, 960, true],
      [768, 1024, true], [844, 390, true], [1366, 768, false]
    ]) {
      const result = await runViewport(cdp, network, width, height, isMobile, true)
      additionalViewports.push({
        viewport: result.viewport,
        machineHeight: Math.round(result.deviceRect.bottom - result.deviceRect.top),
        lcdToButtonGap: result.composition.lcdToButtonGap,
        maxAllowedGap: isMobile && height > width ? height * .1 : undefined,
        themeButton: result.composition.themeButton && {
          width: result.composition.themeButton.width,
          height: result.composition.themeButton.height
        },
        topTenButton: result.composition.topTenButton && {
          width: result.composition.topTenButton.width,
          height: result.composition.topTenButton.height
        },
        screenshot: result.screenshot
      })
    }
    const resizeCycle = await checkResizeCycle(cdp)
    const topAnchoredPortrait = await checkTopAnchoredPortraitGrowth(cdp)
    await selectRetro(cdp)
    const retroTopAnchoredPortrait = await checkTopAnchoredPortraitGrowth(cdp, 'Retro Cream')
    const retroPortraitGaps = await checkRetroPortraitGaps(cdp)
    if (network.exceptions.length) fail(`Browser exceptions: ${network.exceptions.join(', ')}`)
    console.log(JSON.stringify({ passed: true, locales, smallMobile, mobile, desktop, tablet, reference, portrait,
      additionalViewports, resizeCycle, topAnchoredPortrait, retroTopAnchoredPortrait, retroPortraitGaps }, null, 2))
  } finally {
    if (cdp) cdp.socket.close()
    chrome.kill()
    const profilePath = path.resolve(profile)
    const tempPath = path.resolve(os.tmpdir())
    if (path.dirname(profilePath) === tempPath && path.basename(profilePath).startsWith('brick-browser-smoke-')) {
      await fs.rm(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {})
    }
  }
}

main().catch(error => {
  console.error(`Browser smoke failed: ${error.message}`)
  process.exitCode = 1
})
