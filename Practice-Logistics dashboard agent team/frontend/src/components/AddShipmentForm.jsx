import { useState } from 'react'

const EMPTY = { origin: '', destination: '', carrier: '', eta: '' }

export default function AddShipmentForm({ onAdd }) {
  const [values, setValues] = useState(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const change = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await onAdd({
        origin: values.origin.trim(),
        destination: values.destination.trim(),
        carrier: values.carrier.trim(),
        eta: values.eta,
      })
      setValues(EMPTY)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="filters add-form" aria-label="Add shipment" onSubmit={submit}>
      <label><span>Origin</span><input required value={values.origin} onChange={change('origin')} /></label>
      <label><span>Destination</span><input required value={values.destination} onChange={change('destination')} /></label>
      <label><span>Carrier</span><input required value={values.carrier} onChange={change('carrier')} /></label>
      <label><span>ETA</span><input required type="date" value={values.eta} onChange={change('eta')} /></label>
      <button type="submit" disabled={submitting}>{submitting ? 'Adding…' : 'Add shipment'}</button>
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  )
}
