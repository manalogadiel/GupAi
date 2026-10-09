import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { Consultation, Part, PartOption, Pick, ProblemId, Stage } from '../api'
import type { flow } from '../flow'
import type { useConsultation } from '../useConsultation'
import Character, { type CharacterState } from './Character'
import { FaceShapeChips, JobStatus } from './ConsultParts'
import HaircutPreview from './HaircutPreview'
import Mirror from './Mirror'
import Photo, { shapeLabel } from './Photo'
import Talk from './Talk'
import { Button, Chip, ErrorLine } from './ui'

type Flow = ReturnType<typeof flow>
type Hook = ReturnType<typeof useConsultation>
export type Role = 'barber' | 'customer'
export interface SceneProps { c: Consultation; f: Flow; h: Hook; role: Role; compact?: boolean }

export const STEPS: { stage: Stage; label: string }[] = [
  { stage: 'photos', label: 'Photos' }, { stage: 'goal', label: 'Goal' }, { stage: 'reveal', label: 'Reveal' },
  { stage: 'sides', label: 'Gilid' }, { stage: 'top', label: 'Ibabaw' }, { stage: 'summary', label: 'Final' },
  { stage: 'cutting', label: 'Gupit' }, { stage: 'done', label: 'Rating' },
]
const PROMPT: Partial<Record<Stage, string>> = {
  photos: 'Kunan muna natin ng harap at gilid.',
  goal: 'Ano ang goal mo sa gupit na ’to?',
  reveal: 'Heto ang nakita ko.',
  sides: 'Sa gilid muna tayo.',
  top: 'Ngayon, sa ibabaw naman.',
  summary: 'Final check bago gumupit.',
  cutting: 'Gupitan time. Checkpoint tayo.',
  done: 'Tapos na! Kumusta ang gupit?',
}
const OPENER: Partial<Record<Stage, string>> = {
  photos: 'Harap muna, tapos gilid. Ayos lang kahit hindi perpekto ang anggulo, basta kita ang tenga at noo.',
  goal: 'Kwento mo lang: anong itsura ang gusto mo, at may problema ka ba sa buhok, gaya ng pumupuff na gilid o puyo?',
  reveal: 'Sinukat ko na ang hugis ng mukha mo at pinili ko ang mga bagay na gupit para sa’yo.',
  summary: 'Silipin natin lahat bago ako gumupit. Kung may gusto kang baguhin, ngayon na.',
  cutting: 'Pag tapos ang gilid, kunan natin para ma-check. Ganun din sa ibabaw.',
  done: 'Salamat! Bigyan mo ng rating ang gupit at ang usapan natin.',
}
export const PROBLEM_LABEL: Record<ProblemId, string> = {
  puffy_sides: 'Pumupuff ang gilid', cowlick: 'May puyo', hard_to_style: 'Hirap i-style',
  grows_fast: 'Mabilis humaba', flat_top: 'Flat sa ibabaw', wide_forehead: 'Malapad ang noo',
}
const shared = { type: 'spring', stiffness: 380, damping: 32 } as const

export function moodOf(c: Consultation, h: Hook, recording: boolean): CharacterState {
  if (recording) return 'listening'
  if (h.runningJob) return 'thinking'
  const agreed = !!(c.agreement?.customer_confirmed_at && c.agreement?.barber_confirmed_at)
  return agreed || c.stage === 'done' ? 'happy' : 'idle'
}

/** What Kuya Gup is saying right now: the live stream, else his last turn, else the stage opener. */
function bubbleOf(c: Consultation, h: Hook) {
  const job = h.runningJob
  if (job?.type === 'chat') return { text: job.partial_text || '', streaming: true }
  const part = c.stage === 'sides' || c.stage === 'top' ? c.state[c.stage].intro : null
  const lastAi = [...(c.state.chat ?? [])].reverse().find(t => t.role === 'ai')?.text
  const text = c.stage === 'goal' ? (lastAi ?? OPENER.goal) : part ?? OPENER[c.stage] ?? lastAi ?? ''
  return { text, streaming: false }
}

