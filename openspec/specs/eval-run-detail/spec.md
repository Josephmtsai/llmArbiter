
### Requirement: Display run summary header
The page at `/evaluate/history/[run_id]` SHALL fetch `GET /evaluate/history/{run_id}` on mount and display a summary card at the top with: run_id, provider, model, status, accuracy (coloured percentage when meaningful), correct/total, timeout count, started_at, duration derived as `finished_at - started_at` in seconds, and average latency when it can be derived from result rows.

#### Scenario: Run loads successfully
- **WHEN** the page mounts with a valid `run_id` and the API returns 200
- **THEN** the summary card is rendered with all required fields

#### Scenario: Run not found
- **WHEN** the API returns 404 with `detail: "run-not-found"`
- **THEN** a "Run not found" message is shown and no results table is rendered

#### Scenario: API error
- **WHEN** the API returns a network error
- **THEN** an error banner is shown

#### Scenario: Failed run has no meaningful accuracy
- **WHEN** the run status is `failed`
- **THEN** the summary avoids presenting `0%` as a meaningful completed-run accuracy

#### Scenario: Average latency can be derived
- **WHEN** result rows contain non-null `latency_ms` values
- **THEN** the summary shows the average latency in milliseconds

### Requirement: Display per-question results table
Below the summary card the page SHALL render a table of all results from the run. Each row SHALL show: test_case_id, expected_action (as an ActionBadge), predicted_action (as an ActionBadge), a PASS/FAIL indicator, and latency_ms formatted as "843 ms" or `--` if null.

#### Scenario: All questions shown
- **WHEN** the run detail loads with N result items
- **THEN** the table shows exactly N rows

#### Scenario: PASS row styling
- **WHEN** a result has `is_correct: true`
- **THEN** the row shows a green "PASS" badge

#### Scenario: FAIL row styling
- **WHEN** a result has `is_correct: false`
- **THEN** the row shows a red "FAIL" badge and the predicted_action badge uses its action colour to highlight the mismatch

### Requirement: Filter results by correctness
The detail page SHALL provide a toggle to filter the results table to show only FAIL rows, to help identify which cases the model got wrong.

#### Scenario: Show failures only
- **WHEN** the user activates the "Failures only" toggle
- **THEN** only rows where `is_correct: false` are shown in the table

#### Scenario: Show all results
- **WHEN** the toggle is off
- **THEN** all rows are shown

#### Scenario: Failed-case count is visible
- **WHEN** the run detail has failed result rows
- **THEN** the page shows the number of failed cases near the result controls

### Requirement: Display optional confusion matrix
The run detail page MAY display a confusion matrix derived from expected_action and predicted_action values. When present, the matrix SHALL include all primary actions as both expected rows and predicted columns.

#### Scenario: Confusion matrix is enabled
- **WHEN** result rows contain expected and predicted action values
- **THEN** the matrix counts each expected/predicted pair

#### Scenario: Confusion matrix is omitted
- **WHEN** the implementation omits the optional confusion matrix
- **THEN** the required summary and per-question result table still satisfy the run detail display behavior

### Requirement: Back navigation to history list
The page SHALL include a history back link that navigates to `/evaluate/history`.

#### Scenario: Back link present
- **WHEN** the run detail page is displayed
- **THEN** a back link to `/evaluate/history` is visible at the top of the page

### Requirement: Run detail page has delete action
The run detail page (`/evaluate/history/[run_id]`) SHALL display a delete button in the page header area. Clicking it SHALL prompt the user for confirmation before sending the delete request. On success, the user SHALL be navigated to `/evaluate/history`.

#### Scenario: User confirms deletion from detail page
- **WHEN** user clicks "Delete run" in the detail page header and confirms the browser prompt
- **THEN** `deleteEvalRun(run_id)` is called, and on success the user is navigated to `/evaluate/history`

#### Scenario: User cancels deletion from detail page
- **WHEN** user clicks "Delete run" and dismisses the browser confirm prompt
- **THEN** no API call is made and the user remains on the detail page

#### Scenario: Deletion fails on detail page
- **WHEN** `deleteEvalRun(run_id)` returns an error
- **THEN** the user remains on the detail page and an inline error message is displayed near the delete button

#### Scenario: Delete during load
- **WHEN** the run detail is still loading
- **THEN** the delete button is disabled until the run data is available
