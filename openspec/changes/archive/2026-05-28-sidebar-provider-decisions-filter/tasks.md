## 1. Sidebar Provider Quick-Switch

- [x] 1.1 Add `providerDropdownOpen` ref (boolean) and `switchingProvider` ref (boolean) to `AppSidebar.vue`
- [x] 1.2 Add `switchError` ref (string | null) for inline error display in the footer
- [x] 1.3 Convert the provider status row into a button that toggles `providerDropdownOpen` when `!switchingProvider`
- [x] 1.4 Render an absolutely-positioned dropdown list of `available_providers` when `providerDropdownOpen` is true; highlight the active provider
- [x] 1.5 Implement `selectProvider(p: string)` — no-op if already active or switching; optimistically set `activeProvider.value = p`, close dropdown, call `api.setProvider(p)`; on error revert `activeProvider` and set `switchError`
- [x] 1.6 Add click-outside handler (document `mousedown` listener or VueUse `onClickOutside`) to close the dropdown
- [x] 1.7 Store `available_providers` list in a ref populated by `pollStatus()` (it already calls `getProviders()` — add `availableProviders.value = res.available_providers`)
- [x] 1.8 Style the dropdown (dark surface, mono font, hover highlight, active checkmark or bold); style the provider row button (cursor pointer, subtle hover); style `switchError` text in danger colour
- [x] 1.9 Hide/disable the dropdown trigger while `switchingProvider` is true

## 2. Decisions Time-Window Filter

- [x] 2.1 Add `activeWindow` ref (`ref<'1h' | '6h' | '24h' | '7d' | null>(null)`) to `pages/decisions.vue` — `null` = All
- [x] 2.2 Define `WINDOW_PRESETS` constant array: `[{ label: '1h', key: '1h', ms: 3_600_000 }, { label: '6h', key: '6h', ms: 21_600_000 }, { label: '24h', key: '24h', ms: 86_400_000 }, { label: '7d', key: '7d', ms: 604_800_000 }, { label: 'All', key: null, ms: 0 }]`
- [x] 2.3 Add `sinceParam` computed — returns `new Date(Date.now() - preset.ms).toISOString()` for timed presets, or `null` for All
- [x] 2.4 Update `load()` to pass `since: sinceParam.value` into `getDecisions()`
- [x] 2.5 Add `selectWindow(key)` function that sets `activeWindow.value = key`, resets `page.value = 0`, and calls `load()`
- [x] 2.6 Add the pill bar above the decisions table in the template — render one pill per preset, active pill highlighted, clicking calls `selectWindow(key)`
- [x] 2.7 Update the existing `watch(filterAction, ...)` to also reset `page.value = 0` (it already does this — verify it also re-runs `load()` which now includes `since`)
- [x] 2.8 Style pill bar (flex row, gap, pill shape with border-radius; active pill uses `--action-rebuild` border + bg-soft, inactive uses `--border` + transparent bg)
