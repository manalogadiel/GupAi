# GupAi: development workflow (solo, Build Night)

**Window:** Fri Oct 9, 20:30 → Sat Oct 10, 10:00 (code freeze and submission, no extensions)
**Internal freeze:** 09:00. After that: docs, video, post, and submit only.
**Scope:** `docs/PRD.md` §5, stories S1–S10. Stretch items (PRD §6) are built only if a block finishes early.
**Rule:** every block ends with a **gate**. If a gate isn't met by the block's end, apply that block's **cut** and move on. Never let one block eat the next.

---

## Two-agent mode: Claude Code (lead) + Codex (worker)

**Shared folder:** `C:\Users\Diel\Documents\GitHub\GupAi`, one git repo. Both agents work in the same folder; nothing to sync.

| File | Purpose |
|---|---|
| `AGENTS.md` | The rules both agents follow. Codex reads it natively; `CLAUDE.md` imports it with `@AGENTS.md` |
| `docs/PRD.md`, `docs/API.md` | Scope, and the backend↔frontend contract both sides build against |
| `docs/TASKS.md` | Task board: owner, status, the **exact files** each task may touch, how to verify |
| `docs/agents/<ID>.md` | Codex's report for each task |
| `scripts/codex-task.sh <ID>` | How the lead hands a task to Codex (`codex exec`, non-interactive) |

**Who owns what.** Splitting by folder means no edit conflicts:
- **Codex:** `backend/`, `knowledge/`, and the tests.
- **Claude:** `frontend/`, `docs/`, root docs, integration, and review.
- **Gadiel:** phone, hotspot, certificate trust, video, post, submit.

**Loop:**
1. Claude runs `bash scripts/codex-task.sh C1` in the background. Codex builds and tests, writes `docs/agents/C1.md`, and sets the task to `review`.
2. Meanwhile Claude builds the frontend against `docs/API.md` (K tasks).
3. When Codex finishes, Claude reviews `git diff -- backend knowledge`, runs pytest, `/ponytail-review`, and `vibesec-skill`, then **commits**. Only Claude commits. Then it dispatches the next C task.
4. If a review fails, Claude re-dispatches with notes: `bash scripts/codex-task.sh C2 "Fix: …"`.

**Skills:** both agents see the same eight skill sets, already installed.
- Claude: `~/.claude/skills` plus plugins.
- Codex: `~/.codex/skills` plus `~/.agents/skills`.

Verified: Codex listed superpowers, ponytail, vibesec, frontend-design, impeccable, ui-ux-pro-max, emil-design-eng, mobile-native, and caveman.

**Watching Codex yourself (optional):** open the same folder in the Codex app and read `docs/agents/*.log`. Don't type tasks into it while a dispatched task is running.

## 0. Working loop (every task)

This is the superpowers loop, kept small with ponytail:

1. **Plan (2 min).** Write the task as one line in `docs/TASKS.md`: files to touch, plus how to verify. *(superpowers: writing-plans)*
2. **Test first if logic is non-trivial.** This covers state transitions, revision conflicts, constraint filtering, schema validation, and permission checks. Use `pytest`, red then green. UI and glue code don't need tests; verify those in the browser. *(superpowers: test-driven-development; ponytail: "non-trivial logic gets a small test")*
3. **Build the smallest thing that passes.** No speculative options or abstractions. Mark known limits with a `# shortcut: <limit>, <when to upgrade>` comment. *(ponytail)*
4. **Security pass on any endpoint or upload.** Check scope, magic bytes, size, parameterized SQL, and that output is rendered as text. *(VibeSec)*
5. **Verify for real.** Run the action on the laptop **and** the phone. Don't assume it works. *(superpowers: verification-before-completion)*
6. **Commit.** `git add -p && git commit -m "feat(consult): …"`. Push every hour; the repo can stay private until 09:00. *(caveman-commit style is fine for messages)*

Skill triggers during the night:

