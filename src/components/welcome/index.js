import React from 'react'
import style from './index.module.less'
import PropTypes from 'prop-types'
import { useI18n } from '../../i18n'
const Welcome = ({ game }) => {
  const { t } = useI18n()
  return (
    <div className={style.welcome}>
      <h3>{t('device.welcome')}</h3>
      <div>
        <p>{t('device.welcomeLevel')}</p>
        <p>{t('device.welcomeStart')}</p>
      </div>
      <div>
        <span>{game}</span>
      </div>
    </div>
  )
}

Welcome.propTypes = {
  game: PropTypes.string.isRequired
}

export default Welcome
