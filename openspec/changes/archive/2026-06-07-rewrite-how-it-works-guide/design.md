## Context

`pages/guide.vue` is a single 874-line SFC that owns all data, markup, and styles for the "How it works" page. It contains static data arrays (pool stats, flow steps, lane nodes) which are currently out of date and lacks any interactive tooltip layer or dedicated diagram components. All content changes are pure frontend — no API changes, no route changes, no store involvement.

The source of truth for the rewrite is `docs/frontend-auto-prompt-optimizer-spec.md`, section "How Auto Prompt Optimization Works", which provides exact numbers, formulas, tooltip copy, and round-state label rules.

## Goals / Non-Goals

**Goals:**
- Update all pool/split/snapshot numbers to the June 2026 pool
- Add the two-gate keep/reject explanation with tolerance table and worked examples
- Add four round-state descriptions with visual styles matching the badges used in `OptimizerHistory`
- Add an inline tooltip component for six key metric terms
- Add two inline diagrams: (a) optimizer loop with both gates, (b) data split with snapshot sizes
- Match existing design-token vocabulary (CSS variables, BEM class pattern, `UiCard`, `UiEyebrow`)

**Non-Goals:**
- Dynamic data from API — the guide page is purely static/educational
- Animation or interactive diagrams
- Changes to any other page or component outside `pages/guide.vue` and new `components/guide/` components
- Changes to the History view itself (separate concern)

## Decisions

### 1. New child components in `components/guide/`

**Decision:** Extract the tooltip, optimizer loop diagram, and data split diagram into dedicated components (`GuideTooltip.vue`, `GuideLoopDiagram.vue`, `GuideSplitDiagram.vue`).

**Rationale:** `guide.vue` is already 874 lines with all logic inline. Adding SVG diagrams and tooltip logic inline would push it past 1,200 lines. The Composition API + auto-import pattern makes extraction cheap. Components under `components/guide/` are auto-imported and scoped.

**Alternative considered:** Inline everything in `guide.vue`. Rejected — violates the 300-line component guideline and makes the diagram markup hard to read mid-page.

### 2. Tooltip as a wrapper `<span>` with CSS-only hover panel (no third-party lib)

**Decision:** `GuideTooltip.vue` renders `<span class="g-tooltip">` wrapping the term text, with an absolutely-positioned `::after`-free sibling `<span class="g-tooltip__panel">` shown on `:hover / :focus-within`.

**Rationale:** No new dependency, consistent with the project's CSS-only interaction patterns (e.g. `<details>` for expand/collapse). Tooltip text is short (1–2 sentences) so no overflow issues. Accessible via `role="tooltip"` + `aria-describedby`.

**Alternative considered:** `@floating-ui/vue`. Rejected — overkill for static text labels; adds a dependency for a feature that can be done with 20 lines of CSS.

### 3. Diagrams as Vue template markup (CSS grid / flex boxes), not SVG

**Decision:** Both diagrams (`GuideLoopDiagram`, `GuideSplitDiagram`) are built from styled `<div>` and `<span>` elements with CSS arrows (borders/pseudo-elements), not raw `<svg>`.

**Rationale:** Matches how the existing flow diagram in `guide.vue` is implemented (lanes + nodes via CSS grid). Responsive behavior is easier with CSS grid than SVG `viewBox` scaling. The diagrams are informational, not precision graphics.

**Alternative considered:** Inline `<svg>`. Rejected — harder to maintain, less responsive, requires separate font handling.

### 4. Keep/reject gate rendered as a two-block visual within the page, not a separate component

**Decision:** The gate section renders directly in `guide.vue` using a new `arb-guide__gate-grid` layout — two side-by-side cards (Gate 1: overall, Gate 2: per-action) with a tolerance table inside Gate 2.

**Rationale:** It's one layout block with no reuse elsewhere. Keeping it inline keeps the data (tolerance values) colocated with the markup and avoids a prop-passing overhead for essentially static content.

### 5. Round state badges reuse the same CSS classes as `OptimizerHistory`

**Decision:** The round states section uses `.optimizer-history__kept-badge` and its modifiers (`--kept`, `--rejected`, `--skipped`) directly.

**Rationale:** Visual consistency — an operator reading the guide should see the exact same badge style as in the History view. Avoids creating duplicate CSS for identical visual elements.

**Alternative considered:** New guide-specific badge classes. Rejected — divergence would confuse operators.

## Risks / Trade-offs

- [Risk] Tolerance values (2% / 5%) are hardcoded in the guide. If backend tolerance config changes, the guide becomes stale. → Mitigation: values are sourced directly from the spec; note in code comment that they match `optimizer.py` defaults.
- [Risk] `GuideTooltip` CSS-only approach can clip near viewport edges on small screens. → Mitigation: use `left: 50%; transform: translateX(-50%)` + `max-width: min(280px, 90vw)` so panel stays in viewport.
- [Risk] CSS arrow classes from `OptimizerHistory` are scoped to that component. → Mitigation: use `:deep()` in guide or extract badge styles to a shared CSS layer — decide during implementation; `@apply`-equivalent via shared CSS file is the fallback.

## Migration Plan

Pure additive page rewrite. No data migration, no API changes. If the rewrite causes visual regressions the rollback is a single file revert (`pages/guide.vue` + `components/guide/`).
