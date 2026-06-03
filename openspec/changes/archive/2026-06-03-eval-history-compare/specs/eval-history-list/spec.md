## ADDED Requirements

### Requirement: Display evaluation run history table
The page at `/evaluate/history` SHALL fetch `GET /evaluate/history` on mount and render all runs in a table, newest first. Each row SHALL show: run_id, prompt_version_id, provider, model, accuracy (as a percentage), correct/total counts, timeout count, and started_at (formatted as local date-time).

#### Scenario: Runs load successfully
- **WHEN** the page mounts and `GET /evaluate/history` returns a non-empty runs array
- **THEN** a table is rendered with one row per run, showing all required columns

#### Scenario: No runs exist
- **WHEN** `GET /evaluate/history` returns an empty runs array
- **THEN** an empty-state message is shown ("No evaluation runs yet.")

#### Scenario: API error
- **WHEN** `GET /evaluate/history` responds with a network error or non-success status
- **THEN** an error message is displayed and the table is not rendered

### Requirement: Accuracy column uses colour-coded display
Accuracy SHALL be displayed as a percentage rounded to one decimal place (e.g., "90.3%"). The value SHALL be colour-coded: green (`--action-rebuild`) for ≥ 80%, yellow (`--action-fallback`) for 50–79%, red (`--action-notify`) for < 50%.

#### Scenario: High accuracy run
- **WHEN** a run has `accuracy: 0.9032`
- **THEN** the cell shows "90.3%" in green

#### Scenario: Low accuracy run
- **WHEN** a run has `accuracy: 0.42`
- **THEN** the cell shows "42.0%" in red

### Requirement: Navigate to run detail from history table
Each row in the history table SHALL be clickable and navigate to `/evaluate/history/{run_id}`.

#### Scenario: User clicks a row
- **WHEN** the user clicks any row in the history table
- **THEN** the browser navigates to `/evaluate/history/{run_id}` for that row

### Requirement: Link to compare view from history page
The history page SHALL include a prominent link or button to `/evaluate/history/compare`.

#### Scenario: Compare button present
- **WHEN** the history page is loaded
- **THEN** a "Compare runs" button or link is visible that navigates to `/evaluate/history/compare`
