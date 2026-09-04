# Spec: Silent Failure Elimination

## Feature ID
`silent-failure-elimination`

## Summary
The dashboard currently swallows API failures in 14 `catch { /* silent */ }` blocks, and the
12 places that *do* surface errors each hand-roll `e instanceof Error ? e.message : '...'`,
which loses the backend's real message (`data.detail` / `data.message`) and shows the raw
ofetch text (`[POST] "/api/arbiter/config/rules/x": 500 Internal Server Error`) instead.
Two consequences are user-visible today: the Settings page can fail to load or save with
zero feedback, and the Cases page removes a row even when the DELETE request failed.

This feature introduces a project logger (the only sanctioned place for `console.*`), a
single API-error parser, and gives every existing catch an explicit disposition: **show**,
**log**, or **stop polling**. No catch may remain empty.

## Source doc
SA assessment 2026-09-04 (recommended feature #3 of 12);
CLAUDE.md §2 ("嚴禁 console.log()，請用統一的 logger utility").

## Scope

### In Scope
1. **`utils/logger.ts`** — four levels (`debug`, `info`, `warn`, `error`). On the client,
   `debug`/`info` are no-ops in production (`import.meta.dev === false`); `warn`/`error`
   always emit. Usable from Nitro server routes as well (no Vue/Nuxt imports). Internally
   calls `console.*` — this file is the sole permitted `console.*` call site and carries a
   comment saying so.
2. **`utils/apiError.ts`** — pure `parseApiError(e: unknown, fallback?: string)` returning
   `{ message: string; status: number | null }`. Message priority:
   1. `e.data.message` (ArbiterResponse error envelope)
   2. `e.data.detail` — string as-is; FastAPI 422 array (`{loc, msg}[]`) joined into
      `"<field>: <msg>"` lines
   3. `e.message` (ofetch `FetchError`, plain `Error`)
   4. `fallback` (default `'Request failed'`)

   `status` comes from `e.status` / `e.statusCode` / `e.response.status` when present.
   Thin `composables/useApiError.ts` re-exports it for auto-import ergonomics in pages.
3. **Replace `extractOptimizerError`** in `composables/useOptimizerWorkflow.ts` with
   `parseApiError(...).message`, and replace the 12 hand-rolled `instanceof Error` sites:
   `pages/cases.vue:79,100` · `pages/decisions.vue:49` ·
   `pages/evaluate/history/compare.vue:70` · `pages/evaluate/history/index.vue:52,66` ·
   `pages/evaluate/history/[run_id].vue:132,148` · `pages/evaluate/index.vue:141,192,212` ·
   `pages/index.vue:68`. The `'status' in e` casts at `pages/evaluate/index.vue:189`
   and `composables/useApi.ts:149,223` switch to `parseApiError(e).status`.
4. **Per-catch disposition** (one task + one AC each in `tasks.md`):

   | Site | Today | Disposition |
   |------|-------|-------------|
   | `pages/settings.vue:27` loadRules | silent | show error + Retry button |
   | `pages/settings.vue:53` loadProviders | silent | show error + Retry button |
   | `pages/settings.vue:97` loadPrompts | silent | show error + Retry button |
   | `pages/settings.vue:36` saveRule | silent | rollback rule value to pre-edit snapshot + show error |
   | `pages/settings.vue:65` selectProvider | silent | show error |
   | `pages/settings.vue:112` savePrompt | silent | show error (keep form content) |
   | `pages/settings.vue:124` activatePrompt | silent | show error |
   | `pages/cases.vue:107` deleteCase | `.catch(() => null)` then removes row | `confirm()` first; remove row only on success; show error on failure; clear error on next attempt |
   | `pages/index.vue:79` fetchRecent | silent | `logger.warn` (non-critical side panel) |
   | `pages/evaluate/index.vue:72` loadPrompts | silent | `logger.warn` + inline error next to Run button (Run is disabled when prompts are empty, so user must know why) |
   | `pages/evaluate/index.vue:81` loadProvider | silent | `logger.warn` |
   | `pages/evaluate/index.vue:89` loadHistory | silent | `logger.warn` |
   | `pages/evaluate/index.vue:268` initial jobs probe | silent | `logger.warn` |
   | `pages/evaluate/index.vue:160` job polling | silent, polls forever | `logger.warn`; after 5 consecutive failures stop polling and show "已暫停自動更新，點此重試" (click restarts polling) |
   | `pages/evaluate/history/[run_id].vue:124` run polling | silent, polls forever | same 5-failure stop + retry link |
   | `stores/useAuthStore.ts:31` logout | `.catch(() => null)` | `logger.warn`; still clear local `authenticated` (intentional — user asked to leave) |
   | `components/AppSidebar.vue:60` getProviders in pollStatus | silent, blanks provider | `logger.warn`; keep behaviour (status dot already reflects offline) |
   | `composables/useOptimizerWorkflow.ts:174` loadPrompts | `prompts.value = []` | `logger.warn` + empty list; no new UI |

   Sites that already surface an error correctly and only need the parser swap are listed
   in item 3; sites that are deliberate and stay as-is are listed in Out of Scope.
5. **Error UI** — Settings and Cases gain an inline error element with `role="alert"`,
   styled with existing tokens (`--danger`, `--danger-soft`, `--bg-tint-danger`), matching
   the `arb-cases__error` / `arb-eval__error` pattern already present. Polling-paused
   notices use `--warning` tokens. Scoped CSS only, no inline styles.
6. **Tests** — Vitest unit tests for `parseApiError` (ArbiterResponse envelope, FastAPI
   string detail, FastAPI 422 array, ofetch FetchError, plain Error, non-Error throw) and for
   `logger` level gating; a VTU test for `pages/settings.vue` proving saveRule rollback.

### Out of Scope
- `stores/useAuthStore.ts:22` (login → `'Authentication failed'`) and `:41` (check) — already
  produce the correct outcome; a global 401 interceptor belongs to `auth-hardening`.
- `components/AppSidebar.vue:50` (healthCheck → offline dot) and `:92` (selectProvider →
  `'Switch failed'`) — already surface state correctly. Message text may adopt
  `parseApiError` opportunistically but is not required.
- `composables/useApi.ts:148,222` — deliberate status-code mapping (cancel outcome, 404-as-
  deleted); only the status extraction changes.
- Toast/notification system, global error boundary, Sentry or remote log shipping.
- Exponential backoff for polling (explicitly not wanted; fixed interval + hard stop).
- Any server-side (`server/api/**`) change — proxy error shaping is `proxy-hardening`.
- Optimizer workspace error UI beyond swapping the parser (already has `globalError`).
- Removing the existing `useState('sidebar:*')` coupling between Settings and Sidebar.

## Architecture Decision

- **Pure util + thin composable.** `utils/apiError.ts` has no Vue imports so it is trivially
  unit-testable and usable from the server; `composables/useApiError.ts` is a one-line
  re-export so pages get auto-import. `utils/logger.ts` needs no composable (Nuxt auto-
  imports `utils/`).
- **No global error state.** Each page keeps its own `error` ref, as today. Introducing a
  toast store would be a new cross-cutting dependency for 14 sites; YAGNI until a third
  page needs transient notifications.
- **Polling stop is per-timer, not shared.** Both pollers get a local `consecutiveFailures`
  counter and a `pollingPaused` ref. Extracting a `usePolling` composable is deferred to
  `shared-polling-and-routes` (assessment item #5); this spec must not pre-empt it.
- **Rollback for saveRule is snapshot-based.** `saveRule` receives the rule after v-model
  already mutated it, so the pre-edit value comes from a `Map<string, Rule['value']>`
  captured on load and refreshed after each successful save. The template's
  `@change="saveRule(rule)"` contract is unchanged.
- **Cases delete confirmation uses `window.confirm`**, matching
  `pages/evaluate/history/[run_id].vue:141`. A modal component is out of scope.
- **Dependency note.** `auth-hardening` will add a global 401 handler in `useApi`. The two
  features touch different files (`useApi.ts` vs pages/utils) so they can merge in either
  order; the Developer should rebase on whichever lands first and confirm 401 still short-
  circuits to `/login` before page catches see it.

## Acceptance Criteria
See `tasks.md`.
