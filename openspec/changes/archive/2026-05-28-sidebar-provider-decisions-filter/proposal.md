## Why

Two high-friction UX gaps slow down the daily workflow: switching provider requires navigating to Settings every time, and the Decisions page has no time filter despite the API supporting it — forcing users to scroll through all-time history to find recent CI/CD events.

## What Changes

- **Sidebar provider quick-switch**: The provider status row in the sidebar footer becomes an interactive dropdown. Clicking it shows the list of available providers; selecting one calls `PATCH /config/provider` immediately. No Settings navigation required.
- **Decisions time-window filter**: Add a time-window pill selector above the decisions table (1h / 6h / 24h / 7d / All). Selecting a window passes `since` to `GET /decisions`, scoping the result to that period. The active window is highlighted and persists during pagination.

## Capabilities

### New Capabilities

- `sidebar-provider-quick-switch`: Inline provider selector in sidebar footer — shows available providers, highlights active one, triggers `PATCH /config/provider` on selection, updates shared `sidebar:activeProvider` state immediately
- `decisions-time-filter`: Time-window pill bar above decisions table — presets 1h / 6h / 24h / 7d / All, passes computed `since` ISO timestamp to `GET /decisions`, resets pagination to page 0 on change, persists active window visually

### Modified Capabilities

_(none — both are new UI surfaces over existing API endpoints)_

## Impact

- `components/AppSidebar.vue` — sidebar footer provider row becomes a dropdown trigger
- `pages/decisions.vue` — new time-window pill bar, `since` param wired into `getDecisions()`
- `composables/useApi.ts` — no changes needed (`getDecisions` already accepts `since`)
- `types/api.ts` — no changes needed (`GetDecisionsParams` already has `since?: string | null`)
