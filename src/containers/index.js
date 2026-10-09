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
  const gameMainRef = useRef(null)
  const leaderboard = useLeaderboardSync()
  const resolvedTheme = resolveTheme(theme)
  const board = leaderboard.games[gameId] || { version: 0, entries: [] }
  const leaderboardProps = { gameId, board, status: leaderboard.status, connection: leaderboard.connection, error: leaderboard.error, onRetry: leaderboard.retry, lastVerified }

  useEffect(() => saveTheme(theme), [theme])
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
          <MobileLeaderboard panelProps={leaderboardProps} />
        </div>
        <p className={style.controlsHint}>Use the machine buttons or arrow keys. P starts or pauses, R resets, S toggles sound, and Space rotates games from the menu.</p>
      </header>
      <div className={style.layout}>
        <main ref={gameMainRef} tabIndex={-1} className={style.gameColumn} aria-label="Brick Game machine">
          <GameDevice shape={resolvedTheme.shape} />
        </main>
        <div className={style.desktopLeaderboard}><LeaderboardPanel {...leaderboardProps} /></div>
      </div>
      <ClaimNameDialog result={claimCandidate} returnFocusRef={gameMainRef} onClose={onClaimClosed} onClaimed={onClaimed} onIneligible={onIneligible} />
    </div>
  )
}
