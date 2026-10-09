# GupAi: Product Requirements Document (hackathon MVP)

**Tagline:** Para bago gumupit, nagkaintindihan muna.
**Event:** AppBuildersPH Hackathon 2026, Local AI track
**Builder:** solo
**Code freeze / submission:** October 10, 2026, 10:00 AM
**Status:** approved scope for the build. Nothing here is implemented or measured yet.
**Companion docs:**
- `docs/FULL-SPEC.md`: full long-term spec
- `docs/VALIDATION.md`: validation and rationale
- `docs/WORKFLOW.md`: schedule

---

## 1. Problem and target user

A customer shows the barber a reference photo but cannot say which parts they actually want. The barber reads the photo differently. The cut happens, and the customer quietly lives with a result they did not expect. A haircut cannot be undone.

**Target user:** a neighborhood barber in the Philippines, cutting with the customer in the chair. It is a one-chair or small shop. Internet is unreliable or metered. There is one laptop and the barber's or customer's phone.

**Core outcome:** before cutting, the barber and customer share an **editable haircut agreement** (Keep / Change / Avoid). The shop keeps it, so the next visit can start from "same as last time".

**Usefulness is a hypothesis.** A staged demo shows the behavior. It does not prove better haircuts.

## 2. Why local (submission answer)

> GupAi analyzes close-up photos of a customer's face and hair and listens to their voice while they sit in the barber's chair. Sending that to a cloud API would mean uploading biometric-adjacent personal data from a small shop that has no privacy officer and often no reliable internet. Running the vision model, the language model, and speech recognition on the shop laptop keeps photos and audio inside the shop (consistent with the spirit of the Data Privacy Act, RA 10173). It works when the internet is down or the data load runs out, and it costs nothing per consultation. The phone talks only to the laptop over the shop's local network. No internet is required after setup.

## 3. Goals and non-goals

**Goals (judging-linked):**

| Goal | Criterion |
|---|---|
| G1. A real misunderstanding is resolved into a written agreement | Problem 25% |
| G2. Every AI call (vision, LLM, speech) runs on the laptop, demonstrated with internet off | Local AI 25% |
| G3. One complete, reload-safe journey that works reliably live | Execution 20% |
| G4. Barber-confirmed AI suggestions, correction handling, and preference memory | Innovation 15% |
| G5. A legible mirror-centered UI on laptop and phone, with a 5-minute demo | Demo 15% |

**Non-goals (excluded):** scalp diagnosis, attractiveness scoring, face *recognition* (identity). Face-*shape* estimation is in scope: it runs locally, the barber confirms it, and identity is never stored (S6b). Also excluded: automatic guard/clipper settings, autonomous cutting instructions, cloud inference fallback, generated makeover images, booking, payments, analytics dashboard.

## 4. Personas

- **Kuya Ben, barber.** Runs the laptop. Owns the consultation, confirms physical observations, enters cutting details, and saves the visit. He is the only one who can see the customer list.
- **Miguel, customer.** Holds the phone or sees the laptop mirror. States what he wants by voice or by tapping. He has the final say on preferences. His phone sees only his own consultation.

## 5. MVP user stories and acceptance criteria

The **MVP is these eleven stories (S1–S10 plus S6b), no more**. Each must work with internet disconnected.

