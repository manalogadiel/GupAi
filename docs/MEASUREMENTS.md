# GupAi measurements (observed only, never estimated)

**Hardware:** shop laptop (fill in: model, CPU, RAM, iGPU), Windows 11, Ollama 0.40.2
**Models:** qwen3.5:4b (chosen), qwen3.5:2b (fallback, not used), faster-whisper small int8, MediaPipe face_landmarker float16 v1

**Test input:** a **synthetic** 768×960 JPEG (drawn shapes, not a real person). This measures latency, not observation quality. Real-photo rows come later.
**Settings:** `/api/chat`, `think:false`, `format` = JSON schema, `num_ctx` 4096, `num_predict` 300, temperature 0.2, `keep_alive` 30m.

| # | When (Oct 9) | Model | Job | Schema | Wall time (s) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|
| 1 | 21:05 | qwen3.5:4b | observe | free-text `region` | 53.7 | 300 (cap) | cold load + runaway `region` string |
| 2 | 21:05 | qwen3.5:4b | observe | free-text `region` | 8.3 | 82 | warm |
| 3 | 21:06 | qwen3.5:4b | observe | free-text `region` | 28.6 | 300 (cap) | runaway `region` string again |
| 4 | 21:08 | qwen3.5:4b | observe | enum `region`, maxItems 4 | 6.1 | 59 | warm |
| 5 | 21:08 | qwen3.5:4b | observe | enum `region`, maxItems 4 | 7.0 | 72 | warm |
| 6 | 21:08 | qwen3.5:4b | observe | enum `region`, maxItems 4 | 5.5 | 52 | warm |
| 7 | 21:09 | qwen3.5:2b | observe | enum `region`, maxItems 4 | 32.9 | 140 | cold load |
| 8 | 21:09 | qwen3.5:2b | observe | enum `region`, maxItems 4 | 6.3 | 92 | warm |
| 9 | 21:09 | qwen3.5:2b | observe | enum `region`, maxItems 4 | 6.4 | 92 | warm |

**Findings:**
- Every free-text field in a schema needs an `enum` or a `maxLength`. Without one, the model can loop until it hits `num_predict`, which cost 22–47 s.
- With constrained schemas, qwen3.5:4b runs the warm observe job in 5.5–7.0 s (n=3). The 2B model is not faster and its output is looser, so **4B is chosen**.

Pending rows: real-photo observe, propose, transcribe (10 s Taglish), faceshape, peak RAM.

## Pipeline through the API (C6, Oct 9 21:50–22:12)

**Hardware:** Intel Core Ultra 5 225H, 15.4 GB RAM, Intel Arc iGPU, Windows 11. Ollama reports **100% CPU**. A Vulkan iGPU test on a temporary instance was *slower*: 9.3 vs 10.9 tok/s, with only about 1.3 GB RAM free, so we use the CPU.
**Input:** the same synthetic image; no real face, so the face-shape job correctly returns `face_found:false`. The text is "Gusto ko maikli sa gilid pero huwag galawin ang fringe".

| # | Job | Wall time (s) | Conditions | Result OK? |
|---|---|---|---|---|
| 10 | faceshape | 1.6 | first server | yes (no face) |
| 11 | observe | 33.9 | whisper model loading at the same time (CPU contention) | yes |
| 12 | propose | 65.2 | contention; keep came back **empty** (model missed the negation) | **no** → fixed with a rule safety net and examples |
| 13 | faceshape | 60.7 | cold MediaPipe load in a new process | yes → fixed with startup warm-up and a reused detector |
| 14 | propose | 67.3 | before output trimming | yes (keep fringe; only fringe-preserving styles) |
| 15 | propose (extract + choose) | 35.8 / 32.6 | direct calls; extract 11.6/11.5, choose 24.2/21.1 | yes |
| 16 | choose call alone | 15.8 | after shortening output fields; 144 output tok @10.9 tok/s | yes |
| 17 | warm-up at startup | ollama 2.3, faceshape 1.0 | server start | — |
| 18 | faceshape | 0.5 | warm | yes (no face) |
| 19 | observe | 17.8 | warm | yes |
| 20 | propose | 27.8 | warm, end-to-end through the API | yes: keep `fringe`, change `mas maikli sa gilid`, options side_part + curtains |

**Takeaway:** generation speed (~11 tok/s on CPU) dominates. The demo should expect about 18 s for observations and about 28 s for options. The UI shows real elapsed seconds and a Cancel button.
Pending: real-face photo, transcription (10 s Taglish clip), peak RAM.

## Full UI click-through (laptop, Oct 9 22:20–22:45)
Run in the browser through the real screens and backend: customer → typed Taglish concern → photo via the upload fallback → barber confirms and rejects observations → face shape chip → two options → select → customer and barber confirm (agreement v1) → complete and save as preferred → return visit "Same as last time".
**Result:** complete journey works. Bugs found and fixed during the run:
- an earlier "huwag galawin" was lost when a later message followed;
- photo jobs queued behind option generation came back stale (now rerun once);
- stage tabs jumped multiple steps (server allows one step at a time);
- a stale AI reply stayed visible after options were cleared;
- replies were cut off mid-word;
- the "Keep: fringe" quick button didn't show as selected;
- the customer name was missing on the detail panel.

