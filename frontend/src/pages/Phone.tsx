import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { api, ApiError } from '../api'
import Character, { type CharacterState } from '../components/Character'
import { JobStatus, OptionCard } from '../components/ConsultParts'
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

/** The customer's phone (Pal.Do layout): mirror first, mascot + question, choices, and a bottom voice dock. */
export default function Phone() {
  const id = new URLSearchParams(location.search).get('c')
  const h = useConsultation(id)
  const { c, results, runningJob } = h
  const [sheet, setSheet] = useState(false)
  const [recording, setRecording] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  if (!id) return <Center state="idle">I-scan ang QR code sa laptop ng barbero para magsimula.</Center>
  if (!c) return <Center state="thinking">{h.offline ? 'Hindi maabot ang laptop. Nasa shop Wi-Fi ka ba?' : h.error ?? 'Kumokonekta sa laptop…'}</Center>
  if (c.status !== 'active') return <Center state="happy">Tapos na ang konsultang ito. Salamat!</Center>

  const f = flow(c.id, h)
  const s = c.state
  const busy = !!runningJob
  const front = c.photos.filter(p => p.view === 'front').at(-1)
  const side = c.photos.filter(p => p.view === 'side').at(-1)
  const showMirror = c.stage === 'concern' || c.stage === 'photos'
  const agreed = !!(c.agreement?.customer_confirmed_at && c.agreement?.barber_confirmed_at)
  const mood: CharacterState = recording ? 'listening' : busy ? 'thinking' : agreed ? 'happy' : 'idle'
  const count = s.keep.length + s.change.length + s.avoid.length

  async function confirm() {
    setConfirmError(null)
    try { await api.confirmAgreement(c!.id, 'customer', c!.revision); h.refresh() }
    catch (e) { setConfirmError(e instanceof ApiError ? e.message : 'Hindi na-confirm.') }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-[calc(11rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <header className="mb-4 flex items-center justify-between">
        <span className="font-display text-[26px] leading-none">Gup<span className="text-voice">.</span>Ai</span>
        <span className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-[13px] shadow-[var(--shadow-card)]">
          <span aria-hidden className={`size-2 rounded-full ${h.offline ? 'bg-error' : 'bg-action'}`} />
          {h.offline ? 'Offline' : 'Konektado sa laptop'}
        </span>
      </header>

      <div className="space-y-5">
        <div className="flex items-end gap-3">
          <Character state={mood} size={84} />
          <AnimatePresence mode="wait">
            <motion.h1 key={c.stage} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="pb-1 font-display text-[30px]">{PROMPT[c.stage]}</motion.h1>
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {s.reply && (
            <motion.div key={s.reply} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="rounded-[20px] rounded-tl-[6px] bg-surface p-4 shadow-[var(--shadow-card)]" aria-live="polite">
              <p>{s.reply}</p>
              {s.next_question && <p className="mt-2 font-semibold">{s.next_question}</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {showMirror && <Mirror onCapture={f.photo} busy={busy} />}
        {(front || side) && (
          <div className="grid grid-cols-2 gap-3">
            {front && <Photo src={front.url} label="Harap" face={results.faceshape ?? s.face_shape} />}
            {side && <Photo src={side.url} label="Gilid" />}
          </div>
        )}

        {(c.stage === 'options' || c.stage === 'agreement') && s.options.map((o, i) => (
          <motion.div key={o.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, type: 'spring', stiffness: 320, damping: 30 }}>
            <OptionCard o={o} selected={o.id === s.selected_option_id}
              onSelect={c.stage === 'options' ? () => f.contribute({ kind: 'select_option', option_id: o.id }) : undefined} />
          </motion.div>
        ))}

        {c.stage === 'agreement' && s.selected_option_id && (
          c.agreement?.customer_confirmed_at
            ? <p className="rounded-full bg-surface px-4 py-3 text-center text-action shadow-[var(--shadow-card)]">✓ Na-confirm mo. Hinihintay ang barbero.</p>
            : <Button variant="primary" className="min-h-14 w-full text-lg" disabled={s.conflicts.length > 0} onClick={confirm}>Ito ang gusto ko</Button>
        )}
        <ErrorLine message={confirmError} />
        <JobStatus job={runningJob} />
        <ErrorLine message={h.error} />
      </div>

      {/* Bottom dock: voice + typing, and the agreement tab. Never covers the mirror. */}
      {c.stage !== 'cutting' && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-separator/70 bg-canvas/92 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
          <div className="mx-auto max-w-md space-y-2">
            <Talk speakerLocked="customer" onSend={f.say} onAudio={f.audio} transcript={results.transcribe?.text} busy={busy}
              placeholder="Sabihin o i-type…" onRecordingChange={setRecording} micSize={64} />
            <button onClick={() => setSheet(true)} aria-expanded={sheet}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full text-[15px] font-medium text-ink active:scale-[0.98]">
              <span aria-hidden className="h-1 w-8 rounded-full bg-boundary/60" />
              Napagkasunduan · {count} {count === 1 ? 'item' : 'items'}
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {sheet && (
          <>
            <motion.div key="scrim" className="fixed inset-0 z-30 bg-ink/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(false)} />
            <motion.div key="sheet" role="dialog" aria-modal="true" aria-label="Napagkasunduan"
              className="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[78dvh] max-w-md overflow-y-auto rounded-t-[28px] bg-surface px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-[var(--shadow-lift)]"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.05, bottom: 0.6 }}
              onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 500) setSheet(false) }}>
              <div aria-hidden className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-boundary/50" />
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-[32px] leading-none">Napagkasunduan</h2>
                <Button variant="quiet" className="min-h-10 rounded-full" onClick={() => setSheet(false)}>Isara</Button>
              </div>
              <dl className="space-y-4">
                {(['keep', 'change', 'avoid'] as const).map(k => (
                  <div key={k}>
                    <dt className="flex items-center gap-2 text-[14px] font-semibold text-ink-2">
                      <span aria-hidden className={`size-2 rounded-full ${{ keep: 'bg-action', change: 'bg-voice', avoid: 'bg-error' }[k]}`} />
                      {{ keep: 'Keep', change: 'Change', avoid: 'Avoid' }[k]}
                    </dt>
                    <dd className="mt-1 text-lg">{s[k].length ? s[k].join(', ') : '—'}</dd>
                  </div>
                ))}
              </dl>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function Center({ children, state }: { children: React.ReactNode; state: CharacterState }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-8 text-center">
      <Character state={state} size={160} />
      <p className="max-w-[26ch] font-display text-[32px]">{children}</p>
    </div>
  )
}
