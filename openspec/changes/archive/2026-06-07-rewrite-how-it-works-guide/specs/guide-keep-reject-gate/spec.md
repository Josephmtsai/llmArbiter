## ADDED Requirements

### Requirement: Guide page explains the two-gate keep/reject system
The guide page SHALL include a dedicated section that explains both gates a candidate prompt must pass before being kept.

#### Scenario: Gate 1 shown with overall accuracy formula
- **WHEN** the operator views the keep/reject gate section
- **THEN** Gate 1 SHALL display the rule `round_accuracy > previous_best_accuracy` and label it "Overall accuracy must improve"

#### Scenario: Gate 1 rejection example shown
- **WHEN** the operator views Gate 1
- **THEN** a worked example SHALL show a case where round_accuracy (0.60) is below previous_best (0.76), producing reject_reason "no overall improvement"

#### Scenario: Gate 2 shown with per-action tolerance table
- **WHEN** the operator views the keep/reject gate section
- **THEN** Gate 2 SHALL display a table with columns Action, Tolerance, and Applies When, listing:
  - notify_human: ±2% (baseline ≥ 10 samples)
  - send_email: ±2% (baseline ≥ 10 samples)
  - trigger_rebuild / trigger_fallback / trigger_restart: ±5% (baseline ≥ 10 samples)

#### Scenario: Gate 2 rejection example shown
- **WHEN** the operator views Gate 2
- **THEN** a worked example SHALL show a case where overall accuracy improves (0.79 > 0.76) but send_email delta (−0.06) exceeds its tolerance (0.02), producing reject_reason starting with "action-regressed:send_email"

#### Scenario: Gate 2 skipped when baseline sample count is low
- **WHEN** the operator views Gate 2
- **THEN** the section SHALL note that the regression gate applies only when the baseline has at least 10 samples for that action; below 10 samples the action is treated as passing

#### Scenario: Both gates must pass for a kept round
- **WHEN** the operator views the section summary
- **THEN** copy SHALL make clear that `kept = overall_pass AND all(action_pass)` — both gates must pass simultaneously
