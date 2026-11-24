import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { SHIPMENTS, STATS, CARRIERS, mockFetch } from './test/fixtures'

// Rows in the shipments table, as shipment ids.
function visibleIds() {
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
  return rows.map((r) => within(r).getAllByRole('cell')[0].textContent)
}

async function renderLoaded() {
  mockFetch()
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('SH-1001')
  return user
}

describe('App', () => {
  it('loads shipments and stats from the API and renders KPIs and the table', async () => {
    const fetchMock = mockFetch()
    render(<App />)

    expect(await screen.findByText('SH-1001')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/shipments', expect.any(Object))
    expect(fetchMock).toHaveBeenCalledWith('/api/stats', expect.any(Object))
    expect(within(screen.getByTestId('kpi-total')).getByText('6')).toBeInTheDocument()
    expect(within(screen.getByTestId('kpi-onTime')).getByText('83.3%')).toBeInTheDocument()
    expect(visibleIds()).toEqual(SHIPMENTS.map((s) => s.id))
  })

  it('shows every shipment and the full count when filters are cleared', async () => {
    await renderLoaded()

    expect(screen.getByRole('heading', { name: /Shipments/ })).toHaveTextContent('(6)')
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
  })

  it('shows only delivered rows when the status filter is set to delivered', async () => {
    const user = await renderLoaded()

    await user.selectOptions(screen.getByRole('combobox', { name: /^Status/ }), 'delivered')

    expect(visibleIds()).toEqual(['SH-1001', 'SH-1002', 'SH-1005'])
    expect(screen.getByRole('heading', { name: /Shipments/ })).toHaveTextContent('(3)')
  })

  it('shows only rows for the chosen carrier', async () => {
    const user = await renderLoaded()

    await user.selectOptions(screen.getByRole('combobox', { name: /^Carrier/ }), 'DHL')

    expect(visibleIds()).toEqual(['SH-1001', 'SH-1004'])
  })

  it('applies status and carrier filters together', async () => {
    const user = await renderLoaded()

    await user.selectOptions(screen.getByRole('combobox', { name: /^Status/ }), 'delivered')
    await user.selectOptions(screen.getByRole('combobox', { name: /^Carrier/ }), 'FedEx')

    expect(visibleIds()).toEqual(['SH-1005'])
  })

  it('shows an empty-state message when filters match nothing', async () => {
    const user = await renderLoaded()

    await user.selectOptions(screen.getByRole('combobox', { name: /^Status/ }), 'delayed')
    await user.selectOptions(screen.getByRole('combobox', { name: /^Carrier/ }), 'Maersk')

    expect(screen.getByText('No shipments match these filters.')).toBeInTheDocument()
  })

  it('restores all rows when Reset is clicked', async () => {
    const user = await renderLoaded()
    await user.selectOptions(screen.getByRole('combobox', { name: /^Status/ }), 'in_transit')
    await user.selectOptions(screen.getByRole('combobox', { name: /^Carrier/ }), 'Maersk')

    await user.click(screen.getByRole('button', { name: 'Reset' }))

    expect(visibleIds()).toEqual(SHIPMENTS.map((s) => s.id))
    expect(screen.getByRole('combobox', { name: /^Status/ })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: /^Carrier/ })).toHaveValue('')
  })

  it('filters rows by a search term matching origin, case-insensitively', async () => {
    const user = await renderLoaded()

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'HAMBURG')

    expect(visibleIds()).toEqual(['SH-1002', 'SH-1005'])
    expect(screen.getByRole('heading', { name: /Shipments/ })).toHaveTextContent('(2)')
  })

  it('filters rows by id', async () => {
    const user = await renderLoaded()

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'sh-1003')

    expect(visibleIds()).toEqual(['SH-1003'])
  })

  it('combines the search term with the status and carrier filters', async () => {
    const user = await renderLoaded()

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'hamburg')
    await user.selectOptions(screen.getByRole('combobox', { name: /^Status/ }), 'delivered')
    await user.selectOptions(screen.getByRole('combobox', { name: /^Carrier/ }), 'Maersk')

    expect(visibleIds()).toEqual(['SH-1002'])
  })

  it('shows the empty-state message when the search term matches nothing', async () => {
    const user = await renderLoaded()

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'zzz-no-match')

    expect(screen.getByText('No shipments match these filters.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('enables Reset for a search term and clears it on click', async () => {
    const user = await renderLoaded()
    const search = screen.getByRole('searchbox', { name: 'Search' })
    const reset = screen.getByRole('button', { name: 'Reset' })

    await user.type(search, 'Tokyo')
    expect(reset).toBeEnabled()

    await user.click(reset)

    expect(search).toHaveValue('')
    expect(reset).toBeDisabled()
    expect(visibleIds()).toEqual(SHIPMENTS.map((s) => s.id))
  })

  it('ignores a whitespace-only search term', async () => {
    const user = await renderLoaded()

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), '   ')

    expect(visibleIds()).toEqual(SHIPMENTS.map((s) => s.id))
  })

  it('shows an error alert and no rows when the shipments request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      ok: url !== '/api/shipments',
      status: url === '/api/shipments' ? 500 : 200,
      json: async () => (url === '/api/carriers' ? [] : {}),
    })))
    render(<App />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load data. /api/shipments failed: HTTP 500')
    expect(screen.queryByText('SH-1001')).not.toBeInTheDocument()
  })
})

