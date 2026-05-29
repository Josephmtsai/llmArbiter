# Auto Prompt Optimizer Frontend Spec

## Goal

Build a frontend workflow for Auto Prompt Optimizer so an operator can:

- inspect eval pool coverage by action
- review low-confidence relabeled cases
- run pool-sourced evaluation
- start/cancel prompt optimization
- inspect optimizer round history and prompt candidates

This spec assumes the frontend is a Nuxt app using server-side API proxy routes.
The browser MUST NOT call Arbiter directly with `X-API-Key`; Nuxt server routes
hold `NUXT_API_BASE_URL` and `NUXT_API_KEY` in runtime config.

## Information Architecture

```text
/optimizer
  Overview dashboard
  - eval pool coverage
  - latest optimizer status
  - start optimizer controls
  - recent accuracy trend

/optimizer/review-queue
  Human review workflow
  - pending low-confidence cases
  - confirm / correct / reject actions

/optimizer/evaluations
  Pool-sourced evaluation workflow
  - trigger source=pool evaluation
  - link to existing evaluation jobs/history

/optimizer/history
  Optimizer run history
  - run list
  - round timeline
  - prompt version links
```

The first implementation MAY combine these into one `/optimizer` page with tabs.

## Shared Domain Terms

Valid action values:

```ts
export type ArbiterAction =
  | 'trigger_rebuild'
  | 'trigger_fallback'
  | 'trigger_restart'
  | 'notify_human'
  | 'send_email'
```

Display labels:

| Value | Label | Intent |
| --- | --- | --- |
| `trigger_rebuild` | Rebuild | Retry likely fixes a transient build failure |
| `trigger_fallback` | Fallback | Switch to backup path, mirror, or environment |
| `trigger_restart` | Restart | Restart a crashed service, runner, or agent |
| `notify_human` | Notify Human | Needs investigation before action |
| `send_email` | Escalate | Critical incident requiring immediate notification |

## Backend API Base Contract

Most successful responses use this envelope:

```ts
export interface ApiEnvelope<T> {
  status: 'success' | 'error'
  data: T
  message: string
}
```

FastAPI validation and `HTTPException` errors may use:

```ts
export interface ApiError {
  detail: string | Array<Record<string, unknown>>
}
```

Frontend code must support both shapes.

## Screen 1: Optimizer Overview

### Purpose

Show whether the optimizer can be run safely and expose the main operator actions.

### Layout

```text
Header
  Title: Auto Prompt Optimizer
  Right side: Refresh button

Status row
  Eval Pool Total
  Lowest Action Coverage
  Review Queue Pending
  Latest Optimizer Status

Main grid
  Left: Start Optimizer panel
  Right: Accuracy trend chart

Lower section
  Recent optimizer runs table
```

### Components

`EvalPoolStatsCard`

- shows total pool size
- shows one compact bar per action
- warns when any action has fewer than 20 cases
- disables pool evaluation CTA when total is 0

`StartOptimizerPanel`

- numeric input: `max_rounds`, default `5`, min `1`, max `20`
- numeric input or slider: `target_accuracy`, default `0.9`, min `0.01`, max `1`
- primary button: Start optimizer
- disabled when an optimizer run is active

`AccuracyTrendChart`

- x-axis: round number
- y-axis: accuracy percentage
- one line per recent optimizer run, or only latest run for MVP

`RecentOptimizerRunsTable`

- columns: run id, status, started at, finished at, rounds, best accuracy
- row click opens run detail panel or navigates to `/optimizer/history`

### API

#### GET `/eval-pool/stats`

Used by `EvalPoolStatsCard`.

Response:

```json
{
  "status": "success",
  "data": {
    "total": 500,
    "by_action": {
      "trigger_rebuild": 100,
      "trigger_fallback": 100,
      "trigger_restart": 100,
      "notify_human": 100,
      "send_email": 100
    }
  },
  "message": ""
}
```

Type:

```ts
export interface EvalPoolStats {
  total: number
  by_action: Partial<Record<ArbiterAction | string, number>>
}
```

#### GET `/optimizer/history`

Used by overview and history pages.

Response:

```json
{
  "status": "success",
  "data": {
    "runs": [
      {
        "optimizer_run_id": 1,
        "status": "completed",
        "max_rounds": 5,
        "target_accuracy": 0.9,
        "started_at": "2026-05-29T10:00:00+00:00",
        "finished_at": "2026-05-29T10:12:00+00:00",
        "rounds": [
          {
            "round_number": 1,
            "accuracy": 0.72,
            "prompt_version_id": 2,
            "failed_case_count": 28,
            "kept": true
          }
        ]
      }
    ]
  },
  "message": ""
}
```

