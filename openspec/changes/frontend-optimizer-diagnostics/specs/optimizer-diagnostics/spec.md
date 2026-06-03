## ADDED Requirements

### Requirement: Optimizer round failure samples are inspectable
The UI SHALL show representative failed cases for a selected optimizer round when the backend provides failure samples.

#### Scenario: Failed case list is visible
- **WHEN** the user expands an optimizer round that has `failures`
- **THEN** the UI shows each failed case with expected action, predicted action, confidence, log snippet preview, and hardware metadata summary

#### Scenario: Missing failure samples are handled gracefully
- **WHEN** the user expands an optimizer round that has no `failures`
- **THEN** the UI does not render an empty broken failure-sample table

#### Scenario: Failed cases can be filtered by action pair
- **WHEN** a round has multiple failed cases with expected and predicted actions
- **THEN** the UI provides a compact way to filter or search failed cases by expected action and predicted action

### Requirement: Failed case detail is bounded and safe by default
The UI SHALL allow failed case details to be opened without exposing long or sensitive content by default.

#### Scenario: Long log snippets are bounded
- **WHEN** a failed case has a long `log_snippet`
- **THEN** the UI shows a bounded preview and requires explicit expansion to reveal more content

#### Scenario: Hardware metadata is summarized
- **WHEN** a failed case has `hardware_info`
- **THEN** the UI renders a readable key/value summary without displaying secret-like keys such as authorization headers or API keys

#### Scenario: Raw evaluator output is collapsed
- **WHEN** a failed case has `raw_output`
- **THEN** the UI renders raw output collapsed by default and requires explicit expansion before showing it

#### Scenario: Parsed evaluator output is formatted
- **WHEN** a failed case has `parsed_output`
- **THEN** the UI renders it as formatted structured data in a bounded detail area

### Requirement: Round failure analysis supports diagnostic field names
The UI SHALL display optimizer round failure analysis from the backend diagnostics payload.

#### Scenario: Failure analysis field is displayed
- **WHEN** a round has `failure_analysis`
- **THEN** the UI displays it in a readable collapsed panel

#### Scenario: Legacy analysis text remains supported
- **WHEN** a round has `analysis_text` but no `failure_analysis`
- **THEN** the UI displays `analysis_text` in the same failure analysis panel

### Requirement: Model comparison diagnostics are visible when available
The UI SHALL display optimizer model comparison results when the backend provides them.

#### Scenario: Model comparison table is shown
- **WHEN** an optimizer run has model comparison results
- **THEN** the UI shows model name, baseline accuracy, candidate accuracy, accuracy delta, failure count, generated prompt version ID, and would-keep decision

#### Scenario: Model comparison absence does not create noise
- **WHEN** an optimizer run has no model comparison results
- **THEN** the UI does not show an empty comparison table or error state

#### Scenario: Would-keep decision is visually clear
- **WHEN** a model comparison row has a would-keep decision
- **THEN** the UI displays a compact kept/rejected style badge for that decision

### Requirement: Optimizer diagnostics avoid secret and prompt exposure
The UI SHALL avoid accidental exposure of secrets and full raw prompt bodies in optimizer diagnostics.

#### Scenario: Secret-like fields are not rendered
- **WHEN** diagnostic metadata contains keys that look like secrets, API keys, authorization headers, or tokens
- **THEN** the UI omits or redacts those values

#### Scenario: Full raw prompts are not shown by default
- **WHEN** diagnostic payloads contain prompt-like raw text
- **THEN** the UI keeps it collapsed or bounded by default and does not make raw prompt bodies the primary display
