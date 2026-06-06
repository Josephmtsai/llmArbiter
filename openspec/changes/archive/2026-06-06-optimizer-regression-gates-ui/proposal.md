## Why

The optimizer already shows whether a round was kept or rejected, but gives no reason for rejection. Phase 2 adds per-action regression gates to the backend, and the frontend needs to surface the `reject_reason` and per-action accuracy deltas so operators can understand why a candidate prompt was rejected even when overall accuracy improved.

## What Changes

- `OptimizerRound` type gains three new optional fields: `reject_reason`, `per_action_metrics`, and `per_action_deltas`
- Round header badges now display the rejection reason inline (e.g. "Rejected: send_email regressed beyond tolerance")
- Expanded round detail shows a per-action accuracy table when `per_action_deltas` is present, with regression rows highlighted
- Test coverage added for all new display states

## Capabilities

### New Capabilities

- `optimizer-regression-gates`: Displays per-action regression gate diagnostics in optimizer round history — rejection reasons on round badges and a per-action delta table in expanded detail

### Modified Capabilities

<!-- No existing spec requirements are changing; new fields are additive -->

## Impact

- `types/api.ts` — `OptimizerRound` interface
- `components/optimizer/OptimizerHistory.vue` — round header and expanded detail
- `tests/optimizerHistory.test.ts` — new test cases
