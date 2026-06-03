## Why

The Analyze page (`pages/index.vue`) uses a rigid two-column CSS grid and several horizontal flex rows with no mobile breakpoints, causing the right rail to overflow or collapse the left column on viewports narrower than ~800 px. Users on mobile or tablet cannot comfortably input a log snippet or read results.

## What Changes

- Add `@media (max-width: 768px)` breakpoints to `.arb-analyze` to stack the two columns vertically on mobile
- Stack `.arb-analyze__input-row` (Failures 24h field + Analyze button) to column layout on mobile
- Stack `.arb-analyze__result-header` (ActionBadge + meta chips) on mobile
- Ensure the right rail (recent decisions, confidence routing) renders full-width below the left column on mobile
- No changes to logic, API calls, or component hierarchy

## Capabilities

### New Capabilities
- `analyze-mobile-responsive`: Responsive CSS breakpoints for the Analyze page so it renders correctly on mobile/tablet devices

### Modified Capabilities
<!-- none — only layout CSS changes, no spec-level behavior changes -->

## Impact

- `pages/index.vue` — scoped `<style>` block only; no script or template changes
- No API changes, no type changes, no other files affected
