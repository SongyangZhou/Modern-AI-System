// Contract: GET /api/shipments -> Shipment[]; GET /api/stats -> { total, onTimeRate, inTransit, delayed }
// POST /api/shipments {origin,destination,carrier,eta,status?} -> Shipment
// PATCH /api/shipments/:id {any of origin,destination,carrier,status,eta} -> Shipment
async function request(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: { Accept: 'application/json', ...(options?.headers ?? {}) },
  })
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      const errors = Array.isArray(body?.errors) ? body.errors.filter(Boolean) : []
      detail = errors.length ? `: ${errors.join(', ')}` : ''
    } catch {
      // response had no JSON body
    }
    throw new Error(`${path} failed: HTTP ${res.status}${detail}`)
  }
  return res.json()
}

const sendJson = (method, path, body) =>
  request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const fetchShipments = () => request('/api/shipments')
export const fetchStats = () => request('/api/stats')
export const createShipment = (input) => sendJson('POST', '/api/shipments', input)
export const updateShipmentStatus = (id, status) =>
  sendJson('PATCH', `/api/shipments/${encodeURIComponent(id)}`, { status })
// GET /api/carriers -> { carrier, total, delayed, onTimeRate }[] (server-ordered)
export const fetchCarriers = () => request('/api/carriers')
