import React, { useEffect, useRef, useState } from 'react'
import { claimRun } from '../../api/client'
import { useI18n } from '../../i18n'
import style from './leaderboard.module.less'

export default function ClaimNameDialog({ result, returnFocusRef, onClose, onClaimed, onIneligible }) {
  const { locale, t } = useI18n()
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
      if (!response || response.accepted !== true) throw new Error('CLAIM_FAILED')
      onClaimed(result, response)
    } catch (claimError) {
      if (claimError.code === 'NOT_ELIGIBLE') {
        onIneligible()
      } else if (claimError.code === 'INVALID_NICKNAME') {
        setError('claim.invalidName')
      } else {
        setError('claim.error')
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
        <h2 id="claim-title">{t('claim.title')}</h2>
        <p>{t('claim.verified', { score: new Intl.NumberFormat(locale).format(result.rawScore), level: result.startLevel, total: new Intl.NumberFormat(locale).format(result.finalScore) })}</p>
        <p>{t('claim.description', { game: t(`game.${result.gameId}`) })}</p>
        <form onSubmit={submit}>
          <label htmlFor="claim-nickname">{t('claim.playerName')}</label>
          <input ref={inputRef} id="claim-nickname" name="nickname" value={nickname} onChange={event => setNickname(event.target.value)} minLength={2} maxLength={20} required autoComplete="nickname" />
          {error && <p className={style.formError} role="alert">{t(error)}</p>}
          <div className={style.dialogActions}>
            <button type="submit" disabled={busy}>{busy ? t('claim.submitting') : t('claim.submit')}</button>
            <button ref={closeRef} type="button" disabled={busy} onClick={onClose}>{t('claim.skip')}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
