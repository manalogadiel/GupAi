import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CatalogItem, Consultation, Part, PartOption, ProblemId, Stage } from '../api'
import { cutName, useCatalog } from '../catalog'
import { cancelSpeech, setEnabled, speak, ttsAvailable, useSpeechStatus, useSpeaking, useTtsEnabled } from '../speech'
import type { flow } from '../flow'
import type { useConsultation } from '../useConsultation'
import BarberMascot from './BarberMascot'
import Character, { type CharacterState } from './Character'
import { JobStatus } from './ConsultParts'
import { FaceShapePicker, SHAPE_INFO } from './FaceShapes'
import HairProfile, { HAIR_TL } from './HairProfile'
import HaircutPreview, { asSides, asTop } from './HaircutPreview'
import Icon, { type IconName } from './Icon'
import SideProfile from './SideProfile'
import Mirror from './Mirror'
import Photo from './Photo'
import PoseIcon, { POSE_INFO, POSES, type Pose } from './PoseIcon'
import Talk from './Talk'
import { Button, Chip, ErrorLine } from './ui'

type Flow = ReturnType<typeof flow>
type Hook = ReturnType<typeof useConsultation>
export type Role = 'barber' | 'customer'
export interface SceneProps { c: Consultation; f: Flow; h: Hook; role: Role; compact?: boolean }

export const STEPS: { stage: Stage; label: string }[] = [
  { stage: 'photos', label: 'Photos' }, { stage: 'goal', label: 'Usapan' }, { stage: 'reveal', label: 'Scan' },
  { stage: 'sides', label: 'Gilid' }, { stage: 'top', label: 'Ibabaw' }, { stage: 'summary', label: 'Final' },
  { stage: 'cutting', label: 'Gupit' }, { stage: 'done', label: 'Rating' },
]
const PROMPT: Partial<Record<Stage, string>> = {
  photos: 'Tatlong kuha lang: harap, kaliwa, kanan.',
  goal: 'Kwentuhan muna tayo.',
  reveal: 'Suriin natin ang mukha at buhok.',
  sides: 'Sa gilid muna tayo.',
  top: 'Ngayon, sa ibabaw naman.',
  summary: 'Final check bago gumupit.',
  cutting: 'Gupitan time.',
  done: 'Tapos na! Kumusta ang gupit?',
}
/** Kuya Gup's instruction for the step. The live conversation lives only in the center thread. */
const INSTRUCTION: Partial<Record<Stage, string>> = {
  photos: 'Sundan lang ang guhit sa camera. May 3-2-1 bago kumuha, at kusa nang lilipat sa susunod na anggulo. Pindutin ang isang kuha kung gusto mong ulitin.',
  goal: 'Sagutin lang ang mga tanong ko sa usapan. Puwedeng mag-type, o pindutin ang mic. Sa Hands-free, magsalita ka lang at kusa itong magse-send.',
  reveal: 'Titingnan ko ang hugis ng mukha at uri ng buhok mo. Tantya lang ito ng AI, kaya kumpirmahin ng barbero.',
  sides: 'Kung may gusto ka na, piliin sa listahan. Kung wala pa, ako ang magsa-suggest batay sa napag-usapan natin.',
  top: 'Ganun din sa ibabaw: pumili sa listahan, o hayaan akong mag-suggest na bagay sa gilid na napili mo.',
  summary: 'Silipin natin lahat bago gumupit. Kung may gusto kang baguhin, ngayon na.',
  cutting: 'Pag tapos ang isang bahagi, kunan natin para ma-check. Advisory lang ito; ang barbero pa rin ang huhusga.',
  done: 'Salamat! Bigyan mo ng rating ang gupit at ang usapan natin.',
}
export const PROBLEM_LABEL: Record<ProblemId, string> = {
  puffy_sides: 'Umaalsa ang gilid', cowlick: 'May puyo', hard_to_style: 'Hirap i-style',
  grows_fast: 'Mabilis humaba', flat_top: 'Flat sa ibabaw', wide_forehead: 'Malapad ang noo',
}
const PROBLEM_SAY: Record<ProblemId, string> = {
  puffy_sides: 'Umaalsa yung gilid ko pag humahaba.', cowlick: 'May puyo ako na ayaw sumunod.', hard_to_style: 'Hirap akong i-style ang buhok ko.',
  grows_fast: 'Mabilis humaba ang buhok ko.', flat_top: 'Flat at walang volume sa ibabaw.', wide_forehead: 'Gusto kong matakpan nang kaunti ang noo ko.',
}
const shared = { type: 'spring', stiffness: 380, damping: 32 } as const
const NO_TURNS: Consultation['state']['chat'] = []  // stable empty history, so effects don't re-run every render
const PART_TL: Record<Part, string> = { sides: 'gilid', top: 'ibabaw' }

/** Kuya Gup's interview agenda (mirrors backend conversation.next_slot): what he still needs to ask. */
export type Slot = 'problem' | 'occasion' | 'desired_cut' | 'desired_impression' | 'keep_avoid' | 'styling_minutes' | 'done'
export function interviewSlot(c: Consultation): Slot {
  const b = c.state.brief
  if (!(c.state.problems ?? []).length && !b?.problem_detail) return 'problem'
  if (!b?.occasion) return 'occasion'
  if (!b?.desired_cut) return 'desired_cut'
  if (!b?.desired_impression?.length) return 'desired_impression'
  if (!b?.preferences) return 'keep_avoid'
  if (b?.styling_minutes == null && !b?.maintenance_preference) return 'styling_minutes'
  return 'done'
}

