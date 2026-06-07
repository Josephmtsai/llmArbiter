# Frontend Guide: Optimizer Regression Gates

This document covers Phase 2 of Auto Prompt optimization diagnostics.

## Summary

Phase 2 adds per-action regression gates. A candidate prompt can improve overall
validation accuracy but still be rejected if it makes a protected action worse.

The summary endpoint remains lightweight. The run detail endpoint exposes the
diagnostic fields needed for UI explanations.

## API Compatibility

No route changes are required.

Existing routes remain:

- `GET /api/arbiter/optimizer/history`
- `GET /api/arbiter/optimizer/history/{run_id}`
- `POST /api/arbiter/optimizer/run`
- `DELETE /api/arbiter/optimizer/runs/{id}`

## Run Detail Fields

`GET /api/arbiter/optimizer/history/{run_id}` round objects may include:

```ts
per_action_metrics: Record<string, {
  total: number
  correct: number
  accuracy: number
}> | null

per_action_deltas: Record<string, {
  baseline_accuracy: number
  candidate_accuracy: number
  delta: number
  baseline_total: number
  candidate_total: number
  tolerance: number
}> | null

reject_reason: string | null
skip_reason: string | null
```

`skip_reason` means the round was not evaluated as a candidate. `reject_reason`
means the round was evaluated but not kept.

## Display States

### Kept

Show the existing kept badge and positive accuracy delta.

```text
R2 Kept +3.2%
```

### Rejected By Overall Accuracy

When `kept = false`, `eval_run_id` is present, and `reject_reason` indicates
overall accuracy did not improve, show a rejected badge with the reason.

```text
R2 Rejected: no overall improvement
```

### Rejected By Regression Gate

When `reject_reason` identifies an action regression, show the regressed action
and expose per-action deltas in the expanded view.

```text
R2 Rejected: send_email regressed beyond tolerance
```

### Skipped

When `skip_reason` is present, show skipped instead of rejected.

```text
R1 Skipped: optimizer-candidate-missing-actions:send_email
```

## Per-Action Table

In expanded round detail, show a compact table:

| Action | Baseline | Candidate | Delta |
| --- | ---: | ---: | ---: |
| trigger_rebuild | 85% | 88% | +3% |
| send_email | 80% | 71% | -9% |

Highlight negative deltas that exceed gate tolerance.

## Summary Endpoint

`GET /api/arbiter/optimizer/history` should stay lightweight. Do not require
per-action metrics on list rows.
