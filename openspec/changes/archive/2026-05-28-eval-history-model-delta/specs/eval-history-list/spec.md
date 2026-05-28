## ADDED Requirements

### Requirement: Past Evaluations cards on evaluate index show model label
The inline Past Evaluations history cards on `/evaluate` (not the full history table) SHALL display the `model` field as a monospace chip when the value is non-empty. The chip SHALL appear after the provider label. When `model` is empty or absent the card layout is unchanged.

#### Scenario: Run has model set
- **WHEN** a history card represents an EvalRun with `model: "deepseek-flash"`
- **THEN** a mono chip displaying `deepseek-flash` is rendered alongside the provider chip in that card

#### Scenario: Run has no model
- **WHEN** a history card represents an EvalRun with `model: ""`  or model absent
- **THEN** no model chip is rendered; the card layout is identical to before this change