| # | Story | Acceptance criteria |
|---|---|---|
| S1 | **Readiness.** As the barber, I see whether the local models are ready. | Home shows "Models ready" or a specific missing item (Ollama, vision model, whisper). The app still opens when models are missing, and no fake AI responses appear. |
| S2 | **Start / pair phone.** As the barber, I start a consultation and pair a phone by QR. | The QR encodes `https://<hotspot-ip>:8443/pair?code=…`. The code is single-use and expires in 10 min. Redeeming it sets an HttpOnly cookie scoped to one consultation and removes the code from the URL. Laptop and phone show the same consultation within 2 s of a change (polling). |
| S3 | **New or returning customer.** As the barber, I choose a temporary session or search a saved customer. | The search is barber-only (loopback). Results show the name, nickname, and last visit date. A customer can be created with a name and a retention-consent checkbox; without consent the session stays temporary. |
| S4 | **Say what you want.** As the customer, I describe my concern by voice or text. | Tap Talk (max 30 s) → local faster-whisper transcript → editable text → Send. Typing and quick-choice chips always work. A speaker toggle (Customer/Barber) labels the input. Negation is preserved ("huwag paikliin" ≠ "paikliin"). |
| S5 | **Capture photos.** As the customer, I take front and side photos on the phone. | A live mirrored preview is shown under HTTPS. Fallback: native camera via `<input capture>` over HTTP. Stored images are non-mirrored, EXIF-stripped, and ≤1024 px. Front and side are labeled. A retake is possible. |
| S6 | **Local observations.** As the barber, I confirm what the AI sees. | The vision model returns ≤5 short observations (e.g. "top length looks medium", "fringe covers forehead"), each with an uncertainty flag. The barber marks each one Confirm / Edit / Reject. Only confirmed observations feed the options. |
| S6b | **Face shape.** As both, we see the customer's face outline and an estimated face shape, then the barber confirms it. | **Front photo:** local MediaPipe Face Landmarker → face-oval outline drawn over the captured photo on laptop and phone, plus 3 ratios (length/cheek width, jaw/cheek, forehead/cheek). <br>**Classification:** deterministic rules → one of oval / round / square / oblong / heart / diamond, or "between X and Y" when near a threshold. <br>**Confirmation:** the barber taps a shape chip to confirm or override. It is labeled "Tantiya lang, the barber confirms". <br>**Not stored:** no identity, embedding, or raw landmark set; only the confirmed shape and the 3 ratios. <br>**No face found:** manual chips only. |
| S7 | **Two grounded options.** As both, we compare two haircuts from the catalog. | Each option comes from the 6-family catalog: crew cut, buzz cut, side part, textured crop, curtains, short quiff. Each shows the reference image, what stays, what changes, styling effort, why it fits, and its `source_ids`. **Face-shape fit:** when a confirmed face shape exists, the option shows the catalog's `face_shape_notes` for it (e.g. "Commonly suggested for round faces because height on top adds length"), cited to its source. This is framed as balance toward the customer's goal, never a beauty ranking. The customer's stated preference always outranks face-shape guidance. If only one option fits the constraints, the app says so and does not invent a second. Unsupported requests get "not in catalog, barber notes manually". |
| S8 | **Correction.** As the customer, I change my mind and the options update. | "Huwag galawin ang fringe" adds an Avoid/Keep constraint and bumps the revision. Stale results from an older revision are discarded. Regenerated options respect the new constraint. |
| S9 | **Agreement.** As both, we confirm a Keep / Change / Avoid card. | Customer taps "Ito ang gusto ko". Barber adds cutting notes and taps "Kaya ko 'to" (feasible). It is blocked while a conflict is open. The agreement is saved as an immutable version 1, 2… |
| S10 | **Save and return.** As the barber, I save the visit and retrieve it next time. | Complete visit = the agreement plus the barber's "actual cut" notes plus "save as preferred?". Photos are saved only with a separate checkbox. Returning customer → preferred cut shown → "Same as last time, o may babaguhin?" → new consultation pre-filled, with **old observations marked as unconfirmed**. Phone access is revoked and camera/mic are stopped at the end. |

## 6. Stretch, in cut order

Build only after S1–S10 pass the offline rehearsal. Cut from the bottom first.

1. One advisory checkpoint. The barber captures mid-cut, and the model compares against the agreement: "no visible concern / area to review / insufficient view / customer decision required".
2. Local TTS reply (Windows SAPI voice, muted by default).
3. Mascot listening and speaking states. A single static SVG is MVP.
4. Barber password lock.
5. Backup/restore.
6. Kwentong Barbero.

