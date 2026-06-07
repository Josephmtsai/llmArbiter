# Frontend Guide: Structured Prompt Candidates

This document covers phase 1 of structured Auto Prompt candidate generation.

## Summary

The backend optimizer will require generated prompt candidates to be structured,
parseable, and contract-valid before they can be saved or evaluated. This is a
backend guardrail for prompt quality.

Phase 1 keeps routes and prompt content compatible. Optimizer run detail adds a
nullable `skip_reason` field on round objects so skipped rounds can be displayed.

## API Compatibility

No route changes are required for phase 1.

Existing routes remain the source of truth:

- `GET /api/arbiter/optimizer/history`
- `GET /api/arbiter/optimizer/history/{run_id}`
- `POST /api/arbiter/optimizer/run`
- `DELETE /api/arbiter/optimizer/runs/{id}`
- `GET /api/arbiter/config/prompts`

`PromptVersion.content` remains plain prompt text. The structured optimizer
candidate object is internal to the backend and is not returned by prompt APIs.

Optimizer run detail round objects may include:

```ts
skip_reason: string | null
```

When `skip_reason` is present, the round was skipped before candidate prompt
creation or candidate evaluation.

## UI Behavior

The optimizer may skip a round when the optimizer LLM returns an invalid
candidate. Examples include malformed JSON, missing candidate fields, missing
classifier actions, missing JSON output instructions, or unsupported actions.

For phase 1, the frontend should continue to display:

- run status;
- baseline accuracy;
- best accuracy;
- test accuracy when present;
- round list, including skipped rounds;
- `error_message` when a run fails.

If a round has `skip_reason`, display it as skipped rather than failed. Suggested
copy:

```text
R1 Skipped: optimizer-candidate-missing-actions:send_email
```

Skipped rounds have `kept = false` and `eval_run_id = null`.

## Minimal UI Schema Change

Phase 1 intentionally does not expose these structured fields:

- `preserved_requirements`
- `changed_requirements`
- `risk_notes`

The backend uses them only to parse and validate candidate generation. Frontend
types only need the additive `skip_reason: string | null` field on optimizer
rounds.

## Future Diagnostics

Phase 2 may expose candidate diagnostics in optimizer run detail. If added, the
recommended display is per round:

- preserved requirements: compact checklist;
- changed requirements: short diff-style list;
- risk notes: warning text under the candidate result;
- invalid candidate reason: badge or inline message near the skipped round.

Do not build this UI until the API returns those fields.
