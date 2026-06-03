## ADDED Requirements

### Requirement: Display optimizer baseline eval link
Optimizer history SHALL display a baseline eval entry for each selected optimizer run when `baseline_eval_run_id` is available.

#### Scenario: Baseline eval run ID exists
- **WHEN** a selected optimizer run has `baseline_eval_run_id = 24`
- **THEN** the optimizer detail shows a baseline eval link to `/evaluate/history/24`

#### Scenario: Baseline eval run ID is null
- **WHEN** a selected optimizer run has `baseline_eval_run_id = null`
- **THEN** the optimizer detail handles the missing baseline link without rendering a broken link

### Requirement: Display optimizer round eval links
Optimizer history SHALL display each round's eval run link when `round.eval_run_id` is available.

#### Scenario: Round eval run ID exists
- **WHEN** a round has `eval_run_id = 25`
- **THEN** the round row provides a link to `/evaluate/history/25`

#### Scenario: Round eval run ID is null
- **WHEN** a round has `eval_run_id = null`
- **THEN** the round row does not render a broken eval detail link

### Requirement: Display direct baseline pass state
Optimizer history SHALL treat a completed optimizer run with no rounds as a direct baseline pass.

#### Scenario: Completed run has no rounds
- **WHEN** a selected optimizer run has `status = "completed"` and `rounds.length = 0`
- **THEN** the optimizer detail indicates that the baseline already met the target and no optimization rounds were needed

#### Scenario: Completed run has rounds
- **WHEN** a selected optimizer run has one or more rounds
- **THEN** the optimizer detail displays the round list instead of the direct baseline pass message
