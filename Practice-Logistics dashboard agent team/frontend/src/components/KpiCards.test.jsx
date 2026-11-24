import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import KpiCards from './KpiCards'
import { STATS } from '../test/fixtures'

function valueOf(testId) {
  return within(screen.getByTestId(testId)).getByText((_, el) => el.classList.contains('kpi__value'))
}

describe('KpiCards', () => {
  it('renders total, on-time rate, in-transit and delayed from stats', () => {
    render(<KpiCards stats={STATS} />)

    expect(valueOf('kpi-total')).toHaveTextContent('6')
    expect(valueOf('kpi-onTime')).toHaveTextContent('83.3%')
    expect(valueOf('kpi-inTransit')).toHaveTextContent('2')
    expect(valueOf('kpi-delayed')).toHaveTextContent('1')
  })

  it('shows the contract 100.0% on-time rate with one decimal', () => {
    render(<KpiCards stats={{ ...STATS, onTimeRate: 100, delayed: 0 }} />)

    expect(valueOf('kpi-onTime')).toHaveTextContent('100.0%')
    expect(valueOf('kpi-delayed')).toHaveTextContent('0')
  })

  it('shows dash placeholders before stats load', () => {
    render(<KpiCards stats={null} />)

    for (const id of ['kpi-total', 'kpi-onTime', 'kpi-inTransit', 'kpi-delayed']) {
      expect(valueOf(id)).toHaveTextContent('—')
    }
  })
})
