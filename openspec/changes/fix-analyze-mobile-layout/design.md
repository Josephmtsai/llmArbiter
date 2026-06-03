## Context

`pages/index.vue` defines the Analyze page with a scoped CSS-only layout. The grid uses `grid-template-columns: minmax(0, 1fr) 360px` and several horizontal flex rows. There are no responsive breakpoints, so on viewports ≤ 768 px the fixed 360 px right column either overflows the viewport or collapses the left column below usable width.

The codebase uses scoped `<style>` blocks with CSS custom properties; Tailwind utility classes are used for some components but the page-level layout in `index.vue` is vanilla CSS. The fix stays in the scoped style block.

## Goals / Non-Goals

**Goals:**
- Single-column stacked layout on mobile (≤ 768 px)
- `input-row` (Failures field + Analyze button) wraps to column on mobile
- `result-header` (ActionBadge + meta) wraps on mobile
- Right rail appears full-width below left column on mobile
- No script or template changes

**Non-Goals:**
- Tablet-specific intermediate breakpoints (out of scope)
- Responsive changes to other pages
- Accessibility or theming improvements

## Decisions

**Breakpoint: `max-width: 768px`**
Chosen to cover typical phones in portrait and small landscape. The existing `OptimizerHistory` component uses `max-width: 900px` as its breakpoint; 768 px is appropriate here since the Analyze right rail (360 px) fits on wider tablets.

**CSS approach: add `@media` block to existing scoped style**
Alternative was to add Tailwind responsive classes to template. Rejected — the layout is already in CSS and adding `sm:` prefixes would require touching the template and mixing approaches.

**`input-row` on mobile → column, reverse order (button on top)**
On mobile the primary CTA ("Analyze") should be immediately visible; field below. Achieved with `flex-direction: column-reverse`.

## Risks / Trade-offs

- [Very narrow phones < 320 px] → `UiActionBadge` with long action names may still wrap oddly. Mitigation: `flex-wrap: wrap` on result-header already handles this.
- [No tablet breakpoint] → 769–900 px range keeps two columns; right rail may feel narrow. Acceptable for now per Non-Goals.
