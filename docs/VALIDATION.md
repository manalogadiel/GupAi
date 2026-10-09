# GupAi plan validation

**Validated document:** `docs/FULL-SPEC.md`
**Against:** AppBuildersPH Hackathon 2026 Participant Briefing (29 slides)
**Lenses applied:** superpowers, ponytail, VibeSec, frontend-design, impeccable, emilkowalski/skills, ui-ux-pro-max, caveman
**Date:** October 9, 2026, 8:20 PM. About 13.5 hours remain before the 10:00 AM code freeze.
**Builder:** solo, no code written yet. Laptop + phone is a required part of the demo.

## Verdict

**The product direction is sound. The scope is not.**

**Product direction.** GupAi addresses a concrete problem for a clear user. It runs real local inference: vision, LLM, and speech. Its claims are unusually honest, which protects it under the "fake benchmarks" rule.

**Scope.** The plan is a multi-week specification. With about 13.5 hours left and one builder, it cannot ship as written. A partial build of everything would score worse on Technical Execution (20%) and Demo Quality (15%) than one complete journey.

Ship one reliable, offline, laptop + phone journey:

**pair phone → capture → local observations → two options → correction → agreement → save → return visit**

Everything else is stretch. `docs/PRD.md` defines that cut. `docs/WORKFLOW.md` schedules it.

## Scorecard by judging criterion

| Criterion (weight) | What the brief asks | Plan status | Gap / risk | Fix |
|---|---|---|---|---|
| Problem & Usefulness (25%) | Genuine problem, clear target user | **Aligned** | Problem rests on one personal observation; no barber has been consulted | Open the pitch with the concrete mismatch story. Say plainly that usefulness is a hypothesis. Show the agreement card as the tangible artifact. |
| Local AI Implementation (25%) | Local inference is fundamental and gives a meaningful advantage | **Aligned, under-argued** | The plan never states *why local* in one sentence. The submission form requires that answer. | Add the "Why local" answer (PRD §2): face photos and voice never leave the shop, it works with no or metered internet, and there is no per-consult cost. Disconnect internet **on stage** before the first AI call. |
| Technical Execution (20%) | Works reliably enough for a live demo | **Risk** | 11 release items, ~17 endpoint groups, 12 tables. Phone HTTPS is unproven. `qwen3.5:4b` vision latency on integrated graphics is unmeasured. | Cut to the MVP journey. Prove the phone and model in the first hour. Keep a degraded but working fallback for each (PRD §15). |
| Innovation (15%) | Meaningfully different; local AI enables something new | **Aligned** | — | Emphasize the agreement contract, correction handling, and preference memory. These are hard to justify with cloud inference on customer faces. |
| Product & Demo Quality (15%) | Usable UX; convincing live demo | **Aligned, overspecified** | The 5-minute script fits, but it includes a checkpoint that is not MVP | Replace the checkpoint segment with the return-visit retrieval. Keep a pre-recorded fallback video. |

## Findings

### Critical: blocks a winning submission

**C1. Scope exceeds the time available.**
- Plan §15 lists 7 dependency phases with no hours.
- About 13.5 solo hours remain. Model downloads, certificate setup, and submission take about 3 of them.
- *ponytail:* "question whether the feature is needed… no speculative code."
- *superpowers writing-plans:* tasks need exact files and verification steps.
- **Fix:** an MVP of 10 stories. Stretch items are cut in a fixed order (PRD §5–6).

**C2. Submission deliverables are missing.** Briefing slide 16 requires each of these. None appears in the plan:
- 1-minute demo video
- X/LinkedIn post tagging Devin/Cognition with `#AppBuildersPH`
- public GitHub repo with instructions to recreate (the app does not need to be deployed)
- disclosures: models, frameworks, APIs/cloud, existing code and assets, AI dev tools
- "what runs locally" and "what requires internet"
- the answer to **"Why does this product benefit from running AI locally?"**
- **Fix:** PRD §16 has the checklist. Workflow block 09:00–09:45 produces it. The deadline is 10:00 AM, with **no resubmission** and **no commits after the deadline**.

**C3. Phone over local HTTPS is the single largest technical risk.**
- `getUserMedia` needs a secure context. A LAN IP over HTTP is not one; `localhost` on the laptop is.
- The plan places this in Phase 1 but has no fallback that keeps the phone in the demo.
- **Fix:**
  - mkcert certificate covering the laptop's hotspot IP, with the root CA installed and trusted on the phone.
  - Network: phone hotspot with **mobile data off**, so there is visibly no internet.
  - **Fallback that keeps the phone required:** `<input type="file" accept="image/*" capture="user">` works over plain HTTP. It opens the native camera, so phone photos still work if HTTPS fails. Voice then records on the laptop, where localhost is a secure context.
  - Prove all of this **in the first hour**.

### High

**H1. "Why local" is implicit.** See the scorecard. This is the question every submission must answer.

