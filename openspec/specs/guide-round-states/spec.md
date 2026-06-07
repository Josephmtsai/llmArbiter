## Requirements

### Requirement: Guide page shows all four round outcome states with badges
The guide page SHALL include a section listing all possible round outcomes using the same visual badge styles as the optimizer history view.

#### Scenario: Kept state shown with green badge
- **WHEN** the operator views the round states section
- **THEN** the "Kept" outcome SHALL display a green badge (`.optimizer-history__kept-badge--kept`) with explanation: "Candidate passed both gates — overall accuracy improved and no protected action regressed beyond tolerance. The candidate became the new active best prompt for subsequent rounds."

#### Scenario: Rejected overall state shown with red badge
- **WHEN** the operator views the round states section
- **THEN** the "Rejected: no overall improvement" outcome SHALL display a red badge (`.optimizer-history__kept-badge--rejected`) with explanation: "Overall validation accuracy did not improve compared to the previous best. The previous best prompt is kept."

#### Scenario: Rejected regression state shown with red badge and action name
- **WHEN** the operator views the round states section
- **THEN** the "Rejected: action regression" outcome SHALL display a red badge with explanation: "Overall accuracy improved, but at least one protected action (notify_human or send_email) regressed beyond its tolerance. Even a net improvement is rejected when a critical action degrades."

#### Scenario: Skipped state shown with amber badge
- **WHEN** the operator views the round states section
- **THEN** the "Skipped" outcome SHALL display an amber badge (`.optimizer-history__kept-badge--skipped`) with explanation: "The optimizer model did not return a usable candidate prompt. Common reasons: invalid JSON, missing action fields, unsupported action values. A skipped round is NOT evidence the prompt got worse — it means no candidate was tested."

#### Scenario: Common skip reasons listed
- **WHEN** the operator views the Skipped state card
- **THEN** the following skip reason codes SHALL be listed in monospace: `optimizer-candidate-invalid-json`, `optimizer-candidate-missing-actions`, `optimizer-candidate-missing-json-contract`, `optimizer-candidate-missing-fields`, `optimizer-candidate-unsupported-actions`