// Stateful fake of the API: GET reads current data, POST and PATCH mutate it,
// and stats are recomputed from the shipments on every GET /api/stats.
function fakeApi({ patchFails = false } = {}) {
  let shipments = SHIPMENTS.map((s) => ({ ...s }))
  const computeStats = () => {
    const total = shipments.length
    const delayed = shipments.filter((s) => s.status === 'delayed').length
    return {
      total,
      onTimeRate: Number((((total - delayed) / total) * 100).toFixed(1)),
      inTransit: shipments.filter((s) => s.status === 'in_transit').length,
      delayed,
    }
  }
  const fetchMock = vi.fn(async (url, options = {}) => {
    const method = options.method ?? 'GET'
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body })

    if (method === 'GET' && url === '/api/shipments') return json(200, shipments)
    if (method === 'GET' && url === '/api/stats') return json(200, computeStats())
    if (method === 'GET' && url === '/api/carriers') return json(200, CARRIERS)

    if (method === 'POST' && url === '/api/shipments') {
      const created = { id: 'SH-1007', ...JSON.parse(options.body), status: 'in_transit' }
      shipments = [...shipments, created]
      return json(201, created)
    }

    const patch = url.match(/^\/api\/shipments\/(.+)$/)
    if (method === 'PATCH' && patch) {
      if (patchFails) return json(500, { errors: ['database unavailable'] })
      const id = decodeURIComponent(patch[1])
      const { status } = JSON.parse(options.body)
      shipments = shipments.map((s) => (s.id === id ? { ...s, status } : s))
      return json(200, shipments.find((s) => s.id === id))
    }

    return json(404, {})
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('App add and status flows', () => {
  it('adds a shipment through the form and refreshes the table and KPIs', async () => {
    const fetchMock = fakeApi()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('SH-1001')

    const form = screen.getByRole('form', { name: 'Add shipment' })
    await user.type(within(form).getByLabelText('Origin'), 'Santos')
    await user.type(within(form).getByLabelText('Destination'), 'Valencia')
    await user.type(within(form).getByLabelText('Carrier'), 'FedEx')
    await user.type(within(form).getByLabelText('ETA'), '2026-11-21')
    await user.click(within(form).getByRole('button', { name: 'Add shipment' }))

    expect(await screen.findByText('SH-1007')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/shipments', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ origin: 'Santos', destination: 'Valencia', carrier: 'FedEx', eta: '2026-11-21' }),
    }))
    expect(within(screen.getByTestId('kpi-total')).getByText('7')).toBeInTheDocument()
    expect(within(screen.getByTestId('kpi-inTransit')).getByText('3')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Shipments/ })).toHaveTextContent('(7)')
  })

  it('changes a status and refreshes the KPIs from the server', async () => {
    const fetchMock = fakeApi()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('SH-1001')

    await user.selectOptions(screen.getByLabelText('Set status for SH-1003'), 'delayed')

    await waitFor(() => {
      expect(within(screen.getByTestId('kpi-delayed')).getByText('2')).toBeInTheDocument()
    })
    expect(within(screen.getByTestId('kpi-inTransit')).getByText('1')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/shipments/SH-1003', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ status: 'delayed' }),
    }))
    expect(screen.getByLabelText('Set status for SH-1003')).toHaveValue('delayed')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an "Update failed." alert and keeps the old status when PATCH fails', async () => {
    fakeApi({ patchFails: true })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('SH-1001')

    await user.selectOptions(screen.getByLabelText('Set status for SH-1003'), 'delivered')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Update failed. /api/shipments/SH-1003 failed: HTTP 500: database unavailable')
    expect(screen.getByLabelText('Set status for SH-1003')).toHaveValue('in_transit')
    expect(within(screen.getByTestId('kpi-delayed')).getByText('1')).toBeInTheDocument()
  })
})

