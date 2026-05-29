## ADDED Requirements

### Requirement: Page mount discovers and attaches to already-running jobs
On mount, the evaluate page SHALL call `GET /evaluate/jobs`. If the response contains any jobs, the first one SHALL be set as `activeJob` and polling SHALL begin immediately. This allows the user to return to the page mid-run (e.g., after a refresh or navigating away and back) and see live progress.

#### Scenario: Pre-existing job found on mount
- **WHEN** the evaluate page mounts and `GET /evaluate/jobs` returns one or more jobs
- **THEN** `activeJob` is set to the first job, polling starts, and the progress section is shown without requiring the user to click "Run evaluation"

#### Scenario: No jobs on mount
- **WHEN** the evaluate page mounts and `GET /evaluate/jobs` returns an empty `jobs` array
- **THEN** `activeJob` remains null and the page is in the standard ready state

#### Scenario: Jobs fetch fails on mount
- **WHEN** `GET /evaluate/jobs` returns an error on mount
- **THEN** the error is silently swallowed and the page loads normally in the ready state (non-blocking)
