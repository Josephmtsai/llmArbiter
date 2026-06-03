## ADDED Requirements

### Requirement: Classify eval run source from optimizer history
The frontend SHALL classify eval runs as optimizer-triggered or manual by cross-referencing eval run IDs found in optimizer history.

#### Scenario: Baseline eval run belongs to optimizer
- **WHEN** optimizer history contains `baseline_eval_run_id = 24`
- **THEN** eval history row `run_id = 24` is tagged as optimizer-triggered

#### Scenario: Round eval run belongs to optimizer
- **WHEN** optimizer history contains a round with `eval_run_id = 25`
- **THEN** eval history row `run_id = 25` is tagged as optimizer-triggered

#### Scenario: Eval run ID is not in optimizer history
- **WHEN** an eval history row's `run_id` is not present in any optimizer baseline or round eval ID
- **THEN** the row is tagged as manual

#### Scenario: Optimizer history cannot be loaded
- **WHEN** eval history loads but optimizer history fails
- **THEN** the eval history page remains usable and does not block the run list

### Requirement: Build optimizer eval ID set defensively
The frontend SHALL ignore null or missing optimizer eval IDs when building the optimizer eval ID set.

#### Scenario: Old optimizer run has null baseline ID
- **WHEN** an optimizer run has `baseline_eval_run_id = null`
- **THEN** no ID is added for that baseline

#### Scenario: Old optimizer round has null eval run ID
- **WHEN** an optimizer round has `eval_run_id = null`
- **THEN** no ID is added for that round
