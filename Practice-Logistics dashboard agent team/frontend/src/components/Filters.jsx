import { STATUS_LABELS, STATUS_OPTIONS } from '../lib/shipments'

export default function Filters({ status, carrier, query = '', carriers, onStatus, onCarrier, onQuery, onReset }) {
  return (
    <form className="filters" aria-label="Filter shipments" onSubmit={(e) => e.preventDefault()}>
      <label>
        <span>Search</span>
        <input
          type="search"
          value={query}
          placeholder="ID, origin or destination"
          onChange={(e) => onQuery(e.target.value)}
        />
      </label>
      <label>
        <span>Status</span>
        <select value={status} onChange={(e) => onStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Carrier</span>
        <select value={carrier} onChange={(e) => onCarrier(e.target.value)}>
          <option value="">All carriers</option>
          {carriers.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <button type="button" onClick={onReset} disabled={!status && !carrier && !query}>Reset</button>
    </form>
  )
}