Type:

```ts
export type OptimizerRunStatus =
  | 'running'
  | 'completed'
  | 'completed_max_rounds'
  | 'failed'
  | 'cancelled'

export interface OptimizerRound {
  round_number: number
  accuracy: number
  prompt_version_id: number
  failed_case_count: number
  kept?: boolean
}

export interface OptimizerRun {
  optimizer_run_id: number
  status: OptimizerRunStatus
  max_rounds: number
  target_accuracy: number
  started_at: string
  finished_at: string | null
  rounds: OptimizerRound[]
}
```

#### POST `/optimizer/run`

Used by `StartOptimizerPanel`.

Request:

```json
{
  "max_rounds": 5,
  "target_accuracy": 0.9
}
```

Success response, HTTP 202:

```json
{
  "status": "success",
  "data": {
    "optimizer_run_id": 1,
    "status": "running"
  },
  "message": ""
}
```

Conflict response, HTTP 409:

```json
{
  "detail": "optimizer-already-running"
}
```

Frontend behavior:

- on 202: show running banner and poll `/optimizer/history`
- on 409: show "An optimizer run is already active"
- on other error: show generic failure message

#### DELETE `/optimizer/runs/{id}`

Used by running banner or run detail.

Success response, HTTP 202:

```json
{
  "status": "success",
  "data": {
    "optimizer_run_id": 1,
    "status": "cancelling"
  },
  "message": ""
}
```

Frontend behavior:

- show "Cancelling after current round"
- keep polling `/optimizer/history`
- do not remove the run from the UI

## Screen 2: Review Queue

### Purpose

Let an operator curate low-confidence relabeled examples before they enter the
eval pool.

### Layout

```text
Toolbar
  Search text
  Action filter
  Refresh button

Table
  Confidence
  Expected Action
  Description
  Source Dataset
  Log Snippet Preview
  Actions

Side panel / modal
  Full log snippet
  Hardware info JSON
  Reasoning
  Confirm / Correct / Reject
```

### API

#### GET `/review-queue`

Response:

```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "id": "abc123",
        "description": "runner timeout on checkout",
        "log_snippet": "fatal: unable to access ...",
        "hardware_info": {
          "node": "agent-01"
        },
        "expected_action": "trigger_rebuild",
        "confidence": 0.63,
        "reasoning": "Looks transient but not certain.",
        "source_dataset": "logchunks",
        "status": "pending"
      }
    ],
    "total": 1
  },
  "message": ""
}
```

Type:

```ts
export interface ReviewQueueEntry {
  id: string
  description: string
  log_snippet: string
  hardware_info: Record<string, unknown>
  expected_action: ArbiterAction | string
  confidence: number
  reasoning?: string
  source_dataset: string
  status: 'pending' | string
}

export interface ReviewQueueResponse {
  items: ReviewQueueEntry[]
  total: number
}
```

#### PATCH `/review-queue/{id}`

Confirm the current label:

```json
{
  "action": "confirm"
}
```

Correct the label:

```json
{
  "action": "correct",
  "expected_action": "trigger_fallback"
}
```

Reject the case:

```json
{
  "action": "reject"
}
```

Success response:

```json
{
  "status": "success",
  "data": {},
  "message": "abc123 moved to pool"
}
```

Frontend behavior:

- after success, refetch `/review-queue`
- after confirm/correct, also refetch `/eval-pool/stats`
- keep the user's table filters unchanged
- show row-level pending state while mutation is in flight

Validation behavior:

- if `action = correct`, `expected_action` is required
- if backend returns 400, keep modal open and show the error
- if backend returns 404, remove the stale row after user dismisses message

## Screen 3: Pool-Sourced Evaluation

### Purpose

Run an evaluation against the dynamic eval pool instead of DB seed cases.

### API

#### POST `/evaluate`

Request:

```json
{
  "prompt_version_id": "active",
  "source": "pool"
}
```

Optional model override for OpenRouter-compatible usage:

```json
{
  "prompt_version_id": "active",
  "source": "pool",
  "model": "qwen-plus"
}
```

Success response, HTTP 202:

```json
{
  "status": "success",
  "data": {
    "run_id": 42,
    "status": "running"
  },
  "message": ""
}
```

Expected pool-empty response, HTTP 400:

```json
{
  "detail": "eval-pool-empty"
}
```

