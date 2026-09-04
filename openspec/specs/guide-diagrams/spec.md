## Requirements

### Requirement: Eval pool Sankey shows splits and per-run snapshots
The guide page SHALL contain a `GuidePoolSankey` component that renders the eval pool
splitting into its three splits and the snapshots an optimizer run draws from them,
with band width proportional to case count.

#### Scenario: Full pool size shown at the source
- **WHEN** the operator views the pool Sankey
- **THEN** the source band SHALL show "12,000 cases" with the note "2,400 per action"

#### Scenario: Three splits shown at 60/20/20
- **WHEN** the operator views the pool Sankey
- **THEN** the three split bands SHALL show "Train 7,200 (60%)", "Val 2,400 (20%)" and "Test 2,400 (20%)"

#### Scenario: Train band is marked as not used for scoring
- **WHEN** the operator views the pool Sankey
- **THEN** the Train band SHALL carry a note that it is used for relabeling and curation, not optimizer scoring

#### Scenario: Validation snapshot shown as a child of the val split
- **WHEN** the operator views the pool Sankey
- **THEN** a band SHALL leave the Val split showing "200 cases (40/action)" sampled once and fixed for the whole run

#### Scenario: Test snapshot shown as a child of the test split
- **WHEN** the operator views the pool Sankey
- **THEN** a band SHALL leave the Test split showing "400 cases (80/action)" scored once after the loop ends

#### Scenario: Scored snapshots are visually distinguished
- **WHEN** the operator views the pool Sankey
- **THEN** the two snapshot bands SHALL use the focal treatment so they read as distinct from the unscored split bands

### Requirement: Run flow diagram shows the phases of a single optimizer run
The guide page SHALL contain a `GuideRunFlowDiagram` component that renders phases 0
through 5 of a run as a flowchart.

#### Scenario: Run start fixes the validation snapshot
- **WHEN** the operator views the run flow diagram
- **THEN** an early node SHALL show that the run samples a fixed 200-case validation snapshot

#### Scenario: Baseline is measured before any candidate
- **WHEN** the operator views the run flow diagram
- **THEN** a node SHALL show the active prompt being evaluated to produce `baseline_accuracy`

#### Scenario: Round loop is shown as a repeated region
- **WHEN** the operator views the run flow diagram
- **THEN** the analyze / generate / evaluate / gate steps SHALL appear inside a region that loops until the accuracy target or `max_rounds` is reached

#### Scenario: Final test eval terminates the run
- **WHEN** the operator views the run flow diagram
- **THEN** the terminal node SHALL show the 400-case test snapshot scored once to produce `test_accuracy`

#### Scenario: Generated prompts are inactive until an operator activates them
- **WHEN** the operator views the run flow diagram
- **THEN** the diagram SHALL show that activation is a separate operator action via `PATCH /config/prompts/{id}/activate`

### Requirement: Round flow diagram shows all three gates and all three outcomes
The guide page SHALL contain a `GuideRoundFlowDiagram` component that renders one round
as a flowchart with decision nodes for each gate.

#### Scenario: G0 structural validation appears before evaluation
- **WHEN** the operator views the round flow diagram
- **THEN** G0 SHALL appear as a decision node ahead of the candidate evaluation, and its failure path SHALL be labeled Skipped rather than Rejected

#### Scenario: G0 lists the skip reasons
- **WHEN** the operator views the round flow diagram
- **THEN** the diagram or its caption SHALL name the `optimizer-candidate-*` skip reasons and note that the backend retries once before recording a skip

#### Scenario: G1 is a decision node on overall accuracy
- **WHEN** the operator views the round flow diagram
- **THEN** G1 SHALL appear as a decision node "round_accuracy > previous_best?" with the NO path labeled as rejected for no overall improvement

