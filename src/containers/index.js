import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSelector } from 'react-redux'
import GameDevice from '../components/device/GameDevice'
import ThemeDialog from '../components/theme/ThemeDialog'
import LeaderboardPanel from '../components/leaderboard/LeaderboardPanel'
import ClaimNameDialog from '../components/leaderboard/ClaimNameDialog'
import RunModeNotice from '../components/run/RunModeNotice'
import useLeaderboardSync from '../hooks/useLeaderboardSync'
import { subscribeVerifiedRun } from '../api/runResults'
import { publishRunMode, subscribeRunMode } from '../api/runMode'
import { COLOR_FIELDS, DEFAULT_PRESET_ID, THEME_STORAGE_VERSION, isHexColor, loadTheme, resolveTheme, saveTheme, themeVariables } from '../theme/presets'
import { getKeyboardMode, setKeyboardMode, subscribeKeyboardMode } from '../control/keyboardMode'
import { I18nProvider, loadLocale, saveLocale, translate, useI18n } from '../i18n'
import style from './index.module.less'

const COLOR_KEYS = new Set(COLOR_FIELDS.map(([key]) => key))
const GUIDE_STORAGE_KEY = 'brick-game-guide-visible'

function loadGuideVisibility() {
  try {
    return window.localStorage.getItem(GUIDE_STORAGE_KEY) !== 'false'
  } catch (_error) {
    return true
  }
}

export function MobileLeaderboard({ panelProps }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const dialogRef = useRef(null)
  const closeRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (triggerRef.current) triggerRef.current.focus()
    }
  }, [open])

  function onKeyDown(event) {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    } else if (event.key === 'Tab') {
      const buttons = Array.from(dialogRef.current.querySelectorAll('button:not([disabled])'))
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <>
      <button ref={triggerRef} className={style.mobileLeaderboardButton} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>{t('app.topTenButton')}</button>
      {open && createPortal(
        <div className={style.mobileLeaderboardOverlay} onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
          <section ref={dialogRef} className={style.mobileLeaderboardContent} role="dialog" aria-modal="true" aria-labelledby="mobile-leaderboard-title" onKeyDown={onKeyDown}>
            <div className={style.mobileLeaderboardHeader}>
              <h2 id="mobile-leaderboard-title">{t('app.topTenTitle')}</h2>
              <button ref={closeRef} className={style.mobileLeaderboardClose} type="button" aria-label={t('app.closeLeaderboard')} onClick={() => setOpen(false)}>×</button>
            </div>
            <LeaderboardPanel {...panelProps} />
          </section>
        </div>, document.body,
      )}
    </>
  )
}

