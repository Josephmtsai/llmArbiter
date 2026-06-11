# Spec: Optimizer Error Intelligence

## Feature ID
`optimizer-error-intelligence`

## Summary
Display backend-generated error cluster diagnostics inside the optimizer run detail panel. The backend now returns `rounds[].error_clusters` from `GET /optimizer/history/{run_id}`. The frontend should render these clusters to explain why a round failed, improved, or regressed — and expose representative failure cases collapsed under each cluster.

## Source doc
`docs/frontend-optimizer-error-intelligence.md`

## Scope

### In Scope
1. **New TypeScript types** in `types/api.ts`: `OptimizerErrorType`, `OptimizerErrorRepresentativeCase`, `OptimizerErrorCluster`.
2. **`error_clusters` field** added to `OptimizerRound` (optional, nullable).
3. **Error Intelligence section** inside the expanded round detail in `OptimizerHistory.vue`:
   - Placed **after per-action deltas, before failure samples** (matching the doc's recommended placement order).
   - Hidden when `error_clusters` is null, undefined, or empty.
   - Descriptive subtitle: "These are grouped validation failures used to guide the next prompt candidate."
   - One row per cluster: error type label, expected→predicted actions, count, accuracy impact, suggested rule focus.
   - Each cluster has a collapsible representative cases block (collapsed by default).
   - Representative case shows: expected action, predicted action, confidence, source_case_id, log snippet preview.
   - `raw_output` hidden behind a nested `<details>` (collapsed by default).
4. **Label mapping** for `error_type` keys (table in doc). Unknown keys fall back to the raw key value.

### Out of Scope
- Rendering `error_clusters` in the run list sidebar (doc explicitly prohibits this).
- Any API changes or server-side work.
- Modifying any page other than `OptimizerHistory.vue` and `types/api.ts`.

## Architecture Decision

All changes are confined to two files:
- **`types/api.ts`** — add types, extend `OptimizerRound`
- **`components/optimizer/OptimizerHistory.vue`** — add helper functions + Error Intelligence section template + scoped CSS

The Error Intelligence section follows the same `<div class="optimizer-history__section-label">` + `<details>` pattern already used for failure samples and analysis. No new component needed (YAGNI).

## Acceptance Criteria
See `tasks.md`.