Timings in this run: propose ≈ 28–30 s; observe ≈ 18–24 s (queued behind propose).

## V2 takeover browser rehearsal (Oct 10)
Real production HTTPS frontend + FastAPI/SQLite + local Qwen 3.5 4B. Synthetic front/side JPEG; face detection correctly returned no face, followed by manual confirmation. This measures engine integration and latency, not real-photo quality.
Result: **PASS**. 16 scene/viewport captures, no document overflow or clipped controls. Shared phone rating persisted in the visit; preferred plan prefilled the return visit. Two actual LAN-scoped phone contexts verified chair isolation and single-use pairing. Browser errors: 0; attempted external browser requests: 0.
One run on the existing shop laptop; some setup/static checks occurred during it, so this is not an isolated CPU benchmark. Times exclude queue wait where the job timer does; browser first-text timing includes the polling/setup interval.

| Job | Completed-job seconds |
|---|---:|
| faceshape | 0 |
| observe | 24.7 |
| observe | 22.6 |
| chat | 25.4 |
| recommend | 7.2 |
| suggest | 8.9 |
| suggest | 8.4 |
| checkpoint | 4.1 |

Browser-observed first chat text: 1.1 seconds. This is not Ollama's raw time-to-first-token and is not a five-second guarantee.

Final explanation behavior: local Qwen selects relevant catalog evidence indices. Rendered reasons are complete catalog sentences. Chat and checkpoint remain generated and require barber judgment.

Verification: **215 backend tests passed**, production frontend build passed, lint completed with 10 React effect/fast-refresh warnings. Separate v1 recovery: **152 tests passed** and frontend built. Preflight reports all seven local model/build/certificate checks ready.

Evidence: ignored `.local-backup/v2-rehearsal/report.json` and scene screenshots. Real-phone trust/camera/mic and a real-face Taglish assessment remain human acceptance items.

## Final offline speech integration
Installed faster-whisper 1.2.1 called `av.open(metadata_errors=...)`, which PyAV 19.0.1 rejects. The app now uses public PyAV decoding/resampling to float32 mono 16 kHz before Whisper. A real 22.05 kHz WAV resampling regression passes. A synthetic Windows voice ran through upload → local Whisper job → transcript in **1.7 seconds (n=1)**; raw audio returned 404 after transcription and the temporary session was abandoned. Output was imperfect Taglish, so this confirms engine integration, not human accuracy. Evidence: ignored `.local-backup/speech-smoke-report.json`. No packages were downloaded or replaced.

## Conversation-first final verification (Oct 10)

Intel Core Ultra 5 225H, about 16 GB installed RAM, Qwen 3.5 4B Q4_K_M on CPU (Ollama size_vram=0), context 4096, think:false. No model or package downloads. New reply path uses one streamed JSON call. Explicit common facts are retained with source quotes; all eligible part choices reach Qwen.

Real production laptop 1280×680 / LAN phone context 390×720 rehearsal: PASS, all 16 scenes without document overflow or clipped controls, 0 browser errors and 0 external browser requests. Face-only Reveal ran no recommendation job; Sides and Top cards, dual agreement, checkpoint, shared rating, preferred return visit and single-use/two-chair scope passed. Photos were synthetic; face shape was manually confirmed.

| Profile (same confirmed round face) | First actual reply text (s) | Full chat turn (s) | Top choice |
|---|---:|---:|---|
| school | 5.08 | 19.39 | curtains |
| birthday | 4.82 | 12.30 | quiff |
| work | 5.83 | 26.80 | side_part |

Three warm model-resident samples, median complete chat 19.39s. Earlier v2 single-run baseline was 25.4s; this limited comparison is not a controlled benchmark or a universal speed guarantee. Work still took 26.8s to finish. Browser-observed first real text on work: 6.22s. Timings exclude queue wait; the UI exposes queued-ahead count. Prompt and generation dominate, not loading.

Latest actual job times: faceshape 0s, chat 26.8s, suggest 22.5s, suggest 20s, checkpoint 3.6s. Optional hair observation and redundant full-style recommendation are no longer mandatory calls. Personalized suggestions are slower than the old fixed-top-three evidence lookup; complete candidate comparison is disclosed rather than described as instant.

Three actual browser MediaRecorder → local Whisper → editable review tests passed, including two identical consecutive transcript texts arriving as distinct job IDs. Six-second synthetic clips; transcription durations 1.6s, 1.8s, 1.7s. Each stayed editable and required Send. Synthetic Taglish text was imperfect; human accuracy is not established. Test assertions verify raw audio deletion in SQLite and on disk after empty processing/queued cancellation.

Final checks: 238 backend tests passed; production build and lint pass (10 React warnings, no errors); git diff --check passes; all seven readiness checks pass. Evidence: ignored .local-backup/conversation-rehearsal/report.json, conversation-evaluation.json, browser-voice-report.json and scene screenshots. Preserved pre-revision source/database: .local-backup/conversation-before.

Remaining human acceptance: trusted physical-phone camera/mic, a real human Taglish clip and disconnected-internet LAN rehearsal. Source remains uncommitted; no deployment or publication occurred.
