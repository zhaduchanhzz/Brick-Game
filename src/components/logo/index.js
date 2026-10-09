import React from 'react'
import style from './index.module.less'

const PIXELS = [
  '00100100',
  '00011000',
  '00111100',
  '01111110',
  '11011011',
  '11111111',
  '10100101',
  '00100100',
]

export default function Logo() {
  return (
    <div className={style.logo} aria-hidden="true">
      <svg viewBox="0 0 80 80" focusable="false">
        {PIXELS.flatMap((line, y) => line.split('').map((pixel, x) => pixel === '1' ? <rect key={`${x}-${y}`} x={x * 10} y={y * 10} width="10" height="10" /> : null))}
      </svg>
      <span>2 IN 1</span>
    </div>
  )
}