| When | Skill |
|---|---|
| Any new endpoint, upload, cookie, or pairing work | `vibesec-skill` |
| Any coding task | `ponytail` (default full); `/ponytail-review` before the 05:00 rehearsal |
| Building UI components | `frontend-design`, `ui-ux-pro-max` (tokens/a11y lookups) |
| Phone layout | `mobile-native` |
| Polish block | `/impeccable critique`, `/impeccable audit`, `review-animations`, `break-ui` on the agreement card and customer list |
| Agent chatter while coding | `caveman`. Not for docs, README, commits explaining security, or anything judges read |
| Something fails mysteriously | superpowers `systematic-debugging` / `investigate-first`. Spend at most 20 minutes, then take the block's cut |

---

## 1. Repo layout (create at 20:30)

```text
gupai/
  README.md                 setup, why local, what runs locally, disclosures, measured results
  ASSETS.md                 every image/font: source, license, author, modifications
  DISCLOSURES.md            models + digests, frameworks, AI dev tools, pre-existing docs
  backend/
    app/main.py             FastAPI app, security headers, static frontend mount
    app/db.py               sqlite3 connection, schema.sql loader, user_version
    app/schema.sql          7 tables (PRD §10)
    app/auth.py             loopback check, pairing, phone cookie scope
    app/consult.py          state machine, revision check, constraint logic (tested)
    app/ai.py               ollama client, observe/propose prompts, JSON schema, validation
    app/stt.py              faster-whisper wrapper
    app/media.py            upload validation, Pillow re-encode, storage keys
    app/jobs.py             single worker thread + jobs table
    tests/                  test_consult.py, test_auth.py, test_ai_validate.py
  frontend/                 Vite + React + TS + Tailwind
    src/tokens.css          PRD §9 tokens as CSS variables
    src/pages/              Home, Customers, Consult (laptop), Phone
    src/components/         Mirror, VoiceDock, TranscriptReview, OptionCard, AgreementCard, Mascot
    public/assets/          mascot.svg, catalog/*.webp, fonts via @fontsource (bundled at build)
  knowledge/catalog.json    6 styles: id, name, stays, changes, effort, maintenance, limitations, image, source_ids
  knowledge/sources.json    id, title, url, reviewed_at, claim
  certs/                    mkcert output (gitignored)
  data/                     sqlite + media (gitignored)
  docs/MEASUREMENTS.md      timing log (template in §4)
  docs/TASKS.md
```

The `.gitignore` covers `data/`, `certs/`, `*.pem`, `.venv/`, `node_modules/`, and `frontend/dist/`.

---

## 2. Schedule

### B0 · 20:30–21:30 · Hardware and network proof (the riskiest work first)

Start the downloads first, then do the rest while they run.

```bash
ollama pull qwen3.5:4b
```

```bash
ollama pull qwen3.5:2b
```

```bash
python -m venv .venv && .venv/Scripts/pip install fastapi "uvicorn[standard]" pydantic pillow python-multipart faster-whisper httpx qrcode pytest
```

```bash
winget install FiloSottile.mkcert
```

```bash
npm create vite@latest frontend -- --template react-ts
```

While the downloads run, write `knowledge/catalog.json` with the 6 styles and draft `ASSETS.md`. Find catalog photos on Unsplash or Pexels and record the license and URL for each.

Then prove each of these items on the **actual demo phone and laptop**:
1. **Network.**
   - Turn on the phone hotspot with mobile data **off**.
   - Join the laptop to it and note the IP: `ipconfig`, "Wireless LAN adapter Wi-Fi".
   - Set the network profile to **Private**, so the Windows Firewall prompt allows inbound 8443.
2. **Certs.**
   - Run `mkcert -install`.
   - Then run `mkcert -cert-file certs/gupai.pem -key-file certs/gupai-key.pem localhost 127.0.0.1 gupai.local <hotspot-ip>`.
   - Copy `rootCA.pem` from `mkcert -CAROOT` to the phone and install it:
     - Android: Settings → Security → Encryption & credentials → Install certificate → CA certificate.
     - iOS: install the profile, then Settings → General → About → Certificate Trust Settings → enable.
3. **Camera.** A 20-line `uvicorn --ssl-certfile … --port 8443 --host 0.0.0.0` page that calls `getUserMedia` opens on the phone at `https://<ip>:8443` and shows video.
4. **Model.** A Python script sends one 768 px photo to `qwen3.5:4b` via `/api/chat` with `images`, `think: false`, and a JSON `format`. Record the wall time in MEASUREMENTS.md.
5. **STT.** faster-whisper `small` int8 transcribes a recorded 10 s Taglish clip ("Gusto ko maikli sa gilid pero huwag galawin ang fringe"). Try it with `language="tl"` and with auto-detect, and record the time and accuracy of each.

