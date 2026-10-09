# GupAi API contract v2 (barber-style flow)

This doc extends `docs/API.md` (v1). Everything in v1 still holds unless it is changed below.

- **Owner:** the lead.
- **Backend plumbing:** Codex C7.
- **AI functions:** the lead, in `backend/app/ai.py`. Codex must **not** edit `ai.py`; mock it in tests.

## Stages
`photos → goal → reveal → sides → top → summary → cutting → done`, plus `abandoned`.

- **New consultations start at `photos`.**
- **Barber stage moves** (`{kind:"stage"}`) go one step forward or back, within `photos…summary`, and `cutting → done`.
  - `summary → cutting` happens **only** through the agreement confirmation, once both roles have confirmed.
  - Moving out of `cutting` backwards is not allowed.
- **`reveal`** can only be entered when `face_shape` exists, or when the barber picks a shape manually with the v1 `face_shape` contribution.
- **`summary`** requires `selected_style`, `sides.choice` and `top.choice`. Otherwise the move returns `409 conflict_unresolved` with a Taglish message saying what's missing.

## State v2 (`consultations.state_json`)
These fields are added to the v1 fields. Keep `keep / change / avoid / observations / face_shape / conflicts / uncertainties`.

```ts
interface PartOption { id: string; name: string; pros: string[]; cons: string[]; why: string; maintenance: string }
interface PartState { options: PartOption[]; recommended_id: string | null; intro: string | null;
                      choice: { id: string | null; custom: string | null } | null }
interface Pick { catalog_id: string; name: string; image: string; why: string }
interface Checkpoint { status: "ok" | "review" | "insufficient"; note: string; media_id: string }

problems: string[]            // ids: puffy_sides | cowlick | hard_to_style | grows_fast | flat_top | wide_forehead
chat: { role: "customer" | "barber" | "ai"; text: string }[]   // keep last 12
revealed: boolean
recommendations: { top_pick: Pick; alternatives: Pick[]; face_note: string | null } | null
selected_style: string | null  // catalog_id
sides: PartState
top: PartState
checkpoints: { sides: Checkpoint | null; top: Checkpoint | null }
```

- **Initial values:**
  - `problems: []`, `chat: []`, `revealed: false`;
  - `recommendations: null`, `selected_style: null`;
  - `sides` and `top`: `{options: [], recommended_id: null, intro: null, choice: null}`;
  - `checkpoints: {sides: null, top: null}`.
- **Reveal gate:** while `revealed` is false, `GET /api/consultations/{id}` returns `state.face_shape = null` and `state.recommendations = null`. They are still stored, just hidden.

## New contributions (`POST /api/consultations/{id}/contributions`, with `expected_revision` as in v1)
| kind | Body | Who | Effect |
|---|---|---|---|
| `text` (v1) | `{speaker, text, input_type}` | P | Also appended to `chat` as `{role: speaker, text}` |
| `problem` | `{id, remove?: bool}` | P | Add or remove from `problems`. Unknown id → 422 |
| `reveal` | `{}` | B | Sets `revealed=true`. Only allowed at stage `reveal` |
| `pick_style` | `{catalog_id}` | P | Sets `selected_style`. Must be the top pick or an alternative from `recommendations` |
| `choose_part` | `{part: "sides"\|"top", option_id?: string, custom?: string ≤120}` | P | Sets `state[part].choice`. Exactly one of `option_id` (must be in `options`) or `custom` |

- **Agreement:** the v1 `POST …/agreements/confirm {role, barber_notes?}` still applies. It is allowed only at stage `summary`, and requires `selected_style`, `sides.choice` and `top.choice`.
- **Agreement `plan_json` adds:** `selected_style`, `sides_choice`, `top_choice` (resolved names) and `problems`.
- **When both roles have confirmed**, the stage moves to `cutting`.

## Jobs (`POST /api/consultations/{id}/jobs`)
**Body:** `{type, media_id?, part?, expected_revision}`

| type | Needs | AI call (lead, `ai.py`) | Result → merge |
|---|---|---|---|
| `faceshape`, `observe`, `transcribe` | as v1 | as v1 | as v1 |
| `chat` | — | `ai.chat_reply(state, new_texts, on_token)` → `{reply, problems_detected: string[], proposed_changes: [...], goal}` | Append `{role:"ai", text: reply}` to `chat`. Union `problems_detected` into `problems`. Apply `proposed_changes` as in v1 propose. Set `goal` if non-empty. **Not stale-checked.** |
| `recommend` | — | `ai.recommend(state)` → `{top_pick: Pick, alternatives: Pick[], face_note}` | Set `recommendations`. If `selected_style` is null, set it to `top_pick.catalog_id`. Stale-checked |
| `suggest` | `part` | `ai.suggest(state, part)` → `{options: PartOption[], recommended_id, intro}` | Set `state[part].options / recommended_id / intro`. Keep `choice` if its id is still in the options, else set it to null. Stale-checked |
| `checkpoint` | `part`, `media_id` (photo) | `ai.checkpoint(state, image_path, part)` → `{status, note}` | Set `checkpoints[part] = {status, note, media_id}`. Only at stage `cutting`. **Not stale-checked** |

- `new_texts` is the existing `_new_texts` logic (`text` contributions since the last finished `chat` or `propose` job).

**Streaming (`chat` only):**
- The worker passes `on_token(piece: str)`. Each piece is appended to `_transient[job_id]["partial_text"]`.
- `GET /api/jobs/{id}` adds `partial_text: string | null`, both while running and after it finishes.

## Multi-chair
- **Removed:** the "Finish the active consultation first" limit. Many consultations can be `active` at once.
- **`consultations.chair_label TEXT`** (migration v2): `POST /api/consultations` accepts `chair_label?` (≤30). The default is `"Upuan N"`, where N = the count of active consultations + 1.
- **`GET /api/consultations/active-list` (B)** returns `[{id, chair_label, customer, stage, phone_paired, started_at}]`, newest first.
- `GET /api/consultations/active` stays: it returns the newest active consultation.
- **Pairing is unchanged:**
  - one single-use code per consultation;
  - the phone cookie is scoped to one consultation, so a phone paired to chair A gets 404 on chair B.
  - **Required test:** two chairs, two phones, cross-access is 404.

## Completion and rating
- **`POST /complete`** adds `rating?: {score: 1..5, tags: string[] ≤5, each ≤40}`. It is allowed at stage `cutting` or `done`.
- **Migration v2:** `ALTER TABLE visits ADD COLUMN rating INTEGER`, `ALTER TABLE visits ADD COLUMN rating_tags TEXT` (JSON), `ALTER TABLE consultations ADD COLUMN chair_label TEXT`, and `PRAGMA user_version=2`.
  - `db.initialize` upgrades v1 to v2 in place.
- **Temporary consultations:** the rating is accepted but no visit is saved (as in v1).
