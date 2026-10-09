import React from 'react'
import PropTypes from 'prop-types'
import style from './index.module.less'

export default function Pause({ pause }) {
  return (
    <div
      className={`${style.status} ${pause === 2 ? style.paused : pause === 1 ? style.playing : style.ready}`}
      role="img"
      aria-label={pause === 2 ? 'Paused' : pause === 1 ? 'Playing' : 'Ready'}
    >
      <span aria-hidden="true" />
    </div>
  )
}

Pause.propTypes = {
  pause: PropTypes.number.isRequired,
}
