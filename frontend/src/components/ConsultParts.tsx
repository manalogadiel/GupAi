import { AnimatePresence, motion } from 'motion/react'
import type { Job } from '../api'
import { api } from '../api'
import { Button } from './ui'

const JOB_TL: Record<string, string> = {
  chat: 'Sumasagot si Kuya Gup', recommend: 'Pumipili si Kuya Gup ng gupit', suggest: 'Pumipili si Kuya Gup ng bagay sa iyo',
  checkpoint: 'Sinisilip ni Kuya Gup ang checkpoint', transcribe: 'Pinapakinggan ni Kuya Gup ang boses mo',
  observe: 'Tinitingnan ni Kuya Gup ang photo', faceshape: 'Sinusukat ni Kuya Gup ang hugis ng mukha',
  propose: 'Nag-iisip si Kuya Gup ng gupit',
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
