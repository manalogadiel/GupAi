// Typed client for docs/API.md (v1). Keep in sync with the contract, not with backend internals.

export interface Rating { score: number; tags: string[] }
export type Speaker = 'customer' | 'barber'
export type Stage = 'photos' | 'goal' | 'reveal' | 'sides' | 'top' | 'summary' | 'cutting' | 'done' | 'completed' | 'abandoned'
export type Part = 'sides' | 'top'
export type ProblemId = 'puffy_sides' | 'cowlick' | 'hard_to_style' | 'grows_fast' | 'flat_top' | 'wide_forehead'
export interface Reason { label: string; text: string; fit: 'helps' | 'care' | 'worse' | 'neutral' }
export interface PartOption { id: string; name: string; desc?: string; reasons?: Reason[]; pros: string[]; cons: string[]; why: string; maintenance: string }
export interface CatalogItem { id: string; name: string; desc: string; maintenance: string; pros: string[]; cons: string[] }
export type Density = 'thin' | 'medium' | 'thick'
export type Strand = 'fine' | 'medium' | 'coarse'
export type Texture = 'straight' | 'wavy' | 'curly' | 'coily'
export type Hairline = 'normal' | 'receding' | 'widows_peak'
export interface Hair { density: Density; strand: Strand; texture: Texture; hairline: Hairline; cowlick?: boolean; uncertain?: boolean }
export interface PartState { options: PartOption[]; recommended_id: string | null; intro: string | null; choice: { id: string | null; custom: string | null } | null }
export interface Pick { catalog_id: string; name: string; image: string; why: string }
export interface Checkpoint { status: 'ok' | 'review' | 'insufficient'; note: string; media_id: string }
export type FaceShape = 'oval' | 'round' | 'square' | 'oblong' | 'heart' | 'diamond'
export type Region = 'top' | 'sides' | 'back' | 'fringe' | 'crown' | 'general'
export type Effort = 'low' | 'medium' | 'high'

export interface Observation {
  id: string; text: string; view: 'front' | 'side'; region: Region; uncertain: boolean
  status: 'proposed' | 'confirmed' | 'rejected' | 'unconfirmed'; origin: 'ai' | 'barber' | 'history'
}
export interface FaceShapeResult {
  suggested: FaceShape[]; ratios: { lw: number; jw: number; fw: number }
  outline: [number, number][]; confirmed: FaceShape | null; face_found: boolean
}
export interface Option {
  id: string; catalog_id: string; name: string; image: string; why: string
  stays: string[]; changes: string[]; effort: Effort; needs_barber_check: string[]
  face_shape_note: string | null; source_ids: string[]
}
export interface Brief { problem_detail?:string|null; occasion:string|null; desired_cut?:string|null; preferences?:string|null; desired_impression:string[]; change_level:string|null; styling_minutes:number|null; maintenance_preference:string|null; dress_rules:string|null; inspiration:string|null; evidence:{field:string;source_text:string}[] }
export interface ConsultState {
  brief?: Brief
  hair_profile?: { suggested: Hair | null; confirmed: Hair | null } | null
  rating: Rating | null
  problems: ProblemId[]; chat: { role: 'customer' | 'barber' | 'ai'; text: string; media_id?: string }[]; revealed: boolean
  recommendations: { top_pick: Pick; alternatives: Pick[]; face_note: string | null } | null
  selected_style: string | null; sides: PartState; top: PartState
  checkpoints: { left?: Checkpoint | null; right?: Checkpoint | null; top: Checkpoint | null; sides?: Checkpoint | null }
  goal: string; keep: string[]; change: string[]; avoid: string[]; styling_effort: Effort | null
  observations: Observation[]; face_shape: FaceShapeResult | null; options: Option[]
  selected_option_id: string | null; conflicts: { id: string; text: string }[]
  reply: string | null; next_question: string | null; uncertainties: string[]
}
export interface Agreement {
  id: string; version: number
  plan: { keep: string[]; change: string[]; avoid: string[]; option: Option | null; face_shape: FaceShape | null; observations: string[]; barber_notes: string }
  customer_confirmed_at: string | null; barber_confirmed_at: string | null
}
export type JobType = 'transcribe' | 'observe' | 'faceshape' | 'propose' | 'chat' | 'recommend' | 'suggest' | 'checkpoint'
export interface Job {
  partial_text?: string | null
  progress?: { phase:string; queued_ahead:number|null; first_token_ms:number|null }
  id: string; type: JobType; status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'stale'
  requested_revision: number; started_at: string | null; finished_at: string | null; elapsed_s: number
  result: any; error: { code: string; message: string } | null // eslint-disable-line @typescript-eslint/no-explicit-any
}
export interface CustomerRef { id: string; display_name: string; nickname: string | null }
export interface Consultation {
  id: string; customer: CustomerRef | null; stage: Stage; status: 'active' | 'completed' | 'abandoned'
  revision: number; state: ConsultState; photos: { id: string; view: 'front' | 'side' | 'left' | 'right' | 'reference'; url: string }[]
  agreement: Agreement | null; active_job: Job | null; recent_jobs?: Job[]; phone_paired: boolean
}
export interface CustomerRow extends CustomerRef { last_visit_at: string | null; preferred_visit_id: string | null }
export interface Visit { id: string; completed_at: string; agreement: Agreement; actual_notes: string }
export interface Health { ollama: boolean; vision_model: string | null; whisper: boolean; face_landmarker: boolean }

