import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddShipmentForm from './AddShipmentForm'

async function fillForm(user, { origin, destination, carrier, eta }) {
  const fields = { Origin: origin, Destination: destination, Carrier: carrier, ETA: eta }
  for (const [label, value] of Object.entries(fields)) {
    if (value) await user.type(screen.getByLabelText(label), value)
  }
}

const VALID = { origin: 'Shanghai', destination: 'Rotterdam', carrier: 'DHL', eta: '2026-11-20' }

describe('AddShipmentForm', () => {
  it('calls onAdd with the trimmed values when submitted', async () => {
    // Arrange
    const onAdd = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<AddShipmentForm onAdd={onAdd} />)
    await fillForm(user, {
      origin: '  Shanghai ',
      destination: ' Rotterdam',
      carrier: 'DHL  ',
      eta: VALID.eta,
    })

    // Act
    await user.click(screen.getByRole('button', { name: 'Add shipment' }))

    // Assert
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith(VALID)
  })

  it('clears all fields after a successful add', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<AddShipmentForm onAdd={onAdd} />)
    await fillForm(user, VALID)

    await user.click(screen.getByRole('button', { name: 'Add shipment' }))

    expect(await screen.findByLabelText('Origin')).toHaveValue('')
    expect(screen.getByLabelText('Destination')).toHaveValue('')
    expect(screen.getByLabelText('Carrier')).toHaveValue('')
    expect(screen.getByLabelText('ETA')).toHaveValue('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the entered values and shows an alert when onAdd rejects', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('/api/shipments failed: HTTP 400: carrier is required'))
    const user = userEvent.setup()
    render(<AddShipmentForm onAdd={onAdd} />)
    await fillForm(user, VALID)

    await user.click(screen.getByRole('button', { name: 'Add shipment' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '/api/shipments failed: HTTP 400: carrier is required',
    )
    expect(screen.getByLabelText('Origin')).toHaveValue('Shanghai')
    expect(screen.getByLabelText('Carrier')).toHaveValue('DHL')
  })

  it('clears a previous error when the next submit starts', async () => {
    const onAdd = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(<AddShipmentForm onAdd={onAdd} />)
    await fillForm(user, VALID)

    await user.click(screen.getByRole('button', { name: 'Add shipment' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')

    await user.click(screen.getByRole('button', { name: 'Add shipment' }))
    expect(await screen.findByLabelText('Origin')).toHaveValue('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not submit when a required field is empty', async () => {
    const onAdd = vi.fn()
    const user = userEvent.setup()
    render(<AddShipmentForm onAdd={onAdd} />)
    await fillForm(user, { ...VALID, carrier: '' })

    await user.click(screen.getByRole('button', { name: 'Add shipment' }))

    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Carrier')).toBeInvalid()
  })
})
