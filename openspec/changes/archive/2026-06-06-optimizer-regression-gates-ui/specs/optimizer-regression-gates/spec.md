## ADDED Requirements

### Requirement: Rejected round badge shows rejection reason
When a round was evaluated but not kept, the UI SHALL display the rejection reason inline in the badge.

#### Scenario: Round rejected with reason present
- **WHEN** a round has `kept: false` and a non-null `reject_reason`
- **THEN** the round badge reads "Rejected: <reject_reason value>" (e.g. "Rejected: no overall improvement")

#### Scenario: Round rejected without reason
- **WHEN** a round has `kept: false` and `reject_reason` is null or absent
- **THEN** the round badge reads "Rejected" (unchanged from current behaviour)

#### Scenario: Regression gate rejection identifies the action
- **WHEN** `reject_reason` identifies an action regression (e.g. "send_email regressed beyond tolerance")
- **THEN** the badge reads "Rejected: send_email regressed beyond tolerance"

#### Scenario: Kept round badge is unaffected
- **WHEN** a round has `kept: true`
- **THEN** the round badge reads "Kept" and `reject_reason` is ignored

#### Scenario: Skipped round badge is unaffected
- **WHEN** a round has a non-null `skip_reason`
- **THEN** the round shows the "Skipped" badge and skip reason (reject_reason is irrelevant)

### Requirement: Expanded round detail shows per-action delta table
When a round has per-action delta data, the expanded detail SHALL render a compact table of per-action baseline vs candidate accuracy.

#### Scenario: Round has per-action deltas
- **WHEN** the user expands a round that has a non-null `per_action_deltas` map
- **THEN** a table is shown with columns: Action, Baseline, Candidate, Delta

#### Scenario: Per-action table shows formatted percentages
- **WHEN** the per-action deltas table is rendered
- **THEN** baseline_accuracy, candidate_accuracy, and delta values are displayed as percentages (e.g. "85%", "+3%", "-9%")

#### Scenario: Regression rows are highlighted
- **WHEN** a row has a negative delta whose absolute value exceeds the row's tolerance
- **THEN** that row's delta cell receives a visual highlight indicating a regression gate failure

#### Scenario: No per-action deltas
- **WHEN** a round's `per_action_deltas` is null or absent
- **THEN** the per-action table is not rendered

#### Scenario: Per-action table position
- **WHEN** a round has both a confusion matrix and per_action_deltas
- **THEN** the per-action table is rendered after the confusion matrix and before failure samples
