import { STATUS_LABELS, STATUS_OPTIONS, formatEta } from '../lib/shipments'

export default function ShipmentsTable({ shipments, onStatusChange }) {
  if (shipments.length === 0) {
    return <p className="empty">No shipments match these filters.</p>
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Origin</th>
            <th scope="col">Destination</th>
            <th scope="col">Status</th>
            <th scope="col">ETA</th>
            <th scope="col">Carrier</th>
            <th scope="col">Update</th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((s) => (
            <tr key={s.id}>
              <td className="mono">{s.id}</td>
              <td>{s.origin}</td>
              <td>{s.destination}</td>
              <td><span className={`badge badge--${s.status}`}>{STATUS_LABELS[s.status] ?? s.status}</span></td>
              <td>{formatEta(s.eta)}</td>
              <td>{s.carrier}</td>
              <td>
                <select
                  aria-label={`Set status for ${s.id}`}
                  value={s.status}
                  onChange={(e) => onStatusChange?.(s.id, e.target.value)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o} value={o}>{STATUS_LABELS[o]}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
