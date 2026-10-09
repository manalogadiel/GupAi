import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { api, ApiError, type Consultation, type Stage } from '../api'
import { navigate } from '../App'
import { AgreementSummary, FaceShapeChips, JobStatus, OptionCard } from '../components/ConsultParts'
import Character, { type CharacterState } from '../components/Character'
import Mirror from '../components/Mirror'
import Photo from '../components/Photo'
import Talk from '../components/Talk'
import { Button, Chip, ErrorLine, Header, Sheet } from '../components/ui'
import { flow } from '../flow'
import { useConsultation } from '../useConsultation'

const STEPS: { stage: Stage; label: string }[] = [
  { stage: 'concern', label: 'Gusto' },
  { stage: 'photos', label: 'Photos' },
  { stage: 'observations', label: 'Nakita' },
  { stage: 'options', label: 'Options' },
  { stage: 'agreement', label: 'Kasunduan' },
  { stage: 'cutting', label: 'Gupit' },
]
const PROMPT: Record<string, string> = {
  concern: 'Ano ang gusto mong ayusin sa buhok mo ngayon?',
  photos: 'Kunan natin ng harap at gilid para makita ng barbero at ng AI.',
  observations: 'Barbero: tama ba ang nakita ng AI? I-confirm o itama.',
  options: 'Alin ang mas malapit sa gusto mo? Puwede pang magbago ng isip.',
  agreement: 'Pareho na ba tayo ng intindi bago gumupit?',
  cutting: 'Habang naggugupit: i-record ang talagang ginawa.',
  completed: 'Tapos na ang konsulta.',
}
const QUICK: { field: 'keep' | 'change' | 'avoid'; value: string; label: string }[] = [
  { field: 'keep', value: 'fringe', label: 'Keep: fringe' },
  { field: 'keep', value: 'haba sa ibabaw', label: 'Keep: haba sa ibabaw' },
  { field: 'change', value: 'mas maikli sa gilid', label: 'Change: mas maikli sa gilid' },
  { field: 'change', value: 'linisin ang likod', label: 'Change: linis sa likod' },
  { field: 'avoid', value: 'masyadong maikli sa gilid', label: 'Avoid: sobrang ikli sa gilid' },
  { field: 'avoid', value: 'kita ang anit', label: 'Avoid: kita ang anit' },
]

function Pairing({ c }: { c: Consultation }) {
  const [qr, setQr] = useState<{ url: string; qr_png_data_url: string; expires_at: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (c.phone_paired) return <p className="flex items-center gap-2 text-[15px] text-ink"><span aria-hidden className="size-2.5 rounded-full bg-action" /> Naka-connect ang phone ng customer</p>
  return (
    <div className="space-y-3">
      {qr ? (
        <>
          <motion.img initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 28 }} src={qr.qr_png_data_url} alt="QR code para i-connect ang phone" className="mx-auto w-48 rounded-[16px] bg-white p-3 shadow-[var(--shadow-card)]" />
          <p className="break-all text-center text-[13px] text-ink-2">{qr.url}</p>
          <p className="text-center text-[13px] text-ink-2">Isang beses lang magagamit · 10 minuto</p>
        </>
      ) : (
        <Button className="w-full" onClick={() => api.pair(c.id).then(setQr, e => setError(e.message))}>I-connect ang phone (QR)</Button>
      )}
      <ErrorLine message={error} />
    </div>
  )
}

function CompleteForm({ c }: { c: Consultation }) {
  const [notes, setNotes] = useState('')
  const [preferred, setPreferred] = useState(true)
  const [keepPhotos, setKeepPhotos] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const named = !!c.customer
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null)
    try { await api.complete(c.id, notes.trim(), named && preferred, named && keepPhotos); navigate(named ? '/customers' : '/') }
    catch (err) { setError(err instanceof ApiError ? `Hindi na-save: ${err.message}` : 'Hindi na-save. Subukan ulit.'); setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-[15px] font-semibold">Ano ang talagang ginawa?</span>
        <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} placeholder="Hal. #2 sa gilid, gunting sa ibabaw, iniwan ang fringe"
          className="block w-full rounded-[var(--radius-control)] bg-subtle px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-focus" />
      </label>
      {named ? (
        <>
          <label className="flex items-start gap-3"><input type="checkbox" checked={preferred} onChange={e => setPreferred(e.target.checked)} className="mt-1 size-5 accent-[var(--color-action)]" />
            <span className="text-[15px]">I-save bilang preferred haircut ni {c.customer!.display_name}</span></label>
          <label className="flex items-start gap-3"><input type="checkbox" checked={keepPhotos} onChange={e => setKeepPhotos(e.target.checked)} className="mt-1 size-5 accent-[var(--color-action)]" />
            <span className="text-[15px]">Itago rin ang photos (pumayag ang customer)</span></label>
        </>
      ) : <p className="text-[14px] text-ink-2">Temporary ito: buburahin ang photos at hindi ise-save ang haircut.</p>}
      <Button variant="primary" type="submit" className="w-full" disabled={busy}>Tapusin ang konsulta</Button>
      <ErrorLine message={error} />
    </form>
  )
}

