## ADDED Requirements

### Requirement: Eval run detail shows live accuracy while running

The UI SHALL display the current `correct`, `total`, and `accuracy` values from a running eval run without waiting for completion.

#### Scenario: In-progress counts are shown during polling

- **WHEN** an eval run has `status: 'running'` and polling returns `correct > 0`
- **THEN** the UI displays "X / Y completed (Z%)" using the live values

#### Scenario: Accuracy updates on each poll cycle

- **WHEN** the polling interval fires and the run is still `status: 'running'`
- **THEN** the displayed correct count and accuracy percentage update to reflect the latest values from the API response
