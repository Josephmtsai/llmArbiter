### Requirement: Provider row is clickable and opens a dropdown
The sidebar footer provider row SHALL be interactive. Clicking it SHALL toggle an inline dropdown listing all providers from `available_providers`. The currently active provider SHALL be visually highlighted (e.g., bold or checkmark). Clicking outside the dropdown SHALL close it without making a change.

#### Scenario: Open dropdown
- **WHEN** user clicks the provider row in the sidebar footer
- **THEN** a dropdown appears listing all available providers with the active one highlighted

#### Scenario: Close on outside click
- **WHEN** the dropdown is open and user clicks anywhere outside it
- **THEN** the dropdown closes and no provider change is made

#### Scenario: Dropdown closed by default
- **WHEN** the sidebar mounts
- **THEN** the provider dropdown is closed

### Requirement: Selecting a provider switches it immediately (optimistic)
Clicking a provider in the dropdown SHALL immediately update the displayed active provider (optimistic), close the dropdown, and call `PATCH /config/provider`. On success the shared `sidebar:activeProvider` state is confirmed. On error the previous provider is restored and a brief error message is shown in the footer.

#### Scenario: Successful provider switch
- **WHEN** user clicks a non-active provider in the dropdown
- **THEN** the footer immediately shows the selected provider, the dropdown closes, and `PATCH /config/provider` is called in the background

#### Scenario: Provider switch fails
- **WHEN** `PATCH /config/provider` returns an error
- **THEN** the footer reverts to the previous provider and a brief error text is shown in the sidebar footer (e.g., "Switch failed")

#### Scenario: Clicking active provider does nothing
- **WHEN** user clicks the already-active provider in the dropdown
- **THEN** the dropdown closes and no API call is made

### Requirement: Dropdown is inaccessible while a switch is in flight
While a provider switch request is pending, the provider row SHALL be non-interactive (clicking it again is a no-op or the dropdown stays closed) to prevent concurrent conflicting requests.

#### Scenario: Click during in-flight request
- **WHEN** a `PATCH /config/provider` request is already in flight
- **THEN** clicking the provider row does not open the dropdown
