## Context

The existing evaluate flow (`pages/evaluate.vue`) supports running a single evaluation and viewing the result immediately. There is no persistence or comparison: refreshing the page loses the result, and there is no way to compare two runs side by side.

The backend now exposes three new read-only endpoints:
- `GET /evaluate/history` — paginated run list
- `GET /evaluate/history/{run_id}` — per-question breakdown for one run
- `GET /evaluate/history/compare?by=provider|prompt_version` — aggregated accuracy by dimension

The frontend is a Nuxt 3 SSR app using `$fetch` via `useApi()`. All pages are under `pages/` with file-based routing. TypeScript strict mode is enabled; `any` is forbidden.

## Goals / Non-Goals

**Goals:**
- Surface all three new endpoints as distinct, navigable pages under `/evaluate/history`.
- Provide a clear history table, a per-run drill-down, and a comparison view.
- Add typed API methods and interfaces without touching existing eval code.
- Render comparison charts without introducing a charting library dependency.

**Non-Goals:**
- Pagination of the history list (backend returns latest-first; volume is low).
- Real-time / polling updates of in-progress runs.
- Exporting or downloading results as CSV/JSON.
- Modifying `POST /evaluate` or the existing `/evaluate` page.

## Decisions

### D1 — File-based routing under `/evaluate/history/`

**Choice**: Three new page files:
- `pages/evaluate/history.vue` → `/evaluate/history`
- `pages/evaluate/history/[run_id].vue` → `/evaluate/history/123`
- `pages/evaluate/history/compare.vue` → `/evaluate/history/compare`

**Rationale**: Nuxt file-based routing already handles nested routes. No router config changes needed. The `compare` segment is a literal string — Nuxt resolves named literals before dynamic `[run_id]` segments, so there is no ambiguity.

**Alternative considered**: Single page with tab/query-param switching — rejected because each view has meaningfully different data requirements and a distinct URL is more bookmarkable and linkable.

### D2 — No charting library; CSS + SVG bars

**Choice**: Render bar charts as `<div>` elements with percentage-based `width` driven by Tailwind/inline styles. Render line charts as a simple `<svg>` with polyline.

**Rationale**: Run counts are small (tens, not thousands). A full chart library (Chart.js, ECharts) adds ~200 KB and a new dependency class. The design system already uses CSS variables for action colors — bars can reuse them directly.

**Alternative considered**: Chart.js via CDN — rejected because it requires a `<canvas>` lifecycle wrapper in Vue 3, conflicts with SSR, and is overkill for 5–10 data points.

### D3 — Extend `useApi()` with three new methods; add 5 new interfaces to `types/api.ts`

**Choice**: Add `getEvalHistory()`, `getEvalRunDetail(run_id)`, `getEvalCompare(by)` to the existing `useApi()` composable. Add typed interfaces `EvalRun`, `EvalRunDetail`, `EvalRunResult`, `EvalCompareGroup`, `EvalCompareResponse` to `types/api.ts`.

**Rationale**: Keeps all API calls in one place. The existing pattern (`api<ArbiterResponse<T>>(...)`) is straightforward to extend.

### D4 — Compare page defaults to `by=provider` on mount; toggle switches to `by=prompt_version`

**Choice**: A two-button toggle at the top of the compare page. Switching re-fetches via the same `getEvalCompare(by)` method.

**Rationale**: Both dimensions are equally useful; default to provider because that is the most common question ("which LLM is best?").

## Risks / Trade-offs

- **`compare` vs `[run_id]` route ambiguity** → Nuxt resolves static segments before dynamic ones; confirmed safe. If a future backend run_id were the string `"compare"` this would shadow it — not possible since run_id is an integer.
- **SVG line chart is hand-rolled** → Only needs to handle ≤20 points across ≤5 series. Acceptable complexity; no animation needed.
- **`GET /evaluate/history` has no pagination** → If run count grows large the page could become slow. Mitigation: display only the 50 most recent runs (add `limit=50` query param if backend supports it; otherwise slice client-side).
