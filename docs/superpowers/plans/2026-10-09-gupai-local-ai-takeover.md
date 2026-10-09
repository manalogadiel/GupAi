# GupAi Local AI Takeover Implementation Plan

> **For agentic workers:** Implement natively with `executing-plans`, task by task. The user has appointed Codex as the sole implementer; do not dispatch other agents. Use test-first changes for state, authorization, constraints, and persistence.

**Goal:** Deliver a reliable offline barber consultation on one shop laptop and paired phones, preserving the existing v2 flow and a recoverable v1 fallback.

**Architecture:** FastAPI and SQLite own consultation state, permissions, revisions, agreements, and visits. One FIFO worker performs local inference through loopback Ollama, MediaPipe, and faster-whisper. React scenes share the consultation API across laptop and phone; the AI proposes, the barber confirms physical observations, and the customer controls preferences.

**Tech Stack:** Existing Python venv, FastAPI, SQLite, Pillow, httpx, faster-whisper, MediaPipe, Ollama Qwen 3.5 4B; React 19, TypeScript, Vite, Tailwind, Motion, bundled fonts and SVGs.

**Spec:** Claude's `C:/Users/Diel/.claude/plans/c-users-diel-documents-codex-2026-10-09-radiant-tarjan.md`, supplemented by `docs/API-v2.md`, `docs/PRD.md`, and the user's takeover instruction. API-v2 supersedes v1 where explicitly stated. Resolve disagreements in the docs before implementing affected behavior.

## Completion record — Oct 10
Software implementation and automated integration are complete: 215 backend tests, production build, genuine local model browser journey, all eight laptop/phone scenes, shared rating, saved return preference, and two-chair LAN isolation pass. V1 is independently built/tested (152 tests) with a separate database. See the companion progress ledger and docs/MEASUREMENTS.md for evidence and rulings. Original task checkboxes below are retained as the planning record; they are not the current status board.

Remaining acceptance is physical: phone certificate trust, camera/microphone, real-face/Taglish accuracy, and a disconnected-internet hardware rehearsal. Submission/recording remains human-owned. Exact requested taste repository provenance is unverified; installed skills were used without claiming new installation.

## Global constraints

- Actual project: `C:/Users/Diel/Documents/GitHub/GupAi`. The chat's initial `Documents/ChatGPT/gupai` folder is not the application checkout.
- Preserve all existing uncommitted work. Do not reset, stash, switch the current checkout to v1, or overwrite customer data.
- User takeover authorization supersedes the old Claude-lead/Codex-worker folder split. Do not automatically publish, submit, or message anyone.
- Local AI is the product requirement: no cloud inference, remote runtime assets, or runtime model downloads. One-time setup may use internet.
- Ollama must remain `http://127.0.0.1:11434`; phone traffic goes only to the shop laptop over LAN HTTPS.
- Flow: `photos → goal → reveal → sides → top → summary → cutting → done`, plus abandonment.
- Follow the actual v2 contract: `cutting → done` opens rating while the consultation stays active; `/complete` saves the visit, ends the consultation, and revokes phone access. Claude's earlier prose saying done is reachable only through complete contradicts this contract.
- Both participants approve the same current agreement before cutting. Confirmed agreement versions stay immutable.
- Cosmetic advice only, no diagnosis, beauty ranking, or autonomous cutting instruction. Checkpoints are advisory.
- Customer constraints outrank face-shape guidance. Output must be bounded, plain text, and grounded in the catalog.
- One shared inference worker across chairs; display actual queued/running state and elapsed time, never invented progress.
- Every scene must expose its essential controls at 1280×680 and 390×720 without page scrolling. Hiding clipped controls with `overflow-hidden` does not count as passing.
- Original deadlines, Asia/Manila: v2 go/no-go at **October 10, 04:30**, internal freeze **09:00**, code freeze **10:00**. These come from project documents and must be rechecked if the hackathon organizer changes them.

## Audit baseline: what is actually done

