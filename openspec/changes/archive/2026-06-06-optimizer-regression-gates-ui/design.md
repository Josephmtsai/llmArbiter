## Context

The optimizer history UI (`OptimizerHistory.vue`) renders rounds with a kept/rejected badge. The current implementation shows only `kept: true/false` — it does not explain why a round was rejected. Phase 2 of the backend adds per-action regression gates: a round can be rejected because one action's accuracy regressed beyond a configured tolerance, even if overall accuracy improved. The backend exposes `reject_reason`, `per_action_metrics`, and `per_action_deltas` on round detail objects from `GET /optimizer/history/{run_id}`.

## Goals / Non-Goals

**Goals:**
- Display `reject_reason` text inline in the rejection badge
- Render a per-action accuracy delta table in expanded round detail when `per_action_deltas` is present
- Highlight delta cells that fail the regression gate (negative delta exceeding tolerance)
- Add TypeScript types for the new fields

**Non-Goals:**
- No backend or API route changes
- No changes to the history list endpoint or list-row rendering
- No changes to the skip_reason display (already implemented)
- No aggregated cross-round per-action summaries

## Decisions

### Reject reason inline in the badge text

**Decision**: Embed the reason in the badge label — `Rejected: <reason>` — rather than as a sibling span.

**Rationale**: The spec examples show `R2 Rejected: no overall improvement` and `R2 Rejected: send_email regressed beyond tolerance` as a single visual unit. Placing the reason in a sibling span would split the label and require two elements to convey one status. The badge already has a CSS modifier class; the text change is the only addition needed.

**Alternative considered**: Show a tooltip on the badge. Rejected — tooltips are not discoverable on touch devices and the reason text is short enough to display inline.

### Per-action table placed after confusion matrix

**Decision**: Insert the per-action deltas table between the confusion matrix block and the failure samples block in the expanded round detail.

**Rationale**: The confusion matrix already summarises per-action signal; the delta table is a direct complement. Placing them adjacent keeps action-level data together. Failure samples are case-level data and belong after.

### Tolerance highlight via inline class, not icon

**Decision**: Use a CSS highlight class (`optimizer-history__delta-cell--regression`) on negative-delta cells where `Math.abs(delta) > tolerance`. No icon or extra column.

**Rationale**: Consistent with existing table cell highlighting patterns in the component (see `optimizer-history__matrix-cell--nonzero`). Keeps the table compact.

## Risks / Trade-offs

- **Risk**: `per_action_deltas` keys may be long action strings. → The table already truncates action names via `shortAction()`, which will be reused here.
- **Risk**: Backend may return `reject_reason` for kept rounds (unexpected state). → The UI only reads `reject_reason` when `kept === false`, so this is harmless.

## Migration Plan

Fields are additive and optional (`| null`). No migration required — existing runs without these fields render identically to today.
