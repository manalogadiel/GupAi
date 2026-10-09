# GupAi API contract (v1)

**Owner:** the lead. The backend (Codex) implements it; the frontend (Claude) consumes it. Any change needs a "Request to lead".

- **Base:** same origin, `https://<host>:8443`.
- **Format:** all bodies are JSON unless marked multipart. Times are ISO-8601 UTC. IDs are UUID4 strings.

## Auth model
- **Barber:** any request whose `request.client.host` is `127.0.0.1` or `::1`. The laptop browser uses `https://localhost:8443`.
- **Phone:** the cookie `gupai_phone` (HttpOnly; Secure; SameSite=Strict) maps to exactly one `consultation_id`.
- `B` = barber only → **403** otherwise.
- `P` = barber, or a phone whose cookie scope matches the `{id}` in the path → **404** otherwise.
- **Mutations** (POST/DELETE) require an `Origin` header equal to the request host → **403** otherwise.

## Errors
```json
{ "code": "revision_conflict", "message": "Human-readable Taglish/English", "retryable": true, "revision": 7 }
```

| Code | HTTP status |
|---|---|
| `not_found` | 404 |
| `forbidden` | 403 |
| `revision_conflict` | 409 |
| `invalid_input` | 422 |
| `unsupported_media` | 415 |
| `too_large` | 413 |
| `model_unavailable` | 503 |
| `conflict_unresolved` | 409 |
| `pair_expired` | 410 |

## Shared types
```ts
type Speaker = "customer" | "barber";
type Stage = "concern" | "photos" | "observations" | "options" | "agreement" | "cutting" | "completed" | "abandoned";
type FaceShape = "oval" | "round" | "square" | "oblong" | "heart" | "diamond";

interface Observation { id: string; text: string; view: "front" | "side"; region: "top" | "sides" | "back" | "fringe" | "crown" | "general";
  uncertain: boolean; status: "proposed" | "confirmed" | "rejected" | "unconfirmed"; origin: "ai" | "barber" | "history" }

interface FaceShapeResult { suggested: FaceShape[];          // 1, or 2 when "between"
  ratios: { lw: number; jw: number; fw: number };
  outline: [number, number][];                              // FACE_OVAL points, 0..1 of image w/h (job result only, never stored)
  confirmed: FaceShape | null; face_found: boolean }

interface Option { id: string; catalog_id: string; name: string; image: string /* /assets/catalog/x.webp */;
  why: string; stays: string[]; changes: string[]; effort: "low" | "medium" | "high";
  needs_barber_check: string[]; face_shape_note: string | null; source_ids: string[] }

interface ConsultState { goal: string; keep: string[]; change: string[]; avoid: string[];
  styling_effort: "low" | "medium" | "high" | null;
  observations: Observation[]; face_shape: FaceShapeResult | null;
  options: Option[]; selected_option_id: string | null;
  conflicts: { id: string; text: string }[];
  reply: string | null; next_question: string | null; uncertainties: string[] }

interface Consultation { id: string; customer: { id: string; display_name: string; nickname: string | null } | null;
  stage: Stage; status: "active" | "completed" | "abandoned"; revision: number; state: ConsultState;
  photos: { id: string; view: "front" | "side"; url: string }[];
  agreement: Agreement | null; active_job: Job | null; phone_paired: boolean }

interface Agreement { id: string; version: number; plan: { keep: string[]; change: string[]; avoid: string[];
  option: Option | null; face_shape: FaceShape | null; observations: string[]; barber_notes: string };
  customer_confirmed_at: string | null; barber_confirmed_at: string | null }

interface Job { id: string; type: "transcribe" | "observe" | "faceshape" | "propose"; status: "queued" | "running" | "done" | "failed" | "cancelled" | "stale";
  requested_revision: number; started_at: string | null; finished_at: string | null; elapsed_s: number;
  result: any | null; error: { code: string; message: string } | null }
```

## Endpoints

