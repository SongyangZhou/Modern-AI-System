import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import CarrierPerformance from './CarrierPerformance'

// Server order is onTimeRate ascending, then carrier A-Z. This order is deliberately
// not alphabetical, so a client-side re-sort would fail the order assertion.
const ROWS = [
  { carrier: 'Zed Freight', total: 4, delayed: 4, onTimeRate: 0 },
  { carrier: 'DHL', total: 2, delayed: 1, onTimeRate: 50 },
  { carrier: 'FedEx', total: 2, delayed: 0, onTimeRate: 100 },
]

const okJson = (body) => ({ ok: true, status: 200, json: async () => body })

function stubFetchWith(response) {
  const fetchMock = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function listItems() {
  return within(screen.getByRole('list', { name: 'Carrier performance' })).getAllByRole('listitem')
}

describe('CarrierPerformance', () => {
  it('renders one row per carrier with total, delayed and formatted on-time rate in server order', async () => {
    stubFetchWith(okJson(ROWS))

    render(<CarrierPerformance />)

    await screen.findByRole('list', { name: 'Carrier performance' })
    const rows = listItems()
    expect(rows.map((r) => r.dataset.testid)).toEqual([
      'carrier-Zed Freight',
      'carrier-DHL',
      'carrier-FedEx',
    ])
    expect(screen.getByTestId('carrier-DHL')).toHaveTextContent('DHL')
    expect(screen.getByTestId('carrier-DHL')).toHaveTextContent('Shipments 2')
    expect(screen.getByTestId('carrier-DHL')).toHaveTextContent('Delayed 1')
    expect(screen.getByTestId('carrier-DHL')).toHaveTextContent('On-time 50.0%')
    expect(screen.getByTestId('carrier-FedEx')).toHaveTextContent('On-time 100.0%')
    expect(screen.getByTestId('carrier-Zed Freight')).toHaveTextContent('On-time 0.0%')
  })

  it('shows the "No carrier data" message when the API returns an empty array', async () => {
    stubFetchWith(okJson([]))

    render(<CarrierPerformance />)

    expect(await screen.findByText('No carrier data')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Carrier performance' })).not.toBeInTheDocument()
  })

  it('shows a loading message until the request resolves', async () => {
    let resolveFetch
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { resolveFetch = resolve })))

    render(<CarrierPerformance />)

    expect(screen.getByText('Loading carriers…')).toBeInTheDocument()
    resolveFetch(okJson(ROWS))
    await screen.findByRole('list', { name: 'Carrier performance' })
    expect(screen.queryByText('Loading carriers…')).not.toBeInTheDocument()
  })

  it('shows its own error alert when /api/carriers returns HTTP 500', async () => {
    stubFetchWith({ ok: false, status: 500, json: async () => ({ errors: ['internal server error'] }) })

    render(<CarrierPerformance />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Could not load carrier data. /api/carriers failed: HTTP 500: internal server error',
    )
    expect(screen.queryByText('No carrier data')).not.toBeInTheDocument()
  })

  it('shows an error alert when the body is not an array', async () => {
    stubFetchWith(okJson({ carriers: ROWS }))

    render(<CarrierPerformance />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load carrier data. /api/carriers returned an unexpected shape',
    )
    expect(screen.queryByRole('list', { name: 'Carrier performance' })).not.toBeInTheDocument()
  })

  it('refetches when refreshKey changes', async () => {
    const fetchMock = stubFetchWith(okJson(ROWS))
    const { rerender } = render(<CarrierPerformance refreshKey={0} />)
    await screen.findByRole('list', { name: 'Carrier performance' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    rerender(<CarrierPerformance refreshKey={1} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenLastCalledWith('/api/carriers', expect.any(Object))
  })

  it('does not refetch when re-rendered with the same refreshKey', async () => {
    const fetchMock = stubFetchWith(okJson(ROWS))
    const { rerender } = render(<CarrierPerformance refreshKey={3} />)
    await screen.findByRole('list', { name: 'Carrier performance' })

    rerender(<CarrierPerformance refreshKey={3} />)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
