# Kuya Pal Conversation-First Revision Implementation Plan

> **For agentic workers:** Implement natively with `executing-plans`, one task at a time. The user requested one implementer and a plan before execution. Do not delegate, automatically commit, or publish. This document is the reviewable design and implementation plan; implementation and automated verification are now complete; see the final evidence below.

**Goal:** Make the haircut emerge from a useful local conversation about the customer's problems, intended occasion, desired impression, and practical preferences, with face shape as advisory context.

**Architecture:** FastAPI/SQLite continue to own the shared brief, revisions, selected parts, and immutable agreement. Local Qwen chooses among eligible haircut components using the customer brief and retrieved barber references; deterministic code enforces explicit constraints and validates evidence rather than deciding taste. React exposes the conversation across Goal, Sides, and Top, while Reveal contains only face analysis.

**Tech Stack:** Existing Qwen 3.5 4B Q4_K_M/Ollama, faster-whisper small, MediaPipe, FastAPI, SQLite, React/TypeScript/Vite/Motion. No new inference service or cloud dependency.

**Spec:** User's Oct 10 conversation-first request, including the clarification that laptop voice records successfully but local AI processing is slow. This plan supersedes the v2 reveal/style-selection requirement in `docs/API-v2.md`; the consent, isolation, and two-party agreement requirements remain.

## Current evidence and intended changes

- Current software baseline: 215 passing backend tests, production frontend build, full local-model browser flow. Those checks establish the existing contracts, not the desired new experience.
- Current ranking is largely predetermined: `rank_styles` and `rank_parts` choose the top three with fixed face/problem scores before `_evidence_choices` calls the model. Free-form occasion, impression, and routine do not decide which candidates the model sees.
- Current chat makes a streamed reply call and then a second `extract` call. `think:false` is already present, so enabling that setting is not a new optimization.
- Current Ollama residency: `qwen3.5:4b`, Q4_K_M, context 4096, `size_vram: 0` (CPU). The existing laptop experiment found its integrated GPU slower; do not reconfigure the entire machine on an assumption.
- The last complete run measured chat 25.4 seconds, observations 22.6/24.7 seconds, suggestions 8.4/8.9 seconds. These are single-run job times, not universal promises.
- Recent transcription jobs completed; two latest durations were approximately 0.35 and 7.29 seconds. Neither proves microphone transcript accuracy. The user now confirms recording works; trace the remaining delay through transcription, review/send, queue, reply generation, and preference processing.
- A previously fixed PyAV incompatibility is already repaired. Do not treat every slow recording as that old decoding bug.

## Proposed customer experience

Keep the existing stage IDs to avoid an unnecessary database stage migration:

`Photos → Goal (Usapan) → Reveal (Face shape) → Sides → Top → Summary → Cutting → Done`

1. **Photos:** capture front/side. Make progress distinguish shape estimation from optional hair observations. The barber can proceed using manual confirmation if optional vision is slow or cancelled; AI suggestions must not consume unconfirmed physical guesses.
2. **Goal / Usapan:** the primary surface is a readable conversation with Kuya Pal. Example opening: “Para saan ang gupit mo ngayon, at anong look ang gusto mong dating?” Listen before advising. Ask one relevant follow-up, without repeating answered questions. Optional chips help express occasion and problems but do not form a mandatory questionnaire.
3. **Reveal:** show the photo/outline, proposed face shape, uncertainty, and barber confirm/correct controls. No haircut cards, top pick, style selection, or recommendation job. Manual/unknown shape remains a valid consultation path.
4. **Sides:** Kuya Pal compares up to three eligible options using the brief, confirmed hair facts, and relevant references. The customer can ask why, reject a fade, ask for less contrast, keep length, or describe a custom result before choosing.
5. **Top:** continue the same conversation, carrying the agreed sides and all protected preferences. Discuss texture, volume, fringe, styling effort, and the desired impression. Do not recommend a disconnected top merely because the face is round.
6. **Summary:** compose the chosen sides/top/fringe and explicit keep/change/avoid into one descriptive haircut plan. A catalog name is optional; never require a separate full-style pick. Both parties review and accept this exact version before cutting.
7. **Cutting/Done:** retain advisory checkpoints, frozen agreement, shared phone rating, consent cleanup, and preferred return visit.

Two customers with round faces can receive different top choices and different explanations: a customer asking for school compliance and no morning styling versus a customer requesting a noticeable birthday look and willing to style it. These are test scenarios, not new fixed mappings. School/work must not imply an invented dress code; ask about rules when relevant.

