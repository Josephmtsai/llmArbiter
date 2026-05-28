## ADDED Requirements

### Requirement: Model selector visible when provider is openrouter
The Evaluate page SHALL display a model selector section only when the currently active provider is `openrouter`. The section SHALL be hidden for all other providers.

#### Scenario: Provider is openrouter
- **WHEN** the active provider returned by `GET /config/provider` is `openrouter`
- **THEN** the model selector section is rendered below the prompt version selector

#### Scenario: Provider is not openrouter
- **WHEN** the active provider is `ollama`, `claude`, or `codex`
- **THEN** no model selector is rendered and `model` is omitted from the evaluate request body

### Requirement: Model selector offers three shortcuts and a free-text input
The model selector SHALL offer exactly three quick-pick buttons (`DeepSeek Flash`, `Qwen Plus`, `HY3`) and one free-text input field for arbitrary OpenRouter model IDs. Selecting a quick-pick button SHALL set the model value to its corresponding shorthand key (`deepseek-flash`, `qwen-plus`, `hy3`). Typing in the free-text field SHALL clear any active quick-pick selection. Leaving both empty SHALL send no `model` field in the request (server uses its default).

#### Scenario: Quick-pick button selected
- **WHEN** user clicks "DeepSeek Flash"
- **THEN** model value is set to `deepseek-flash`, the button appears active/selected, and the free-text input is cleared

#### Scenario: Free-text overrides quick-pick
- **WHEN** user types a value in the free-text input
- **THEN** any active quick-pick button is deselected and the typed value will be sent as `model`

#### Scenario: No model selected
- **WHEN** no quick-pick is active and free-text input is empty
- **THEN** `model` is omitted from the `POST /evaluate` request body

### Requirement: Selected model is included in POST /evaluate request
When a model value is set (either from quick-pick or free-text), the `POST /evaluate` request body SHALL include `"model": "<value>"` as an optional field alongside `prompt_version_id`.

#### Scenario: Model field sent with evaluation
- **WHEN** model is set to `deepseek-flash` and user clicks "Run evaluation"
- **THEN** request body is `{ "prompt_version_id": <id>, "model": "deepseek-flash" }`

### Requirement: Active model label shown on Evaluate page
When provider is `openrouter`, the Evaluate page SHALL display a chip or label near the "Run evaluation" button showing the current provider and model (e.g., `openrouter · deepseek-flash`). When no model is selected the label SHALL show `openrouter · default`.

#### Scenario: Model selected, label shows shorthand
- **WHEN** provider is `openrouter` and model is `qwen-plus`
- **THEN** label reads `openrouter · qwen-plus`

#### Scenario: No model selected, label shows default
- **WHEN** provider is `openrouter` and no model is chosen
- **THEN** label reads `openrouter · default`

### Requirement: Sidebar footer shows active model for openrouter
When provider is `openrouter`, the sidebar footer provider display SHALL include a secondary line or inline note showing the active model shorthand (or "default" if none selected).

#### Scenario: Openrouter with model in sidebar
- **WHEN** active provider is `openrouter` and model `hy3` is selected
- **THEN** sidebar footer shows `openrouter` as the primary label and `hy3` as a secondary label beneath or inline

#### Scenario: Sidebar returns to single line for other providers
- **WHEN** active provider is `claude`
- **THEN** sidebar footer shows only `claude` with no secondary model line
