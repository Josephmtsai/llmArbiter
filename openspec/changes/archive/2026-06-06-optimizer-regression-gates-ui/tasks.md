## 1. Type Definitions

- [x] 1.1 Add `reject_reason?: string | null` to `OptimizerRound` in `types/api.ts`
- [x] 1.2 Add `per_action_metrics?: Record<string, { total: number; correct: number; accuracy: number }> | null` to `OptimizerRound`
- [x] 1.3 Add `per_action_deltas?: Record<string, { baseline_accuracy: number; candidate_accuracy: number; delta: number; baseline_total: number; candidate_total: number; tolerance: number }> | null` to `OptimizerRound`

## 2. Round Badge — Rejection Reason

- [x] 2.1 In `OptimizerHistory.vue`, update the rejected badge text to `round.reject_reason ? \`Rejected: ${round.reject_reason}\` : 'Rejected'`

## 3. Per-Action Delta Table

- [x] 3.1 In `OptimizerHistory.vue`, add a per-action deltas table section after the confusion matrix block (inside the expanded round detail), rendered when `round.per_action_deltas` is non-null
- [x] 3.2 Table columns: Action (using `shortAction()`), Baseline (%), Candidate (%), Delta (±%)
- [x] 3.3 Apply a highlight class (`optimizer-history__delta-cell--regression`) to the Delta cell when `delta < 0 && Math.abs(delta) > tolerance`
- [x] 3.4 Add CSS for `.optimizer-history__delta-cell--regression` (red tint, consistent with existing rejected styles)

## 4. Tests

- [x] 4.1 In `tests/optimizerHistory.test.ts`, add test: round with `reject_reason` shows `"Rejected: <reason>"` in badge
- [x] 4.2 Add test: round with `kept: false` and no `reject_reason` still shows `"Rejected"` badge
- [x] 4.3 Add test: `per_action_deltas` table renders with action names, baseline, candidate, delta columns
- [x] 4.4 Add test: delta cell gets regression highlight class when `Math.abs(delta) > tolerance`
- [x] 4.5 Add test: `per_action_deltas: null` → table not rendered
