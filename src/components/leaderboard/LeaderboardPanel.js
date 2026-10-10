import React from 'react'
import style from './leaderboard.module.less'
import { useI18n } from '../../i18n'

function dateLabel(value, locale) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale)
}

export default function LeaderboardPanel({ gameId, board, status, connection, error, onRetry, lastVerified }) {
  const { locale, t } = useI18n()
  const formatScore = new Intl.NumberFormat(locale).format
  const gameName = t(`game.${gameId}`)
  const errorKey = error === 'NETWORK_ERROR' ? 'leaderboard.networkError' :
    (error === 'INVALID_RESPONSE' || error === 'INCOMPLETE_LEADERBOARD') ? 'leaderboard.invalidResponse' :
      'leaderboard.loadError'
  return (
    <aside className={style.panel} aria-label={t('leaderboard.aria', { game: gameName })}>
      <div className={style.heading}>
        <div>
          <span className={style.kicker}>{t('leaderboard.heading')}</span>
          <h2>{gameName}</h2>
        </div>
        <span className={style.version}>v{board.version}</span>
      </div>
      {status === 'ready' && connection !== 'online' && <p className={style.syncNote} role="status">{t('leaderboard.reconnecting')}</p>}
      {status === 'loading' && <p className={style.message} role="status">{t('leaderboard.loading')}</p>}
      {status === 'error' && (
        <div className={style.message} role="alert">
          <p>{t(errorKey)}</p>
          <button type="button" onClick={onRetry}>{t('leaderboard.retry')}</button>
        </div>
      )}
      {status === 'ready' && board.entries.length === 0 && <p className={style.message}>{t('leaderboard.empty')}</p>}
      {status === 'ready' && board.entries.length > 0 && (
        <div className={style.tableScroll}>
          <table>
            <thead><tr><th scope="col">#</th><th scope="col">{t('leaderboard.player')}</th><th scope="col">{t('leaderboard.points')}</th></tr></thead>
            <tbody>
              {board.entries.map((entry, index) => (
                <tr key={`${entry.nickname}-${entry.achievedAt}-${index}`}>
                  <td>{entry.rank || index + 1}</td>
                  <td className={style.player}>{entry.nickname}<small>{t('leaderboard.level', { level: entry.startLevel })} · {dateLabel(entry.achievedAt, locale)}</small></td>
                  <td className={style.points}>{formatScore(entry.finalScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lastVerified && lastVerified.gameId === gameId && (
        <div className={style.lastRun} role="status">
          <strong>{t('leaderboard.lastRun')}</strong>
          <span>{t('leaderboard.scoreFormula', { score: formatScore(lastVerified.rawScore), level: lastVerified.startLevel, total: formatScore(lastVerified.finalScore) })}</span>
          {lastVerified.claimed && <span>{t('leaderboard.claimed')}</span>}
          {lastVerified.claimLost && <span>{t('leaderboard.claimLost')}</span>}
          {!lastVerified.claimed && !lastVerified.eligibleToClaim && !lastVerified.claimLost && <span>{t('leaderboard.notQualified')}</span>}
        </div>
      )}
    </aside>
  )
}
