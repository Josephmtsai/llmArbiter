## ADDED Requirements

### Requirement: Review queue lists pending cases
The optimizer review queue SHALL list pending low-confidence relabeled cases with confidence, expected action, description, source dataset, log snippet preview, and row actions.

#### Scenario: Pending cases load
- **WHEN** `GET /review-queue` returns pending items
- **THEN** the review queue renders them in backend order with their key fields visible

#### Scenario: Review queue is empty
- **WHEN** `GET /review-queue` returns no items
- **THEN** the UI displays "No pending review cases. Low-confidence relabeled cases will appear here."

### Requirement: Review queue supports filtering without losing mutation state
The review queue SHALL provide search and action filter controls and SHALL preserve those controls after mutations.

#### Scenario: Filtered confirm
- **WHEN** an operator confirms a row while search or action filters are active
- **THEN** the queue refetches data and keeps the same filter values

### Requirement: Operator can confirm, correct, or reject a review entry
The review queue SHALL support confirm, correct with required expected action, and reject mutations.

#### Scenario: Confirm succeeds
- **WHEN** the operator confirms an entry and the backend returns success
- **THEN** the UI refetches review queue and eval pool stats

#### Scenario: Correct succeeds
- **WHEN** the operator selects a replacement expected action and submits correction successfully
- **THEN** the UI refetches review queue and eval pool stats

#### Scenario: Reject succeeds
- **WHEN** the operator rejects an entry successfully
- **THEN** the UI refetches review queue without requiring an eval pool stats refresh

#### Scenario: Correct missing action
- **WHEN** the operator attempts to correct without choosing an expected action
- **THEN** the UI keeps the modal open and shows a validation error

### Requirement: Review mutations have row-level pending and stale-row handling
The review queue SHALL show mutation progress at the row level and handle stale entries.

#### Scenario: Mutation in flight
- **WHEN** a review mutation is pending
- **THEN** only the affected row actions are disabled or marked pending

#### Scenario: Entry not found
- **WHEN** the backend returns `404 entry-not-found`
- **THEN** the UI removes or refetches the stale row after the operator acknowledges the message
