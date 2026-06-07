## Requirements

### Requirement: GuideTooltip component renders an inline hoverable definition
The `GuideTooltip` component SHALL wrap a term in a styled span; on hover or keyboard focus a panel SHALL appear with the definition text.

#### Scenario: Tooltip visible on hover
- **WHEN** the operator hovers over a term wrapped in `<GuideTooltip>`
- **THEN** a panel SHALL appear adjacent to the term containing the `text` prop content

#### Scenario: Tooltip visible on keyboard focus
- **WHEN** the operator focuses a `<GuideTooltip>` element via keyboard navigation
- **THEN** the same panel SHALL appear (accessible equivalent of hover)

#### Scenario: Tooltip panel stays within viewport
- **WHEN** a tooltip is near the right or left edge of the viewport
- **THEN** the panel SHALL remain fully visible without horizontal overflow

### Requirement: Six metric terms in the guide page use GuideTooltip
The guide page SHALL wrap the following six terms with `<GuideTooltip>` using the exact copy from `docs/frontend-auto-prompt-optimizer-spec.md`.

#### Scenario: baseline_accuracy tooltip shown
- **WHEN** the operator hovers "Baseline accuracy"
- **THEN** the tooltip SHALL read: "Accuracy of the active prompt on the run's fixed validation snapshot before any candidate prompt was generated."

#### Scenario: best_accuracy tooltip shown
- **WHEN** the operator hovers "Best accuracy"
- **THEN** the tooltip SHALL read: "Best validation accuracy reached by baseline or kept/evaluated rounds. This is not the final test accuracy."

#### Scenario: test_accuracy tooltip shown
- **WHEN** the operator hovers "Test accuracy"
- **THEN** the tooltip SHALL read: "Accuracy of the final active prompt on a separate test snapshot after the optimizer loop finished."

#### Scenario: accuracy_delta tooltip shown
- **WHEN** the operator hovers "Accuracy delta" or "validation accuracy delta"
- **THEN** the tooltip SHALL clarify this is validation accuracy movement, not final test accuracy

#### Scenario: val snapshot tooltip shown
- **WHEN** the operator hovers "Validation snapshot" or "val snapshot"
- **THEN** the tooltip SHALL read: "A fixed set of 200 validation cases (40 per action) sampled once at run start. Every round in the same run uses the same 200 cases — so accuracy numbers across rounds are directly comparable."

#### Scenario: regression tolerance tooltip shown
- **WHEN** the operator hovers "Regression tolerance"
- **THEN** the tooltip SHALL explain: "The maximum allowed drop in per-action accuracy before a candidate is rejected even if overall accuracy improved. Protected actions (notify_human, send_email) have a stricter 2% tolerance; other actions allow 5%."
