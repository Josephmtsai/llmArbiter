## Why

The existing "How it works" page (`pages/guide.vue`) shows outdated pool numbers (4,000 vs the June 2026 expansion to 12,000), omits the per-action regression gate entirely, and has no tooltips — leaving operators without the vocabulary to interpret what they see in the History view. The spec (`docs/frontend-auto-prompt-optimizer-spec.md`) defines exact copy, formulas, tolerances, and tooltip text that should drive the UI.

## What Changes

- **Update all pool statistics** to the June 2026 pool (12,000 total, 2,400 per action, split 10,400/800/800)
- **Distinguish full splits from optimizer snapshots** — val snapshot 200 cases (40/action), test snapshot 400 cases (80/action); currently conflated
- **Add Keep/Reject gate section** explaining the two-gate system: overall accuracy gate + per-action regression gate with tolerance table (notify_human/send_email 2%, others 5%)
- **Add Round states section** with visual badges for all four states: Kept, Rejected (no improvement), Rejected (action regression), Skipped
- **Add Tooltip component** — hoverable definitions for baseline_accuracy, best_accuracy, test_accuracy, accuracy_delta, val snapshot, regression tolerance
- **Add optimizer loop diagram** showing the fixed snapshot, two gates, and retry-on-skip path as an inline SVG-style Vue component
- **Add data split diagram** distinguishing full split size from optimizer snapshot size
- **Correct wording** — remove any implication of "training on 12,000 cases"; accuracy deltas labelled as validation, not final test
- **Update flow diagram nodes** — "Keep or reject" node now shows both gates; add "Skipped round" path

## Capabilities

### New Capabilities

- `guide-keep-reject-gate`: Visual explanation of the two-gate keep/reject system with formula, tolerance table, and worked examples
- `guide-round-states`: Four round outcome states (Kept, Rejected overall, Rejected regression, Skipped) with badge styles and plain-language meaning
- `guide-tooltips`: Reusable inline tooltip component for operator-facing metric labels throughout the guide page
- `guide-diagrams`: Inline SVG-style Vue diagrams for (a) optimizer loop with two gates and (b) data split with snapshot sizes

### Modified Capabilities

<!-- No existing spec requirements are changing; additions only -->

## Impact

- `pages/guide.vue` — full rewrite of data, copy, and layout
- New child component(s) under `components/guide/` for tooltip, loop diagram, split diagram
- No API changes, no route changes, no store changes
