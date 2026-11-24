import { useEffect, useState } from 'react'
import { fetchCarriers } from '../lib/api'
import { formatRate } from '../lib/shipments'

// Independent of the table filters. Refetches whenever refreshKey changes.
export default function CarrierPerformance({ refreshKey = 0 }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchCarriers()
      .then((data) => {
        if (cancelled) return
        if (!Array.isArray(data)) throw new Error('/api/carriers returned an unexpected shape')
        setRows(data)
        setError(null)
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  let body
  if (error) {
    body = <p role="alert" className="error">Could not load carrier data. {error}</p>
  } else if (rows === null) {
    body = <p className="muted">Loading carriers…</p>
  } else if (rows.length === 0) {
    body = <p className="empty">No carrier data</p>
  } else {
    body = (
      <ul className="carriers" aria-label="Carrier performance">
        <li className="carriers__row carriers__row--head" aria-hidden="true">
          <span>Carrier</span>
          <span>Shipments</span>
          <span>Delayed</span>
          <span>On-time rate</span>
        </li>
        {rows.map((r) => (
          <li key={r.carrier} className="carriers__row" data-testid={`carrier-${r.carrier}`}>
            <span className="carriers__name">{r.carrier}</span>
            <span><span className="carriers__label">Shipments </span>{r.total}</span>
            <span><span className="carriers__label">Delayed </span>{r.delayed}</span>
            <span><span className="carriers__label">On-time </span>{formatRate(r.onTimeRate)}</span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section className="panel" aria-labelledby="carriers-h">
      <h2 id="carriers-h">Carrier performance</h2>
      {body}
    </section>
  )
}
