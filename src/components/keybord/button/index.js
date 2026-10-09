import React, { useCallback, useEffect, useRef, useState } from 'react'
import cn from 'classnames'
import style from './index.module.less'
import { transform } from '../../../utils/const'
import control from '../../../control'
import { shallowEqual, useSelector } from 'react-redux'
import { initGameData } from '../../../utils/games'
import PropTypes from 'prop-types'

const Button = ({ color, size, top, left, label, position, arrow, type }) => {
  const [active, setActive] = useState(false)
  const suppressClick = useRef(false)
  const activeSince = useRef(null)
  const releaseTimer = useRef(null)
  const pause = useSelector(state => state.pause, shallowEqual)
  const game = useSelector(state => state.game, shallowEqual)

  const memoHandleDown = useCallback(
    () => {
      clearTimeout(releaseTimer.current)
      activeSince.current = Date.now()
      setActive(true)
      if (pause === 0) {
        control['todo'][type]()
      } else {
        control[initGameData[game].name][type]()
      }
    },
    [pause, game, type]
  )

  const memoHandleUp = useCallback(
    () => {
      control.clearLoop()
      clearTimeout(releaseTimer.current)
      if (activeSince.current === null) return
      // Keep a quick tap visible long enough to feel like a physical press.
      const remaining = Math.max(0, 90 - (Date.now() - activeSince.current))
      releaseTimer.current = setTimeout(() => {
        activeSince.current = null
        setActive(false)
      }, remaining)
    },
    []
  )

  useEffect(() => () => clearTimeout(releaseTimer.current), [])

  return (
    <button
      type="button"
      aria-label={label}
      className={cn({ [style.button]: true, [style[color]]: true, [style[size]]: true })}
      style={{ top, left }}
      onPointerDown={event => {
        if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId)
        memoHandleDown()
      }}
      onPointerUp={memoHandleUp}
      onPointerCancel={memoHandleUp}
      onLostPointerCapture={memoHandleUp}
      onKeyDown={event => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
          event.preventDefault()
          suppressClick.current = true
          memoHandleDown()
        }
      }}
      onKeyUp={event => {
        if (event.key === 'Enter' || event.key === ' ') memoHandleUp()
      }}
      onClick={event => {
        if (event.detail === 0 && !suppressClick.current) {
          memoHandleDown()
          memoHandleUp()
        }
        suppressClick.current = false
      }}
      onBlur={memoHandleUp}
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
