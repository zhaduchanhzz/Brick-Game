import React from 'react'
import style from './RunModeNotice.module.less'

export default function RunModeNotice({ runMode }) {
  if (!runMode || runMode.mode === 'idle') return null
  return (
    <p className={`${style.notice} ${runMode.mode === 'casual' ? style.casual : style.ranked}`} role="status">
      {runMode.mode === 'casual'
        ? 'Casual run: ranked play is unavailable. This score cannot enter the leaderboard.'
        : 'Ranked run: leaderboard scores are verified by the server.'}
    </p>
  )
}