| # | Method | Path | Who | Request | Response |
|---|---|---|---|---|---|
| 1 | GET | `/api/health` | any | — | `{ ollama: bool, vision_model: string\|null, whisper: bool, face_landmarker: bool }` |
| 2 | GET | `/api/customers?q=` | B | — | `[{ id, display_name, nickname, last_visit_at, preferred_visit_id }]` (max 20, `LIKE` on name/nickname) |
| 3 | POST | `/api/customers` | B | `{ display_name, nickname?, retention_consent: true }` | customer |
| 4 | GET | `/api/customers/{id}` | B | — | `{ customer, preferred: Visit\|null, visits: Visit[] }`. Visit = `{ id, completed_at, agreement: Agreement, actual_notes }` |
| 5 | POST | `/api/consultations` | B | `{ customer_id?: string, from_visit_id?: string }` | Consultation. `from_visit_id` copies keep/change/avoid/face_shape.confirmed and marks old observations `unconfirmed` |
| 6 | GET | `/api/consultations/active` | B | — | Consultation \| `null` |
| 7 | GET | `/api/consultations/{id}` | P | — | Consultation (polled every 1.5 s) |
| 8 | POST | `/api/consultations/{id}/pair` | B | — | `{ url, qr_png_data_url, expires_at }` (code: 128-bit, single use, 10 min) |
| 9 | GET | `/pair?code=` | any | — | Sets cookie, **302 → `/phone?c=<consultation_id>`** (the id alone grants nothing without the cookie); `410 pair_expired` page on a bad or used code |
| 10 | POST | `/api/consultations/{id}/contributions` | P | `Contribution` (below) + `expected_revision` | Consultation (revision + 1) |
| 11 | POST | `/api/consultations/{id}/media` | P | multipart: `file`, `kind`=`photo`\|`audio`, `view`=`front`\|`side` (photo) | `{ id, kind, view, url }` |
| 12 | POST | `/api/consultations/{id}/jobs` | P | `{ type, media_id?, expected_revision }` | Job (queued) |
| 13 | GET | `/api/jobs/{id}` | P (scope via job's consultation) | — | Job |
| 14 | DELETE | `/api/jobs/{id}` | P | — | Job (cancelled) |
| 15 | POST | `/api/consultations/{id}/agreements/confirm` | P | `{ role: Speaker, barber_notes?: string, expected_revision }` | Consultation. The barber role needs B. Both confirmed → immutable version saved, stage → `cutting`. Open conflicts → `409 conflict_unresolved` |
| 16 | POST | `/api/consultations/{id}/complete` | B | `{ actual_notes, save_as_preferred: bool, keep_photos: bool }` | `{ visit_id }`. Revokes the phone cookie and deletes unkept media |
| 17 | GET | `/api/media/{id}` | P | — | image/jpeg (no-store) |

### Contribution (endpoint 10)
```ts
type Contribution =
  | { kind: "text"; speaker: Speaker; text: string; input_type: "typed" | "voice" }     // → server parses nothing; frontend then starts a "propose" job
  | { kind: "chip"; speaker: Speaker; field: "keep" | "change" | "avoid" | "styling_effort" | "goal"; value: string; remove?: boolean }
  | { kind: "observation"; observation_id: string; status: "confirmed" | "rejected"; text?: string }   // barber edit = text
  | { kind: "observation_add"; text: string; region: Observation["region"] }                          // barber manual
  | { kind: "face_shape"; confirmed: FaceShape }                                                       // barber
  | { kind: "select_option"; option_id: string }
  | { kind: "resolve_conflict"; conflict_id: string; keep: "first" | "second" }
  | { kind: "stage"; stage: Stage }                                                                     // barber; back or next one step
```

### Job results
| Job type | Result | Notes |
|---|---|---|
| `transcribe` | `{ text: string, language: string }` | The audio file is deleted afterwards |
| `observe` | `{ observations: Observation[] }` | Merged into state as `proposed` |
| `faceshape` | `FaceShapeResult` | `suggested` is merged into state; `outline` is only in the job result |
| `propose` | `{ reply, next_question, proposed_changes: [{ field, op: "add"\|"remove", value, negated }], options: Option[], uncertainties: string[] }` | `proposed_changes` are applied to keep/change/avoid. A new conflict is added to `conflicts` |

- If `requested_revision != state.revision` at finish, status is `stale` and nothing is merged.
- One worker, FIFO.
- On startup, jobs left in `running` are marked `failed`.
