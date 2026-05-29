## ADDED Requirements

### Requirement: Progress is polled every 2.5 seconds while a job is active
After a `run_id` is obtained, the frontend SHALL call `GET /evaluate/jobs` every 2.5 seconds. Each poll response SHALL be used to update the progress bar with `completed / total` from the matching job entry. Polling SHALL stop when the `run_id` is no longer present in the `jobs` array, indicating the job has ended.

#### Scenario: Job in progress — progress updates
- **WHEN** a poll response includes a job entry for the active `run_id`
- **THEN** the progress bar updates to show `completed` out of `total` test cases

#### Scenario: Job complete — fetch result
- **WHEN** a poll response does NOT include the active `run_id` in the `jobs` array
- **THEN** polling stops and `GET /evaluate/history/{run_id}` is called to retrieve the final result

#### Scenario: Job disappears on first poll (fast completion)
- **WHEN** the very first poll after starting already shows the `run_id` absent
- **THEN** the same termination logic applies: fetch `GET /evaluate/history/{run_id}` immediately

### Requirement: Final result is fetched and displayed after job ends
When the polling loop detects job completion, `GET /evaluate/history/{run_id}` SHALL be called. The response `run.status` SHALL determine display:
- `completed` → render accuracy summary and results table (same as previous sync flow)
- `failed` or `aborted` → show inline error "Evaluation failed or was aborted" without results table

#### Scenario: Completed run with results
- **WHEN** `GET /evaluate/history/{run_id}` returns `run.status: "completed"`
- **THEN** accuracy, correct/total, timeouts, delta badge, and results table are displayed

#### Scenario: Failed run
- **WHEN** `GET /evaluate/history/{run_id}` returns `run.status: "failed"` or `"aborted"`
- **THEN** an error message is shown instead of the results table

### Requirement: Polling interval is cleaned up on page unmount
The polling `setInterval` SHALL be cleared in `onUnmounted` to prevent memory leaks and ghost API calls after navigation.

#### Scenario: User navigates away mid-poll
- **WHEN** user navigates away from `/evaluate` while a job is polling
- **THEN** the polling interval is cleared and no further `GET /evaluate/jobs` calls are made

### Requirement: Progress section replaces the running spinner
While a job is active, a progress section SHALL be shown instead of the generic "Running evaluation…" spinner. The progress section SHALL display:
- A progress bar (`completed / total`)
- Percentage complete
- Provider and model (from the job entry)
- Elapsed time since `started_at`

#### Scenario: Progress section visible during active job
- **WHEN** `activeJob` is non-null
- **THEN** the progress section is rendered with live-updating progress bar; the generic spinner is not shown