**H2. Model latency is unknown.**
- `qwen3.5:4b` vision on a 16 GB integrated-graphics laptop may take tens of seconds per image.
- **Fix:**
  - Time it in the first hour.
  - Resize captures to ≤768 px.
  - Disable thinking mode.
  - Cap output tokens.
  - Preload with `keep_alive`.
  - Fallback ladder: `qwen3.5:2b` → `gemma3:4b` → the vision model runs once per photo, and option generation uses text only.
  - Budget: observation ≤25 s, options ≤20 s, measured and reported honestly.

**H3. Contradictory sentence in the plan.** Line 7 said the document supersedes "the mirror-centered interface, voice-first interaction…". Sections 2 and 4 *require* those. **Fixed in the source plan.**

**H4. Catalog image licensing is a hidden time sink.**
- Plan §5 requires licensed real haircut photos for six families.
- **Fix:**
  - Use images under the Unsplash or Pexels license, with the photographer and URL recorded in `ASSETS.md`.
  - If time runs short, use original simple SVG side-profile diagrams instead.
  - Never present a reference as the customer's result.

### Medium: design lenses

| # | Lens | Finding | Fix |
|---|---|---|---|
| M1 | frontend-design | Cream palettes are listed as a generic-AI tell | *impeccable:* "The brief wins." The user chose cream, so keep it. Make the deep green action color, the mirror frame, and Taglish copy the identity. |
| M2 | impeccable, frontend-design | System-default font stack is flagged as generic | Bundle one self-hosted variable woff2 (e.g. via `@fontsource`). It still works offline; no CDN. |
| M3 | frontend-design | All-caps micro labels (`CURRENT STEP`, `CUSTOMER MIRROR`, `NAPAGKASUNDUAN`) | Use sentence case: "Current step", "Napagkasunduan" |
| M4 | frontend-design, ui-ux-pro-max | A 6-step stepper plus a 3-column layout risks a dashboard feel | Keep it. The mirror is the hero element, which matches "lead with the subject's most characteristic element". Show the step as text ("Step 3 of 6 · Preferences") on the phone. |
| M5 | emil-design-eng | Motion spec is sound | Add **ease-out** for enter, no ease-in. Keep 120 ms press and 180–240 ms sheets. Animate transform/opacity only. Respect `prefers-reduced-motion`. |
| M6 | mobile-native | Phone-specific details are missing | `100dvh` instead of `100vh`; `env(safe-area-inset-*)`; 16 px inputs to stop iOS zoom; `touch-action: manipulation`; no sticky hover |
| M7 | impeccable | Gray text on tinted surfaces | Check that `#62645C` on `#EAE5DA` reaches ≥4.5:1, or use primary ink there |

### Security: VibeSec

The plan is already strong: scoped access, magic-byte upload checks, parameterized SQL, model output rendered as text, Ollama on loopback. For a solo MVP, **simplify without weakening the trust boundary**:

| Keep (never cut) | Simplify for MVP | Defer and disclose |
|---|---|---|
| Phone token scoped to a single consultation, single-use, expiring | Barber surface = the laptop browser on `localhost`. Barber-only routes reject non-loopback clients. | Barber password / login |
| HttpOnly + SameSite=Strict cookie; token removed from the URL | One `security_headers` middleware: CSP `default-src 'self'`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` | Backup / restore |
| Uploads: magic bytes (JPEG/PNG/WebP, WebM/OGG/WAV), size cap, re-encode with Pillow (strips EXIF), random filenames, served from an API, not a static directory | CSRF: SameSite=Strict + Origin check on POST | Customer deletion UI (keep the API) |
| Parameterized SQL; no state change on GET | — | Encryption at rest (state that it is *not* encrypted) |
| Model output rendered as text, never HTML | — | — |
| Ollama bound to `127.0.0.1`; app binds to the hotspot interface only | — | — |

### Already aligned: keep as is

- Honest measurement language and "no fake AI / fake persistence". This directly protects against the **fake benchmarks** disqualification rule.
- A deterministic consultation controller owns state. The LLM only proposes; schema validation plus one repair attempt.
- The typed path always works; voice is an enhancement.
- The excluded-features list: no face recognition, attractiveness scoring, or cloud fallback.
- Left/right is the customer's anatomical side; the mirrored preview is separate from the canonical stored image.
- The 5-minute demo fits the briefing's 5 + 3 minute format.
- Fictional customers for the public demo.

## How each skill was applied

| Skill | Used for |
|---|---|
| superpowers | Structured the workflow: plan → test-first where logic is non-trivial → build → verify-before-completion → review |
| ponytail | Scope cut (C1); MVP table count 12 → 7; endpoints ~17 → 11 |
| VibeSec | Security table above |
| frontend-design | M1, M3, M4 |
| impeccable | M1 (the brief wins), M2, M7; `/impeccable critique` and `/impeccable audit` scheduled in the polish block |
| emilkowalski/skills | M5 (emil-design-eng), M6 (mobile-native); `review-animations` scheduled in the polish block |
| ui-ux-pro-max | Flat-design and accessibility checks (M4, M7), consistent with the plan's earlier use |
| caveman | Agent chat brevity during the build only. Not applied to docs, commits, or security warnings, per its own exceptions. |

## Changes made to the source plan

- Line 7 contradiction corrected.
- Added a pointer stating that `docs/PRD.md` and `docs/WORKFLOW.md` define the hackathon MVP scope and schedule.
