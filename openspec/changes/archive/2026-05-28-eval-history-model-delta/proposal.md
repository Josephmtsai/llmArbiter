## Why

Two gaps in the Evaluate page reduce its usefulness as a benchmarking tool: the Past Evaluations history cards don't show which model was used (making openrouter runs indistinguishable from each other), and after running an evaluation there is no comparison to the previous run — users can't tell at a glance whether their prompt change improved or degraded accuracy.

## What Changes

- **History cards show model**: Each card in the "Past evaluations" section of `/evaluate` gains a model label (e.g. `deepseek-flash`) alongside the existing provider chip. Only shown when `model` is non-empty.
- **Eval result delta**: After a successful evaluation, the accuracy summary stat shows a delta badge comparing the new result to the most recent prior run in history (e.g. `▲ +3.2%` or `▼ −1.1%`). If no prior run exists the badge is omitted. The delta is computed client-side from the history list already loaded on the page.

## Capabilities

### New Capabilities

- `eval-result-delta`: After a run completes, compute and display an accuracy delta badge (▲/▼ + percentage points) comparing the new result to the most recent history entry. Omitted when there is no prior run or history failed to load.

### Modified Capabilities

- `eval-history-list`: The Past Evaluations cards on `/evaluate/index.vue` gain a model label. (Existing spec `eval-history-list` covers the full-page history table at `/evaluate/history` — this delta updates the inline cards on the evaluate index page which have slightly different requirements.)

## Impact

- `pages/evaluate/index.vue` — model label on history cards; delta badge in summary stats
- No API changes — `EvalRun.model` already exists in `types/api.ts`; history already loaded on page mount