Audited October 9, around 23:47, Asia/Manila. No product fixes have been made during this planning audit.

| Area | Evidence | Status |
|---|---|---|
| v1 recovery point | `demo-safe-v1` exists in local tags | Available; compatibility with the v2 database is not verified |
| v2 API contract | Commit `4c5e02a`, `docs/API-v2.md` | Written |
| Kuya Gup AI functions | Commit `ecfa844`; chat, recommend, suggest, checkpoint in `backend/app/ai.py` | Implemented; current live quality/latency unverified |
| Sides/top knowledge | Commit `6d53153`; `knowledge/parts.json`, schema tests | Implemented; conditional barber guidance requires review |
| v2 UI and SVG preview | Commit `b028108`; shared scenes, chair list, phone page, preview | Implemented; full browser/phone rehearsal unverified |
| C7 backend | Modified `consult.py`, `consultations.py`, `db.py`, `jobs.py`, `schema.sql`, tests; new `test_v2_flow.py` | Present, uncommitted, requires integration review |
| Backend regression | `.venv/Scripts/python.exe -m pytest backend/tests -q` | Initial **186 passed in 15.35 s**; after inherited C7 delivery, fresh **192 passed in 17.88 s** |
| Frontend compilation | `npm --prefix frontend run build` | **Passed**, TypeScript and production Vite bundle |
| Frontend lint | `npm --prefix frontend run lint` | **Exit 0**, 10 warnings; no lint errors |
| Real local AI v2 | Earlier Claude timing statements; no fresh inference in this audit | Not verified; do not present the claimed 5 s as a guarantee |
| Phone hardware and offline demo | Prior v1 report exists | v2 camera, audio, layout, rating, and cold offline startup still unverified |
| Documentation | README still describes two options/v1; task board has stale statuses | Needs reconciliation |

Uncommitted baseline: five C7 backend modules, `test_ai_validate.py`, `test_auth.py`, `test_consult.py`, `test_skeleton.py`, new `test_v2_flow.py`, `docs/TASKS.md`, and `docs/agents/K2.md`. Preserve these as inherited work, not changes authored during this takeover.

**Late audit update:** The previously dispatched C7 worker delivered `docs/agents/C7.md` during this audit and reported 192 tests. The takeover independently reran the suite: **192 passed in 17.88 s**. C7 is now reported as review rather than still doing; its live AI/hardware checks remain skipped. Re-read the final inherited diff before edits.

## Findings that need attention

1. **Phone rating does not persist or synchronize.** `DoneScene` stores score/tags only in component state, tells the customer to show the phone to the barber, and `Phone.tsx` supplies an empty completion callback. The barber has a separate score. The customer's rating must reach the laptop before completion without giving the phone barber completion privileges.
2. **Manual/no-face recovery can be blocked.** Entering reveal requires stored face-shape state. Manual shape chips are rendered only after revealing. If inference fails before storing a result, the visible flow lacks the manual selection promised by the plan.
3. **Offline speech readiness is incomplete.** Health checks import `faster_whisper`; `WhisperModel("small", ...)` may download missing weights. The UI can claim speech readiness without an offline model. Verify local files and load without network fallback.
4. **Reveal masking is applied only in the GET handler.** Contribution/create/active responses use `consultation_dict` directly; audit these and job results for early face-shape or recommendation exposure. Hide result presentation consistently while retaining internal AI inputs and transient outline handling.
5. **v2 choices can outlive changed constraints.** `_invalidate_options` clears v1 option fields. Audit whether changed keep/avoid, face shape, problems, and goal invalidate v2 recommendations and pending agreement approvals correctly.
6. **Part ranking uses a soft penalty for some avoid constraints.** `rank_parts` subtracts points for skin fade/buzz but can still return them. Define and enforce catalog-supported protected-region constraints before ranking.
7. **Job following uses one running-job slot.** Concurrent photo/chat jobs and polling from two devices can race to replace or clear it. Verify exactly which queued/running job is shown and whether completed transient results reach both devices.
8. **Photo and observation requirements need reconciliation.** Laptop Next checks only a front photo; the spec requests front and side. v2 scenes do not visibly expose the full v1 observation-confirm/edit/reject workflow. Preserve barber confirmation before observations affect recommendations.
9. **Preview and checkpoints need practical validation.** Custom part choices get a generic SVG, fringe is not derived in summary, and checkpoint uploads use front view for either part. Label generic illustrations honestly and guide each checkpoint's camera angle.
10. **Viewport, reduced motion, and failure paths remain unproven.** Fixed-height wrappers can clip stacked phone cards or long chat text. Existing build/tests do not prove usable controls, CSP compliance in-browser, or reduced-motion behavior.
11. **Mid-cut preference recovery needs a decision and tests.** The C7 report says edits after cutting starts can block completion until preferences are restored or the session restarted. Preserve the accepted agreement as the checkpoint/save reference; either reject unsupported edits before applying them with a clear message, or explicitly support a versioned reconfirmation path. The smallest demo-safe option is rejecting plan-changing edits during cutting/done while allowing checkpoints and rating.

