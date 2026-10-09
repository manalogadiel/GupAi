import { useId } from 'react'
import type { Sides, Top } from './HaircutPreview'
import './HaircutPreview.css'

/**
 * Side-profile haircut illustration (facing left). Sides are drawn as fade bands clipped to the scalp,
 * so fade height, taper, burst and undercut read at a glance; the top is a silhouette with lift and fringe.
 */
const SCALP = 'M104 96C122 50 204 46 223 104c8 30 2 62-13 92-8-4-15-10-21-20-5-10-9-16-17-16l-16-2-2 14h-10l-4-44c-12-12-24-22-36-32Z'
const HEAD = 'M100 84C120 46 204 42 226 104c10 30 2 64-14 88l-6 60h-60l2-30c-16 4-34 2-44-8-6-8-6-16-4-22l-8-6 4-8-8-6c6-6 6-12 2-16l-16-6c4-10 10-16 16-20 0-12 2-26 16-46Z'

type Fade = { skin: number; step: number; tilt?: number }
const FADES: Partial<Record<Sides, Fade>> = {
  skin_fade: { skin: 172, step: 11 },
  low_fade: { skin: 194, step: 8 },
  mid_fade: { skin: 168, step: 10 },
  high_fade: { skin: 142, step: 12 },
  drop_fade: { skin: 170, step: 10, tilt: -14 },
  taper: { skin: 204, step: 6 },
}
const TONES = ['hp-skin', 'hp-tone-3', 'hp-tone-2', 'hp-tone-1']

/** Top silhouette: front lift f, crown height c, forward fringe fr, extra side drop for covering styles. */
const TOPS: Record<Top | 'neutral', { f: number; c: number; fr: number; drop?: number; lines?: 'back' | 'up' | 'mess' }> = {
  buzz: { f: 0, c: 2, fr: 0 }, french_crop: { f: 4, c: 8, fr: 16, lines: 'mess' }, textured_crop: { f: 6, c: 10, fr: 12, lines: 'mess' },
  side_part: { f: 12, c: 10, fr: 0, lines: 'back' }, comb_over: { f: 16, c: 12, fr: 0, lines: 'back' }, quiff: { f: 26, c: 12, fr: 0, lines: 'up' },
  pompadour: { f: 36, c: 16, fr: 0, lines: 'up' }, slick_back: { f: 5, c: 7, fr: 0, lines: 'back' }, curtains: { f: 10, c: 12, fr: 24 },
  messy_fringe: { f: 8, c: 14, fr: 28, lines: 'mess' }, two_block: { f: 10, c: 16, fr: 20, drop: 30 }, faux_hawk: { f: 16, c: 28, fr: 0, lines: 'up' },
  keep_length: { f: 12, c: 16, fr: 18, drop: 22 }, neutral: { f: 6, c: 8, fr: 0 },
}

function topPath({ f, c, fr, drop = 0 }: { f: number; c: number; fr: number; drop?: number }) {
  const front = `M112 ${104 + drop * 0.3}C${102 - f * 0.3} ${98 - f * 0.4} ${100 - f * 0.2} ${72 - f} ${118} ${60 - f * 0.8}`
  const crown = `C${140} ${44 - c} ${196} ${40 - c} ${218} ${76 - c * 0.4}C${230} ${96} ${228} ${110 + drop} ${224} ${118 + drop}`
  const under = `C${206} ${96 + drop * 0.8} ${150} ${90 + drop * 0.6} ${124} ${112 + drop * 0.4}Z`
  const fringe = fr ? `M118 ${92}C${106} ${96} ${96} ${100 + fr * 0.5} ${92 - fr * 0.15} ${100 + fr}l${10} -6 4 8 6-10 6 4C${128} ${108} ${130} ${98} ${126} ${92}Z` : ''
  return front + crown + under + fringe
}

const LINES = {
  back: 'M120 70q40-16 84-4M116 82q44-14 92-2M128 94q36-8 76 2',
  up: 'M112 74q6-20 26-26M124 70q10-16 30-20M138 66q14-12 32-12',
  mess: 'm126 66 8-6m14 0 8-6m16 2 8-4m-60 18 6-6m20 0 6-6m18 2 8-4',
}

export default function SideProfile({ sides, top, size = 200 }: { sides: Sides | null; top: Top | null; size?: number }) {
  const clip = useId()
  const fade = sides ? FADES[sides] : undefined
  const t = TOPS[top ?? 'neutral']
  return (
    <svg className="hp-root" width={size} height={size} viewBox="0 0 280 280" role="img" focusable="false"
      aria-label={`Side view: ${sides ? sides.replaceAll('_', ' ') : 'neutral sides'}, ${top ? top.replaceAll('_', ' ') : 'neutral top'}.`}>
      <defs><clipPath id={clip}><path d={SCALP} /></clipPath></defs>
      <circle className="hp-ground" cx="140" cy="143" r="119" />
      <path className="hp-smock" d="M70 270c6-26 30-40 66-42h70c30 4 48 20 54 42Z" />
      <path className="hp-collar" d="m146 230 20 16 22-16 18 4-40 22-38-22Z" />
      <path className="hp-skin" d={HEAD} />
      <path className="hp-skin-shadow" d="M206 192l-6 60h6l6-60Z" />
      {/* sides, clipped to the scalp */}
      <g clipPath={`url(#${clip})`}>
        <rect className={sides === 'scissor_over_comb' ? 'hp-hair' : sides === 'uniform' ? 'hp-tone-1' : 'hp-hair'} x="80" y="30" width="170" height="200" />
        {fade && (
          <g transform={fade.tilt ? `rotate(${fade.tilt} 170 150)` : undefined}>
            {TONES.map((tone, i) => <rect key={tone} className={tone} x="60" width="200" y={fade.skin - i * fade.step} height={i === 0 ? 120 : fade.step + 0.5} />)}
          </g>
        )}
        {sides === 'burst_fade' && [56, 46, 36, 26].map((r, i) => <circle key={r} className={TONES[3 - i]} cx="172" cy="156" r={r} />)}
        {sides === 'undercut' && <rect className="hp-tone-2" x="60" y="112" width="200" height="120" />}
        {sides === 'taper' && <path className="hp-tone-2" d="M140 150h22v30h-22Z" />}
        {sides === 'scissor_over_comb' && <path className="hp-hair-detail" d="M150 120q20 10 50 4M160 140q18 6 40 0M186 162q10 4 22-2" />}
      </g>
      {/* ear and face */}
      <ellipse className="hp-skin" cx="168" cy="146" rx="13" ry="19" />
      <path className="hp-ear-line" d="M164 134q10 2 8 14t-6 12" />
      <path className="hp-brows" d="M92 120q8-4 16 0" />
      <ellipse className="hp-ink" cx="101" cy="132" rx="2.6" ry="3.2" />
      <path className="hp-face-line" d="M90 178q8 4 14 0" />
      {/* top silhouette */}
      <path className="hp-hair" d={topPath(t)} />
      {t.lines && <path className="hp-hair-detail" d={LINES[t.lines]} />}
    </svg>
  )
}
