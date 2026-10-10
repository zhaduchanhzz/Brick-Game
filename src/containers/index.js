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
      <button ref={triggerRef} className={style.mobileLeaderboardButton} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>🏆 Top 10</button>
      {open && createPortal(
        <div className={style.mobileLeaderboardOverlay} onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
          <section ref={dialogRef} className={style.mobileLeaderboardContent} role="dialog" aria-modal="true" aria-labelledby="mobile-leaderboard-title" onKeyDown={onKeyDown}>
            <div className={style.mobileLeaderboardHeader}>
              <h2 id="mobile-leaderboard-title">Top 10 leaderboard</h2>
              <button ref={closeRef} className={style.mobileLeaderboardClose} type="button" aria-label="Close leaderboard" onClick={() => setOpen(false)}>×</button>
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
  const gameMainRef = useRef(null)
  const leaderboard = useLeaderboardSync()
  const resolvedTheme = resolveTheme(theme)
  const board = leaderboard.games[gameId] || { version: 0, entries: [] }
  const leaderboardProps = { gameId, board, status: leaderboard.status, connection: leaderboard.connection, error: leaderboard.error, onRetry: leaderboard.retry, lastVerified }

  useEffect(() => saveTheme(theme), [theme])
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
    <div className={style.page} style={themeVariables(theme)}>
      <header className={style.header}>
        <div className={style.brand}>
          <p>THE HANDHELD ARCADE</p>
          <h1>BRICK GAME</h1>
          <span>Six classics. One machine.</span>
        </div>
        <div className={style.gameTitle}><span className={style.liveDot} /> NOW PLAYING <strong>{gameId.toUpperCase()}</strong></div>
        {runMode.mode !== 'idle' && <div className={style.runNotice}><RunModeNotice runMode={runMode} /></div>}
        <div className={style.toolbar}>
          <ThemeDialog theme={theme} onColorChange={changeColor} onPresetChange={choosePreset} onReset={resetTheme} />
          <button className={style.guideToggle} type="button" aria-controls="movement-keyboard-guide action-keyboard-guide" aria-expanded={guideVisible} onClick={() => setGuideVisible(visible => !visible)}>
            {guideVisible ? 'Hide guide' : 'Show guide'}
          </button>
          <MobileLeaderboard panelProps={leaderboardProps} />
        </div>
        <section id="movement-keyboard-guide" className={style.controlsPanel} aria-label="Movement keyboard controls" hidden={!guideVisible}>
          <span className={style.controlsKicker}>DESKTOP CONTROLS / 01</span>
          <h2>Move &amp; select</h2>
          <div className={style.directionKeys} aria-label="Arrow keys">
            <kbd>↑</kbd>
            <div><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></div>
          </div>
          <p>Arrow keys move or steer while playing. On the menu, <kbd>←</kbd><kbd>→</kbd> set speed and <kbd>↑</kbd><kbd>↓</kbd> set level.</p>
        </section>
      </header>
      <div className={style.layout}>
        <main ref={gameMainRef} tabIndex={-1} className={style.gameColumn} aria-label="Brick Game machine">
          <GameDevice shape={resolvedTheme.shape} />
        </main>
        <div className={style.desktopLeaderboard}>
          <LeaderboardPanel {...leaderboardProps} />
          <section id="action-keyboard-guide" className={style.controlsPanel} aria-label="Action and system keyboard controls" hidden={!guideVisible}>
            <span className={style.controlsKicker}>DESKTOP CONTROLS / 02</span>
            <h2>Action &amp; system</h2>
            <div className={style.shortcutRow}><kbd>X</kbd><span>Action / fire / rotate*</span></div>
            <div className={style.shortcutRow}><kbd>P</kbd><span>Start / pause</span></div>
            <div className={style.shortcutRow}><kbd>R</kbd><span>Reset</span><kbd>S</kbd><span>Sound</span></div>
            <p><kbd>Space</kbd> or <kbd>X</kbd> selects the next game on the menu. Space also acts in-game when no button is focused. *Action is used in Tetris, Tank and Shooting.</p>
          </section>
        </div>
      </div>
      <ClaimNameDialog result={claimCandidate} returnFocusRef={gameMainRef} onClose={onClaimClosed} onClaimed={onClaimed} onIneligible={onIneligible} />
    </div>
  )
}
