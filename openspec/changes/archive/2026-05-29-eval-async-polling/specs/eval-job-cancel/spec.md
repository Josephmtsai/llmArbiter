## ADDED Requirements

### Requirement: Cancel button visible and functional while job is active
While `activeJob` is non-null, a "Cancel" button SHALL be visible in the progress section. Clicking it SHALL call `DELETE /evaluate/jobs/{run_id}`.

#### Scenario: Successful cancel (204)
- **WHEN** user clicks "Cancel" and `DELETE /evaluate/jobs/{run_id}` returns 204
- **THEN** polling stops, `activeJob` is cleared, and the UI returns to the ready state with message "Evaluation cancelled"

#### Scenario: Job already ended (409 job-not-running)
- **WHEN** `DELETE /evaluate/jobs/{run_id}` returns 409
- **THEN** treat as the job having just finished: stop polling and immediately fetch `GET /evaluate/history/{run_id}` for the final result

#### Scenario: Cancellation timed out (503)
- **WHEN** `DELETE /evaluate/jobs/{run_id}` returns 503
- **THEN** show inline error "Cancellation timed out — the job may still complete" and continue polling until the job disappears naturally

#### Scenario: Cancel button disabled while cancelling
- **WHEN** a cancel request is in flight
- **THEN** the Cancel button is disabled until the response is received
