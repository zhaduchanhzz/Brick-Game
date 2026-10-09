import React, { useEffect, useRef, useState } from 'react'
import { claimRun } from '../../api/client'
import style from './leaderboard.module.less'

export default function ClaimNameDialog({ result, returnFocusRef, onClose, onClaimed, onIneligible }) {
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const closeRef = useRef(null)

  useEffect(() => {
    if (!result || result.verified !== true || result.eligibleToClaim !== true) return undefined
    const previousFocus = document.activeElement
    setNickname('')
    setError('')
    if (inputRef.current) inputRef.current.focus()
    return () => {
      const fallback = returnFocusRef && returnFocusRef.current
      const target = previousFocus && previousFocus !== document.body && previousFocus.isConnected ? previousFocus : fallback
      if (target && typeof target.focus === 'function') target.focus()
    }
  }, [result, returnFocusRef])

  if (!result || result.verified !== true || result.eligibleToClaim !== true) return null

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await claimRun(result.runId, { nickname: nickname.trim() })
      if (!response || response.accepted !== true) throw new Error('The score could not be claimed.')
      onClaimed(result, response)
    } catch (claimError) {
      if (claimError.code === 'NOT_ELIGIBLE') {
        onIneligible()
      } else if (claimError.code === 'INVALID_NICKNAME') {
        setError('Use 2–20 letters, numbers, spaces, underscores, hyphens, or periods.')
      } else {
        setError('Could not submit your name. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && !busy) onClose()
    if (event.key === 'Tab') {
      if (event.shiftKey && document.activeElement === inputRef.current) {
        event.preventDefault()
        if (closeRef.current) closeRef.current.focus()
      } else if (!event.shiftKey && document.activeElement === closeRef.current) {
        event.preventDefault()
        if (inputRef.current) inputRef.current.focus()
      }
    }
  }

  return (
    <div className={style.backdrop}>
      <section className={style.dialog} role="dialog" aria-modal="true" aria-labelledby="claim-title" onKeyDown={onKeyDown}>
        <h2 id="claim-title">New high score</h2>
        <p>The server verified {new Intl.NumberFormat().format(result.rawScore)} × level {result.startLevel} = <strong>{new Intl.NumberFormat().format(result.finalScore)}</strong> points.</p>
        <p>Enter a name to claim a Top 10 place in {result.gameId}. Your position is checked again when you submit.</p>
        <form onSubmit={submit}>
          <label htmlFor="claim-nickname">Player name</label>
          <input ref={inputRef} id="claim-nickname" name="nickname" value={nickname} onChange={event => setNickname(event.target.value)} minLength={2} maxLength={20} required autoComplete="nickname" />
          {error && <p className={style.formError} role="alert">{error}</p>}
          <div className={style.dialogActions}>
            <button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Claim score'}</button>
            <button ref={closeRef} type="button" disabled={busy} onClick={onClose}>Skip claim</button>
          </div>
        </form>
      </section>
    </div>
  )
}
