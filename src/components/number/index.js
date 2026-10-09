import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'

import style from './index.module.less'

const formate = (num) => (num < 10 ? `0${num}`.split('') : `${num}`.split(''))

const Number = ({ number, length, time, label }) => {
  const renderNumber = (num, label) => (
    <div className={style.number} role="img" aria-label={label}>
      {num.map((digit, index) => (
        <span aria-hidden="true" key={index}>{digit === 'n' || digit === 'd_c' ? '\u00A0' : digit === 'd' ? ':' : digit}</span>
      ))}
    </div>
  )

  const [now, setNow] = useState(new Date())

  useEffect(() => {
    if (!time) return undefined
    const timer = setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [time])

  if (time) {
    const hour = formate(now.getHours())
    const min = formate(now.getMinutes())
    const sec = now.getSeconds() % 2
    const t = hour.concat(sec ? 'd' : 'd_c', min)
    return renderNumber(t, `Time ${hour.join('')}:${min.join('')}`)
  }
  const num = `${number}`.split('')
  for (let i = 0, len = length - num.length; i < len; i++) {
    num.unshift('n')
  }
  return renderNumber(num, `${label} ${number}`)
}

Number.propTypes = {
  number: PropTypes.number,
  length: PropTypes.number,
  time: PropTypes.bool,
  label: PropTypes.string,
}

Number.defaultProps = {
  length: 6,
  label: 'Value',
}

export default Number
