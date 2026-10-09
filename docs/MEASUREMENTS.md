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
