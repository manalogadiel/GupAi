import { api, ApiError, type Contribution, type Part, type ProblemId, type Speaker, type Stage } from './api'
import type { useConsultation } from './useConsultation'

type Hook = ReturnType<typeof useConsultation>

const STAGE_ORDER: Stage[] = ['photos', 'goal', 'reveal', 'sides', 'top', 'summary']

/** The consultation actions shared by the laptop (barber) and phone (customer) screens. Contract: docs/API-v2.md. */
export function flow(id: string, h: Hook) {
  const fail = (e: unknown, msg: string) => h.setError(e instanceof ApiError ? e.message : msg)

  return {
    /** Upload → face shape (front) + hair observations, computed in the background and revealed later. */
    async photo(blob: Blob, view: 'front' | 'side') {
      try {
        const media = await api.upload(id, blob, 'photo', view)
        await h.refresh()
        if (view === 'front') await h.runJob('faceshape', media.id)
        await h.runJob('observe', media.id)
      } catch (e) { fail(e, 'Hindi na-upload ang photo.') }
    },
    /** One conversation turn: save the text, then Kuya Gup answers (streamed). The input clears right away. */
    async say(text: string, speaker: Speaker, inputType: 'typed' | 'voice') {
      const next = await h.contribute({ kind: 'text', speaker, text, input_type: inputType })
      if (next) void h.runJob('chat')
    },
    async audio(clip: Blob) {
      try {
        const media = await api.upload(id, clip, 'audio')
        await h.runJob('transcribe', media.id)
      } catch (e) { fail(e, 'Hindi na-upload ang recording.') }
    },
    problem: (pid: ProblemId, remove: boolean) => h.contribute({ kind: 'problem', id: pid, remove }),
    /** Barber reveals the face shape; recommendations generate behind the reveal animation. */
    async reveal() {
      const next = await h.contribute({ kind: 'reveal' })
      if (next && !next.state.recommendations) void h.runJob('recommend')
    },
    recommend: () => h.runJob('recommend'),
    pickStyle: (catalog_id: string) => h.contribute({ kind: 'pick_style', catalog_id }),
    suggest: (part: Part) => h.runJob('suggest', undefined, part),
    choose: (part: Part, choice: { option_id?: string; custom?: string }) => h.contribute({ kind: 'choose_part', part, ...choice }),
    async confirm(role: Speaker, notes?: string) {
      try { await api.confirmAgreement(id, role, (await api.consultation(id)).revision, notes); await h.refresh() }
      catch (e) { fail(e, 'Hindi na-confirm.') }
    },
    /** Barber marks a part done: capture → advisory AI vision check against the agreed plan. */
    async checkpoint(blob: Blob, part: Part) {
      try {
        const media = await api.upload(id, blob, 'photo', 'front')
        await h.runJob('checkpoint', media.id, part)
      } catch (e) { fail(e, 'Hindi na-upload ang checkpoint photo.') }
    },
    /** The server moves one step at a time; walk there so the step bar can jump. */
    async go(target: Stage) {
      try {
        let cur = await api.consultation(id)
        for (let i = 0; i < 10 && cur.stage !== target; i++) {
          if (cur.stage === 'cutting' && target === 'done') { cur = await api.contribute(id, { kind: 'stage', stage: 'done' }, cur.revision); break }
          const at = STAGE_ORDER.indexOf(cur.stage), to = STAGE_ORDER.indexOf(target)
          if (at < 0 || to < 0) break
          cur = await api.contribute(id, { kind: 'stage', stage: STAGE_ORDER[at + Math.sign(to - at)] }, cur.revision)
        }
      } catch (e) { fail(e, 'Hindi nakalipat ng step.') }
      await h.refresh()
    },
    contribute: (c: Contribution) => h.contribute(c),
  }
}
