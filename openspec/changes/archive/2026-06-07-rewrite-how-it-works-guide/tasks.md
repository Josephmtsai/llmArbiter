## 1. GuideTooltip Component

- [x] 1.1 Create `components/guide/GuideTooltip.vue` — wraps a term in `<span role="tooltip">`, shows a sibling panel on `:hover` / `:focus-within` with `text` prop content
- [x] 1.2 Add CSS: panel uses `position: absolute`, `left: 50%; transform: translateX(-50%)`, `max-width: min(280px, 90vw)`, `z-index` above page content, styled with design tokens
- [x] 1.3 Verify tooltip stays in viewport on left/right edge (manual check at 320px and 1280px viewport widths)

## 2. GuideSplitDiagram Component

- [x] 2.1 Create `components/guide/GuideSplitDiagram.vue` with root node "Eval Pool: 12,000 cases · 2,400 per action"
- [x] 2.2 Add three branches: Train (10,400 / 2,080 per action), Val (800 / 160 per action), Test (800 / 160 per action)
- [x] 2.3 Under Val branch add snapshot child node: "Optimizer snapshot: 200 cases (40/action) — sampled once, fixed per run" with dashed/accent border
- [x] 2.4 Under Test branch add snapshot child node: "Final test snapshot: 400 cases (80/action) — used once after loop ends" with dashed/accent border
- [x] 2.5 Add Train branch note: "Relabeling & curation — not used for optimizer scoring"

## 3. GuideLoopDiagram Component

- [x] 3.1 Create `components/guide/GuideLoopDiagram.vue` with a vertical/step layout
- [x] 3.2 Add step: "① Run starts → val snapshot sampled (200 cases, 40/action, fixed for entire run)"
- [x] 3.3 Add step: "② Baseline eval → baseline_accuracy" (same 200 cases, links to baseline eval run)
- [x] 3.4 Add step: "③ Round N — analyze failures → generate candidate → candidate eval (same 200 cases)"
- [x] 3.5 Add skip branch from step ③: "Skipped: no usable candidate → next round" (amber/skipped styling)
- [x] 3.6 Add Gate 1 decision node: "round_accuracy > previous_best?" — NO path labeled "🔴 Rejected: no overall improvement", YES continues
- [x] 3.7 Add Gate 2 decision node: "all action deltas ≥ −tolerance?" — NO path labeled "🔴 Rejected: action regression", YES continues to "✅ Kept"
- [x] 3.8 Add loop-back arrow from "Kept" back to ③ with label "if rounds remain"
- [x] 3.9 Add terminal node: "⑤ Final test eval → test_accuracy (400 cases, run once)"

## 4. Keep/Reject Gate Section in guide.vue

- [x] 4.1 Add `gateCards` data array in `<script setup>` with Gate 1 and Gate 2 card content (formula, label, example)
- [x] 4.2 Add `toleranceRows` data array: notify_human 2%, send_email 2%, trigger_rebuild/fallback/restart 5%, each with "Applies when" note
- [x] 4.3 Add `<section>` in template with two side-by-side gate cards — Gate 1 shows `overall_pass = round_accuracy > previous_best_accuracy` + worked rejection example; Gate 2 shows tolerance table + regression example
- [x] 4.4 Add copy: "Both gates must pass simultaneously — `kept = overall_pass AND all(action_pass)`"
- [x] 4.5 Add note: gate 2 applies only when baseline has ≥ 10 samples for that action

## 5. Round States Section in guide.vue

- [x] 5.1 Add `roundStates` data array with four entries: Kept, Rejected (overall), Rejected (regression), Skipped — each with `badgeClass`, `label`, `body`, and optional `skipReasons[]`
- [x] 5.2 Add `<section>` in template rendering the four state cards using `.optimizer-history__kept-badge` classes (or scoped equivalent)
- [x] 5.3 Skipped card lists skip reason codes in monospace: `optimizer-candidate-invalid-json`, `optimizer-candidate-missing-actions`, `optimizer-candidate-missing-json-contract`, `optimizer-candidate-missing-fields`, `optimizer-candidate-unsupported-actions`

## 6. Pool Stats Update & Tooltip Integration

- [x] 6.1 Update `poolStats` array in `<script setup>`: Eval pool 12,000 / Train 10,400 / Val 800 / Test 800 with corrected notes mentioning snapshot sizes
- [x] 6.2 Wrap "Baseline accuracy" in the flow steps section with `<GuideTooltip>` (spec copy: "Accuracy of the active prompt on the run's fixed validation snapshot before any candidate prompt was generated.")
- [x] 6.3 Wrap "Best accuracy" with `<GuideTooltip>` (spec copy: "Best validation accuracy reached by baseline or kept/evaluated rounds. This is not the final test accuracy.")
- [x] 6.4 Wrap "Test accuracy" with `<GuideTooltip>` (spec copy: "Accuracy of the final active prompt on a separate test snapshot after the optimizer loop finished.")
- [x] 6.5 Wrap "accuracy delta" / "validation accuracy" in the candidate round description with `<GuideTooltip>` (copy: "Movement in validation accuracy compared to previous best. This is not final test accuracy.")
- [x] 6.6 Wrap "validation snapshot" with `<GuideTooltip>` (copy: "A fixed set of 200 validation cases (40 per action) sampled once at run start. Every round in the same run uses the same 200 cases.")
- [x] 6.7 Wrap "regression tolerance" with `<GuideTooltip>` (copy: "Maximum allowed drop in per-action accuracy. Protected actions (notify_human, send_email): 2%. Other actions: 5%.")

## 7. Wording & Copy Corrections

- [x] 7.1 Remove any text implying "trained on 12,000 cases" — replace with "tested on a validation snapshot" or "evaluated against the fixed 200-case snapshot"
- [x] 7.2 Audit all instances of "accuracy" in flow steps / checkpoints — ensure validation accuracy and test accuracy are clearly distinguished
- [x] 7.3 Update existing "Keep or reject" node in `visualLanes` to mention both gates (overall + per-action)
- [x] 7.4 Update "Important checkpoints" data to add: "Per-action regression gate protects critical actions" checkpoint
- [x] 7.5 Update hero callout copy if needed to reflect two-gate system

## 8. Diagram + Component Integration in guide.vue

- [x] 8.1 Import and place `<GuideSplitDiagram>` in the page — after the pool stats cards, before the flow timeline
- [x] 8.2 Import and place `<GuideLoopDiagram>` — replace or supplement the existing `arb-guide__visual-flow` lanes section
- [x] 8.3 Ensure both diagrams are responsive: collapse gracefully at 640px (single-column stack)

## 9. CSS Cleanup

- [x] 9.1 Add `arb-guide__gate-grid` CSS for two-column gate layout (collapses to one column below 640px)
- [x] 9.2 Add `arb-guide__state-grid` CSS for four-column round-state grid (collapses to two columns below 640px)
- [x] 9.3 Verify `.optimizer-history__kept-badge` classes are accessible from guide context (add scoped copy or use `:deep()` workaround if needed)
