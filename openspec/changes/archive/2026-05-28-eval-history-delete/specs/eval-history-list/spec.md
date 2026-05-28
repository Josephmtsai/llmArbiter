## MODIFIED Requirements

### Requirement: History table row has delete action
Each row in the evaluation history table SHALL include a delete button in a dedicated "Actions" column. Clicking the button SHALL prompt the user for confirmation before sending the delete request.

#### Scenario: User confirms deletion
- **WHEN** user clicks the delete button on a row and confirms the browser prompt
- **THEN** `deleteEvalRun(run_id)` is called, and on success the row is removed from the table without a full page reload

#### Scenario: User cancels deletion
- **WHEN** user clicks the delete button on a row and dismisses the browser confirm prompt
- **THEN** no API call is made and the row remains in the table

#### Scenario: Deletion fails
- **WHEN** `deleteEvalRun(run_id)` returns an error
- **THEN** the row is NOT removed and an inline error message is displayed near the delete button

#### Scenario: Deleting the last row
- **WHEN** the final run in the list is deleted
- **THEN** the empty state "No evaluation runs yet." is displayed
