export const STATUS_LABELS = {
  in_transit: 'In transit',
  delivered: 'Delivered',
  delayed: 'Delayed',
}

export const STATUS_OPTIONS = Object.keys(STATUS_LABELS)

export function uniqueCarriers(shipments) {
  return [...new Set(shipments.map((s) => s.carrier))].sort()
}

export function matchesQuery(shipment, query) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return true
  return [shipment.id, shipment.origin, shipment.destination].some((v) =>
    String(v ?? '').toLowerCase().includes(q),
  )
}

export function filterShipments(shipments, { status, carrier, query = '' }) {
  return shipments.filter(
    (s) =>
      (!status || s.status === status) &&
      (!carrier || s.carrier === carrier) &&
      matchesQuery(s, query),
  )
}

// Date part of an ISO eta, taken as text to avoid timezone shifts.
export const etaDay = (eta) => String(eta).slice(0, 10)

// Contract has no delivery-date field: a delivered shipment counts on its eta day.
export function deliveriesPerDay(shipments) {
  const counts = new Map()
  for (const s of shipments) {
    if (s.status !== 'delivered') continue
    const day = etaDay(s.eta)
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day, count }))
}

// Contract: onTimeRate is already a percent from 0 to 100.
export function formatRate(rate) {
  if (typeof rate !== 'number' || Number.isNaN(rate)) return '—'
  return `${rate.toFixed(1)}%`
}

export function formatEta(eta) {
  const d = new Date(eta)
  if (Number.isNaN(d.getTime())) return String(eta)
  const hasTime = String(eta).length > 10
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : { timeZone: 'UTC' }),
  })
}
