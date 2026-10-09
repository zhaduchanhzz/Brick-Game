import React from 'react'
import { render, screen } from '@testing-library/react'
import Number from './index'

test('renders six local LCD character slots with readable digits', () => {
  const { container } = render(<Number number={1200} length={6} label="Score" />)
  expect(screen.getByLabelText('Score 1200')).toBeTruthy()
  const slots = container.querySelectorAll('span')
  expect(slots).toHaveLength(6)
  expect(Array.from(slots).map(slot => slot.textContent).join('').trim()).toBe('1200')
  expect(container.querySelector('.bg')).toBeNull()
})
