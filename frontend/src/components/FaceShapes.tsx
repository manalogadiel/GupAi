import { motion } from 'motion/react'
import type { Consultation, FaceShape } from '../api'

/** Face outlines on a 100x120 grid, drawn to show each shape's defining proportion. */
const OUTLINE: Record<FaceShape, string> = {
  oval: 'M50 10C73 10 84 30 84 54c0 30-15 56-34 56S16 84 16 54C16 30 27 10 50 10Z',
  round: 'M50 16c24 0 38 18 38 44 0 28-17 46-38 46S12 88 12 60c0-26 14-44 38-44Z',
  square: 'M20 22c4-8 16-12 30-12s26 4 30 12c3 10 3 26 3 40 0 22-4 34-12 40-6 5-14 8-21 8s-15-3-21-8c-8-6-12-18-12-40 0-14 0-30 3-40Z',
  oblong: 'M50 6c18 0 28 12 28 30v40c0 22-12 38-28 38S22 98 22 76V36C22 18 32 6 50 6Z',
  heart: 'M14 34c0-16 16-24 36-24s36 8 36 24c0 26-18 54-36 74C32 88 14 60 14 34Z',
  diamond: 'M50 8c10 0 18 14 26 30 6 10 10 18 10 24s-6 18-14 30c-8 12-15 18-22 18s-14-6-22-18C20 80 14 68 14 62s4-14 10-24C32 22 40 8 50 8Z',
}
/** Guides that make the proportion readable: what makes this shape this shape. */
const GUIDE: Record<FaceShape, string> = {
  oval: 'M24 54h52M50 14v92',
  round: 'M14 60h72M50 18v86',
  square: 'M20 30h60M22 96h56',
  oblong: 'M24 60h52M50 8v104',
  heart: 'M16 34h68M44 100h12',
  diamond: 'M28 36h44M14 62h72M34 98h32',
}
export const SHAPE_INFO: Record<FaceShape, { name: string; trait: string }> = {
  oval: { name: 'Oval', trait: 'Balanse ang haba at lapad' },
  round: { name: 'Bilog', trait: 'Halos pantay ang lapad at haba, malambot ang panga' },
  square: { name: 'Kuwadrado', trait: 'Malapad at tuwid ang panga at noo' },
  oblong: { name: 'Pahaba', trait: 'Mas mahaba kaysa malapad' },
  heart: { name: 'Puso', trait: 'Malapad ang noo, patulis ang baba' },
  diamond: { name: 'Diamond', trait: 'Malapad ang pisngi, makitid ang noo at baba' },
}
export const FACE_SHAPES = Object.keys(OUTLINE) as FaceShape[]

export function FaceShapeIcon({ shape, size = 56, active = false }: { shape: FaceShape; size?: number; active?: boolean }) {
  return (
    <svg viewBox="0 0 100 120" width={size} height={size * 1.2} aria-hidden className="overflow-visible">
      <path d={GUIDE[shape]} fill="none" stroke={active ? 'var(--color-on-action)' : 'var(--color-boundary)'} strokeOpacity=".45" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" />
      <path d={OUTLINE[shape]} fill={active ? 'rgb(255 255 255 / .14)' : 'var(--color-peach)'} stroke={active ? 'var(--color-on-action)' : 'var(--color-ink)'} strokeWidth="3.5" strokeLinejoin="round" />
    </svg>
  )
}

/** A quiet segmented row: outline + name. The AI estimate is a line of text, not a badge. */
export function FaceShapePicker({ c, onPick, disabled }: { c: Consultation; onPick: (s: FaceShape) => void; disabled?: boolean }) {
  const fs = c.state.face_shape
  const shown = fs?.confirmed ?? fs?.suggested?.[0]
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Hugis ng mukha" className="grid grid-cols-6 gap-1 rounded-[18px] bg-subtle/80 p-1">
        {FACE_SHAPES.map(s => {
          const on = fs?.confirmed === s
          return (
            <motion.button key={s} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onPick(s)}
              whileTap={{ scale: 0.96 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-[14px] px-1 py-2.5 transition-colors ${on ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-2 hover:text-ink'}`}>
              <span className={on ? '' : 'opacity-70'}><FaceShapeIcon shape={s} size={26} /></span>
              <span className={`truncate text-[13px] ${on ? 'font-semibold' : 'font-medium'}`}>{SHAPE_INFO[s].name}</span>
            </motion.button>
          )
        })}
      </div>
      {shown && <p className="px-1 text-[13px] text-ink-2"><span className="font-semibold text-ink">{SHAPE_INFO[shown].name}:</span> {SHAPE_INFO[shown].trait.toLowerCase()}.</p>}
    </div>
  )
}
