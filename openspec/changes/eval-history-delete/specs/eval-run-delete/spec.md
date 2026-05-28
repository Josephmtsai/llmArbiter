## ADDED Requirements

### Requirement: Delete evaluation run via API
The `useApi()` composable SHALL expose a `deleteEvalRun(runId: number)` method that calls `DELETE /evaluate/history/{run_id}` and returns an `ArbiterResponse<null>`. A 404 response SHALL be treated as a successful deletion (run already gone).

#### Scenario: Successful deletion
- **WHEN** `deleteEvalRun(42)` is called and the backend returns 200
- **THEN** the promise resolves with `{ status: 'success' }`

#### Scenario: Run already deleted (404)
- **WHEN** `deleteEvalRun(42)` is called and the backend returns 404
- **THEN** the promise resolves without throwing (treated as success)

#### Scenario: Unexpected server error
- **WHEN** `deleteEvalRun(42)` is called and the backend returns 500
- **THEN** the promise rejects with an Error containing the response message
