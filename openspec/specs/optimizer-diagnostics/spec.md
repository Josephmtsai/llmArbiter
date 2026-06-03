## ADDED Requirements

### Requirement: Optimizer run list shows model and accuracy progression

The UI SHALL display each optimizer run with its optimizer model, evaluator model, baseline accuracy, best round accuracy, and test accuracy in reverse chronological order.

#### Scenario: Run summary shows model badges

- **WHEN** the user opens the optimizer history tab
- **THEN** each run entry shows `optimizer_model` and `evaluator_model` as small badges

#### Scenario: Accuracy progression is visible

- **WHEN** a run has `baseline_accuracy` and at least one round
- **THEN** the run entry displays baseline → best round → test accuracy in sequence

#### Scenario: Currently evaluating run shows spinner

- **WHEN** a run has a non-null `current_eval_run_id`
- **THEN** the UI shows a spinner and a link to the running eval run

### Requirement: Round detail shows kept/rejected badge and accuracy delta

The UI SHALL display each optimizer round with a kept/rejected badge and the accuracy delta relative to baseline.

#### Scenario: Kept round is visually distinct

- **WHEN** a round has `kept: true`
- **THEN** the round shows a green "Kept" badge

#### Scenario: Rejected round shows negative delta in red

- **WHEN** a round has `kept: false` and `accuracy_delta` is negative
- **THEN** the round shows a red "Rejected" badge and the delta value in red

#### Scenario: Positive delta is shown in green

- **WHEN** `accuracy_delta` is positive
- **THEN** the delta value is displayed in green

### Requirement: Failure analysis is shown collapsed by default

The UI SHALL display `analysis_text` per round in a collapsible panel, collapsed by default.

#### Scenario: Analysis panel is collapsed on load

- **WHEN** a round has `analysis_text`
- **THEN** the panel is rendered collapsed and requires explicit user action to expand

#### Scenario: Analysis panel expands on interaction

- **WHEN** the user clicks the failure analysis toggle
- **THEN** the full `analysis_text` content is revealed

### Requirement: Confusion matrix is rendered as a table

The UI SHALL render the `confusion_matrix` object as a table with expected actions as rows and predicted actions as columns.

#### Scenario: Matrix table is shown for rounds with confusion data

- **WHEN** a round has a non-null `confusion_matrix`
- **THEN** the UI renders a table where each row is an expected action and each column is a predicted action, with counts in cells

#### Scenario: Missing confusion data is handled gracefully

- **WHEN** a round has no `confusion_matrix`
- **THEN** the matrix section is not rendered for that round