## 7. Functional requirements

**Consultation state machine (application-owned; the LLM never changes it):**
`created → concern → photos → observations → options → agreement → cutting → completed` (plus `abandoned`).
- The barber can go back one step.
- Every write carries `expected_revision`. A mismatch returns 409 with the current revision.

**Canonical state (`consultations.state_json`):**
- `goal`
- `keep[]`, `change[]`, `avoid[]`
- `styling_effort`
- `observations[]` (`text`, `view`, `uncertain`, `status`: proposed / confirmed / rejected)
- `options[]`
- `selected_option_id`
- `conflicts[]`
- `revision`

**Inputs:** voice clip, typed text, quick-choice chip, and photo. All of them become a `contribution` row with `speaker` and `input_type`.

**Voice:**
- States: `ready → recording → transcribing → review → sending → ready`.
- No live partial transcript.
- The level meter shows only while actually recording.

**Mirror:** the front camera preview is mirrored for display only. Left/right always means the customer's anatomical side.

**Failure states (must be real, not simulated):**

| Situation | Behavior |
|---|---|
| Camera denied | "Camera access is off. Upload a photo instead." |
| Mic denied | Typing and chips remain |
| Model unavailable | Keep the state; "Hindi pa handa ang AI sa laptop" with a Retry button |
| Slow model | Elapsed seconds and Cancel, with no fake percentage |
| Phone disconnects | Banner; unsent text kept; resync the revision on reconnect |
| Save fails | Explicit "Not saved", with Retry |
| App restart | Draft restored; interrupted jobs marked failed |

## 8. Non-functional requirements

- **Offline.** No remote fonts, scripts, images, auth, or inference at runtime. Proof: airplane-mode laptop + hotspot with no data, cold start, full journey.
- **Latency targets (to measure, not claim):**
  - transcription ≤8 s for a 10 s clip;
  - observations ≤25 s;
  - options ≤20 s.
  - The README reports the observed median and sample count.
- **Hardware:** a 16 GB+ laptop with integrated graphics; any modern phone browser (test the actual demo phone).
- **Accessibility:**
  - WCAG AA contrast;
  - visible focus (`#285EAE`);
  - ≥48 px touch targets;
  - non-color-only states;
  - transcript as the caption for any spoken reply;
  - `prefers-reduced-motion`.
- **Layouts:** laptop 1440×900 (check 1280×720); phone 375 px wide, using `100dvh` and safe-area insets.
- **Reliability:** one inference job at a time; jobs persisted; one consultation active.

## 9. UX and design system

- **Signature:** the customer's mirror is the dominant element. The agreement sits beside it like a consultation note. A small flat barber SVG sits next to the prompt and never covers the face.
- **Tokens:** from the plan's §4.

| Token | Value |
|---|---|
| canvas | `#F6F3EC` |
| surface | `#FFFDFA` |
| subtle | `#EAE5DA` |
| ink | `#252821` |
| ink-2 | `#62645C` |
| action | `#365846` |
| on-action | `#FFFFFF` |
| separator | `#D8D2C6` |
| boundary | `#77796F` |
| focus | `#285EAE` |
| error | `#A52B2B` |

- **Type:** one self-hosted variable sans in woff2 (e.g. Inter Tight or Figtree via `@fontsource`), bundled locally. Body 16 px; prompt 24–30 px laptop and 22–26 px phone. **Sentence-case labels** (no all-caps eyebrows).
- **Shape:** 10 px controls, 16 px sheets, 24–32 px mirror frame. Flat; no gradients, glow, glass, or sparkles.
- **Motion:**
  - 120 ms press;
  - 180–240 ms sheets;
  - ease-out on enter;
  - transform/opacity only;
  - no `transition: all`;
  - no staged reveals.
- **Copy:** plain Taglish first, with consistent action names. Errors say what to do next.
- **Laptop layout:** 12 columns, split 3 prompt / 6 mirror / 3 agreement, with the voice dock below the mirror.
- **Phone layout:** mirror first (4:5), then the prompt and mascot, then two stacked options. A sticky "Napagkasunduan" button opens a sheet.

