/* eslint-disable no-unused-vars */
import React from 'react'
import Matrix from '../matrix'
import Next from './next'
import games from '../../utils/games'
import { useSelector } from 'react-redux'
import Tetris from '../../games/tetris/tetris'
import { gameover } from '../../control/tetris'
import { copyData } from '../../utils/helps'
const TetrisPanel = () => {
  const { pause, tetris } = useSelector(state => state)

  const tetrisObj = new Tetris(tetris)
  let matrix = copyData(tetrisObj.matrix)
  if (pause === 0) {
    matrix = copyData(games.tetris)
  } else {
    //build shape
    for(let i=0; i<tetrisObj.shape.length; i++) {
      for (let j=0; j<tetrisObj.shape[0].length; j++) {
        //绘制新位置
        if (i+tetrisObj.xy[0] >= 0 && i+tetrisObj.xy[0] < 20 && j+tetrisObj.xy[1] >= 0 && j+tetrisObj.xy[1] < 10) {
          if (tetrisObj.shape[i][j]) {
            matrix[i+tetrisObj.xy[0]][j+tetrisObj.xy[1]] = 1
          }
        }
      }
    }

  }

  return (
    <>
      <Matrix matrix={matrix} isDead={tetrisObj.isDead()} gameover={gameover}/>
      {pause !==0 && <Next />}
    </>
  )
}

export default TetrisPanel
