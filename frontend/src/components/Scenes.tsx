import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { Consultation, Part, PartOption, ProblemId, Stage } from '../api'
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
  { stage: 'photos', label: 'Photos' }, { stage: 'goal', label: 'Usapan' }, { stage: 'reveal', label: 'Reveal' },
  { stage: 'sides', label: 'Gilid' }, { stage: 'top', label: 'Ibabaw' }, { stage: 'summary', label: 'Final' },
  { stage: 'cutting', label: 'Gupit' }, { stage: 'done', label: 'Rating' },
]
const PROMPT: Partial<Record<Stage, string>> = {
  photos: 'Kunan muna natin ng harap at gilid.',
  goal: 'Kwento mo, anong look ang gusto mo?',
  reveal: 'Heto ang nakita ko.',
  sides: 'Sa gilid muna tayo.',
  top: 'Ngayon, sa ibabaw naman.',
  summary: 'Final check bago gumupit.',
  cutting: 'Gupitan time. Checkpoint tayo.',
  done: 'Tapos na! Kumusta ang gupit?',
}
const OPENER: Partial<Record<Stage, string>> = {
  photos: 'Harap muna, tapos gilid. Ayos lang kahit hindi perpekto ang anggulo, basta kita ang tenga at noo.',
  goal: 'Para saan ang gupit mo ngayon, at anong dating ang gusto mong ma-achieve? Kwento mo rin kung may problema sa buhok.',
  reveal: 'Heto ang tantiya sa hugis ng mukha. Gabay lang ito; ang gusto mo pa rin ang masusunod.',
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

/** What Kuya Pal is saying right now: the live stream, else his last turn, else the stage opener. */
function bubbleOf(c: Consultation, h: Hook) {
  const job = h.runningJob
  if (job?.type === 'chat') return { text: job.partial_text || '', streaming: true }
  const part = c.stage === 'sides' || c.stage === 'top' ? c.state[c.stage].intro : null
  const lastAi = [...(c.state.chat ?? [])].reverse().find(t => t.role === 'ai')?.text
  const text = ['goal', 'sides', 'top'].includes(c.stage) ? (lastAi ?? part ?? OPENER[c.stage]) : OPENER[c.stage] ?? ''
  return { text, streaming: false }
}

/** Left panel: the barber persona, the conversation, and the voice/typing dock. */
export function BarberPanel({ c, f, h, compact, onRecording, recording }: SceneProps & { onRecording: (r: boolean) => void; recording: boolean }) {
  const bubble = bubbleOf(c, h)
  return (
    <div className={`flex min-h-0 flex-col ${compact ? 'gap-2 shrink-0' : 'h-full gap-3'}`}>
      <div className="flex items-end gap-3">
        <Character state={moodOf(c, h, recording)} size={compact ? 44 : 88} />
        <AnimatePresence mode="wait">
          <motion.h1 key={c.stage} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}
            className={`pb-1 font-display ${compact ? 'text-[24px]' : 'text-[clamp(1.9rem,2.6vw,2.6rem)]'}`}>{PROMPT[c.stage]}</motion.h1>
        </AnimatePresence>
      </div>
      {(!compact || ['goal','sides','top'].includes(c.stage)) && (bubble.text !== '' || bubble.streaming) ? (
        <motion.div layout className={`glass rounded-[22px] rounded-tl-[6px] p-4 ${compact ? 'text-[14px] py-2 max-h-20 overflow-y-auto' : 'text-[15px] leading-relaxed flex-1 min-h-0 overflow-y-auto'}`} aria-live="polite">
          <p className="mb-1 text-[13px] font-semibold text-action">Kuya Pal</p>
          <p className={bubble.streaming ? 'caret' : ''}>{bubble.text || (bubble.streaming ? '' : '')}</p>
        </motion.div>
      ) : null}
      {c.stage === 'goal' && !compact && (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PROBLEM_LABEL) as ProblemId[]).map(p => {
            const on = c.state.problems?.includes(p)
            return <Chip key={p} pressed={on} onClick={() => f.problem(p, !!on)} className="min-h-10 text-[14px]">{PROBLEM_LABEL[p]}</Chip>
          })}
        </div>
      )}
      {!compact && c.stage !== 'cutting' && c.stage !== 'done' && (
        <Talk onSend={f.say} onAudio={f.audio} transcript={h.results.transcribe?.text} transcriptId={h.results.transcribe?.job_id} busy={!!h.runningJob} onRecordingChange={onRecording} />
      )}
      {<JobStatus job={h.runningJob} />}
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
export function GoalScene({ c, f, compact }: SceneProps) {
  const s = c.state
  const brief = s.brief
  const labels: Record<string,string> = { occasion:'Para saan', desired_impression:'Dating', change_level:'Pagbabago', styling_minutes:'Minuto sa styling', maintenance_preference:'Upkeep', dress_rules:'Aktuwal na rules', inspiration:'Inspiration', keep:'Panatilihin', avoid:'Iwasan', change:'Baguhin' }
  const entries = Object.entries({...(brief ?? {}),keep:s.keep,avoid:s.avoid,change:s.change}).filter(([k,v]) => k !== 'evidence' && v !== null && v !== undefined && v !== '' && (!Array.isArray(v) || v.length))
  const turns = (s.chat ?? []).slice(compact ? -3 : -6)
  return (
    <Card className={`flex h-full min-h-0 flex-col gap-3 ${compact ? 'p-3' : 'p-5'}`}>
      <div className="min-h-0 flex-1 overflow-y-auto space-y-3">
        {turns.length ? turns.map((t,i) => <p key={i} className={`max-w-[92%] rounded-[16px] px-3 py-2 text-[15px] ${t.role === 'ai' ? 'bg-surface' : 'ml-auto bg-action text-on-action'}`}><span className="block text-xs opacity-75">{t.role === 'ai' ? 'Kuya Pal' : t.role === 'barber' ? 'Barbero' : 'Ikaw'}</span>{t.text}</p>) : <p className="text-ink-2">School, work, birthday, o everyday? Anong look ang gusto mong dating, at ano ang ayaw mong mawala?</p>}
      </div>
      {entries.length > 0 && <details className="shrink-0 rounded-xl bg-subtle px-3 py-2 text-sm"><summary className="cursor-pointer font-semibold">Ang pagkaintindi natin · {entries.length} detalye</summary><div className="mt-2 max-h-32 overflow-y-auto space-y-1">{entries.map(([k,v]) => <p key={k}><strong>{labels[k]}: </strong>{Array.isArray(v) ? v.join(', ') : String(v)}</p>)}<p className="text-ink-2">May mali? Sabihin ang correction sa usapan.</p></div></details>}
      {!turns.length && <div className="flex flex-wrap gap-2">{['Para sa school','Para sa work','Birthday look'].map(text => <Chip key={text} className="min-h-10" onClick={() => f.say(text,'customer','typed')}>{text}</Chip>)}</div>}
      {s.conflicts.map(conflict => <div key={conflict.id} className="text-sm"><p>{conflict.text}</p><div className="flex gap-2"><Button onClick={() => f.contribute({kind:'resolve_conflict', conflict_id:conflict.id,keep:'first'})}>Unang preference</Button><Button onClick={() => f.contribute({kind:'resolve_conflict',conflict_id:conflict.id,keep:'second'})}>Ikalawang preference</Button></div></div>)}
    </Card>
  )
}

