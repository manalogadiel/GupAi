import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, waitForJob, type Consultation, type Contribution, type FaceShapeResult, type Job, type JobType, type Part } from './api'

export interface JobResults { faceshape?: FaceShapeResult; transcribe?: { text: string; language: string; job_id: string } }

/** Poll the shared consultation; each job has its own follower and cancellation signal. */
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

  const absorbJob = useCallback((j: Job) => {
    if (!mounted.current || seenJobs.current.has(j.id)) return
    if (j.status === 'done' && (j.type === 'faceshape' || j.type === 'transcribe')) {
      setResults(r => ({ ...r, [j.type]: j.type === 'transcribe' ? { ...j.result, job_id:j.id } : j.result }))
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
        if (j.status === 'queued' || j.status === 'running') next[j.id] = j
        else delete next[j.id]
        return next
      })
    }
    tick(job)
    const pending = waitForJob(job.id, tick, controller.signal).then(j => {
      absorbJob(j)
      if (j.status === 'failed' && mounted.current) setError(j.error?.message ?? 'Hindi natapos ang AI job.')
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
    if (!id) return
    try {
      const next = await api.consultation(id)
      if (!mounted.current) return
      setC(previous => !previous || previous.id !== next.id || next.revision >= previous.revision ? next : previous)
      setOffline(false)
      for (const j of next.recent_jobs ?? (next.active_job ? [next.active_job] : [])) {
        if (j.status === 'queued' || j.status === 'running') void follow(j).catch(() => {})
        else absorbJob(j)
      }
    } catch (e) {
      if (!mounted.current) return
      if (e instanceof ApiError && e.code === 'offline') setOffline(true)
      else if (e instanceof ApiError && e.status === 404) setEnded(true)
      else if (e instanceof ApiError) setError(e.message)
    }
  }, [id, absorbJob, follow])

  useEffect(() => {
    mounted.current = true
    const timer = setInterval(() => { void refresh() }, 1500)
    void refresh()
    const pendingControllers = controllers.current
    return () => {
      mounted.current = false
      clearInterval(timer)
      for (const controller of pendingControllers) controller.abort()
    }
  }, [refresh])

  const contribute = useCallback(async (contribution: Contribution) => {
    if (!id) return null
    try {
      const current = await api.consultation(id)
      const next = await api.contribute(id, contribution, current.revision)
      if (mounted.current) { setC(next); setError(null) }
      return next
    } catch (e) {
      if (e instanceof ApiError && e.code === 'revision_conflict') { await refresh(); setError('May bagong pagbabago mula sa kabilang device. Paki-ulit.') }
      else if (mounted.current) setError(e instanceof ApiError ? e.message : 'Hindi na-send.')
      return null
    }
  }, [id, refresh])

  const runJob = useCallback(async (type: JobType, mediaId?: string, part?: Part) => {
    if (!id) return null
    try {
      let done: Job | null = null
      for (let attempt = 0; attempt < 2 && (!done || done.status === 'stale'); attempt++) {
        const current = await api.consultation(id)
        const job = await api.startJob(id, type, current.revision, mediaId, part)
        done = await follow(job)
      }
      if (done?.status === 'stale' && mounted.current) setError('Nagbago ang usapan habang nagsusuri. Ulitin ang suggestion.')
      await refresh()
      return done
    } catch (e) {
      if (mounted.current && !(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof ApiError ? e.message : 'Hindi nasimulan ang AI job.')
      return null
    }
  }, [id, follow, refresh])

  const jobs = Object.values(activeJobs)
  const runningJob = jobs.find(j => j.status === 'running') ?? jobs[0] ?? null
  return { c, error, setError, offline, ended, results, runningJob, refresh, contribute, runJob }
}