## 10. Data model (SQLite, 7 tables)

UUID primary keys, `PRAGMA foreign_keys=ON`, and one `schema.sql` with a `user_version`.

| Table | Fields |
|---|---|
| customers | id, display_name, nickname, preferred_visit_id, retention_consent_at, created_at |
| consultations | id, customer_id NULL, status, stage, revision, state_json, pair_code_hash, pair_expires_at, phone_token_hash, started_at, ended_at |
| contributions | id, consultation_id, speaker, input_type, text, created_at |
| media | id, consultation_id, kind (photo/audio), view, storage_key, keep (bool), created_at |
| agreements | id, consultation_id, version, plan_json, customer_confirmed_at, barber_confirmed_at |
| visits | id, customer_id, consultation_id, agreement_id, actual_notes, completed_at |
| jobs | id, consultation_id, type, requested_revision, status, result_json, error_code, started_at, finished_at |

- Media files go in `data/media/<random>.jpg`, outside git.
- Temporary sessions delete their media at completion and on startup cleanup.
- Raw audio is deleted right after transcription.

## 11. API surface (FastAPI, same origin)

`B` = barber only (loopback client). `P` = paired phone (cookie scoped to its consultation) or barber.

| Method and path | Who | Purpose |
|---|---|---|
| `GET /api/health` | any | Model readiness booleans only |
| `GET/POST /api/customers` | B | Search / create |
| `GET /api/customers/{id}` | B | Profile, preferred cut, visits |
| `POST /api/consultations` | B | Create (optionally from a preferred visit) |
| `GET /api/consultations/{id}` | P | State and revision (polled) |
| `POST /api/consultations/{id}/pair` | B | Issue QR code |
| `GET /pair?code=` | any | Redeem → cookie → redirect |
| `POST /api/consultations/{id}/contributions` | P | Text/chip, or confirm/edit/reject an observation |
| `POST /api/consultations/{id}/media` | P | Photo or audio upload |
| `POST /api/consultations/{id}/jobs` | P | Start a job: `transcribe`, `observe`, or `propose` |
| `GET /api/jobs/{id}` | P | Status/result; `DELETE` cancels |
| `POST /api/consultations/{id}/agreements` | P | Customer or barber confirm |
| `POST /api/consultations/{id}/complete` | B | Actual notes, preferred flag, photo retention |
| `GET /api/media/{id}` | P | Scope-checked image |

- Errors use `{code, message, retryable, revision?}`.
- Mutations require `expected_revision` and an `Idempotency-Key` header.

## 12. Local AI design

| Component | Choice | Notes |
|---|---|---|
| Runtime | Ollama on `127.0.0.1:11434` | `keep_alive` preload at startup |
| Vision + text LLM | `qwen3.5:4b`. Fallback ladder: `qwen3.5:2b` → `gemma3:4b` | Thinking off, `num_ctx` ≈4096, `num_predict` ≤400, temperature 0.2. Pin the digest after testing. |
| Speech-to-text | faster-whisper `small`, int8, CPU | Test `language="tl"` against auto-detect on Taglish samples; keep whichever wins |
| Face landmarks | MediaPipe Face Landmarker (`face_landmarker.task`, about 3.6 MB, bundled) via the Python `mediapipe` package | CPU, well under 1 s per photo. Fallback if the Python wheel fails: `@mediapipe/tasks-vision` in the browser, with the WASM and model served locally |
| Retrieval | `knowledge/catalog.json` (6 styles, including `face_shape_notes`) plus `knowledge/sources.json` | Rule/tag filter by constraints and confirmed face shape; no embeddings needed for 6 entries |

