## ADDED Requirements

### Requirement: Optimizer overview shows pool coverage and status
The `/optimizer` page SHALL display eval pool total, per-action coverage, lowest action coverage, review queue pending count when available, and latest optimizer status.

#### Scenario: Stats load successfully
- **WHEN** eval pool stats and optimizer history load successfully
- **THEN** the overview displays total cases, one coverage indicator per action, lowest action coverage, and the latest optimizer run status

#### Scenario: Low action coverage
- **WHEN** any action has fewer than 20 eval pool cases
- **THEN** the overview displays a warning state for that action and the lowest coverage summary

#### Scenario: Empty eval pool
- **WHEN** eval pool total is 0
- **THEN** the overview displays the empty pool guidance and disables pool evaluation entry points

### Requirement: Operator can start an optimizer run
The overview SHALL provide controls for `max_rounds` and `target_accuracy`, and SHALL start an optimizer run through the server proxy.

#### Scenario: Start optimizer accepted
- **WHEN** the operator submits valid optimizer settings and Arbiter returns HTTP 202
- **THEN** the UI shows a running state and begins polling optimizer history

#### Scenario: Optimizer already running
- **WHEN** Arbiter returns HTTP 409 with `detail = "optimizer-already-running"`
- **THEN** the UI displays an active-run conflict message and refetches optimizer history

#### Scenario: Active run disables start
- **WHEN** any optimizer run has `status = "running"`
- **THEN** the Start optimizer button is disabled

### Requirement: Operator can request optimizer cancellation
The overview SHALL expose cancellation for an active optimizer run and SHALL keep the run visible after cancellation is requested.

#### Scenario: Cancellation accepted
- **WHEN** the operator confirms cancellation and Arbiter returns HTTP 202
- **THEN** the UI displays "Cancelling after current round" and continues polling optimizer history

#### Scenario: Cancellation target is stale
- **WHEN** Arbiter returns `404 optimizer-run-not-found`
- **THEN** the UI refetches optimizer history and does not remove unrelated runs

### Requirement: Optimizer history polling stops at terminal states
The optimizer overview SHALL poll history every 3 seconds only while at least one run is active.

#### Scenario: Running run exists
- **WHEN** optimizer history contains a run with `status = "running"`
- **THEN** the page polls optimizer history every 3 seconds

#### Scenario: All runs terminal
- **WHEN** all optimizer runs have status `completed`, `completed_max_rounds`, `failed`, or `cancelled`
- **THEN** the page stops polling optimizer history
