import React, { useEffect, useRef, useState } from 'react'
import classnames from 'classnames'
import style from './index.module.less'
import { useDispatch, useSelector } from 'react-redux'
import { setLock } from '../../store/reducer/lockSlice'
import { copyData } from '../../utils/helps'
import { Music } from '../../utils/music'
import PropTypes from 'prop-types'
const Matrix = ({ matrix, isDead, gameover }) => {
  const [state, setState] = useState([])
  const { music, pause } = useSelector(state => state)
  const ending = useRef(false)
  const timers = useRef([])

  const dispatch = useDispatch()

  const exLine = (index) => {
    if (index <= 19) {
      setState((old) => {
        const newState =  old.map((line, idx) => {
          if(idx !== index) {
            return line
          } else {
            return Array(10).fill(1)
          }
        })
        return newState
      })
    } else if (index >= 20 && index <= 39) {
      setState((old) => {
        return old.map((line, idx) => {
          if(idx !== (19-(index-20))) {
            return line
          } else {
            return Array(10).fill(0)
          }
        })
      })
    } else {
      //over
      ending.current = false
      gameover()
      dispatch(setLock(false))
      return
    }
  }
  useEffect(() => {
    if (pause === 0 && ending.current) {
      timers.current.forEach(clearTimeout)
      timers.current = []
      ending.current = false
    }
    if (!ending.current) setState(copyData(matrix))
    if (pause === 1 && isDead && !ending.current) {
      ending.current = true
      dispatch(setLock(true))
      if (music && Music.gameover) {
        Music.gameover()
      }
      for (let i = 0; i <= 40; i++) {
        timers.current.push(setTimeout(exLine.bind(null, i), 40 * (i + 1)))
      }
    }
  }, [matrix, isDead, pause])

  useEffect(() => () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  return (
    <div className={style.matrix}>{
      state.map((p, k1) => (<p key={k1}>
        {
          p.map((e, k2) => <b
            className={classnames({
              c: e === 1,
              d: e === 2,
              e: e === 3,
              f: e === 4,
              g: e === 5,
              h: e === 6,
              i: e === 7,
            })}
            key={k2}
          />)
        }
      </p>))
    }
    </div>
  )
}
Matrix.propTypes = {
  matrix: PropTypes.array.isRequired,
  isDead: PropTypes.bool.isRequired,
  gameover: PropTypes.func.isRequired,
}

export default Matrix
