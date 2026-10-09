import { AnimatePresence, motion } from 'motion/react'
import type { Consultation, Job, Option } from '../api'
import { api } from '../api'
import { Button } from './ui'
import { shapeLabel } from './Photo'

const JOB_TL: Record<string, string> = {
  chat: 'Sumasagot si Kuya Gup', recommend: 'Pinipili ang haircut', suggest: 'Pinipili ang part options', checkpoint: 'Sinusuri ang checkpoint',
  transcribe: 'Isinasalin ang boses sa text sa laptop',
  observe: 'Tinitingnan ng local AI ang photo',
  faceshape: 'Sinusukat ang hugis ng mukha',
  propose: 'Naghahanap ng dalawang haircut option',
}

/** Real job state from the server: what is running, honest elapsed seconds, Cancel. No fake progress. */
export function JobStatus({ job }: { job: Job | null }) {
  return (
    <AnimatePresence>
      {job && (
        <motion.div role="status" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="flex items-center justify-between gap-3 rounded-full bg-surface py-2 pl-4 pr-2 text-[15px] shadow-[var(--shadow-card)]">
          <span className="flex items-center gap-3">
            <span aria-hidden className="flex gap-1">
              {[0, 1, 2].map(i => (
                <motion.span key={i} className="size-1.5 rounded-full bg-action" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }} />
              ))}
            </span>
            {job.status === 'queued' ? `Nakapila · ${job.progress?.queued_ahead ?? '?'} nauna` : JOB_TL[job.type] ?? job.type}… <span className="tabular-nums text-ink-2">{Math.round(job.elapsed_s)}s</span>
          </span>
          <Button variant="quiet" className="min-h-9 rounded-full px-3 text-[14px]" onClick={() => api.cancelJob(job.id).catch(() => {})}>Cancel</Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function OptionCard({ o, selected, onSelect, sourceTitle }: { o: Option; selected: boolean; onSelect?: () => void; sourceTitle?: (id: string) => string }) {
  return (
    <motion.article animate={{ scale: selected ? 1.015 : 1 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className={`flex h-full flex-col overflow-hidden rounded-[var(--radius-sheet)] bg-surface transition-shadow duration-200 ${
        selected ? 'shadow-[0_0_0_3px_var(--color-action),var(--shadow-lift)]' : 'shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-lift)]'}`}>
      <figure className="relative bg-peach">
        <img src={o.image} alt={`Reference illustration of a ${o.name}`} className="aspect-[4/3] w-full object-cover" />
        <figcaption className="absolute left-3 top-3 rounded-full bg-surface/90 px-2.5 py-1 text-[12px] font-medium text-ink">Reference, hindi ikaw</figcaption>
        <AnimatePresence>
          {selected && (
            <motion.span initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-action text-on-action shadow-[var(--shadow-card)]" aria-hidden>✓</motion.span>
          )}
        </AnimatePresence>
      </figure>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="font-display text-[32px] leading-none">{o.name}</h3>
        {o.why && <p>{o.why}</p>}
        <dl className="grid gap-1.5 text-[15px]">
          {o.stays.length > 0 && <div><dt className="inline font-semibold">Mananatili: </dt><dd className="inline text-ink-2">{o.stays.join(', ')}</dd></div>}
          {o.changes.length > 0 && <div><dt className="inline font-semibold">Magbabago: </dt><dd className="inline text-ink-2">{o.changes.join(', ')}</dd></div>}
          <div><dt className="inline font-semibold">Styling effort: </dt><dd className="inline text-ink-2">{{ low: 'mababa', medium: 'katamtaman', high: 'mataas' }[o.effort]}</dd></div>
        </dl>
        {o.face_shape_note && <p className="rounded-[14px] bg-subtle px-3.5 py-2.5 text-[14px] leading-snug">{o.face_shape_note}</p>}
        {o.needs_barber_check.length > 0 && <p className="text-[14px] text-ink-2">I-check ng barbero: {o.needs_barber_check.join(' ')}</p>}
        {o.source_ids.length > 0 && sourceTitle && <p className="text-[13px] text-ink-2">Source: {o.source_ids.map(sourceTitle).join(' · ')}</p>}
        {onSelect && (
          <Button variant={selected ? 'primary' : 'secondary'} className="mt-auto" aria-pressed={selected} onClick={onSelect}>
            {selected ? '✓ Napili' : 'Piliin ito'}
          </Button>
        )}
      </div>
    </motion.article>
  )
}

function List({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink-2">
        <span aria-hidden className={`size-2 rounded-full ${tone}`} />{title}
      </h3>
      <ul className="mt-1.5 space-y-1">
        <AnimatePresence initial={false}>
          {items.map(i => (
            <motion.li key={i} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8, transition: { duration: 0.14 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}>{i}</motion.li>
          ))}
        </AnimatePresence>
        {items.length === 0 && <li className="text-ink-2">—</li>}
      </ul>
    </div>
  )
}

/** The consultation note beside the mirror. Items animate as Keep / Change / Avoid change. */
export function AgreementSummary({ c }: { c: Consultation }) {
  const s = c.state
  const opt = s.options.find(o => o.id === s.selected_option_id)
  const confirmedObs = s.observations.filter(o => o.status === 'confirmed')
  const agreed = !!(c.agreement?.customer_confirmed_at && c.agreement?.barber_confirmed_at)
  return (
    <section aria-label="Napagkasunduan" className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[30px] leading-none">Napagkasunduan</h2>
        {c.agreement && <span className="tabular-nums text-[14px] text-ink-2">v{c.agreement.version}</span>}
      </div>
      <AnimatePresence>
        {agreed && (
          <motion.div initial={{ scale: 1.6, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -6 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            className="inline-block rounded-[10px] border-[3px] border-action px-3 py-1 font-display text-2xl text-action" aria-label="Napagkasunduan na ng dalawa">
            ✓ Kasundo
          </motion.div>
        )}
      </AnimatePresence>
      {s.goal && <p className="text-[15px] italic text-ink-2">“{s.goal}”</p>}
      <List title="Keep" items={s.keep} tone="bg-action" />
      <List title="Change" items={s.change} tone="bg-voice" />
      <List title="Avoid" items={s.avoid} tone="bg-error" />
      {opt && <p className="text-[15px]"><span className="font-semibold">Style:</span> {opt.name}</p>}
      {s.face_shape?.confirmed && <p className="text-[15px]"><span className="font-semibold">Hugis ng mukha:</span> {shapeLabel(s.face_shape.confirmed)}</p>}
      {confirmedObs.length > 0 && <List title="Confirmed ng barbero" items={confirmedObs.map(o => o.text)} tone="bg-ink-2" />}
      {s.conflicts.length > 0 && (
        <div role="alert" className="rounded-[14px] bg-error/8 px-3.5 py-2.5 text-[15px] text-error">⚠ May salungat: {s.conflicts.map(x => x.text).join('; ')}</div>
      )}
    </section>
  )
}