export function moodOf(c: Consultation, h: Hook, recording: boolean, speaking = false): CharacterState {
  if (recording || h.chatJob?.type === 'transcribe') return 'listening'
  if (speaking || (h.chatJob?.type === 'chat' && h.chatJob.partial_text)) return 'talking'
  if (h.runningJob) return 'thinking'
  const agreed = !!(c.agreement?.customer_confirmed_at && c.agreement?.barber_confirmed_at)
  return agreed || c.stage === 'done' ? 'happy' : 'idle'
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass rounded-[var(--radius-sheet)] ${className}`}>{children}</div>
}

/* ---------------- left panel: mascot, instruction, memory ---------------- */

/** What Kuya Gup already knows. Fills live from the shared brief, scan and choices. */
function Memory({ c }: { c: Consultation }) {
  const catalog = useCatalog()
  const s = c.state, b = s.brief
  const shape = s.face_shape?.confirmed ?? s.face_shape?.suggested?.[0]
  const hair = s.hair_profile?.confirmed ?? s.hair_profile?.suggested
  const choice = (part: Part) => s[part].choice ? (s[part].choice!.custom ?? cutName(catalog, part, s[part].choice!.id)) : null
  const rows: { icon: IconName; label: string; value: string | null }[] = [
    { icon: 'warning', label: 'Problema', value: [...(s.problems ?? []).map(p => PROBLEM_LABEL[p]), b?.problem_detail ? `“${b.problem_detail}”` : ''].filter(Boolean).join(' · ') || null },
    { icon: 'star', label: 'Para saan', value: b?.occasion ?? null },
    { icon: 'scissors', label: 'Gusto na gupit', value: b?.desired_cut ?? null },
    { icon: 'sparkle', label: 'Dating', value: b?.desired_impression?.length ? (b.desired_impression.join(', ') === 'wala' ? 'kahit ano' : b.desired_impression.join(', ')) : null },
    { icon: 'refresh', label: 'Routine', value: b?.styling_minutes != null ? `${b.styling_minutes} minuto mag-ayos` : b?.maintenance_preference ?? null },
    { icon: 'face', label: 'Mukha', value: shape ? SHAPE_INFO[shape].name + (s.face_shape?.confirmed ? '' : ' (tantya)') : null },
    { icon: 'hair', label: 'Buhok', value: hair ? `${HAIR_TL[hair.density]}, ${HAIR_TL[hair.texture].toLowerCase()}${s.hair_profile?.confirmed ? '' : ' (tantya)'}` : null },
    { icon: 'check', label: 'Iwan / iwasan', value: [...s.keep.map(k => `iwan: ${k}`), ...s.avoid.map(a => `iwasan: ${a}`)].join(' · ')
      || (b?.preferences === 'wala' ? 'wala' : b?.preferences ? `“${b.preferences}”` : null) },
    { icon: 'scissors', label: 'Gilid / ibabaw', value: [choice('sides'), choice('top')].filter(Boolean).join(' + ') || null },
  ]
  const known = rows.filter(r => r.value).length
  return (
    <section aria-label="Alam na ni Kuya Gup" className="glass rounded-[22px] p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-ink-2">Alam na ni Kuya Gup</h2>
        <span className="tabular-nums text-[12px] text-ink-2">{known}/{rows.length}</span>
      </div>
      <ul className="space-y-1.5">
        {rows.map(r => (
          <motion.li key={r.label} layout className={`flex items-start gap-2.5 text-[14px] ${r.value ? '' : 'opacity-45'}`}>
            <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${r.value ? 'bg-action text-on-action' : 'bg-subtle text-ink-2'}`}><Icon name={r.icon} size={14} strokeWidth={2.2} /></span>
            <span className="min-w-0"><span className="font-semibold">{r.label}: </span><span className="break-words">{r.value ?? '—'}</span></span>
          </motion.li>
        ))}
      </ul>
    </section>
  )
}

export function BarberPanel({ c, h, compact, recording }: SceneProps & { recording: boolean }) {
  const mood = moodOf(c, h, recording, useSpeaking())
  const inChat = (t: string) => t === 'chat' || t === 'transcribe' || (t === 'observe' && c.stage !== 'reveal')
  const backgroundJob = h.jobs.find(j => !inChat(j.type)) ?? null
  if (compact) {
    return (
      <div className="flex shrink-0 items-center gap-3">
        <Character state={mood} size={86} />
        <AnimatePresence mode="wait">
          <motion.h1 key={c.stage} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="font-display text-[26px] leading-tight">{PROMPT[c.stage]}</motion.h1>
        </AnimatePresence>
      </div>
    )
  }
  return (
    <div className="scroll-col flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1">
      <div className="relative flex items-end gap-2">
        <div className="relative shrink-0">
          <div aria-hidden className="absolute inset-x-2 bottom-2 top-10 rounded-full bg-peach/70 blur-2xl" />
          <div className="relative"><Character state={mood} size={230} /></div>
        </div>
        <div className="mb-6 min-w-0 flex-1 space-y-2">
          <AnimatePresence mode="wait">
            <motion.h1 key={c.stage} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}
              className="font-display text-[clamp(1.7rem,2.3vw,2.4rem)]">{PROMPT[c.stage]}</motion.h1>
          </AnimatePresence>
          <AnimatePresence mode="wait">
            <motion.p key={c.stage} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="glass relative rounded-[18px] rounded-bl-[4px] p-3 text-[14px] leading-snug">
              <span className="mb-0.5 block text-[12px] font-bold text-action">Kuya Gup</span>{INSTRUCTION[c.stage]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
      <Memory c={c} />
      <JobStatus job={backgroundJob} />
      <ErrorLine message={h.error} />
    </div>
  )
}

/* ---------------- the one conversation thread ---------------- */

