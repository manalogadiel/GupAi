import { useEffect, useState } from 'react'
import { api, ApiError, type CustomerRow, type Visit } from '../api'
import { navigate } from '../App'
import { Button, ErrorLine, Header, Sheet } from '../components/ui'

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No visits yet'

function NewCustomer({ onDone }: { onDone: (id: string) => void }) {
  const [name, setName] = useState('')
  const [nick, setNick] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null)
    try { onDone((await api.createCustomer(name.trim(), nick.trim() || null)).id) }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Hindi na-save.'); setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-lg font-semibold">Bagong customer</h2>
      <label className="block space-y-1">
        <span className="text-[15px]">Pangalan</span>
        <input required maxLength={80} value={name} onChange={e => setName(e.target.value)}
          className="block min-h-12 w-full rounded-[var(--radius-control)] border border-boundary bg-surface px-3" />
      </label>
      <label className="block space-y-1">
        <span className="text-[15px]">Nickname <span className="text-ink-2">(optional, helps tell same names apart)</span></span>
        <input maxLength={40} value={nick} onChange={e => setNick(e.target.value)}
          className="block min-h-12 w-full rounded-[var(--radius-control)] border border-boundary bg-surface px-3" />
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 size-5 accent-[var(--color-action)]" />
        <span className="text-[15px]">Pumayag ang customer na i-save sa laptop na ito ang haircut notes niya. Photos are asked separately at the end.</span>
      </label>
      <Button variant="primary" type="submit" disabled={busy || !consent || !name.trim()}>Save and start consultation</Button>
      <ErrorLine message={error} />
    </form>
  )
}

function CustomerDetail({ id }: { id: string }) {
  const [data, setData] = useState<{ preferred: Visit | null; visits: Visit[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { api.customer(id).then(setData, e => setError(e.message)) }, [id])
  async function start(fromVisit?: string) {
    try { navigate(`/consult/${(await api.createConsultation(id, fromVisit)).id}`) }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Hindi nakapagsimula.') }
  }
  if (error) return <ErrorLine message={error} />
  if (!data) return <p className="text-ink-2">Loading…</p>
  const p = data.preferred?.agreement.plan
  return (
    <div className="space-y-4">
      {p ? (
        <div className="space-y-2 rounded-[var(--radius-control)] bg-subtle p-4">
          <p className="text-[14px] text-ink-2">Preferred haircut · {fmt(data.preferred!.completed_at)}</p>
          <p className="text-lg font-semibold">{p.option?.name ?? 'Custom haircut'}</p>
          {p.keep.length > 0 && <p className="text-[15px]"><b>Keep:</b> {p.keep.join(', ')}</p>}
          {p.avoid.length > 0 && <p className="text-[15px]"><b>Avoid:</b> {p.avoid.join(', ')}</p>}
          {data.preferred!.actual_notes && <p className="text-[15px]"><b>Last time:</b> {data.preferred!.actual_notes}</p>}
        </div>
      ) : <p className="text-ink-2">Wala pang saved na haircut.</p>}
      <div className="flex flex-wrap gap-2">
        {p && <Button variant="primary" onClick={() => start(data.preferred!.id)}>Same as last time, o may babaguhin?</Button>}
        <Button onClick={() => start()}>Start fresh</Button>
      </div>
      {data.visits.length > 1 && <p className="text-[14px] text-ink-2">{data.visits.length} visits on record.</p>}
    </div>
  )
}

export default function Customers() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<CustomerRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => api.searchCustomers(q).then(r => { setRows(r); setError(null) }, e => setError(e.message)), 200)
    return () => clearTimeout(t)
  }, [q])

  async function createdThenStart(id: string) {
    try { navigate(`/consult/${(await api.createConsultation(id)).id}`) }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Hindi nakapagsimula.') }
  }

  return (
    <div className="min-h-dvh">
      <Header sub="Customers · barber only" />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-8 md:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-[15px]">Hanapin ang customer</span>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Pangalan o nickname"
              className="block min-h-12 w-full rounded-[var(--radius-control)] border border-boundary bg-surface px-3" />
          </label>
          <ul className="divide-y divide-separator rounded-[var(--radius-sheet)] bg-surface">
            {rows.map(r => (
              <li key={r.id}>
                <button onClick={() => { setSelected(r.id); setCreating(false) }} aria-current={selected === r.id}
                  className={`flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left ${selected === r.id ? 'bg-subtle' : 'hover:bg-subtle'}`}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.display_name}{r.nickname && <span className="text-ink-2"> “{r.nickname}”</span>}</span>
                    <span className="block text-[14px] text-ink-2">Last visit: {fmt(r.last_visit_at)}</span>
                  </span>
                  <span aria-hidden className="text-ink-2">›</span>
                </button>
              </li>
            ))}
            {rows.length === 0 && <li className="px-4 py-6 text-ink-2">{q ? 'Walang tugma.' : 'Wala pang customers.'}</li>}
          </ul>
          <Button className="w-full" onClick={() => { setCreating(true); setSelected(null) }}>+ Bagong customer</Button>
          <ErrorLine message={error} />
        </div>
        <Sheet className="self-start">
          {creating ? <NewCustomer onDone={createdThenStart} />
            : selected ? <CustomerDetail id={selected} />
            : <p className="text-ink-2">Pumili ng customer para makita ang preferred haircut.</p>}
        </Sheet>
      </main>
    </div>
  )
}