export type Contribution =
  | { kind: 'rating'; score: number; tags: string[] }
  | { kind: 'text'; speaker: Speaker; text: string; input_type: 'typed' | 'voice' }
  | { kind: 'chip'; speaker: Speaker; field: 'keep' | 'change' | 'avoid' | 'styling_effort' | 'goal'; value: string; remove?: boolean }
  | { kind: 'observation'; observation_id: string; status: 'confirmed' | 'rejected'; text?: string }
  | { kind: 'observation_add'; text: string; region: Region }
  | { kind: 'face_shape'; confirmed: FaceShape }
  | { kind: 'hair_profile'; density: Density; strand: Strand; texture: Texture; hairline: Hairline }
  | { kind: 'select_option'; option_id: string }
  | { kind: 'resolve_conflict'; conflict_id: string; keep: 'first' | 'second' }
  | { kind: 'stage'; stage: Stage }
  | { kind: 'problem'; id: ProblemId; remove?: boolean }
  | { kind: 'reveal' }
  | { kind: 'pick_style'; catalog_id: string }
  | { kind: 'choose_part'; part: Part; option_id?: string; custom?: string }

export class ApiError extends Error {
  code: string; status: number; retryable: boolean; revision?: number
  constructor(status: number, body: { code?: string; message?: string; retryable?: boolean; revision?: number }) {
    super(body.message || `Request failed (${status})`)
    this.status = status; this.code = body.code || 'network'; this.retryable = body.retryable ?? status >= 500; this.revision = body.revision
  }
}

