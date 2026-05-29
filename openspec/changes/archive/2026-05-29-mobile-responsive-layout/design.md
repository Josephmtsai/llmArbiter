## Context

The layout is a horizontal flex row: `AppSidebar` (240 px, `position: sticky`) + `arb-shell__main` (flex: 1). On a 375 px viewport the sidebar consumes 64% of the screen. All page containers use hardcoded `padding: 28px 32px`. Tables use `overflow-x: auto` on their wraps (most already do).

No existing mobile CSS exists. No external component library handles responsiveness.

## Goals / Non-Goals

**Goals:**
- Navigation accessible on mobile via a slide-in drawer triggered from a hamburger icon in `AppTopBar`
- Page content fills the full viewport width on mobile
- Tables remain horizontally scrollable (already mostly working — verify and complete)
- All interaction (evaluate, analyze, settings) works on mobile without layout breakage

**Non-Goals:**
- Custom mobile-first page redesigns (e.g., replacing tables with card lists)
- Touch gesture swipe-to-open sidebar (out of scope — tap-to-toggle is sufficient)
- Tablet-specific breakpoints (768 px is the only breakpoint)
- PWA / app shell (out of scope)

## Decisions

### Shared state: `useState('mobile:sidebarOpen')`

Both `AppTopBar` (writes: hamburger click) and `AppSidebar` (reads: open/close, close button) and `layouts/default.vue` (reads: overlay) need the same boolean. Nuxt's `useState` is the simplest shared reactive state that requires no Pinia store.

**Alternative**: Pinia store or event bus — rejected; `useState` is lighter for a single boolean.

### Sidebar drawer: CSS `transform: translateX` + `transition`

On mobile the sidebar gets `position: fixed; left: 0; top: 0; height: 100dvh; width: 240px; z-index: 200`. When closed: `transform: translateX(-100%)`. When open: `transform: translateX(0)`. Transition: `transform 250ms ease`. The sidebar already has `overflow: visible` (for the provider dropdown) — this is preserved.

**Alternative**: `v-if` / `display: none` — rejected; loses the slide animation and causes DOM thrash.

### Overlay backdrop: in `layouts/default.vue`

A full-screen `<div class="arb-shell__overlay">` is conditionally rendered in the layout when `sidebarOpen` is true on mobile. `z-index: 199` (below sidebar at 200). Tap closes the drawer. Rendered via `v-if` (not `v-show`) to keep it out of the DOM on desktop.

### Page padding: CSS custom property `--page-pad`

Add `--page-pad: 28px 32px` to `:root` in `design-tokens.css` and override to `16px` at `@media (max-width: 767px)`. Replace hardcoded `padding: 28px 32px` in each page's root container class with `padding: var(--page-pad)`. This is a single grep-and-replace across ~8 page files.

**Alternative**: Tailwind responsive classes — project uses Tailwind but page containers use scoped CSS classes, not utility classes. Staying consistent with the existing pattern.

### Hamburger icon: left of title in AppTopBar, mobile-only

A `Menu` icon (lucide) appears before the title block on `< 768px`. It calls `sidebarOpen = !sidebarOpen` on click. Hidden via `display: none` on desktop. The close `✕` button inside the sidebar is shown only on mobile.

## Risks / Trade-offs

- [Sidebar overflow: visible on mobile] The provider dropdown in the sidebar uses `position: absolute; bottom: 100%`. With the sidebar as `position: fixed`, the dropdown will still render correctly relative to the sidebar — no change needed.
- [iOS momentum scroll on tables] Adding `-webkit-overflow-scrolling: touch` ensures tables scroll smoothly on Safari/iOS — low risk, pure enhancement.
- [z-index stacking] Sidebar at 200, overlay at 199, TopBar at 10 (existing `z-index: 10`) — no conflicts. The TopBar is inside `arb-shell__main` which is behind the overlay on mobile.
