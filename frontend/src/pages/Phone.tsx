import { useState } from 'react'
import { api, ApiError } from '../api'
import { JobStatus, OptionCard } from '../components/ConsultParts'
import Mascot from '../components/Mascot'
import Mirror from '../components/Mirror'
import Photo from '../components/Photo'
import Talk from '../components/Talk'
import { Button, ErrorLine } from '../components/ui'
import { flow } from '../flow'
import { useConsultation } from '../useConsultation'

const PROMPT: Record<string, string> = {
  concern: 'Ano ang gusto mong ayusin sa buhok mo ngayon?',
  photos: 'Kunan natin ng harap at gilid.',
  observations: 'Tinitingnan ng barbero ang mga photo.',
  options: 'Alin ang mas malapit sa gusto mo?',
  agreement: 'Pareho na ba tayo ng intindi?',
  cutting: 'Ginugupitan ka na. Salamat!',
  completed: 'Tapos na. Puwede mo nang isara ito.',
}

/** The customer's phone: mirror first, then the question, then choices. Sees only its own consultation. */
export default function Phone() {
  const id = new URLSearchParams(location.search).get('c')
  const h = useConsultation(id)
  const { c, results, runningJob } = h
  const [sheet, setSheet] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  if (!id) return <Center>I-scan ang QR code sa laptop ng barbero para magsimula.</Center>
  if (!c) return <Center>{h.offline ? 'Hindi maabot ang laptop. Nasa shop Wi-Fi ka ba?' : h.error ?? 'Kumokonekta sa laptop…'}</Center>
  if (c.status !== 'active') return <Center>Tapos na ang konsultang ito. Salamat!</Center>

  const f = flow(c.id, h)
  const s = c.state
  const busy = !!runningJob
  const front = c.photos.filter(p => p.view === 'front').at(-1)
  const side = c.photos.filter(p => p.view === 'side').at(-1)
  const showMirror = c.stage === 'concern' || c.stage === 'photos'

  async function confirm() {
    setConfirmError(null)
    try { await api.confirmAgreement(c!.id, 'customer', c!.revision); h.refresh() }
    catch (e) { setConfirmError(e instanceof ApiError ? e.message : 'Hindi na-confirm.') }
  }

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold">GupAi</span>
        <span className="text-[14px] text-ink-2">{h.offline ? '⚠ Offline' : 'Konektado sa laptop'}</span>
      </header>

      {showMirror && <Mirror onCapture={f.photo} busy={busy} />}
      {(front || side) && (
        <div className="grid grid-cols-2 gap-3">
          {front && <Photo src={front.url} label="Harap" face={results.faceshape ?? s.face_shape} />}
          {side && <Photo src={side.url} label="Gilid" />}
        </div>
      )}

      <div className="flex items-start gap-3">
        <Mascot size={44} />
        <p className="text-[22px] font-semibold leading-tight">{PROMPT[c.stage]}</p>
      </div>
      {s.reply && <p className="rounded-[var(--radius-control)] bg-surface p-4">{s.reply}{s.next_question && <><br /><b>{s.next_question}</b></>}</p>}

      {(c.stage === 'options' || c.stage === 'agreement') && s.options.map(o => (
        <OptionCard key={o.id} o={o} selected={o.id === s.selected_option_id}
          onSelect={c.stage === 'options' ? () => f.contribute({ kind: 'select_option', option_id: o.id }) : undefined} />
      ))}

      {c.stage === 'agreement' && s.selected_option_id && (
        c.agreement?.customer_confirmed_at
          ? <p className="text-action">✓ Na-confirm mo. Hinihintay ang barbero.</p>
          : <Button variant="primary" className="w-full text-lg" disabled={s.conflicts.length > 0} onClick={confirm}>Ito ang gusto ko</Button>
      )}
      <ErrorLine message={confirmError} />

      {c.stage !== 'cutting' && (
        <Talk speakerLocked="customer" onSend={f.say} onAudio={f.audio} transcript={results.transcribe?.text} busy={busy}
          placeholder="Hal. “Huwag galawin ang fringe”" />
      )}
      <JobStatus job={runningJob} />
      <ErrorLine message={h.error} />

      {/* Persistent agreement access without covering the mirror */}
      <div className="fixed inset-x-0 bottom-0 border-t border-separator bg-canvas/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
        <Button className="w-full" aria-expanded={sheet} onClick={() => setSheet(v => !v)}>
          Napagkasunduan · {s.keep.length + s.change.length + s.avoid.length} items
        </Button>
      </div>
      {sheet && (
        <div role="dialog" aria-label="Napagkasunduan" className="fixed inset-x-0 bottom-0 max-h-[75dvh] overflow-y-auto rounded-t-[var(--radius-sheet)] bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-1px_0_var(--color-separator)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Napagkasunduan</h2>
            <Button variant="quiet" className="min-h-10" onClick={() => setSheet(false)}>Isara</Button>
          </div>
          <dl className="space-y-3">
            {(['keep', 'change', 'avoid'] as const).map(k => (
              <div key={k}><dt className="text-[14px] font-semibold text-ink-2">{{ keep: 'Keep', change: 'Change', avoid: 'Avoid' }[k]}</dt>
                <dd>{s[k].length ? s[k].join(', ') : '—'}</dd></div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center"><Mascot size={64} /><p className="max-w-[30ch] text-lg">{children}</p></div>
}
