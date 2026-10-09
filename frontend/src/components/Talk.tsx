import { useEffect, useRef, useState } from 'react'
import type { Speaker } from '../api'
import MicButton from './MicButton'
import { Button, Segmented } from './ui'

const MAX_S = 30

/**
 * Voice + typing dock. Voice: tap to record (≤30 s) → local transcription → editable transcript → Send.
 * Typing always works; the mic is optional and never listens unless the Talk button was pressed.
 */
export default function Talk({ speakerLocked, onSend, onAudio, transcript, busy, placeholder, onRecordingChange, micSize = 76 }: {
  speakerLocked?: Speaker
  onSend: (text: string, speaker: Speaker, inputType: 'typed' | 'voice') => Promise<void> | void
  onAudio?: (clip: Blob) => Promise<void> | void
  transcript?: string | null
  busy?: boolean
  placeholder?: string
  onRecordingChange?: (recording: boolean) => void
  micSize?: number
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
  useEffect(() => { onRecordingChange?.(recording) }, [recording, onRecordingChange])

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
        <Segmented id="speaker" label="Sino ang nagsasalita" value={speaker} onChange={setSpeaker}
          options={[{ value: 'customer', label: 'Customer' }, { value: 'barber', label: 'Barbero' }]} />
      )}

      <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); send() }}>
        <div className="flex min-h-14 flex-1 items-center gap-2 rounded-full bg-subtle py-1.5 pl-5 pr-1.5">
          <label className="sr-only" htmlFor="talk-input">Sabihin o i-type</label>
          {recording ? (
            <p className="flex-1 text-[15px] text-ink" aria-live="polite">
              <span aria-hidden className="mr-2 inline-block size-2.5 rounded-full bg-voice align-middle" />
              Nakikinig… <span className="tabular-nums text-ink-2">{MAX_S - seconds}s</span>
            </p>
          ) : (
            <textarea id="talk-input" rows={1} value={text} onChange={e => setText(e.target.value)} maxLength={500}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={placeholder ?? 'Hal. “Maikli sa gilid pero huwag galawin ang fringe”'}
              className="max-h-28 min-h-8 flex-1 resize-none bg-transparent py-1 leading-snug outline-none placeholder:text-ink-2" />
          )}
          {recording ? (
            <Button type="button" variant="quiet" className="min-h-11 rounded-full px-4" onClick={() => stop(true)}>Discard</Button>
          ) : (
            <Button type="submit" variant={text.trim() ? 'primary' : 'quiet'} className="min-h-11 rounded-full px-5" disabled={busy || !text.trim()}>Send</Button>
          )}
        </div>
        {canRecord && (
          <MicButton recording={recording} level={level} size={micSize} disabled={busy && !recording}
            label={recording ? 'Itigil at isalin ang recording' : 'Magsalita (record)'} onPress={() => (recording ? stop(false) : start())} />
        )}
      </form>
      {fromVoice && text && <p className="fade-up text-[14px] text-ink-2">Galing sa boses. I-edit kung may mali bago i-send.</p>}
      {micError && <p className="text-[14px] text-error">{micError}</p>}
    </div>
  )
}
