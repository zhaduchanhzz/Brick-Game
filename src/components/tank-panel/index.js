/* eslint-disable no-unused-vars */
import React from 'react'
import Matrix from '../matrix'
import games from '../../utils/games'
import { useSelector } from 'react-redux'
import { gameover } from '../../control/tank'

const TankPanel = () => {
  let matrix = []

  const { tank, pause } = useSelector(state => state)

  const buildMatrix = () => {
    if (pause === 0) {
      matrix = games.tank
    } else {
      matrix = tank.matrix
    }
  }

  buildMatrix()

  return (
    <Matrix matrix={matrix} isDead={tank.death} gameover={gameover}/>
  )
}

export default TankPanel
