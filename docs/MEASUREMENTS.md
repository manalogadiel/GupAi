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
