import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { api, ApiError, type CustomerRef, type CustomerRow, type Visit } from '../api'
import { navigate } from '../App'
import Character from '../components/Character'
import Icon from '../components/Icon'
import { Button, ErrorLine, Header } from '../components/ui'

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Wala pang visit'
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
const field = 'block min-h-12 w-full rounded-full bg-subtle px-5 outline-none placeholder:text-ink-2 focus-visible:ring-2 focus-visible:ring-focus'

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-[14px] bg-peach font-semibold text-ink" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(name)}
    </span>
  )
}

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
    <form onSubmit={submit} className="space-y-5">
      <h2 className="font-display text-[40px] leading-none">Bagong customer</h2>
      <label className="block space-y-1.5">
        <span className="text-[15px] font-medium">Pangalan</span>
        <input required maxLength={80} value={name} onChange={e => setName(e.target.value)} className={field} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[15px] font-medium">Nickname <span className="font-normal text-ink-2">(optional, para hindi malito sa kapangalan)</span></span>
        <input maxLength={40} value={nick} onChange={e => setNick(e.target.value)} className={field} />
      </label>
      <label className="flex items-start gap-3 rounded-[18px] bg-subtle p-4">
        <input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-action)]" />
        <span className="text-[15px]">Pumayag ang customer na i-save sa laptop na ito ang haircut notes niya. Hiwalay na tatanungin ang photos sa dulo.</span>
      </label>
      <Button variant="primary" type="submit" className="w-full" disabled={busy || !consent || !name.trim()}>I-save at simulan ang konsulta</Button>
      <ErrorLine message={error} />
    </form>
  )
}

