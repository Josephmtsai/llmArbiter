## ADDED Requirements

### Requirement: Time-window pill bar appears above the decisions table
The decisions page SHALL display a row of pill buttons above the filter/table area with the presets: **1h**, **6h**, **24h**, **7d**, **All**. Exactly one pill SHALL be active at a time. The default active preset SHALL be **All** (no time restriction). The active pill SHALL be visually distinguished from inactive pills.

#### Scenario: Default state
- **WHEN** the decisions page loads
- **THEN** the "All" pill is active and the table shows decisions without a time restriction

#### Scenario: Active pill highlighted
- **WHEN** user views the time-window pill bar
- **THEN** exactly one pill is visually active; all others are in the inactive style

### Requirement: Selecting a preset filters decisions by time window
Clicking a preset pill SHALL:
1. Set it as the active preset
2. Reset pagination to page 0
3. Re-fetch decisions passing `since = new Date(Date.now() - presetMs).toISOString()` for timed presets, or `since = null` for "All"

The preset-to-milliseconds mapping SHALL be: 1h → 3 600 000, 6h → 21 600 000, 24h → 86 400 000, 7d → 604 800 000.

#### Scenario: Select 1h preset
- **WHEN** user clicks the "1h" pill
- **THEN** `getDecisions({ since: <1 hour ago ISO string>, action: <current filter> })` is called, page resets to 0, and only decisions from the last hour are shown

#### Scenario: Select All preset
- **WHEN** user clicks the "All" pill
- **THEN** `getDecisions({ since: null, action: <current filter> })` is called with no time restriction

#### Scenario: Time filter combines with action filter
- **WHEN** an action filter is active (e.g., "trigger_rebuild") and user selects "24h"
- **THEN** `getDecisions({ action: 'trigger_rebuild', since: <24h ago ISO string> })` is called — both filters apply simultaneously

### Requirement: Time filter resets pagination on change
Changing the time window SHALL always reset the current page to 0 before fetching.

#### Scenario: Page reset on window change
- **WHEN** user is on page 3 and clicks "6h"
- **THEN** page resets to 0 (first page) and decisions are fetched with the new `since` value

### Requirement: Time window is session-local
The selected time window SHALL not persist across page refreshes. On every mount the default is "All".

#### Scenario: Refresh resets to All
- **WHEN** user refreshes the decisions page
- **THEN** the active preset is "All" regardless of what was selected before
