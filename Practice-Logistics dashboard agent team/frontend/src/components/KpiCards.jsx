import { formatRate } from '../lib/shipments'

export default function KpiCards({ stats }) {
  const items = [
    { key: 'total', label: 'Total shipments', value: stats?.total, tone: 'ink' },
    { key: 'onTime', label: 'On-time rate', value: stats && formatRate(stats.onTimeRate), tone: 'ok' },
    { key: 'inTransit', label: 'In transit', value: stats?.inTransit, tone: 'info' },
    { key: 'delayed', label: 'Delayed', value: stats?.delayed, tone: 'warn' },
  ]
  return (
    <section className="kpis" aria-label="Key metrics">
      {items.map((i) => (
        <article key={i.key} className={`kpi kpi--${i.tone}`} data-testid={`kpi-${i.key}`}>
          <h2 className="kpi__label">{i.label}</h2>
          <p className="kpi__value">{i.value ?? '—'}</p>
        </article>
      ))}
    </section>
  )
}
