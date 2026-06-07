## ADDED Requirements

### Requirement: Optimizer loop diagram shows the full flow including both gates
The guide page SHALL contain a `GuideLoopDiagram` component that renders the complete optimizer loop as a step-by-step visual.

#### Scenario: Diagram shows val snapshot is fixed at run start
- **WHEN** the operator views the loop diagram
- **THEN** step 1 SHALL show "Run starts → val snapshot sampled (200 cases, fixed for entire run)"

#### Scenario: Diagram shows baseline evaluation node
- **WHEN** the operator views the loop diagram
- **THEN** a node SHALL show "Baseline eval → baseline_accuracy" with a note that the same 200 cases are used

#### Scenario: Diagram shows candidate round node
- **WHEN** the operator views the loop diagram
- **THEN** a node SHALL show "Round N: analyze failures → generate candidate → candidate eval (same 200 cases)"

#### Scenario: Diagram shows Gate 1 as a decision diamond
- **WHEN** the operator views the loop diagram
- **THEN** Gate 1 SHALL appear as a decision node: "round_accuracy > previous_best?" with YES path continuing and NO path labeled "Rejected: no overall improvement"

#### Scenario: Diagram shows Gate 2 as a decision diamond
- **WHEN** the operator views the loop diagram
- **THEN** Gate 2 SHALL appear as a decision node: "all action deltas ≥ −tolerance?" with YES path to "Kept" and NO path labeled "Rejected: action regression"

#### Scenario: Diagram shows loop-back for next round
- **WHEN** the operator views the loop diagram
- **THEN** the "Kept" path SHALL show an arrow looping back to the next round node, with annotation "if rounds remain"

#### Scenario: Diagram shows final test eval at loop end
- **WHEN** the operator views the loop diagram
- **THEN** the terminal node SHALL show "Final test eval → test_accuracy (400 cases, run once)"

#### Scenario: Diagram shows skip path
- **WHEN** the operator views the loop diagram
- **THEN** a Skipped path SHALL branch from the candidate generation node (before evaluation) labeled "Skipped: no usable candidate" with an arrow continuing to the next round

### Requirement: Data split diagram distinguishes full splits from optimizer snapshots
The guide page SHALL contain a `GuideSplitDiagram` component showing the hierarchical relationship between the full pool, the three splits, and the optimizer-specific snapshot sizes.

#### Scenario: Full pool size shown at root
- **WHEN** the operator views the split diagram
- **THEN** the root node SHALL show "Eval Pool: 12,000 cases · 2,400 per action"

#### Scenario: Train split shown with note that optimizer does not use it
- **WHEN** the operator views the split diagram
- **THEN** the Train branch SHALL show "Train: 10,400 (2,080/action)" with note "relabeling & curation — not used for optimizer scoring"

#### Scenario: Val split shows full size and optimizer snapshot size
- **WHEN** the operator views the split diagram
- **THEN** the Val branch SHALL show "Val: 800 (160/action)" with a child node "Optimizer snapshot: 200 cases (40/action) — sampled once, fixed per run"

#### Scenario: Test split shows full size and final snapshot size
- **WHEN** the operator views the split diagram
- **THEN** the Test branch SHALL show "Test: 800 (160/action)" with a child node "Final test snapshot: 400 cases (80/action) — used once after loop ends"

#### Scenario: Diagram visually differentiates snapshot nodes from split nodes
- **WHEN** the operator views the split diagram
- **THEN** snapshot child nodes SHALL use a distinct visual style (e.g. dashed border or accent color) to distinguish them from the full-split parent nodes

### Requirement: Pool stats numbers updated to June 2026 pool
The existing four stat cards in the guide page SHALL be updated with the June 2026 pool numbers.

#### Scenario: Eval pool total shows 12,000
- **WHEN** the operator views the pool stats section
- **THEN** the "Eval pool" stat card SHALL show value "12,000" with note "2,400 cases per action across five CI/hardware action types"

#### Scenario: Train split shows 10,400
- **WHEN** the operator views the pool stats section
- **THEN** the "Train split" stat card SHALL show value "10,400" with note "Used for relabeling and curation, not optimizer scoring"

#### Scenario: Validation split shows 800 with snapshot callout
- **WHEN** the operator views the pool stats section
- **THEN** the "Validation split" stat card SHALL show value "800" with note "Optimizer snapshots 200 of these per run (40/action) — fixed for the whole run"

#### Scenario: Test split shows 800 with snapshot callout
- **WHEN** the operator views the pool stats section
- **THEN** the "Test split" stat card SHALL show value "800" with note "Final test snapshot is 400 cases (80/action), evaluated once after the optimizer loop"
