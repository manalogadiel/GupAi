# GupAi

**Para bago gumupit, nagkaintindihan muna.** *(So that before the cut, we understand each other first.)*

GupAi is an offline barbershop consultation assistant. A barber and customer use local vision, speech, and language models to agree on a haircut **before** the first cut. The shop keeps that agreement so the next visit can start from "same as last time".

Built for the **AppBuildersPH Hackathon 2026: Local AI**.

## The problem
A customer shows a reference photo but can't say which parts they actually want. The barber reads the photo differently. A haircut can't be undone, so the customer quietly lives with a result they didn't expect.

## What GupAi does
1. **Pair the customer's phone** by QR. The phone becomes the customer's mirror; the laptop is the barber's workspace.
2. **Say what you want:** voice (transcribed locally) or typing, plus quick Keep / Change / Avoid choices.
3. **Front and side photos.** The local AI proposes hair observations. **Face-shape estimation** draws the face outline and suggests a shape such as "between round and oval". The barber confirms or corrects every suggestion.
4. **Two haircut options** from a 6-style catalog, each with what stays, what changes, styling effort, and face-shape guidance with cited sources.
5. **Corrections update the options.** For example, "Huwag galawin ang fringe" becomes a constraint, and the options regenerate.
6. **The agreement** (Keep / Change / Avoid plus barber notes) is confirmed by both, versioned, and saved under the customer's name with consent.
7. **Return visit:** "Same as last time, o may babaguhin?" Old observations are shown as history and must be re-checked.

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

## Measured results
See [docs/MEASUREMENTS.md](docs/MEASUREMENTS.md). These are observed numbers only, with sample counts. Current:
- `qwen3.5:4b` hair-observation call: **5.5–7.0 s warm** (n=3, synthetic test image)
- Pending: real photo, option generation, transcription, face shape

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

**Run:**

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
Solo build: Claude Code as lead plus the Codex CLI as a worker agent, coordinated through [AGENTS.md](AGENTS.md) and [docs/TASKS.md](docs/TASKS.md). Full planning docs are in [docs/](docs/).
