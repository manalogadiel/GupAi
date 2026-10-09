import { useState } from 'react'
import { api, ApiError, type Consultation, type Stage } from '../api'
import { navigate } from '../App'
import { AgreementSummary, FaceShapeChips, JobStatus, OptionCard } from '../components/ConsultParts'
import Mascot from '../components/Mascot'
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
  { field: 'keep', value: 'haba ng fringe', label: 'Keep: fringe' },
  { field: 'keep', value: 'haba sa ibabaw', label: 'Keep: haba sa ibabaw' },
  { field: 'change', value: 'mas maikli sa gilid', label: 'Change: mas maikli sa gilid' },
  { field: 'change', value: 'linisin ang likod', label: 'Change: linis sa likod' },
  { field: 'avoid', value: 'masyadong maikli sa gilid', label: 'Avoid: sobrang ikli sa gilid' },
  { field: 'avoid', value: 'kita ang anit', label: 'Avoid: kita ang anit' },
]

function Pairing({ c }: { c: Consultation }) {
  const [qr, setQr] = useState<{ url: string; qr_png_data_url: string; expires_at: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (c.phone_paired) return <p className="text-[15px] text-ink-2"><span className="text-action">●</span> Naka-connect ang phone ng customer</p>
  return (
    <div className="space-y-3">
      {qr ? (
        <>
          <img src={qr.qr_png_data_url} alt="QR code para i-connect ang phone" className="mx-auto w-44 rounded-[8px] bg-surface p-2" />
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
          className="block w-full rounded-[var(--radius-control)] border border-boundary bg-surface px-3 py-2" />
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
  const go = (stage: Stage) => f.contribute({ kind: 'stage', stage })

  return (
    <div className="min-h-dvh">
      <Header
        sub={<>{c.customer ? c.customer.display_name : 'Temporary session'} · {c.customer ? 'saved customer' : 'walang ise-save'}</>}
        right={<>
          {h.offline ? <span className="text-[15px] text-error">⚠ Offline sa laptop server</span> : <span className="text-[14px] text-ink-2">Local AI · walang internet</span>}
          <Button variant="quiet" className="min-h-10 px-3 text-[15px]" onClick={async () => {
            if (!confirm('Itigil ang konsulta? Walang mase-save at buburahin ang photos.')) return
            try { await api.abandon(c.id); navigate('/') } catch (e) { h.setError(e instanceof ApiError ? e.message : 'Hindi naitigil.') }
          }}>Itigil</Button>
        </>}
      />

      <nav aria-label="Steps" className="flex gap-1 overflow-x-auto border-b border-separator px-4 sm:px-8">
        {STEPS.map((x, i) => (
          <button key={x.stage} onClick={() => go(x.stage)} aria-current={i === stepIndex ? 'step' : undefined}
            className={`min-h-12 whitespace-nowrap border-b-2 px-3 text-[15px] ${i === stepIndex ? 'border-action font-semibold text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}>
            {i + 1}. {x.label}
          </button>
        ))}
      </nav>

      <main className="grid gap-6 px-4 py-6 sm:px-8 lg:grid-cols-12">
        {/* Prompt column */}
        <section className="space-y-5 lg:col-span-4 xl:col-span-3">
          <div className="flex items-start gap-3">
            <Mascot size={64} />
            <p className="text-[clamp(1.375rem,2vw,1.75rem)] font-semibold leading-tight">{PROMPT[c.stage]}</p>
          </div>
          {s.reply && <p className="rounded-[var(--radius-control)] bg-surface p-4">{s.reply}{s.next_question && <><br /><b>{s.next_question}</b></>}</p>}

          {(c.stage === 'concern' || c.stage === 'options') && (
            <div className="flex flex-wrap gap-2">
              {QUICK.map(q => {
                const on = s[q.field].includes(q.value)
                return <Chip key={q.label} pressed={on} onClick={() => f.contribute({ kind: 'chip', speaker: 'customer', field: q.field, value: q.value, remove: on })}>{q.label}</Chip>
              })}
            </div>
          )}

          {c.stage === 'observations' && (
            <div className="space-y-4">
              <FaceShapeChips c={c} disabled={busy} onPick={shape => f.contribute({ kind: 'face_shape', confirmed: shape })} />
              <div className="space-y-2">
                <p className="text-[15px]">Nakita ng AI <span className="text-ink-2">(mungkahi lang)</span></p>
                {proposed.length === 0 && <p className="text-[15px] text-ink-2">{s.observations.length ? 'Na-review na lahat.' : 'Wala pa. Kumuha muna ng photo.'}</p>}
                {proposed.map(o => (
                  <div key={o.id} className="space-y-2 rounded-[var(--radius-control)] bg-surface p-3">
                    <p>{o.text}{o.uncertain && <span className="text-ink-2"> · hindi sigurado</span>}{o.origin === 'history' && <span className="text-ink-2"> · mula sa huling visit, i-check ulit</span>}</p>
                    <div className="flex gap-2">
                      <Button className="min-h-10 flex-1" onClick={() => f.contribute({ kind: 'observation', observation_id: o.id, status: 'confirmed' })}>Tama</Button>
                      <Button variant="quiet" className="min-h-10 flex-1" onClick={() => f.contribute({ kind: 'observation', observation_id: o.id, status: 'rejected' })}>Mali</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {c.stage !== 'cutting' && c.stage !== 'completed' && (
            <Talk onSend={f.say} onAudio={f.audio} transcript={results.transcribe?.text} busy={busy} />
          )}
          <JobStatus job={runningJob} />
          <ErrorLine message={h.error} />
        </section>

        {/* Mirror column */}
        <section className="space-y-5 lg:col-span-5 xl:col-span-6">
          {(c.stage === 'concern' || c.stage === 'photos') && !c.phone_paired && <Mirror onCapture={f.photo} busy={busy} />}
          {(c.stage === 'concern' || c.stage === 'photos') && c.phone_paired && (
            <Sheet><p className="text-ink-2">Kumukuha ng photo sa phone ng customer. Lalabas dito ang mga kuha.</p></Sheet>
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
                <div className="grid gap-4 md:grid-cols-2">
                  {s.options.map(o => (
                    <OptionCard key={o.id} o={o} selected={o.id === s.selected_option_id}
                      onSelect={c.stage === 'options' ? () => f.contribute({ kind: 'select_option', option_id: o.id }) : undefined} />
                  ))}
                </div>
                {s.options.length === 1 && <p className="text-ink-2">Isang style lang sa catalog ang tugma sa mga kondisyon ngayon.</p>}
                {s.uncertainties.length > 0 && <p className="text-[15px] text-ink-2">Hindi sigurado ang AI: {s.uncertainties.join('; ')}</p>}
              </>
            ) : (
              <Sheet className="space-y-3">
                <p>Wala pang options. Sabihin ang gusto, o hingin na ngayon.</p>
                <Button variant="primary" disabled={busy} onClick={f.propose}>Ipakita ang dalawang option</Button>
              </Sheet>
            )
          )}
          {c.stage === 'cutting' && <Sheet><CompleteForm c={c} /></Sheet>}

          <div className="flex justify-between gap-2">
            <Button variant="quiet" disabled={stepIndex === 0} onClick={() => go(STEPS[stepIndex - 1].stage)}>← Bumalik</Button>
            {stepIndex < STEPS.length - 2 && (
              <Button variant="primary" onClick={() => go(STEPS[stepIndex + 1].stage)}>Susunod: {STEPS[stepIndex + 1].label} →</Button>
            )}
          </div>
        </section>

        {/* Agreement column */}
        <aside className="space-y-5 lg:col-span-3">
          <Sheet><AgreementSummary c={c} /></Sheet>
          {c.stage === 'agreement' && (
            <Sheet className="space-y-3">
              <AgreementConfirm c={c} ready={agreementReady} onDone={h.refresh} />
            </Sheet>
          )}
          <Sheet><Pairing c={c} /></Sheet>
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
          className="block w-full rounded-[var(--radius-control)] border border-boundary bg-surface px-3 py-2" />
      </label>
      <Button variant={a?.barber_confirmed_at ? 'secondary' : 'primary'} className="w-full" disabled={!!a?.barber_confirmed_at} onClick={() => confirm('barber')}>
        {a?.barber_confirmed_at ? '✓ Barbero: Kaya ko ’to' : 'Barbero: Kaya ko ’to'}
      </Button>
      <ErrorLine message={error} />
    </>
  )
}
