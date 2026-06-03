## ADDED Requirements

### Requirement: Optimizer history lists runs
The optimizer history tab SHALL list optimizer runs with run id, status, target accuracy, best accuracy, started time, finished time, and round count.

#### Scenario: History loads runs
- **WHEN** `GET /optimizer/history` returns one or more runs
- **THEN** the history list displays one row per run with status and summary metrics

#### Scenario: No optimizer runs
- **WHEN** `GET /optimizer/history` returns an empty run list
- **THEN** the UI displays "No optimizer runs yet. Start an optimization run after the eval pool has enough coverage."

### Requirement: Optimizer history shows run detail and round timeline
The optimizer history tab SHALL show a selected run detail with per-round accuracy, failed case count, prompt version id, and kept flag.

#### Scenario: Select run
- **WHEN** the operator selects a run from history
- **THEN** the detail panel displays the run's rounds in round number order

#### Scenario: Round has prompt version
- **WHEN** a round includes `prompt_version_id`
- **THEN** the UI renders a prompt version link or settings navigation target for that prompt version

### Requirement: Generated prompt versions are not auto-activated
The optimizer history SHALL expose generated prompt versions for inspection but SHALL NOT activate any prompt version automatically.

#### Scenario: Optimizer run completes
- **WHEN** an optimizer run reaches a terminal successful status
- **THEN** generated prompt versions remain inactive until the operator activates one through the existing prompt activation workflow

### Requirement: Optimizer accuracy trend is visible
The optimizer history or overview SHALL render an accuracy trend for the selected or latest optimizer run.

#### Scenario: Run has multiple rounds
- **WHEN** a run has two or more rounds with accuracy values
- **THEN** the UI displays a trend visualization ordered by round number

#### Scenario: Run has no rounds
- **WHEN** a run has no round data
- **THEN** the UI displays a compact empty state instead of a blank chart
