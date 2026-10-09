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

test('a ranked run explains when the name form can appear', () => {
  render(<RunModeNotice runMode={{ mode: 'ranked' }} />)
  expect(screen.getByRole('status').textContent).toContain('after game over')
  expect(screen.getByRole('status').textContent).toContain('Top 10')
})

test('verification and ineligible outcomes remain visible after game over', () => {
  const view = render(<RunModeNotice runMode={{ mode: 'verifying' }} />)
  expect(screen.getByRole('status').textContent).toContain('verifying your final score')
  view.rerender(<RunModeNotice runMode={{ mode: 'not-eligible' }} />)
  expect(screen.getByRole('status').textContent).toContain('No name form is shown')
})

test('a failed verification is announced as an error', () => {
  render(<RunModeNotice runMode={{ mode: 'verify-error', reason: 'NETWORK_ERROR' }} />)
  expect(screen.getByRole('alert').textContent).toContain('could not be reached')
  expect(screen.getByRole('alert').textContent).toContain('cannot enter Top 10')
})
