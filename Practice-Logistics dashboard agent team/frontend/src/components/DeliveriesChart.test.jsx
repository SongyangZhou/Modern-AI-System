import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DeliveriesChart from './DeliveriesChart'
import { SHIPMENTS } from '../test/fixtures'

function barTitles(container) {
  return [...container.querySelectorAll('.chart__bar title')].map((t) => t.textContent)
}

describe('DeliveriesChart', () => {
  it('draws one bar per eta day, counting only delivered shipments', () => {
    const { container } = render(<DeliveriesChart shipments={SHIPMENTS} />)

    expect(screen.getByRole('img', { name: 'Bar chart of deliveries per day' })).toBeInTheDocument()
    expect(barTitles(container)).toEqual([
      '2026-11-03: 2 delivered',
      '2026-11-05: 1 delivered',
    ])
  })

  it('shows the short day label (MM-DD) under each bar', () => {
    const { container } = render(<DeliveriesChart shipments={SHIPMENTS} />)

    const labels = [...container.querySelectorAll('text.chart__tick')].map((t) => t.textContent)
    expect(labels).toEqual(expect.arrayContaining(['11-03', '11-05']))
  })

  it('shows an empty message and no bars when nothing is delivered', () => {
    const inTransitOnly = SHIPMENTS.filter((s) => s.status === 'in_transit')
    const { container } = render(<DeliveriesChart shipments={inTransitOnly} />)

    expect(screen.getByText('No delivered shipments to chart.')).toBeInTheDocument()
    expect(container.querySelectorAll('.chart__bar')).toHaveLength(0)
  })

  it('shows an empty message for an empty shipment list', () => {
    render(<DeliveriesChart shipments={[]} />)

    expect(screen.getByText('No delivered shipments to chart.')).toBeInTheDocument()
  })
})
