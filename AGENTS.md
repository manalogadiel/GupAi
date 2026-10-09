# GupAi: instructions for every coding agent (Codex and Claude Code)

GupAi is an offline barbershop consultation assistant for the AppBuildersPH Hackathon 2026 (Local AI). **Code freeze is Oct 10, 10:00 AM.** Build the MVP only.

## Read first
1. `docs/PRD.md`: scope (stories S1–S10 plus S6b), data model §10, local AI §12, security §13, face-shape Appendix A
2. `docs/API.md`: **the contract between backend and frontend. Do not change it without the lead's approval.**
3. `docs/TASKS.md`: the task board. Do only the task you were assigned.

## Roles
- **Claude Code = lead.** It owns `frontend/`, `docs/`, `README.md`, `DISCLOSURES.md`, and `ASSETS.md`. It reviews every change, and it is **the only agent that runs `git commit`**.
- **Codex = worker.** It owns `backend/`, `knowledge/`, and `scripts/` (except `scripts/codex-task.sh`).
- **Human (Gadiel)** handles the hardware: phone, hotspot, certificates on the phone, recording, posting, and submitting.

## Hard rules
- Edit only files in your owned folders, plus the single task file you were assigned. If you need a change elsewhere, write it under "Requests to lead" in your report.
- **Never run `git commit`, `git push`, `git reset`, `git checkout`, or `git stash`.** Leave changes in the working tree.
- Do not install new dependencies without listing them in your report. The venv and `node_modules` are set up by the lead.
- No network calls at runtime. Ollama is reached only at `http://127.0.0.1:11434`.
- No fake AI or fake persistence. If something can't work yet, return a real error.
- Security (VibeSec):
  - parameterized SQL only;
  - scope check on every resource (404 on miss);
  - uploads checked by magic bytes, with size caps, a Pillow re-encode, and random names;
  - model output is plain text;
  - no state change on GET except `/pair`.
- Keep it small (ponytail): no speculative abstractions. Mark known limits as `# shortcut: <limit>, <when to upgrade>`.
- Test-first (superpowers TDD) for state transitions, revision conflicts, constraint filtering, face-shape rules, schema validation, and auth scope.

## Stack and commands
- Backend: Python 3.12 venv at `.venv/`, FastAPI, SQLite (stdlib `sqlite3`), Pillow, faster-whisper, mediapipe, httpx.
  - Run: `.venv/Scripts/python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8443 --ssl-keyfile certs/gupai-key.pem --ssl-certfile certs/gupai.pem`
  - Tests: `.venv/Scripts/python -m pytest backend/tests -q`
- Frontend: Vite + React + TypeScript + Tailwind in `frontend/`. Build: `npm --prefix frontend run build`. FastAPI serves `frontend/dist`.
- Models: Ollama `qwen3.5:4b` (fallback `qwen3.5:2b`), faster-whisper `small` int8, MediaPipe `knowledge/models/face_landmarker.task`.

## When you finish a task
Write your report to the `-o` file you were given, or to `docs/agents/<TASK-ID>.md`. It must contain:
1. Files changed.
2. How you verified it: the exact command and its output, e.g. pytest results.
3. What you skipped, plus any `shortcut:` notes.
4. Requests to lead.

Then set the task's status in `docs/TASKS.md` to `review`.

## Skills available to both agents
superpowers (writing-plans, test-driven-development, systematic-debugging, verification-before-completion), ponytail, vibesec, frontend-design, impeccable, ui-ux-pro-max, emil skills (emil-design-eng, mobile-native, review-animations, break-ui), caveman. Use them where they fit. Use caveman only for chat brevity; never for reports, docs, or code comments.