**Pipeline per `propose` job:**
1. Load the canonical state at `requested_revision`.
2. Use only **confirmed** observations.
3. Filter catalog styles that violate `avoid` / `keep` (deterministic).
4. Prompt the model with the goal, constraints, confirmed observations, and the candidate style cards. Ask for an Ollama structured output (`format` = JSON schema):
   - `reply` (≤3 sentences)
   - `next_question`
   - `proposed_changes[]` {field, op, value, negated}
   - `options[]` {catalog_id, why, stays[], changes[], effort, needs_barber_check[]}
   - `source_ids[]`
   - `uncertainties[]`
5. Validate the output:
   - `catalog_id` is in the candidate set;
   - `source_ids` exist;
   - no field outside the allowed list.
   On failure, make one repair attempt, then fall back to a simple clarification question.
6. If the state revision has moved on, discard the result.
7. The UI shows proposals; a human confirms; then they are persisted.

**`observe` job:** one image per call, resized to ≤768 px. The prompt is limited to the visible hair attributes on an allowed list: length per region, fringe coverage, visible parting, apparent texture. It never covers scalp, health, face attractiveness, or identity.

**`faceshape` job** (deterministic code, no LLM):

1. Run MediaPipe Face Landmarker on the canonical front photo.
2. Compute the measurements from landmarks:
   - face length L = distance(10, 152);
   - cheekbone width C = distance(234, 454);
   - jaw width J = distance(172, 397);
   - forehead width F = distance(54, 284).
3. Compute the ratios: `lw = L/C`, `jw = J/C`, `fw = F/C`.
4. Apply the starting rules, in order:
   - `lw ≥ 1.50` → oblong;
   - `lw ≤ 1.15` → square if `jw ≥ 0.90`, else round;
   - `fw − jw ≥ 0.12` → heart;
   - `fw < 0.85 and jw < 0.85` → diamond;
   - `jw ≥ 0.90` → square;
   - otherwise → oval.
5. If any value falls within ±0.04 of a threshold, return the top two shapes as "between X and Y".
6. Return the 36-point `FACE_OVAL` outline normalized to 0–1 for the overlay. It lives only in the job result and is never written to the database.

The thresholds are **uncalibrated starting values**. Tune them on 5–10 consenting photos and disclose them as a heuristic. Published face-shape classifiers report about 64–96% accuracy on small, subjectively labeled datasets, so the barber always confirms the result.

**Prompt-injection hygiene:** user text and retrieved docs go into data fields, never into instructions. The model output is never executed or rendered as HTML.

## 13. Security requirements (VibeSec)

- Barber routes reject any client whose IP is not loopback. The laptop browser uses `https://localhost:8443`.
- Pairing code: 128-bit random, hashed at rest, single-use, 10-minute expiry. Phone token: HttpOnly; Secure; SameSite=Strict, revoked on completion.
- Every resource lookup checks consultation scope. A miss returns 404, not 403.
- Uploads:
  - allowlist with magic-byte checks (JPEG/PNG/WebP; WebM/OGG/WAV/MP4-audio);
  - 8 MB photo and 2 MB audio caps;
  - Pillow re-encode, which drops EXIF and bounds dimensions;
  - random storage keys;
  - no SVG uploads.
- SQL is parameterized only. There is no state change on GET except the pairing redeem, which is one-shot and token-gated.
- Headers: `Content-Security-Policy: default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:`, plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `X-Frame-Options: DENY`. Mutations require a matching Origin.
- Ollama listens on loopback only. Logs never contain names, transcripts, images, or tokens.
- Disclosed limitations: no barber password in the MVP; data is not encrypted at rest; local network trust depends on the hotspot password.

## 14. Success metrics (honest)

Hackathon (measured on the demo hardware, logged in `docs/MEASUREMENTS.md`):
- the full S1–S10 journey completes offline in 3 of 3 rehearsals;
- median latency per job type, with sample counts;
- peak RAM.

The README reports observed numbers only. Estimates are labeled as estimates. Fake benchmarks are a disqualification rule.

**Post-hackathon (hypothesis):** barber-reported fewer "hindi ito ang gusto ko" moments, compared with a plain photo/checklist consultation.

