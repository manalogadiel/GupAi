import { useEffect, useRef, useState } from 'react'
import type { Speaker } from '../api'
import { Button } from './ui'

const MAX_S = 30

/**
 * Voice + typing dock. Voice: tap to record (≤30 s) → local transcription → editable transcript → Send.
 * Typing always works; the mic is optional and never listens unless the Talk button was pressed.
 */
export default function Talk({ speakerLocked, onSend, onAudio, transcript, busy, placeholder }: {
  speakerLocked?: Speaker
  onSend: (text: string, speaker: Speaker, inputType: 'typed' | 'voice') => Promise<void> | void
  onAudio?: (clip: Blob) => Promise<void> | void
  transcript?: string | null
  busy?: boolean
  placeholder?: string
}) {
  const [speaker, setSpeaker] = useState<Speaker>(speakerLocked ?? 'customer')
  const [text, setText] = useState('')
  const [fromVoice, setFromVoice] = useState(false)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [micError, setMicError] = useState<string | null>(null)
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; ctx: AudioContext; timer: number; raf: number } | null>(null)

  // A finished transcription lands in the box for review; it is never sent automatically.
  useEffect(() => { if (transcript) { setText(transcript); setFromVoice(true) } }, [transcript])
  useEffect(() => () => stop(true), []) // eslint-disable-line react-hooks/exhaustive-deps

  const canRecord = !!onAudio && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

  async function start() {
    setMicError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      const chunks: Blob[] = []
      mr.ondataavailable = e => chunks.push(e.data)
      mr.onstop = () => {
        const discard = (mr as unknown as { discard?: boolean }).discard
        if (!discard && chunks.length) onAudio?.(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }))
      }
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser(); analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteTimeDomainData(buf)
        let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
        setLevel(Math.min(1, peak / 64))
        if (rec.current) rec.current.raf = requestAnimationFrame(tick)
      }
      const started = Date.now()
      const timer = window.setInterval(() => {
        const s = Math.floor((Date.now() - started) / 1000); setSeconds(s)
        if (s >= MAX_S) stop(false)
      }, 250)
      rec.current = { mr, stream, ctx, timer, raf: requestAnimationFrame(tick) }
      mr.start(); setRecording(true); setSeconds(0)
    } catch {
      setMicError('Naka-off ang mikropono. Mag-type na lang.')
    }
  }

  function stop(discard: boolean) {
    const r = rec.current
    if (!r) return
    rec.current = null
    ;(r.mr as unknown as { discard?: boolean }).discard = discard
    clearInterval(r.timer); cancelAnimationFrame(r.raf)
    if (r.mr.state !== 'inactive') r.mr.stop()
    r.stream.getTracks().forEach(t => t.stop()); r.ctx.close()
    setRecording(false); setLevel(0)
  }

  async function send() {
    const t = text.trim()
    if (!t) return
    await onSend(t, speaker, fromVoice ? 'voice' : 'typed')
    setText(''); setFromVoice(false)
  }

  return (
    <div className="space-y-3">
      {!speakerLocked && (
        <div role="radiogroup" aria-label="Sino ang nagsasalita" className="inline-flex rounded-[var(--radius-control)] border border-boundary p-1">
          {(['customer', 'barber'] as Speaker[]).map(s => (
            <button key={s} role="radio" aria-checked={speaker === s} onClick={() => setSpeaker(s)}
              className={`min-h-10 rounded-[8px] px-4 text-[15px] ${speaker === s ? 'bg-action text-on-action' : 'text-ink'}`}>
              {s === 'customer' ? 'Customer' : 'Barbero'}
            </button>
          ))}
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-3 rounded-[var(--radius-control)] bg-subtle px-4 py-3">
          <span aria-hidden className="h-3 w-3 rounded-full bg-error" />
          <div aria-hidden className="h-2 flex-1 overflow-hidden rounded-full bg-separator">
            <div className="h-full bg-action transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <span className="tabular-nums text-[15px]" aria-live="off">{MAX_S - seconds}s</span>
          <Button variant="primary" className="min-h-11" onClick={() => stop(false)}>Stop</Button>
          <Button variant="quiet" className="min-h-11" onClick={() => stop(true)}>Discard</Button>
        </div>
      ) : (
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); send() }}>
          <label className="sr-only" htmlFor="talk-input">Sabihin o i-type</label>
          <textarea id="talk-input" rows={2} value={text} onChange={e => setText(e.target.value)} maxLength={500}
            placeholder={placeholder ?? 'Hal. “Maikli sa gilid pero huwag galawin ang fringe”'}
            className="min-h-12 flex-1 resize-none rounded-[var(--radius-control)] border border-boundary bg-surface px-3 py-2" />
          <div className="flex flex-col gap-2">
            {canRecord && <Button type="button" variant={text ? 'secondary' : 'primary'} disabled={busy} onClick={start} aria-label="Magsalita (record)">🎙 Talk</Button>}
            <Button type="submit" variant={text ? 'primary' : 'secondary'} disabled={busy || !text.trim()}>Send</Button>
          </div>
        </form>
      )}
      {fromVoice && text && <p className="text-[14px] text-ink-2">Galing sa boses. I-edit kung may mali bago i-send.</p>}
      {micError && <p className="text-[14px] text-error">{micError}</p>}
    </div>
  )
}
