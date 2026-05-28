## Context

`AppSidebar.vue` already calls `getProviders()` on every route change via `pollStatus()` and writes to shared `useState('sidebar:activeProvider')`. The provider row in the footer currently displays a static text label. `pages/decisions.vue` calls `getDecisions()` on mount and on `filterAction` change, but the `since`/`until` params in `GetDecisionsParams` are never used by the UI.

Both changes are additive: no existing behaviour is removed, no new API endpoints are needed.

## Goals / Non-Goals

**Goals:**
- Sidebar footer provider row: click opens an inline dropdown listing `available_providers`; selecting one calls `setProvider()` and updates shared state
- Sidebar closes the dropdown on outside-click and on successful provider switch
- Decisions page: pill bar with 5 presets (1h, 6h, 24h, 7d, All); selection resets page to 0 and re-fetches with `since` set to `new Date(Date.now() - ms).toISOString()`; "All" omits `since`

**Non-Goals:**
- Custom date-range picker (only presets)
- Provider switch confirmation dialog (instant apply)
- Persisting selected time window across sessions (session-local only)
- `until` param (always now)

## Decisions

### Sidebar dropdown: inline div, not a `<select>`

A native `<select>` is hard to style consistently. An absolutely-positioned `<div>` list matches the existing sidebar aesthetic (dark surface, mono font). Click-outside closes via `onClickOutside` composable from VueUse — or a simple document `click` listener in `onMounted`/`onUnmounted`.

**Alternative**: Navigate to Settings → Provider tab — rejected; too many clicks, destroys the current page context.

### Sidebar: optimistic UI on provider switch

On click, set `activeProvider.value = selected` immediately (optimistic), then call `setProvider()`. On error, revert to previous value and show a brief inline error in the dropdown. This makes the switch feel instant.

**Alternative**: Wait for API response — rejected; feels slow, introduces a loading state in the sidebar footer.

### Decisions time filter: `since` computed from preset, not stored as Date

Store the active preset key (`'1h' | '6h' | '24h' | '7d' | null`) as a `ref`. Derive `since` as a computed: `preset ? new Date(Date.now() - PRESET_MS[preset]).toISOString() : null`. Pass this to `getDecisions()`. Simple, testable, no Date object serialisation issues.

### Decisions: reset page on window change

Changing the time window always resets `page.value = 0` before re-fetching, preventing stale pagination offsets on a smaller result set.

## Risks / Trade-offs

- [Optimistic provider switch] If `setProvider()` fails (backend unreachable), the sidebar briefly shows the wrong provider — mitigation: revert `activeProvider` in the catch block and show inline error text
- [Sidebar dropdown z-index] Dropdown must float above page content — mitigation: use `position: fixed` with sidebar-width offset, or `position: absolute` on the sidebar container which already has `overflow: visible`
- [Time window + action filter combination] Both filters apply together via `getDecisions({ action, since })` — the API supports this natively, no extra handling needed
