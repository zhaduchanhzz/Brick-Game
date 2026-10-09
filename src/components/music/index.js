import React from 'react'
import style from './index.module.less'
import PropTypes from 'prop-types'

const Music = ({ music }) => {
  return (
    <div className={`${style.music} ${music ? '' : style.off}`} role="img" aria-label={music ? 'Sound on' : 'Sound off'}>
      <span aria-hidden="true">♪</span>
    </div>
  )
}
Music.propTypes = {
  music: PropTypes.bool.isRequired
}

export default Music
