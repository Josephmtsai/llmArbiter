## Why

The existing `/evaluate` page only shows the result of the most recent run and offers no way to compare runs across providers or prompt versions. As the team tests multiple LLM providers (ollama, claude, codex) and iterates on system prompts, there is no single view to answer "which provider performs best?" or "did this prompt version improve accuracy?" The new backend endpoints (`GET /evaluate/history`, `/evaluate/history/{run_id}`, `/evaluate/history/compare`) make structured comparison data available; the frontend now needs to surface it.

## What Changes

- Add a new route `/evaluate/history` listing all past evaluation runs in a sortable table.
- Add a drill-down view at `/evaluate/history/{run_id}` showing per-question expected vs predicted results for a single run.
- Add a comparison view at `/evaluate/history/compare` with two sub-modes:
  - **By provider** — line/bar chart: X-axis = time, Y-axis = accuracy, series = (provider, model) combinations.
  - **By prompt version** — grouped bar chart: X-axis = prompt version ID, Y-axis = accuracy, series = provider.
- Extend the API composable (`composables/useApi.ts`) with three new typed methods for the history endpoints.
- Add new TypeScript types to `types/api.ts` for eval run, run detail, and compare-response shapes.

## Capabilities

### New Capabilities

- `eval-history-list`: Paginated table of all historical evaluation runs with metadata (run_id, prompt version, provider, model, accuracy, duration).
- `eval-run-detail`: Per-question breakdown for a single run — expected vs predicted action, correctness, latency.
- `eval-compare`: Side-by-side accuracy comparison across providers or prompt versions rendered as charts.

### Modified Capabilities

<!-- none — existing POST /evaluate and GET /evaluate/results behavior is unchanged -->

## Impact

- **New files**: `pages/evaluate/history.vue`, `pages/evaluate/history/[run_id].vue`, `pages/evaluate/history/compare.vue`
- **Modified files**: `composables/useApi.ts` (3 new methods), `types/api.ts` (5 new interfaces)
- **No breaking changes** to existing `/evaluate` page or `POST /evaluate` flow
- **No new dependencies** — charts rendered with plain SVG or CSS (no charting library needed given the small data volumes)
