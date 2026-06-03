## ADDED Requirements

### Requirement: Dimension toggle between provider and prompt_version
The page at `/evaluate/history/compare` SHALL display a two-option toggle ("By provider" / "By prompt version") that controls the active dimension. On mount the page SHALL default to `by=provider` and fetch `GET /evaluate/history/compare?by=provider`.

#### Scenario: Default state on mount
- **WHEN** the compare page loads
- **THEN** the "By provider" option is selected and provider-grouped data is fetched and rendered

#### Scenario: Switch to prompt version
- **WHEN** the user clicks "By prompt version"
- **THEN** a new request is made to `GET /evaluate/history/compare?by=prompt_version` and the chart re-renders with prompt-version groups

### Requirement: By-provider view — grouped bar chart
When `by=provider` is active, the page SHALL render a bar chart where each group is a `(provider, model)` combination. Each group SHALL show: avg_accuracy bar, best_accuracy bar (lighter shade), run_count, and a label of `provider / model`. The Y-axis represents accuracy (0–100%). Bars SHALL use the existing action colour tokens where there is a natural mapping; otherwise use a distinct colour per group.

#### Scenario: Multiple providers
- **WHEN** the response contains two or more provider groups
- **THEN** each group is rendered as a side-by-side pair of bars (avg and best) with a group label below

#### Scenario: Single provider
- **WHEN** only one provider group exists
- **THEN** a single bar group is rendered and a note "Add more providers to compare" is shown

#### Scenario: Empty data
- **WHEN** `groups` array is empty
- **THEN** an empty-state message "No evaluation data yet." is shown

### Requirement: By-provider view — summary table below chart
Below the bar chart the page SHALL render a summary table with columns: Provider, Model, Runs, Avg Accuracy, Best Accuracy. Rows are sorted by avg_accuracy descending.

#### Scenario: Table rendered
- **WHEN** provider data loads
- **THEN** the summary table appears below the chart with one row per group, sorted best-first

### Requirement: By-prompt-version view — bar chart per prompt version
When `by=prompt_version` is active, the page SHALL render a bar chart where each group on the X-axis is a `prompt_version_id`. Each bar represents avg_accuracy for that version. The chart SHALL include run_count as a secondary label beneath each bar.

#### Scenario: Multiple prompt versions
- **WHEN** the response contains two or more prompt version groups
- **THEN** one bar per version is rendered with the version ID as label and run count beneath

#### Scenario: Single prompt version
- **WHEN** only one prompt version group exists
- **THEN** a single bar is rendered with a note "Only one prompt version evaluated so far."

### Requirement: Individual run dots on bar chart (by-provider mode)
In by-provider mode, each individual run within a group SHALL be rendered as a small circle overlaid on the bar at the corresponding accuracy height, allowing users to see variance within a group.

#### Scenario: Multiple runs in a group
- **WHEN** a provider group has run_count > 1
- **THEN** small dots appear at the accuracy positions of each individual run inside the bar

#### Scenario: Single run in group
- **WHEN** a provider group has run_count = 1
- **THEN** no dots are rendered (only the bar itself)

### Requirement: Clicking a run dot navigates to run detail
Each individual run dot in the chart SHALL be clickable and navigate to `/evaluate/history/{run_id}`.

#### Scenario: User clicks a run dot
- **WHEN** the user clicks a dot representing a specific run
- **THEN** the browser navigates to `/evaluate/history/{run_id}` for that run