“Punch” is interpreted as the customer's desired impression or impact: understated, clean, professional, relaxed, playful, noticeable, or bold. Their own wording must also be retained. Use “Kuya Pal” in conversational UI and persona as requested, preserving the current mascot artwork and visual identity.

## Personalization and grounding contract

Add `state.brief`, with optional values:

- `occasion: string | null` (school, work, birthday, interview, everyday, or the customer's own text).
- `desired_impression: string[]` (max 5 short phrases, not a locked aesthetic taxonomy).
- `change_level: 'subtle' | 'noticeable' | 'bold' | null`.
- `styling_minutes: integer 0..60 | null`.
- `maintenance_preference: string | null`.
- `dress_rules: string | null` (only rules the customer actually states).
- `inspiration: string | null` (text initially; no new reference-image upload workflow in this revision).
- `evidence: [{field, source_text, speaker, contribution_id}]` for extracted values; every source fragment must occur in the supplied turn. Unsupported updates are discarded, not guessed.

Null means unknown, not low effort or no preference. Existing keep/change/avoid remain hard constraints. Barber suggestions must not become customer preferences without confirmation. Explicit corrections replace the affected brief values and invalidate dependent proposals; frozen agreements remain immutable.

**AI owns the comparison:** after hard constraint filtering, give the model all remaining options for the active part (currently at most six), their compact facts, confirmed observations, brief, and relevant reference snippets. Do not run face/problem scoring to preselect the three winners. The model returns candidate IDs and customer/evidence links; the server attaches catalog facts and validates IDs, protected regions, source IDs, and referenced brief fields. Revalidate after generation. The same haircut may reasonably fit two people; personalization means relevant tradeoffs, not forced random diversity.

**Ground explanations without returning to scripted advice:** render a concise rationale from the model's selected customer factors plus verified catalog facts. Example: “Dahil gusto mo ng malinis na look sa work at ayaw mong kita ang anit, puwedeng taper; hindi kailangan ang skin fade.” The factual component must be supported by the option metadata. Reject invented anatomy, medical claims, and unsupported promises. Do not restore unrestricted prose that previously invented “dila” as a haircut feature. If output is invalid after one bounded retry, show an honest failure/manual-choice path; do not silently call deterministic output an AI recommendation.

## References: more useful coverage, kept local

Existing sources skew toward face shape. Add compact, original summaries about consultation, lifestyle, maintenance, growth patterns, texture, and styling tradeoffs; maintain source IDs and URLs in `knowledge/sources.json`. Preserve disagreements and conditional wording.

Verified starting references:

- [BCcampus: The Design Consultation](https://opentextbc.ca/barberingtechniquesforhairstylists/chapter/the-design-consultation/) — customer preferences, face/head shape, growth patterns; existing source, expand covered topics rather than duplicate it.
- [Pall Mall Barbers: Hair Styling](https://www.pallmallbarbers.com/services/hair-styling/) — consultation should establish individual style and lifestyle requirements.
- [Sam Villa: How to Find the Right Haircut for Your Face Shape](https://www.samvilla.com/blogs/hair-tutorials/how-to-find-the-right-haircut-for-your-face-shape) — face shape, texture, and manageable daily routine. General guidance; do not copy its named women's styles into the men's component catalog.

Create `knowledge/consultation_guidance.json` records `{id, topics, summary, source_ids}` and enrich existing parts with supported styling/maintenance/change metadata. Retrieve at most four relevant short records locally by topics and explicit brief terms. This is context retrieval, not training. No vector database or extra embedding model is needed for this small library. No runtime browsing. Add new part families only when a reviewed source, metadata, constraint rules, and honest preview support them; initially improve combinations of existing components rather than pad the catalog with unsupported names.

## Why latency happens and what to optimize

A barber persona scopes the prompt; it does not reduce a 4.2-billion-parameter model to a smaller network. Adding references can improve relevance but can also increase prompt processing if every page is included. Fine-tuning is a separate training project and is not the first deadline fix.

Prioritize: remove redundant reveal inference; consolidate reply and brief extraction into one compact streamed local call; retrieve only relevant snippets; keep bounded conversation history plus a durable brief; avoid automatic inference after every small chip/edit; show queue position and stage of processing. Keep `think:false` and model warm-up. Measure actual load/prompt/generation timings before changing token limits or model size.

Official technical references:

- [Ollama chat API](https://docs.ollama.com/api/chat) — stream/think controls and load/prompt/generation counters.
- [Ollama FAQ](https://docs.ollama.com/faq) — model residency, memory and concurrency behavior.
- [Qwen 3.5 4B model card](https://huggingface.co/Qwen/Qwen3.5-4B/blob/main/README.md) — non-thinking mode and sampling guidance. Do not copy its large research-generation token budgets into this short interactive consultation.

## Global constraints

- Actual app root: `C:/Users/Diel/Documents/GitHub/GupAi`. Preserve all existing uncommitted changes and customer data. Keep a source/data snapshot before implementation.
- No cloud inference, runtime downloads, automatic publishing, or removal of protected preferences.
- Use the existing model initially; benchmark already cached smaller models only after the call-count fix if needed. A switch requires Taglish/negation/personalization quality to pass, not just a lower latency number.
- Keep the warm cream/peach/sage design and laptop/phone roles. Goal becomes conversation-first; no unrelated redesign or dependencies.
- Existing visits/agreements remain readable and completable. New plans do not require `selected_style`; old plans keep their original values and comparison semantics.

## Review focus

1. Same face shape, different occasion/routine: AI receives both differences and explains relevant tradeoffs without a hardcoded occasion-to-cut map.
2. “Keep fringe” then “actually shorten it”: explicit correction updates constraints; stale jobs cannot restore the earlier preference.
3. Recording succeeds but no useful words: show silence/empty-transcript feedback; never fabricate a transcript or erase unsent text.
4. Unknown shape/texture/rules: ask or continue with uncertainty; never invent dress policies or compulsory facial proportions.
5. Brief changes after choosing parts or after confirmation: derived proposals invalidate; accepted cutting agreement remains frozen and saved exactly.

## Task 1: Measure the complete voice/chat latency path

**Files:** Modify `backend/app/ai.py`, `backend/app/jobs.py`, `frontend/src/api.ts`, `frontend/src/components/ConsultParts.tsx`, `frontend/src/components/Talk.tsx`; create `backend/tests/test_conversation_latency.py`; update `docs/MEASUREMENTS.md`.

**Interface:** Extend job response with optional `progress: {phase, queued_ahead, first_token_ms}` and a restricted timing object (durations/token counts only). Phases: queued, transcribing, composing, finalizing, done. Do not expose prompts/customer audio in diagnostics.

- [ ] Add failing tests that queue duration differs from inference duration, streamed text is available before completion, cancelled audio cleans up, and empty transcription produces explicit review feedback.
- [ ] Instrument Ollama final response counters (`load_duration`, `prompt_eval_duration`, `eval_duration`, counts) and job enqueue/start/end; capture first content token via a monotonic clock. Make the browser timing detect actual AI text, not the loading placeholder.
- [ ] Measure three warm typed turns and three short recording/transcription turns with no overlapping demo model requests. Record clip duration, transcription-only time, queue wait, first reply text, and full turn. Ask the user to verify one real mic clip; synthetic input does not establish human accuracy.
- [ ] Inspect UI mic busy state and transcript arrival; preserve explicit transcript review/Send behavior. Repair only a reproduced remaining recording issue. User clarification means no speculative microphone rewrite.
- [ ] Run focused tests, preserve baseline timings, and report which stage dominates.

## Task 2: Store the conversational brief and produce a single local turn

**Files:** Modify `backend/app/consult.py`, `backend/app/consultations.py`, `backend/app/ai.py`, `backend/app/jobs.py`, `frontend/src/api.ts`; create `backend/app/conversation.py`, `backend/tests/test_conversation.py`.

**Interfaces:** `brief_defaults() -> dict`; `validate_brief_updates(updates, source_turns) -> list[dict]`; `conversation_turn(state, source_turns, phase, on_reply_piece) -> {reply, brief_updates, proposed_changes, problems_detected}`. Source turns include contribution ID, speaker, and text; retain the SQLite input cursor. `phase` is goal/sides/top.

- [ ] Red tests: occasion/impression/time survive multiple turns; unknown values remain null; invented rules/source fragments rejected; barber suggestion is not a customer preference; explicit corrections update values; legacy states acquire defaults; protected regions and frozen plans are unchanged.
- [ ] Replace reply-plus-extract with one schema-constrained streamed response containing reply, brief updates, and constraint proposals. Feed only the durable brief, last six relevant turns, active phase, and retrieved evidence. No independent second extraction call for each turn.
- [ ] Implement a bounded streaming string decoder for the `reply` field and validate final JSON before merging. Test chunk boundaries, escaped quotes, Unicode, malformed/truncated output, and property-order differences. Do not use a regex that silently breaks escaped text. If the one-pass format fails quality tests, report that outcome and retain the working path rather than shipping broken streaming.
- [ ] Prompt: acknowledge the actual concern, discuss a relevant tradeoff, ask at most one useful unanswered question. Do not force a stock length question every turn or refer to the user as Kuya Pal. Do not finalize or select a cut from conversational assent alone.
- [ ] Target a measured reduction of at least 20% in median full-turn latency versus Task 1, with no loss of negation/profile quality. This is an optimization gate, not a promised response time. Record if hardware prevents the target.

## Task 3: Broaden local guidance and let AI select personalized parts

**Files:** Create `knowledge/consultation_guidance.json`, `backend/app/guidance.py`, `backend/tests/test_personalization.py`; modify `knowledge/sources.json`, `knowledge/parts.json`, `backend/app/ai.py`, `backend/tests/test_parts.py`.

**Interfaces:** `retrieve_guidance(brief, problems, part) -> list[dict]` (max four records); `eligible_parts(options, state) -> list[dict]` (hard constraints only); `suggest(state, part) -> {options, recommended_id, intro}` (existing outward shape retained, reasons gain optional evidence IDs).

- [ ] Read and summarize verified references; attach source IDs, topic metadata, supported effort/maintenance tradeoffs, and uncertainty. Check source IDs resolve and summaries do not assert occasion rules as universal facts.
- [ ] Red tests prove all eligible options reach the model instead of a scored top-three subset; all required brief dimensions/confirmed observations are present; invalid IDs/evidence rejected; protected fringe/scalp visibility and top length remain enforced.
- [ ] Make Qwen choose and order up to three options, referring to actual brief factors and relevant source evidence. Remove fixed face-shape/problem scoring from the production selection path. Validate the resulting set against hard constraints a second time.
- [ ] Ground the explanation through validated factor/evidence links and complete facts. Preserve customer-specific reasoning while preventing unsupported new anatomy or deterministic recommendations mislabeled as AI.
- [ ] Real-model evaluation: same round face with (A) school/no styling/keep fringe, (B) work/subtle change/no visible scalp, (C) birthday/noticeable volume/15-minute styling. Compare top choices, rationale, tradeoffs, and relevant follow-up. Different appropriate combinations are expected where preferences differ; never manipulate randomness solely to force variety.

## Task 4: Make Reveal face-only and remove the redundant full-style gate

**Files:** Modify `frontend/src/flow.ts`, `frontend/src/components/Scenes.tsx`, `frontend/src/pages/Consult.tsx`, `backend/app/consult.py`, `backend/app/consultations.py`; update `backend/tests/test_v2_flow.py`, `docs/API-v2.md`.

**Interface:** Reveal flips `revealed` without starting `recommend`. New `require_summary` requires valid sides/top choices and no unresolved constraints, not `selected_style`. New agreement stores the brief plus selected components; historical plans remain unchanged.

- [ ] Red tests: reveal triggers zero recommendation jobs; new summary can confirm/save with `selected_style=None`; old fully confirmed plans complete without false invalidation; unknown/manual shape can proceed; no haircut cards appear on Reveal.
- [ ] Replace Reveal recommendations with photo/outline/shape confirmation and a short uncertainty explanation. Move any hidden shape confirmation out of Goal into this stage; allow the stage to open even when the shape estimate is unavailable.
- [ ] Update frontend gating, summary row/preview, agreement creation, preferred-plan hydration, and completeness comparison together. Derive a descriptive plan from parts, not a fabricated style catalog ID. Do not merely delete the visible cards while leaving server gates intact.
- [ ] Keep legacy fields/routes for reading old data; stop using obsolete full-style jobs in the active flow. No destructive schema migration required for JSON brief defaults.

## Task 5: Present a continuous conversation on Goal, Sides, and Top

**Files:** Modify `frontend/src/components/Scenes.tsx`, `frontend/src/components/Talk.tsx`, `frontend/src/pages/Phone.tsx`, `frontend/src/pages/Consult.tsx`, `frontend/src/useConsultation.ts`, `frontend/src/flow.ts`.

- [ ] Goal centers readable conversation and input; a secondary “What we understand” brief shows occasion/look/routine/keep/avoid with correction controls. Move physical observation confirmation into the face-analysis area so it does not crowd the conversation.
- [ ] Use Kuya Pal consistently in copy/persona. Offer optional occasion/impression starters, then continue naturally; don't require every field before proceeding.
- [ ] Keep conversation available on phone and laptop during Sides/Top. Respond to the active topic; regenerate only affected proposals after a relevant brief correction or explicit request. Avoid a separate redundant inference call for every reply when the turn already contains a valid updated comparison.
- [ ] Customer picks a part explicitly after discussing it. “Sige” during conversation must not imply both-party agreement or start cutting. Confirmations remain distinct actions in Summary.
- [ ] Preserve unsent text through transcription/errors. Track transcript identity by job ID, not just text equality, so two identical recordings can both arrive; label transcription/review/send clearly. Record/reply timings remain truthful.
- [ ] Verify both target viewports and permissions/errors in one bounded pass. No clipped input, alternatives, summary confirmation, or phone rating. Retain reduced motion and the existing theme.

## Task 6: Rehearse, document, and stop at a verified demo

**Files:** Update `scripts/v2-browser-smoke.cjs`, `README.md`, `DISCLOSURES.md`, `docs/DEMO.md`, `docs/MEASUREMENTS.md`, `docs/TASKS.md`.

- [ ] Run targeted regression tests after each task; then the complete backend suite, production frontend build, lint, and `git diff --check`. Do not require the old 215 count if intentional new contracts add tests; report the actual final result.
- [ ] Rehearse photos → real conversation with correction → face-only reveal → discussed sides/top → dual confirmation → checkpoint → phone rating → persisted return visit. Confirm the single-use/two-chair isolation and cleanup contracts still pass.
- [ ] Check one temporary session and one consented saved visit, old v2 preferred data, unknown face, stalled/cancelled jobs, missing model, and a transcript that repeats identical text.
- [ ] Re-run warm latency samples only for changed model-call paths, comparing against Task 1. Publish queue, first-text, and complete-turn durations separately, along with sample count/hardware; do not call a loading-placeholder timing first-token latency.
- [ ] Human acceptance: one real laptop mic sentence and one trusted LAN phone session with internet uplink disconnected. Voice may record correctly yet transcribe imperfectly; transcript remains editable.
- [ ] Update disclosures to accurately separate model-driven comparison, deterministic constraint checks, and source grounding. Freeze the verified flow; leave source uncommitted unless the user changes that instruction.

## Execution order and limits

Measure voice/chat delay first; implement the shared brief and one-pass turn; add grounded AI part selection; remove the reveal/style gate; finish conversation UI; rehearse once. Keep the preserved current v2 and v1 recovery copies intact. No model training, new GPU stack, cloud API, vector database, photoreal preview, or unreviewed large haircut catalog belongs in this revision.

## Acceptance checklist

- [ ] Customer can discuss occasion, impression, routine, problems, and changes across turns without repeating already answered questions.
- [ ] Face-only Reveal makes no haircut recommendation call; a separate style selection is not required for a new agreement.
- [ ] Qwen compares all eligible part choices using the brief, rather than explaining fixed top-three scores afterward.
- [ ] Same-shape evaluation demonstrates customer-specific tradeoffs; explicit preferences beat advisory proportions.
- [ ] Actual recording → local transcription → editable transcript → conversation works; latency measurements separate each stage.
- [ ] Protected preferences, chair isolation, frozen agreement, rating, return visit, consent cleanup, and old data remain correct.
- [ ] Measured speed improvements and remaining limits are reported honestly; all inference/reference retrieval stays local.

## Final execution result

Tasks 1–6 implemented and automatically verified. The original unchecked lines above preserve the approved plan, rather than claiming every manual acceptance step was performed. Automated result: 238 backend tests, build/lint/diff checks, full 16-scene real local-model rehearsal, three repeated browser recordings and same-face school/work/birthday evaluation. School selected curtains; birthday selected quiff; work selected side part. Complete chat timings 19.39/12.30/26.80s; first reply text 5.08/4.82/5.83s. Limited baseline comparison and slower all-candidate suggestions are documented in docs/MEASUREMENTS.md.

Human acceptance remains real microphone/photo accuracy, physical phone certificate trust and disconnected internet while preserving LAN. No agents, commits, cloud inference, model downloads or package changes. Both preserved fallbacks remain intact.
