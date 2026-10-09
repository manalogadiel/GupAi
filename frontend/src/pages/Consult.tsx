import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { api, ApiError, type Consultation, type Stage } from '../api'
import { navigate } from '../App'
import { BarberPanel, interviewSlot, Scene, STEPS } from '../components/Scenes'
import Icon from '../components/Icon'
import { Button, ErrorLine } from '../components/ui'
import Wordmark from '../components/Wordmark'
import { flow } from '../flow'
import { useSpeaking } from '../speech'
import { useConsultation } from '../useConsultation'

const ORDER = STEPS.map(s => s.stage)

/** What must be true before the barber can move forward from each stage (mirrors the server gates). */
// shortcut: the interview gate is client-side (only the barber laptop can change stage); add a server check if other clients gain stage control.
function blocker(c: Consultation, skipped: boolean): string | null {
  const s = c.state
  switch (c.stage) {
    case 'photos': return ['front', 'side'].every(v => c.photos.some(p => p.view === v)) ? null : 'Kumuha muna ng harap at gilid na photo.'
    case 'goal': return c.active_job ? 'Hintayin o i-cancel muna ang pagsusuri.' : interviewSlot(c) !== 'done' && !skipped ? 'Sagutin muna ang mga tanong ni Kuya Gup.' : null
    case 'reveal': return !s.revealed ? 'I-reveal muna ang resulta.' : null
    case 'sides': return s.sides?.choice ? null : 'Pumili o mag-type muna ng gusto sa gilid.'
    case 'top': return s.top?.choice ? null : 'Pumili o mag-type muna ng gusto sa ibabaw.'
    default: return null
  }
}

