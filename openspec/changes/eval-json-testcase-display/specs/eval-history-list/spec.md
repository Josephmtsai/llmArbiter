## MODIFIED Requirements

### Requirement: Display evaluation run history table
The page at `/evaluate/history` SHALL fetch `GET /evaluate/history` on mount and render all runs in a table, newest first. Each row SHALL show: run_id, source classification, status, prompt_version_id, provider, model, accuracy, correct/total counts, timeout count, and started_at formatted as local date-time.

#### Scenario: Runs load successfully
- **WHEN** the page mounts and `GET /evaluate/history` returns a non-empty runs array
- **THEN** a table is rendered with one row per run, showing all required columns

#### Scenario: No runs exist
- **WHEN** `GET /evaluate/history` returns an empty runs array
- **THEN** an empty-state message is shown ("No evaluation runs yet.")

#### Scenario: API error
- **WHEN** `GET /evaluate/history` responds with a network error or non-success status
- **THEN** an error message is displayed and the table is not rendered

#### Scenario: Optimizer-triggered row
- **WHEN** a run ID is found in optimizer history baseline or round eval IDs
- **THEN** the source column marks the run as optimizer-triggered

#### Scenario: Manual row
- **WHEN** a run ID is not found in optimizer history baseline or round eval IDs
- **THEN** the source column marks the run as manual

### Requirement: Accuracy column uses status-aware colour-coded display
Accuracy SHALL be displayed as a percentage rounded to one decimal place only when the run has a completed-like status and accuracy is meaningful. The value SHALL be colour-coded: green (`--action-rebuild`) for >= 80%, yellow (`--action-fallback`) for 60% to 79%, red (`--action-notify`) for < 60%. For failed, running, or cancelled runs, the cell SHALL show `--` instead of a misleading `0%`.

#### Scenario: High accuracy completed run
- **WHEN** a completed run has `accuracy: 0.9032`
- **THEN** the cell shows "90.3%" in green

#### Scenario: Mid accuracy completed run
- **WHEN** a completed run has `accuracy: 0.65`
- **THEN** the cell shows "65.0%" in yellow

#### Scenario: Low accuracy completed run
- **WHEN** a completed run has `accuracy: 0.42`
- **THEN** the cell shows "42.0%" in red

#### Scenario: Failed run
- **WHEN** a run has `status: "failed"`
- **THEN** the accuracy cell shows `--`

#### Scenario: Running run
- **WHEN** a run has `status: "running"`
- **THEN** the accuracy cell shows `--`

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

### Requirement: History table row has delete action
Each row in the evaluation history table SHALL include a delete button in a dedicated "Actions" column. Clicking the button SHALL prompt the user for confirmation before sending the delete request.

#### Scenario: User confirms deletion
- **WHEN** user clicks the delete button on a row and confirms the browser prompt
- **THEN** `deleteEvalRun(run_id)` is called, and on success the row is removed from the table without a full page reload

#### Scenario: User cancels deletion
- **WHEN** user clicks the delete button on a row and dismisses the browser confirm prompt
- **THEN** no API call is made and the row remains in the table

#### Scenario: Deletion fails
- **WHEN** `deleteEvalRun(run_id)` returns an error
- **THEN** the row is NOT removed and an inline error message is displayed near the delete button

#### Scenario: Deleting the last row
- **WHEN** the final run in the list is deleted
- **THEN** the empty state "No evaluation runs yet." is displayed

### Requirement: Past Evaluations cards on evaluate index show model label
The inline Past Evaluations history cards on `/evaluate` (not the full history table) SHALL display the `model` field as a monospace chip when the value is non-empty. The chip SHALL appear after the provider label. When `model` is empty or absent the card layout is unchanged.

#### Scenario: Run has model set
- **WHEN** a history card represents an EvalRun with `model: "deepseek-flash"`
- **THEN** a mono chip displaying `deepseek-flash` is rendered alongside the provider chip in that card

#### Scenario: Run has no model
- **WHEN** a history card represents an EvalRun with `model: ""` or model absent
- **THEN** no model chip is rendered; the card layout is identical to before this change