## Review focus

- No face, missing camera/mic permissions, missing local model: clear recovery, editable typing/manual choice, and no fabricated success.
- Fast corrections while inference is queued: protected preferences survive, stale recommendations cannot become the final plan.
- Two chairs and two phones: cross-access stays 404, single-use pairing stays enforced, completing one chair does not revoke another.
- Long Taglish text/custom choices and small phone height: essential actions stay reachable; no hidden overflow.
- Restart/cancel/retry around saving: agreements stay immutable, completion is idempotent, model failure does not corrupt the saved visit or retain unconsented media.

## Execution strategy

Stabilize the existing v2 implementation in place. Rebuilding again would discard working code and consume verification time. Keep v1 as a separately prepared recovery option, not an automatic checkout on the current v2 data directory. Implement sequentially as the user requested.

### Task 1: Preserve baseline and reconcile the takeover contract

**Files:** `docs/TASKS.md`, `AGENTS.md`, `docs/API-v2.md`, `docs/agents/C7.md`, a recovery manifest under `docs/`.

**Interfaces:** Retain all existing routes and supported stage names. API-v2 is the working contract, with explicit additions only for confirmed integration gaps.

- [x] Read Claude's external plan, project instructions, current commits, and inherited edits.
- [x] Run the full backend suite, frontend build, and lint; record evidence above.
- [ ] Check for surviving Claude/Codex processes editing this checkout before mutation; avoid concurrent writers.
- [ ] Preserve a diff including untracked source files and a separate recoverable backup of the demo database/media before migration or recovery work. Keep private backups outside tracked/public files.
- [ ] Reconcile stale task statuses and the lead ownership note; document the done/rating/completion distinction and current single-worker behavior.
- [ ] Review C7 diff against the v2 contract and write its missing integration report. Do not mark C7 done merely because unit tests pass.

**Pass condition:** One documented source of truth, recoverable inherited work, and no destructive checkout or data overwrite.

### Task 2: Make local model readiness truthful and offline startup reliable

**Files:** `backend/app/stt.py`, `health.py`, `jobs.py`, existing skeleton/AI tests, focused offline model tests, `README.md`, `docs/MEASUREMENTS.md`.

**Interfaces:** Preserve `/api/health` existing keys; add typed readiness detail only if needed by `frontend/src/api.ts` and Home. Missing speech weights must return a real `model_unavailable` error. Model loading uses an explicit cached/local path or supported local-only loading.

- [ ] Add a failing test: import succeeds but speech weights are absent → speech readiness false; no network download attempted.
- [ ] Add a failing test: local cached weights exist → loader uses local-only mode; missing Ollama model remains a real readiness failure.
- [ ] Verify Ollama tags, MediaPipe file, Whisper cache, cert files, and demo build on this laptop; prewarm one model at a time without competing live requests.
- [ ] Implement readiness/loader fixes and verify targeted tests, then the backend suite.
- [ ] Cold-start the server with internet disconnected and record actual readiness and failures. Do not replace genuine inference with canned responses.

