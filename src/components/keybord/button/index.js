import React, { useCallback, useEffect, useRef, useState } from 'react'
import cn from 'classnames'
import style from './index.module.less'
import { transform } from '../../../utils/const'
import control from '../../../control'
import store from '../../../store'
import { initGameData } from '../../../utils/games'
import { subscribeKeyboardFeedback } from '../../../control/keyboardFeedback'
import PropTypes from 'prop-types'

const Button = ({ color, size, top, left, label, position, arrow, type }) => {
  const [active, setActive] = useState(false)
  const activeSince = useRef(null)
  const releaseTimer = useRef(null)
  const pressedSources = useRef(new Set())

  const pressVisual = useCallback(source => {
    pressedSources.current.add(source)
    clearTimeout(releaseTimer.current)
    activeSince.current = Date.now()
    setActive(true)
  }, [])

  const releaseVisual = useCallback(source => {
    if (!pressedSources.current.delete(source)) return false
    if (pressedSources.current.size > 0) return true
    clearTimeout(releaseTimer.current)
    // Keep a quick key or pointer tap visible like a physical press.
    const remaining = Math.max(0, 90 - (Date.now() - activeSince.current))
    releaseTimer.current = setTimeout(() => {
      activeSince.current = null
      setActive(false)
    }, remaining)
    return true
  }, [])

  const memoHandleDown = useCallback(
    source => {
      pressVisual(source)
      const { pause, game } = store.getState()
      if (pause === 0) {
        control['todo'][type]()
      } else {
        control[initGameData[game].name][type]()
      }
    },
    [type, pressVisual]
  )

  const memoHandleUp = useCallback(
    source => {
      if (releaseVisual(source)) control.clearLoop()
    },
    [releaseVisual]
  )

  useEffect(() => () => clearTimeout(releaseTimer.current), [])
  useEffect(() => subscribeKeyboardFeedback((action, pressed) => {
    if (action !== type) return
    if (pressed) pressVisual('hotkey')
    else releaseVisual('hotkey')
  }), [type, pressVisual, releaseVisual])

  return (
    <button
      type="button"
      data-machine-control={type}
      aria-label={label}
      className={cn({ [style.button]: true, [style[color]]: true, [style[size]]: true })}
      style={{ top, left }}
      onPointerDown={event => {
        if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId)
        memoHandleDown('pointer')
      }}
      onPointerUp={() => memoHandleUp('pointer')}
      onPointerCancel={() => memoHandleUp('pointer')}
      onLostPointerCapture={() => memoHandleUp('pointer')}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          if (!event.repeat) memoHandleDown('button-key')
        }
      }}
      onKeyUp={event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          memoHandleUp('button-key')
        }
      }}
      onClick={event => {
        if (event.detail === 0) {
          memoHandleDown('click')
          memoHandleUp('click')
        }
      }}
      onBlur={() => memoHandleUp('button-key')}
    >
      <i className={cn({ [style.active]: active })} aria-hidden="true" />
      {size === 's1' && <em aria-hidden="true" style={{ [transform]: `${arrow} scale(1,2)` }} />}
      <span className={cn({ [style.position]: position })}>{label}</span>
    </button>
  )
}

Button.propTypes = {
  color: PropTypes.string.isRequired,
  size: PropTypes.string.isRequired,
  top: PropTypes.number.isRequired,
  left: PropTypes.number.isRequired,
  label: PropTypes.string.isRequired,
  position: PropTypes.bool,
  arrow: PropTypes.string,
  type: PropTypes.string.isRequired,
}

export default Button
