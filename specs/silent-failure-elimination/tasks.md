# Tasks: Silent Failure Elimination

## Feature ID
`silent-failure-elimination`

---

## Task 1 — Logger utility
**File:** `utils/logger.ts` (new)

```typescript
type Level = 'debug' | 'info' | 'warn' | 'error'

// This is the ONLY file in the project allowed to call console.* directly.
// Everything else must go through `logger`.
export const logger: Record<Level, (msg: string, ...meta: unknown[]) => void>
```

- `debug` / `info`: no-op when `import.meta.dev === false` on the client.
- `warn` / `error`: always emit.
- No imports from `vue`, `#app`, or `h3` — must be importable from `server/**`.
- Prefix every line with `[arbiter]` so browser console filtering works.

### AC
- [ ] AC-1.1: **Given** `import.meta.dev` is `false`, **When** `logger.debug('x')` and
      `logger.info('x')` are called, **Then** `console.debug` / `console.info` are not invoked.
- [ ] AC-1.2: **Given** any environment, **When** `logger.warn('x', { a: 1 })` is called,
      **Then** `console.warn` receives `'[arbiter] x'` and the meta object.
- [ ] AC-1.3: `grep -rn "console\." --include=*.ts --include=*.vue pages components composables stores server utils middleware`
      returns matches only inside `utils/logger.ts`.
- [ ] AC-1.4: `tests/logger.test.ts` covers AC-1.1 and AC-1.2 using `vi.spyOn(console, ...)`.

---

## Task 2 — API error parser
**Files:** `utils/apiError.ts` (new), `composables/useApiError.ts` (new)

```typescript
export interface ParsedApiError {
  message: string
  status: number | null
}

export function parseApiError(e: unknown, fallback = 'Request failed'): ParsedApiError
```

Message priority: `e.data.message` → `e.data.detail` (string, or FastAPI 422 array
`{ loc: (string|number)[], msg: string }[]` joined as `"<last loc>: <msg>"` per line) →
`e.message` → `fallback`. Empty strings are treated as absent.
Status: first numeric of `e.status`, `e.statusCode`, `e.response.status`; else `null`.

`composables/useApiError.ts`:
```typescript
export { parseApiError } from '~/utils/apiError'
```

### AC
- [ ] AC-2.1: **Given** `{ data: { status: 'error', message: 'Rule not found' } }`,
      **When** parsed, **Then** `message === 'Rule not found'`.
- [ ] AC-2.2: **Given** `{ status: 422, data: { detail: [{ loc: ['body','value'], msg: 'must be > 0' }] } }`,
      **When** parsed, **Then** `message === 'value: must be > 0'` and `status === 422`.
- [ ] AC-2.3: **Given** `{ status: 409, data: { detail: 'Job already finished' } }`,
      **When** parsed, **Then** `message === 'Job already finished'` and `status === 409`.
- [ ] AC-2.4: **Given** `new Error('boom')`, **When** parsed, **Then** `message === 'boom'`,
      `status === null`.
- [ ] AC-2.5: **Given** a thrown string `'x'` or `undefined`, **When** parsed with fallback
      `'Load failed'`, **Then** `message === 'Load failed'`.
- [ ] AC-2.6: `tests/apiError.test.ts` covers AC-2.1 through AC-2.5.

---

## Task 3 — Replace hand-rolled error extraction
**Files:** `composables/useOptimizerWorkflow.ts`, `composables/useApi.ts`, `pages/cases.vue`,
`pages/decisions.vue`, `pages/evaluate/history/compare.vue`, `pages/evaluate/history/index.vue`,
`pages/evaluate/history/[run_id].vue`, `pages/evaluate/index.vue`, `pages/index.vue`

- Delete `extractOptimizerError` from `useOptimizerWorkflow.ts`; every former caller uses
  `parseApiError(e, '<same fallback text>').message`.
- Replace all 12 `e instanceof Error ? e.message : '...'` expressions with
  `parseApiError(e, '...').message`, keeping the existing fallback string.
- `pages/evaluate/index.vue:189` and `composables/useApi.ts:149,223`: read status via
  `parseApiError(e).status` instead of the inline `'status' in e` cast.
- `pages/evaluate/history/[run_id].vue:130-134`: `notFound` is set when `status === 404`
  (message sniffing for `'404'` / `'run-not-found'` is removed).

### AC
- [ ] AC-3.1: `grep -rn "instanceof Error" pages components composables stores` returns zero
      matches.
- [ ] AC-3.2: `grep -rn "extractOptimizerError" .` (excluding `specs/`) returns zero matches.
- [ ] AC-3.3: **Given** the backend returns `409 { detail: 'Job already finished' }` on
      cancel, **When** the user cancels from `/evaluate`, **Then** the visible error reads
      `Job already finished`, not `[POST] "/api/arbiter/…": 409 Conflict`.
