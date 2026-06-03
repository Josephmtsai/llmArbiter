## MODIFIED Requirements

### Requirement: EvalRun source field uses backend-aligned values

The `EvalRun.source` type SHALL use the values returned by the backend API: `'db' | 'pool' | 'optimizer'`. The previous values `'manual'` is not returned by the backend and SHALL be removed from the type definition.

#### Scenario: Source type accepts db value

- **WHEN** the backend returns `source: 'db'` on an eval run
- **THEN** the TypeScript type accepts it without error and the UI renders a "Manual" label

#### Scenario: Source type accepts optimizer value

- **WHEN** the backend returns `source: 'optimizer'` on an eval run
- **THEN** the TypeScript type accepts it without error and the UI renders an "Optimizer" label

#### Scenario: Source filter excludes optimizer runs from manual eval history

- **WHEN** `getEvalHistory()` is called
- **THEN** runs with `source: 'optimizer'` are filtered out; runs with `source: 'db'`, `source: 'pool'`, or no source are included