**Gate:**
- the phone shows the camera over HTTPS;
- one vision call is timed;
- one transcript is timed.

**Cut:**
- **HTTPS fails** → use the `<input type="file" accept="image/*" capture="user">` fallback over HTTP. Voice then records on the laptop, where localhost is a secure context. The phone is still required in the demo for capture and agreement.
- **Vision >60 s** → switch to `qwen3.5:2b`.
- **Vision still slow** → the barber types observations, the LLM generates options only, and this is disclosed.

### B1 · 21:30–23:00 · Skeleton and pairing (S1, S2, S3)

- `schema.sql` (7 tables), `db.py` with `PRAGMA foreign_keys=ON`.
- Security headers middleware. `/api/health` reports booleans for ollama, the model, and whisper.
- `auth.py`:
  - a `require_barber` dependency checks that `request.client.host` is loopback;
  - a `require_scope(consultation_id)` dependency checks the phone cookie hash or barber.
  - **Tests:** a phone cookie for consultation A gets 404 on B; a non-loopback request to `/api/customers` gets 403.
- Pairing:
  - `POST /pair` returns a code and a QR (`qrcode` → PNG data URL).
  - `GET /pair?code=` redeems it once, sets an HttpOnly/Secure/SameSite=Strict cookie, and redirects to `/phone`.
- Frontend:
  - `tokens.css`;
  - the app shell;
  - Home (New consultation / Returning customer, plus the readiness line);
  - the laptop Consult page with a 3/6/3 grid;
  - the Phone page (mirror first);
  - both pages poll `GET /api/consultations/{id}` every 1.5 s.
- Vite dev on the laptop (port 5173): `server: { https: { key, cert }, proxy: { '/api': { target: 'https://localhost:8443', secure: false } } }`. For phone tests, run `npm run build` and let FastAPI serve `frontend/dist`. That way the phone only ever talks to `:8443`, and cookies and the CSP match production.

**Gate:** scanning the QR on the phone opens the same consultation, and a stage change on the laptop appears on the phone within 2 s.

**Cut:** drop QR rendering and show the URL plus a short code in large text.

### B2 · 23:00–00:45 · Capture → local observations (S5, S6)

- Mirror component:
  - a `getUserMedia({video:{facingMode:'user'}})` preview, mirrored with CSS `scaleX(-1)`;
  - capture to canvas **un-mirrored**;
  - `toBlob('image/jpeg', 0.85)`;
  - front/side labels;
  - retake.
  - Stop the tracks on unmount.
- `media.py`:
  - check magic bytes;
  - enforce a size cap;
  - `Image.open` → `ImageOps.exif_transpose` → `thumbnail(1024)` → save JPEG without EXIF under `secrets.token_hex(16)`.
- `jobs.py`: one worker thread pulls `queued` jobs and stores the result. `GET /api/jobs/{id}` is polled every 1 s and shows elapsed seconds and a Cancel button.
- `ai.observe(image)` returns `observations[] {text, view, region, uncertain}` from the allowed attribute list only.
- Laptop UI: an observation list with Confirm / Edit / Reject. Only confirmed observations go into the state.
- **Face shape (S6b).**
  - After the front capture, run the `faceshape` job: MediaPipe landmarks → ratios → rules (PRD §12).
  - Draw the face-oval outline over the captured photo on the phone and laptop, with copy like "Mukhang round · between round and oval · tantiya lang".
  - The barber confirms with shape chips.
  - The confirmed shape feeds `propose`, so each option shows its catalog `face_shape_notes` (PRD Appendix A).
  - **Cut:** if MediaPipe fails, the barber picks a shape from the chips (still useful; disclosed).

**Gate:** with the internet off, a real phone photo → observations on the laptop → the barber confirms one.

**Cut:** analyze the front view only and keep the side photo for display.

### B3 · 00:45–02:30 · Grounded options and correction (S4 text path, S7, S8)

