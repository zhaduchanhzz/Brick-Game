import React from 'react'
import Matrix from '../matrix'
import games from '../../utils/games'
import { useSelector } from 'react-redux'
import { blankMatrix } from '../../games/tetris/tetris'
import { copyData } from '../../utils/helps'
import { gameover } from '../../control/snake'

const SnakePanel = () => {
  let matrix = []

  const { snake, pause } = useSelector(state => state)

  const buildMatrix = () => {
    if (pause === 0) {
      matrix = games.snake
    } else {
      matrix = copyData(blankMatrix)
      snake.bodies.forEach((point) => {
        matrix[point[0]][point[1]] = 1
      })
      matrix[snake.food[0]][snake.food[1]] = 2
      matrix[snake.head[0]][snake.head[1]] = 2
    }
  }

  buildMatrix()

  return (
    <Matrix matrix={matrix} isDead={snake.death} gameover={gameover}/>
  )
}

export default SnakePanel
