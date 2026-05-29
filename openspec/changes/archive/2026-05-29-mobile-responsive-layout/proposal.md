## Why

The current layout pins a 240 px sidebar permanently on screen, leaving only ~135 px of usable width on a 375 px phone. All page padding and table layouts assume a desktop viewport, making the dashboard nearly unusable on mobile. As an internal CI/CD monitoring tool the primary users are engineers who check status on their phones.

## What Changes

- **Sidebar collapses on mobile**: below 768 px the sidebar is hidden by default and slides in as a full-height overlay when the hamburger icon is tapped; an overlay backdrop closes it on tap-outside
- **Hamburger icon in AppTopBar**: a `☰` icon appears on the left of the top bar only on mobile (`< 768px`); clicking it toggles the sidebar drawer via `useState('mobile:sidebarOpen')`
- **AppSidebar becomes a drawer on mobile**: uses `position: fixed` + `transform: translateX` on mobile; `position: sticky` + normal flow on desktop; close button inside the sidebar on mobile
- **Page padding reduced on mobile**: all page containers switch from `28px 32px` to `16px` at `< 768px`; done via a single CSS custom property `--page-pad` set in `:root` and overridden in a media query
- **Tables horizontally scrollable**: all `*__table-wrap` containers already have `overflow-x: auto`; verify and add where missing; add `-webkit-overflow-scrolling: touch` for smooth iOS scroll
- **AppTopBar action area wraps on mobile**: action buttons stack or shrink below 480 px so they don't overflow the header

## Capabilities

### New Capabilities

- `mobile-nav-drawer`: sidebar becomes a slide-in drawer on mobile (< 768 px) controlled by a hamburger toggle in AppTopBar and closed by tap-outside or the ✕ close button inside the drawer

### Modified Capabilities

_(no spec-level requirement changes to existing capabilities — all changes are CSS/layout implementation details)_

## Impact

- `layouts/default.vue` — add overlay backdrop element; pass open state
- `components/AppSidebar.vue` — drawer behaviour on mobile (fixed position, transform, close button, `mobile:sidebarOpen` shared state)
- `components/AppTopBar.vue` — hamburger icon on mobile, reads/writes `mobile:sidebarOpen`
- All page `.vue` files — `--page-pad` CSS variable replaces hardcoded `padding: 28px 32px`; changes are CSS-only, no logic impact
- No API or type changes
