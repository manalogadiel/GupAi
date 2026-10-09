import type { FaceShapeResult } from '../api'

const SHAPE_TL: Record<string, string> = {
  oval: 'oval', round: 'round (bilugan)', square: 'square (kuwadrado)', oblong: 'oblong (pahaba)', heart: 'heart (puso)', diamond: 'diamond',
}
export const shapeLabel = (s: string) => SHAPE_TL[s] ?? s

/** A captured photo, shown whole (object-contain), with the face-oval outline from the faceshape job. */
export default function Photo({ src, label, face }: { src: string; label: string; face?: FaceShapeResult | null }) {
  const outline = face?.face_found ? face.outline : null
  return (
    <figure className="space-y-2">
      <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-[var(--radius-sheet)] bg-subtle shadow-[var(--shadow-card)]">
        <img src={src} alt={`${label} photo of the customer`} className="block h-auto max-h-[42dvh] w-auto max-w-full" />
        {outline && outline.length > 2 && (
          <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
            <polygon pathLength={1} className="draw-on" points={outline.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none" stroke="#FFFDFA" strokeWidth="0.006" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: 3, filter: 'drop-shadow(0 0 1px rgba(37,40,33,.8))' }} />
          </svg>
        )}
      </div>
      <figcaption className="text-[14px] text-ink-2">
        {label}
        {face && face.face_found && face.suggested.length > 0 && (
          <> · Mukhang {face.suggested.map(shapeLabel).join(' o ')} <span className="whitespace-nowrap">· tantiya lang</span></>
        )}
        {face && !face.face_found && <> · Hindi makita nang malinaw ang mukha. Pumili ng hugis sa ibaba.</>}
      </figcaption>
    </figure>
  )
}
