import './HaircutPreview.css'

export type Sides = 'skin_fade' | 'low_fade' | 'mid_fade' | 'high_fade' | 'drop_fade' | 'burst_fade' | 'taper' | 'undercut' | 'scissor_over_comb' | 'uniform'
export type Top = 'textured_crop' | 'french_crop' | 'side_part' | 'comb_over' | 'quiff' | 'pompadour' | 'slick_back' | 'curtains'
  | 'messy_fringe' | 'two_block' | 'faux_hawk' | 'keep_length' | 'buzz'

const sideVariants: (Sides | null)[] = ['skin_fade', 'low_fade', 'mid_fade', 'high_fade', 'drop_fade', 'burst_fade', 'taper', 'undercut', 'scissor_over_comb', 'uniform', null]
const topVariants: (Top | null)[] = ['textured_crop', 'french_crop', 'side_part', 'comb_over', 'quiff', 'pompadour', 'slick_back', 'curtains',
  'messy_fringe', 'two_block', 'faux_hawk', 'keep_length', 'buzz', null]
export const asSides = (id: string | null | undefined) => (sideVariants.includes(id as Sides) ? (id as Sides) : null)
export const asTop = (id: string | null | undefined) => (topVariants.includes(id as Top) ? (id as Top) : null)

// Bands follow the temples instead of crossing the face.
function templeBand(start: number, end: number) {
  const edge = (y: number) => y <= 112 ? 84 - (y - 82) * 0.12 : 80.4 + (y - 112) * 0.2
  const a = edge(start)
  const b = edge(end)
  return `M${a} ${start}H98V${end}H${b}Z M${280 - a} ${start}H182V${end}H${280 - b}Z`
}

const fadeBands = {
  skin_fade: [98, 112, 125],
  low_fade: [125, 135, 144],
  mid_fade: [111, 125, 138],
  taper: [132, 141, 147],
  high_fade: [88, 99, 112],
  drop_fade: [106, 121, 136],
  burst_fade: [118, 130, 142],
} satisfies Partial<Record<Sides, number[]>>

