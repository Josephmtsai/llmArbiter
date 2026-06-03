## Context

The app is a Nuxt 3 SSR dashboard with strict TypeScript, Pinia, Tailwind design tokens, and existing typed API access in `composables/useApi.ts`. Current API calls use `runtimeConfig.public.apiBase` and `runtimeConfig.public.apiKey`, while the Auto Prompt Optimizer frontend spec explicitly requires optimizer workflow calls to go through Nuxt server proxy routes so the Arbiter API key is not exposed to browser JavaScript.

The source feature spec is `docs/frontend-auto-prompt-optimizer-spec.md`. It defines four operator workflows: optimizer overview, review queue, pool-sourced evaluation, and optimizer history. The first implementation can combine these under one `/optimizer` page with tabs, which is lower risk than introducing four new route files at once.

Graphify impact query was attempted before design work, but `graphify-out/graph.json` does not exist in this workspace. Impact analysis therefore uses README, the source feature spec, existing OpenSpec examples, and local files such as `types/api.ts`, `composables/useApi.ts`, `components/AppSidebar.vue`, `nuxt.config.ts`, and existing evaluation pages.

## Goals / Non-Goals

**Goals:**

- Deliver an authenticated operator workspace at `/optimizer` with overview, review queue, pool evaluation, and history tabs.
- Keep optimizer backend credentials server-only by routing optimizer feature calls through Nuxt server API files.
- Add strict TypeScript types for all new request and response shapes.
- Preserve existing evaluation, prompt activation, provider switching, and history pages.
- Provide deterministic loading, empty, error, mutation, polling, and cancellation states.
- Keep UI dense, scannable, and aligned with existing dashboard components.

**Non-Goals:**

- Rewriting all existing API access to server proxy routes.
- Building dataset import, prompt diffing, or prompt activation inside the optimizer page.
- Adding a charting dependency.
- Changing backend endpoint behavior or OpenAPI generation.
- Auto-activating generated prompt versions.

## Decisions

### D1: One `/optimizer` page with tabs for the first implementation

**Choice**: Implement the feature as `pages/optimizer.vue` with tabs for Overview, Review Queue, Pool Evaluation, and History.

**Rationale**: The source spec allows combining routes for the first implementation. A single page reduces navigation and state coordination complexity while still preserving distinct UI sections and acceptance criteria.

**Alternative considered**: Create `/optimizer`, `/optimizer/review-queue`, `/optimizer/evaluations`, and `/optimizer/history` immediately. This is more bookmarkable, but it adds routing and duplicated fetch state before the workflow has stabilized.

### D2: Optimizer API calls use Nuxt server proxy routes

**Choice**: Add server routes under `server/api/arbiter/` for eval pool stats, review queue, pool evaluation, optimizer run start, optimizer history, and optimizer run cancellation. These routes read private `runtimeConfig.apiBaseUrl` and `runtimeConfig.apiKey`, forward `X-API-Key` server-side, preserve backend status codes, and normalize error shapes for the page.

**Rationale**: This satisfies the feature spec's security requirement without forcing a risky whole-app API migration. Browser JavaScript calls only `/api/arbiter/...` for optimizer workflows.

**Alternative considered**: Extend the existing public `useApi()` client to call backend endpoints directly. This is simpler but violates the optimizer spec because it exposes the API key to the browser.

### D3: Keep optimizer API methods separate from legacy direct backend calls

**Choice**: Add optimizer methods to `useApi()` that call local Nuxt proxy URLs, while existing methods continue using their current pattern unless a future migration changes them.

**Rationale**: The rest of the app already depends on the current direct API contract. Scoping the proxy to optimizer calls keeps this change implementable and testable.

**Alternative considered**: Create a second composable such as `useArbiterProxyApi()`. This separates concerns, but it would make callers remember which composable owns which Arbiter feature. Keeping typed methods in `useApi()` matches current project usage.

### D4: Poll optimizer history only while active runs exist

**Choice**: Fetch `/optimizer/history` on page load and poll every 3 seconds only when any run has `status = "running"`. Stop polling when all runs are terminal: `completed`, `completed_max_rounds`, `failed`, or `cancelled`. A cancelled request can return `cancelling`; the UI remains in a running-like state until history reports a terminal status.

**Rationale**: This matches backend behavior and avoids unnecessary polling after runs finish.

**Alternative considered**: Poll continuously while the page is open. This is simpler but wastes requests and makes tests more brittle.

### D5: Charts use lightweight CSS/SVG primitives

**Choice**: Render action coverage bars and accuracy trends with CSS grid/flex and simple SVG polylines.

**Rationale**: Data volumes are small and the dashboard already has tokenized CSS. Avoiding a dependency keeps bundle size and SSR complexity low.

**Alternative considered**: Add Chart.js or ECharts. These are unnecessary for compact trend and coverage views.

### D6: Prompt activation remains in existing settings flow

**Choice**: Optimizer history links generated prompt version IDs to the existing prompt management surface when possible. It does not activate prompts directly.

**Rationale**: Generated prompt versions are inactive by design. Activation should remain a deliberate operator action in the established prompt workflow.

**Alternative considered**: Add an Activate button beside each optimizer round. This would duplicate settings behavior and increase risk of accidental activation.

## Risks / Trade-offs

- **Backend deployment may not expose every endpoint yet** -> Keep proxy errors visible, preserve status codes, and include backend readiness checks in QA tasks.
- **Runtime config names differ between README and feature spec** -> Add private `apiBaseUrl` and `apiKey` while preserving existing public config. Document the mapping in `.env.example`.
- **One-page tab implementation is less bookmarkable** -> Use stable tab state and keep component boundaries clean so separate routes can be introduced later.
- **Polling can leak timers** -> Use lifecycle cleanup and test that polling stops when terminal statuses are returned.
- **Review queue correction can submit invalid actions** -> Use typed action options and client validation before sending `action = "correct"`.
- **Graphify impact data unavailable** -> Record the absence in SA handoff and require Developer to rerun graphify if the graph is later generated.

## Migration Plan

1. Add private runtime config entries and `.env.example` variables for server proxy access.
2. Add Nuxt server proxy routes and tests before wiring UI calls.
3. Add new types and typed API methods.
4. Build `/optimizer` UI tabs and navigation.
5. Verify with `pnpm vue-tsc`, targeted Vitest tests, and a browser smoke check.

Rollback is low risk: remove the `/optimizer` route, sidebar item, proxy routes, and new methods/types. Existing evaluation and settings flows are not changed by the runtime path.

## Open Questions

- Confirm the backend deployment returns `400 detail = "eval-pool-empty"` for empty pool evaluation.
- Confirm `GET /review-queue` returns only pending entries and sorts by confidence.
- Confirm `GET /optimizer/history` includes active runs while they are running.
- Confirm whether generated prompt version IDs can link directly to a prompt detail section or only to `/settings`.
