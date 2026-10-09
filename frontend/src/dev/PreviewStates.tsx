import HaircutPreview from '../components/HaircutPreview'

const sides = [
  ['skin_fade', 'Skin fade'],
  ['low_fade', 'Low fade'],
  ['mid_fade', 'Mid fade'],
  ['taper', 'Taper'],
  ['scissor_over_comb', 'Scissor over comb'],
  ['uniform', 'Uniform'],
] as const
const tops = [
  ['textured_crop', 'Textured crop'],
  ['side_part', 'Side part'],
  ['quiff', 'Quiff'],
] as const

export default function PreviewStates() {
  return (
    <div className="hp-preview-grid" aria-label="Haircut combinations">
      {sides.flatMap(([side, sideLabel]) => tops.map(([top, topLabel]) => (
        <figure key={`${side}-${top}`} className="hp-preview-card">
          <HaircutPreview sides={side} top={top} size={160} />
          <figcaption className="hp-preview-label">{sideLabel}<span>{topLabel}</span></figcaption>
        </figure>
      )))}
    </div>
  )
}

