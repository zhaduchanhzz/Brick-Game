import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ThemeEditor from './ThemeEditor'
import { useI18n } from '../../i18n'
import style from './theme.module.less'

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

export default function ThemeDialog({ theme, onColorChange, onPresetChange, onReset }) {
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

  function handleKeyDown(event) {
    // Keep the game's document-level keyboard shortcuts from acting on dialog keys.
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    } else if (event.key === 'Tab') {
      const focusable = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
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
      <button ref={triggerRef} className={style.trigger} type="button" aria-label={t('theme.changeDevice')} title={t('theme.changeDevice')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg className={style.triggerDevice} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <rect className={style.triggerDeviceShell} x="5" y="1" width="22" height="30" rx="4" />
          <rect className={style.triggerDeviceScreen} x="8.5" y="4.5" width="15" height="13" rx="1" />
          <path className={style.triggerDevicePixels} d="M11 14h3v-3h3V8h3v6h-3v2h-6z" />
          <path className={style.triggerDeviceDpad} d="M10 23h8m-4-4v8" />
          <circle className={style.triggerDeviceButton} cx="21" cy="24" r="2" />
          <circle className={style.triggerDeviceButton} cx="24" cy="20" r="1.5" />
        </svg>
        <span>{t('theme.changeDevice')}</span>
      </button>
      {open && createPortal(
        <div className={style.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
          <section ref={dialogRef} className={style.dialog} role="dialog" aria-modal="true" aria-labelledby="theme-dialog-title" aria-describedby="theme-dialog-description" onKeyDown={handleKeyDown}>
            <div className={style.dialogHeader}>
              <div>
                <p className={style.eyebrow}>{t('theme.eyebrow')}</p>
                <h2 id="theme-dialog-title">{t('theme.title')}</h2>
                <p id="theme-dialog-description">{t('theme.description')}</p>
              </div>
              <button ref={closeRef} className={style.close} type="button" aria-label={t('theme.close')} onClick={() => setOpen(false)}>×</button>
            </div>
            <ThemeEditor theme={theme} onColorChange={onColorChange} onPresetChange={onPresetChange} onReset={onReset} />
          </section>
        </div>, document.body,
      )}
    </>
  )
}