/** Left panel: the barber persona, the conversation, and the voice/typing dock. */
export function BarberPanel({ c, f, h, compact, onRecording, recording }: SceneProps & { onRecording: (r: boolean) => void; recording: boolean }) {
  const bubble = bubbleOf(c, h)
  const lastHuman = [...(c.state.chat ?? [])].reverse().find(t => t.role !== 'ai')
  return (
    <div className={`flex min-h-0 flex-col ${compact ? 'gap-3' : 'h-full gap-4'}`}>
      <div className="flex items-end gap-3">
        <Character state={moodOf(c, h, recording)} size={compact ? 64 : 104} />
        <AnimatePresence mode="wait">
          <motion.h1 key={c.stage} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}
            className={`pb-1 font-display ${compact ? 'text-[26px]' : 'text-[clamp(1.9rem,2.6vw,2.6rem)]'}`}>{PROMPT[c.stage]}</motion.h1>
        </AnimatePresence>
      </div>
      {lastHuman && !compact && (
        <p className="ml-auto max-w-[85%] rounded-[18px] rounded-br-[6px] bg-action/90 px-4 py-2.5 text-[15px] text-on-action">{lastHuman.text}</p>
      )}
      {bubble.text !== '' || bubble.streaming ? (
        <motion.div layout className={`glass rounded-[22px] rounded-tl-[6px] p-4 ${compact ? 'text-[15px]' : 'text-[16.5px] leading-relaxed'}`} aria-live="polite">
          <p className="mb-1 text-[13px] font-semibold text-action">Kuya Gup</p>
          <p className={bubble.streaming ? 'caret' : ''}>{bubble.text || (bubble.streaming ? '' : '')}</p>
        </motion.div>
      ) : null}
      {c.stage === 'goal' && (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PROBLEM_LABEL) as ProblemId[]).map(p => {
            const on = c.state.problems?.includes(p)
            return <Chip key={p} pressed={on} onClick={() => f.problem(p, !!on)} className="min-h-10 text-[14px]">{PROBLEM_LABEL[p]}</Chip>
          })}
        </div>
      )}
      {!compact && <div className="flex-1" />}
      {!compact && c.stage !== 'cutting' && c.stage !== 'done' && (
        <Talk onSend={f.say} onAudio={f.audio} transcript={h.results.transcribe?.text} busy={!!h.runningJob && h.runningJob.type !== 'chat'} onRecordingChange={onRecording} />
      )}
      {!compact && <JobStatus job={h.runningJob?.type === 'chat' ? null : h.runningJob} />}
      <ErrorLine message={h.error} />
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass rounded-[var(--radius-sheet)] ${className}`}>{children}</div>
}

/* ---------------- photos ---------------- */
export function PhotosScene({ c, f, h, role, compact }: SceneProps) {
  const front = c.photos.filter(p => p.view === 'front').at(-1)
  const side = c.photos.filter(p => p.view === 'side').at(-1)
  const showMirror = role === 'customer' || !c.phone_paired
  return (
    <div className={`grid h-full min-h-0 gap-4 ${compact ? '' : 'grid-cols-[1.25fr_1fr]'}`}>
      {showMirror ? <div className="min-h-0"><Mirror onCapture={f.photo} busy={!!h.runningJob} /></div> : (
        <Card className="grid place-items-center p-8 text-center"><div><p className="font-display text-3xl">Nasa phone ng customer ang salamin</p><p className="text-ink-2">Lalabas dito ang mga kuha.</p></div></Card>
      )}
      <div className={`grid min-h-0 content-start gap-3 ${compact ? 'grid-cols-2' : ''}`}>
        {(['front', 'side'] as const).map(v => {
          const p = v === 'front' ? front : side
          return (
            <Card key={v} className="flex min-h-0 items-center gap-3 p-3">
              <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-[16px] bg-subtle">
                {p ? <img src={p.url} alt={`${v === 'front' ? 'Harap' : 'Gilid'} photo`} className="size-full object-cover" /> : <span className="text-2xl text-ink-2" aria-hidden>{v === 'front' ? '◉' : '◐'}</span>}
              </div>
              <div className="min-w-0">
                <p className="font-semibold">{v === 'front' ? 'Harap' : 'Gilid'} {p && <span className="text-action">✓</span>}</p>
                <p className="text-[14px] text-ink-2">{p ? 'Naka-save · sinusuri sa likod' : 'Wala pa'}</p>
              </div>
            </Card>
          )
        })}
        {!compact && <p className="px-1 text-[14px] text-ink-2">Ilalabas ang hugis ng mukha at mga suggestion pagkatapos nating mag-usap.</p>}
      </div>
    </div>
  )
}

/* ---------------- goal ---------------- */
export function GoalScene({ c }: SceneProps) {
  const s = c.state
  const turns = (s.chat ?? []).slice(-6)
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-4">
      <Card className="p-5">
        <p className="text-[14px] font-semibold text-ink-2">Goal</p>
        <p className="font-display text-[28px] leading-tight">{s.goal || 'Pinapakinggan pa ni Kuya Gup…'}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(s.problems ?? []).map(p => <span key={p} className="rounded-full bg-peach px-3 py-1 text-[14px]">{PROBLEM_LABEL[p]}</span>)}
          {s.keep.map(k => <span key={`k${k}`} className="rounded-full bg-action/10 px-3 py-1 text-[14px] text-action">Keep: {k}</span>)}
          {s.avoid.map(k => <span key={`a${k}`} className="rounded-full bg-error/10 px-3 py-1 text-[14px] text-error">Avoid: {k}</span>)}
        </div>
      </Card>
      <Card className="scroll-col min-h-0 overflow-y-auto p-5">
        <p className="mb-2 text-[14px] font-semibold text-ink-2">Usapan</p>
        <div className="space-y-2">
          {turns.length === 0 && <p className="text-ink-2">Wala pa. Magsalita o mag-type sa kaliwa.</p>}
          {turns.map((t, i) => (
            <motion.p key={i + t.text.slice(0, 12)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className={`max-w-[88%] rounded-[16px] px-3.5 py-2 text-[15px] ${t.role === 'ai' ? 'bg-surface' : 'ml-auto bg-action text-on-action'}`}>
              {t.text}
            </motion.p>
          ))}
        </div>
      </Card>
    </div>
  )
}

/* ---------------- reveal ---------------- */
function PickCard({ p, top, selected, onPick, compact }: { p: Pick; top?: boolean; selected: boolean; onPick?: () => void; compact?: boolean }) {
  return (
    <motion.button type="button" onClick={onPick} disabled={!onPick} whileTap={{ scale: 0.98 }}
      animate={{ scale: selected ? 1.01 : 1 }} transition={shared}
      className={`glass flex min-h-0 w-full items-center gap-4 rounded-[22px] p-3 text-left transition-shadow ${selected ? 'shadow-[0_0_0_3px_var(--color-action),var(--shadow-lift)]' : ''}`}>
      <img src={p.image} alt="" className={`${top && !compact ? 'size-28' : 'size-20'} shrink-0 rounded-[16px] bg-peach object-cover`} />
      <span className="min-w-0">
        {top && <span className="mb-1 inline-block rounded-full bg-voice px-2.5 py-0.5 text-[12px] font-semibold text-white">Top pick ni Kuya Gup</span>}
        <span className={`block font-display leading-none ${top ? 'text-[34px]' : 'text-[26px]'}`}>{p.name}</span>
        <span className={`mt-1 block text-ink-2 ${top ? 'text-[15px]' : 'line-clamp-2 text-[14px]'}`}>{p.why}</span>
      </span>
      {selected && <span aria-label="Napili" className="ml-auto grid size-8 shrink-0 place-items-center rounded-full bg-action text-on-action">✓</span>}
    </motion.button>
  )
}

export function RevealScene({ c, f, h, role, compact }: SceneProps) {
  const s = c.state
  const front = c.photos.filter(p => p.view === 'front').at(-1)
  const face = h.results.faceshape ?? s.face_shape
  const shape = s.face_shape?.confirmed ?? s.face_shape?.suggested?.[0]
  if (!s.revealed) {
    return (
      <Card className="grid h-full place-items-center p-8 text-center">
        <div className="space-y-5">
          {front && <img src={front.url} alt="" className="mx-auto h-48 w-auto rounded-[24px] object-cover blur-md" />}
          <p className="font-display text-4xl">Handa na ang resulta</p>
          {role === 'barber'
            ? <Button variant="primary" className="min-h-14 rounded-full px-8 text-lg" onClick={f.reveal}>✨ Ipakita ang resulta</Button>
            : <p className="text-ink-2">Hinihintay ang barbero na ipakita.</p>}
        </div>
      </Card>
    )
  }
  const rec = s.recommendations
  return (
    <div className={`grid h-full min-h-0 gap-4 ${compact ? '' : 'grid-cols-[0.8fr_1.2fr]'}`}>
      <Card className="flex min-h-0 flex-col gap-3 p-4">
        {front && !compact && <div className="min-h-0 flex-1 overflow-hidden"><Photo src={front.url} label="Harap" face={face} /></div>}
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="font-display text-[34px] leading-none">
          Mukhang <span className="text-action">{shape ? shapeLabel(shape) : 'hindi tiyak'}</span>
        </motion.p>
        {rec?.face_note && <p className="text-[15px] text-ink-2">{rec.face_note}</p>}
        {role === 'barber' && !compact && <FaceShapeChips c={c} onPick={shape => f.contribute({ kind: 'face_shape', confirmed: shape })} />}
      </Card>
      <div className="grid min-h-0 content-start gap-3">
        {rec ? (
          <>
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...shared, delay: 0.7 }}>
              <PickCard p={rec.top_pick} top compact={compact} selected={s.selected_style === rec.top_pick.catalog_id} onPick={() => f.pickStyle(rec.top_pick.catalog_id)} />
            </motion.div>
            {rec.alternatives.map((a, i) => (
              <motion.div key={a.catalog_id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...shared, delay: 0.85 + i * 0.06 }}>
                <PickCard p={a} compact={compact} selected={s.selected_style === a.catalog_id} onPick={() => f.pickStyle(a.catalog_id)} />
              </motion.div>
            ))}
          </>
        ) : (
          <Card className="grid min-h-48 place-items-center p-6 text-center">
            {h.runningJob ? <p className="text-ink-2">Pinipili ni Kuya Gup ang bagay sa’yo…</p>
              : <Button variant="primary" onClick={f.recommend}>Ipakita ang mga suggestion</Button>}
          </Card>
        )}
      </div>
    </div>
  )
}

/* ---------------- sides / top ---------------- */
function OptionTile({ o, recommended, selected, onPick, compact }: { o: PartOption; recommended: boolean; selected: boolean; onPick: () => void; compact?: boolean }) {
  return (
    <motion.button type="button" onClick={onPick} whileTap={{ scale: 0.98 }} animate={{ scale: selected ? 1.015 : 1 }} transition={shared}
      className={`glass flex min-h-0 flex-col gap-2 rounded-[22px] p-4 text-left ${selected ? 'shadow-[0_0_0_3px_var(--color-action),var(--shadow-lift)]' : ''}`}>
      <span className="flex items-center justify-between gap-2">
        <span className="font-display text-[28px] leading-none">{o.name}</span>
        {selected ? <span className="grid size-7 place-items-center rounded-full bg-action text-on-action">✓</span>
          : recommended ? <span className="rounded-full bg-voice px-2 py-0.5 text-[12px] font-semibold text-white">Recommended</span> : null}
      </span>
      {o.why && <span className={`text-[14.5px] ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}>{o.why}</span>}
      <span className="grid gap-0.5 text-[14px]">
        {o.pros.slice(0, 2).map(p => <span key={p}><span className="text-action">✓</span> {p}</span>)}
        {o.cons.slice(0, compact ? 1 : 2).map(p => <span key={p} className="text-ink-2"><span aria-hidden>–</span> {p}</span>)}
      </span>
    </motion.button>
  )
}

