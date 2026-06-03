## ADDED Requirements

### Requirement: Display run summary header
The page at `/evaluate/history/[run_id]` SHALL fetch `GET /evaluate/history/{run_id}` on mount and display a summary card at the top with: run_id, provider, model, accuracy (coloured percentage), correct/total, timeout count, started_at, and duration (derived as `finished_at - started_at` in seconds).

#### Scenario: Run loads successfully
- **WHEN** the page mounts with a valid `run_id` and the API returns 200
- **THEN** the summary card is rendered with all required fields

#### Scenario: Run not found
- **WHEN** the API returns 404 with `detail: "run-not-found"`
- **THEN** a "Run not found" message is shown and no results table is rendered

#### Scenario: API error
- **WHEN** the API returns a network error
- **THEN** an error banner is shown

### Requirement: Display per-question results table
Below the summary card the page SHALL render a table of all results from the run. Each row SHALL show: test_case_id, expected_action (as an ActionBadge), predicted_action (as an ActionBadge), a PASS/FAIL indicator, and latency_ms (formatted as "843 ms" or "—" if null).

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

### Requirement: Back navigation to history list
The page SHALL include a "← History" back link that navigates to `/evaluate/history`.

#### Scenario: Back link present
- **WHEN** the run detail page is displayed
- **THEN** a back link to `/evaluate/history` is visible at the top of the page
