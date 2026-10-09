import React from 'react'
import { render, screen } from '@testing-library/react'
import ClaimNameDialog from './ClaimNameDialog'

const candidate = {
  runId: 'run-1', gameId: 'tetris', verified: true, eligibleToClaim: true,
  rawScore: 1200, startLevel: 5, finalScore: 6000,
}

test('nickname input appears only for a server-verified eligible result', () => {
  const props = { onClose: jest.fn(), onClaimed: jest.fn(), onIneligible: jest.fn() }
  const view = render(<ClaimNameDialog result={{ ...candidate, verified: false }} {...props} />)
  expect(screen.queryByLabelText('Player name')).toBeNull()
  view.rerender(<ClaimNameDialog result={{ ...candidate, eligibleToClaim: false }} {...props} />)
  expect(screen.queryByLabelText('Player name')).toBeNull()
  view.rerender(<ClaimNameDialog result={candidate} {...props} />)
  expect(screen.getByLabelText('Player name')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Skip claim' })).toBeTruthy()
})

test('focus returns to the previous control when the dialog closes', () => {
  const previous = document.createElement('button')
  previous.textContent = 'Game control'
  document.body.appendChild(previous)
  previous.focus()
  const props = { onClose: jest.fn(), onClaimed: jest.fn(), onIneligible: jest.fn() }
  const view = render(<ClaimNameDialog result={candidate} {...props} />)
  expect(document.activeElement).toBe(screen.getByLabelText('Player name'))
  view.rerender(<ClaimNameDialog result={null} {...props} />)
  expect(document.activeElement).toBe(previous)
  previous.remove()
})
