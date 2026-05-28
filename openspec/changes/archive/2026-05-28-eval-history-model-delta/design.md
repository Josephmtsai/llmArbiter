## Context

`pages/evaluate/index.vue` already loads `history` (an `EvalRun[]`) on mount via `getEvalHistory()`. Each `EvalRun` already has a `model` field (added in the openrouter-eval-model change). The accuracy summary after a run is currently three static stat cards. The history list is rendered as `NuxtLink` cards showing accuracy, correct/total, timeout count, and provider — but not model.

Both features are purely client-side: no new API calls, no new types.

## Goals / Non-Goals

**Goals:**
- Show `h.model` in each Past Evaluations card when non-empty
- After a successful `runEval()`, compute `delta = result.accuracy - history[0].accuracy` and render a coloured badge (`▲ +X.X%` or `▼ −X.X%`) next to the Accuracy stat card

**Non-Goals:**
- Delta vs a specific named baseline (always vs the most recent prior run)
- Storing or persisting delta across sessions
- Delta in the full history table at `/evaluate/history` (out of scope)
- Any backend changes

## Decisions

### Delta source: `history[0]` before the new run

`history` is loaded on mount and represents runs before the current eval. After `runEval()` succeeds, `loadHistory()` is called — this refreshes history and the new run becomes `history[0]`. To compute the delta correctly, capture `history[0].accuracy` **before** calling `loadHistory()` post-run, then compare to `result.accuracy`.

**Alternative**: Compare to `history[1]` after refresh — rejected; fragile if history is empty or if the new run doesn't appear immediately.

### Delta display: inline badge next to Accuracy card value

A small coloured chip (`▲ +3.2%` green / `▼ −1.1%` red / `→ 0.0%` neutral grey) rendered as a `<span>` inline with the accuracy number. Zero delta shows a neutral arrow. Badge is absent if `priorAccuracy` is null (no history at run time).

### Model label in history cards: mono chip, only when non-empty

`h.model` is an optional field on `EvalRun`. The chip renders only when `h.model` is truthy, keeping non-openrouter history cards unchanged.

## Risks / Trade-offs

- [Race on history refresh] If `loadHistory()` resolves extremely fast (local dev), `history[0]` might already be the new run when the delta is computed — mitigation: snapshot `priorAccuracy` synchronously before `await loadHistory()`
- [Empty history] First-ever run has no prior — delta badge is omitted cleanly, no fallback needed
