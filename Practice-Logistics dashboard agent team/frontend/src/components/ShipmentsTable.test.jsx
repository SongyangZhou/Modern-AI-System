import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ShipmentsTable from './ShipmentsTable'
import { SHIPMENTS } from '../test/fixtures'

describe('ShipmentsTable', () => {
  it('renders one row per shipment with id, origin, destination, status, eta and carrier', () => {
    render(<ShipmentsTable shipments={SHIPMENTS} onStatusChange={() => {}} />)

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(SHIPMENTS.length)

    const first = within(rows[0]).getAllByRole('cell')
    expect(first[0]).toHaveTextContent('SH-1001')
    expect(first[1]).toHaveTextContent('Shanghai')
    expect(first[2]).toHaveTextContent('Rotterdam')
    expect(first[3]).toHaveTextContent('Delivered')
    expect(first[5]).toHaveTextContent('DHL')
  })

  it('preselects each row select with that shipment status', () => {
    render(<ShipmentsTable shipments={SHIPMENTS} onStatusChange={() => {}} />)

    expect(screen.getByLabelText('Set status for SH-1003')).toHaveValue('in_transit')
    expect(screen.getByLabelText('Set status for SH-1004')).toHaveValue('delayed')
  })

  it('calls onStatusChange with the id and the chosen status', async () => {
    const onStatusChange = vi.fn()
    const user = userEvent.setup()
    render(<ShipmentsTable shipments={SHIPMENTS} onStatusChange={onStatusChange} />)

    await user.selectOptions(screen.getByLabelText('Set status for SH-1003'), 'delivered')

    expect(onStatusChange).toHaveBeenCalledTimes(1)
    expect(onStatusChange).toHaveBeenCalledWith('SH-1003', 'delivered')
  })

  it('shows the empty-state message and no table when there are no shipments', () => {
    render(<ShipmentsTable shipments={[]} onStatusChange={() => {}} />)

    expect(screen.getByText('No shipments match these filters.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('does not throw when a status is changed and no onStatusChange is passed', async () => {
    const user = userEvent.setup()
    render(<ShipmentsTable shipments={SHIPMENTS} />)

    await user.selectOptions(screen.getByLabelText('Set status for SH-1003'), 'delayed')

    expect(screen.getByLabelText('Set status for SH-1003')).toHaveValue('in_transit')
  })
})
