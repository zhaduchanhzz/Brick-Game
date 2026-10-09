import React from 'react'
import { render, screen } from '@testing-library/react'
import RunModeNotice from './RunModeNotice'
import { publishRunMode, subscribeRunMode } from '../../api/runMode'

test('casual fallback is surfaced as an unranked run', () => {
  const events = []
  const unsubscribe = subscribeRunMode(event => events.push(event))
  publishRunMode({ mode: 'casual', reason: 'RANKED_UNAVAILABLE' })
  expect(events[events.length - 1].mode).toBe('casual')
  render(<RunModeNotice runMode={events[events.length - 1]} />)
  expect(screen.getByRole('status').textContent).toContain('cannot enter the leaderboard')
  unsubscribe()
  publishRunMode({ mode: 'idle' })
})
