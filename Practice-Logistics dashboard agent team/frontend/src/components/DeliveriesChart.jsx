import { deliveriesPerDay } from '../lib/shipments'

const W = 640
const H = 240
const PAD = { top: 16, right: 12, bottom: 36, left: 32 }

export default function DeliveriesChart({ shipments }) {
  const data = deliveriesPerDay(shipments)
  if (data.length === 0) return <p className="empty">No delivered shipments to chart.</p>

  const max = Math.max(...data.map((d) => d.count))
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const slot = innerW / data.length
  const barW = Math.min(36, slot * 0.7)
  const ticks = Array.from({ length: max + 1 }, (_, i) => i)

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart of deliveries per day">
      {ticks.map((t) => {
        const y = PAD.top + innerH - (t / max) * innerH
        return (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} className="chart__grid" />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" className="chart__tick">{t}</text>
          </g>
        )
      })}
      {data.map((d, i) => {
        const h = (d.count / max) * innerH
        const x = PAD.left + slot * i + (slot - barW) / 2
        return (
          <g key={d.day}>
            <rect x={x} y={PAD.top + innerH - h} width={barW} height={h} rx="2" className="chart__bar">
              <title>{`${d.day}: ${d.count} delivered`}</title>
            </rect>
            <text x={x + barW / 2} y={H - 18} textAnchor="middle" className="chart__tick">
              {d.day.slice(5)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
