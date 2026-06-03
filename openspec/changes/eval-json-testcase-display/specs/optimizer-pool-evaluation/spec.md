## MODIFIED Requirements

### Requirement: Pool-sourced evaluation can be started
The optimizer workflow SHALL allow an operator to start an evaluation using the eval pool by sending `source = "pool"` through the server proxy. The pool evaluation UI SHALL communicate that raw eval pool cases are not shown directly in the frontend; operators inspect aggregate pool stats and linked eval run details.

#### Scenario: Pool evaluation accepted
- **WHEN** the operator starts pool evaluation and Arbiter returns HTTP 202 with a `run_id`
- **THEN** the UI displays the accepted run and provides a link to the existing evaluation job or history surface

#### Scenario: Optional model override
- **WHEN** the operator provides a model override before starting pool evaluation
- **THEN** the request includes the selected `model` value in addition to `prompt_version_id` and `source = "pool"`

#### Scenario: Accepted pool evaluation links to eval detail
- **WHEN** a pool evaluation is accepted with a `run_id`
- **THEN** the accepted-run message links to `/evaluate/history/{run_id}`

### Requirement: Empty pool blocks pool evaluation
The optimizer workflow SHALL disable pool evaluation when eval pool total is 0 and SHALL handle backend empty-pool errors.

#### Scenario: Stats show empty pool
- **WHEN** eval pool stats report `total = 0`
- **THEN** the pool evaluation start control is disabled

#### Scenario: Backend reports empty pool
- **WHEN** Arbiter returns HTTP 400 with `detail = "eval-pool-empty"`
- **THEN** the UI displays "Eval pool is empty. Import or review cases first."

### Requirement: Eval pool display is aggregate-only
The optimizer workflow SHALL display eval pool aggregate statistics and low-coverage warnings, and SHALL NOT render raw eval pool case logs as the primary frontend view.

#### Scenario: Eval pool has balanced data
- **WHEN** eval pool stats contain total and per-action counts
- **THEN** the optimizer UI shows total count and per-action distribution

#### Scenario: An action has fewer than 20 cases
- **WHEN** an action count is below 20
- **THEN** the optimizer UI warns that the sample is insufficient for reliable action accuracy

### Requirement: Pool evaluation does not break existing evaluation flow
The pool evaluation request SHALL extend the evaluation request shape without changing the existing default active-prompt evaluation behavior.

#### Scenario: Existing evaluation page starts evaluation
- **WHEN** the existing evaluation page starts an evaluation without `source`
- **THEN** the request remains compatible with the existing non-pool evaluation behavior
