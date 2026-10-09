import { api, ApiError, type Contribution, type Speaker } from './api'
import type { useConsultation } from './useConsultation'

type Hook = ReturnType<typeof useConsultation>

/** The consultation actions shared by the laptop and phone screens. */
export function flow(id: string, h: Hook) {
  return {
    /** Upload → face shape (front only) → hair observations. Each step runs on the laptop. */
    async photo(blob: Blob, view: 'front' | 'side') {
      try {
        const media = await api.upload(id, blob, 'photo', view)
        await h.refresh()
        if (view === 'front') await h.runJob('faceshape', media.id)
        await h.runJob('observe', media.id)
      } catch (e) { h.setError(e instanceof ApiError ? e.message : 'Hindi na-upload ang photo.') }
    },
    /** A reviewed sentence from voice or typing, then fresh options that respect it. */
    async say(text: string, speaker: Speaker, inputType: 'typed' | 'voice') {
      const next = await h.contribute({ kind: 'text', speaker, text, input_type: inputType })
      // The input clears once the text is saved; option generation runs on (shown by JobStatus).
      if (next) void h.runJob('propose')
    },
    async audio(clip: Blob) {
      try {
        const media = await api.upload(id, clip, 'audio')
        await h.runJob('transcribe', media.id)
      } catch (e) { h.setError(e instanceof ApiError ? e.message : 'Hindi na-upload ang recording.') }
    },
    contribute: (c: Contribution) => h.contribute(c),
    propose: () => h.runJob('propose'),
  }
}
