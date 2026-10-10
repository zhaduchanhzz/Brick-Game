import React from 'react'
import style from './RunModeNotice.module.less'
import { useI18n } from '../../i18n'

function noticeFor(runMode, t) {
  switch (runMode.mode) {
  case 'casual':
    return runMode.reason === 'NETWORK_ERROR'
      ? t('run.casualNetwork')
      : t('run.casual')
  case 'ranked':
    return t('run.ranked')
  case 'verifying':
    return t('run.verifying')
  case 'qualified':
    return t('run.qualified')
  case 'not-eligible':
    return runMode.reason === 'BOARD_CHANGED'
      ? t('run.boardChanged')
      : t('run.notEligible')
  case 'verify-error':
    return runMode.reason === 'NETWORK_ERROR'
      ? t('run.verifyNetworkError')
      : t('run.verifyError')
  case 'limit':
    return t('run.limit')
  case 'claim-skipped':
    return t('run.skipped')
  case 'claimed':
    return t('run.claimed')
  default:
    return null
  }
}

export default function RunModeNotice({ runMode }) {
  const { t } = useI18n()
  if (!runMode) return null
  const message = noticeFor(runMode, t)
  if (!message) return null
  const isError = runMode.mode === 'verify-error' || runMode.mode === 'limit'
  const tone = isError ? style.error : runMode.mode === 'casual' ? style.casual :
    ['qualified', 'claimed'].includes(runMode.mode) ? style.success : style.ranked
  return (
    <p className={`${style.notice} ${tone}`} role={isError ? 'alert' : 'status'}>
      {message}
    </p>
  )
}
