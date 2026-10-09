# GupAi

**Para bago gumupit, nagkaintindihan muna.** *(So that before the cut, we understand each other first.)*

GupAi is an offline barbershop consultation assistant. A barber and customer use local vision, speech, and language models to agree on a haircut **before** the first cut. The shop keeps that agreement so the next visit can start from "same as last time".

Built for the **AppBuildersPH Hackathon 2026: Local AI**.

## The problem
A customer shows a reference photo but can't say which parts they actually want. The barber reads the photo differently. A haircut can't be undone, so the customer quietly lives with a result they didn't expect.

## What GupAi does
1. Pair a phone to a named chair with a single-use QR over local HTTPS. Multiple chairs share one local inference queue.
2. Take three guided photos (Harap, Kaliwa, Kanan) with a pose outline and a 3-2-1 countdown; each capture moves on to the next view, and any view can be retaken.
3. Talk with **Kuya Gup** by typing, tapping answer chips, voice (tap-to-talk or hands-free), or a reference photo. He leads one question at a time: problem → occasion → wanted cut → dating (look) → keep/avoid → routine, explains why a problem happens, and reads his replies aloud with an on-device voice. The Scan step opens only after every answer is in.
4. Scan: face shape (six outlines) and hair profile (density, strand, texture, hairline) are AI estimates the barber confirms.
5. Choose sides and top separately from 10 sides and 13 tops, each drawn (side profile for fades). Suggestions are ranked by problem, face shape, hair type and the wanted cut, with the reasons shown.
6. Both devices accept the same version of the agreement before cutting starts; the plan is then locked. Optional photo checkpoints are advisory only.
7. The customer rates from the phone. The barber saves the consented visit and preferred haircut for "same as last time", and can delete a customer with every visit and photo.

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

## Verified status
The backend regression suite (`pytest backend/tests`) has **294 passing tests**, and an end-to-end run of the full consultation against the real local models passed 51/51 checks. Production browser rehearsal evidence and real local model timings are recorded in [docs/MEASUREMENTS.md](docs/MEASUREMENTS.md) and the ignored `.local-backup/conversation-rehearsal/report.json`.

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

**Offline speech setup:** faster-whisper `large-v3-turbo` (default, ~1.6 GB) or `small` (lighter fallback) must already be cached. During one-time internet setup, run `.venv/Scripts/python -c "from faster_whisper import WhisperModel; WhisperModel('large-v3-turbo', device='cpu', compute_type='int8')"`. Choose the model with `GUPAI_WHISPER=small` or `GUPAI_WHISPER=large-v3-turbo`; if turbo is not cached, `small` is used. Runtime speech loading uses `local_files_only=True`, so a missing cache reports unavailable instead of downloading. On an M-series Mac CPU a 5-second clip took about 1.2 s on `small` and 3.8 s on turbo.

**Run on this prepared laptop (PowerShell):**

```powershell
.\.venv\Scripts\python.exe scripts/preflight.py
.\scripts\start-demo.ps1
```

The launcher prints readiness, sets a LAN pairing origin, and starts HTTPS. If a server already runs, it reports that fact; restart its existing terminal after code changes. Both devices must share the same reachable local network. To select another adapter, pass `-PhoneIP <laptop-ip>` and regenerate the certificate for that IP. Never share the private HTTPS key.

**Run on macOS:**

```bash
brew install python@3.12 mkcert && mkcert -install
mkcert -cert-file certs/gupai.pem -key-file certs/gupai-key.pem localhost 127.0.0.1 <laptop-ip>
scripts/start-demo.sh
```

Open `https://localhost:8443` on the laptop and allow the macOS firewall prompt for Python. The QR code then points the phone to `https://<laptop-ip>:8443`. Before scanning, the phone must trust the mkcert root CA, `rootCA.pem` in `mkcert -CAROOT`.
- **iPhone:** AirDrop the file and install the profile. Then go to Settings › General › About › Certificate Trust Settings and turn it on.
- **Android:** Settings › Security › Install a certificate › CA certificate.

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