/* ---------------- reveal ---------------- */
export function RevealScene({ c, f, h, role, compact }: SceneProps) {
  const s=c.state
  const front=c.photos.filter(p => p.view==='front').at(-1)
  const face=h.results.faceshape ?? s.face_shape
  const shape=s.face_shape?.confirmed ?? s.face_shape?.suggested?.[0]
  const [factIndex,setFactIndex]=useState(0)
  const facts=s.observations.filter(o => o.status!=='rejected')
  const at=Math.min(factIndex,Math.max(0,facts.length-1)); const fact=facts[at]
  if (!s.revealed) return <Card className="grid h-full place-items-center p-6 text-center"><div className="space-y-4"><p className="font-display text-3xl">Tingnan ang hugis ng mukha</p><p className="text-ink-2">Tantiya lang ito, hindi pagpili ng gupit.</p>{role==='barber' ? <Button onClick={f.reveal}>Ipakita ang resulta</Button> : <p>Hinihintay ang barbero.</p>}</div></Card>
  return <Card className={`flex h-full min-h-0 flex-col gap-3 ${compact ? 'p-3' : 'p-5'}`}>
    {front && <div className={compact ? 'phone-face shrink-0' : 'min-h-0 flex-1 overflow-hidden'}><Photo src={front.url} label="Harap" face={face} /></div>}
    <p className="font-display text-[28px] leading-none">Mukhang {shape ? shapeLabel(shape) : 'hindi tiyak'}</p>
    <p className="text-sm text-ink-2">Gabay lang; ang preferences mo ang masusunod. Puwedeng magpatuloy kahit hindi tiyak.</p>
    {role==='barber' && <FaceShapeChips c={c} onPick={confirmed => f.contribute({kind:'face_shape',confirmed})} />}
    {role==='barber' && <div className="flex flex-wrap gap-2"><Button className="min-h-10" disabled={!!h.runningJob} onClick={f.analyzeHair}>AI hair analysis · optional</Button><Button className="min-h-10" onClick={() => {const text=window.prompt('Ano ang nakita sa buhok?'); if(text?.trim()) f.contribute({kind:'observation_add',text:text.trim(),region:'general'})}}>Barber observation</Button></div>}
    {role==='barber' && fact && <div className="shrink-0 space-y-2 text-sm"><p>{fact.text} <span className="text-ink-2">· {fact.status}</span></p><div className="flex flex-wrap gap-2"><Button className="min-h-10" onClick={() => f.contribute({kind:'observation',observation_id:fact.id,status:'confirmed'})}>Confirm</Button><Button className="min-h-10" onClick={() => {const text=window.prompt('Ayusin ang observation',fact.text); if(text?.trim()) f.contribute({kind:'observation',observation_id:fact.id,status:'confirmed',text:text.trim()})}}>Edit</Button><Button className="min-h-10" onClick={() => f.contribute({kind:'observation',observation_id:fact.id,status:'rejected'})}>Reject</Button>{facts.length>1 && <Button className="min-h-10" onClick={() => setFactIndex((at+1)%facts.length)}>Observation {at+1}/{facts.length} →</Button>}</div></div>}
  </Card>
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
      {o.why && <span className={`text-[14.5px] ${compact ? '' : ''}`}>{o.why}</span>}
      <span className="grid gap-0.5 text-[14px]">
        {o.pros.slice(0, 2).map(p => <span key={p}><span className="text-action">✓</span> {p}</span>)}
        {o.cons.slice(0, 2).map(p => <span key={p} className="text-ink-2"><span aria-hidden>–</span> {p}</span>)}
      </span>
    </motion.button>
  )
}

