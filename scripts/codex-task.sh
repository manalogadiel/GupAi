#!/usr/bin/env bash
# Dispatch one task from docs/TASKS.md to the Codex worker (non-interactive).
# Usage: [EFFORT=high] bash scripts/codex-task.sh C1 ["extra instructions"]   (default effort: medium)
# Note: on this Windows machine the Codex sandbox helper errors ("setup refresh had errors"), so
# commands are gated by --approve-for-me auto-review instead. AGENTS.md forbids git writes.
set -euo pipefail
ID="${1:?task id, e.g. C1}"; EXTRA="${2:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/docs/agents"
# Hard limit: a C6 run hung 40+ min on a sandbox error and kept writing files after its shell was stopped.
timeout --kill-after=30s "${LIMIT:-25m}" codex exec -C "$ROOT" --approve-for-me -m gpt-6.1-sol -c model_reasoning_effort="${EFFORT:-medium}" \
  -o "$ROOT/docs/agents/$ID.md" \
  "You are the Codex worker on GupAi. Read AGENTS.md, docs/PRD.md, docs/API.md and docs/TASKS.md.
Do ONLY task $ID from docs/TASKS.md: set its status to doing, implement it within its Files column,
verify with its Verify column (run the tests and paste the output), then set its status to review.
Never run git commit, push, reset, checkout or stash. Use the superpowers test-driven-development,
ponytail and vibesec skills. End with the report format from AGENTS.md. $EXTRA" \
  > "$ROOT/docs/agents/$ID.log" 2>&1
echo "Codex finished $ID -> docs/agents/$ID.md (full log: docs/agents/$ID.log)"