- [ ] AC-3.4: **Given** `GET /evaluate/history/999` returns 404, **When** `/evaluate/history/999`
      loads, **Then** the not-found view renders (existing behaviour preserved via status).
- [ ] AC-3.5: `pnpm vue-tsc --noEmit` passes; existing tests in `tests/` still pass.

---

## Task 4 — Settings: load failures show error + Retry
**File:** `pages/settings.vue` (lines 27, 53, 97)

Add `rulesError`, `providersError`, `promptsError` refs (`string | null`). Each `loadX`
clears its error before the request and sets it from `parseApiError(e, 'Failed to load …')`
in `catch`. Each tab renders, when its error is set and not loading:

```html
<div class="arb-settings__error" role="alert">
  {{ rulesError }}
  <UiButton size="sm" variant="ghost" @click="loadRules">Retry</UiButton>
</div>
```

The `watch(activeTab)` guard (`rules.value.length === 0`) must not suppress a reload after
failure — Retry calls `loadX` directly.

### AC
- [ ] AC-4.1: **Given** `GET /config/rules` fails with 500, **When** the Rules tab mounts,
      **Then** an element with `role="alert"` containing the parsed message and a Retry
      button is visible, and the spinner is gone.
- [ ] AC-4.2: **Given** AC-4.1 state, **When** Retry is clicked and the request succeeds,
      **Then** the alert disappears and the rules list renders.
- [ ] AC-4.3: Same as AC-4.1/4.2 for the Providers tab (`GET /config/provider`).
- [ ] AC-4.4: Same as AC-4.1/4.2 for the Prompts tab (`GET /config/prompts`).

---

## Task 5 — Settings: saveRule rollback + error
**File:** `pages/settings.vue` (line 36)

- Keep `const ruleSnapshots = new Map<string, Rule['value']>()`; fill it in `loadRules`
  after a successful fetch, and update the entry after each successful `updateRule`.
- On failure: restore `rule.value` from the snapshot (find the rule in `rules.value` by
  name and assign, so the template re-renders), set `rulesError` via `parseApiError`.
- Snapshot must be a copy for object values (rule values may be JSON).

### AC
- [ ] AC-5.1: **Given** rule `auto_execute_threshold` loaded as `0.8`, **When** the user
      changes it to `0.9` and `PATCH /config/rules/auto_execute_threshold` fails,
      **Then** the input shows `0.8` again and an alert shows the parsed message.
- [ ] AC-5.2: **Given** the same rule, **When** the PATCH succeeds, **Then** a subsequent
      failed edit rolls back to `0.9` (snapshot refreshed on success).
- [ ] AC-5.3: `tests/settingsSaveRule.test.ts` mounts `pages/settings.vue` with `useApi`
      stubbed (`getRules` resolves, `updateRule` rejects), triggers the change, and asserts
      AC-5.1 (value restored, `[role="alert"]` present).

---

## Task 6 — Settings: provider / prompt actions show error
**File:** `pages/settings.vue` (lines 65, 112, 124)

- `selectProvider` failure → `providersError` (previous `providerInfo` untouched).
- `savePrompt` failure → `promptsError`; `promptForm.label` / `content` are **not** cleared.
- `activatePrompt` failure → `promptsError`; `prompts[].active` unchanged.
- Each action clears its tab error at start.

### AC
- [ ] AC-6.1: **Given** `PATCH /config/provider` fails, **When** the user picks another
      provider, **Then** the alert shows and the active provider badge still shows the old one.
- [ ] AC-6.2: **Given** `POST /config/prompts` fails, **When** the user clicks Save,
      **Then** the alert shows and the label and content fields keep their text.
- [ ] AC-6.3: **Given** `PATCH /config/prompts/{id}/activate` fails, **When** Activate is
      clicked, **Then** the alert shows and no prompt's active flag changes.

---

## Task 7 — Cases: confirmed delete, no optimistic removal
**File:** `pages/cases.vue` (lines 106-109, 210)

