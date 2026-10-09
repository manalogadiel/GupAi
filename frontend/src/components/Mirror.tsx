import { useEffect, useRef, useState } from 'react'
import { Button, Segmented } from './ui'

type View = 'front' | 'side'

/** Downscale to ≤1024 px on the long edge and encode JPEG. Draws un-mirrored (canonical orientation). */
function toJpeg(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const scale = Math.min(1, 1024 / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale)
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.85))
}

/**
 * The customer mirror. Live preview is CSS-mirrored for familiarity; captures are stored un-mirrored.
 * Without a secure context or camera permission it falls back to the native camera via <input capture>,
 * which works over plain HTTP on phones.
 */
export default function Mirror({ onCapture, busy }: { onCapture: (b: Blob, view: View) => Promise<void> | void; busy?: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<View>('front')
  const [state, setState] = useState<'starting' | 'live' | 'fallback'>('starting')
  const [note, setNote] = useState<string | null>(null)

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
    const v = video.current
    if (!v || !v.videoWidth) return
    await onCapture(await toJpeg(v, v.videoWidth, v.videoHeight), view)
  }

  async function captureFile(file: File) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    await onCapture(await toJpeg(bmp, bmp.width, bmp.height), view)
  }

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-[4/5] max-h-[56dvh] w-full overflow-hidden rounded-[var(--radius-mirror)] bg-subtle shadow-[var(--shadow-lift)] ring-8 ring-surface">
        <video ref={video} autoPlay playsInline muted
          className={`h-full w-full -scale-x-100 object-cover ${state === 'live' ? '' : 'hidden'}`} />
        {state !== 'live' && (
          <div className="flex h-full items-center justify-center p-8 text-center text-ink-2">
            {state === 'starting' ? 'Binubuksan ang camera…' : note}
          </div>
        )}
        {state === 'live' && (
          <p className="absolute inset-x-0 bottom-0 bg-ink/55 px-4 py-2 text-center text-[14px] text-on-action">
            {view === 'front' ? 'Harap · itaas ang buhok sa noo kung kaya, level ang mukha' : 'Gilid · ipakita ang tenga at likod ng ulo'}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented id="view" label="Photo view" value={view} onChange={setView}
          options={[{ value: 'front', label: 'Harap' }, { value: 'side', label: 'Gilid' }]} />
        {state === 'live'
          ? <Button variant="primary" className="rounded-full" disabled={busy} onClick={captureLive}>📸 Kunan ng photo</Button>
          : <Button variant="primary" className="rounded-full" disabled={busy} onClick={() => fileInput.current?.click()}>📸 Kumuha ng photo</Button>}
        <input ref={fileInput} type="file" accept="image/*" capture="user" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) captureFile(f); e.target.value = '' }} />
      </div>
    </div>
  )
}
