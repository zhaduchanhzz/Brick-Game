import React from 'react'
import Matrix from '../matrix'
import games from '../../utils/games'
import { useSelector } from 'react-redux'
import { blankMatrix } from '../../games/tetris/tetris'
import { copyData } from '../../utils/helps'
import { gameover } from '../../control/breakout'

const BreakoutPanel = () => {
  let matrix = []

  const { breakout, pause } = useSelector(state => state)

  const buildMatrix = () => {
    if (pause === 0) {
      matrix = games.breakout
    } else {
      matrix = copyData(blankMatrix)
      breakout.bricks.forEach((point) => {
        matrix[point[0]][point[1]] = 1
      })
      //ball
      if (breakout.x >= 0 && breakout.x < 20 && breakout.y >= 0 && breakout.y < 10) {
        matrix[breakout.x][breakout.y] = 2
      }

      //paddle
      for(let y = 0; y<breakout.paddleLength; y++) {
        matrix[19][breakout.paddleY+y] = 1
      }
    }
  }

  buildMatrix()

  return (
    <Matrix matrix={matrix} isDead={breakout.death} gameover={gameover}/>
  )
}

export default BreakoutPanel
