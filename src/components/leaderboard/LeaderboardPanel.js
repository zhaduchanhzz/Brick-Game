import React from 'react'
import style from './leaderboard.module.less'

const scoreFormatter = new Intl.NumberFormat()

function dateLabel(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString()
}

export default function LeaderboardPanel({ gameId, board, status, connection, error, onRetry, lastVerified }) {
  return (
    <aside className={style.panel} aria-label={`${gameId} leaderboard`}>
      <div className={style.heading}>
        <div>
          <span className={style.kicker}>🏆 TOP 10 · ALL TIME</span>
          <h2>{gameId}</h2>
        </div>
        <span className={style.version}>v{board.version}</span>
      </div>
      {status === 'ready' && connection !== 'online' && <p className={style.syncNote} role="status">Live updates reconnecting. Scores may be out of date.</p>}
      {status === 'loading' && <p className={style.message} role="status">Loading leaderboards…</p>}
      {status === 'error' && (
        <div className={style.message} role="alert">
          <p>{error || 'Could not load leaderboards.'}</p>
          <button type="button" onClick={onRetry}>Try again</button>
        </div>
      )}
      {status === 'ready' && board.entries.length === 0 && <p className={style.message}>No verified scores yet.</p>}
      {status === 'ready' && board.entries.length > 0 && (
        <div className={style.tableScroll}>
          <table>
            <thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Points</th></tr></thead>
            <tbody>
              {board.entries.map((entry, index) => (
                <tr key={`${entry.nickname}-${entry.achievedAt}-${index}`}>
                  <td>{entry.rank || index + 1}</td>
                  <td className={style.player}>{entry.nickname}<small>Level {entry.startLevel} · {dateLabel(entry.achievedAt)}</small></td>
                  <td className={style.points}>{scoreFormatter.format(entry.finalScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lastVerified && lastVerified.gameId === gameId && (
        <div className={style.lastRun} role="status">
          <strong>Your last verified run</strong>
          <span>{scoreFormatter.format(lastVerified.rawScore)} × level {lastVerified.startLevel} = {scoreFormatter.format(lastVerified.finalScore)}</span>
          {lastVerified.claimed && <span>Score submitted to the leaderboard.</span>}
          {lastVerified.claimLost && <span>The Top 10 changed before your name was submitted. This run no longer qualifies.</span>}
          {!lastVerified.claimed && !lastVerified.eligibleToClaim && !lastVerified.claimLost && <span>This run did not reach the current Top 10.</span>}
        </div>
      )}
    </aside>
  )
}