export default function Consult({ id }: { id: string }) {
  const h = useConsultation(id)
  const { c, results, runningJob } = h
  const [recording, setRecording] = useState(false)
  const f = flow(id, h)
  const busy = !!runningJob

  if (!c) {
    return <div className="min-h-dvh"><Header /><main className="p-8 text-ink-2">{h.error ?? 'Loading consultation…'}</main></div>
  }

  const s = c.state
  const stepIndex = Math.max(0, STEPS.findIndex(x => x.stage === c.stage))
  const front = c.photos.filter(p => p.view === 'front').at(-1)
  const side = c.photos.filter(p => p.view === 'side').at(-1)
  const faceForPhoto = results.faceshape ?? s.face_shape
  const proposed = s.observations.filter(o => o.status === 'proposed' || o.status === 'unconfirmed')
  const agreementReady = !!s.selected_option_id && s.conflicts.length === 0
  // The server moves one step at a time; walk there so a tab can jump several steps.
  async function go(stage: Stage) {
    const target = STEPS.findIndex(x => x.stage === stage)
    let cur: Consultation = c!
    try {
      for (let i = 0; i < STEPS.length; i++) {
        const at = STEPS.findIndex(x => x.stage === cur.stage)
        if (at === target || at < 0) break
        cur = await api.contribute(cur.id, { kind: 'stage', stage: STEPS[at + Math.sign(target - at)].stage }, cur.revision)
      }
    } catch (e) { h.setError(e instanceof ApiError ? e.message : 'Hindi nakalipat ng step.') }
    h.refresh()
  }

  const agreed = !!(c.agreement?.customer_confirmed_at && c.agreement?.barber_confirmed_at)
  const mood: CharacterState = recording ? 'listening' : busy ? 'thinking' : agreed ? 'happy' : 'idle'

  return (
    <div className="min-h-dvh pb-10 lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden lg:pb-0">
      <Header
        sub={<span className="hidden sm:inline">{c.customer ? c.customer.display_name : 'Temporary session'} · {c.customer ? 'saved customer' : 'walang ise-save'}</span>}
        right={<>
          {h.offline ? <span className="text-[15px] text-error">⚠ Offline sa laptop server</span> : <span className="hidden text-[14px] text-ink-2 md:inline">Local AI · walang internet</span>}
          <Button variant="quiet" className="min-h-10 px-3 text-[15px]" onClick={async () => {
            if (!confirm('Itigil ang konsulta? Walang mase-save at buburahin ang photos.')) return
            try { await api.abandon(c.id); navigate('/') } catch (e) { h.setError(e instanceof ApiError ? e.message : 'Hindi naitigil.') }
          }}>Itigil</Button>
        </>}
      />

      <nav aria-label="Steps" className="mx-auto mt-2 flex max-w-[1440px] justify-center px-4">
        <ol className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1.5 shadow-[var(--shadow-card)]">
          {STEPS.map((x, i) => (
            <li key={x.stage}>
              <button onClick={() => go(x.stage)} disabled={x.stage === 'cutting' || c.stage === 'cutting'} aria-current={i === stepIndex ? 'step' : undefined}
                className={`relative min-h-11 whitespace-nowrap rounded-full px-4 text-[15px] font-medium transition-colors duration-150 disabled:cursor-default ${i === stepIndex ? 'text-on-action' : i < stepIndex ? 'text-ink hover:bg-subtle' : 'text-ink-2 hover:bg-subtle'}`}>
                {i === stepIndex && <motion.span layoutId="step-thumb" className="absolute inset-0 rounded-full bg-action" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                <span className="relative">{i < stepIndex ? '✓ ' : `${i + 1}. `}{x.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <main className="mx-auto grid w-full max-w-[1440px] gap-6 px-4 pt-5 sm:px-8 lg:min-h-0 lg:flex-1 lg:grid-cols-12">
        {/* Prompt column */}
        <section className="scroll-col min-w-0 space-y-5 lg:col-span-4 lg:overflow-y-auto lg:pb-6 lg:pr-1">
          <div className="flex items-end gap-3">
            <Character state={mood} size={84} />
            <AnimatePresence mode="wait">
              <motion.h1 key={c.stage} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className="pb-2 font-display text-[clamp(1.75rem,2.3vw,2.4rem)]">{PROMPT[c.stage]}</motion.h1>
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {s.reply && (
              <motion.div key={s.reply} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="relative rounded-[20px] rounded-tl-[6px] bg-surface p-4 shadow-[var(--shadow-card)]" aria-live="polite">
                <p>{s.reply}</p>
                {s.next_question && <p className="mt-2 font-semibold">{s.next_question}</p>}
              </motion.div>
            )}
          </AnimatePresence>

          {(c.stage === 'concern' || c.stage === 'options') && (
            <div className="flex flex-wrap gap-2">
              {QUICK.map(q => {
                const on = s[q.field].includes(q.value)
                return <Chip key={q.label} pressed={on} onClick={() => f.contribute({ kind: 'chip', speaker: 'customer', field: q.field, value: q.value, remove: on })}>{q.label}</Chip>
              })}
            </div>
          )}

          {c.stage === 'observations' && (
            <div className="space-y-5">
              <FaceShapeChips c={c} disabled={busy} onPick={shape => f.contribute({ kind: 'face_shape', confirmed: shape })} />
              <div className="space-y-2">
                <p className="text-[15px] font-medium">Nakita ng AI <span className="font-normal text-ink-2">· mungkahi lang</span></p>
                {proposed.length === 0 && <p className="text-[15px] text-ink-2">{s.observations.length ? 'Na-review na lahat.' : 'Wala pa. Kumuha muna ng photo.'}</p>}
                <AnimatePresence initial={false}>
                  {proposed.map(o => (
                    <motion.div key={o.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.16 } }}
                      className="space-y-3 rounded-[18px] bg-surface p-4 shadow-[var(--shadow-card)]">
                      <p>{o.text}{o.uncertain && <span className="text-ink-2"> · hindi sigurado</span>}{o.origin === 'history' && <span className="text-ink-2"> · mula sa huling visit, i-check ulit</span>}</p>
                      <div className="flex gap-2">
                        <Button variant="primary" className="min-h-10 flex-1" onClick={() => f.contribute({ kind: 'observation', observation_id: o.id, status: 'confirmed' })}>✓ Tama</Button>
                        <Button variant="quiet" className="min-h-10 flex-1 bg-subtle" onClick={() => f.contribute({ kind: 'observation', observation_id: o.id, status: 'rejected' })}>Mali</Button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {c.stage !== 'cutting' && c.stage !== 'completed' && (
            <Talk onSend={f.say} onAudio={f.audio} transcript={results.transcribe?.text} busy={busy} onRecordingChange={setRecording} />
          )}
          <JobStatus job={runningJob} />
          <ErrorLine message={h.error} />
        </section>

        {/* Mirror column */}
        <section className="scroll-col min-w-0 space-y-5 lg:col-span-5 lg:overflow-y-auto lg:pb-0">
          {(c.stage === 'concern' || c.stage === 'photos') && !c.phone_paired && <Mirror onCapture={f.photo} busy={busy} />}
          {(c.stage === 'concern' || c.stage === 'photos') && c.phone_paired && !front && !side && (
            <div className="grid aspect-[4/3] place-items-center rounded-[var(--radius-mirror)] bg-subtle p-8 text-center">
              <div className="space-y-2">
                <p className="font-display text-3xl">Nasa phone ng customer ang salamin</p>
                <p className="text-ink-2">Lalabas dito ang mga kuha.</p>
              </div>
            </div>
          )}
          {(front || side) && c.stage !== 'options' && c.stage !== 'agreement' && (
            <div className="grid gap-4 sm:grid-cols-2">
              {front && <Photo src={front.url} label="Harap" face={faceForPhoto} />}
              {side && <Photo src={side.url} label="Gilid" />}
            </div>
          )}
          {(c.stage === 'options' || c.stage === 'agreement') && (
            s.options.length ? (
              <>
                <div className="grid gap-5 md:grid-cols-2">
                  {s.options.map((o, i) => (
                    <motion.div key={o.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, type: 'spring', stiffness: 320, damping: 30 }}>
                      <OptionCard o={o} selected={o.id === s.selected_option_id}
                        onSelect={c.stage === 'options' ? () => f.contribute({ kind: 'select_option', option_id: o.id }) : undefined} />
                    </motion.div>
                  ))}
                </div>
                {s.options.length === 1 && <p className="text-ink-2">Isang style lang sa catalog ang tugma sa mga kondisyon ngayon.</p>}
                {s.uncertainties.length > 0 && <p className="text-[15px] text-ink-2">Hindi sigurado ang AI: {s.uncertainties.join('; ')}</p>}
              </>
            ) : (
              <div className="grid min-h-[320px] place-items-center rounded-[var(--radius-mirror)] bg-subtle p-8 text-center">
                <div className="space-y-4">
                  <p className="font-display text-3xl">Wala pang options</p>
                  <p className="text-ink-2">Sabihin ang gusto, o hingin na ngayon.</p>
                  <Button variant="primary" disabled={busy} onClick={f.propose}>Ipakita ang dalawang option</Button>
                </div>
              </div>
            )
          )}
          {c.stage === 'cutting' && <Sheet><CompleteForm c={c} /></Sheet>}

          <div className="flex justify-between gap-2 bg-canvas/90 py-3 backdrop-blur-sm lg:sticky lg:bottom-0">
            <Button variant="quiet" disabled={stepIndex === 0} onClick={() => go(STEPS[stepIndex - 1].stage)}>← Bumalik</Button>
            {stepIndex < STEPS.length - 2 && (
              <Button variant="primary" onClick={() => go(STEPS[stepIndex + 1].stage)}>Susunod: {STEPS[stepIndex + 1].label} →</Button>
            )}
          </div>
        </section>

        {/* Agreement column */}
        <aside className="scroll-col min-w-0 space-y-5 lg:col-span-3 lg:overflow-y-auto lg:pb-6">
          <Sheet className="relative overflow-hidden"><AgreementSummary c={c} /></Sheet>
          {c.stage === 'agreement' && (
            <Sheet className="space-y-3">
              <AgreementConfirm c={c} ready={agreementReady} onDone={h.refresh} />
            </Sheet>
          )}
          {c.stage !== 'cutting' && <Sheet><Pairing c={c} /></Sheet>}
        </aside>
      </main>
    </div>
  )
}

function AgreementConfirm({ c, ready, onDone }: { c: Consultation; ready: boolean; onDone: () => void }) {
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const a = c.agreement
  async function confirm(role: 'customer' | 'barber') {
    setError(null)
    try { await api.confirmAgreement(c.id, role, c.revision, role === 'barber' ? notes.trim() : undefined); onDone() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Hindi na-confirm.') }
  }
  if (!ready) return <p className="text-[15px] text-ink-2">Pumili muna ng style at ayusin ang anumang salungat bago mag-confirm.</p>
  return (
    <>
      <Button variant={a?.customer_confirmed_at ? 'secondary' : 'primary'} className="w-full" disabled={!!a?.customer_confirmed_at} onClick={() => confirm('customer')}>
        {a?.customer_confirmed_at ? '✓ Customer: Ito ang gusto ko' : 'Customer: Ito ang gusto ko'}
      </Button>
      <label className="block space-y-1">
        <span className="text-[15px]">Cutting notes ng barbero</span>
        <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} placeholder="Hal. #2 fade sa gilid, 2 inches sa ibabaw"
          className="block w-full rounded-[var(--radius-control)] bg-subtle px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-focus" />
      </label>
      <Button variant={a?.barber_confirmed_at ? 'secondary' : 'primary'} className="w-full" disabled={!!a?.barber_confirmed_at} onClick={() => confirm('barber')}>
        {a?.barber_confirmed_at ? '✓ Barbero: Kaya ko ’to' : 'Barbero: Kaya ko ’to'}
      </Button>
      <ErrorLine message={error} />
    </>
  )
}
