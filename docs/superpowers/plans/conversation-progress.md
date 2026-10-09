# Conversation revision progress
User approved native implementation and explicitly kept suggestion cards in Sides/Top.
Current source and online SQLite backup preserved in .local-backup/conversation-before.
Ruling: use existing measured chat samples as the pre-change baseline while the user is live-testing; do not add six competing benchmark calls to their queue. New controlled samples will follow after implementation. This limits baseline comparability and must be disclosed.
Ruling: no agents or commits; continue in the user-named app checkout.

Ruling: hair photo observations are requested explicitly on Reveal rather than automatically per capture; face estimation still runs on the front photo. This removes two long mandatory vision jobs ahead of conversation and preserves manual physical confirmation. Camera captures still store both views; checkpoint vision stays available.

Ruling: real Qwen omitted all brief updates despite acknowledging work/5 minutes. Recover only explicitly stated common occasion, numeric styling time, and desired-look phrases with source quotes. This does not rank or choose haircuts. The model still extracts richer preferences and selects eligible options. Compact the prompt and remove duplicate incoming history to lower prompt latency.

Ruling: bind evidence indices to each candidate with a schema union and validate known customer factors. A live Qwen response selected nonexistent indices under the original broad range; invalid output now cannot silently choose unrelated evidence. Keep all eligible candidates, but retrieve one relevant guide and avoid duplicating face notes with problem notes to reduce prompt work.

Ruling: already recovered explicit facts are excluded from the model's brief-update field enum, avoiding duplicate structured output. Dress policies, upkeep and inspiration require verbatim customer evidence. Do not infer a dress policy from an occasion.

Tasks 1–5 implementation complete and regression-tested. Task 6 automated rehearsal and local-model evaluation complete; physical acceptance remains human-only. No commits, dependency changes or cloud inference. Verification skill used to require fresh tests/build/browser evidence before completion claims.

Final automated checks complete. Three browser recordings received distinct IDs; identical transcript text arrived twice correctly. Final rehearsal PASS. Measurement ledger and demo instructions updated. Server left running at https://localhost:8443.