export function PartScene({ c, f, h, compact }: SceneProps) {
  const part = c.stage as Part
  const ps = c.state[part]
  const [custom, setCustom] = useState('')
  const [optionIndex, setOptionIndex] = useState(0)
  const chosen = ps.choice
  const busy = !!h.runningJob
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-2">
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
        <div className={`grid min-h-0 gap-3 ${compact ? 'grid-rows-[auto_1fr]' : 'grid-cols-3'}`}>
          {compact && <div role="tablist" aria-label="Part options" className="flex gap-2">
            {ps.options.map((o, i) => <button role="tab" aria-selected={optionIndex === i} key={o.id} onClick={() => setOptionIndex(i)} className={`min-h-11 flex-1 rounded-full px-2 text-sm ${optionIndex === i ? 'bg-action text-on-action' : 'glass'}`}>Option {i + 1}{ps.recommended_id === o.id ? ' ★' : ''}</button>)}
          </div>}
          {(compact ? [ps.options[optionIndex] ?? ps.options[0]] : ps.options).map((o, i) => (
            <motion.div key={o.id} className="min-h-0 overflow-y-auto" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...shared, delay: i * 0.05 }}>
              <OptionTile o={o} compact={compact} recommended={ps.recommended_id === o.id} selected={chosen?.id === o.id} onPick={() => f.choose(part, { option_id: o.id })} />
            </motion.div>
          ))}
        </div>
      ) : (
        <Card className="grid place-items-center p-6 text-center">
          <p className="max-w-[36ch] text-ink-2">{busy ? `Pinipili ni Kuya Pal ang bagay sa ${part === 'sides' ? 'gilid' : 'ibabaw'} mo…` : 'Kwento muna ang gusto mo, o mag-suggest batay sa usapan, routine, problema at preferences mo.'}</p>
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
  const a = c.agreement
  const sidesId = s.sides.choice?.id as Parameters<typeof HaircutPreview>[0]['sides'] | undefined
  const topId = s.top.choice?.id as Parameters<typeof HaircutPreview>[0]['top'] | undefined
  const rows: [string, string][] = [
    ['Gilid', choiceName(s.sides)], ['Ibabaw', choiceName(s.top)],
    ['Para sa', s.brief?.occasion || '—'],
    ['Dating / routine', [s.brief?.desired_impression?.join(', '), s.brief?.styling_minutes != null ? `${s.brief.styling_minutes} min mag-ayos` : ''].filter(Boolean).join(' · ') || '—'],
    ['Hugis ng mukha', s.face_shape?.confirmed ? shapeLabel(s.face_shape.confirmed) : s.face_shape?.suggested?.[0] ? shapeLabel(s.face_shape.suggested[0]) : '—'],
    ['Keep', s.keep.join(', ') || '—'], ['Avoid', s.avoid.join(', ') || '—'],
    ['Problema', (s.problems ?? []).map(p => PROBLEM_LABEL[p]).join(', ') || '—'],
  ]
  return (
    <div className={`grid h-full min-h-0 gap-4 ${compact ? '' : 'grid-cols-[1.1fr_0.9fr]'}`}>
      <Card className={`flex min-h-0 flex-col ${compact ? "p-3" : "p-5"}`}>
        {compact && <div className="float-preview"><HaircutPreview sides={sidesId ?? null} top={topId ?? null} size={90} /></div>}
        <h2 className="font-display text-[28px] leading-none">Napagkasunduan</h2>
        <dl className="mt-3 grid min-h-0 content-start overflow-y-auto grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15.5px]">
          {rows.flatMap(([k, v]) => [<dt key={`t${k}`} className="font-semibold text-ink-2">{k}</dt>, <dd className="min-w-0 break-words" key={`d${k}`}>{v}</dd>])}
        </dl>
        <div className="flex-1" />
        <div className="mt-4 flex shrink-0 flex-wrap items-center gap-2">
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
      {!compact && <Card className="grid min-h-0 place-items-center p-4">
        <HaircutPreview sides={sidesId ?? null} top={topId ?? null} size={compact ? 200 : 300} />
        <p className="text-center text-[13px] text-ink-2">Illustration ng napagkasunduan · hindi ikaw ito{s.sides.choice?.custom || s.top.choice?.custom ? " · generic para sa custom choice" : ""}</p>
      </Card>}
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
        <div className="flex min-h-0 flex-col gap-2">
          <p className="shrink-0 text-sm">{capturing === "sides" ? "Ipakita ang gilid at tenga, hindi harap lang." : "Itaas nang kaunti ang camera para kita ang ibabaw at fringe."}</p>
          <div className="min-h-0 flex-1"><Mirror busy={!!h.runningJob} onCapture={async blob => { setCapturing(null); await f.checkpoint(blob, capturing) }} /></div>
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
  const [score, setScore] = useState(c.state.rating?.score ?? 0)
  const [tags, setTags] = useState<string[]>(c.state.rating?.tags ?? [])
  const [notes, setNotes] = useState('')
  const [preferred, setPreferred] = useState(true)
  const [keepPhotos, setKeepPhotos] = useState(false)
  const [busy, setBusy] = useState(false)
  const sharedRating = c.state.rating
  const shownScore = role === 'barber' && sharedRating ? sharedRating.score : score
  const shownTags = role === 'barber' && sharedRating ? sharedRating.tags : tags
  const submitRating = async () => { setBusy(true); await f.rate(score, tags); setBusy(false) }
  return (
    <Card className="mx-auto grid h-full w-full max-w-3xl content-center gap-5 p-6 text-center">
      <div role="radiogroup" aria-label="Rating sa barbero" className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map(n => (
          <motion.button key={n} role="radio" aria-checked={shownScore === n} aria-label={`${n} sa 5`} whileTap={{ scale: 0.85 }}
            animate={{ scale: n <= shownScore ? 1.08 : 1, rotate: n <= shownScore ? -8 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}
            disabled={role === "barber" && !!sharedRating} onClick={() => setScore(n)} className="rounded-full p-1">
            <Scissors on={n <= shownScore} />
          </motion.button>
        ))}
      </div>
      <p className="font-display text-[30px]">{['Pumili ng rating', 'Kailangan pang ayusin', 'Pwede na', 'Ayos', 'Ang ganda', 'Solid, idol!'][shownScore]}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {TAGS.map(t => <Chip key={t} disabled={role === "barber" && !!sharedRating} pressed={shownTags.includes(t)} onClick={() => setTags(x => x.includes(t) ? x.filter(y => y !== t) : [...x, t])}>{t}</Chip>)}
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
          <Button variant="primary" className="min-h-14 rounded-full text-lg" disabled={busy || shownScore === 0}
            onClick={async () => { setBusy(true); await onComplete({ score: shownScore, tags: shownTags }, notes.trim(), preferred, keepPhotos); setBusy(false) }}>
            I-save at tapusin
          </Button>
        </div>
      )}
      {role === 'customer' && <>
        <Button variant="primary" className="min-h-12 rounded-full" disabled={busy || score === 0} onClick={submitRating}>{busy ? 'Sine-send…' : 'I-send ang rating'}</Button>
        {sharedRating && <p className="text-sm text-action">✓ Natanggap ng barbero ang {sharedRating.score}/5. Hinihintay ang pag-save.</p>}
      </>}
      {role === 'barber' && sharedRating && <p className="text-sm text-action">Rating mula sa phone ng customer · {sharedRating.score}/5</p>}
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
