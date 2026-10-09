# Disclosures (AppBuildersPH Hackathon 2026)

## Models (all run locally on the shop laptop)
| Model | Use | Runtime | License |
|---|---|---|---|
| `qwen3.5:4b` (Ollama, digest `d8b0f5e9760c`) | Hair observations from photos; consultation replies and two haircut options as schema-constrained JSON | Ollama on `127.0.0.1:11434` | Apache-2.0 (Qwen) |
| `qwen3.5:2b` (digest `0689d44085e0`) | Pulled as a fallback; **not used** (not faster, looser output; see docs/MEASUREMENTS.md) | Ollama | Apache-2.0 |
| faster-whisper `small` (int8, CPU) | Speech-to-text for customer/barber voice input | CTranslate2 | MIT |
| MediaPipe Face Landmarker (`face_landmarker.task`, float16 v1) | Face landmarks → face-shape ratios and outline overlay. **Not** face recognition; no identity data is stored | Python `mediapipe` | Apache-2.0 |

## Frameworks and libraries
FastAPI, Uvicorn, Pydantic, Python `sqlite3`, Pillow, httpx, qrcode, pytest, React, TypeScript, Vite, Tailwind CSS, `@fontsource-variable/figtree` (OFL-1.1, bundled locally), mkcert (local HTTPS for the phone).

## APIs and cloud services
**None at runtime.** No cloud inference, no remote fonts or scripts, no analytics, and no authentication service. Internet was used only to install packages and download the models above.

## What runs locally / what needs internet
- **Runs locally:** all AI inference (vision, language, speech, face landmarks), the API server, the SQLite database, photo storage, the haircut catalog, and every UI asset. The phone talks only to the laptop over the shop's local network.
- **Needs internet:** only the one-time setup (pip/npm installs, `ollama pull`, the MediaPipe model download).

## Existing code and assets
- **Planning documents** in `docs/` were written on Oct 9, 2026, before coding began: PRD, API contract, validation, workflow, and full spec. No application code existed before the hackathon.
- Haircut catalog illustrations and the barber mascot are **original SVGs drawn during the hackathon** (see ASSETS.md).
- Haircut and face-shape guidance is summarized from published sources listed in `knowledge/sources.json` and `docs/PRD.md` Appendix A.

## AI development tools
- **Claude Code** (Anthropic, Claude Opus 5.5): lead agent. Planning, frontend, integration, code review, and docs.
- **OpenAI Codex CLI** (GPT-6.1-Sol): worker agent. Backend modules and tests, dispatched from the task board.
- Agent skills used: superpowers, ponytail, VibeSec, frontend-design, impeccable, ui-ux-pro-max, emilkowalski/skills, caveman.

## Known limitations (honest)
- Face-shape estimation uses uncalibrated heuristic thresholds. The barber always confirms it.
- Haircut guidance has **not** been validated by a practicing barber. Usefulness is a hypothesis.
- There is no barber password in this prototype; the barber surface is restricted to the laptop itself (loopback). Data is **not encrypted at rest**.
- Taglish transcription quality is limited. The transcript is always editable, and typing always works.
