import { api, ApiError, type Contribution, type Hair, type Part, type ProblemId, type Speaker, type Stage } from './api'
import type { useConsultation } from './useConsultation'

type Hook = ReturnType<typeof useConsultation>

const STAGE_ORDER: Stage[] = ['photos', 'goal', 'reveal', 'sides', 'top', 'summary']

/** The consultation actions shared by the laptop (barber) and phone (customer) screens. Contract: docs/API-v2.md. */
export function flow(id: string, h: Hook) {
  const fail = (e: unknown, msg: string) => h.setError(e instanceof ApiError ? e.message : msg)

  const say = async (text: string, inputType: 'typed' | 'voice' = 'typed', speaker: Speaker = 'customer') => {
    const next = await h.contribute({ kind: 'text', speaker, text, input_type: inputType })
    if (next) void h.runJob('chat')
    return !!next
  }

  return {
    /** Upload → face shape (front) runs in the background; hair is scanned on Reveal. */
    async photo(blob: Blob, view: 'front' | 'side') {
      try {
        const media = await api.upload(id, blob, 'photo', view)
        await h.refresh()
        if (view === 'front') await h.runJob('faceshape', media.id)
      } catch (e) { fail(e, 'Hindi na-upload ang photo.') }
    },
    /** One conversation turn: save the text, then Kuya Gup answers (streamed). */
    say,
    /** Kuya Gup opens the conversation himself (instant, no model call on the server). */
    opener: () => h.runJob('chat'),
    /** Voice: record → local transcription → sent straight away, no extra tap. */
    async voice(clip: Blob) {
      try {
        const media = await api.upload(id, clip, 'audio')
        const job = await h.runJob('transcribe', media.id)
        const text = job?.status === 'done' ? (job.result?.text as string | undefined)?.trim() : ''
        if (text) return await say(text, 'voice')
        return false
      } catch (e) { fail(e, 'Hindi na-upload ang recording.'); return false }
    },
    rate: (score: number, tags: string[]) => h.contribute({ kind: 'rating', score, tags }),
    problem: (pid: ProblemId, remove: boolean) => h.contribute({ kind: 'problem', id: pid, remove }),
    /** Reveal the face shape, and start the hair scan on the front photo at the same moment. */
    async reveal() {
      const next = await h.contribute({ kind: 'reveal' })
      const front = next?.photos.filter(p => p.view === 'front').at(-1)
      if (next && front && !next.state.hair_profile?.suggested) void h.runJob('observe', front.id)
      return next
    },
    async scanHair() {
      const front = h.current()?.photos.filter(p => p.view === 'front').at(-1)
      if (front) await h.runJob('observe', front.id)
    },
    confirmHair: (hair: Hair) => h.contribute({ kind: 'hair_profile', density: hair.density, strand: hair.strand, texture: hair.texture, hairline: hair.hairline }),
    suggest: (part: Part) => h.runJob('suggest', undefined, part),
    choose: (part: Part, choice: { option_id?: string; custom?: string }) => h.contribute({ kind: 'choose_part', part, ...choice }),
    async confirm(role: Speaker, notes?: string) {
      try { await h.withRevision(revision => api.confirmAgreement(id, role, revision, notes)); await h.refresh() }
      catch (e) { fail(e, 'Hindi na-confirm.') }
    },
    /** Barber marks a part done: capture → advisory AI vision check against the agreed plan. */
    async checkpoint(blob: Blob, part: Part) {
      try {
        const media = await api.upload(id, blob, 'photo', part === 'sides' ? 'side' : 'front')
        await h.runJob('checkpoint', media.id, part)
      } catch (e) { fail(e, 'Hindi na-upload ang checkpoint photo.') }
    },
    /** The server moves one step at a time; walk there so the step bar can jump. */
    async go(target: Stage) {
      try {
        let cur = h.current() ?? await api.consultation(id)
        for (let i = 0; i < 10 && cur.stage !== target; i++) {
          if (cur.stage === 'cutting' && target === 'done') { cur = await api.contribute(id, { kind: 'stage', stage: 'done' }, cur.revision); break }
          const at = STAGE_ORDER.indexOf(cur.stage), to = STAGE_ORDER.indexOf(target)
          if (at < 0 || to < 0) break
          const step = STAGE_ORDER[at + Math.sign(to - at)]
          cur = await h.withRevision(revision => api.contribute(id, { kind: 'stage', stage: step }, revision))
        }
      } catch (e) { fail(e, 'Hindi nakalipat ng step.') }
      await h.refresh()
    },
    contribute: (c: Contribution) => h.contribute(c),
  }
}
