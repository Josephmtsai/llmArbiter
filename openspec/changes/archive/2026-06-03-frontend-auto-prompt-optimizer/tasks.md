## 1. Runtime Config and Types

- [x] 1.1 Add private runtime config entries for Arbiter proxy base URL and API key while preserving existing public config.
- [x] 1.2 Update `.env.example` with private proxy variables and document which optimizer calls use server proxy.
- [x] 1.3 Add `ArbiterAction` alias or reuse `PrimaryAction` consistently for optimizer domain types.
- [x] 1.4 Add eval pool, review queue, optimizer run, optimizer round, optimizer start, optimizer cancel, and pool evaluation TypeScript interfaces to `types/api.ts`.
- [x] 1.5 Extend `EvaluateRequest` to support optional `source: "pool"` without changing existing non-pool evaluation calls.

## 2. Nuxt Server Proxy Routes

- [x] 2.1 Create shared server proxy helper for private runtime config, `X-API-Key` forwarding, status preservation, and error normalization.
- [x] 2.2 Add `GET /api/arbiter/eval-pool/stats` proxy route.
- [x] 2.3 Add `GET /api/arbiter/review-queue` proxy route.
- [x] 2.4 Add `PATCH /api/arbiter/review-queue/{id}` proxy route with validation for confirm, correct, and reject.
- [x] 2.5 Add `POST /api/arbiter/evaluate` proxy route that supports pool-sourced evaluation.
- [x] 2.6 Add `GET /api/arbiter/optimizer/history` proxy route.
- [x] 2.7 Add `POST /api/arbiter/optimizer/run` proxy route with request validation.
- [x] 2.8 Add `DELETE /api/arbiter/optimizer/runs/{id}` proxy route with numeric id validation.

## 3. API Composable

- [x] 3.1 Add typed `getEvalPoolStats()` method calling the local Nuxt proxy.
- [x] 3.2 Add typed `getReviewQueue()` and `updateReviewQueueEntry()` methods calling local Nuxt proxy routes.
- [x] 3.3 Add typed `startPoolEvaluation()` method sending `source = "pool"`.
- [x] 3.4 Add typed `getOptimizerHistory()`, `startOptimizerRun()`, and `cancelOptimizerRun()` methods.
- [x] 3.5 Ensure optimizer methods do not use `runtimeConfig.public.apiKey` or direct Arbiter URLs.

## 4. Optimizer UI

- [x] 4.1 Create `pages/optimizer.vue` with `definePageMeta({ middleware: "auth" })` and tab state for Overview, Review Queue, Pool Evaluation, and History.
- [x] 4.2 Add `EvalPoolStatsCard` or equivalent section showing total, per-action bars, lowest coverage, and low coverage warnings.
- [x] 4.3 Add `StartOptimizerPanel` with `max_rounds`, `target_accuracy`, disabled active-run state, 409 conflict handling, and generic error handling.
- [x] 4.4 Add active optimizer banner with cancel confirmation and "Cancelling after current round" state.
- [x] 4.5 Add recent optimizer runs table and compact accuracy trend for latest or selected run.
- [x] 4.6 Add review queue table with search, action filter, preview fields, and row-level pending state.
- [x] 4.7 Add review detail modal or side panel with full log, hardware info JSON, reasoning, confirm, correct, and reject actions.
- [x] 4.8 Add pool evaluation panel with active prompt default, optional model override, disabled empty-pool state, and accepted-run link.
- [x] 4.9 Add optimizer history detail panel with round table, prompt version links, kept flag, and no-round empty state.
- [x] 4.10 Add Auto Optimizer navigation item to `components/AppSidebar.vue` using a lucide icon.

## 5. Polling and State Handling

- [x] 5.1 Poll optimizer history every 3 seconds only while at least one run is `running`.
- [x] 5.2 Stop polling when all runs are terminal: `completed`, `completed_max_rounds`, `failed`, or `cancelled`.
- [x] 5.3 Refetch eval pool stats after review confirm or correct succeeds.
- [x] 5.4 Preserve review queue filters after confirm, correct, reject, and stale-row refetches.
- [x] 5.5 Handle `eval-pool-empty`, `optimizer-already-running`, `entry-not-found`, `optimizer-run-not-found`, `422`, and `500` states with visible UI messages.

## 6. Tests and Verification

- [x] 6.1 Add Vitest coverage for server proxy helper behavior, including credential forwarding and error status preservation.
- [x] 6.2 Add tests for review queue mutation validation and stale-row handling.
- [x] 6.3 Add tests for optimizer polling start and stop conditions.
- [x] 6.4 Add tests for empty eval pool disabling pool evaluation.
- [x] 6.5 Run `pnpm vue-tsc --noEmit`.
- [x] 6.6 Run targeted Vitest tests for optimizer changes.
- [x] 6.7 Smoke test `/optimizer` in browser for desktop and mobile viewports.

## 7. Backend Readiness Checks

- [x] 7.1 Confirm backend returns `400 detail = "eval-pool-empty"` for empty pool evaluation.
- [x] 7.2 Confirm `GET /optimizer/history` includes active runs while running.
- [x] 7.3 Confirm `GET /review-queue` returns only pending entries sorted by confidence.
- [x] 7.4 Confirm demo or QA environment has eval pool fixtures or seed data for non-empty optimizer UI validation.
