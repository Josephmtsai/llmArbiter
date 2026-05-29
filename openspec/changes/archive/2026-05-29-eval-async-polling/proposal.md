## Why

The backend has migrated `POST /evaluate` from a synchronous blocking call (returns full results in one response) to an asynchronous job-based API (`202 Accepted` + `run_id`). The frontend currently blocks the UI for the entire duration of a run; with async, evaluations can take minutes and the old approach will timeout or leave the user with no feedback. A polling-based flow with progress tracking is required.

## What Changes

- **BREAKING**: `POST /evaluate` now returns `202` with `{ run_id, status: "running" }` instead of the full `EvaluationSummary`. The old synchronous `runEvaluation()` composable method must be replaced.
- Add `startEvaluation(promptId?, model?)` to `useApi()` — calls `POST /evaluate`, expects 202 + `run_id`
- Add `getEvalJobs()` to `useApi()` — calls `GET /evaluate/jobs`, returns in-progress jobs with `completed/total` progress
- Add `cancelEvalJob(runId)` to `useApi()` — calls `DELETE /evaluate/jobs/{run_id}`
- New types: `EvalJob`, `EvalJobsResponse`, `AsyncEvalStartResponse`
- Evaluate page polling loop: start eval → poll every 2.5 s → show progress bar → when job disappears, fetch `GET /evaluate/history/{run_id}` for final result
- Cancel button visible while job is running — calls `cancelEvalJob`, clears polling
- 429 error handling: show "Max concurrent evaluations reached. Wait for a running job to finish." with no retry spinner
- Active jobs list: surface any already-running jobs from `GET /evaluate/jobs` on page mount, so the user can see and cancel in-flight jobs started from another tab

## Capabilities

### New Capabilities

- `eval-async-start`: `POST /evaluate` initiates async job, returns `run_id`; 429 surfaces waiting message; 404 surfaces prompt-not-found error
- `eval-job-polling`: client polls `GET /evaluate/jobs` every 2.5 s; shows progress bar (`completed/total`); stops when `run_id` absent from jobs; fetches `GET /evaluate/history/{run_id}` for result; cleans up on unmount
- `eval-job-cancel`: cancel button visible while job running; calls `DELETE /evaluate/jobs/{run_id}`; handles 409 (already ended) and 503 (timeout) gracefully
- `eval-active-jobs`: on evaluate page mount, calls `GET /evaluate/jobs` to surface any in-progress jobs from prior sessions; shows them with cancel capability

### Modified Capabilities

- `eval-model-select`: the model selector and prompt selector remain unchanged; only the submit handler changes from sync to async (implementation detail, no spec-level requirement change — no delta needed)

## Impact

- `types/api.ts` — add `EvalJob`, `EvalJobsResponse`, `AsyncEvalStartResponse`; `EvaluateRequest` unchanged
- `composables/useApi.ts` — add `startEvaluation`, `getEvalJobs`, `cancelEvalJob`; keep `runEvaluation` temporarily for backwards compatibility during transition but mark deprecated
- `pages/evaluate/index.vue` — replace synchronous `runEval()` with async polling loop; add progress bar, cancel button, active jobs section
