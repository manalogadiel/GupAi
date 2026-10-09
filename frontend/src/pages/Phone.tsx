import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import Character from '../components/Character'
import { BarberPanel, Scene, STEPS } from '../components/Scenes'
import Talk from '../components/Talk'
import { flow } from '../flow'
import { useConsultation } from '../useConsultation'

/** The customer's phone: one frame per step. Kuya Pal on top, the step in the middle, the voice dock at the bottom. */
export default function Phone() {
  const id = new URLSearchParams(location.search).get('c')
  const h = useConsultation(id)
  const { c } = h
  const [recording, setRecording] = useState(false)

  if (h.ended) return <Center>Salamat! Tapos na ang konsultang ito. I-scan ang bagong QR para sa susunod na visit.</Center>
  if (!id) return <Center>I-scan ang QR code sa laptop ng barbero para magsimula.</Center>
  if (!c) return <Center>{h.offline ? 'Hindi maabot ang laptop. Nasa shop Wi-Fi ka ba?' : h.error ?? 'Kumokonekta sa laptop…'}</Center>
  if (c.status !== 'active') return <Center>Salamat sa pagpunta! Tapos na ang konsultang ito.</Center>

  const f = flow(c.id, h)
  const at = Math.max(0, STEPS.findIndex(s => s.stage === c.stage))
  const showDock = c.stage === 'goal' || c.stage === 'sides' || c.stage === 'top'

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col gap-2 overflow-hidden px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <span className="font-display text-[24px] leading-none">Gup<span className="text-voice">.</span>Ai</span>
        <span aria-label={`Step ${at + 1} ng ${STEPS.length}`} className="flex gap-1">
          {STEPS.map((s, i) => <span key={s.stage} className={`h-1.5 rounded-full transition-all duration-300 ${i === at ? 'w-6 bg-action' : i < at ? 'w-1.5 bg-action/60' : 'w-1.5 bg-boundary/40'}`} />)}
        </span>
      </header>
      <BarberPanel c={c} f={f} h={h} role="customer" compact recording={recording} onRecording={setRecording} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={c.stage} className="min-h-0 flex-1 overflow-hidden"
          initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}>
          <Scene c={c} f={f} h={h} role="customer" compact onComplete={async () => {}} />
        </motion.div>
      </AnimatePresence>
      {showDock && (
        <Talk speakerLocked="customer" onSend={f.say} onAudio={f.audio} transcript={h.results.transcribe?.text} transcriptId={h.results.transcribe?.job_id}
          busy={!!h.runningJob} placeholder="Sabihin o i-type…" onRecordingChange={setRecording} micSize={60} />
      )}
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-8 text-center">
      <Character state="idle" size={160} />
      <p className="max-w-[26ch] font-display text-[32px]">{children}</p>
    </div>
  )
}