- `consult.py`, test first:
  - `apply_contribution(state, change, expected_revision)` raises on a revision mismatch;
  - negation is preserved;
  - a conflict is detected when the same region is in both `keep` and `change`;
  - `candidate_styles(catalog, state)` filters by `avoid` / `keep`.
- `ai.propose(state)` uses the Ollama `format` JSON schema (PRD §12). Validate that every `catalog_id` is in the candidates and every `source_id` exists. Allow one repair, then fall back to a clarification question.
  - **Test:** an invented style ID is rejected.
- Discard the result if `job.requested_revision != state.revision`.
- Text input and quick chips (Sides / Top / Fringe / Effort) post contributions. Each contribution triggers a `propose` job.
- OptionCard shows:
  - the reference image, labeled "Reference, not your result";
  - stays / changes / effort / why;
  - "Barber should check: …".

**Gate:** typing "huwag galawin ang fringe" adds the constraint, bumps the revision, and returns two options. The constraint is respected and no style IDs are invented.

**Cut:** if two options are rarely valid, show one option plus an honest "only one catalog style fits".

### B4 · 02:30–03:30 · Agreement, save, return (S9, S10)

- AgreementCard (Keep / Change / Avoid, plus the selected option and confirmed observations).
  - Customer confirm on the phone; barber notes and confirm on the laptop.
  - Blocked while `conflicts[]` is non-empty.
  - Inserts `agreements.version`.
- Complete:
  - actual notes;
  - a "Save as preferred" toggle;
  - a "Keep photos" checkbox, default off.
  - One SQLite transaction inserts the visit and updates `preferred_visit_id`.
  - Delete unkept media, revoke the phone token, and stop the media tracks.
- Returning customer:
  - search with `LIKE ?` on name/nickname;
  - the identity row shows the last visit date;
  - "Same as last time, o may babaguhin?" creates a consultation pre-filled with keep/change/avoid. Old observations get `status=unconfirmed`.

**Gate:** save the fictional customer "Miguel Santos", restart the server, search for him, and see the preferred cut, pre-filled.

**Cut:** if a field won't work, keep the visit history list as plain text.

### B5 · 03:30–04:30 · Voice (S4 voice path)

- VoiceDock:
  - a Customer | Barber toggle;
  - a Talk/Stop button using `MediaRecorder` (webm/opus), capped at 30 s with a visible countdown;
  - a real level meter from `AnalyserNode`, shown only while recording;
  - Discard.
- Upload as `media(kind=audio)` → `transcribe` job → TranscriptReview (editable textarea, Send) → contribution. Delete the audio file after transcription.

**Gate:** a spoken Taglish correction is transcribed locally, edited, sent, and the options update.

**Cut:** if transcription quality is poor, keep voice but lead the demo with the typed correction, and say so.

### B6 · 04:30–05:15 · Failure states and offline rehearsal #1

- Implement each PRD §7 failure state for real. Stop Ollama and confirm the "AI not ready" state appears and the work is kept.
- `/ponytail-review` on the backend; `vibesec-skill` pass over `auth.py` and `media.py`.
- **Rehearsal #1:** laptop on the no-data hotspot, browser cache cleared, run S1→S10. Log the times.

**Gate:** the full journey completes offline once.

**Cut:** if anything breaks, fix that one thing; nothing new starts.

### Sleep · 05:15–06:45

Set two alarms. Before sleeping, make sure everything is committed and pushed. Better rested is better on stage.

### B7 · 06:45–07:45 · Polish (design skills)

- `/impeccable critique` and `/impeccable audit` on Consult and Phone. Fix only the high-severity findings.
- Specific items:
  - sentence-case labels;
  - a self-hosted font from `@fontsource`;
  - contrast of `ink-2` on `subtle`;
  - 48 px targets;
  - visible focus;
  - `100dvh`, safe-area insets, 16 px inputs (`mobile-native`).
- `review-animations`:
  - 120 ms press;
  - ease-out enters;
  - sheet 200 ms;
  - `prefers-reduced-motion`;
  - no `transition: all`.
- `break-ui` on the agreement card and customer search: long names, empty history, two customers both named "Miguel".
- Mascot: one original flat SVG barber bust (4–6 fills, a comb detail), 72 px laptop / 44 px phone, `aria-hidden`.