async function request<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const isForm = body instanceof FormData
  let res: Response
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, { code: 'offline', message: 'Hindi maabot ang laptop. Check the shop Wi-Fi.', retryable: true })
  }
  if (!res.ok) {
    let data = {}
    try { data = await res.json() } catch { /* non-JSON error */ }
    throw new ApiError(res.status, data)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

const idem = () => ({ 'Idempotency-Key': crypto.randomUUID() })

export const api = {
  health: () => request<Health>('GET', '/api/health'),
  searchCustomers: (q: string) => request<CustomerRow[]>('GET', `/api/customers?q=${encodeURIComponent(q)}`),
  createCustomer: (display_name: string, nickname: string | null) =>
    request<CustomerRef>('POST', '/api/customers', { display_name, nickname, retention_consent: true }, idem()),
  deleteCustomer: (id: string) => request<{ deleted: string }>('DELETE', `/api/customers/${id}`),
  parts: () => request<Record<Part, CatalogItem[]>>('GET', '/api/parts'),
  customer: (id: string) => request<{ customer: CustomerRef; preferred: Visit | null; visits: Visit[] }>('GET', `/api/customers/${id}`),
  createConsultation: (customer_id?: string, from_visit_id?: string, chair_label?: string) =>
    request<Consultation>('POST', '/api/consultations', { customer_id, from_visit_id, chair_label }, idem()),
  activeConsultation: () => request<Consultation | null>('GET', '/api/consultations/active'),
  activeList: () => request<{ id: string; chair_label: string; customer: CustomerRef | null; stage: Stage; phone_paired: boolean; started_at: string }[]>('GET', '/api/consultations/active-list'),
  consultation: (id: string) => request<Consultation>('GET', `/api/consultations/${id}`),
  pair: (id: string) => request<{ url: string; qr_png_data_url: string; expires_at: string }>('POST', `/api/consultations/${id}/pair`, {}, idem()),
  contribute: (id: string, c: Contribution, expected_revision: number) =>
    request<Consultation>('POST', `/api/consultations/${id}/contributions`, { ...c, expected_revision }, idem()),
  upload: (id: string, file: Blob, kind: 'photo' | 'audio', view?: 'front' | 'side' | 'left' | 'right' | 'reference') => {
    const f = new FormData()
    f.append('file', file, kind === 'photo' ? 'photo.jpg' : 'clip.webm'); f.append('kind', kind); if (view) f.append('view', view)
    return request<{ id: string; kind: string; view: string | null; url: string }>('POST', `/api/consultations/${id}/media`, f, idem())
  },
  startJob: (id: string, type: JobType, expected_revision: number, media_id?: string, part?: Part) =>
    request<Job>('POST', `/api/consultations/${id}/jobs`, { type, media_id, part, expected_revision }, idem()),
  job: (jobId: string) => request<Job>('GET', `/api/jobs/${jobId}`),
  cancelJob: (jobId: string) => request<Job>('DELETE', `/api/jobs/${jobId}`),
  confirmAgreement: (id: string, role: Speaker, expected_revision: number, barber_notes?: string) =>
    request<Consultation>('POST', `/api/consultations/${id}/agreements/confirm`, { role, barber_notes, expected_revision }, idem()),
  abandon: (id: string) => request<{ id: string; status: string }>('POST', `/api/consultations/${id}/abandon`, {}, idem()),
  complete: (id: string, actual_notes: string, save_as_preferred: boolean, keep_photos: boolean, rating?: { score: number; tags: string[] }, key?: string) =>
    request<{ visit_id: string }>('POST', `/api/consultations/${id}/complete`, { actual_notes, save_as_preferred, keep_photos, rating }, key ? { 'Idempotency-Key': key } : idem()),
}

/** Chat replies stream over server-sent events: each delta lands as it is generated, then the final job. */
function streamJob(job: Job, onTick?: (j: Job) => void, signal?: AbortSignal): Promise<Job> {
  return new Promise((resolve, reject) => {
    const source = new EventSource(`/api/jobs/${job.id}/stream`)
    let text = ''
    const close = () => source.close()
    signal?.addEventListener('abort', () => { close(); reject(new DOMException('aborted', 'AbortError')) })
    source.addEventListener('delta', e => {
      text += JSON.parse((e as MessageEvent).data).text
      onTick?.({ ...job, status: 'running', partial_text: text })
    })
    source.addEventListener('done', e => { close(); const j = JSON.parse((e as MessageEvent).data) as Job; onTick?.(j); resolve(j) })
    source.onerror = () => { close(); reject(new Error('stream')) }
  })
}

/** Follow a job until it leaves queued/running. Chat streams; other jobs (and a broken stream) poll. */
export async function waitForJob(jobId: string, onTick?: (j: Job) => void, signal?: AbortSignal, type?: JobType): Promise<Job> {
  if (type === 'chat' && typeof EventSource !== 'undefined') {
    try { return await streamJob({ id: jobId, type, status: 'queued' } as Job, onTick, signal) }
    catch (e) { if (e instanceof DOMException) throw e }
  }
  for (;;) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const j = await api.job(jobId)
    onTick?.(j)
    if (j.status !== 'queued' && j.status !== 'running') return j
    await new Promise(r => setTimeout(r, j.type === 'chat' ? 350 : 1000))  // chat streams; poll faster
  }
}
