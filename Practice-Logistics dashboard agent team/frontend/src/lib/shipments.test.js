import { describe, it, expect } from 'vitest'
import {
  STATUS_LABELS,
  STATUS_OPTIONS,
  uniqueCarriers,
  matchesQuery,
  filterShipments,
  etaDay,
  deliveriesPerDay,
  formatRate,
  formatEta,
} from './shipments'
import { SHIPMENTS } from '../test/fixtures'

const ID_PATTERN = /^SH-\d+$/
const ETA_PATTERN = /^\d{4}-\d{2}-\d{2}$/

describe('mock fixtures match the API contract', () => {
  it('every shipment has the contract fields with valid id, status and eta', () => {
    for (const s of SHIPMENTS) {
      expect(s).toEqual(expect.objectContaining({
        id: expect.stringMatching(ID_PATTERN),
        origin: expect.any(String),
        destination: expect.any(String),
        status: expect.stringMatching(/^(in_transit|delivered|delayed)$/),
        eta: expect.stringMatching(ETA_PATTERN),
        carrier: expect.any(String),
      }))
    }
  })

  it('status options are exactly the three contract statuses', () => {
    expect(STATUS_OPTIONS).toEqual(['in_transit', 'delivered', 'delayed'])
    expect(Object.keys(STATUS_LABELS)).toEqual(STATUS_OPTIONS)
  })
})

describe('uniqueCarriers', () => {
  it('returns distinct carriers sorted alphabetically', () => {
    expect(uniqueCarriers(SHIPMENTS)).toEqual(['DHL', 'FedEx', 'Maersk'])
  })

  it('returns an empty list for no shipments', () => {
    expect(uniqueCarriers([])).toEqual([])
  })
})

describe('matchesQuery', () => {
  const shipment = SHIPMENTS[0] // SH-1001, Shanghai -> Rotterdam, DHL

  it('matches id, origin and destination', () => {
    expect(matchesQuery(shipment, 'SH-1001')).toBe(true)
    expect(matchesQuery(shipment, 'Shanghai')).toBe(true)
    expect(matchesQuery(shipment, 'Rotterdam')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(matchesQuery(shipment, 'sh-1001')).toBe(true)
    expect(matchesQuery(shipment, 'SHANGHAI')).toBe(true)
    expect(matchesQuery(shipment, 'rOtTeRdAm')).toBe(true)
  })

  it('matches a partial substring', () => {
    expect(matchesQuery(shipment, 'rott')).toBe(true)
    expect(matchesQuery(shipment, '1001')).toBe(true)
  })

  it('ignores surrounding whitespace in the query', () => {
    expect(matchesQuery(shipment, '  Rotterdam  ')).toBe(true)
  })

  it('treats an empty or whitespace-only query as no filter', () => {
    expect(matchesQuery(shipment, '')).toBe(true)
    expect(matchesQuery(shipment, '   ')).toBe(true)
    expect(matchesQuery(shipment, undefined)).toBe(true)
  })

  it('does not match carrier, status or eta', () => {
    expect(matchesQuery(shipment, 'DHL')).toBe(false)
    expect(matchesQuery(shipment, 'delivered')).toBe(false)
    expect(matchesQuery(shipment, '2026-11-03')).toBe(false)
  })

  it('returns false when no searchable field contains the query', () => {
    expect(matchesQuery(shipment, 'zzz')).toBe(false)
  })

  it('does not throw when a searchable field is missing', () => {
    expect(matchesQuery({ id: 'SH-9999', origin: null, destination: undefined }, 'SH-9999')).toBe(true)
    expect(matchesQuery({ id: 'SH-9999', origin: null, destination: undefined }, 'Rotterdam')).toBe(false)
  })
})

describe('filterShipments with query', () => {
  it('keeps shipments whose origin or destination matches, case-insensitively', () => {
    const result = filterShipments(SHIPMENTS, { status: '', carrier: '', query: 'hamburg' })
    expect(result.map((s) => s.id)).toEqual(['SH-1002', 'SH-1005'])
  })

  it('matches by id', () => {
    const result = filterShipments(SHIPMENTS, { status: '', carrier: '', query: 'sh-1003' })
    expect(result.map((s) => s.id)).toEqual(['SH-1003'])
  })

  it('combines query with the status filter', () => {
    const result = filterShipments(SHIPMENTS, { status: 'delivered', carrier: '', query: 'hamburg' })
    expect(result.map((s) => s.id)).toEqual(['SH-1002', 'SH-1005'])
  })

  it('combines query with the carrier filter', () => {
    const result = filterShipments(SHIPMENTS, { status: '', carrier: 'Maersk', query: 'hamburg' })
    expect(result.map((s) => s.id)).toEqual(['SH-1002'])
  })

  it('returns an empty list when the query matches but status excludes it', () => {
    expect(filterShipments(SHIPMENTS, { status: 'delayed', carrier: '', query: 'hamburg' })).toEqual([])
  })

  it('returns all shipments for an empty query with no other filter', () => {
    expect(filterShipments(SHIPMENTS, { status: '', carrier: '', query: '' })).toHaveLength(SHIPMENTS.length)
  })

  it('treats a missing query key as no search filter', () => {
    expect(filterShipments(SHIPMENTS, { status: 'delivered', carrier: '' })).toHaveLength(3)
  })
})

describe('filterShipments', () => {
  it('returns all shipments when no filter is set', () => {
    expect(filterShipments(SHIPMENTS, { status: '', carrier: '' })).toHaveLength(SHIPMENTS.length)
  })

  it('keeps only shipments with the matching status', () => {
    const result = filterShipments(SHIPMENTS, { status: 'delivered', carrier: '' })
    expect(result.map((s) => s.id)).toEqual(['SH-1001', 'SH-1002', 'SH-1005'])
    expect(result.every((s) => s.status === 'delivered')).toBe(true)
  })

  it('applies status and carrier together', () => {
    const result = filterShipments(SHIPMENTS, { status: 'delivered', carrier: 'FedEx' })
    expect(result.map((s) => s.id)).toEqual(['SH-1005'])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterShipments(SHIPMENTS, { status: 'delayed', carrier: 'Maersk' })).toEqual([])
  })

  it('does not mutate the input array', () => {
    const copy = [...SHIPMENTS]
    filterShipments(SHIPMENTS, { status: 'delayed', carrier: '' })
    expect(SHIPMENTS).toEqual(copy)
  })
})