function PhoneLink({ c }: { c: Consultation }) {
  const [open, setOpen] = useState(false)
  const [qr, setQr] = useState<{ url: string; qr_png_data_url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (c.phone_paired) return <span className="flex items-center gap-2 whitespace-nowrap text-[14px]"><Icon name="phone" size={18} className="text-action" /> Phone konektado</span>
  return (
    <div className="relative">
      <Button variant="quiet" className="min-h-10 whitespace-nowrap rounded-full px-3 text-[15px]" aria-expanded={open}
        onClick={() => { setOpen(o => !o); if (!qr) api.pair(c.id).then(setQr, e => setError(e.message)) }}><Icon name="phone" size={18} /> I-connect ang phone</Button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }}
            className="glass absolute right-0 top-12 z-30 w-64 space-y-2 rounded-[22px] p-4 text-center">
            {qr ? <img src={qr.qr_png_data_url} alt="QR code para i-connect ang phone ng customer" className="mx-auto w-44 rounded-[14px] bg-white p-2" /> : <p className="text-ink-2">Ginagawa ang QR…</p>}
            <p className="text-[13px] text-ink-2">Para lang sa upuang ito · isang beses · 10 minuto</p>
            <ErrorLine message={error} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Consult({ id }: { id: string }) {
  const h = useConsultation(id)
  const { c } = h
  const [dir, setDir] = useState(1)
  const completion = useRef<{ payload: string; key: string } | null>(null)
  const [skipped, setSkipped] = useState(false)
  const speaking = useSpeaking()
  // Interview complete → Kuya Gup has said his closing line → go to the scan on his own.
  const ready = c?.stage === 'goal' && interviewSlot(c) === 'done' && !h.chatJob && !speaking
  const advanced = useRef(false)
  useEffect(() => {
    if (!ready || advanced.current) return
    const t = setTimeout(() => { advanced.current = true; setDir(1); void flow(c!.id, h).go('reveal') }, 1200)
    return () => clearTimeout(t)
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) return <main className="grid min-h-dvh place-items-center text-ink-2">{h.error ?? 'Loading consultation…'}</main>

  const f = flow(c.id, h)
  const at = Math.max(0, ORDER.indexOf(c.stage))
  const block = blocker(c, skipped)
  const go = (stage: Stage) => { setDir(ORDER.indexOf(stage) >= at ? 1 : -1); f.go(stage) }
  const canStep = (i: number) => c.stage !== 'cutting' && c.stage !== 'done' && i <= ORDER.indexOf('summary') && (i < at || (i === at + 1 && !block))
  const chair = (c as Consultation & { chair_label?: string | null }).chair_label

  async function complete(rating: { score: number; tags: string[] }, notes: string, preferred: boolean, keepPhotos: boolean) {
    const payload = JSON.stringify([rating, notes, preferred, keepPhotos])
    if (completion.current?.payload !== payload) completion.current = { payload, key: crypto.randomUUID() }
    try { await api.complete(c!.id, notes, !!c!.customer && preferred, !!c!.customer && keepPhotos, rating, completion.current.key); navigate('/') }
    catch (e) { h.setError(e instanceof ApiError ? e.message : 'Hindi na-save.') }
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-[1500px] items-center gap-4 px-6 pb-2 pt-4">
        <a href="/" aria-label="GupAi home" className="no-underline"><Wordmark height={30} /></a>
        <span className="hidden truncate text-[15px] text-ink-2 xl:inline">{chair ?? 'Upuan'} · {c.customer?.display_name ?? 'Temporary'}</span>
        <nav aria-label="Steps" className="mx-auto">
          <ol className="glass flex gap-0.5 rounded-full p-1">
            {STEPS.map((x, i) => (
              <li key={x.stage}>
                <button onClick={() => go(x.stage)} disabled={!canStep(i)} aria-current={i === at ? 'step' : undefined}
                  className={`relative min-h-9 whitespace-nowrap rounded-full px-3 text-[14px] font-medium transition-colors ${i === at ? 'text-on-action' : i < at ? 'text-ink' : 'text-ink-2'} disabled:cursor-default`}>
                  {i === at && <motion.span layoutId="step-thumb" className="absolute inset-0 rounded-full bg-action" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                  <span className="relative flex items-center gap-1">{i < at && <Icon name="check" size={14} strokeWidth={2.6} />}{x.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <PhoneLink c={c} />
        <Button variant="quiet" className="min-h-10 rounded-full px-3 text-[15px]" onClick={async () => {
          if (!confirm('Itigil ang konsulta? Walang mase-save at buburahin ang photos.')) return
          try { await api.abandon(c.id); navigate('/') } catch (e) { h.setError(e instanceof ApiError ? e.message : 'Hindi naitigil.') }
        }}>Itigil</Button>
      </header>

      <main className="mx-auto grid min-h-0 w-full max-w-[1500px] flex-1 grid-cols-[minmax(340px,0.78fr)_2.2fr] gap-6 px-6 pb-5 pt-3">
        <section className="min-h-0"><BarberPanel c={c} f={f} h={h} role="barber" recording={false} /></section>
        <section className="relative grid min-h-0 grid-rows-[1fr_auto] gap-3">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div key={c.stage} custom={dir} className="min-h-0"
              initial={{ opacity: 0, x: 40 * dir }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 * dir }}
              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}>
              <Scene c={c} f={f} h={h} role="barber" onComplete={complete} />
            </motion.div>
          </AnimatePresence>
          {at <= ORDER.indexOf('summary') && (
            <div className="flex items-center justify-between gap-3">
              <Button variant="quiet" className="rounded-full" disabled={at === 0} onClick={() => go(ORDER[at - 1])}><Icon name="left" size={18} /> Bumalik</Button>
              {block && <p className="text-[14px] text-ink-2">{block}{c.stage === 'goal' && interviewSlot(c) !== 'done' && (
                <> · <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-ink" onClick={() => setSkipped(true)}>Laktawan</button></>
              )}</p>}
              {c.stage !== 'summary' && (
                <Button variant="primary" className="rounded-full px-6" disabled={!!block} onClick={() => go(ORDER[at + 1])}>Susunod: {STEPS[at + 1].label} <Icon name="right" size={18} /></Button>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