#### Scenario: G2 is a decision node on per-action deltas
- **WHEN** the operator views the round flow diagram
- **THEN** G2 SHALL appear as a decision node "all action deltas ≥ −tolerance?" with the YES path reaching Kept and the NO path labeled as an action regression

#### Scenario: G2 tolerances are stated
- **WHEN** the operator views the round flow diagram
- **THEN** the diagram SHALL show the tolerances as "notify_human, send_email ±2% · trigger_* ±5%"

#### Scenario: Kept path loops back while rounds remain
- **WHEN** the operator views the round flow diagram
- **THEN** the Kept outcome SHALL show an arrow returning to the next round while rounds remain

### Requirement: Sequence diagram shows who talks to whom during a run
The guide page SHALL contain a `GuideRunSequenceDiagram` component that renders the
message flow between the operator UI, the optimizer task, the optimizer LLM, the
evaluator and PostgreSQL.

#### Scenario: The two models are shown as separate actors
- **WHEN** the operator views the sequence diagram
- **THEN** the optimizer LLM and the evaluator SHALL appear as distinct lifelines, so it is clear the model that rewrites the prompt is not the model that scores it

#### Scenario: Round messages sit inside a loop fragment
- **WHEN** the operator views the sequence diagram
- **THEN** the per-round messages SHALL be enclosed in a loop fragment guarded by "until accuracy ≥ target or N = max_rounds"

#### Scenario: Every round is persisted
- **WHEN** the operator views the sequence diagram
- **THEN** a message SHALL show the round and its failures being written to PostgreSQL inside the loop

#### Scenario: The headline result is the test accuracy
- **WHEN** the operator views the sequence diagram
- **THEN** the `test_accuracy` return SHALL use the focal treatment as the run's headline result

### Requirement: Diagrams are themed, accessible, and responsive
Every guide diagram SHALL be an inline SVG that follows the page theme and is usable
with assistive technology and on small screens.

#### Scenario: Colours and fonts come from design tokens
- **WHEN** a diagram is rendered under either `data-theme="dark"` or `data-theme="light"`
- **THEN** it SHALL take every colour and font from `assets/css/design-tokens.css` via the `gd-*` classes, with no literal colour or font in the component

#### Scenario: Each diagram exposes a name and a description
- **WHEN** assistive technology reads a diagram
- **THEN** the `svg` SHALL carry `role="img"`, name itself via `aria-labelledby` pointing at its `<title>`, and describe itself via `aria-describedby` pointing at its `<desc>`

#### Scenario: Repeated instances do not collide
- **WHEN** the same diagram component is mounted more than once on a page
- **THEN** its element ids and marker references SHALL be derived from `useId()` so they stay unique

#### Scenario: Wide diagrams scroll inside their own frame
- **WHEN** the guide page is viewed at 375px wide
- **THEN** each figure SHALL scroll horizontally inside its own container and the page body SHALL NOT scroll horizontally

### Requirement: Pool stats numbers match the 60/20/20 split
The four stat cards in the guide page SHALL agree with the pool Sankey.

#### Scenario: Eval pool total shows 12,000
- **WHEN** the operator views the pool stats section
- **THEN** the "Eval pool" stat card SHALL show value "12,000" with note "2,400 cases per action across five CI/hardware action types"

#### Scenario: Train split shows 7,200
- **WHEN** the operator views the pool stats section
- **THEN** the "Train split" stat card SHALL show value "7,200" with note that it is used for relabeling and curation, not optimizer scoring

#### Scenario: Validation split shows 2,400 with snapshot callout
- **WHEN** the operator views the pool stats section
- **THEN** the "Validation split" stat card SHALL show value "2,400" with note that the optimizer snapshots 200 of these per run (40/action), fixed for the whole run

#### Scenario: Test split shows 2,400 with snapshot callout
- **WHEN** the operator views the pool stats section
- **THEN** the "Test split" stat card SHALL show value "2,400" with note that the final test snapshot is 400 cases (80/action), evaluated once after the optimizer loop
