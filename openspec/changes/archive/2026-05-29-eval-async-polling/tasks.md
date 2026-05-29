## 1. Types

- [x] 1.1 Add `EvalJob` interface to `types/api.ts`: `{ run_id: number; status: string; completed: number; total: number; provider: string; model: string; started_at: string }`
- [x] 1.2 Add `EvalJobsResponse` interface: `{ jobs: EvalJob[] }`
- [x] 1.3 Add `AsyncEvalStartResponse` interface: `{ run_id: number; status: 'running' }`

## 2. API Composable

- [x] 2.1 Add `startEvaluation(promptId?: number, model?: string)` to `useApi()` — `POST /evaluate`, returns `ArbiterResponse<AsyncEvalStartResponse>`; same body shape as current `runEvaluation`
- [x] 2.2 Add `getEvalJobs()` to `useApi()` — `GET /evaluate/jobs`, returns `ArbiterResponse<EvalJobsResponse>`
- [x] 2.3 Add `cancelEvalJob(runId: number)` to `useApi()` — `DELETE /evaluate/jobs/{runId}`, returns void (204); must not throw on 409 (job-not-running — return a sentinel instead)

## 3. Evaluate Page — State & Logic

- [x] 3.1 Add `activeJob` ref (`ref<EvalJob | null>(null)`) to `pages/evaluate/index.vue`
- [x] 3.2 Add `pollInterval` ref (`ref<ReturnType<typeof setInterval> | null>(null)`) and `cancelling` ref (`ref(false)`)
- [x] 3.3 Add `cancelMessage` ref (`ref<string | null>(null)`) for cancel-specific inline messages
- [x] 3.4 Replace `runEval()` body: call `api.startEvaluation(selectedPromptId.value, effectiveModel.value || undefined)`; on 202 success capture `run_id` and call `startPolling(run_id)`; handle 429 with specific message; handle 404 with prompt-not-found message
- [x] 3.5 Implement `startPolling(runId: number)`: set `pollInterval` to `setInterval(async () => { ... }, 2500)`; each tick calls `getEvalJobs()`; if `run_id` absent from jobs call `finishJob(runId)` and clear interval; if present update `activeJob` with latest job entry
- [x] 3.6 Implement `finishJob(runId: number)`: snapshot `priorAccuracy` from `history.value[0]`; call `api.getEvalRunDetail(runId)`; if `run.status === 'completed'` populate `result` and call `loadHistory()`; else set `error` to "Evaluation failed or was aborted"; clear `activeJob`
- [x] 3.7 Implement `cancelJob()`: set `cancelling = true`; call `api.cancelEvalJob(activeJob.value.run_id)`; on 204 clear polling + activeJob, set `cancelMessage = "Evaluation cancelled"`; on 409 call `finishJob` immediately; on 503 set `cancelMessage = "Cancellation timed out — job may still complete"` and continue polling; always set `cancelling = false`
- [x] 3.8 On page mount, call `getEvalJobs()` and if any jobs exist set `activeJob = jobs[0]` and `startPolling(jobs[0].run_id)`
- [x] 3.9 Add `onUnmounted(() => { if (pollInterval.value) clearInterval(pollInterval.value) })`

## 4. Evaluate Page — Template

- [x] 4.1 Replace the generic `v-if="running"` spinner block with `v-if="activeJob"` progress section containing: progress bar (`completed/total` as `width: percentage%`), percentage label, provider + model chip, elapsed time since `started_at`, and Cancel button
- [x] 4.2 Update "Run evaluation" button: `:disabled="prompts.length === 0 || !!activeJob"` (disabled while job active); remove `:loading="running"` (no longer a loading state on the button)
- [x] 4.3 Add `v-if="cancelMessage"` inline message below the progress section (auto-clears when a new job starts)
- [x] 4.4 Ensure results `<template v-if="result">` block is unchanged — it displays when `finishJob` populates `result`

## 5. Evaluate Page — Styling

- [x] 5.1 Add `.arb-eval__progress-section` styles: flex column, gap, border, rounded
- [x] 5.2 Add `.arb-eval__progress-bar-wrap` + `.arb-eval__progress-bar-fill`: full-width track (bg-2, border-subtle), animated fill (action-rebuild background, transition width)
- [x] 5.3 Add `.arb-eval__progress-meta`: small mono text row for provider · model · elapsed · percentage
- [x] 5.4 Add `.arb-eval__cancel-msg` for cancel status message (muted colour)