**Pass condition:** Readiness reflects usable local assets; cold offline startup and text consultation work. Record missing hardware/model steps explicitly.

### Task 3: Review and repair v2 state, masking, and agreement gates

**Files:** `backend/app/consult.py`, `consultations.py`, `jobs.py`, `db.py`, `schema.sql` only where necessary; `backend/tests/test_v2_flow.py`, `test_consult.py`, `test_auth.py`, `docs/API-v2.md`.

**Interfaces:** One-step stage moves, GET/contribution responses shaped as the existing consultation type, revision-protected changes, immutable confirmed agreement versions, scoped media/jobs. Apply hidden-result serialization consistently without hiding internal inputs from inference.

- [ ] Add failing tests for hidden face shape/recommendations in applicable mutation and active responses; verify job result presentation follows the documented gate.
- [ ] Add failing tests for preference/problem/face-shape edits invalidating dependent v2 results and unconfirmed approvals; confirm no post-approval edit can silently change the agreed cut.
- [ ] Add a failing test for plan-changing edits during cutting/done: reject them before mutation with a clear error, preserve the accepted agreement, and allow completion/checkpoints/rating to proceed. Document this prototype limit rather than silently stranding the consultation.
- [ ] Add failing tests for a missing face result and a supported manual confirmation allowing progression; require front+side capture if following the original two-photo requirement.
- [ ] Verify observation confirm/edit/reject data remains available to the barber and only confirmed facts feed recommendations.
- [ ] Check migration using a disposable copy of v1 data; verify foreign keys, historical visits, customer preferences, tokens, and repeated initialization.
- [ ] Implement minimal fixes, run targeted regression tests, then all backend tests.

**Pass condition:** The server enforces the current plan on every write, early reveal stays hidden in the UI, and migration preserves existing records.

### Task 4: Ground and validate Kuya Gup's actual AI output

**Files:** `backend/app/ai.py`, `knowledge/parts.json` only for demonstrated knowledge errors, `backend/tests/test_ai_validate.py`, `test_parts.py`, `docs/MEASUREMENTS.md`.

**Interfaces:** Preserve `chat_reply(state, new_texts, on_token)`, `recommend(state)`, `suggest(state, part)`, and `checkpoint(state, image_path, part)` result contracts.

- [ ] Add failing tests: keep fringe/keep length constraints exclude incompatible top options; avoiding visible scalp excludes skin fade/buzz where catalog rules support this interpretation. Preserve user-selected preferences over advisory shape ranking.
- [ ] Test malformed JSON, unknown catalog/part IDs, missing reasons, token-cap truncation, and no-compatible-candidate behavior. A local model outage stays a real error.
- [ ] Test a short streamed reply ends with one useful question and preserves Taglish negation across multiple turns; clearly distinguish model text from deterministic catalog fallback.
- [ ] Test checkpoint notes and invalid responses remain advisory and return insufficient when the view cannot support a useful check. Compare against the confirmed agreement.
- [ ] Run real warm, non-contended calls for chat first-token/full reply, recommendations, sides, top, and a permitted real-photo checkpoint. Record samples, conditions, model/settings, and quality; never promise a universal 5 s response.

**Pass condition:** Real outputs respect protected choices, are short/useful, stay cosmetic, and have honest measured latency.

### Task 5: Repair phone/laptop synchronization and save the customer's rating

**Files:** `frontend/src/api.ts`, `useConsultation.ts`, `flow.ts`, `components/Scenes.tsx`, `pages/Phone.tsx`, `pages/Consult.tsx`; backend contribution/state/schema code and v2 tests as needed; `docs/API-v2.md`.

**Interfaces:** Add a documented revision-protected rating contribution, for example `{kind:"rating", score:1..5, tags:string[]}` with at most five tags of at most 40 characters, valid during done. Consultation state carries the latest customer rating. Only the barber calls `/complete`; completion persists the submitted/shared rating once. Update the contract and both clients together before changing behavior.