Frontend behavior:

- disable button when eval pool total is 0
- on 202, link to existing evaluation job/history page
- poll existing `GET /evaluate/jobs` if the app already has job progress UI
- if `detail = "eval-pool-empty"`, show "Eval pool is empty. Import or review cases first."

Backend note:

- The OpenSpec requires `eval-pool-empty` to return 400. Confirm backend behavior
  before relying on this in production.

## Screen 4: Optimizer History

### Purpose

Let an operator inspect optimization progress and decide whether to activate a
generated prompt version.

### Layout

```text
Run list
  Run id
  Status
  Target accuracy
  Best accuracy
  Started
  Finished

Run detail
  Accuracy trend chart
  Round table
  Prompt version links
```

### Round Table Columns

- round number
- accuracy as percentage
- failed case count
- prompt version id
- kept flag
- action: View prompt

For "View prompt", link to the existing prompt management route if available.
Generated prompt versions are inactive by design. Activation must remain an
explicit operator action through the existing prompt activation workflow.

## Polling Rules

When any optimizer run has `status = "running"`:

- poll `/optimizer/history` every 3 seconds
- stop polling when all runs are terminal
- terminal statuses: `completed`, `completed_max_rounds`, `failed`, `cancelled`

When a pool evaluation has just started:

- poll existing evaluation jobs/history using the returned `run_id`
- stop polling when status is no longer `running`

## Empty States

Eval pool empty:

```text
No eval pool cases yet.
Import a dataset or review pending relabeled cases before running pool evaluation.
```

Review queue empty:

```text
No pending review cases.
Low-confidence relabeled cases will appear here.
```

Optimizer history empty:

```text
No optimizer runs yet.
Start an optimization run after the eval pool has enough coverage.
```

## Error Handling

| Case | UI behavior |
| --- | --- |
| `401` | Redirect to login or show session/auth error |
| `400 detail=eval-pool-empty` | Show eval pool empty guidance |
| `400 expected_action required for correct` | Keep correction modal open |
| `404 entry-not-found` | Remove stale review row after acknowledgement |
| `404 optimizer-run-not-found` | Refetch history |
| `409 optimizer-already-running` | Show active-run conflict message and refetch history |
| `422` | Show validation errors beside affected fields |
| `500` | Show generic retryable error |

## Nuxt Server Proxy Recommendation

Suggested server route structure:

```text
server/api/arbiter/eval-pool/stats.get.ts
server/api/arbiter/review-queue/index.get.ts
server/api/arbiter/review-queue/[id].patch.ts
server/api/arbiter/evaluate.post.ts
server/api/arbiter/optimizer/run.post.ts
server/api/arbiter/optimizer/history.get.ts
server/api/arbiter/optimizer/runs/[id].delete.ts
```

Each server route should:

- read `apiBaseUrl` and `apiKey` from private runtime config
- forward `X-API-Key` only from server to Arbiter
- normalize backend errors into a stable frontend error shape
- preserve backend HTTP status codes

## Visual Design Notes

- This is an operator dashboard, not a landing page.
- Prefer dense, scannable controls over marketing-style cards.
- Use compact stat panels, tables, tabs, and charts.
- Action values should use colored badges, but avoid depending on color alone.
- Dangerous or irreversible actions, such as reject and cancel, need confirmation.
- Keep log snippets in monospace with line wrapping and expandable full view.

## Acceptance Criteria

- The overview page displays eval pool total and per-action counts.
- The overview page can start an optimizer run and handles 409 conflict.
- The overview page shows running optimizer state and can request cancellation.
- The review queue page lists pending cases sorted by backend order.
- The review queue page supports confirm, correct, and reject.
- Confirm/correct moves the entry out of review queue and refreshes stats.
- Pool-sourced evaluation can be started with `source = "pool"`.
- Empty eval pool and empty review queue states are clear.
- Optimizer history shows per-round accuracy and prompt version id.
- The frontend never exposes Arbiter API key to browser JavaScript.

## Backend Readiness Notes

Before frontend QA, confirm these backend items:

- `POST /evaluate` returns HTTP 400 with `detail = "eval-pool-empty"` when the
  eval pool is empty.
- `GET /optimizer/history` includes active runs while they are running.
- `GET /review-queue` returns only pending entries and sorts by confidence.
- The current deployment has non-empty `data/eval_pool.json` for non-empty UI QA,
  or seed fixtures are available for demo/testing.
- OpenAPI `/openapi.json` includes the optimizer router so frontend types can be
  generated.
