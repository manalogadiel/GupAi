import { motion } from 'motion/react'
import type { Consultation, FaceShape } from '../api'
import Icon from './Icon'

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

/** Six visual cards. The AI estimate gets a ring and badge; the barber's confirmed shape is filled. */
export function FaceShapePicker({ c, onPick, disabled }: { c: Consultation; onPick: (s: FaceShape) => void; disabled?: boolean }) {
  const fs = c.state.face_shape
  return (
    <div role="radiogroup" aria-label="Hugis ng mukha" className="grid grid-cols-3 gap-2 xl:grid-cols-6">
      {FACE_SHAPES.map(s => {
        const confirmed = fs?.confirmed === s
        const ai = fs?.suggested?.includes(s)
        return (
          <motion.button key={s} type="button" role="radio" aria-checked={confirmed} disabled={disabled} onClick={() => onPick(s)}
            whileTap={{ scale: 0.96 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={`relative flex flex-col items-center gap-1 rounded-[18px] px-2 pb-2.5 pt-3 text-center transition-colors ${
              confirmed ? 'bg-action text-on-action shadow-[var(--shadow-lift)]' : `bg-surface hover:bg-subtle ${ai ? 'shadow-[0_0_0_2px_var(--color-voice)]' : 'shadow-[var(--shadow-card)]'}`}`}>
            {ai && !confirmed && <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-voice px-1.5 py-0.5 text-[10px] font-bold text-white"><Icon name="sparkle" size={10} strokeWidth={2.4} />AI</span>}
            {confirmed && <span className="absolute right-1.5 top-1.5"><Icon name="check" size={16} strokeWidth={2.6} /></span>}
            <FaceShapeIcon shape={s} size={40} active={confirmed} />
            <span className="text-[14px] font-semibold leading-tight">{SHAPE_INFO[s].name}</span>
            <span className={`text-[11px] leading-tight ${confirmed ? 'text-on-action/80' : 'text-ink-2'}`}>{SHAPE_INFO[s].trait}</span>
          </motion.button>
        )
      })}
    </div>
  )
}
