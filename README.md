# GupAi

**Para bago gumupit, nagkaintindihan muna.** *(So that before the cut, we understand each other first.)*

GupAi is an offline barbershop consultation assistant. A barber and customer use local vision, speech, and language models to agree on a haircut **before** the first cut. The shop keeps that agreement so the next visit can start from "same as last time".

Built for the **AppBuildersPH Hackathon 2026: Local AI**.

## The problem
A customer shows a reference photo but can't say which parts they actually want. The barber reads the photo differently. A haircut can't be undone, so the customer quietly lives with a result they didn't expect.

## What GupAi v2 does
1. Pair a phone to a named chair with a single-use QR. Multiple chairs share one local inference queue.
2. Capture front and side photos. The barber confirms, edits, or rejects observations and face shape; manual recovery works when a face is not detected.
3. Talk to Kuya Pal in Taglish or type. Discuss school, work, birthdays, the impression you want and your daily routine. Replies stream from one local call; the shared brief retains customer source quotes and Keep / Change / Avoid remain explicit constraints.
4. Reveal the face shape only, then discuss and choose sides and top separately. Local Qwen compares all eligible choices using occasion, desired impression, routine, problems and protected preferences; cards retain pros, cons and an illustrative SVG preview. A custom description is also supported.
5. Both devices accept the same version of the agreement before cutting starts. Plan edits are then locked.
6. Optional photo checkpoints provide advisory feedback. They never authorize cutting more.
7. The customer sends a shared rating from the phone. The barber saves the consented visit and optional preferred haircut for the next appointment.

## Why local AI
GupAi looks at close-up photos of a customer's face and hair and listens to their voice while they sit in the chair. Sending that to a cloud API would mean uploading biometric-adjacent personal data from a small shop that has no privacy officer and often no reliable internet. Running the vision model, language model, face landmarks, and speech recognition **on the shop laptop** keeps photos and audio inside the shop, in the spirit of the Data Privacy Act (RA 10173). It keeps working when the internet is down or the load runs out, and it costs nothing per consultation.

**Runs locally:**
- Qwen 3.5 4B via Ollama
- faster-whisper
- MediaPipe Face Landmarker
- FastAPI
- SQLite
- the catalog and every UI asset

**Needs internet:** only the one-time setup. See [DISCLOSURES.md](DISCLOSURES.md).

## Verified v2 status
The backend regression suite has **238 passing tests**. Production browser rehearsal evidence and real local model timings are recorded in [docs/MEASUREMENTS.md](docs/MEASUREMENTS.md) and the ignored `.local-backup/conversation-rehearsal/report.json`.

CPU inference can take tens of seconds. The UI displays queued/running status, elapsed time, and cancellation. Do not present a five-second latency promise. Real phone certificate trust, camera, and microphone still require a physical-device check.

## Setup (Windows 11; any OS with Python 3.12 + Node 20+ should work)
Prerequisites: [Ollama](https://ollama.com), Python 3.12, Node.js 20+, [mkcert](https://github.com/FiloSottile/mkcert).

```bash
ollama pull qwen3.5:4b
```

```bash
py -3.12 -m venv .venv && .venv/Scripts/pip install fastapi "uvicorn[standard]" pydantic pillow python-multipart httpx qrcode pytest faster-whisper mediapipe
```

```bash
curl -L -o knowledge/models/face_landmarker.task https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
```

```bash
npm --prefix frontend install && npm --prefix frontend run build
```

**HTTPS for the phone.**
1. Run `mkcert -install` once.
2. Generate a certificate that covers the laptop's IP on the shop network:

```bash
mkcert -cert-file certs/gupai.pem -key-file certs/gupai-key.pem localhost 127.0.0.1 <laptop-ip>
```

3. Install the root CA from `mkcert -CAROOT` on the phone and trust it.

**Offline speech setup:** faster-whisper `small` must already be cached. During one-time internet setup, run `.venv/Scripts/python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"`. Runtime speech loading explicitly uses `local_files_only=True`; a missing cache reports unavailable instead of downloading.

**Run on this prepared laptop (PowerShell):**

```powershell
.\.venv\Scripts\python.exe scripts/preflight.py
.\scripts\start-demo.ps1
```

The launcher prints readiness, sets a LAN pairing origin, and starts HTTPS. If a server already runs, it reports that fact; restart its existing terminal after code changes. Both devices must share the same reachable local network. To select another adapter, pass `-PhoneIP <laptop-ip>` and regenerate the certificate for that IP. Never share the private HTTPS key.

**Manual run:**

```bash
.venv/Scripts/python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8443 --ssl-keyfile certs/gupai-key.pem --ssl-certfile certs/gupai.pem
```

Open `https://localhost:8443` on the laptop (barber), then pair the phone with the QR code.

**Tests:**

```bash
.venv/Scripts/python -m pytest backend/tests -q
```

## Privacy and safety
- No face recognition. Face landmarks are used only for shape ratios and the outline; only the confirmed shape and 3 ratios are saved.
- Photos are saved only with a separate consent checkbox. Temporary sessions delete everything at the end. Raw audio is deleted right after transcription.
- The barber-only customer list is restricted to the laptop itself. A paired phone sees only its own consultation, and its access is revoked when the visit ends.
- AI suggestions are proposals. The barber confirms physical observations, and the customer has the final say on preferences.

## Limitations
See [DISCLOSURES.md](DISCLOSURES.md#known-limitations-honest). In short: the guidance has not been validated by a practicing barber; the face-shape thresholds are heuristic; there's no barber password; data is not encrypted at rest.

## How it was built
Initially built with Claude Code and Codex CLI; Codex desktop subsequently completed the v2 integration and verification after the Claude session limit. Original coordination is recorded in [AGENTS.md](AGENTS.md) and [docs/TASKS.md](docs/TASKS.md). Full planning docs are in [docs/](docs/).

See [docs/DEMO.md](docs/DEMO.md) for the rehearsal, physical phone checklist, and isolated v1 recovery procedure.