export function PartScene({ c, f, h, compact }: SceneProps) {
  const part = c.stage as Part
  const ps = c.state[part]
  const [custom, setCustom] = useState('')
  const chosen = ps.choice
  const busy = h.runningJob?.type === 'suggest'
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <form className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-subtle py-1.5 pl-5 pr-1.5"
          onSubmit={e => { e.preventDefault(); if (custom.trim()) { f.choose(part, { custom: custom.trim() }); setCustom('') } }}>
          <label htmlFor="part-custom" className="sr-only">Alam ko na ang gusto ko</label>
          <input id="part-custom" value={custom} onChange={e => setCustom(e.target.value)} maxLength={120}
            placeholder={part === 'sides' ? 'Alam ko na: hal. “#2 sa gilid, low taper”' : 'Alam ko na: hal. “trim lang, iwan ang haba”'}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-2" />
          <Button type="submit" variant={custom.trim() ? 'primary' : 'quiet'} className="min-h-10 rounded-full" disabled={!custom.trim()}>Ito</Button>
        </form>
        <Button variant={ps.options.length ? 'secondary' : 'primary'} className="rounded-full" disabled={busy} onClick={() => f.suggest(part)}>
          {ps.options.length ? '↻ Ibang suggestion' : 'Hindi ko alam, i-suggest mo'}
        </Button>
        {chosen?.custom && <p className="w-full text-[15px]"><span className="font-semibold text-action">✓ Napili:</span> “{chosen.custom}”</p>}
      </Card>
      {ps.options.length ? (
        <div className={`grid min-h-0 gap-3 ${compact ? '' : 'grid-cols-3'}`}>
          {ps.options.map((o, i) => (
            <motion.div key={o.id} className="min-h-0" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...shared, delay: i * 0.05 }}>
              <OptionTile o={o} compact={compact} recommended={ps.recommended_id === o.id} selected={chosen?.id === o.id} onPick={() => f.choose(part, { option_id: o.id })} />
            </motion.div>
          ))}
        </div>
      ) : (
        <Card className="grid place-items-center p-6 text-center">
          <p className="max-w-[36ch] text-ink-2">{busy ? `Pinipili ni Kuya Gup ang bagay sa ${part === 'sides' ? 'gilid' : 'ibabaw'} mo…` : 'Sabihin ang gusto mo sa itaas, o hayaan si Kuya Gup na mag-suggest batay sa hugis ng mukha at problema mo.'}</p>
        </Card>
      )}
    </div>
  )
}

