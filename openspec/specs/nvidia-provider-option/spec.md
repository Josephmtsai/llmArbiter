## ADDED Requirements

### Requirement: Provider switcher includes NVIDIA NIM option

The UI SHALL include `nvidia` as a selectable provider in the provider switcher, displayed as "NVIDIA NIM".

#### Scenario: NVIDIA NIM appears in the provider list

- **WHEN** the user opens the provider switcher
- **THEN** "NVIDIA NIM" is listed as a selectable option alongside existing providers

#### Scenario: Selecting NVIDIA NIM updates the active provider

- **WHEN** the user selects "NVIDIA NIM"
- **THEN** the provider is set to `nvidia` and the UI reflects the active state