- [ ] Add failing tests: phone rating appears in the laptop's consultation state, bad score/tags rejected, other-chair access rejected, and completion saves that rating without a second independent score.
- [ ] Verify temporary sessions accept the rating without falsely claiming a persisted visit; consented customers retain it with the saved visit.
- [ ] Repair the no-face/manual path in the scenes and expose observation confirmation where needed.
- [ ] Fix running-job tracking using a small explicit per-job structure if necessary; cancel/unmount must stop followers and stop camera/mic. Do not redesign the whole data layer.
- [ ] Verify chat streams on both devices, stale results rerun only within a bounded policy, and repeated Send does not erase new unsent text or unintentionally queue duplicate turns.
- [ ] Verify customer accepts the current summary, barber sees acceptance, saving failure preserves the reviewable input, and retry is idempotent.

**Pass condition:** The same consultation, agreed cut, and customer rating reach both devices; saving works without granting the phone barber privileges.

### Task 6: Fit and polish the existing premium UI

**Files:** `frontend/src/components/Scenes.tsx`, `Mirror.tsx`, `Photo.tsx`, `HaircutPreview.*`, `Backdrop.tsx`, `pages/Consult.tsx`, `pages/Phone.tsx`, `index.css`, `docs/DESIGN.md` as needed.

**Interfaces:** Keep existing design tokens, warm cream/peach/sage backdrop, Kuya Gup mascot, shared scenes, and accessible controls. No new product dependencies unless a demonstrated need outweighs demo risk.

- [ ] Skill inventory: frontend-design, caveman, ponytail, superpowers, ui-ux-pro-max, impeccable, Emil design engineering, and taste skills are already exposed locally. Verify their sources/versions against the requested repositories before calling an installation complete; install only missing packages using skill-installer. Do not overwrite installed skills blindly. Exact Leonxlnx/taste-skill provenance remains unverified.
- [ ] Read applicable requested UI skills before edits. Use caveman for brief chat only, ponytail for small repairs, frontend-design/ui-ux-pro-max/impeccable for scene usability, Emil guidance for native phone controls and restrained motion, and taste guidance where it fits this multi-step product. Resolve conflicts in favor of the user's approved product requirements.
- [ ] Inspect all eight scenes at 1280×680 and 390×720 with realistic long content. Assert no document overflow, every required control inside the viewport, and no essential card content clipped.
- [ ] Use compact selection layouts/paging or shorter visible summaries on phone where necessary; retain accessible full detail without page scrolling. Avoid solving overflow by hiding buttons.
- [ ] Provide checkpoint-specific capture guidance; verify the phone camera can show sides and top. Label custom-choice previews as generic, and map known IDs/fringe accurately.
- [ ] Verify keyboard focus, tap targets, reduced motion for scene/backdrop/SVG animations, bundled CSS under production CSP, and permission-denied camera/mic fallback.

**Pass condition:** Screenshots and interaction checks prove the requested visual fit and controls remain usable on both devices.

### Task 7: Run full regression, failure rehearsal, and two-chair isolation

**Files:** A reusable browser smoke/regression script under `scripts/` using available browser tooling; focused backend tests for newly discovered defects; `docs/VALIDATION.md`, `docs/MEASUREMENTS.md`, screenshots in an appropriate untracked artifact directory.

**Interfaces:** Exercise the real HTTPS API and production frontend. Stubbed AI is acceptable for deterministic regression only, labeled clearly; final offline rehearsal uses real local models and SQLite.