const tops: Record<Top | 'neutral', { outline: string; detail: string }> = {
  textured_crop: {
    outline: 'M82 104 81 84 87 77 85 68 97 70 104 61 113 66 124 60 134 65 145 59 155 65 167 63 174 71 187 73 197 89 196 105 185 96 173 100 162 96 150 101 138 96 126 101 115 97 103 102 94 98Z',
    detail: 'm101 79 9-5m14 3 8-5m14 5 9-6m13 9 8-3',
  },
  side_part: {
    outline: 'M82 105V84C83 63 109 54 145 58L160 63C181 61 197 76 198 93L194 111 181 93 165 83C146 98 119 102 96 95L89 111Z',
    detail: 'M158 65 164 84M148 69c-13 15-29 20-47 20m47-11c-13 12-27 16-40 17m62-25q12 6 17 18',
  },
  quiff: {
    outline: 'M82 105 81 85C77 67 93 55 109 50 115 40 132 37 148 42 164 34 190 44 194 60 204 75 198 89 193 108L181 88C151 91 132 74 103 88L91 111Z',
    detail: 'M99 73c18-19 41-21 62-15m-46 16c17-12 39-13 58-9m-3-17q15 2 19 13',
  },
  curtains: {
    outline: 'M80 132C75 112 77 81 87 68 100 51 124 53 140 63 157 52 183 55 194 72 204 88 205 117 199 137L180 124 173 101C156 94 147 81 140 70 133 84 123 94 106 103L99 125 88 136Z',
    detail: 'M128 67c-20 8-32 26-34 47m28-34q-16 13-18 28m49-39c17 11 29 29 31 45m-23-31q12 13 15 27',
  },
  keep_length: {
    outline: 'M80 141C69 128 74 108 76 94 70 80 80 61 94 56 106 42 122 49 136 46 155 37 168 51 182 54 200 59 207 75 201 91 209 110 205 130 198 143L183 131 179 107 163 96 151 102 138 94 124 102 111 96 101 109 97 134Z',
    detail: 'M90 89q3-21 24-28m6 18q13-16 28-15m12 6q22 7 28 28M85 114l4 13m106-15-3 16',
  },
  french_crop: {
    outline: 'M82 104 81 86C82 67 106 58 140 58s57 8 58 28v18l-9-4H91Z',
    detail: 'M92 100h96M100 74l6-6m14 4 6-7m14 6 6-7m14 7 6-6m12 9 6-5M104 88l-2 9m16-9-1 9m16-9v9m15-9 1 9m15-9 2 9',
  },
  comb_over: {
    outline: 'M82 108V84C81 59 111 47 150 51c27 3 47 18 48 40l-3 17-9-17c-19-8-43-8-62-1-15 6-29 9-39 7l-6 21Z',
    detail: 'M108 66c22-12 52-12 78 2M100 78c26-10 56-10 86 2M152 54l-6 16',
  },
  pompadour: {
    outline: 'M82 106 81 84C77 56 98 36 124 32c24-4 50 2 64 18 14 14 14 32 10 46l-4 12-9-20c-24-12-60-12-86-1l-8 19Z',
    detail: 'M100 66c18-22 54-26 80-10M106 52c16-12 40-14 58-6M110 80c20-10 48-10 70 0',
  },
  slick_back: {
    outline: 'M84 98 83 84C83 61 108 52 140 52s57 9 57 32v14l-7-7c-17-9-83-9-100 0Z',
    detail: 'M106 64q34-9 68 0M100 75q40-9 80 0M112 56q28-5 56 0M96 86q44-8 88 0',
  },
  messy_fringe: {
    outline: 'M79 114C75 92 80 70 94 60c19-13 54-15 77-4 21 9 31 27 28 52l-4 9-6-12-7 13-6-15-9 14-7-14-9 15-8-15-9 14-7-14-9 13-5-14-8 15Z',
    detail: 'M100 76c10-8 18-10 26-10m10 2c12-6 26-6 38 2M110 96l-4 10m22-12-2 12m18-12 3 12m17-10 4 9',
  },
  two_block: {
    outline: 'M77 126C71 98 76 72 92 60c20-15 57-15 81-2 19 10 29 29 27 56l-2 14-11-9-4-14c-21 7-61 8-91 2l-4 13Z',
    detail: 'M96 98c18 4 50 4 88-1M108 70c12-6 28-8 40-6m10 2c10 2 20 6 26 12M90 110l-4 10m110-10 3 10',
  },
  faux_hawk: {
    outline: 'M84 104 82 86C82 70 96 62 112 57l14-23 14 15 12-18 14 20c18 4 31 15 31 31l-2 18-9-12c-23-8-62-8-86 0l-6 14Z',
    detail: 'M126 42 132 66m14-27-2 26m14-12-8 18M110 74c20-6 44-6 64 0',
  },
  buzz: {
    outline: 'M83 99V87C83 64 106 60 140 60S197 65 197 87V99L187 94 180 84C156 79 120 79 99 86L93 99Z',
    detail: 'M103 74h1m10-4h1m10-2h1m10-1h1m10 0h1m10 1h1m10 2h1m10 4h1',
  },
  neutral: {
    outline: 'M82 105V87C82 64 105 56 140 57 174 57 198 68 198 88L196 106 185 94C158 88 124 88 96 96L88 111Z',
    detail: 'M106 77q34-14 68 2',
  },
}

