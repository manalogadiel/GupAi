import type { Consultation, FaceShape, Job, Option } from '../api'
import { api } from '../api'
import { Button, Chip } from './ui'
import { shapeLabel } from './Photo'

const JOB_TL: Record<string, string> = {
  transcribe: 'Isinasalin ang boses sa text sa laptop',
  observe: 'Tinitingnan ng local AI ang photo',
  faceshape: 'Sinusukat ang hugis ng mukha',
  propose: 'Naghahanap ng dalawang haircut option',
}

/** Real job state from the server: name of the job, elapsed seconds, Cancel. No fake progress bar. */
export function JobStatus({ job }: { job: Job | null }) {
  if (!job) return null
  return (
    <div role="status" className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-subtle px-4 py-3 text-[15px]">
      <span>{JOB_TL[job.type] ?? job.type}… <span className="tabular-nums text-ink-2">{Math.round(job.elapsed_s)}s</span></span>
      <Button variant="quiet" className="min-h-10 px-3" onClick={() => api.cancelJob(job.id).catch(() => {})}>Cancel</Button>
    </div>
  )
}

export const FACE_SHAPES: FaceShape[] = ['oval', 'round', 'square', 'oblong', 'heart', 'diamond']

export function FaceShapeChips({ c, onPick, disabled }: { c: Consultation; onPick: (s: FaceShape) => void; disabled?: boolean }) {
  const fs = c.state.face_shape
  return (
    <div className="space-y-2">
      <p className="text-[15px]">
        Hugis ng mukha{' '}
        <span className="text-ink-2">
          {fs?.confirmed ? `· confirmed: ${shapeLabel(fs.confirmed)}` : fs?.suggested.length ? `· AI: ${fs.suggested.map(shapeLabel).join(' o ')}. I-confirm ng barbero` : '· barbero ang pipili'}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {FACE_SHAPES.map(s => (
          <Chip key={s} pressed={fs?.confirmed === s} disabled={disabled} onClick={() => onPick(s)}>
            {shapeLabel(s)}{!fs?.confirmed && fs?.suggested.includes(s) ? ' · AI' : ''}
          </Chip>
        ))}
      </div>
    </div>
  )
}

export function OptionCard({ o, selected, onSelect, sourceTitle }: { o: Option; selected: boolean; onSelect?: () => void; sourceTitle?: (id: string) => string }) {
  return (
    <article className={`flex flex-col overflow-hidden rounded-[var(--radius-sheet)] border-2 bg-surface ${selected ? 'border-action' : 'border-transparent'}`}>
      <figure className="relative bg-subtle">
        <img src={o.image} alt={`Reference photo of a ${o.name}`} className="aspect-[4/3] w-full object-cover" />
        <figcaption className="absolute left-3 top-3 rounded-[6px] bg-surface/90 px-2 py-1 text-[13px] text-ink">Reference, hindi ikaw</figcaption>
      </figure>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="text-xl font-semibold">{o.name}</h3>
        <p>{o.why}</p>
        <dl className="grid gap-1 text-[15px]">
          {o.stays.length > 0 && <div><dt className="inline font-semibold">Mananatili: </dt><dd className="inline">{o.stays.join(', ')}</dd></div>}
          {o.changes.length > 0 && <div><dt className="inline font-semibold">Magbabago: </dt><dd className="inline">{o.changes.join(', ')}</dd></div>}
          <div><dt className="inline font-semibold">Styling effort: </dt><dd className="inline">{{ low: 'mababa', medium: 'katamtaman', high: 'mataas' }[o.effort]}</dd></div>
        </dl>
        {o.face_shape_note && <p className="rounded-[8px] bg-subtle px-3 py-2 text-[15px]">{o.face_shape_note}</p>}
        {o.needs_barber_check.length > 0 && <p className="text-[15px] text-ink-2">Kailangang i-check ng barbero: {o.needs_barber_check.join('; ')}</p>}
        {o.source_ids.length > 0 && sourceTitle && <p className="text-[13px] text-ink-2">Source: {o.source_ids.map(sourceTitle).join(' · ')}</p>}
        {onSelect && (
          <Button variant={selected ? 'primary' : 'secondary'} className="mt-auto" aria-pressed={selected} onClick={onSelect}>
            {selected ? '✓ Napili' : 'Piliin ito'}
          </Button>
        )}
      </div>
    </article>
  )
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-[14px] font-semibold text-ink-2">{title}</h3>
      {items.length ? <ul className="mt-1 space-y-1">{items.map(i => <li key={i}>{i}</li>)}</ul> : <p className="mt-1 text-ink-2">—</p>}
    </div>
  )
}

/** The consultation note beside the mirror: Keep / Change / Avoid, plus what has been confirmed. */
export function AgreementSummary({ c }: { c: Consultation }) {
  const s = c.state
  const opt = s.options.find(o => o.id === s.selected_option_id)
  const confirmedObs = s.observations.filter(o => o.status === 'confirmed')
  return (
    <section aria-label="Napagkasunduan" className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Napagkasunduan</h2>
        {c.agreement && <span className="text-[14px] text-ink-2">v{c.agreement.version}</span>}
      </div>
      {s.goal && <p className="text-[15px]">“{s.goal}”</p>}
      <List title="Keep" items={s.keep} />
      <List title="Change" items={s.change} />
      <List title="Avoid" items={s.avoid} />
      {opt && <p className="text-[15px]"><b>Napiling style:</b> {opt.name}</p>}
      {s.face_shape?.confirmed && <p className="text-[15px]"><b>Hugis ng mukha:</b> {shapeLabel(s.face_shape.confirmed)}</p>}
      {confirmedObs.length > 0 && <List title="Confirmed ng barbero" items={confirmedObs.map(o => o.text)} />}
      {s.conflicts.length > 0 && (
        <div role="alert" className="rounded-[8px] border border-error px-3 py-2 text-[15px] text-error">
          ⚠ May salungat: {s.conflicts.map(x => x.text).join('; ')}
        </div>
      )}
    </section>
  )
}