function ChatThread({ c, f, h, compact, quickReplies, placeholder, narrow }: SceneProps & { quickReplies?: React.ReactNode; placeholder?: string; narrow?: boolean }) {
  const turns = c.state.chat ?? NO_TURNS
  const job = h.chatJob
  const streaming = job?.type === 'chat' ? job.partial_text ?? '' : null
  const end = useRef<HTMLDivElement>(null)
  const speaking = useSpeaking()
  const speechStatus = useSpeechStatus()
  const tts = useTtsEnabled()
  const reading = h.jobs.find(j => j.type === 'observe' && c.stage !== 'reveal') ?? null
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [turns.length, streaming])
  // Speak each new Kuya Gup turn, never the history already on screen when the page opened.
  const spoken = useRef(turns.length)
  useEffect(() => {
    const last = turns.at(-1)
    if (turns.length > spoken.current && last?.role === 'ai') void speak(last.text, c.id, turns.length - 1)
    spoken.current = turns.length
  }, [turns, c.id])
  useEffect(() => () => cancelSpeech(), [c.id])
  return (
    <Card className={`relative flex h-full min-h-0 flex-col ${compact ? 'p-2.5' : 'p-4'}`}>
      {ttsAvailable && (
        <button type="button" onClick={() => setEnabled(!tts)} aria-pressed={tts} aria-label={tts ? 'I-mute si Kuya Gup' : 'Pasalitain si Kuya Gup'}
          className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-surface text-ink-2 shadow-[var(--shadow-card)] hover:text-ink">
          <Icon name={tts ? 'volume' : 'mute'} size={18} />
        </button>
      )}
      {tts && turns.some(t => t.role === 'ai') && <div className="flex items-center gap-2 pr-10 text-xs text-ink-2">
        <button type="button" className="underline" onClick={() => {
          const index = turns.findLastIndex(t => t.role === 'ai')
          if (index >= 0) void speak(turns[index].text, c.id, index)
        }}>Pakinggan</button>
        <span role="status">{speechStatus}</span>
      </div>}
      <div className="scroll-col min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pb-2" aria-live="polite">
        {turns.map((t, i) => <Bubble key={i} role={t.role} text={t.text} image={t.media_id ? c.photos.find(p => p.id === t.media_id)?.url : undefined} />)}
        {streaming !== null && <Bubble role="ai" text={streaming} streaming />}
        {job?.type === 'transcribe' && <p className="ml-auto w-fit rounded-full bg-subtle px-3 py-1.5 text-[13px] text-ink-2">Isinasalin ang boses mo…</p>}
        {reading && <p className="w-fit rounded-full bg-subtle px-3 py-1.5 text-[13px] text-ink-2">Tinitingnan ni Kuya Gup ang reference photo… <span className="tabular-nums">{Math.round(reading.elapsed_s ?? 0)}s</span></p>}
        {!turns.length && streaming === null && <p className="py-6 text-center text-ink-2">Sandali, babatiin ka ni Kuya Gup…</p>}
        <div ref={end} />
      </div>
      {quickReplies && <div className="flex shrink-0 flex-wrap gap-1.5 pb-2">{quickReplies}</div>}
      <div className="shrink-0"><Talk onSend={t => f.say(t)} onVoice={f.voice} onAttach={f.reference} busy={!!h.chatJob || speaking || !!reading} placeholder={placeholder} micSize={compact || narrow ? 50 : 58} stacked={narrow || compact} /></div>
    </Card>
  )
}

function Bubble({ role, text, streaming, image }: { role: 'ai' | 'customer' | 'barber'; text: string; streaming?: boolean; image?: string }) {
  if (image) {
    return (
      <motion.figure initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="ml-auto w-fit max-w-[60%] overflow-hidden rounded-[18px] rounded-br-[4px] bg-action p-1">
        <img src={image} alt="Reference na gupit" className="max-h-56 rounded-[14px] object-cover" />
        <figcaption className="px-2 py-1 text-[12px] text-on-action/85">Reference na gusto ko</figcaption>
      </motion.figure>
    )
  }
  if (role === 'ai') {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex max-w-[88%] items-end gap-2">
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-peach"><BarberMascot bust size={36} state={streaming ? 'talking' : 'idle'} /></span>
        <p className="rounded-[18px] rounded-bl-[4px] bg-surface px-3.5 py-2.5 text-[15px] leading-snug shadow-[var(--shadow-card)]">
          <span className="block text-[11px] font-bold text-action">Kuya Gup</span>
          <span className={streaming ? 'caret' : ''}>{text}</span>
        </p>
      </motion.div>
    )
  }
  return (
    <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="ml-auto w-fit max-w-[85%] rounded-[18px] rounded-br-[4px] bg-action px-3.5 py-2.5 text-[15px] leading-snug text-on-action">
      {role === 'barber' && <span className="block text-[11px] font-bold opacity-80">Barbero</span>}
      {text}
    </motion.p>
  )
}