## 15. Risks and mitigations

| Risk | Likelihood | Mitigation / fallback (still a working product) |
|---|---|---|
| Phone camera blocked (no trusted HTTPS) | High | Verify mkcert + CA trust in the first hour. Fallback: `<input capture>` photos over HTTP; voice on the laptop |
| Hotspot unavailable at the venue (e.g. iPhone needs cellular data on) | Med | Use an Android hotspot with data off, or a pocket router with WAN unplugged. Rehearse on the exact hardware |
| Hotspot IP changes, so the cert no longer matches | Med | Generate the mkcert cert for every likely IP plus `gupai.local`. Regenerating at the venue takes 1 minute and works offline |
| Vision latency >60 s | Med | Smaller model, smaller images, one view at a time. Last resort: the barber types observations and the LLM does options only, disclosed |
| Taglish transcription poor | Med | Editable transcript; chips; typing. Demo the correction by typing if needed and say so |
| LLM returns invalid JSON or a hallucinated style | Med | Structured outputs, ID validation, one repair, then a clarification question |
| Face shape misread (hair covering the forehead, head tilt, lens distortion at arm's length) | High | Capture guide: hair off the forehead if possible, face level, phone at eye height. "Between X and Y" output. The barber's chip override is always one tap |
| `mediapipe` wheel unavailable for the installed Python version | Med | Use Python 3.11 or 3.12 for the venv, or the browser `tasks-vision` fallback with the model served locally |
| Out of time | High | Stretch list is cut first. The demo video is recorded by 09:00 regardless |
| Laptop sleeps or the battery dies on stage | Low | Power plugged in; sleep disabled; models preloaded before pitching |

## 16. Submission and disclosure checklist (briefing slide 16)

- [ ] Project name: **GupAi**
- [ ] Short description (≤2 sentences): "An offline barbershop consultation assistant. Local vision, speech, and language models help the barber and customer agree on a haircut before cutting, and remember it for next time."
- [ ] Team members (official names from appbuildersph.com/hackathon)
- [ ] **Public** GitHub repo before 10:00 AM, with a README covering setup (judges can recreate it; deployment is not needed)
- [ ] Demo video (~1 min)
- [ ] X or LinkedIn post with the video, tagging Devin / Cognition and including **#AppBuildersPH**. Submit its URL.
- [ ] **What runs locally:**
  - Qwen vision/LLM via Ollama;
  - faster-whisper STT;
  - FastAPI;
  - SQLite;
  - the catalog;
  - all UI assets.
- [ ] **What requires internet:** only the initial installs (pip/npm, model pulls, font package). Nothing at runtime.
- [ ] **Models:** exact Ollama tags and digests; faster-whisper model size; MediaPipe `face_landmarker.task` (Apache-2.0).
- [ ] **Technologies:** React, TypeScript, Vite, Tailwind, FastAPI, Pydantic, SQLite, Pillow, mkcert, qrcode.
- [ ] **APIs/cloud services:** none at runtime.
- [ ] **Existing code/assets:**
  - planning documents written before the build;
  - catalog photo licenses (ASSETS.md);
  - font license;
  - any template code.
- [ ] **AI dev tools:** Claude Code (plus any others actually used) and the installed skills.
- [ ] **Why local** (§2).
- [ ] Submitted once, on cerebralvalley.ai/e/appbuildersph-hackathon-2026, **before 10:00 AM**.

## 17. Demo script (5:00 live + 3:00 Q&A)

1. **0:00–0:30 Problem.** "Pinakita ko yung picture… hindi pa rin yun ang lumabas." The reference photo is not the same as the agreement.
2. **0:30–0:50 Local proof.** The laptop's Wi-Fi is on the phone hotspot with mobile data **off**. Show that google.com fails to load. Show models ready.
3. **0:50–2:00 Consult.** Scan the QR on the phone. The customer speaks a concern, and the transcript appears and can be edited. Take front and side photos. The face outline appears on the photo with "Mukhang round, between round and oval", and the barber confirms. Local hair observations appear; the barber confirms one and rejects one.
4. **2:00–3:00 Options and correction.** Two catalog options with reasons. The customer says "Huwag galawin ang fringe", and the options regenerate with the constraint visible.
5. **3:00–3:40 Agreement.** The customer confirms, the barber adds notes and confirms, and version 1 is saved.
6. **3:40–4:20 Return visit.** Complete the visit and save it as preferred. Then Returning customer → "Same as last time, o may babaguhin?"
7. **4:20–5:00 Honesty.** Everything ran on this laptop. Show the measured times from MEASUREMENTS.md, and say what still needs barber validation.

Use fictional customers only. Any prepared photo or fallback video is labeled as staged.

---

## Appendix A. Face-shape guidance (research summary for `catalog.json`)

**What the sources say:**
- The open barbering textbook lists **face shape, head shape, and growth patterns** as parts of the design consultation. It says the finished shape can highlight or downplay features, and that the client's preferences come first.
- **Oval** is treated as balanced; most styles work.
- **Round** benefits from height on top and angular shapes, with tight sides.
- **Oblong** should avoid adding more length.

Grooming publications add guidance for square, heart, and diamond. They **disagree on oblong**: one recommends width at the sides, another warns that short sides lengthen the face. Record both views and let the barber decide.

| Face shape (ratios) | General guidance | Catalog styles commonly suggested | Use with care |
|---|---|---|---|
| Oval (balanced) | Most styles work | All six | Heavy flat fringe can read rounder |
| Round (`lw` low, `jw` < 0.90) | Add height on top and angles; keep sides tight | Short quiff, textured crop with lift, side part | Buzz cut, flat curtains |
| Square (`lw` low or mid, `jw` ≥ 0.90) | Strong jaw; classic short cuts suit, or soften with texture | Crew cut, buzz cut, side part, textured crop | — |
| Oblong (`lw` ≥ 1.50) | Avoid extra height; keep some width or fullness at the sides; a fringe shortens the face | Textured crop with fringe, side part, curtains | Tall quiff; very tight sides (sources disagree) |
| Heart (`fw` ≫ `jw`) | Soften the wide forehead; medium length; avoid very short | Curtains, textured crop with fringe, side part | Buzz cut, high quiff |
| Diamond (`fw` and `jw` < cheekbones) | Add width at the forehead (fringe) and fullness lower down | Textured crop, curtains | Very tight sides plus height |

**Framing rules for copy:**
- Say "commonly suggested for… because…", never "best for your face" or "flattering".
- Always pair face-shape guidance with the customer's own goal and hair observations, such as growth pattern and available length.
- If the customer wants a style marked "use with care", explain the trade-off once and respect the choice.

**Accuracy caveat:** published face-shape classifiers report about 64–96% accuracy. They are trained on small, mostly female celebrity datasets with subjective labels, and they fail when the face boundary is missed. GupAi's estimate is a starting suggestion that the barber confirms.

**Sources** (add to `knowledge/sources.json`):
- [Barbering Techniques for Hairstylists, Ch. 1: Client Consultation and Analysis (OpenTextBC, CC BY)](https://opentextbc.ca/barberingtechniquesforhairstylists/chapter/the-design-consultation/)
- [Pall Mall Barbers: Best men's hairstyles by face shape](https://www.pallmallbarbers.com/london/best-men-hairstyles-by-face-shape/)
- [The Manual: Best haircut for your face](https://themanual.com/grooming/best-haircut-for-your-face)
- [Gentleman's Gazette: How to get the best haircut for your face shape](https://www.gentlemansgazette.com/how-to-get-best-haircut-for-face-shape/)
- [Face shape classification using Inception v3 (arXiv 1911.07916)](https://arxiv.org/pdf/1911.07916): accuracy limits and dataset bias
- [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker): the local landmark model
