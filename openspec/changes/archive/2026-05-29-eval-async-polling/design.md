## Context

Current state: `runEvaluation()` in `useApi()` calls `POST /evaluate` and awaits the full `EvaluationSummary` in a single response. The evaluate page blocks the UI with a spinner until this resolves (typically 30–120 seconds). The backend has now changed `POST /evaluate` to return `202 Accepted` with just `{ run_id, status: "running" }`, requiring the frontend to poll for progress and fetch the result separately.

Three new backend endpoints are now live:
- `GET /evaluate/jobs` — lists running jobs with per-job progress (`completed/total`)
- `DELETE /evaluate/jobs/{run_id}` — cancels a running job
- `GET /evaluate/history/{run_id}` — already existed; now the definitive source of final result after job ends

## Goals / Non-Goals

**Goals:**
- Replace blocking `runEval()` with a non-blocking start + poll loop
- Show real-time progress bar (`completed / total`) while job is running
- Allow user to cancel a running job
- Surface any jobs already running from prior sessions on page mount
- Handle 429 (concurrency limit) and 404 (prompt not found) gracefully
- Clean up polling interval on component unmount

**Non-Goals:**
- WebSocket / SSE (polling is sufficient and simpler)
- Multiple simultaneous run initiations from the same page session (one active job ref per session)
- Persisting in-progress state across hard refreshes (page mount re-discovers via `GET /evaluate/jobs`)

## Decisions

### Polling mechanism: `setInterval` with `clearInterval` on unmount

A 2.5 s `setInterval` stored in a `ref<ReturnType<typeof setInterval> | null>`. On unmount (`onUnmounted`) the interval is cleared. This is simple, readable, and sufficient for a 2–3 minute evaluation.

**Alternative**: `useIntervalFn` from VueUse — rejected; adds a dependency for trivial gain.

### Termination condition: absence from `jobs` array

The spec says: "jobs array not containing the `run_id` → job has ended." This is checked on every poll tick. When absent, the polling stops and `GET /evaluate/history/{run_id}` is called to retrieve the final result (completed/failed/aborted).

**Risk**: If the job disappears from `jobs` because it failed silently before any progress was made, the history fetch will return `status: "failed"` or `status: "aborted"`. The page must handle these terminal statuses by showing an appropriate error message instead of a results table.

### Active job state: single `activeJob` ref

A single `activeJob = ref<{ run_id: number; completed: number; total: number; provider: string; model: string } | null>(null)` tracks the in-progress job. On page mount, `GET /evaluate/jobs` is called; if any jobs are running, the first one is populated into `activeJob` and polling begins immediately (covering the "resumed from another tab" case).

### Cancel UX: optimistic clear, no revert

On cancel click, call `DELETE /evaluate/jobs/{run_id}`. If 204: clear `activeJob` and stop polling. If 409 (already ended): treat as success — stop polling, fetch result. If 503 (cancellation timeout): show inline error "Cancellation timed out" but keep polling until job disappears naturally.

### priorAccuracy snapshot: unchanged

The delta badge logic introduced in `eval-history-model-delta` still works: snapshot `history.value[0]?.accuracy` before the history refresh once the job is confirmed done.

## Risks / Trade-offs

- [Poll drift] 2.5 s interval may drift slightly under CPU load; actual poll frequency is "at least every 2.5 s" — acceptable for progress UI
- [Job disappears immediately] If backend processes very fast (< 2.5 s), first poll may already find job absent — mitigation: handle this on the first tick same as any other tick (fetch history immediately)
- [timeout_ratio > 50% discards result] Backend docs say such runs don't appear in history — mitigation: `GET /evaluate/history/{run_id}` may return `status: "failed"`; frontend shows discard warning (existing `discardMessage` computed already handles `persisted: false`)
- [Stale `runEvaluation` method] Old method kept in composable temporarily; developer must ensure the evaluate page uses `startEvaluation` instead

## Migration Plan

1. Add new types + composable methods (additive, no breakage)
2. Rewrite evaluate page `runEval()` to use async flow
3. Remove old `runEvaluation()` call from evaluate page (composable method can stay for future use or be removed in a follow-up)
