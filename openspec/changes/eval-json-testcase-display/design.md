## Context

`docs/frontend-eval-display-guide.md` was added on `main` at commit `b9a8a17`. This worktree is currently detached at `9f180bb`, so the file is not present in the working tree, but its content was read from `main:docs/frontend-eval-display-guide.md`.

The guide defines four display rules:

- Manual eval runs and optimizer eval runs must be displayed differently.
- Because `GET /evaluate/history` does not expose `source`, the frontend must classify optimizer eval runs by cross-referencing optimizer history.
- Optimizer history must show baseline eval and round eval links, including the special case where `rounds` is empty because baseline already passed.
- Eval pool raw data should not be rendered; only aggregate stats and low-coverage warnings belong in the UI.

Current local code already has pieces of this:

- `/evaluate/history` lists runs but has no source/status column and formats accuracy unconditionally.
- `/evaluate/history/[run_id]` shows per-question rows and has a failures-only toggle, but does not show run status in the summary and does not compute average latency or confusion matrix.
- `OptimizerHistory.vue` has a baseline eval link from recent work, but round rows still link only prompt versions and do not expose `round.eval_run_id`.
- `types/api.ts` already includes `baseline_eval_run_id` and `round.eval_run_id`, so implementation can focus on display and helper logic.

Graphify impact analysis was attempted, but `graphify-out/graph.json` is missing.

## Goals / Non-Goals

**Goals:**

- Clearly label eval history rows as manual or optimizer-triggered.
- Show run status consistently and avoid misleading accuracy values for non-completed runs.
- Let operators navigate from optimizer baseline and each optimizer round to the corresponding eval run detail when IDs are available.
- Treat empty optimizer rounds with completed status as a direct baseline pass.
- Keep eval pool display aggregate-only, with no raw case rendering.
- Preserve strict TypeScript and existing manual eval, delete, compare, and pool-eval launch behavior.

**Non-Goals:**

- Adding backend `source` support.
- Displaying raw `eval_pool.json` or raw eval pool test cases.
- Replacing current eval history compare behavior.
- Building a new optimizer route hierarchy.
- Implementing arbitrary `eval_json` inspection unless a future backend guide explicitly requires it.

## Decisions

### D1: Classify eval run source with optimizer history ID sets

Add a helper that accepts optimizer runs and returns a `Set<number>` containing:

- every `run.baseline_eval_run_id` when non-null
- every `round.eval_run_id` when non-null

Eval history rows are tagged:

```ts
triggeredBy: optimizerEvalRunIds.has(run.run_id) ? 'optimizer' : 'manual'
```

**Rationale**: This exactly follows the guide and works with current backend limitations.

**Alternative considered**: Wait for backend `source`. That would be simpler, but it blocks the current UI improvement.

### D2: Fetch optimizer history on the eval history list only

`/evaluate/history` needs source tagging for the list, so it should load both eval history and optimizer history. `/evaluate/history/[run_id]` can show source only if implementation has a cheap path to reuse classification, but source tagging there is optional for this change because the guide's detail design focuses on run status, accuracy, failed cases, and per-case results.

**Rationale**: Avoid adding an extra optimizer-history request to every run detail page unless needed.

**Alternative considered**: Fetch optimizer history in both list and detail. This makes detail labels richer but adds latency and another failure mode to a page that already has the run ID context.

### D3: Use status-aware accuracy formatting

Eval history rows should render accuracy only for completed-like runs where accuracy is meaningful. For `failed`, `running`, and cancelled states, render `--` rather than `0%`. Color thresholds from the guide:

- high: `>= 0.8`
- mid: `>= 0.6` and `< 0.8`
- low: `< 0.6`

Existing design tokens can map these to `--action-rebuild`, `--action-fallback`, and `--action-notify`.

**Rationale**: The guide explicitly calls out that failed/running rows must not look like a real zero-accuracy result.

### D4: Optimizer detail should center baseline and round eval links

`OptimizerHistory.vue` should show a compact sequence:

- baseline eval link when `baseline_eval_run_id` exists
- each round with `round.eval_run_id` detail link when available
- prompt version link remains available but secondary
- kept/reverted status remains visible

For `rounds.length === 0 && status === 'completed'`, show that the baseline already met the target and no optimization rounds were needed.

**Rationale**: This matches both `frontend-eval-display-guide.md` and `frontend-optimizer-eval-link.md`.

### D5: Confusion matrix is optional and derived client-side

Eval run detail may derive a confusion matrix from `results[]` because each row has `expected_action` and `predicted_action`. Treat it as optional if implementation time or layout risk is high; the guide labels it optional.

**Rationale**: Failed-case review is the primary value. Confusion matrix is useful but should not block the required source/status/link display.

## Risks / Trade-offs

- **Optimizer history request fails on eval history page** -> Still show eval history rows and mark source as unknown/manual with a small warning or silent fallback; do not block the page.
- **Old optimizer runs have null eval IDs** -> Render non-clickable `n/a` or no detail link.
- **Running/failed run totals are incomplete** -> Status-aware formatting avoids implying real accuracy.
- **Extra request on history page** -> Use parallel loading and keep error states independent.
- **Guide file not present in detached worktree** -> Handoff must mention the source was read from `main:docs/frontend-eval-display-guide.md` and Developer should merge/rebase or copy the guide before implementation.

## Migration Plan

1. Bring `docs/frontend-eval-display-guide.md` into the implementation worktree or ensure the Developer branch includes `main` commit `b9a8a17`.
2. Add helper logic and tests for optimizer eval ID extraction and eval run source tagging.
3. Update eval history list with source/status columns, status-aware accuracy, and existing actions intact.
4. Update eval run detail with status display, failed-case summary, average latency, and optional confusion matrix.
5. Update optimizer history baseline/round eval links and direct-baseline-pass empty-round state.
6. Verify with `pnpm vue-tsc --noEmit`, targeted Vitest tests, and browser smoke for `/evaluate/history`, `/evaluate/history/{run_id}`, and `/optimizer`.

Rollback is limited to display/helper changes; existing APIs and stored data are unchanged.

## Open Questions

- Should run detail display source as well, or is source tagging in the history list enough for this iteration?
- Should failed/running/cancelled accuracy be hidden on `/evaluate` inline past-evaluation cards too, or only on `/evaluate/history` per the guide?
- Does backend return `status` consistently for all eval history rows, including old runs?
