## Why

The committed guide at `main:docs/frontend-eval-display-guide.md` clarifies that the frontend must distinguish manual eval runs from optimizer-triggered eval runs, surface status-aware run history, and connect optimizer baseline/round evaluations back to eval run details.

This matters now because optimizer-generated eval runs and manual eval runs currently look the same in the UI. Operators need to understand where a run came from, whether its accuracy is meaningful, and how optimizer baseline/round results map back to per-case evaluation detail.

## What Changes

- Update Eval History to classify each eval run as manual or optimizer-triggered by cross-referencing optimizer history eval run IDs.
- Add run source and status display to Eval History, including status-aware accuracy formatting that avoids showing misleading `0%` for failed/running runs.
- Update Eval Run Detail to align with the guide: show run status, summary accuracy/correctness, failed-case focused table behavior, and optional confusion matrix data if implementation can derive it locally.
- Update Auto Prompt Optimizer history so each optimizer run displays baseline eval and round eval links using `baseline_eval_run_id` and `rounds[].eval_run_id`.
- Handle optimizer runs whose `rounds` are empty as "baseline passed directly" when status is `completed`.
- Keep Eval Pool display limited to aggregate stats and warnings; do not render raw eval pool cases in frontend.
- Preserve existing manual evaluation behavior and existing delete/compare history actions.

## Capabilities

### New Capabilities

- `eval-run-source-tagging`: Classify eval runs as `manual` or `optimizer` using optimizer history because `/evaluate/history` does not currently expose a `source` field.
- `optimizer-eval-link-display`: Display optimizer baseline/round eval run links and baseline-direct-success behavior in optimizer history.

### Modified Capabilities

- `eval-history-list`: Add source/status display and status-aware accuracy behavior to eval history rows.
- `eval-run-detail`: Align run detail summary and result table behavior with the guide, including status display and failed-case review affordances.
- `optimizer-pool-evaluation`: Preserve pool evaluation launch behavior while clarifying that eval pool raw cases are not shown; operators inspect aggregate stats and linked run details instead.

## Impact

- **Affected files**: likely `types/api.ts`, `composables/useApi.ts`, `pages/evaluate/history/index.vue`, `pages/evaluate/history/[run_id].vue`, `components/optimizer/OptimizerHistory.vue`, `components/optimizer/OptimizerOverview.vue`, `components/optimizer/OptimizerPoolEvaluation.vue`, `utils/optimizerState.ts`, and tests.
- **Guide source**: `docs/frontend-eval-display-guide.md` exists on `main` commit `b9a8a17 add guide`; this detached worktree does not currently contain that committed file.
- **API behavior**: `GET /evaluate/history` has no `source` field. The frontend must cross-reference `GET /optimizer/history` using `baseline_eval_run_id` and `rounds[].eval_run_id` until the backend adds a native source field.
- **Backend backlog**: guide recommends adding `source: 'db' | 'pool'` to eval run responses later; this change does not require backend work.
- **Security**: Optimizer history calls stay on Nuxt server proxy routes. Existing direct eval API access remains unchanged unless implementation already routes it through `/api/arbiter`.
- **Raw test cases**: The guide recommends showing eval pool statistics, not raw `eval_pool.json` or raw eval pool cases.
- **Impact-analysis gap**: Graphify query was attempted, but `graphify-out/graph.json` is absent in this workspace.
