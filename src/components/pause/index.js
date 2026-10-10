import React from 'react'
import PropTypes from 'prop-types'
import style from './index.module.less'
import { useI18n } from '../../i18n'

export default function Pause({ pause }) {
  const { t } = useI18n()
  return (
    <div
      className={`${style.status} ${pause === 2 ? style.paused : pause === 1 ? style.playing : style.ready}`}
      role="img"
      aria-label={pause === 2 ? t('device.paused') : pause === 1 ? t('device.playing') : t('device.ready')}
    >
      <span aria-hidden="true" />
    </div>
  )
}

Pause.propTypes = {
  pause: PropTypes.number.isRequired,
}
