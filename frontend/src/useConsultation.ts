import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, waitForJob, type Consultation, type Contribution, type FaceShapeResult, type Job, type JobType, type Part } from './api'

export interface JobResults { faceshape?: FaceShapeResult; transcribe?: { text: string; language: string; job_id: string } }

/** Shared consultation state. Writes use the last known revision and retry once on a conflict, so no GET precedes each POST. */
export function useConsultation(id: string | null) {
  const [c, setC] = useState<Consultation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [ended, setEnded] = useState(false)
  const [results, setResults] = useState<JobResults>({})
  const [activeJobs, setActiveJobs] = useState<Record<string, Job>>({})
  const seenJobs = useRef(new Set<string>())
  const followers = useRef(new Map<string, Promise<Job>>())
  const controllers = useRef(new Set<AbortController>())
  const mounted = useRef(true)
  const latest = useRef<Consultation | null>(null)
  const lastJson = useRef('')

  const accept = useCallback((next: Consultation) => {
    const prev = latest.current
    if (prev && prev.id === next.id && next.revision < prev.revision) return
    const json = JSON.stringify(next)
    if (json === lastJson.current) return  // nothing changed: skip a full re-render
    lastJson.current = json
    latest.current = next
    setC(next)
  }, [])

  const absorbJob = useCallback((j: Job) => {
    if (!mounted.current || seenJobs.current.has(j.id)) return
    if (j.status === 'done' && (j.type === 'faceshape' || j.type === 'transcribe')) {
      setResults(r => ({ ...r, [j.type]: j.type === 'transcribe' ? { ...j.result, job_id: j.id } : j.result }))
    }
    if (!['queued', 'running'].includes(j.status)) seenJobs.current.add(j.id)
  }, [])

  const follow = useCallback((job: Job) => {
    const existing = followers.current.get(job.id)
    if (existing) return existing
    const controller = new AbortController()
    controllers.current.add(controller)
    const tick = (j: Job) => {
      if (!mounted.current) return
      setActiveJobs(all => {
        const next = { ...all }
        if (j.status === 'queued' || j.status === 'running') next[j.id] = { ...all[j.id], ...j }
        else delete next[j.id]
        return next
      })
    }
    tick(job)
    const pending = waitForJob(job.id, tick, controller.signal, job.type).then(j => {
      absorbJob(j)
      if (j.status === 'failed' && mounted.current) setError(j.error?.message ?? 'Hindi natapos si Kuya Gup. Subukan ulit.')
      return j
    }).finally(() => {
      followers.current.delete(job.id)
      controllers.current.delete(controller)
      if (mounted.current) setActiveJobs(all => { const next = { ...all }; delete next[job.id]; return next })
    })
    followers.current.set(job.id, pending)
    return pending
  }, [absorbJob])

  const refresh = useCallback(async () => {
    if (!id) return null
    try {
      const next = await api.consultation(id)
      if (!mounted.current) return null
      accept(next)
      setOffline(false)
      for (const j of next.recent_jobs ?? (next.active_job ? [next.active_job] : [])) {
        if (j.status === 'queued' || j.status === 'running') void follow(j).catch(() => {})
        else absorbJob(j)
      }
      return next
    } catch (e) {
      if (!mounted.current) return null
      if (e instanceof ApiError && e.code === 'offline') setOffline(true)
      else if (e instanceof ApiError && e.status === 404) setEnded(true)
      else if (e instanceof ApiError) setError(e.message)
      return null
    }
  }, [id, absorbJob, follow, accept])

  const busy = Object.keys(activeJobs).length > 0
  const paired = !!c?.phone_paired
  useEffect(() => {
    mounted.current = true
    // Fast while something is happening or a second device can change state; quiet otherwise.
    const timer = setInterval(() => { void refresh() }, busy || paired ? 1500 : 4000)
    return () => clearInterval(timer)
  }, [refresh, busy, paired])

  useEffect(() => {
    mounted.current = true
    void refresh()
    const pendingControllers = controllers.current
    return () => {
      mounted.current = false
      for (const controller of pendingControllers) controller.abort()
    }
  }, [refresh])

  /** Run a write with the last known revision; on a conflict, refresh once and retry. */
  const withRevision = useCallback(async <T,>(write: (revision: number) => Promise<T>): Promise<T> => {
    const known = latest.current?.revision ?? (await refresh())?.revision ?? 0
    try { return await write(known) }
    catch (e) {
      if (!(e instanceof ApiError && e.code === 'revision_conflict')) throw e
      const fresh = await refresh()
      return await write(e.revision ?? fresh?.revision ?? known)
    }
  }, [refresh])

  const contribute = useCallback(async (contribution: Contribution) => {
    if (!id) return null
    try {
      const next = await withRevision(revision => api.contribute(id, contribution, revision))
      if (mounted.current) { accept(next); setError(null) }
      return next
    } catch (e) {
      if (mounted.current) setError(e instanceof ApiError ? e.message : 'Hindi na-send.')
      return null
    }
  }, [id, withRevision, accept])

  const runJob = useCallback(async (type: JobType, mediaId?: string, part?: Part) => {
    if (!id) return null
    try {
      let done: Job | null = null
      for (let attempt = 0; attempt < 2 && (!done || done.status === 'stale'); attempt++) {
        if (attempt) await refresh()
        const job = await withRevision(revision => api.startJob(id, type, revision, mediaId, part))
        done = await follow(job)
      }
      if (done?.status === 'stale' && mounted.current) setError('Nagbago ang usapan habang nagsusuri. Ulitin ang suggestion.')
      await refresh()
      return done
    } catch (e) {
      if (mounted.current && !(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof ApiError ? e.message : 'Hindi nakapagsimula si Kuya Gup. Subukan ulit.')
      return null
    }
  }, [id, follow, refresh, withRevision])

  /** Every write path reads the newest known consultation, never a stale render copy. */
  const current = useCallback(() => latest.current, [])
  const jobs = Object.values(activeJobs)
  const runningJob = jobs.find(j => j.status === 'running') ?? jobs[0] ?? null
  const chatJob = jobs.find(j => j.type === 'chat' || j.type === 'transcribe') ?? null
  return { c, error, setError, offline, ended, results, runningJob, chatJob, jobs, refresh, contribute, runJob, withRevision, current }
}