function CustomerDetail({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [data, setData] = useState<{ customer: CustomerRef; preferred: Visit | null; visits: Visit[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setData(null); api.customer(id).then(setData, e => setError(e.message)) }, [id])
  async function start(fromVisit?: string) {
    try { navigate(`/consult/${(await api.createConsultation(id, fromVisit)).id}`) }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Hindi nakapagsimula.') }
  }
  async function erase() {
    if (!data) return
    const name = data.customer.display_name
    if (!confirm(`Buburahin si ${name} at lahat ng visit at photo niya. Hindi na ito maibabalik. Ituloy?`)) return
    try { await api.deleteCustomer(id); onDeleted() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Hindi nabura.') }
  }
  if (error) return <ErrorLine message={error} />
  if (!data) return <p className="text-ink-2">Loading…</p>
  const pref = data.preferred
  const p = pref?.agreement.plan
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar name={data.customer.display_name} size={56} />
        <div className="min-w-0">
          <h2 className="truncate font-display text-[40px] leading-none">{data.customer.display_name}</h2>
          {data.customer.nickname && <p className="text-ink-2">“{data.customer.nickname}” · {data.visits.length} {data.visits.length === 1 ? 'visit' : 'visits'}</p>}
        </div>
      </div>
      {p && pref ? (
        <div className="overflow-hidden rounded-[22px] bg-subtle">
          <div className="flex items-center gap-4 p-4">
            {p.option?.image && <img src={p.option.image} alt="" className="size-24 shrink-0 rounded-[16px] bg-peach object-cover" />}
            <div className="min-w-0">
              <p className="text-[14px] text-ink-2">Preferred haircut · {fmt(pref.completed_at)}</p>
              <p className="font-display text-[30px] leading-tight">{p.option?.name ?? 'Custom haircut'}</p>
            </div>
          </div>
          <dl className="space-y-1 border-t border-separator px-4 py-3 text-[15px]">
            {p.keep.length > 0 && <div><dt className="inline font-semibold">Keep: </dt><dd className="inline">{p.keep.join(', ')}</dd></div>}
            {p.avoid.length > 0 && <div><dt className="inline font-semibold">Avoid: </dt><dd className="inline">{p.avoid.join(', ')}</dd></div>}
            {pref.actual_notes && <div><dt className="inline font-semibold">Huling ginawa: </dt><dd className="inline">{pref.actual_notes}</dd></div>}
          </dl>
        </div>
      ) : <p className="rounded-[18px] bg-subtle p-4 text-ink-2">Wala pang saved na haircut.</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        {p && pref && <Button variant="primary" className="flex-1" onClick={() => start(pref.id)}>Same as last time, o may babaguhin?</Button>}
        <Button className={p ? '' : 'flex-1'} onClick={() => start()}>Start fresh</Button>
      </div>
      <div className="border-t border-separator pt-4">
        <Button variant="quiet" className="min-h-10 rounded-full text-error hover:bg-error/10" onClick={erase}>
          <Icon name="trash" size={18} /> Burahin ang customer at lahat ng record
        </Button>
      </div>
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

  const panelKey = creating ? 'new' : selected ?? 'empty'
  const reload = () => api.searchCustomers(q).then(r => { setRows(r); setError(null) }, e => setError(e.message))

  return (
    <div className="min-h-dvh pb-12">
      <Header sub="Customers · barbero lang" right={<Button variant="quiet" className="min-h-10 rounded-full" onClick={() => navigate("/")}><Icon name="left" size={18} /> Home</Button>} />
      <main className="mx-auto grid max-w-[1180px] grid-cols-1 gap-8 px-4 pt-6 sm:px-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="min-w-0 space-y-4">
          <h1 className="font-display text-[clamp(2.5rem,4vw,3.5rem)]">Sino ang nasa upuan?</h1>
          <label className="block">
            <span className="sr-only">Hanapin ang customer</span>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Hanapin: pangalan o nickname" className={field} />
          </label>
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {rows.map(r => (
                <motion.li key={r.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <button onClick={() => { setSelected(r.id); setCreating(false) }} aria-current={selected === r.id}
                    className={`flex min-h-16 w-full items-center gap-3 rounded-[20px] px-3 py-2.5 text-left transition-[background-color,box-shadow] duration-150 active:scale-[0.99] ${
                      selected === r.id ? 'bg-surface shadow-[0_0_0_2px_var(--color-action),var(--shadow-card)]' : 'bg-surface/60 hover:bg-surface hover:shadow-[var(--shadow-card)]'}`}>
                    <Avatar name={r.display_name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.display_name}{r.nickname && <span className="font-normal text-ink-2"> “{r.nickname}”</span>}</span>
                      <span className="block text-[14px] text-ink-2">Huling visit: {fmt(r.last_visit_at)}</span>
                    </span>
                    {r.preferred_visit_id && <span className="rounded-full bg-peach px-2.5 py-1 text-[12px] font-medium">May saved na gupit</span>}
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
            {rows.length === 0 && <li className="px-2 py-4 text-ink-2">{q ? 'Walang tugma.' : 'Wala pang customers.'}</li>}
          </ul>
          <Button className="w-full rounded-full" onClick={() => { setCreating(true); setSelected(null) }}>+ Bagong customer</Button>
          <ErrorLine message={error} />
        </section>

        <section className="min-w-0 self-start rounded-[var(--radius-sheet)] bg-surface p-6 shadow-[var(--shadow-card)] md:sticky md:top-6">
          <AnimatePresence mode="wait">
            <motion.div key={panelKey} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}>
              {creating ? <NewCustomer onDone={createdThenStart} />
                : selected ? <CustomerDetail id={selected} onDeleted={() => { setSelected(null); void reload() }} />
                : (
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <Character state="idle" size={200} />
                    <p className="font-display text-[30px]">Pumili ng customer</p>
                    <p className="max-w-[30ch] text-ink-2">Makikita rito ang preferred haircut niya at ang huling ginawa.</p>
                  </div>
                )}
            </motion.div>
          </AnimatePresence>
        </section>
      </main>
    </div>
  )
}