/* ---------------- summary ---------------- */
function choiceName(ps: Consultation['state']['sides']) {
  const ch = ps.choice
  if (!ch) return '—'
  return ch.custom ?? ps.options.find(o => o.id === ch.id)?.name ?? ch.id ?? '—'
}

export function SummaryScene({ c, f, role, compact }: SceneProps) {
  const s = c.state
  const [notes, setNotes] = useState('')
  const style = [s.recommendations?.top_pick, ...(s.recommendations?.alternatives ?? [])].find(p => p?.catalog_id === s.selected_style)
  const a = c.agreement
  const sidesId = s.sides.choice?.id as Parameters<typeof HaircutPreview>[0]['sides'] | undefined
  const topId = s.top.choice?.id as Parameters<typeof HaircutPreview>[0]['top'] | undefined
  const rows: [string, string][] = [
    ['Style', style?.name ?? s.selected_style ?? '—'], ['Gilid', choiceName(s.sides)], ['Ibabaw', choiceName(s.top)],
    ['Hugis ng mukha', s.face_shape?.confirmed ? shapeLabel(s.face_shape.confirmed) : s.face_shape?.suggested?.[0] ? shapeLabel(s.face_shape.suggested[0]) : '—'],
    ['Keep', s.keep.join(', ') || '—'], ['Avoid', s.avoid.join(', ') || '—'],
    ['Problema', (s.problems ?? []).map(p => PROBLEM_LABEL[p]).join(', ') || '—'],
  ]
  return (
    <div className={`grid h-full min-h-0 gap-4 ${compact ? '' : 'grid-cols-[1.1fr_0.9fr]'}`}>
      <Card className="flex min-h-0 flex-col p-5">
        <h2 className="font-display text-[34px] leading-none">Napagkasunduan</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15.5px]">
          {rows.flatMap(([k, v]) => [<dt key={`t${k}`} className="font-semibold text-ink-2">{k}</dt>, <dd key={`d${k}`}>{v}</dd>])}
        </dl>
        <div className="flex-1" />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {a?.customer_confirmed_at ? <span className="rounded-full bg-action/10 px-3 py-2 text-action">✓ Customer: Ito ang gusto ko</span>
            : <Button variant="primary" className="rounded-full" onClick={() => f.confirm('customer')}>Customer: Ito ang gusto ko</Button>}
          {role === 'barber' && (a?.barber_confirmed_at ? <span className="rounded-full bg-action/10 px-3 py-2 text-action">✓ Barbero: Kaya ko ’to</span> : (
            <>
              <input value={notes} onChange={e => setNotes(e.target.value)} maxLength={300} placeholder="Notes: hal. #2 guard, gunting sa ibabaw"
                className="min-h-11 min-w-0 flex-1 rounded-full bg-subtle px-4 outline-none" />
              <Button variant="primary" className="rounded-full" onClick={() => f.confirm('barber', notes.trim())}>Barbero: Kaya ko ’to</Button>
            </>
          ))}
        </div>
      </Card>
      <Card className="grid min-h-0 place-items-center p-4">
        <HaircutPreview sides={sidesId ?? null} top={topId ?? null} size={compact ? 200 : 300} />
        <p className="text-center text-[13px] text-ink-2">Illustration ng napagkasunduan · hindi ikaw ito</p>
      </Card>
    </div>
  )
}

