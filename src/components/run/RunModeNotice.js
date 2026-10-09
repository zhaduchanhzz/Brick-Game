import React from 'react'
import style from './RunModeNotice.module.less'

function noticeFor(runMode) {
  switch (runMode.mode) {
  case 'casual':
    return runMode.reason === 'NETWORK_ERROR'
      ? 'Could not reach the game server. This is a casual run; its score cannot enter the Top 10.'
      : 'Casual run: ranked play is unavailable. This score cannot enter the leaderboard.'
  case 'ranked':
    return 'Ranked run: after game over, a verified Top 10 score will open the player-name form.'
  case 'verifying':
    return 'Game over. The server is verifying your final score for Top 10 eligibility.'
  case 'qualified':
    return 'Your verified score qualifies for Top 10. Enter your name in the open form to claim it.'
  case 'not-eligible':
    return runMode.reason === 'BOARD_CHANGED'
      ? 'The Top 10 changed before your name was submitted. This score no longer qualifies.'
      : 'Your final score was verified, but it did not qualify for the current Top 10 or improve your existing entry. No name form is shown.'
  case 'verify-error':
    return runMode.reason === 'NETWORK_ERROR'
      ? 'Game over, but the server could not be reached to verify this score. It cannot enter Top 10.'
      : 'Game over, but this score could not be verified by the server. It cannot enter Top 10.'
  case 'limit':
    return 'The run reached its 10-minute limit before game over, so there is no verified Top 10 score.'
  case 'claim-skipped':
    return 'You skipped the player-name form, so this verified score was not submitted to Top 10.'
  case 'claimed':
    return 'Your verified score was submitted to Top 10.'
  default:
    return null
  }
}

export default function RunModeNotice({ runMode }) {
  if (!runMode) return null
  const message = noticeFor(runMode)
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
