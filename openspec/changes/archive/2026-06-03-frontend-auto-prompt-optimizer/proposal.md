## Why

Operators can run prompt evaluations today, but they do not have a guided workflow for curating low-confidence examples, checking eval pool coverage, launching pool-based evaluations, or supervising automated prompt optimization. The backend contract in `docs/frontend-auto-prompt-optimizer-spec.md` defines this workflow; the frontend needs an OpenSpec-backed implementation plan before development starts.

## What Changes

- Add an authenticated `/optimizer` operator workspace, initially implemented as a single page with tabs for overview, review queue, pool evaluation, and history.
- Add Nuxt server proxy routes for optimizer-related backend APIs so the browser never sends Arbiter `X-API-Key` directly for this workflow.
- Add typed optimizer, eval pool, review queue, and pool evaluation request/response shapes in `types/api.ts`.
- Extend API access code with typed methods for eval pool stats, review queue mutations, pool-sourced evaluation, optimizer run start/cancel, and optimizer history.
- Add dense dashboard UI for eval pool coverage, active optimizer state, recent run history, per-round accuracy, and prompt version links.
- Add review queue workflow for confirm, correct, and reject actions with row-level pending state and stable filters.
- Add pool-sourced evaluation start flow using `POST /evaluate` with `source = "pool"` while preserving existing evaluation behavior.
- Add sidebar navigation entry for Auto Optimizer.
- Add focused tests for typed API behavior, server proxy behavior, and critical UI states.

## Capabilities

### New Capabilities

- `optimizer-api-proxy`: Nuxt server-side proxy routes for optimizer, eval pool, review queue, and pool evaluation APIs using private runtime config and normalized error handling.
- `optimizer-overview`: `/optimizer` overview dashboard with eval pool coverage, optimizer start controls, active run polling, cancellation, trend summary, and recent runs.
- `optimizer-review-queue`: Human review workflow for pending low-confidence relabeled cases, including confirm, correct, reject, filtering, and stale-row handling.
- `optimizer-pool-evaluation`: Pool-sourced evaluation launch flow using `source = "pool"` with empty-pool handling and links into existing evaluation history/jobs.
- `optimizer-history`: Optimizer run history and run detail view with round timeline, accuracy, failed case counts, kept flag, and prompt version links.

### Modified Capabilities

<!-- none; existing evaluation history behavior remains unchanged -->

## Impact

- **New files**: likely `pages/optimizer.vue`, optimizer-focused components under `components/optimizer/`, and Nuxt proxy routes under `server/api/arbiter/`.
- **Modified files**: `types/api.ts`, `composables/useApi.ts`, `components/AppSidebar.vue`, `nuxt.config.ts`, `.env.example`, and tests.
- **Security**: optimizer workflow must use private runtime config for backend API base/key in server routes; the browser must not receive the Arbiter API key for these calls.
- **No new dependencies required**: charts can be implemented with compact CSS/SVG primitives unless implementation discovers a stronger need.
- **Compatibility**: existing `/evaluate`, `/evaluate/history`, `/settings`, provider switching, and prompt activation flows remain unchanged except for new links.