export default function HaircutPreview({
  sides,
  top,
  fringe = 'keep',
  size = 280,
}: {
  sides: Sides | null
  top: Top | null
  fringe?: 'keep' | 'trim' | 'up'
  size?: number
}) {
  const describe = (value: string | null, part: string) => value ? value.replaceAll('_', ' ') : `neutral ${part}`
  return (
    <svg
      className={`hp-root hp-fringe-${fringe}`}
      width={size}
      height={size}
      viewBox="0 0 280 280"
      role="img"
      aria-label={`Haircut preview: ${describe(sides, 'sides')}, ${describe(top, 'top')}, fringe ${fringe}.`}
      focusable="false"
    >
      <circle className="hp-ground" cx="140" cy="143" r="119" />
      <path className="hp-smock" d="M38 264c3-37 17-61 53-71l31-8h36l31 8c36 10 50 34 53 71Z" />
      <path className="hp-smock-seam" d="m67 223-6 41m152-41 6 41" />
      <path className="hp-skin" d="M117 174h46v27c-8 16-38 16-46 0Z" />
      <path className="hp-skin-shadow" d="M117 178h46v14c-14 10-32 9-46 0Z" />
      <path className="hp-collar" d="m115 194 25 17-18 15-20-27Zm50 0-25 17 18 15 20-27Z" />
      <path className="hp-smock-seam" d="M140 226v38" />
      <circle className="hp-collar" cx="149" cy="240" r="2" />
      <circle className="hp-collar" cx="149" cy="254" r="2" />
      <path className="hp-skin" d="M92 115c-20-12-22 27-7 36l12 2Zm96 0c20-12 22 27 7 36l-12 2Z" />
      <path className="hp-ear-line" d="M83 127q-6 9 3 14m111-14q6 9-3 14" />
      <path className="hp-skin" d="M88 91c0-27 104-27 104 0v54c0 36-23 61-52 61s-52-25-52-61Z" />
      <path className="hp-skin-shadow" d="M181 95v51c0 28-14 48-41 60 30 0 52-26 52-61V95Z" />
      {sideVariants.map((variant) => (
        <g key={variant ?? 'neutral'} className={`hp-side-variant${sides === variant ? ' hp-active' : ''}`} aria-hidden="true">
          {variant && variant in fadeBands ? (
            [...fadeBands[variant as keyof typeof fadeBands], 151].map((end, i, edges) => (
              <path key={i} className={`hp-tone-${[0, 2, 3, 4][i]}`} d={templeBand(i === 0 ? 82 : edges[i - 1], end)} />
            ))
          ) : variant === 'undercut' ? (
            <path className="hp-tone-2" d="M84 86h14v54l-7 13-5-12-6-29Zm112 0h-14v54l7 13 5-12 6-29Z" />
          ) : (
            <>
              <path className={variant === 'scissor_over_comb' ? 'hp-hair' : 'hp-hair-medium'} d="M84 83h14v57l-7 13-5-12-6-29Zm112 0h-14v57l7 13 5-12 6-29Z" />
              {variant === 'scissor_over_comb' && <path className="hp-hair-detail" d="m89 102-2 24m104-24 2 24" />}
            </>
          )}
        </g>
      ))}
      <path className="hp-brows" d="M104 120q9-4 17-1m38 0q9-3 17 1" />
      <g className="hp-ink">
        <ellipse cx="113" cy="133" rx="3" ry="3.5" />
        <ellipse cx="167" cy="133" rx="3" ry="3.5" />
      </g>
      <path className="hp-face-line" d="m140 135-4 19q4 3 9 0m-18 19q13 7 26 0" />
      <path className="hp-chin" d="M133 186q7 2 14 0" />
      {topVariants.map((variant) => {
        const hair = tops[variant ?? 'neutral']
        const adjustable = variant === 'textured_crop' || variant === 'keep_length' || variant === null
        return (
          <g key={variant ?? 'neutral'} className={`hp-top-variant${top === variant ? ' hp-active' : ''}`} aria-hidden="true">
            <path className={variant === null ? 'hp-hair-medium' : 'hp-hair'} d={hair.outline} />
            <path className="hp-hair-detail" d={hair.detail} />
            {adjustable && (
              <g className="hp-fringe">
                <path className="hp-hair" d="m100 91 80-1-5 14-12-4-10 6-12-5-11 5-10-5-13 5Z" />
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

