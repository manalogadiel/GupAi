import { useEffect, useState } from 'react'
import type { Hair } from '../api'
import Icon from './Icon'
import { Button } from './ui'

type Key = 'density' | 'strand' | 'texture' | 'hairline'
const ROWS: { key: Key; label: string; options: { value: string; label: string }[] }[] = [
  { key: 'density', label: 'Kapal (dami)', options: [{ value: 'thin', label: 'Manipis' }, { value: 'medium', label: 'Katamtaman' }, { value: 'thick', label: 'Makapal' }] },
  { key: 'strand', label: 'Hibla', options: [{ value: 'fine', label: 'Pino' }, { value: 'medium', label: 'Katamtaman' }, { value: 'coarse', label: 'Magaspang' }] },
  { key: 'texture', label: 'Tekstura', options: [{ value: 'straight', label: 'Diretso' }, { value: 'wavy', label: 'Alon' }, { value: 'curly', label: 'Kulot' }, { value: 'coily', label: 'Sobrang kulot' }] },
  { key: 'hairline', label: 'Hairline', options: [{ value: 'normal', label: 'Normal' }, { value: 'receding', label: 'Umuurong' }, { value: 'widows_peak', label: "Widow's peak" }] },
]
export const HAIR_TL: Record<string, string> = Object.fromEntries(ROWS.flatMap(r => r.options.map(o => [o.value, o.label])))

/** Mini swatch: strand count shows density, the stroke shape shows texture. */
function Swatch({ hair }: { hair: Hair }) {
  const n = { thin: 5, medium: 8, thick: 12 }[hair.density]
  const w = { fine: 1.2, medium: 2, coarse: 2.8 }[hair.strand]
  const d = (x: number) => ({
    straight: `M${x} 6v36`, wavy: `M${x} 6q5 6 0 12t0 12 0 12`, curly: `M${x} 6c6 3 6 7 0 9s-6 7 0 9 6 7 0 9`, coily: `M${x} 6c5 1 5 4 0 5s-5 4 0 5 5 4 0 5-5 4 0 5 5 4 0 5`,
  }[hair.texture])
  return (
    <svg viewBox="0 0 64 48" width="64" height="48" aria-hidden className="shrink-0 rounded-xl bg-peach">
      {Array.from({ length: n }, (_, i) => <path key={i} d={d(8 + (i * 48) / Math.max(1, n - 1))} fill="none" stroke="var(--color-ink)" strokeWidth={w} strokeLinecap="round" />)}
    </svg>
  )
}

export default function HairProfile({ profile, scanning, editable, onConfirm, onScan }: {
  profile: { suggested: Hair | null; confirmed: Hair | null } | null | undefined
  scanning: boolean; editable: boolean
  onConfirm: (h: Hair) => void; onScan: () => void
}) {
  const base = profile?.confirmed ?? profile?.suggested ?? null
  const [draft, setDraft] = useState<Hair | null>(base)
  useEffect(() => { setDraft(base) }, [base?.density, base?.strand, base?.texture, base?.hairline]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!draft) {
    return (
      <div className="flex items-center gap-3 rounded-[18px] bg-surface p-4 shadow-[var(--shadow-card)]">
        <Icon name="hair" size={28} className="text-action" />
        <p className="flex-1 text-[15px]">{scanning ? 'Sinusuri ng AI ang buhok mula sa photo…' : 'Hindi pa nasusuri ang buhok.'}</p>
        {editable && !scanning && <Button className="min-h-10 rounded-full" onClick={onScan}>Suriin ang buhok</Button>}
      </div>
    )
  }
  const changed = JSON.stringify(draft) !== JSON.stringify(profile?.confirmed ?? null)
  return (
    <div className="space-y-3 rounded-[18px] bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3">
        <Swatch hair={draft} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Uri ng buhok · {HAIR_TL[draft.density]}, {HAIR_TL[draft.texture].toLowerCase()}</p>
          <p className="text-[13px] text-ink-2">{profile?.confirmed ? 'Kinumpirma ng barbero' : 'Tantya ng AI mula sa photo, kumpirmahin ng barbero'}{profile?.suggested?.uncertain && !profile?.confirmed ? ' · hindi tiyak ang ilaw o anggulo' : ''}</p>
        </div>
      </div>
      {ROWS.map(row => (
        <div key={row.key} className="flex flex-wrap items-center gap-1.5">
          <span className="w-28 text-[13px] font-medium text-ink-2">{row.label}</span>
          {row.options.map(o => {
            const on = draft[row.key] === o.value
            const ai = profile?.suggested?.[row.key] === o.value
            return (
              <button key={o.value} type="button" disabled={!editable} aria-pressed={on}
                onClick={() => setDraft({ ...draft, [row.key]: o.value } as Hair)}
                className={`min-h-9 rounded-full px-3 text-[13px] font-medium transition-colors ${on ? 'bg-action text-on-action' : 'bg-subtle hover:bg-peach'} ${ai && !on ? 'ring-1 ring-voice' : ''}`}>
                {o.label}
              </button>
            )
          })}
        </div>
      ))}
      {editable && (changed || !profile?.confirmed) && (
        <Button variant="primary" className="min-h-10 w-full rounded-full" onClick={() => onConfirm(draft)}>
          <Icon name="check" size={18} /> I-confirm ang uri ng buhok
        </Button>
      )}
    </div>
  )
}
