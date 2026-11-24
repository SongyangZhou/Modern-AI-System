import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchShipments, fetchStats, fetchCarriers, createShipment, updateShipmentStatus } from './api'
import { SHIPMENTS, STATS } from '../test/fixtures'

function stubFetch(response) {
  const fetchMock = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchShipments', () => {
  it('requests GET /api/shipments with a JSON Accept header and returns the bare array', async () => {
    // Arrange
    const fetchMock = stubFetch({ ok: true, status: 200, json: async () => SHIPMENTS })

    // Act
    const result = await fetchShipments()

    // Assert
    expect(fetchMock).toHaveBeenCalledWith('/api/shipments', {
      headers: { Accept: 'application/json' },
    })
    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual(SHIPMENTS)
  })

  it('returns an empty array when the server has no shipments', async () => {
    stubFetch({ ok: true, status: 200, json: async () => [] })

    await expect(fetchShipments()).resolves.toEqual([])
  })

  it('throws with the path and status code on a non-2xx response', async () => {
    stubFetch({ ok: false, status: 500, json: async () => ({}) })

    await expect(fetchShipments()).rejects.toThrow('/api/shipments failed: HTTP 500')
  })

  it('propagates network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    await expect(fetchShipments()).rejects.toThrow('Failed to fetch')
  })
})

describe('fetchStats', () => {
  it('requests GET /api/stats and returns the stats object', async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, json: async () => STATS })

    const result = await fetchStats()

    expect(fetchMock).toHaveBeenCalledWith('/api/stats', {
      headers: { Accept: 'application/json' },
    })
    expect(result).toEqual(STATS)
  })

  it('throws with the path and status code on a non-2xx response', async () => {
    stubFetch({ ok: false, status: 503, json: async () => ({}) })

    await expect(fetchStats()).rejects.toThrow('/api/stats failed: HTTP 503')
  })
})

describe('createShipment', () => {
  const INPUT = { origin: 'Shanghai', destination: 'Rotterdam', carrier: 'DHL', eta: '2026-11-20' }

  it('POSTs the input as a JSON body to /api/shipments and returns the created shipment', async () => {
    const created = { id: 'SH-1007', ...INPUT, status: 'in_transit' }
    const fetchMock = stubFetch({ ok: true, status: 201, json: async () => created })

    const result = await createShipment(INPUT)

    expect(fetchMock).toHaveBeenCalledWith('/api/shipments', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(INPUT),
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(INPUT)
    expect(result).toEqual(created)
  })

  it('throws with the path, status and server error message on a 400 response', async () => {
    stubFetch({ ok: false, status: 400, json: async () => ({ errors: ['carrier is required', 'eta is required'] }) })

    await expect(createShipment({ ...INPUT, carrier: '' })).rejects.toThrow(
      '/api/shipments failed: HTTP 400: carrier is required, eta is required',
    )
  })

  it('throws without a detail suffix when the error body is not JSON', async () => {
    stubFetch({ ok: false, status: 500, json: async () => { throw new SyntaxError('Unexpected token') } })

    await expect(createShipment(INPUT)).rejects.toThrow(/^\/api\/shipments failed: HTTP 500$/)
  })
})

describe('updateShipmentStatus', () => {
  it('PATCHes /api/shipments/:id with a body containing only the status', async () => {
    const updated = { ...SHIPMENTS[2], status: 'delivered' }
    const fetchMock = stubFetch({ ok: true, status: 200, json: async () => updated })

    const result = await updateShipmentStatus('SH-1003', 'delivered')

    expect(fetchMock).toHaveBeenCalledWith('/api/shipments/SH-1003', {
      method: 'PATCH',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'delivered' }),
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: 'delivered' })
    expect(result).toEqual(updated)
  })

  it('URL-encodes the id in the path', async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, json: async () => ({}) })

    await updateShipmentStatus('SH 1/3', 'delayed')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/shipments/SH%201%2F3')
  })

  it('throws with the path, status and server error message on a 404 response', async () => {
    stubFetch({ ok: false, status: 404, json: async () => ({ errors: ['shipment not found'] }) })

    await expect(updateShipmentStatus('SH-9999', 'delivered')).rejects.toThrow(
      '/api/shipments/SH-9999 failed: HTTP 404: shipment not found',
    )
  })

  it('throws with the status code on a 500 response', async () => {
    stubFetch({ ok: false, status: 500, json: async () => ({}) })

    await expect(updateShipmentStatus('SH-1003', 'delayed')).rejects.toThrow(
      '/api/shipments/SH-1003 failed: HTTP 500',
    )
  })
})

describe('fetchCarriers', () => {
  it('requests GET /api/carriers with a JSON Accept header and returns the bare array in server order', async () => {
    const carriers = [
      { carrier: 'Zed Freight', total: 4, delayed: 4, onTimeRate: 0 },
      { carrier: 'DHL', total: 2, delayed: 1, onTimeRate: 50 },
    ]
    const fetchMock = stubFetch({ ok: true, status: 200, json: async () => carriers })

    const result = await fetchCarriers()

    expect(fetchMock).toHaveBeenCalledWith('/api/carriers', {
      headers: { Accept: 'application/json' },
    })
    expect(result).toEqual(carriers)
  })

  it('returns an empty array when there are no shipments', async () => {
    stubFetch({ ok: true, status: 200, json: async () => [] })

    await expect(fetchCarriers()).resolves.toEqual([])
  })

  it('throws with the path, status and server error message on a 500 response', async () => {
    stubFetch({ ok: false, status: 500, json: async () => ({ errors: ['internal server error'] }) })

    await expect(fetchCarriers()).rejects.toThrow('/api/carriers failed: HTTP 500: internal server error')
  })

  it('throws without a detail suffix when the 500 body is not JSON', async () => {
    stubFetch({ ok: false, status: 500, json: async () => { throw new SyntaxError('Unexpected token') } })

    await expect(fetchCarriers()).rejects.toThrow(/^\/api\/carriers failed: HTTP 500$/)
  })
})