export default function App() {
  const gameId = useSelector(state => state.games[state.game].name)
  const [theme, setTheme] = useState(loadTheme)
  const [lastVerified, setLastVerified] = useState(null)
  const [claimCandidate, setClaimCandidate] = useState(null)
  const [runMode, setRunMode] = useState({ mode: 'idle' })
  const [guideVisible, setGuideVisible] = useState(loadGuideVisibility)
  const [keyboardMode, setKeyboardModeState] = useState(getKeyboardMode)
  const [locale, setLocale] = useState(loadLocale)
  const t = (key, params) => translate(locale, key, params)
  const gameMainRef = useRef(null)
  const leaderboard = useLeaderboardSync()
  const resolvedTheme = resolveTheme(theme)
  const board = leaderboard.games[gameId] || { version: 0, entries: [] }
  const leaderboardProps = { gameId, board, status: leaderboard.status, connection: leaderboard.connection, error: leaderboard.error, onRetry: leaderboard.retry, lastVerified }

  useEffect(() => saveTheme(theme), [theme])
  useEffect(() => {
    saveLocale(locale)
    document.documentElement.lang = locale
  }, [locale])
  useEffect(() => subscribeKeyboardMode(setKeyboardModeState), [])
  useEffect(() => {
    try {
      window.localStorage.setItem(GUIDE_STORAGE_KEY, String(guideVisible))
    } catch (_error) {
      // The toggle still works when browser storage is unavailable.
    }
  }, [guideVisible])
  useEffect(() => subscribeVerifiedRun(result => {
    setLastVerified(result)
    setClaimCandidate(result.eligibleToClaim === true ? result : null)
  }), [])
  useEffect(() => subscribeRunMode(mode => {
    setRunMode(mode)
    if (mode.mode === 'ranked' || mode.mode === 'casual') {
      setLastVerified(current => current && current.claimLost ? { ...current, claimLost: false } : current)
    }
  }), [])

  function choosePreset(presetId) {
    setTheme({ version: THEME_STORAGE_VERSION, presetId, overrides: {} })
  }

  function changeColor(key, color) {
    if (!COLOR_KEYS.has(key) || !isHexColor(color)) return
    setTheme(current => ({ ...current, overrides: { ...current.overrides, [key]: color.toUpperCase() } }))
  }

  function resetTheme() {
    setTheme({ version: THEME_STORAGE_VERSION, presetId: DEFAULT_PRESET_ID, overrides: {} })
  }

  function onClaimed(result, response) {
    setLastVerified(current => current && current.runId === result.runId ? { ...current, claimed: true } : current)
    setClaimCandidate(null)
    leaderboard.notifyVersion(result.gameId, response.boardVersion)
    publishRunMode({ mode: 'claimed' })
  }

  function onIneligible() {
    setLastVerified(current => current ? { ...current, eligibleToClaim: false, claimLost: true } : current)
    setClaimCandidate(null)
    publishRunMode({ mode: 'not-eligible', reason: 'BOARD_CHANGED' })
  }

  function onClaimClosed() {
    setClaimCandidate(null)
    publishRunMode({ mode: 'claim-skipped' })
  }

  return (
    <I18nProvider locale={locale}>
      <div className={style.page} style={themeVariables(theme)}>
        <header className={style.header}>
          <div className={style.brand}>
            <p>{t('app.brandKicker')}</p>
            <h1>BRICK GAME</h1>
            <span>{t('app.brandTagline')}</span>
          </div>
          <div className={style.gameTitle}><span className={style.liveDot} /> {t('app.nowPlaying')} <strong>{t(`game.${gameId}`).toUpperCase()}</strong></div>
          {runMode.mode !== 'idle' && <div className={style.runNotice}><RunModeNotice runMode={runMode} /></div>}
          <div className={style.toolbar}>
            <ThemeDialog theme={theme} onColorChange={changeColor} onPresetChange={choosePreset} onReset={resetTheme} />
            <select className={style.localeSelect} data-testid="locale-select" aria-label={t('app.language')} value={locale} onChange={event => setLocale(event.target.value)}>
              <option value="vi">VI</option>
              <option value="en">EN</option>
              <option value="zh-CN">中文</option>
            </select>
            <button className={`${style.toolbarToggle} ${style.guideToggle}`} type="button" aria-controls="movement-keyboard-guide action-keyboard-guide" aria-expanded={guideVisible} onClick={() => setGuideVisible(visible => !visible)}>
              {guideVisible ? t('app.hideGuide') : t('app.showGuide')}
            </button>
            <button className={`${style.toolbarToggle} ${style.modeToggle}`} data-testid="keyboard-mode-toggle" type="button" aria-label={t('app.wasdMovement')} aria-pressed={keyboardMode === 'wasd'} onClick={() => setKeyboardMode(keyboardMode === 'wasd' ? 'arrows' : 'wasd')}>
              {keyboardMode === 'wasd' ? t('app.switchToArrows') : t('app.switchToWasd')}
            </button>
            <MobileLeaderboard panelProps={leaderboardProps} />
          </div>
          <section id="movement-keyboard-guide" className={style.controlsPanel} aria-label={t('app.movementAria')} hidden={!guideVisible}>
            <span className={style.controlsKicker}>{t('app.desktopControls1')}</span>
            <h2>{t('app.moveSelect')}</h2>
            <div className={style.directionKeys} aria-label={keyboardMode === 'wasd' ? t('app.wasdKeys') : t('app.arrowKeys')}>
              <kbd>{keyboardMode === 'wasd' ? 'W' : '↑'}</kbd>
              <div><kbd>{keyboardMode === 'wasd' ? 'A' : '←'}</kbd><kbd>{keyboardMode === 'wasd' ? 'S' : '↓'}</kbd><kbd>{keyboardMode === 'wasd' ? 'D' : '→'}</kbd></div>
            </div>
            {keyboardMode === 'wasd'
              ? <p>{t('app.wasdMoveHelp')}</p>
              : <p>{t('app.arrowMoveHelp')}</p>}
          </section>
        </header>
        <div className={style.layout}>
          <main ref={gameMainRef} tabIndex={-1} className={style.gameColumn} data-testid="brick-game-machine" aria-label={t('app.machineAria')}>
            <GameDevice shape={resolvedTheme.shape} keyboardMode={keyboardMode} />
          </main>
          <div className={style.desktopLeaderboard}>
            <LeaderboardPanel {...leaderboardProps} />
            <section id="action-keyboard-guide" className={style.controlsPanel} aria-label={t('app.actionAria')} hidden={!guideVisible}>
              <span className={style.controlsKicker}>{t('app.desktopControls2')}</span>
              <h2>{t('app.actionSystem')}</h2>
              <div className={style.shortcutRow}><kbd>X</kbd><span>{t('app.actionFireRotate')}</span></div>
              <div className={style.shortcutRow}><kbd>P</kbd><span>{t('app.startPause')}</span></div>
              <div className={style.shortcutRow}><kbd>R</kbd><span>{t('app.reset')}</span><kbd>{keyboardMode === 'wasd' ? 'M' : 'S'}</kbd><span>{t('app.sound')}</span></div>
              <p>{t('app.actionHint')}</p>
            </section>
          </div>
        </div>
        <ClaimNameDialog result={claimCandidate} returnFocusRef={gameMainRef} onClose={onClaimClosed} onClaimed={onClaimed} onIneligible={onIneligible} />
      </div>
    </I18nProvider>
  )
}