// Count GET calls to /api/carriers in a fetch mock.
const carrierCalls = (fetchMock) => fetchMock.mock.calls.filter(([url]) => url === '/api/carriers').length

function carrierRows() {
  return within(screen.getByRole('list', { name: 'Carrier performance' })).getAllByRole('listitem')
}

describe('App carrier performance panel', () => {
  it('renders the carrier rows from /api/carriers in server order', async () => {
    const fetchMock = mockFetch()
    render(<App />)

    await screen.findByRole('list', { name: 'Carrier performance' })
    expect(carrierRows().map((r) => r.dataset.testid)).toEqual(CARRIERS.map((c) => `carrier-${c.carrier}`))
    expect(screen.getByTestId('carrier-DHL')).toHaveTextContent('On-time 50.0%')
    expect(fetchMock).toHaveBeenCalledWith('/api/carriers', expect.any(Object))
  })

  it('ignores the status, carrier and search filters and does not refetch them', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('SH-1001')
    await screen.findByRole('list', { name: 'Carrier performance' })

    await user.selectOptions(screen.getByRole('combobox', { name: /^Status/ }), 'delayed')
    await user.selectOptions(screen.getByRole('combobox', { name: /^Carrier/ }), 'Maersk')
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'zzz-no-match')

    expect(screen.getByText('No shipments match these filters.')).toBeInTheDocument()
    expect(carrierRows()).toHaveLength(CARRIERS.length)
    expect(carrierRows().map((r) => r.dataset.testid)).toEqual(CARRIERS.map((c) => `carrier-${c.carrier}`))
    expect(carrierCalls(fetchMock)).toBe(1)
  })

  it('refetches /api/carriers after adding a shipment', async () => {
    const fetchMock = fakeApi()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('SH-1001')
    await screen.findByRole('list', { name: 'Carrier performance' })
    expect(carrierCalls(fetchMock)).toBe(1)

    const form = screen.getByRole('form', { name: 'Add shipment' })
    await user.type(within(form).getByLabelText('Origin'), 'Santos')
    await user.type(within(form).getByLabelText('Destination'), 'Valencia')
    await user.type(within(form).getByLabelText('Carrier'), 'FedEx')
    await user.type(within(form).getByLabelText('ETA'), '2026-11-21')
    await user.click(within(form).getByRole('button', { name: 'Add shipment' }))

    await screen.findByText('SH-1007')
    await waitFor(() => expect(carrierCalls(fetchMock)).toBe(2))
    const postIndex = fetchMock.mock.calls.findIndex(([url, opts]) => url === '/api/shipments' && opts?.method === 'POST')
    const refetchIndex = fetchMock.mock.calls.findLastIndex(([url]) => url === '/api/carriers')
    expect(refetchIndex).toBeGreaterThan(postIndex)
  })

  it('refetches /api/carriers after a successful status PATCH', async () => {
    const fetchMock = fakeApi()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('SH-1001')
    await screen.findByRole('list', { name: 'Carrier performance' })

    await user.selectOptions(screen.getByLabelText('Set status for SH-1003'), 'delayed')

    await waitFor(() => expect(carrierCalls(fetchMock)).toBe(2))
    const patchIndex = fetchMock.mock.calls.findIndex(([url, opts]) => url === '/api/shipments/SH-1003' && opts?.method === 'PATCH')
    const refetchIndex = fetchMock.mock.calls.findLastIndex(([url]) => url === '/api/carriers')
    expect(refetchIndex).toBeGreaterThan(patchIndex)
  })

  it('does not refetch /api/carriers when the PATCH fails', async () => {
    const fetchMock = fakeApi({ patchFails: true })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('SH-1001')
    await screen.findByRole('list', { name: 'Carrier performance' })

    await user.selectOptions(screen.getByLabelText('Set status for SH-1003'), 'delivered')
    await screen.findByRole('alert')

    expect(carrierCalls(fetchMock)).toBe(1)
  })

  it('shows its own error alert and keeps the shipments table when /api/carriers fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url === '/api/carriers') {
        return { ok: false, status: 500, json: async () => ({ errors: ['internal server error'] }) }
      }
      const bodies = { '/api/shipments': SHIPMENTS, '/api/stats': STATS }
      return { ok: true, status: 200, json: async () => bodies[url] }
    }))
    render(<App />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load carrier data. /api/carriers failed: HTTP 500: internal server error')
    expect(await screen.findByText('SH-1001')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Carrier performance' })).not.toBeInTheDocument()
  })
})
