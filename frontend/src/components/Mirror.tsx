import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import PoseIcon, { POSE_INFO, type Pose } from './PoseIcon'
import { Button } from './ui'

/** Downscale to ≤1024 px on the long edge and encode JPEG. Draws un-mirrored (canonical orientation). */
export function toJpeg(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const scale = Math.min(1, 1024 / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale)
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.85))
}

/**
 * The customer mirror, guided for one pose at a time. Live preview is CSS-mirrored for familiarity; captures are
 * stored un-mirrored. A 3-2-1 countdown lets the customer hold the pose. Without a secure context or camera
 * permission it falls back to the native camera via <input capture> (works over plain HTTP on phones).
 * `pose` is undefined in checkpoint mode (no guide, plain capture).
 */
export default function Mirror({ onCapture, busy, pose }: { onCapture: (b: Blob) => Promise<void> | void; busy?: boolean; pose?: Pose }) {
  const video = useRef<HTMLVideoElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'starting' | 'live' | 'fallback'>('starting')
  const [note, setNote] = useState<string | null>(null)
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setState('fallback'); setNote('Live preview needs HTTPS. Gamitin ang camera button sa ibaba.')
      return
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1600 } }, audio: false })
      .then(s => {
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return }
        stream = s
        if (video.current) { video.current.srcObject = s; setState('live') }
      })
      .catch(() => { setState('fallback'); setNote('Naka-off ang camera access. Mag-upload o kumuha ng photo sa ibaba.') })
    return () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()) }
  }, [])

  async function captureLive() {
    for (const n of [3, 2, 1]) { setCount(n); await new Promise(r => setTimeout(r, 700)) }
    setCount(null)
    const v = video.current
    if (!v || !v.videoWidth) return
    await onCapture(await toJpeg(v, v.videoWidth, v.videoHeight))
  }

  async function captureFile(file: File) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    await onCapture(await toJpeg(bmp, bmp.width, bmp.height))
  }

  const info = pose ? POSE_INFO[pose] : null
  return (
    <div className="mirror-shell flex h-full min-h-0 flex-col gap-3">
      <div className="relative mx-auto min-h-24 w-full flex-1 overflow-hidden rounded-[var(--radius-mirror)] bg-subtle shadow-[var(--shadow-lift)] ring-8 ring-surface">
        <video ref={video} autoPlay playsInline muted
          className={`h-full w-full -scale-x-100 object-cover ${state === 'live' ? '' : 'hidden'}`} />
        {state !== 'live' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-ink-2">
            {pose && <PoseIcon pose={pose} size={120} />}
            <p>{state === 'starting' ? 'Binubuksan ang camera…' : note}</p>
          </div>
        )}
        {state === 'live' && pose && (
          <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center opacity-30 mix-blend-multiply">
            <PoseIcon pose={pose} size={260} mirrored />
          </div>
        )}
        <AnimatePresence>
          {count !== null && (
            <motion.span key={count} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 grid place-items-center font-display text-[120px] text-on-action [text-shadow:0_2px_24px_rgb(0_0_0/.45)]">{count}</motion.span>
          )}
        </AnimatePresence>
        {info && (
          <p className="absolute inset-x-0 bottom-0 bg-ink/55 px-4 py-2 text-center text-[14px] text-on-action">
            <span className="font-semibold">{info.label}</span> · {info.hint}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-center gap-2">
        {state === 'live'
          ? <Button variant="primary" className="min-h-12 rounded-full px-6" disabled={busy || count !== null} onClick={captureLive}><Icon name="camera" size={18} /> {info ? `Kunan: ${info.label}` : 'Kunan ng photo'}</Button>
          : <Button variant="primary" className="min-h-12 rounded-full px-6" disabled={busy} onClick={() => fileInput.current?.click()}><Icon name="camera" size={18} /> {info ? `Kumuha: ${info.label}` : 'Kumuha ng photo'}</Button>}
        <input ref={fileInput} type="file" accept="image/*" capture="user" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) captureFile(f); e.target.value = '' }} />
      </div>
    </div>
  )
}
