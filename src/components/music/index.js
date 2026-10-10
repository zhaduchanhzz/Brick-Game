import React from 'react'
import style from './index.module.less'
import PropTypes from 'prop-types'
import { useI18n } from '../../i18n'

const Music = ({ music }) => {
  const { t } = useI18n()
  return (
    <div className={`${style.music} ${music ? '' : style.off}`} role="img" aria-label={music ? t('device.soundOn') : t('device.soundOff')}>
      <span aria-hidden="true">♪</span>
    </div>
  )
}
Music.propTypes = {
  music: PropTypes.bool.isRequired
}

export default Music
