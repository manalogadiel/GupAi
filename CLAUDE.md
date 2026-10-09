@AGENTS.md

## Claude Code (lead) specifics
- Dispatch Codex with `bash scripts/codex-task.sh <TASK-ID>`, run in the background. Its report lands in `docs/agents/<TASK-ID>.md`.
- After Codex finishes, review the change:
  1. `git status` / `git diff -- backend knowledge`;
  2. read the report;
  3. run the tests;
  4. `/ponytail-review`, plus `vibesec-skill` for endpoints and uploads.
- Then commit with `git add backend knowledge && git commit`.
- Never commit Codex's half-finished work. Commit only after its report exists and the tests pass.