/* ---------------- photos: harap → kaliwa → kanan ---------------- */
export function PhotosScene({ c, f, role, compact }: SceneProps) {
  const latest = (pose: Pose) => c.photos.filter(p => p.view === pose).at(-1)
  const [retake, setRetake] = useState<Pose | null>(null)
  // The next missing pose is active, so each capture moves on by itself; tapping a card retakes that pose.
  const active = retake ?? POSES.find(p => !latest(p)) ?? null
  const showMirror = role === 'customer' || !c.phone_paired
  const done = POSES.filter(p => latest(p)).length
  async function capture(blob: Blob) {
    if (!active) return
    await f.photo(blob, active)
    setRetake(null)
  }
  return (
    <div className={`grid h-full min-h-0 gap-4 ${compact ? 'grid-rows-[1fr_auto]' : 'grid-cols-[1.3fr_1fr]'}`}>
      {active && showMirror ? <div className="min-h-0"><Mirror pose={active} onCapture={capture} /></div>
        : active ? (
          <Card className="grid place-items-center p-8 text-center"><div className="space-y-2"><PoseIcon pose={active} size={140} /><p className="font-display text-3xl">Nasa phone ng customer ang camera</p><p className="text-ink-2">Kinukuha: {POSE_INFO[active].label}</p></div></Card>
        ) : (
          <Card className="grid place-items-center p-8 text-center">
            <div className="space-y-3">
              <div className="mx-auto flex w-fit gap-1">{POSES.map(p => <PoseIcon key={p} pose={p} size={96} />)}</div>
              <p className="font-display text-4xl">Kumpleto ang photos</p>
              <p className="text-ink-2">Pindutin ang isang kuha para ulitin, o tumuloy sa Usapan.</p>
            </div>
          </Card>
        )}
      <div className={`grid min-h-0 content-start gap-3 ${compact ? 'grid-cols-3' : ''}`}>
        {!compact && <p className="flex items-baseline justify-between px-1"><span className="text-[13px] font-bold uppercase tracking-wider text-ink-2">Mga kuha</span><span className="tabular-nums text-[13px] text-ink-2">{done}/3</span></p>}
        {POSES.map((pose, i) => {
          const photo = latest(pose)
          const isActive = active === pose
          return (
            <motion.button key={pose} type="button" layout onClick={() => setRetake(pose)} aria-pressed={isActive}
              aria-label={photo ? `Kunan ulit: ${POSE_INFO[pose].label}` : `Kunan: ${POSE_INFO[pose].label}`}
              className={`glass group flex min-h-0 items-center gap-3 rounded-[22px] p-2.5 text-left transition-shadow ${compact ? 'flex-col text-center' : ''} ${
                isActive ? 'shadow-[0_0_0_3px_var(--color-action),var(--shadow-lift)]' : ''}`}>
              <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-[16px] bg-peach/60 ${compact ? 'size-20' : 'size-[84px]'}`}>
                {photo ? <img src={photo.url} alt={`${POSE_INFO[pose].label} photo`} className="size-full object-cover" /> : <PoseIcon pose={pose} size={compact ? 72 : 80} />}
                {photo && <span className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-action text-on-action"><Icon name="check" size={14} strokeWidth={2.8} /></span>}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold"><span className="text-ink-2">{i + 1}.</span> {POSE_INFO[pose].label}</span>
                {!compact && <span className="block text-[13px] text-ink-2">{isActive ? (photo ? 'Kinukunan ulit…' : 'Ngayon na') : photo ? 'Naka-save · pindutin para ulitin' : POSE_INFO[pose].hint}</span>}
              </span>
              {photo && !compact && <span className="ml-auto flex items-center gap-1 rounded-full bg-subtle px-2.5 py-1 text-[12px] font-medium text-ink-2 opacity-0 transition-opacity group-hover:opacity-100"><Icon name="refresh" size={13} /> Ulitin</span>}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- goal: the interview ---------------- */
export function GoalScene(props: SceneProps) {
  const { c, f, role } = props
  const asked = useRef(false)
  // Kuya Gup opens the conversation himself, once, from the laptop.
  useEffect(() => {
    if (role === 'barber' && !asked.current && !(c.state.chat ?? []).length && !props.h.chatJob) { asked.current = true; void f.opener() }
  }, [role, c.state.chat, f, props.h.chatJob])
  const slot = interviewSlot(c)
  const chip = (label: string, say: string) => <Chip key={label} className="min-h-9 px-3 text-[13px]" disabled={!!props.h.chatJob} onClick={() => f.say(say)}>{label}</Chip>
  // One-tap answers for the question Kuya Gup is asking now; each phrase is captured by the backend without the model.
  const quick = slot === 'problem' ? [...(Object.keys(PROBLEM_LABEL) as ProblemId[]).map(p => chip(PROBLEM_LABEL[p], PROBLEM_SAY[p])), chip('Wala naman problema', 'Wala naman problema sa buhok ko.')]
    : slot === 'occasion' ? [chip('School', 'Para sa school.'), chip('Trabaho', 'Para sa trabaho.'), chip('May okasyon', 'May party ako.'), chip('Araw-araw', 'Para sa araw-araw lang.')]
    : slot === 'desired_cut' ? [<Chip key="ref" className="min-h-9 px-3 text-[13px]" disabled={!!props.h.chatJob} onClick={() => document.getElementById('talk-attach')?.click()}><Icon name="image" size={15} /> May picture ako</Chip>,
      chip('Low fade', 'Gusto ko ng low fade.'), chip('Taper', 'Gusto ko ng taper.'), chip('Two block', 'Gusto ko ng two block.'), chip('Bahala na si Kuya Gup', 'Bahala ka na, Kuya.')]
    : slot === 'desired_impression' ? [chip('Malinis', 'Gusto ko malinis tingnan.'), chip('Pormal', 'Gusto ko pormal tingnan.'), chip('Astig', 'Gusto ko astig tingnan.'), chip('Bata tingnan', 'Gusto ko bata tingnan.'), chip('Kahit ano', 'Wala, kahit ano.')]
    : slot === 'keep_avoid' ? [chip('Iwan ang bangs', 'Iwan mo yung bangs.'), chip('Iwan ang haba sa taas', 'Iwan mo yung haba sa taas.'), chip('Ayokong kita ang anit', 'Ayoko ng kita ang anit.'), chip('Wala', 'Wala naman.')]
    : slot === 'styling_minutes' ? [chip('Hilamos lang', 'Hilamos lang ako.'), chip('5 minuto', '5 minuto lang ako mag-ayos.'), chip('10 minuto', '10 minuto ako mag-ayos.'), chip('15+ minuto', '15 minuto ako mag-ayos.')]
    : null
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1"><ChatThread {...props} quickReplies={quick} placeholder="Sagutin si Kuya Gup…" /></div>
      {c.state.conflicts.map(conflict => (
        <Card key={conflict.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
          <Icon name="warning" className="text-voice" /><p className="flex-1">{conflict.text}</p>
          <Button className="min-h-9" onClick={() => f.contribute({ kind: 'resolve_conflict', conflict_id: conflict.id, keep: 'first' })}>Una</Button>
          <Button className="min-h-9" onClick={() => f.contribute({ kind: 'resolve_conflict', conflict_id: conflict.id, keep: 'second' })}>Ikalawa</Button>
        </Card>
      ))}
    </div>
  )
}

/* ---------------- reveal: face + hair scan ---------------- */
export function RevealScene({ c, f, h, role, compact }: SceneProps) {
  const s = c.state
  const front = c.photos.filter(p => p.view === 'front').at(-1)
  const face = h.results.faceshape ?? s.face_shape
  const shape = s.face_shape?.confirmed ?? s.face_shape?.suggested?.[0]
  const scanning = h.jobs.some(j => j.type === 'observe' || j.type === 'faceshape')
  if (!s.revealed) {
    return (
      <Card className="grid h-full place-items-center p-6 text-center">
        <div className="space-y-4">
          <div className="mx-auto flex w-fit gap-3 text-action"><Icon name="face" size={44} /><Icon name="hair" size={44} /></div>
          <p className="font-display text-4xl">Handa na ang scan</p>
          <p className="mx-auto max-w-[40ch] text-ink-2">Titingnan ang hugis ng mukha at uri ng buhok mula sa photo. Tantya lang ito ng AI; ang barbero ang magkukumpirma.</p>
          {role === 'barber' ? <Button variant="primary" className="rounded-full px-6" onClick={f.reveal}>Simulan ang scan</Button> : <p>Hinihintay ang barbero.</p>}
        </div>
      </Card>
    )
  }
  const job = h.jobs.find(j => j.type === 'observe' || j.type === 'faceshape')
  const section = (title: string, status: string, body: React.ReactNode) => (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-ink-2">{title}</h3>
        <span className="text-[13px] text-ink-2">{status}</span>
      </div>
      {body}
    </section>
  )
  const fs = s.face_shape
  return (
    <div className={`grid h-full min-h-0 gap-5 ${compact ? 'grid-rows-[auto_1fr]' : 'grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'}`}>
      {front && (
        // Solid card on purpose: Safari stops repainting animations inside backdrop-filter (glass) elements.
        <div className={`flex min-h-0 flex-col items-center justify-center gap-3 rounded-[var(--radius-sheet)] bg-surface shadow-[var(--shadow-card)] ${compact ? 'p-2' : 'p-5'}`}>
          <div className={compact ? 'phone-face' : ''}><Photo src={front.url} label="Harap" face={face} scanning={scanning} maxHeight={compact ? '80px' : '62dvh'} /></div>
          {scanning && <p className="flex items-center gap-2 text-[14px] font-medium text-voice" aria-live="polite"><Icon name="sparkle" size={16} /> Sinusuri ang buhok… <span className="tabular-nums text-ink-2">{Math.round(job?.elapsed_s ?? 0)}s</span></p>}
        </div>
      )}
      <div className="scroll-col min-h-0 space-y-7 overflow-y-auto px-1 py-2">
        <div>
          <p className="font-display text-[34px] leading-none">Mukhang {shape ? SHAPE_INFO[shape].name.toLowerCase() : 'hindi tiyak'}</p>
          <p className="mt-1 text-[14px] text-ink-2">Gabay lang ang hugis at uri ng buhok. Ang gusto mo pa rin ang masusunod.</p>
        </div>
        {section('Hugis ng mukha', fs?.confirmed ? 'Kinumpirma' : fs?.suggested?.length ? `Tantya: ${fs.suggested.map(x => SHAPE_INFO[x].name).join(' o ')}` : 'Piliin ng barbero',
          role === 'barber' ? <FaceShapePicker c={c} onPick={confirmed => f.contribute({ kind: 'face_shape', confirmed })} />
            : <p className="text-ink-2">{shape ? SHAPE_INFO[shape].trait : '—'}</p>)}
        {section('Uri ng buhok', s.hair_profile?.confirmed ? 'Kinumpirma' : s.hair_profile?.suggested ? 'Tantya mula sa photo' : scanning ? 'Sinusuri…' : '',
          <HairProfile profile={s.hair_profile} scanning={scanning} editable={role === 'barber'} onConfirm={f.confirmHair} onScan={f.scanHair} />)}
      </div>
    </div>
  )
}

/* ---------------- sides / top ---------------- */

/** One suggested cut: drawn preview, why it suits this customer, pros/cons and upkeep. */
function SuggestionCard({ o, part, other, recommended, selected, onPick, big }: {
  o: PartOption; part: Part; other: string | null; recommended: boolean; selected: boolean; onPick: () => void; big?: boolean
}) {
  const sides = part === 'sides' ? asSides(o.id) : asSides(other)
  const top = part === 'top' ? asTop(o.id) : asTop(other)
  return (
    <motion.article layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={shared}
      className={`glass flex min-h-0 flex-col gap-3 overflow-y-auto rounded-[22px] p-4 ${selected ? 'shadow-[0_0_0_3px_var(--color-action),var(--shadow-lift)]' : ''} ${big ? 'row-span-2' : ''}`}>
      <div className={`flex gap-3 ${big ? 'flex-col items-center text-center' : 'flex-col items-start 2xl:flex-row 2xl:items-center'}`}>
        <div className="shrink-0 rounded-[18px] bg-peach/60 p-1">
          {part === 'sides' ? <SideProfile sides={sides} top={top} size={big ? 190 : 104} /> : <HaircutPreview sides={sides} top={top} size={big ? 190 : 104} />}
        </div>
        <div className="min-w-0">
          <div className={`flex flex-wrap items-center gap-2 ${big ? 'justify-center' : ''}`}>
            <h3 className={`font-display leading-none ${big ? 'text-[34px]' : 'text-[26px]'}`}>{o.name}</h3>
            {recommended && <span className="flex items-center gap-1 rounded-full bg-voice px-2 py-0.5 text-[11px] font-bold text-white"><Icon name="star" size={11} strokeWidth={2.4} />Pinaka-bagay</span>}
          </div>
          {o.desc && <p className="mt-1 text-[14px] text-ink-2">{o.desc}</p>}
        </div>
      </div>
      {(o.reasons?.length ?? 0) > 0 && (
        <div className="space-y-1.5 rounded-[16px] bg-surface/80 p-3">
          <p className="text-[12px] font-bold uppercase tracking-wider text-ink-2">Bakit bagay sa'yo</p>
          {o.reasons!.map(r => (
            <p key={r.label} className="flex gap-2 text-[13.5px] leading-snug">
              <Icon name={r.fit === 'care' || r.fit === 'worse' ? 'warning' : 'check'} size={16} strokeWidth={2.4} className={`mt-0.5 ${r.fit === 'care' || r.fit === 'worse' ? 'text-voice' : 'text-action'}`} />
              <span><span className="font-semibold">{r.label}.</span> {r.text}</span>
            </p>
          ))}
        </div>
      )}
      {o.why && !o.reasons?.length && <p className="text-[14px]">{o.why}</p>}
      <div className="grid gap-0.5 text-[13.5px]">
        {o.pros.slice(0, big ? 3 : 2).map(p => <span key={p} className="flex gap-1.5"><Icon name="check" size={15} className="mt-0.5 text-action" />{p}</span>)}
        {o.cons.slice(0, big ? 2 : 1).map(p => <span key={p} className="flex gap-1.5 text-ink-2"><Icon name="warning" size={15} className="mt-0.5" />{p}</span>)}
        <span className="mt-1 text-[13px] text-ink-2"><span className="font-semibold">Upkeep:</span> {o.maintenance}</span>
      </div>
      <Button variant={selected ? 'primary' : 'secondary'} className="mt-auto min-h-11 rounded-full" onClick={onPick} aria-pressed={selected}>
        {selected ? <><Icon name="check" size={18} /> Napili</> : 'Piliin ito'}
      </Button>
    </motion.article>
  )
}

/** Every cut in the catalog, drawn, so the customer can point at what they mean. */
function FullList({ part, other, chosen, onPick, onClose }: { part: Part; other: string | null; chosen: string | null; onPick: (o: CatalogItem) => void; onClose: () => void }) {
  const catalog = useCatalog()
  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div role="dialog" aria-modal aria-label={`Lahat ng ${PART_TL[part]}`} onClick={e => e.stopPropagation()}
        initial={{ y: 24, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24 }} transition={shared}
        className="flex max-h-[90dvh] w-full max-w-5xl flex-col rounded-[28px] bg-canvas p-5 shadow-[var(--shadow-lift)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[34px] leading-none">Lahat ng {PART_TL[part]} <span className="text-ink-2">· {catalog?.[part].length ?? '…'}</span></h2>
          <Button variant="quiet" className="min-h-10 rounded-full" onClick={onClose} aria-label="Isara"><Icon name="close" /></Button>
        </div>
        <div className="scroll-col grid min-h-0 grid-cols-2 gap-3 overflow-y-auto pb-1 sm:grid-cols-3 lg:grid-cols-4">
          {(catalog?.[part] ?? []).map(o => {
            const on = chosen === o.id
            return (
              <button key={o.id} type="button" onClick={() => onPick(o)} aria-pressed={on}
                className={`flex flex-col items-center gap-1.5 rounded-[20px] bg-surface p-3 text-center transition-shadow hover:shadow-[var(--shadow-lift)] ${on ? 'shadow-[0_0_0_3px_var(--color-action)]' : 'shadow-[var(--shadow-card)]'}`}>
                {part === 'sides' ? <SideProfile sides={asSides(o.id)} top={asTop(other)} size={130} />
                  : <HaircutPreview sides={asSides(other)} top={asTop(o.id)} size={130} />}
                <span className="flex items-center gap-1 font-semibold">{on && <Icon name="check" size={16} className="text-action" />}{o.name}</span>
                <span className="text-[12.5px] leading-snug text-ink-2">{o.desc}</span>
              </button>
            )
          })}
        </div>
      </motion.div>
    </motion.div>
  )
}

export function PartScene(props: SceneProps) {
  const { c, f, h, compact } = props
  const part = c.stage as Part
  const ps = c.state[part]
  const otherPart: Part = part === 'sides' ? 'top' : 'sides'
  const other = c.state[otherPart].choice?.id ?? null
  const [listOpen, setListOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const [index, setIndex] = useState(0)
  const catalog = useCatalog()
  const chosen = ps.choice
  const suggesting = h.jobs.some(j => j.type === 'suggest')
  const ordered = useMemo(() => [...ps.options].sort((a, b) => Number(b.id === ps.recommended_id) - Number(a.id === ps.recommended_id)), [ps.options, ps.recommended_id])
  const chosenName = chosen ? chosen.custom ?? cutName(catalog, part, chosen.id) : null

  const header = (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto font-display text-[26px] leading-tight">May plano ka na ba sa {PART_TL[part]}?</p>
        <Button className="min-h-10 rounded-full" onClick={() => setListOpen(true)}><Icon name="list" size={18} /> Oo, pipili ako · tingnan lahat</Button>
        <Button variant={ps.options.length ? 'secondary' : 'primary'} className="min-h-10 rounded-full" disabled={suggesting} onClick={() => f.suggest(part)}>
          <Icon name={ps.options.length ? 'refresh' : 'sparkle'} size={18} /> {ps.options.length ? 'I-suggest ulit' : 'Wala pa, i-suggest mo'}
        </Button>
      </div>
      <form className="flex items-center gap-2 rounded-full bg-subtle py-1 pl-4 pr-1"
        onSubmit={e => { e.preventDefault(); if (custom.trim()) { f.choose(part, { custom: custom.trim() }); setCustom('') } }}>
        <label htmlFor="part-custom" className="sr-only">I-describe ang gusto</label>
        <input id="part-custom" value={custom} onChange={e => setCustom(e.target.value)} maxLength={120}
          placeholder={part === 'sides' ? 'O i-describe: hal. “#2 sa gilid, low taper”' : 'O i-describe: hal. “trim lang, iwan ang haba”'}
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-2" />
        <Button type="submit" variant={custom.trim() ? 'primary' : 'quiet'} className="min-h-9 rounded-full" disabled={!custom.trim()}>Ito</Button>
      </form>
      {chosenName && <p className="flex items-center gap-2 text-[15px]"><Icon name="check" size={18} className="text-action" /><span className="font-semibold">Napili:</span> {chosenName}</p>}
    </Card>
  )

  const cards = suggesting ? (
    <Card className="grid h-full place-items-center p-6 text-center">
      <div className="space-y-3"><Character state="thinking" size={150} /><p className="text-ink-2">Pinipili ni Kuya Gup ang bagay sa {PART_TL[part]} mo, batay sa problema, mukha at buhok mo…</p></div>
    </Card>
  ) : ordered.length ? (
    compact ? (
      <div className="flex min-h-0 flex-col gap-2">
        <div role="tablist" className="flex shrink-0 gap-1.5">{ordered.map((o, i) => <button key={o.id} role="tab" aria-selected={index === i} onClick={() => setIndex(i)} className={`min-h-10 flex-1 truncate rounded-full px-2 text-[13px] ${index === i ? 'bg-action text-on-action' : 'glass'}`}>{o.name}</button>)}</div>
        <SuggestionCard o={ordered[index] ?? ordered[0]} part={part} other={other} recommended={(ordered[index] ?? ordered[0]).id === ps.recommended_id} selected={chosen?.id === (ordered[index] ?? ordered[0]).id} onPick={() => f.choose(part, { option_id: (ordered[index] ?? ordered[0]).id })} />
      </div>
    ) : (
      <div className="grid h-full min-h-0 grid-cols-[1.15fr_1fr] grid-rows-2 gap-3">
        {ordered.map((o, i) => <SuggestionCard key={o.id} o={o} part={part} other={other} big={i === 0} recommended={o.id === ps.recommended_id} selected={chosen?.id === o.id} onPick={() => f.choose(part, { option_id: o.id })} />)}
      </div>
    )
  ) : (
    <Card className="grid h-full place-items-center p-6 text-center">
      <div className="max-w-[44ch] space-y-2">
        <HaircutPreview sides={part === 'sides' ? asSides(chosen?.id) : asSides(other)} top={part === 'top' ? asTop(chosen?.id) : asTop(other)} size={150} />
        <p className="text-ink-2">Pumili sa listahan, o pindutin ang <b>i-suggest</b>. Babasahin ko ang problema, gamit, hugis ng mukha at buhok mo, pati ang bagong sinabi mo sa usapan.</p>
      </div>
    </Card>
  )

  return (
    <div className={`grid h-full min-h-0 gap-3 ${compact ? 'grid-rows-[auto_minmax(0,1fr)_minmax(0,0.8fr)]' : 'grid-cols-[1fr_minmax(300px,0.42fr)]'}`}>
      {compact ? <>{header}{cards}<ChatThread {...props} placeholder={`May gusto ka sa ${PART_TL[part]}?`} /></> : <>
        <div className="flex min-h-0 flex-col gap-3">{header}<div className="min-h-0 flex-1">{cards}</div></div>
        <ChatThread {...props} narrow placeholder={`May gusto o ayaw ka sa ${PART_TL[part]}?`} />
      </>}
      <AnimatePresence>{listOpen && <FullList part={part} other={other} chosen={chosen?.id ?? null} onClose={() => setListOpen(false)} onPick={o => { f.choose(part, { option_id: o.id }); setListOpen(false) }} />}</AnimatePresence>
    </div>
  )
}

/* ---------------- summary ---------------- */
export function SummaryScene({ c, f, role, compact }: SceneProps) {
  const s = c.state
  const catalog = useCatalog()
  const [notes, setNotes] = useState('')
  const a = c.agreement
  const name = (part: Part) => s[part].choice ? s[part].choice!.custom ?? cutName(catalog, part, s[part].choice!.id) : '—'
  const hair = s.hair_profile?.confirmed ?? s.hair_profile?.suggested
  const shape = s.face_shape?.confirmed ?? s.face_shape?.suggested?.[0]
  const rows: [string, string][] = [
    ['Gilid', name('sides')], ['Ibabaw', name('top')],
    ['Problema', [...(s.problems ?? []).map(p => PROBLEM_LABEL[p]), s.brief?.problem_detail ?? ''].filter(Boolean).join(' · ') || '—'],
    ['Para sa', s.brief?.occasion || '—'],
    ['Dating / routine', [s.brief?.desired_impression?.join(', '), s.brief?.styling_minutes != null ? `${s.brief.styling_minutes} min mag-ayos` : ''].filter(Boolean).join(' · ') || '—'],
    ['Hugis ng mukha', shape ? SHAPE_INFO[shape].name : '—'],
    ['Buhok', hair ? `${HAIR_TL[hair.density]}, ${HAIR_TL[hair.strand].toLowerCase()} na hibla, ${HAIR_TL[hair.texture].toLowerCase()}` : '—'],
    ['Iwan', s.keep.join(', ') || '—'], ['Iwasan', s.avoid.join(', ') || '—'],
  ]
  return (
    <div className={`grid h-full min-h-0 gap-4 ${compact ? '' : 'grid-cols-[1.1fr_0.9fr]'}`}>
      <Card className={`flex min-h-0 flex-col ${compact ? 'p-3' : 'p-5'}`}>
        {compact && <div className="float-preview"><HaircutPreview sides={asSides(s.sides.choice?.id)} top={asTop(s.top.choice?.id)} size={90} /></div>}
        <h2 className="font-display text-[30px] leading-none">Napagkasunduan</h2>
        <dl className="mt-3 grid min-h-0 grid-cols-[auto_1fr] content-start gap-x-4 gap-y-2 overflow-y-auto text-[15.5px]">
          {rows.flatMap(([k, v]) => [<dt key={`t${k}`} className="font-semibold text-ink-2">{k}</dt>, <dd className="min-w-0 break-words" key={`d${k}`}>{v}</dd>])}
        </dl>
        <div className="flex-1" />
        <div className="mt-4 flex shrink-0 flex-wrap items-center gap-2">
          {a?.customer_confirmed_at ? <span className="flex items-center gap-1.5 rounded-full bg-action/10 px-3 py-2 text-action"><Icon name="check" size={16} /> Customer: Ito ang gusto ko</span>
            : <Button variant="primary" className="rounded-full" onClick={() => f.confirm('customer')}>Customer: Ito ang gusto ko</Button>}
          {role === 'barber' && (a?.barber_confirmed_at ? <span className="flex items-center gap-1.5 rounded-full bg-action/10 px-3 py-2 text-action"><Icon name="check" size={16} /> Barbero: Kaya ko ’to</span> : (
            <>
              <input value={notes} onChange={e => setNotes(e.target.value)} maxLength={300} placeholder="Notes: hal. #2 guard, gunting sa ibabaw"
                className="order-first min-h-11 min-w-0 basis-full rounded-full bg-subtle px-4 outline-none" />
              <Button variant="primary" className="rounded-full" onClick={() => f.confirm('barber', notes.trim())}>Barbero: Kaya ko ’to</Button>
            </>
          ))}
        </div>
      </Card>
      {!compact && <Card className="grid min-h-0 place-items-center p-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <HaircutPreview sides={asSides(s.sides.choice?.id)} top={asTop(s.top.choice?.id)} size={240} />
          <SideProfile sides={asSides(s.sides.choice?.id)} top={asTop(s.top.choice?.id)} size={240} />
        </div>
        <p className="text-center text-[13px] text-ink-2">Illustration ng napagkasunduan · hindi ikaw ito{s.sides.choice?.custom || s.top.choice?.custom ? ' · generic para sa custom choice' : ''}</p>
      </Card>}
    </div>
  )
}

/* ---------------- cutting checkpoints ---------------- */
const CP_LABEL = { ok: 'Walang nakitang concern', review: 'I-review ang area', insufficient: 'Kulang ang view' } as const

const SPOTS = [{ key: 'left', pose: 'left', label: 'Kaliwa', hint: 'Ipakita ang kaliwang gilid at tenga.' },
  { key: 'right', pose: 'right', label: 'Kanan', hint: 'Ipakita ang kanang gilid at tenga.' },
  { key: 'top', pose: 'front', label: 'Ibabaw', hint: 'Itaas nang kaunti ang camera para kita ang ibabaw at fringe.' }] as const

export function CuttingScene({ c, f, h, role, compact }: SceneProps) {
  const [capturing, setCapturing] = useState<(typeof SPOTS)[number] | null>(null)
  const cps = c.state.checkpoints ?? { top: null }
  return (
    <div className={`grid h-full min-h-0 gap-4 ${compact ? '' : 'grid-cols-[1.2fr_1fr]'}`}>
      {capturing ? (
        <div className="flex min-h-0 flex-col gap-2">
          <p className="shrink-0 text-sm">{capturing.hint}</p>
          <div className="min-h-0 flex-1"><Mirror pose={capturing.pose} busy={!!h.runningJob} onCapture={async blob => { const spot = capturing.key; setCapturing(null); await f.checkpoint(blob, spot) }} /></div>
          <Button variant="quiet" className="mt-2" onClick={() => setCapturing(null)}>Kanselahin</Button>
        </div>
      ) : (
        <Card className="flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <HaircutPreview sides={asSides(c.state.sides.choice?.id)} top={asTop(c.state.top.choice?.id)} size={compact ? 140 : 220} />
            <SideProfile sides={asSides(c.state.sides.choice?.id)} top={asTop(c.state.top.choice?.id)} size={compact ? 140 : 220} />
          </div>
          <p className="max-w-[40ch] text-ink-2">Ito ang napagkasunduan. Pag tapos ang isang bahagi, kunan para ma-check ni Kuya Gup. Gabay lang ito; ang barbero pa rin ang huhusga.</p>
        </Card>
      )}
      <div className="grid min-h-0 content-start gap-3 overflow-y-auto">
        {SPOTS.map(spot => {
          const cp = cps[spot.key]
          return (
            <Card key={spot.key} className="flex items-start gap-3 p-3">
              <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-peach/60"><PoseIcon pose={spot.pose} size={52} /></span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display text-[24px] leading-none">{spot.label}</p>
                  {cp && <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${cp.status === 'ok' ? 'bg-action text-on-action' : cp.status === 'review' ? 'bg-voice text-white' : 'bg-subtle'}`}>{CP_LABEL[cp.status]}</span>}
                </div>
                {cp && <p className="text-[14px]">{cp.note}</p>}
                <Button className="min-h-10 w-full rounded-full" disabled={!!h.runningJob} onClick={() => setCapturing(spot)}>
                  <Icon name={cp ? 'refresh' : 'camera'} size={17} /> {cp ? 'Kunan ulit' : `Tapos na ang ${spot.label.toLowerCase()}: kunan`}
                </Button>
              </div>
            </Card>
          )
        })}
        {role === 'barber' && <Button variant="primary" className="rounded-full" onClick={() => f.go('done')}>Tapos na ang gupit <Icon name="right" size={18} /></Button>}
      </div>
    </div>
  )
}

/* ---------------- done: rating ---------------- */
const TAGS = ['Malinis ang fade', 'Sinunod ang usapan', 'Maayos kausap', 'Mabilis', 'Babalik ako']

function Scissors({ on }: { on: boolean }) {
  return <Icon name="scissors" size={44} className={on ? 'text-action' : 'text-boundary/50'} />
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
            disabled={role === 'barber' && !!sharedRating} onClick={() => setScore(n)} className="rounded-full p-1">
            <Scissors on={n <= shownScore} />
          </motion.button>
        ))}
      </div>
      <p className="font-display text-[30px]">{['Pumili ng rating', 'Kailangan pang ayusin', 'Pwede na', 'Ayos', 'Ang ganda', 'Solid, idol!'][shownScore]}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {TAGS.map(t => <Chip key={t} disabled={role === 'barber' && !!sharedRating} pressed={shownTags.includes(t)} onClick={() => setTags(x => x.includes(t) ? x.filter(y => y !== t) : [...x, t])}>{t}</Chip>)}
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
        {sharedRating && <p className="text-sm text-action">Natanggap ng barbero ang {sharedRating.score}/5. Hinihintay ang pag-save.</p>}
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