- [ ] Run one full temporary consultation and one consented customer visit: photos → typed/voice goal → reveal/shape confirmation → style → sides/top → two approvals → advisory checkpoint → customer rating → barber completion.
- [ ] Restart and verify saved visit, preferred cut, return prefill, historical observations unconfirmed, and separate photo retention consent.
- [ ] Pair two phones/isolated browser contexts with two chairs; verify cross-chair consultation/media/job access gives 404, code reuse gives 410, FIFO behavior is truthful, and completing chair A leaves B paired.
- [ ] Exercise offline network loss/reconnect, Ollama missing/failed output, no-face photo, denied camera/mic, stale revisions, cancellation, long input, and repeated save.
- [ ] Run backend tests, frontend build and lint after fixes. Repeat only checks affected by additional changes.
- [ ] Complete a real phone test over trusted LAN HTTPS with mobile data/internet off. Browser emulation cannot substitute for camera permissions, trust, and microphone behavior; Gadiel handles physical phone/certificate operations.

**Pass condition:** A logged real offline journey plus deterministic regressions, reachable controls, persistent consented visit, and isolated chairs. Mark any human hardware check still outstanding rather than reporting full completion.

### Task 8: Package the demo and prepare recovery

**Files:** `README.md`, `DISCLOSURES.md`, `ASSETS.md`, `docs/TASKS.md`, `docs/VALIDATION.md`, `docs/MEASUREMENTS.md`, minimal launch/preflight scripts under `scripts/` if required.

- [ ] Update instructions to the actual v2 flow and local AI roles; replace stale v1 option counts and latency claims with measured evidence.
- [ ] Document fresh startup, model-cache preflight, LAN HTTPS, privacy/retention, retry/cancel limits, shared worker queue, and honest face-shape/checkpoint limitations.
- [ ] Prepare a 60-second demo sequence emphasizing private offline inference, Taglish consultation, protected preferences, two-party agreement, and saved return visits. Longer actual waits may be trimmed in a recorded video only if disclosed honestly.
- [ ] Validate v1 in a separate recovery directory with a compatible copied database, certificates, and model setup. Do not run old code against the only v2 database or switch away from inherited edits.
- [ ] At October 10, 04:30: retain v2 only if its complete offline journey passes; otherwise use the independently verified recovery option. If recovery itself fails, state that explicitly and fix the smallest working journey.
- [ ] By 09:00: freeze the demonstrated version and finish documentation. By 10:00: Gadiel handles final organizer requirements, recording/posting, repo visibility, and submission; no automatic publication from this plan.

**Pass condition:** Repeatable startup and demo, accurate documentation, tested recovery, and a clear list of any human submission tasks.

## Priority and time control

1. **P0:** Preserve work; trustworthy local model startup; manual recovery; correct state/agreements/constraints; synchronized rating; complete visit persistence; usable phone controls.
2. **P1:** Real inference quality/timings; two-chair rehearsal; camera/audio/retention failures; offline production build and docs.
3. **P2:** Additional cosmetic refinements, optional rating tags, second checkpoint, extra animation polish.

Use checkpoints based on evidence, not invented completion percentages. Suggested order before 04:30: Tasks 1–3 first, Tasks 4–5 next, then essential Task 6 fixes and Task 7 rehearsal. Cut optional rating tags, the second checkpoint, and extra preview/motion polish first. Preserve streaming unless a demonstrated defect makes the nonstreamed real response more reliable; it materially helps on this CPU. Do not cut preference protection, consent, chair isolation, persistence, or honest offline behavior.

## Definition of done

- [ ] All changed critical behavior has meaningful regression coverage and the full backend suite passes.
- [ ] Frontend production build passes; remaining lint warnings are either repaired or documented with relevance.
- [ ] Full laptop and real-phone consultation runs with internet disconnected and genuine local inference.
- [ ] User choices survive corrections; the current immutable agreement is what gets saved.
- [ ] Customer rating is synchronized and stored correctly; temporary-session behavior is honest.
- [ ] Two-chair isolation and single-use pairing pass; consent cleanup and restart persistence pass.
- [ ] Every essential action is visible at both target viewports; reduced motion and failure recovery work.
- [ ] README, measurements, task board, disclosures, demo script, and recovery instructions reflect tested behavior.
- [ ] Human hardware/submission tasks and any remaining limitation are explicitly reported.
