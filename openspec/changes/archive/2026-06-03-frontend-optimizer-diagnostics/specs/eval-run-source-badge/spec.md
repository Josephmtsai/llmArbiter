## ADDED Requirements

### Requirement: Eval history list shows source badge per run

The UI SHALL display a colored source badge on each eval run row in the history list and jobs list.

#### Scenario: Manual DB run shows grey badge

- **WHEN** a run has `source: 'db'`
- **THEN** the row shows a grey "Manual" badge

#### Scenario: Pool run shows blue badge

- **WHEN** a run has `source: 'pool'`
- **THEN** the row shows a blue "Pool" badge

#### Scenario: Optimizer run shows purple badge

- **WHEN** a run has `source: 'optimizer'`
- **THEN** the row shows a purple "Optimizer" badge

#### Scenario: Legacy run without source shows no badge

- **WHEN** a run has no `source` field (null or undefined)
- **THEN** no badge is rendered for that run
