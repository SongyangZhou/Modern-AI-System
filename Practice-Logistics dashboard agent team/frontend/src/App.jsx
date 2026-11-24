import { useEffect, useMemo, useState } from 'react'
import { fetchShipments, fetchStats, createShipment, updateShipmentStatus } from './lib/api'
import { filterShipments, uniqueCarriers } from './lib/shipments'
import KpiCards from './components/KpiCards'
import AddShipmentForm from './components/AddShipmentForm'
import Filters from './components/Filters'
import ShipmentsTable from './components/ShipmentsTable'
import DeliveriesChart from './components/DeliveriesChart'
import CarrierPerformance from './components/CarrierPerformance'

export default function App() {
  const [shipments, setShipments] = useState([])
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [carrier, setCarrier] = useState('')
  const [query, setQuery] = useState('')
  const [carrierRefresh, setCarrierRefresh] = useState(0)

  const [actionError, setActionError] = useState(null)

  const reload = async () => {
    const [s, st] = await Promise.all([fetchShipments(), fetchStats()])
    setShipments(s)
    setStats(st)
    setCarrierRefresh((n) => n + 1)
  }

  const handleAdd = async (input) => {
    await createShipment(input)
    await reload()
  }

  const handleStatusChange = async (id, nextStatus) => {
    setActionError(null)
    try {
      await updateShipmentStatus(id, nextStatus)
      await reload()
    } catch (err) {
      setActionError(err.message)
    }
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchShipments(), fetchStats()])
      .then(([s, st]) => {
        if (cancelled) return
        setShipments(s)
        setStats(st)
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const carriers = useMemo(() => uniqueCarriers(shipments), [shipments])
  const visible = useMemo(() => filterShipments(shipments, { status, carrier, query }), [shipments, status, carrier, query])

  return (
    <main className="app">
      <header className="app__header">
        <h1>Logistics dashboard</h1>
        <p>Shipment status, carrier performance and delivery volume.</p>
      </header>

      {error && <p role="alert" className="error">Could not load data. {error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {actionError && <p role="alert" className="error">Update failed. {actionError}</p>}

      <KpiCards stats={stats} />

      <section className="panel" aria-labelledby="chart-h">
        <h2 id="chart-h">Deliveries per day</h2>
        <DeliveriesChart shipments={shipments} />
      </section>

      <CarrierPerformance refreshKey={carrierRefresh} />

      <section className="panel" aria-labelledby="add-h">
        <h2 id="add-h">Add shipment</h2>
        <AddShipmentForm onAdd={handleAdd} />
      </section>

      <section className="panel" aria-labelledby="table-h">
        <div className="panel__head">
          <h2 id="table-h">Shipments <span className="muted">({visible.length})</span></h2>
          <Filters
            status={status}
            carrier={carrier}
            query={query}
            carriers={carriers}
            onStatus={setStatus}
            onCarrier={setCarrier}
            onQuery={setQuery}
            onReset={() => { setStatus(''); setCarrier(''); setQuery('') }}
          />
        </div>
        <ShipmentsTable shipments={visible} onStatusChange={handleStatusChange} />
      </section>
    </main>
  )
}