```typescript
const deleteError = ref<string | null>(null)
async function deleteCase(id: number) {
  if (!window.confirm(`Delete case #${id}?`)) return
  deleteError.value = null
  try {
    await api.deleteCase(id)
    cases.value = cases.value.filter(c => c.id !== id)
    casesTotal.value = Math.max(0, casesTotal.value - 1)
  } catch (e) {
    deleteError.value = parseApiError(e, 'Delete failed').message
  }
}
```

Render `deleteError` above the list with `role="alert"` using the existing
`arb-cases__error` styling.

### AC
- [ ] AC-7.1: **Given** the user clicks ✕ on a case, **When** they cancel the confirm
      dialog, **Then** no request is sent and the row stays.
- [ ] AC-7.2: **Given** the user confirms, **When** `DELETE /cases/{id}` fails, **Then**
      the row stays, an alert shows the parsed message, and the counter is unchanged.
- [ ] AC-7.3: **Given** AC-7.2 state, **When** the user confirms a second delete that
      succeeds, **Then** the alert is cleared and the row is removed.

---

## Task 8 — Non-critical loads log a warning
**Files:** `pages/index.vue:79`, `pages/evaluate/index.vue:72,81,89,268`,
`stores/useAuthStore.ts:31`, `components/AppSidebar.vue:60`,
`composables/useOptimizerWorkflow.ts:174`

- Replace each empty catch with `catch (e) { logger.warn('<context>', parseApiError(e)) }`
  where `<context>` names the call (e.g. `'analyze: recent decisions failed'`).
- `pages/evaluate/index.vue` `loadPrompts` additionally sets `promptsError` rendered under
  the Run button: `<div class="arb-eval__error" role="alert">{{ promptsError }}</div>`.
- `useAuthStore.logout`: log the warning, still set `authenticated = false`.
- `AppSidebar.pollStatus`: log, keep the existing `activeProvider = null` behaviour.

### AC
- [ ] AC-8.1: `grep -rn "catch {\s*/\*\|catch { }\|\.catch(() => null)" pages components composables stores`
      returns zero matches.
- [ ] AC-8.2: **Given** `GET /config/prompts` fails on `/evaluate`, **When** the page mounts,
      **Then** an alert under the Run button explains why the Run button is disabled.
- [ ] AC-8.3: **Given** `POST /api/auth/logout` fails, **When** the user logs out,
      **Then** `logger.warn` is called once and the user still lands on `/login`.

---

## Task 9 — Polling stops after repeated failure
**Files:** `pages/evaluate/index.vue:148-162`, `pages/evaluate/history/[run_id].vue:113-125`

Per poller:
```typescript
const pollFailures = ref(0)
const pollingPaused = ref(false)
const MAX_POLL_FAILURES = 5
```
- Success resets `pollFailures` to 0.
- Failure: `logger.warn(...)`, increment; when it reaches `MAX_POLL_FAILURES`, `stopPolling()`
  and set `pollingPaused = true`.
- Template shows, when paused:
  `<button class="arb-eval__poll-paused" role="alert" @click="resumePolling">已暫停自動更新，點此重試</button>`
  `resumePolling` resets the counter, clears `pollingPaused`, restarts the interval with the
  same run id. No backoff — fixed interval.
- `onUnmounted` still clears the timer.

### AC
- [ ] AC-9.1: **Given** an active eval job on `/evaluate`, **When** `GET /evaluate/jobs`
      fails 5 times in a row, **Then** no further requests are made and the paused notice
      is visible.
- [ ] AC-9.2: **Given** AC-9.1, **When** the notice is clicked and the next poll succeeds,
      **Then** polling continues and the notice disappears.
- [ ] AC-9.3: **Given** 4 failures then 1 success, **When** 4 more failures occur,
      **Then** polling is still active (counter reset on success).
- [ ] AC-9.4: Same as AC-9.1/9.2 on `/evaluate/history/{run_id}` for a running run.
- [ ] AC-9.5: A Vitest test with `vi.useFakeTimers()` covers AC-9.1 and AC-9.3 for at least
      one of the two pages.

---

## Task 10 — Error element styling
**Files:** `pages/settings.vue`, `pages/cases.vue`, `pages/evaluate/index.vue`,
`pages/evaluate/history/[run_id].vue` (scoped `<style>`)

- `.arb-settings__error`: `color: var(--danger)`, `background: var(--bg-tint-danger)`,
  `border: 1px solid var(--danger-soft)`, `border-radius: var(--r-md)`, flex row with the
  Retry button right-aligned.
- `.arb-eval__poll-paused` / `.arb-run__poll-paused`: `--warning` tokens, cursor pointer,
  full-width button reset.
- No inline `style=""` added by this feature.

### AC
- [ ] AC-10.1: `grep -n 'style="' pages/settings.vue pages/cases.vue` shows no new inline
      styles compared with `main` (count must not increase).
- [ ] AC-10.2: All new error / paused elements carry `role="alert"`.
- [ ] AC-10.3: Colours reference only `var(--…)` tokens from `assets/css/design-tokens.css`.

---

## Task 11 — Handoff
**File:** `specs/silent-failure-elimination/handoff-dev.json`

- `changed_files` lists every file touched in Tasks 1–10 plus the three new test files.
- `ac_ref` points to this file.
- Notify orchestrator to spawn **codex-reviewer** (not QA).

### AC
- [ ] AC-11.1: `pnpm vue-tsc --noEmit`, `pnpm exec vitest run`, and `pnpm build` all pass.
- [ ] AC-11.2: `handoff-dev.json` exists with `status: "ready"` and a complete `changed_files`.
