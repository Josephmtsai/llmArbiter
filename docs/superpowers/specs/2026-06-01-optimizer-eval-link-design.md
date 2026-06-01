# Design: Optimizer History — Eval Run Link Integration

**Date:** 2026-06-01
**Status:** Approved
**Scope:** `types/api.ts`, `components/optimizer/OptimizerHistory.vue`

---

## Problem

The backend has added `baseline_eval_run_id` (on `OptimizerRun`) and `eval_run_id` (on `OptimizerRound`) to `GET /api/arbiter/optimizer/history`. The frontend currently has no types for these fields and no UI to surface them, leaving operators unable to navigate directly from an optimizer run to its underlying eval runs.

---

## Goal

Allow operators to jump from an optimizer run detail view to the corresponding eval run detail page (`/evaluate/history/{id}`) for both the baseline eval and each optimization round.

---

## Out of Scope

- Fetching baseline eval accuracy when `rounds` is empty (zero-rounds runs will show the baseline link only; operator clicks through to the eval detail page for the accuracy value)
- Changes to `OptimizerOverview.vue` recent-runs table
- Changes to the composable or API layer — no extra fetch is added

---

## Type Changes (`types/api.ts`)

Add two optional-but-nullable fields:

```ts
export interface OptimizerRun {
  // ... existing fields ...
  baseline_eval_run_id: number | null   // new
}

export interface OptimizerRound {
  // ... existing fields ...
  eval_run_id: number | null            // new
}
```

Old runs (before the backend deploy at commit `d0723ef`) will have `null` for both fields. The frontend must not render links when the value is `null`.

---

## UI Changes (`OptimizerHistory.vue`)

### 1. Baseline eval link — run detail stats row

The stats row currently shows three chips: `Target %`, `Best %`, `N rounds`.

Add a fourth chip (only when `baseline_eval_run_id` is non-null):

```
Target 80%   Best 65%   2 rounds   Baseline eval ↗
```

The `Baseline eval ↗` chip is a `NuxtLink` to `/evaluate/history/{baseline_eval_run_id}`. When `baseline_eval_run_id` is null (old data), the chip is omitted entirely.

For zero-rounds runs (`rounds.length === 0`), the same chip appears and is the primary way for the operator to see eval results. No accuracy fetch is performed.

### 2. Eval link column — round table

The round table currently has five columns: `Round | Accuracy | Failed | Prompt | Kept`.

Add a sixth column `Eval`:

| Round | Accuracy | Failed | Prompt | Kept | Eval |
|-------|----------|--------|--------|------|------|
| 1 | 65% | 35 | v5 | Yes | ↗ 25 |
| 2 | 63% | 37 | v6 | No  | ↗ 26 |

- When `eval_run_id` is non-null: render a `NuxtLink` to `/evaluate/history/{eval_run_id}`, displaying the run id with a link icon
- When `eval_run_id` is null: render an em dash `—` (no link, no tooltip)

### Null-safety contract

```ts
// safe — renders nothing when null
const baselineLink = run.baseline_eval_run_id != null
  ? `/evaluate/history/${run.baseline_eval_run_id}`
  : null

// safe — renders dash when null
const roundEvalLink = (round.eval_run_id != null)
  ? `/evaluate/history/${round.eval_run_id}`
  : null
```

---

## Acceptance Criteria

1. `types/api.ts` compiles without error after adding the two nullable fields.
2. In the run detail view, a `Baseline eval ↗` chip appears and links correctly when `baseline_eval_run_id` is a number.
3. The chip is absent when `baseline_eval_run_id` is `null` (old data).
4. The round table has an `Eval` column; rows with a non-null `eval_run_id` show a working link.
5. Rows with `eval_run_id = null` show `—` without a broken link.
6. Zero-rounds runs show only the baseline chip (no round table is rendered per existing logic).
7. No new API calls are made.
8. `pnpm vue-tsc --noEmit` passes.
