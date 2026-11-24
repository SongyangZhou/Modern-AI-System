import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Filters from './Filters'

function renderFilters(overrides = {}) {
  const props = {
    status: '',
    carrier: '',
    query: '',
    carriers: ['DHL', 'Maersk'],
    onStatus: vi.fn(),
    onCarrier: vi.fn(),
    onQuery: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  }
  render(<Filters {...props} />)
  return props
}

describe('Filters', () => {
  it('renders Search, Status and Carrier controls with their labels', () => {
    renderFilters()

    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveAttribute('type', 'search')
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Carrier' })).toBeInTheDocument()
  })

  it('renders the three controls inside the filters form in label order', () => {
    renderFilters()

    const form = screen.getByRole('form', { name: 'Filter shipments' })
    const labels = Array.from(form.querySelectorAll('label > span')).map((el) => el.textContent)
    expect(labels).toEqual(['Search', 'Status', 'Carrier'])
  })

  it('calls onQuery with the typed text (behavior unchanged by the style fix)', async () => {
    const user = userEvent.setup()
    const { onQuery } = renderFilters()

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'D')

    expect(onQuery).toHaveBeenCalledWith('D')
  })

  it('disables Reset when no filter is active', () => {
    renderFilters()

    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
  })
})