**Gate:** no blocking a11y or contrast issue, and the phone layout works at 375 px.

### B8 · 07:45–08:15 · Rehearsal #2 and measurements

- Cold start: reboot Ollama, start the app, wait for models ready, then run the full journey twice. Fill in MEASUREMENTS.md (n ≥ 3 per job type, including B0 and B6 samples).
- Rehearse the PRD §17 script with a timer.

### B9 · 08:15–09:00 · Docs and video

- **README.md** covers:
  - what GupAi is;
  - **Why local** (PRD §2);
  - what runs locally / what needs internet;
  - setup steps (Ollama pulls, venv, npm build, mkcert, run command);
  - the demo walkthrough;
  - measured results with sample counts;
  - limitations;
  - license.
- **DISCLOSURES.md** covers:
  - models (tags and `ollama show --modelfile` digests);
  - faster-whisper size;
  - frameworks;
  - "no cloud APIs at runtime";
  - pre-existing planning docs (dated Oct 9, written before the build);
  - catalog and font licenses;
  - AI dev tools (Claude Code, the skills used, any others actually used).
- **Demo video (~60 s):** screen-record laptop and phone, with no internet visible. Show capture → options → correction → agreement → return. Label any staged parts.

### 09:00 · Internal code freeze

- Make the GitHub repo **public**.
- Verify the README from a fresh clone, reading it at least, if there's no time to reinstall.

### 09:00–09:45 · Submit

- Post the video on X or LinkedIn, tagging Devin / Cognition and including `#AppBuildersPH`. Copy the post URL.
- Fill in cerebralvalley.ai/e/appbuildersph-hackathon-2026 using PRD §16, item by item. **One submission only, so read it twice.**

### 09:45–10:00 · Buffer. No commits after 10:00.

---

## 3. Cut order if the night slips

Cut in this order. Never cut correction handling, honest offline behavior, or the trust-boundary checks.

1. Every stretch item (PRD §6)
2. Mascot polish (a static SVG is fine)
3. Voice output (it was never in the MVP)
4. Side-view analysis (front only)
5. QR image (show the URL instead)
6. Voice input on the phone (record on the laptop)
7. Second option (honest "one fits")

---

## 4. Measurement log template (`docs/MEASUREMENTS.md`)

```markdown
Hardware: <laptop model>, <CPU>, <RAM>, <GPU>, Windows 11, Ollama <ver>
Models: qwen3.5:4b@<digest>, faster-whisper small int8

| # | When | Job | Input | Wall time (s) | Peak RAM (GB) | Result OK? | Notes |
|---|------|-----|-------|---------------|---------------|------------|-------|
| 1 | 21:10 | observe | front 768px | | | | cold |
| 2 | | transcribe | 10 s Taglish | | | | |
| 3 | | propose | 2 options | | | | |

Median per job (n): observe __ s (n=_), propose __ s (n=_), transcribe __ s (n=_)
```

Only numbers from this table go in the README or the pitch.

---

## 5. Demo Day checklist (Sat Oct 10)

**The night before / morning:**
- [ ] Laptop charger, phone charger, USB-C/HDMI adapter
- [ ] Phone hotspot name and password noted; mobile data **off**; root CA still trusted
- [ ] The cert covers the hotspot IP. If the IP changed, rerun `mkcert` (works offline) and restart

**At 12:15 tech check:**
- [ ] Laptop sleep disabled
- [ ] Display mirroring works
- [ ] Browser zoom set for the projector

**Before pitching:**
- [ ] Laptop Wi-Fi joined to the hotspot (not venue Wi-Fi)
- [ ] `ollama run qwen3.5:4b ""` to preload
- [ ] App started; Home shows "Models ready"
- [ ] Fictional customer "Miguel Santos" saved for the return-visit segment; a fresh fictional customer for the live consult
- [ ] Fallback video on the desktop
- [ ] Prepared photos are labeled "staged" if used

**Q&A prep (3 min):**
- Why not the cloud?
- How accurate is it?
- What if the barber disagrees?
- What data is stored, and how is it deleted?
- What's measured, and what's hypothesis?
- What would a real barber pilot look like?
