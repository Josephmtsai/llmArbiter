## ADDED Requirements

### Requirement: Accuracy delta badge shown after evaluation run
After a successful evaluation, the Accuracy summary stat SHALL display a delta badge comparing the new accuracy to the most recent prior run's accuracy. The badge SHALL be omitted when no prior run exists at the time of execution. The delta SHALL be computed as `(newAccuracy - priorAccuracy) × 100`, rounded to one decimal place.

#### Scenario: Positive delta
- **WHEN** new accuracy is 0.85 and prior run accuracy was 0.80
- **THEN** delta badge reads `▲ +5.0%` in green (success colour)

#### Scenario: Negative delta
- **WHEN** new accuracy is 0.70 and prior run accuracy was 0.75
- **THEN** delta badge reads `▼ −5.0%` in red (danger colour)

#### Scenario: Zero delta
- **WHEN** new accuracy equals prior run accuracy exactly
- **THEN** delta badge reads `→ 0.0%` in neutral colour

#### Scenario: No prior run
- **WHEN** the history list is empty at the time the evaluation is run
- **THEN** no delta badge is displayed; only the raw accuracy value is shown

#### Scenario: Delta cleared on next run start
- **WHEN** user clicks "Run evaluation" again
- **THEN** the previous delta badge is cleared (result is reset to null) until the new run completes

### Requirement: Prior accuracy snapshot taken before history refresh
The prior run accuracy SHALL be captured from `history[0].accuracy` synchronously before the post-run `loadHistory()` call, so the comparison is always against the run that existed before the new result.

#### Scenario: Snapshot before refresh
- **WHEN** a run completes and `history` contains at least one entry
- **THEN** `priorAccuracy` is set to `history[0].accuracy` before `await loadHistory()` executes