/* ---------------- cutting checkpoints ---------------- */
const CP_LABEL = { ok: 'Walang nakitang concern', review: 'I-review ang area', insufficient: 'Kulang ang view' } as const

export function CuttingScene({ c, f, h, role, compact }: SceneProps) {
  const [capturing, setCapturing] = useState<Part | null>(null)
  const cps = c.state.checkpoints ?? { sides: null, top: null }
  return (
    <div className={`grid h-full min-h-0 gap-4 ${compact ? '' : 'grid-cols-[1.2fr_1fr]'}`}>
      {capturing ? (
        <div className="min-h-0">
          <Mirror busy={!!h.runningJob} onCapture={async blob => { setCapturing(null); await f.checkpoint(blob, capturing) }} />
          <Button variant="quiet" className="mt-2" onClick={() => setCapturing(null)}>Kanselahin</Button>
        </div>
      ) : (
        <Card className="grid place-items-center p-6 text-center">
          <p className="max-w-[34ch] text-ink-2">Pag tapos ang isang bahagi, pindutin ang checkpoint para kunan at ma-check ng AI. Advisory lang ito: ang barbero pa rin ang huhusga.</p>
        </Card>
      )}
      <div className="grid min-h-0 content-start gap-3">
        {(['sides', 'top'] as const).map(part => {
          const cp = cps[part]
          return (
            <Card key={part} className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-[26px] leading-none">{part === 'sides' ? 'Gilid' : 'Ibabaw'}</p>
                {cp && <span className={`rounded-full px-2.5 py-1 text-[13px] font-semibold ${cp.status === 'ok' ? 'bg-action text-on-action' : cp.status === 'review' ? 'bg-voice text-white' : 'bg-subtle'}`}>{CP_LABEL[cp.status]}</span>}
              </div>
              {cp && <p className="text-[15px]">{cp.note}</p>}
              <Button className="w-full rounded-full" disabled={!!h.runningJob} onClick={() => setCapturing(part)}>
                {cp ? '↻ Kunan ulit' : `Tapos na ang ${part === 'sides' ? 'gilid' : 'ibabaw'}: kunan`}
              </Button>
            </Card>
          )
        })}
        {role === 'barber' && <Button variant="primary" className="rounded-full" onClick={() => f.go('done')}>Tapos na ang gupit →</Button>}
      </div>
    </div>
  )
}

