## ADDED Requirements

### Requirement: openrouter is a valid selectable provider
The provider selector (Settings / Config page) SHALL display `openrouter` as a selectable option whenever it appears in the `available_providers` array returned by `GET /config/provider`. Selecting it SHALL call `PATCH /config/provider` with `{ "provider": "openrouter" }`.

#### Scenario: openrouter in available_providers
- **WHEN** `GET /config/provider` returns `available_providers: ["ollama", "claude", "codex", "openrouter"]`
- **THEN** the provider selector renders four options including `openrouter`

#### Scenario: Selecting openrouter
- **WHEN** user selects `openrouter` from the provider dropdown
- **THEN** `PATCH /config/provider` is called with `{ "provider": "openrouter" }` and the active provider updates to `openrouter`

#### Scenario: openrouter absent from available_providers
- **WHEN** `GET /config/provider` returns `available_providers` without `openrouter`
- **THEN** the provider selector does not show `openrouter` as an option
