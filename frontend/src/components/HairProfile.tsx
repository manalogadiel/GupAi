import { useEffect, useState } from 'react'
import type { Hair } from '../api'
import Icon from './Icon'
import { Button } from './ui'

type Key = 'density' | 'strand' | 'texture' | 'hairline'
const ROWS: { key: Key; label: string; options: { value: string; label: string }[] }[] = [
  { key: 'density', label: 'Kapal', options: [{ value: 'thin', label: 'Manipis' }, { value: 'medium', label: 'Katamtaman' }, { value: 'thick', label: 'Makapal' }] },
  { key: 'strand', label: 'Hibla', options: [{ value: 'fine', label: 'Pino' }, { value: 'medium', label: 'Katamtaman' }, { value: 'coarse', label: 'Magaspang' }] },
  { key: 'texture', label: 'Tekstura', options: [{ value: 'straight', label: 'Diretso' }, { value: 'wavy', label: 'Alon' }, { value: 'curly', label: 'Kulot' }, { value: 'coily', label: 'Sobrang kulot' }] },
  { key: 'hairline', label: 'Hairline', options: [{ value: 'normal', label: 'Normal' }, { value: 'receding', label: 'Umuurong' }, { value: 'widows_peak', label: "Widow's peak" }] },
]
export const HAIR_TL: Record<string, string> = Object.fromEntries(ROWS.flatMap(r => r.options.map(o => [o.value, o.label])))

/** The AI estimate pre-selects each row; the barber adjusts and confirms. No badges, no rings. */
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
      <p className="flex items-center gap-3 text-[15px] text-ink-2">
        {scanning ? 'Sinusuri pa ang buhok mula sa photo…' : 'Hindi pa nasusuri ang buhok.'}
        {editable && !scanning && <Button className="min-h-9 rounded-full px-4" onClick={onScan}>Suriin</Button>}
      </p>
    )
  }
  const confirmed = !!profile?.confirmed && JSON.stringify(draft) === JSON.stringify(profile.confirmed)
  return (
    <div className="space-y-2.5">
      {ROWS.map(row => (
        <div key={row.key} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-[13px] font-medium text-ink-2">{row.label}</span>
          <div role="radiogroup" aria-label={row.label} className="flex min-w-0 flex-wrap gap-1 rounded-full bg-subtle/80 p-1">
            {row.options.map(o => {
              const on = draft[row.key] === o.value
              return (
                <button key={o.value} type="button" role="radio" aria-checked={on} disabled={!editable}
                  onClick={() => setDraft({ ...draft, [row.key]: o.value } as Hair)}
                  className={`min-h-8 rounded-full px-3 text-[13px] transition-colors ${on ? 'bg-surface font-semibold text-ink shadow-[var(--shadow-card)]' : 'text-ink-2 hover:text-ink'}`}>
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-end gap-3 pt-1">
        {confirmed ? <span className="flex items-center gap-1.5 text-[14px] font-medium text-action"><Icon name="check" size={16} strokeWidth={2.4} /> Kinumpirma</span>
          : editable && <Button variant="primary" className="min-h-10 rounded-full px-5" onClick={() => onConfirm(draft)}>I-confirm</Button>}
      </div>
    </div>
  )
}
