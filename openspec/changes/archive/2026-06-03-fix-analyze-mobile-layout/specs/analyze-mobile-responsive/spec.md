## ADDED Requirements

### Requirement: Single-column layout on mobile
On viewports with width ≤ 768 px the Analyze page layout SHALL stack to a single column, with the left content block appearing above the right rail, each occupying full available width.

#### Scenario: Right rail stacks below on mobile
- **WHEN** the viewport width is ≤ 768 px
- **THEN** the two-column grid collapses to one column and the right rail renders below the left content block

### Requirement: Input row wraps on mobile
The control row containing the "Failures in last 24h" field and the "Analyze" button SHALL stack vertically on mobile, with the button appearing first (top) and the field below.

#### Scenario: Analyze button visible without scrolling on mobile
- **WHEN** the viewport width is ≤ 768 px
- **THEN** the Analyze button appears above the Failures field in a single-column layout with full width

### Requirement: Result header wraps on mobile
The result header row containing the ActionBadge and provider/model meta chips SHALL wrap onto multiple lines on mobile so neither element is clipped or overflows the viewport.

#### Scenario: Result header wraps gracefully
- **WHEN** the viewport width is ≤ 768 px AND an analysis result is displayed
- **THEN** the ActionBadge and meta chips wrap without overflow or clipping

### Requirement: Run column aligns full-width on mobile
The run column (model chip + Analyze button) SHALL stretch to full width on mobile so the button is easy to tap.

#### Scenario: Full-width button on mobile
- **WHEN** the viewport width is ≤ 768 px
- **THEN** the Analyze button occupies the full container width
