import { vi } from 'vitest'

// Mock data shaped to CLAUDE.md API contract.
// Shipment: { id, origin, destination, status, eta, carrier }
// Stats: { total, onTimeRate (0-100, one decimal), inTransit, delayed }
export const SHIPMENTS = [
  { id: 'SH-1001', origin: 'Shanghai', destination: 'Rotterdam', status: 'delivered', eta: '2026-11-03', carrier: 'DHL' },
  { id: 'SH-1002', origin: 'Shenzhen', destination: 'Hamburg', status: 'delivered', eta: '2026-11-03', carrier: 'Maersk' },
  { id: 'SH-1003', origin: 'Busan', destination: 'Los Angeles', status: 'in_transit', eta: '2026-11-10', carrier: 'Maersk' },
  { id: 'SH-1004', origin: 'Ningbo', destination: 'Antwerp', status: 'delayed', eta: '2026-11-05', carrier: 'DHL' },
  { id: 'SH-1005', origin: 'Tokyo', destination: 'Hamburg', status: 'delivered', eta: '2026-11-05', carrier: 'FedEx' },
  { id: 'SH-1006', origin: 'Qingdao', destination: 'Felixstowe', status: 'in_transit', eta: '2026-11-14', carrier: 'FedEx' },
]

// total 6, delayed 1 -> (6 - 1) / 6 * 100 = 83.333... -> 83.3
export const STATS = { total: 6, onTimeRate: 83.3, inTransit: 2, delayed: 1 }

// Stub global fetch. Routes by exact path; unknown paths return 404.
export const CARRIERS = [
  { carrier: 'DHL', total: 2, delayed: 1, onTimeRate: 50 },
  { carrier: 'FedEx', total: 2, delayed: 0, onTimeRate: 100 },
  { carrier: 'Maersk', total: 2, delayed: 0, onTimeRate: 100 },
]

export function mockFetch({ shipments = SHIPMENTS, stats = STATS, carriers = CARRIERS } = {}) {
  const fetchMock = vi.fn(async (url) => {
    const bodies = { '/api/shipments': shipments, '/api/stats': stats, '/api/carriers': carriers }
    if (!(url in bodies)) return { ok: false, status: 404, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => bodies[url] }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
