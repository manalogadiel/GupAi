# GupAi v2 demo and recovery

## Launch
From the project root in PowerShell, run `./scripts/start-demo.ps1`. Open https://localhost:8443 on the laptop. The current phone origin is https://192.168.68.110:8443; use the QR for the selected chair, not the laptop localhost URL.

`./.venv/Scripts/python.exe scripts/preflight.py` checks the exact Qwen model, cached Whisper weights, MediaPipe asset, frontend build, and certificate/IP coverage without downloading anything. Readiness does not prove a phone trusts the certificate.

## Physical acceptance before judging
1. Put phone and laptop on the same LAN. Install and trust the mkcert root CA on the phone; verify HTTPS opens without a certificate warning. If the router uses client isolation, use a local hotspot/router allowing device-to-device access.
2. Pair one chair. Grant camera and microphone permission. Capture a real front and side photo, then record a short Taglish sentence. Verify the transcript is editable and the barber corrects any uncertain observation.
3. Complete one visit and verify the phone's five-scissor rating reaches the laptop and the saved customer record. Open a return visit and confirm the preferred plan is present as history.
4. Disconnect the laptop's internet uplink while retaining the LAN. Check the models stay ready and one typed consultation still completes.

These physical checks remain human acceptance items. Browser emulation used synthetic photos and bypassed certificate trust; it does not validate real camera quality or real Taglish microphone accuracy.

## Suggested presentation
Open with “Para bago gumupit, nagkaintindihan muna.” Show the phone and laptop, then explain that photos, voice, and inference stay on this laptop. Say “Para sa work. Gusto ko clean professional look, 5 minutes lang mag-ayos. Pumupuff ang gilid pero huwag galawin ang fringe.” Show explicit Keep / Change / Avoid. Explain the barber confirms shape and observations. Reveal only the face shape, discuss and select the suggested sides and top, and point out pros/cons and the illustrative preview. Both sides accept the agreement before cutting. Demonstrate the advisory checkpoint, phone rating, and saved preferred haircut.

For a short pitch, prepare an honest in-progress consultation ahead of time and show its completed suggestions. Explain that suggestions were generated locally beforehand; do not imply pre-generated output is live. A full live walkthrough takes several minutes on this CPU. Run only one inference demonstration at a time.

## Evidence and rerun
`./.venv/Scripts/python.exe -m pytest backend/tests -q` runs the backend suite. `npm --prefix frontend run build` builds the product. `node scripts/v2-browser-smoke.cjs` runs a real Ollama browser rehearsal using the Codex-bundled Playwright and installed Edge; it creates clearly named QA customers and stores reports/screenshots in ignored `.local-backup/conversation-rehearsal`. Override `GUPAI_PLAYWRIGHT_PATH` if Playwright lives elsewhere. This is a development tool, not an app dependency.

The rehearsal covers both screen sizes, real LAN cookie scope, two-chair isolation, single-use pairing, save/return, shared rating, and an insufficient-photo checkpoint. It blocks external browser requests. QA records are identifiable by the “QA local v2” name and are separate from real customer data.

## Isolated v1 recovery
The `demo-safe-v1` source is preserved in `.local-backup/v1-recovery`, with its own fresh data directory. Its frontend is built. It shares installed dependencies, certificate files, and model assets through local junctions, but never shares the v2 database. The original inherited source/data backup remains in `.local-backup/20261009-235509`.

To use v1, stop only the v2 server's own terminal/process first. In a new terminal:

```powershell
Set-Location .local-backup/v1-recovery
./.venv/Scripts/python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8443 --ssl-keyfile certs/gupai-key.pem --ssl-certfile certs/gupai.pem
```

Set `GUPAI_PAIR_BASE_URL` to the laptop LAN HTTPS origin in that terminal before pairing. V1 starts with a separate empty database because the preserved database was already v2. Do not copy the v2 database into v1, reset the main checkout, or recursively remove directories containing junctions. Return to the main project to resume v2.

Recovery caveat: the original v1 speech decoder is incompatible with this laptop's PyAV 19 metadata keyword removal. Use **typed input** in the v1 fallback; v2 includes the verified audio repair. V1's 152-test suite covers its original contracts, not this live voice compatibility issue.

## Conversation-first revision
Goal is now Usapan with Kuya Pal. Reveal estimates/confirms face shape; it does not recommend a complete haircut. Sides and Top retain up to three AI-selected suggestion cards and conversation input. A new agreement requires the selected sides/top, not an additional named style. Occasion/look/routine are visible in the review and retained in the saved plan.

Hair observations are optional on the barber's Reveal screen. Front-photo face estimation remains automatic. Avoid starting optional vision while demonstrating conversation: jobs share one local FIFO worker. Whisper transcription produces editable text and never automatically sends it. Silence shows a retry/type message; raw audio is removed after processing or cancelling a queued recording.

`node scripts/conversation-voice-smoke.cjs` exercises actual MediaRecorder with a synthetic local audio fixture. It does not test a human microphone or human Taglish accuracy. See the measurement ledger for actual timings.
