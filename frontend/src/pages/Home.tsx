import { useEffect, useState } from 'react'
import { api, ApiError, type Consultation, type Health } from '../api'
import { navigate } from '../App'
import { Button, ErrorLine, Header } from '../components/ui'
import Mascot from '../components/Mascot'

function Readiness({ health, failed }: { health: Health | null; failed: boolean }) {
  if (failed) return <p className="text-[15px] text-error">⚠ Hindi maabot ang GupAi server sa laptop.</p>
  if (!health) return <p className="text-[15px] text-ink-2">Checking local models…</p>
  const missing = [
    !health.ollama && 'Ollama',
    !health.vision_model && 'vision model',
    !health.whisper && 'speech model',
    !health.face_landmarker && 'face model',
  ].filter(Boolean)
  return missing.length === 0 ? (
    <p className="text-[15px] text-ink-2"><span className="text-action">●</span> Models ready on this laptop · {health.vision_model} · no internet needed</p>
  ) : (
    <p className="text-[15px] text-error">⚠ Not ready: {missing.join(', ')}. Typing and notes still work.</p>
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

  if (notBarber) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-8 text-center">
        <Mascot size={72} />
        <h1 className="text-2xl font-semibold">Para sa customer ang phone na ito</h1>
        <p className="max-w-[34ch] text-lg text-ink-2">
          I-scan ang QR code na ipapakita ng barbero sa laptop para makasali sa konsulta.
        </p>
        <p className="max-w-[34ch] text-[14px] text-ink-2">Ang listahan ng customers ay makikita lang sa laptop ng barbero.</p>
      </div>
    )
  }

  async function startTemporary() {
    setBusy(true); setError(null)
    try { navigate(`/consult/${(await api.createConsultation()).id}`) }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Hindi nakapagsimula.'); setBusy(false) }
  }

  return (
    <div className="min-h-dvh">
      <Header />
      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-8 md:grid-cols-[1fr_1fr] md:items-center md:py-20">
        <div className="space-y-6">
          <Mascot size={80} />
          <h1 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
            Para bago gumupit, nagkaintindihan muna.
          </h1>
          <p className="max-w-[46ch] text-lg text-ink-2">
            Agree on the haircut before the first cut, with AI that runs on this laptop.
          </p>
          <Readiness health={health} failed={healthFailed} />
        </div>

        <div className="space-y-3">
          {active && (
            <Button variant="primary" className="w-full justify-between text-lg" onClick={() => navigate(`/consult/${active.id}`)}>
              <span>Ituloy: {active.customer?.display_name ?? 'temporary session'}</span><span aria-hidden>→</span>
            </Button>
          )}
          <Button variant={active ? 'secondary' : 'primary'} className="w-full justify-between text-lg" onClick={() => navigate('/customers')}>
            <span>Customer: bago o suki</span><span aria-hidden>→</span>
          </Button>
          <Button className="w-full justify-between text-lg" disabled={busy} onClick={startTemporary}>
            <span>Temporary consultation</span><span aria-hidden>→</span>
          </Button>
          <p className="pt-1 text-[14px] text-ink-2">Temporary consultations save nothing. To remember a haircut for next time, start from a customer's name.</p>
          <ErrorLine message={error} />
        </div>
      </main>
    </div>
  )
}
