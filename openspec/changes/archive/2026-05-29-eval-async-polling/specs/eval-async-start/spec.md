## ADDED Requirements

### Requirement: Evaluation starts asynchronously and returns a run_id
Clicking "Run evaluation" SHALL call `POST /evaluate` and expect a `202 Accepted` response containing `{ run_id, status: "running" }`. The UI SHALL NOT block waiting for results; instead the `run_id` SHALL be handed to the polling flow immediately.

#### Scenario: Successful async start
- **WHEN** user clicks "Run evaluation" with a valid prompt selected
- **THEN** `POST /evaluate` is called, the response `run_id` is captured, and the polling flow begins

#### Scenario: 429 concurrent limit exceeded
- **WHEN** `POST /evaluate` responds with HTTP 429 and `detail: "max-concurrent-jobs-exceeded"`
- **THEN** the button returns to its ready state and an inline message reads "Max concurrent evaluations reached. Wait for a running job to finish."

#### Scenario: 404 prompt not found
- **WHEN** `POST /evaluate` responds with HTTP 404 (detail contains `no-active-prompt` or `prompt-not-found`)
- **THEN** an inline error message describes the issue and no polling starts

### Requirement: Run button is disabled while a job is active
While `activeJob` is set (a job is in progress), the "Run evaluation" button SHALL be disabled to prevent starting a second job from the same page.

#### Scenario: Button disabled during active job
- **WHEN** a job is running and `activeJob` is non-null
- **THEN** the "Run evaluation" button is disabled and shows no loading spinner (the progress section shows progress instead)
