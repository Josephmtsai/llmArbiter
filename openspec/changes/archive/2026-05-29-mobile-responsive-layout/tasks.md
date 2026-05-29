## 1. Global CSS Foundation

- [x] 1.1 Add `--page-pad: 28px 32px` to `:root` in `assets/css/design-tokens.css`
- [x] 1.2 Add `@media (max-width: 767px) { :root { --page-pad: 16px; } }` in `design-tokens.css`

## 2. Shared Drawer State

- [x] 2.1 In `components/AppSidebar.vue` add `const sidebarOpen = useState('mobile:sidebarOpen', () => false)` and watch `route.path` to set `sidebarOpen.value = false` on navigation (closes drawer after link tap)

## 3. AppTopBar — Hamburger Icon

- [x] 3.1 Import `Menu` icon from `lucide-vue-next` in `AppTopBar.vue`
- [x] 3.2 Add `const sidebarOpen = useState('mobile:sidebarOpen', () => false)` to `AppTopBar.vue` script
- [x] 3.3 Add hamburger `<button>` before `.arb-topbar__title-block` in the template; clicking sets `sidebarOpen.value = !sidebarOpen.value`
- [x] 3.4 Add CSS: `.arb-topbar__hamburger { display: none }` on desktop; `@media (max-width: 767px) { .arb-topbar__hamburger { display: flex } }`

## 4. AppSidebar — Drawer Behaviour

- [x] 4.1 Add `const sidebarOpen = useState('mobile:sidebarOpen', () => false)` to `AppSidebar.vue` (already added in 2.1 — verify it's present)
- [x] 4.2 Add mobile-only ✕ close button inside the sidebar (shown only on mobile); clicking sets `sidebarOpen.value = false`
- [x] 4.3 Add CSS for mobile sidebar: `@media (max-width: 767px) { .arb-sidebar { position: fixed; left: 0; top: 0; height: 100dvh; z-index: 200; transform: translateX(-100%); transition: transform 250ms ease; } .arb-sidebar--open { transform: translateX(0); } }`
- [x] 4.4 Bind `:class="{ 'arb-sidebar--open': sidebarOpen }"` to the sidebar `<aside>` element

## 5. Layout — Overlay Backdrop

- [x] 5.1 Add `const sidebarOpen = useState('mobile:sidebarOpen', () => false)` to `layouts/default.vue`
- [x] 5.2 Add `<div v-if="sidebarOpen" class="arb-shell__overlay" @click="sidebarOpen = false" />` inside `.arb-shell` before `AppSidebar`
- [x] 5.3 Add CSS: `.arb-shell__overlay { display: none } @media (max-width: 767px) { .arb-shell__overlay { display: block; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 199; } }`

## 6. Page Padding — Replace Hardcoded Values

- [x] 6.1 Replace `padding: 28px 32px` with `padding: var(--page-pad)` in `pages/index.vue` (`.arb-analyze`)
- [x] 6.2 Replace in `pages/decisions.vue` (`.arb-decisions`)
- [x] 6.3 Replace in `pages/cases.vue` (`.arb-cases`)
- [x] 6.4 Replace in `pages/evaluate/index.vue` (`.arb-eval`)
- [x] 6.5 Replace in `pages/evaluate/history/index.vue` (`.arb-history`)
- [x] 6.6 Replace in `pages/evaluate/history/[run_id].vue` (`.arb-detail`)
- [x] 6.7 Replace in `pages/evaluate/history/compare.vue` (root padding container if present)
- [x] 6.8 Replace in `pages/settings.vue` (`.arb-settings`)

## 7. Table Horizontal Scroll — Verify and Complete

- [x] 7.1 Verify `pages/decisions.vue` `.arb-decisions__table-wrap` has `overflow-x: auto; -webkit-overflow-scrolling: touch`
- [x] 7.2 Verify `pages/evaluate/history/index.vue` `.arb-history__table-wrap` — add `-webkit-overflow-scrolling: touch` if missing
- [x] 7.3 Verify `pages/evaluate/history/[run_id].vue` `.arb-detail__table-wrap` — add `-webkit-overflow-scrolling: touch` if missing
- [x] 7.4 Verify `pages/evaluate/index.vue` `.arb-eval__table-wrap` — add `-webkit-overflow-scrolling: touch` if missing
