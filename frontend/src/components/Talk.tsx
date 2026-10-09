import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import MicButton from './MicButton'
import { Button } from './ui'

const MAX_MS = 30_000
const START_MS = 150      // sustained voice before a hands-free clip starts
const SILENCE_MS = 1200   // dead air that ends a clip
const MIN_CLIP_MS = 600   // ignore coughs and clicks

type Phase = 'idle' | 'listening' | 'recording' | 'sending'

/**
 * Voice + typing dock.
 * - Tap the mic: record, tap again (or stay silent) → transcribed locally and sent, no extra Send.
 * - Hands-free: the mic stays open; speaking starts a clip, dead air ends it and sends it.
 *   Listening pauses while Kuya Gup is answering, so he never records the room mid-reply.
 */
export default function Talk({ onSend, onVoice, onAttach, busy, placeholder, onRecordingChange, micSize = 64, stacked = false }: {
  stacked?: boolean
  onAttach?: (file: File) => void
  onSend: (text: string) => Promise<boolean | void> | void
  onVoice?: (clip: Blob) => Promise<boolean | void>
  busy?: boolean
  placeholder?: string
  onRecordingChange?: (recording: boolean) => void
  micSize?: number
}) {
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [handsFree, setHandsFree] = useState(false)
  const [level, setLevel] = useState(0)
  const [micError, setMicError] = useState<string | null>(null)
  const mic = useRef<{ stream: MediaStream; ctx: AudioContext; analyser: AnalyserNode; raf: number } | null>(null)
  const clip = useRef<{ mr: MediaRecorder; chunks: Blob[]; started: number; quietSince: number | null; discard: boolean } | null>(null)
  const vad = useRef({ loudSince: null as number | null, floor: 0.01 })
  const state = useRef({ handsFree, busy: !!busy, phase })
  state.current = { handsFree, busy: !!busy, phase }

  useEffect(() => { onRecordingChange?.(phase === 'recording') }, [phase, onRecordingChange])
  useEffect(() => () => closeMic(), []) // eslint-disable-line react-hooks/exhaustive-deps
  // Re-arm hands-free once Kuya Gup has finished answering.
  useEffect(() => { if (!busy && handsFree && phase === 'sending') setPhase('listening') }, [busy, handsFree, phase])

  const canRecord = !!onVoice && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

  async function openMic() {
    if (mic.current) return true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser(); analyser.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(analyser)
      mic.current = { stream, ctx, analyser, raf: requestAnimationFrame(loop) }
      return true
    } catch {
      setMicError('Naka-off ang mikropono. Payagan ito sa browser, o mag-type na lang.')
      return false
    }
  }

  function closeMic() {
    const m = mic.current
    if (!m) return
    mic.current = null
    cancelAnimationFrame(m.raf)
    if (clip.current) { clip.current.discard = true; stopClip() }
    m.stream.getTracks().forEach(t => t.stop()); void m.ctx.close()
    setLevel(0)
  }

  function rms() {
    const m = mic.current!
    const buf = new Float32Array(m.analyser.fftSize)
    m.analyser.getFloatTimeDomainData(buf)
    let sum = 0; for (const v of buf) sum += v * v
    return Math.sqrt(sum / buf.length)
  }

  function loop() {
    const m = mic.current
    if (!m) return
    const now = performance.now()
    const r = rms()
    const v = vad.current
    const threshold = Math.max(0.02, v.floor * 3)
    const loud = r > threshold
    setLevel(Math.min(1, r / 0.15))
    const c = clip.current
    if (c) {
      if (loud) c.quietSince = null
      else c.quietSince ??= now
      const silent = c.quietSince !== null && now - c.quietSince > SILENCE_MS
      if (now - c.started > MAX_MS || (silent && (state.current.handsFree || now - c.started > 4000))) stopClip()
    } else if (state.current.handsFree && !state.current.busy && state.current.phase === 'listening') {
      if (!loud) { v.floor = v.floor * 0.95 + r * 0.05; v.loudSince = null }
      else if ((v.loudSince ??= now) && now - v.loudSince > START_MS) { v.loudSince = null; startClip() }
    }
    m.raf = requestAnimationFrame(loop)
  }

  function startClip() {
    const m = mic.current
    if (!m || clip.current) return
    const mr = new MediaRecorder(m.stream)
    const c = { mr, chunks: [] as Blob[], started: performance.now(), quietSince: null, discard: false }
    mr.ondataavailable = e => { if (e.data.size) c.chunks.push(e.data) }
    mr.onstop = async () => {
      const long = performance.now() - c.started > MIN_CLIP_MS
      if (c.discard || !long || !c.chunks.length) { setPhase(state.current.handsFree ? 'listening' : 'idle'); return }
      setPhase('sending')
      const ok = await onVoice?.(new Blob(c.chunks, { type: mr.mimeType || 'audio/webm' }))
      if (!ok) setMicError('Walang malinaw na boses. Ulitin, o mag-type.')
      if (!state.current.handsFree) { setPhase('idle'); closeMic() }
    }
    clip.current = c
    mr.start()
    setMicError(null)
    setPhase('recording')
  }

  function stopClip() {
    const c = clip.current
    if (!c) return
    clip.current = null
    if (c.mr.state !== 'inactive') c.mr.stop()
  }

  async function tapMic() {
    if (phase === 'recording') return stopClip()
    if (handsFree) return
    if (await openMic()) startClip()
  }

  async function toggleHandsFree() {
    if (handsFree) { setHandsFree(false); setPhase('idle'); closeMic(); return }
    if (await openMic()) { setHandsFree(true); setPhase('listening') }
  }

  async function send() {
    const t = text.trim()
    if (!t || busy) return  // one turn at a time: Enter must not queue a second reply
    setText('')
    const sent = await onSend(t)
    if (sent === false) setText(t)
  }

  const status = phase === 'recording' ? 'Nagre-record… tumigil lang sa pagsasalita para i-send'
    : phase === 'sending' ? (busy ? 'Sumasagot si Kuya Gup…' : 'Isinasalin ang boses…')
    : phase === 'listening' ? (busy ? 'Hinihintay matapos si Kuya Gup…' : 'Nakikinig… magsalita lang')
    : null

  return (
    <div className="space-y-2">
      <form className={`flex items-center gap-2 ${stacked ? 'flex-wrap justify-end' : ''}`} onSubmit={e => { e.preventDefault(); send() }}>
        <div className={`flex min-h-14 flex-1 items-center gap-2 rounded-full ${stacked ? 'basis-full' : ''} bg-surface py-1.5 pl-5 pr-1.5 shadow-[var(--shadow-card)]`}>
          <label className="sr-only" htmlFor="talk-input">Sabihin o i-type</label>
          {onAttach && !status && (
            <label htmlFor="talk-attach" title="Mag-attach ng reference photo"
              className={`-ml-2 grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-subtle hover:text-ink ${busy ? 'pointer-events-none opacity-45' : 'cursor-pointer'}`}>
              <Icon name="image" size={20} />
              <span className="sr-only">Mag-attach ng reference photo</span>
              <input id="talk-attach" type="file" accept="image/*" hidden disabled={busy}
                onChange={e => { const f = e.target.files?.[0]; if (f) onAttach(f); e.target.value = '' }} />
            </label>
          )}
          {status ? (
            <p className="flex flex-1 items-center gap-2 text-[15px]" aria-live="polite">
              <span aria-hidden className={`inline-block size-2.5 rounded-full ${phase === 'recording' ? 'bg-voice animate-pulse' : 'bg-action'}`} />
              {status}
            </p>
          ) : (
            <textarea id="talk-input" rows={1} value={text} onChange={e => setText(e.target.value)} maxLength={500}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={placeholder ?? 'I-type ang sagot mo…'}
              className="max-h-28 min-h-8 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1 leading-snug outline-none [field-sizing:content] [scrollbar-width:none] placeholder:text-ink-2" />
          )}
          {phase === 'recording' && !handsFree ? (
            <Button type="button" variant="quiet" className="min-h-11 rounded-full px-4" onClick={() => { if (clip.current) clip.current.discard = true; stopClip(); closeMic(); setPhase('idle') }}>Burahin</Button>
          ) : !status && (
            <Button type="submit" variant={text.trim() ? 'primary' : 'quiet'} className="min-h-11 rounded-full px-4" disabled={busy || !text.trim()} aria-label="I-send">
              <Icon name="send" size={18} />
            </Button>
          )}
        </div>
        {canRecord && (
          <>
            <MicButton recording={phase === 'recording'} level={level} size={micSize} disabled={handsFree || (busy && phase !== 'recording')}
              label={phase === 'recording' ? 'Itigil at i-send' : 'Magsalita'} onPress={tapMic} />
            <button type="button" onClick={toggleHandsFree} aria-pressed={handsFree}
              className={`flex min-h-12 flex-col items-center justify-center rounded-2xl px-2.5 text-[11px] font-semibold leading-tight transition-colors ${handsFree ? 'bg-voice text-white' : 'bg-surface text-ink shadow-[var(--shadow-card)] hover:bg-subtle'}`}>
              <Icon name="handsfree" size={20} />
              <span>{handsFree ? 'Naka-on' : 'Hands-free'}</span>
            </button>
          </>
        )}
      </form>
      {micError && <p className="text-[14px] text-error">{micError}</p>}
    </div>
  )
}
