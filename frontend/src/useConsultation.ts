import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, waitForJob, type Consultation, type Contribution, type FaceShapeResult, type Job, type JobType } from './api'

export interface JobResults { faceshape?: FaceShapeResult; transcribe?: { text: string; language: string } }

/**
 * Shared consultation state for laptop and phone: polls every 1.5 s, runs jobs, and keeps the
 * results that live only in job responses (face outline, transcript) since the server never stores them.
 */
export function useConsultation(id: string | null) {
  const [c, setC] = useState<Consultation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [results, setResults] = useState<JobResults>({})
  const [runningJob, setRunningJob] = useState<Job | null>(null)
  const seenJobs = useRef(new Set<string>())

  const absorbJob = useCallback((j: Job) => {
    if (j.status === 'done' && (j.type === 'faceshape' || j.type === 'transcribe')) setResults(r => ({ ...r, [j.type]: j.result }))
  }, [])

  const refresh = useCallback(async () => {
    if (!id) return
    try {
      const next = await api.consultation(id)
      setC(next); setOffline(false)
      // Another device started a job: follow it so its transient result (e.g. face outline) shows here too.
      const aj = next.active_job
      if (aj && !seenJobs.current.has(aj.id)) {
        seenJobs.current.add(aj.id)
        waitForJob(aj.id).then(absorbJob, () => {})
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'offline') setOffline(true)
      else if (e instanceof ApiError) setError(e.message)
    }
  }, [id, absorbJob])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 1500)
    return () => clearInterval(t)
  }, [refresh])

  /** Send a contribution with the current revision; on 409 refresh and surface the conflict. */
  const contribute = useCallback(async (contribution: Contribution) => {
    if (!id || !c) return null
    try {
      const next = await api.contribute(id, contribution, c.revision)
      setC(next); setError(null)
      return next
    } catch (e) {
      if (e instanceof ApiError && e.code === 'revision_conflict') { await refresh(); setError('May bagong pagbabago mula sa kabilang device. Paki-ulit.') }
      else setError(e instanceof ApiError ? e.message : 'Hindi na-send.')
      return null
    }
  }, [id, c, refresh])

  // Jobs always start from the server's latest revision; a result for an older revision comes back `stale`.
  const runJob = useCallback(async (type: JobType, mediaId?: string) => {
    if (!id) return null
    try {
      let done: Job | null = null
      // A job queued behind another state change comes back `stale`; rerun it once on the new revision.
      for (let attempt = 0; attempt < 2 && (!done || done.status === 'stale'); attempt++) {
        const current = await api.consultation(id)
        const job = await api.startJob(id, type, current.revision, mediaId)
        seenJobs.current.add(job.id)
        setRunningJob(job)
        done = await waitForJob(job.id, setRunningJob)
      }
      if (!done) return null
      absorbJob(done)
      if (done.status === 'failed') setError(done.error?.message ?? 'Hindi natapos ang AI job.')
      await refresh()
      return done
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Hindi nasimulan ang AI job.')
      return null
    } finally {
      setRunningJob(null)
    }
  }, [id, absorbJob, refresh])

  return { c, error, setError, offline, results, runningJob, refresh, contribute, runJob }
}
