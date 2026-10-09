import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { api, ApiError, type Consultation, type Health } from '../api'
import { navigate } from '../App'
import Character from '../components/Character'
import { ErrorLine, Header, Pill } from '../components/ui'

const today = () => new Date().toLocaleDateString('fil-PH', { weekday: 'long', month: 'long', day: 'numeric' })

function Readiness({ health, failed }: { health: Health | null; failed: boolean }) {
  if (failed) return <Pill tone="error">⚠ Hindi maabot ang GupAi server sa laptop</Pill>
  if (!health) return <Pill>Sinusuri ang local models…</Pill>
  const missing = [
    !health.ollama && 'Ollama',
    !health.vision_model && 'vision model',
    !health.whisper && 'speech model',
    !health.face_landmarker && 'face model',
  ].filter(Boolean)
  return missing.length === 0
    ? <Pill tone="ok">Local AI handa<span className="hidden sm:inline"> · {health.vision_model}</span> · walang internet</Pill>
    : <Pill tone="error">⚠ Hindi pa handa: {missing.join(', ')}. Gumagana pa rin ang pag-type.</Pill>
}

function ActionCard({ title, body, onClick, primary, disabled }: { title: string; body: string; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <motion.button onClick={onClick} disabled={disabled} whileTap={{ scale: 0.98 }}
      className={`group flex w-full items-center justify-between gap-4 rounded-[var(--radius-sheet)] p-5 text-left transition-shadow duration-200 disabled:opacity-50 sm:p-6 ${
        primary ? 'bg-action text-on-action shadow-[0_14px_34px_-14px_rgb(38_60_48/.6)]' : 'bg-surface text-ink shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-lift)]'}`}>
      <span>
        <span className="block text-lg font-semibold">{title}</span>
        <span className={`mt-0.5 block text-[15px] ${primary ? 'text-on-action/85' : 'text-ink-2'}`}>{body}</span>
      </span>
      <span aria-hidden className={`grid size-11 shrink-0 place-items-center rounded-full text-xl transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-1 ${primary ? 'bg-white/15' : 'bg-subtle'}`}>→</span>
    </motion.button>
  )
}

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null)
  const [healthFailed, setHealthFailed] = useState(false)
  const [active, setActive] = useState<Consultation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notBarber, setNotBarber] = useState(false)

  useEffect(() => {
    api.health().then(setHealth, () => setHealthFailed(true))
    // Barber screens only work on the laptop itself; a phone gets 403 here and sees join instructions instead.
    api.activeConsultation().then(setActive, e => { if (e instanceof ApiError && e.status === 403) setNotBarber(true) })
  }, [])

  async function startTemporary() {
    setBusy(true); setError(null)
    try { navigate(`/consult/${(await api.createConsultation()).id}`) }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Hindi nakapagsimula.'); setBusy(false) }
  }

  if (notBarber) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <Character state="idle" size={180} />
        <h1 className="font-display text-[44px]">Para sa customer ang phone na ito</h1>
        <p className="max-w-[32ch] text-lg text-ink-2">I-scan ang QR code na ipapakita ng barbero sa laptop para makasali sa konsulta.</p>
      </main>
    )
  }

  return (
    <div className="min-h-dvh">
      <Header right={<Readiness health={health} failed={healthFailed} />} />
      <main className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-10 px-4 pb-16 pt-6 sm:px-8 lg:min-h-[calc(100dvh-80px)] lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <section className="flex min-w-0 flex-col items-center text-center lg:items-start lg:text-left">
          <div className="relative mb-4 lg:-ml-6">
            <div aria-hidden className="absolute inset-x-6 bottom-2 h-6 rounded-[50%] bg-ink/10 blur-md" />
            <Character state="idle" size={240} />
          </div>
          <p className="fade-up text-[15px] font-medium capitalize text-action">{today()}</p>
          <h1 className="fade-up mt-2 font-display text-[clamp(2.75rem,5.5vw,4.75rem)] [animation-delay:60ms]">
            Para bago gumupit, nagkaintindihan muna.
          </h1>
          <p className="fade-up mt-4 max-w-[44ch] text-lg text-ink-2 [animation-delay:120ms]">
            Magkasundo ang barbero at customer sa gupit bago ang unang gupit, gamit ang AI na tumatakbo sa laptop na ito.
          </p>
        </section>

        <section className="min-w-0 space-y-3">
          {active && (
            <ActionCard primary title={`Ituloy: ${active.customer?.display_name ?? 'temporary session'}`} body="May konsultang nakabukas pa" onClick={() => navigate(`/consult/${active.id}`)} />
          )}
          <ActionCard primary={!active} title="Customer: bago o suki" body="Hanapin ang suki o mag-save ng bagong customer" onClick={() => navigate('/customers')} />
          <ActionCard title="Temporary na konsulta" body="Walang ise-save. Buburahin ang photos pagkatapos." disabled={busy} onClick={startTemporary} />
          <ErrorLine message={error} />
        </section>
      </main>
    </div>
  )
}
