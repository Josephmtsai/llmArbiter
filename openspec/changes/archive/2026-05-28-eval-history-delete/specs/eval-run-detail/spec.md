## MODIFIED Requirements

### Requirement: Run detail page has delete action
The run detail page (`/evaluate/history/[run_id]`) SHALL display a delete button in the page header area. Clicking it SHALL prompt the user for confirmation before sending the delete request. On success, the user SHALL be navigated to `/evaluate/history`.

#### Scenario: User confirms deletion from detail page
- **WHEN** user clicks "Delete run" in the detail page header and confirms the browser prompt
- **THEN** `deleteEvalRun(run_id)` is called, and on success the user is navigated to `/evaluate/history`

#### Scenario: User cancels deletion from detail page
- **WHEN** user clicks "Delete run" and dismisses the browser confirm prompt
- **THEN** no API call is made and the user remains on the detail page

#### Scenario: Deletion fails on detail page
- **WHEN** `deleteEvalRun(run_id)` returns an error
- **THEN** the user remains on the detail page and an inline error message is displayed near the delete button

#### Scenario: Delete during load
- **WHEN** the run detail is still loading (not yet rendered)
- **THEN** the delete button is disabled until the run data is available
