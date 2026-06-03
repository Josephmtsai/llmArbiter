## 1. Types & API Composable

- [x] 1.1 Add `EvalRun` interface to `types/api.ts` (fields: run_id, prompt_version_id, provider, model, started_at, finished_at, total, correct, timeout_count, accuracy)
- [x] 1.2 Add `EvalRunResult` interface to `types/api.ts` (fields: test_case_id, expected_action, predicted_action, is_correct, latency_ms)
- [x] 1.3 Add `EvalRunDetail` interface to `types/api.ts` (fields: run + results array)
- [x] 1.4 Add `EvalCompareGroup` interface to `types/api.ts` (union type for provider-group and prompt-version-group shapes)
- [x] 1.5 Add `EvalCompareResponse` interface to `types/api.ts` (fields: dimension, groups)
- [x] 1.6 Add `getEvalHistory()` method to `useApi()` — `GET /evaluate/history` returning `ArbiterResponse<{ runs: EvalRun[] }>`
- [x] 1.7 Add `getEvalRunDetail(runId: number)` method to `useApi()` — `GET /evaluate/history/{run_id}` returning `ArbiterResponse<EvalRunDetail>`
- [x] 1.8 Add `getEvalCompare(by: 'provider' | 'prompt_version')` method to `useApi()` — `GET /evaluate/history/compare?by=...` returning `ArbiterResponse<EvalCompareResponse>`

## 2. History List Page

- [x] 2.1 Create `pages/evaluate/history.vue` with `definePageMeta({ middleware: 'auth' })`
- [x] 2.2 Call `getEvalHistory()` on mount; handle loading, error, and empty states
- [x] 2.3 Render runs table with columns: Run ID, Prompt Version, Provider, Model, Accuracy, Correct/Total, Timeouts, Started At
- [x] 2.4 Implement accuracy colour-coding (green ≥ 80%, yellow 50–79%, red < 50%) using `--action-*` CSS vars
- [x] 2.5 Make each row clickable, navigating to `/evaluate/history/{run_id}` via `navigateTo()`
- [x] 2.6 Add "Compare runs →" button linking to `/evaluate/history/compare`

## 3. Run Detail Page

- [x] 3.1 Create `pages/evaluate/history/[run_id].vue` with `definePageMeta({ middleware: 'auth' })`
- [x] 3.2 Read `route.params.run_id` and call `getEvalRunDetail(runId)` on mount; handle 404 (`detail: "run-not-found"`) separately from other errors
- [x] 3.3 Render summary card: run_id, provider, model, accuracy (coloured), correct/total, timeout_count, started_at, duration in seconds
- [x] 3.4 Render results table with columns: Case ID, Expected (ActionBadge), Predicted (ActionBadge), Result (PASS/FAIL badge), Latency
- [x] 3.5 Style FAIL rows distinctly (e.g., subtle red left border or background tint)
- [x] 3.6 Implement "Failures only" toggle that filters the displayed rows client-side
- [x] 3.7 Add "← History" back link to `/evaluate/history`

## 4. Compare Page

- [x] 4.1 Create `pages/evaluate/history/compare.vue` with `definePageMeta({ middleware: 'auth' })`
- [x] 4.2 Implement dimension toggle ("By provider" / "By prompt version") as a two-button pill group; default to `provider`
- [x] 4.3 Fetch `getEvalCompare(activeDimension)` on mount and on toggle change; handle loading and error states
- [x] 4.4 Build `CompareBarChart` inline component: renders `<div>` bars with percentage `width`, labelled with group name below and accuracy % inside
- [x] 4.5 In by-provider mode: render avg_accuracy bar (solid) and best_accuracy bar (lighter, 60% opacity) side by side per group
- [x] 4.6 In by-provider mode: overlay individual run dots (small `<span>` circles) at correct height inside each avg bar; make each dot a `<NuxtLink>` to `/evaluate/history/{run_id}`
- [x] 4.7 In by-provider mode: render summary table below chart (Provider, Model, Runs, Avg Accuracy, Best Accuracy), sorted by avg_accuracy descending
- [x] 4.8 In by-prompt-version mode: render one bar per prompt_version_id showing avg_accuracy; show run_count as secondary label beneath each bar
- [x] 4.9 Handle empty `groups` array with "No evaluation data yet." empty state for both dimensions
- [x] 4.10 Add "← History" back link to `/evaluate/history`

## 5. Navigation

- [x] 5.1 Add "History" nav link to `AppSidebar.vue` under the Evaluate section, pointing to `/evaluate/history`
- [x] 5.2 Verify Nuxt resolves `/evaluate/history/compare` as the static page before `/evaluate/history/[run_id]` (no router config needed, but confirm in dev)