describe('deliveriesPerDay', () => {
  it('counts only delivered shipments, grouped by eta day, sorted by day', () => {
    expect(deliveriesPerDay(SHIPMENTS)).toEqual([
      { day: '2026-11-03', count: 2 },
      { day: '2026-11-05', count: 1 },
    ])
  })

  it('returns an empty list when no shipment is delivered', () => {
    const none = SHIPMENTS.filter((s) => s.status !== 'delivered')
    expect(deliveriesPerDay(none)).toEqual([])
  })

  it('returns an empty list for no shipments', () => {
    expect(deliveriesPerDay([])).toEqual([])
  })
})

describe('etaDay', () => {
  it('takes the date part of an ISO timestamp without shifting the day', () => {
    expect(etaDay('2026-11-03T23:30:00Z')).toBe('2026-11-03')
    expect(etaDay('2026-11-03')).toBe('2026-11-03')
  })
})

describe('formatRate', () => {
  it('formats a contract percent (0-100) with one decimal', () => {
    expect(formatRate(83.3)).toBe('83.3%')
    expect(formatRate(100)).toBe('100.0%')
    expect(formatRate(0)).toBe('0.0%')
  })

  it('returns a dash for missing or non-numeric values', () => {
    expect(formatRate(undefined)).toBe('—')
    expect(formatRate(null)).toBe('—')
    expect(formatRate(Number.NaN)).toBe('—')
    expect(formatRate('83.3')).toBe('—')
  })

  it('renders small percents as given: 1 is 1.0%, 0.5 is 0.5%', () => {
    expect(formatRate(1)).toBe('1.0%')
    expect(formatRate(0.5)).toBe('0.5%')
  })
})

describe('formatEta', () => {
  it('formats a date-only eta in UTC so the day does not shift', () => {
    const expected = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2026, 10, 3)))
    expect(formatEta('2026-11-03')).toBe(expected)
  })

  it('returns the raw input when the eta cannot be parsed', () => {
    expect(formatEta('not-a-date')).toBe('not-a-date')
  })
})