/* ---------------- done: rating ---------------- */
const TAGS = ['Malinis ang fade', 'Sinunod ang usapan', 'Maayos kausap', 'Mabilis', 'Babalik ako']

function Scissors({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      className={on ? 'text-action' : 'text-boundary/50'}>
      <circle cx="6" cy="6" r="3" fill={on ? 'currentColor' : 'none'} /><circle cx="6" cy="18" r="3" fill={on ? 'currentColor' : 'none'} />
      <path d="M8.6 7.5 20 18M8.6 16.5 20 6" />
    </svg>
  )
}

export function DoneScene({ c, f, role, onComplete }: SceneProps & { onComplete: (rating: { score: number; tags: string[] }, notes: string, preferred: boolean, keepPhotos: boolean) => Promise<void> }) {
  const [score, setScore] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [preferred, setPreferred] = useState(true)
  const [keepPhotos, setKeepPhotos] = useState(false)
  const [busy, setBusy] = useState(false)
  void f
  return (
    <Card className="mx-auto grid h-full w-full max-w-3xl content-center gap-5 p-6 text-center">
      <div role="radiogroup" aria-label="Rating sa barbero" className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map(n => (
          <motion.button key={n} role="radio" aria-checked={score === n} aria-label={`${n} sa 5`} whileTap={{ scale: 0.85 }}
            animate={{ scale: n <= score ? 1.08 : 1, rotate: n <= score ? -8 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}
            onClick={() => setScore(n)} className="rounded-full p-1">
            <Scissors on={n <= score} />
          </motion.button>
        ))}
      </div>
      <p className="font-display text-[30px]">{['Pumili ng rating', 'Kailangan pang ayusin', 'Pwede na', 'Ayos', 'Ang ganda', 'Solid, idol!'][score]}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {TAGS.map(t => <Chip key={t} pressed={tags.includes(t)} onClick={() => setTags(x => x.includes(t) ? x.filter(y => y !== t) : [...x, t])}>{t}</Chip>)}
      </div>
      {role === 'barber' && (
        <div className="grid gap-3 text-left">
          <input value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} placeholder="Talagang ginawa: hal. low taper #2, texture sa ibabaw"
            className="min-h-12 rounded-full bg-subtle px-5 outline-none" />
          {c.customer && (
            <div className="flex flex-wrap justify-center gap-4 text-[15px]">
              <label className="flex items-center gap-2"><input type="checkbox" checked={preferred} onChange={e => setPreferred(e.target.checked)} className="size-5 accent-[var(--color-action)]" /> I-save bilang preferred</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={keepPhotos} onChange={e => setKeepPhotos(e.target.checked)} className="size-5 accent-[var(--color-action)]" /> Itago ang photos</label>
            </div>
          )}
          <Button variant="primary" className="min-h-14 rounded-full text-lg" disabled={busy || score === 0}
            onClick={async () => { setBusy(true); await onComplete({ score, tags }, notes.trim(), preferred, keepPhotos); setBusy(false) }}>
            I-save at tapusin
          </Button>
        </div>
      )}
      {role === 'customer' && score > 0 && <p className="text-ink-2">Salamat! Ipakita sa barbero para ma-save.</p>}
    </Card>
  )
}

/** Picks the right scene for the stage. */
export function Scene(props: SceneProps & { onComplete: Parameters<typeof DoneScene>[0]['onComplete'] }) {
  switch (props.c.stage) {
    case 'photos': return <PhotosScene {...props} />
    case 'goal': return <GoalScene {...props} />
    case 'reveal': return <RevealScene {...props} />
    case 'sides': case 'top': return <PartScene key={props.c.stage} {...props} />
    case 'summary': return <SummaryScene {...props} />
    case 'cutting': return <CuttingScene {...props} />
    case 'done': return <DoneScene {...props} />
    default: return <p className="text-ink-2">Tapos na ang konsultang ito.</p>
  }
}
