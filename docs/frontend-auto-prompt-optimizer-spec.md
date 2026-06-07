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
  - selected run detail
  - round timeline from detail route
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

## How Auto Prompt Optimization Works

This section is intended for frontend UI copy, diagrams, tooltips, and run detail
explanations. The optimizer is not comparing prompts against changing random
data every round. It freezes one validation snapshot for the whole run, compares
each candidate against the current best prompt on that same snapshot, and only
uses the test split once at the end.

### Data Splits

The eval pool is split by action into train/validation/test groups. The backend
targets this ratio per expected action:

```text
train_count(action) = round(total_count(action) * 0.60)
val_count(action)   = round(total_count(action) * 0.20)
test_count(action)  = total_count(action) - train_count(action) - val_count(action)
```

Near-duplicate entries are grouped by `hardware_info.split_group` when present,
otherwise by normalized `log_snippet`. A group is assigned to only one split so
similar log chunks do not leak across train, validation, and test views.

Current pool note, after the June 2026 expansion:

```text
total_pool_size = 12000
actions = 5
cases_per_action = 2400

train = 10400 total = 2080 per action
val   =   800 total =  160 per action
test  =   800 total =  160 per action
```

The expanded pool mixes synthetic cases with public-log-derived cases from
BGL, HPC, and LogChunks. The UI should treat the pool as a labeled evaluation
dataset, not as prompts. The optimizer learns from evaluation failures on this
dataset; it does not train a model on all 12000 entries.

Frontend display suggestion:

```text
Eval pool: 12000 cases
Balanced actions: 2400 each
Validation capacity: 800 cases
Test capacity: 800 cases
Optimizer per run: samples a fixed subset from val/test
```

### Validation Snapshot

When an optimizer run starts, the backend samples a fixed validation snapshot:

```text
val_sample_per_action = optimizer_val_n_per_action // default 40
val_snapshot_ids =
  sample up to val_sample_per_action cases from each action in split = "val"
max_val_size = 5 actions * 40 = 200 cases
```

If an action has fewer than 40 validation cases, the backend samples all
available cases for that action. The selected `val_snapshot_ids` are stored on
the run detail and reused for:

- the baseline evaluation;
- every candidate round evaluation;
- per-action regression comparisons.

Frontend implication: show `val_snapshot_ids.length` as the validation sample
size. Do not imply that each round used new random data.

With the current 12000-entry pool:

```text
available_val_per_action = 160
configured_val_sample_per_action = 40
actual_val_sample_per_action = min(160, 40) = 40
actual_val_snapshot_size = 5 * 40 = 200
```

The snapshot is sampled once per optimizer run. A different optimizer run may
sample a different validation snapshot, but all rounds inside one run use the
same `val_snapshot_ids`.

### How A New Prompt Is Evaluated

When the optimizer generates a new prompt candidate, the backend does not
immediately trust it and does not evaluate it on all 12000 cases. It creates a
new prompt version, evaluates that prompt version on the run's fixed validation
snapshot, and only activates it when it beats the current best prompt without
breaking protected actions.

Flow:

```text
active_prompt_id
  -> baseline eval on val_snapshot_ids
  -> optimizer model proposes candidate_prompt
  -> backend creates candidate PromptVersion
  -> candidate eval on the same val_snapshot_ids
  -> keep/reject gate
  -> if kept: activate candidate PromptVersion
  -> if rejected: keep previous active PromptVersion
```

Important UI wording:

```text
New prompt candidate was tested on the same validation snapshot as baseline.
```

Avoid wording like:

```text
New prompt was trained on 12000 cases.
```

The optimizer is prompt search plus validation gating, not model fine-tuning.

### Why Not Evaluate Every Round On 12000 Cases

The 12000-entry pool is the full labeled pool. Running every candidate on all
12000 cases would be slow and expensive. The backend uses smaller balanced
snapshots for optimization:

```text
per_round_eval_size = val_snapshot_ids.length
default_per_round_eval_size = 200

final_test_eval_size = test_snapshot_ids.length
default_final_test_eval_size = 400
```

This gives fast iteration while still keeping each round comparable. The final
test snapshot is larger than the validation snapshot to provide a stronger
post-run signal.

### Baseline Evaluation

The baseline is the active prompt at the moment the optimizer starts.

```text
baseline_prompt_id = active PromptVersion.id at run start
baseline_eval_run_id = eval(baseline_prompt_id, val_snapshot_ids)
baseline_accuracy = correct_predictions / total_predictions
```

The backend stores:

- `prompt_version_id`: the baseline/current prompt version id;
- `baseline_eval_run_id`: evaluation job used to measure baseline;
- `baseline_accuracy`: validation accuracy of the active prompt before any
  candidate is generated.

If `baseline_accuracy >= target_accuracy`, the optimizer can finish immediately
with no candidate rounds. In that case `round_count = 0` and the UI should link
the user to `baseline_eval_run_id` for detail.

### Candidate Round

Each round uses the current best prompt and the current failing cases to ask the
optimizer model for a candidate prompt. The generated candidate is evaluated on
the same validation snapshot.

```text
previous_best_accuracy = current best validation accuracy before this round
candidate_eval_run_id = eval(candidate_prompt_id, val_snapshot_ids)
round_accuracy = correct_predictions / total_predictions
accuracy_delta = round(round_accuracy - previous_best_accuracy, 4)
```

The frontend should display `accuracy_delta` as the round's validation movement,
not as final test movement.

For a 200-case validation snapshot:

```text
round_accuracy = 0.7600
correct_predictions = 152
total_predictions = 200

0.7600 = 152 / 200
```

If the previous best was `0.5200`:

```text
accuracy_delta = round(0.7600 - 0.5200, 4)
accuracy_delta = 0.2400
```

Recommended UI copy:

```text
Round 1 improved validation accuracy by +24.0 percentage points.
```

Do not show this as:

```text
Round 1 improved final accuracy by +24.0%.
```

It is validation accuracy, not final test accuracy.

### Keep / Reject Formula

A round is kept only if it passes both overall improvement and per-action
regression gates.

Overall gate:

```text
overall_pass = round_accuracy > previous_best_accuracy
```

Per-action metrics:

```text
action_accuracy(action) = correct_for_action / total_for_action
action_delta(action) =
  candidate_action_accuracy(action) - baseline_action_accuracy(action)
```

Regression tolerance:

```text
tolerance(notify_human) = 0.02
tolerance(send_email)   = 0.02
tolerance(other action) = 0.05
```

The regression gate only applies when the baseline has at least 10 samples for
that action:

```text
if baseline_total(action) >= 10:
  action_pass = action_delta(action) >= -tolerance(action)
else:
  action_pass = true
```

Final keep decision:

```text
kept = overall_pass && all(action_pass)
```

If `kept = true`, the backend activates the candidate prompt and uses its failed
cases as the next round's learning input. If `kept = false`, the active prompt
does not change and the next round continues from the previous best prompt.

Example:

```text
previous_best_accuracy = 0.7600
round_accuracy = 0.6000
overall_pass = 0.6000 > 0.7600 = false
kept = false
reject_reason = "overall-not-improved"
```

Even if the candidate fixes one action, it is rejected when the overall
validation accuracy is lower than the previous best.

Protected-action example:

```text
previous_best_accuracy = 0.7600
round_accuracy = 0.7900
overall_pass = true

send_email baseline_accuracy = 0.8000
send_email candidate_accuracy = 0.7400
send_email delta = -0.0600
send_email tolerance = 0.0200

action_pass(send_email) = -0.0600 >= -0.0200 = false
kept = false
reject_reason = "action-regressed:send_email:delta=-0.0600:tolerance=0.0200"
```

In this case the candidate improved overall accuracy but still must be rejected
because `send_email` is protected and regressed beyond tolerance.

Frontend labels:

| Condition | UI label |
| --- | --- |
| `skip_reason != null` | Skipped |
| `kept = true` | Kept |
| `kept = false` and `reject_reason = "overall-not-improved"` | Rejected: no overall improvement |
| `kept = false` and `reject_reason` starts with `action-regressed:` | Rejected: action regression |

### Skipped Rounds

A skipped round means no candidate evaluation was run. The backend records:

- `eval_run_id = null`;
- `accuracy = previous_best_accuracy`;
- `accuracy_delta = 0`;
- `skip_reason` explains why the candidate could not be evaluated.

Common skip reasons:

```text
optimizer-candidate-invalid-json
optimizer-candidate-missing-actions:<action>
optimizer-candidate-missing-json-contract
optimizer-candidate-missing-fields:<field>
optimizer-candidate-unsupported-actions:<action>
```

Recent backend behavior retries once when the optimizer model returns `None`,
empty text, invalid JSON, or an invalid candidate contract. If the retry still
fails, the run detail may include `optimizer_raw_output` with both failed model
outputs for diagnostics.

A skipped round is not evidence that the prompt got worse. It means the backend
did not get a usable candidate prompt to test.

### Final Test Evaluation

Validation accuracy is used to decide whether to keep candidates. Test accuracy
is reported only after the optimizer loop reaches a terminal state.

```text
test_sample_per_action = optimizer_test_n_per_action // default 80
test_snapshot_ids =
  sample up to test_sample_per_action cases from each action in split = "test"
max_test_size = 5 actions * 80 = 400 cases

test_eval_run_id = eval(final_active_prompt_id, test_snapshot_ids)
test_accuracy = correct_predictions / total_predictions
```

With the current 12000-entry pool:

```text
available_test_per_action = 160
configured_test_sample_per_action = 80
actual_test_sample_per_action = min(160, 80) = 80
actual_test_snapshot_size = 5 * 80 = 400
```

The final test evaluation is an unbiased check of the final kept prompt. The UI
should not use `test_accuracy` to explain why a specific round was kept or
rejected; use `rounds[].accuracy`, `rounds[].previous_best_accuracy`,
`rounds[].per_action_deltas`, and `rounds[].reject_reason` for that.

### What The Frontend Should Show For One Run

For each run detail page, show these sections in order:

```text
1. Run setup
   - optimizer model
   - evaluator model
   - max rounds
   - target accuracy
   - validation sample size = val_snapshot_ids.length

2. Baseline
   - baseline prompt version id
   - baseline eval run id
   - baseline accuracy

3. Round timeline
   - round number
   - candidate prompt version id
   - eval run id when evaluated
   - previous best accuracy
   - round accuracy
   - accuracy delta
   - kept / rejected / skipped
   - reject_reason or skip_reason

4. Per-action diagnostics
   - action metrics
   - baseline vs candidate deltas
   - tolerance
   - highlighted protected-action regressions

5. Final test
   - test eval run id
   - test accuracy
   - test sample size when available
```

Suggested tooltip for `baseline_accuracy`:

```text
Accuracy of the active prompt on the run's fixed validation snapshot before any
candidate prompt was generated.
```

Suggested tooltip for `best_accuracy`:

```text
Best validation accuracy reached by baseline or kept/evaluated rounds. This is
not the final test accuracy.
```

Suggested tooltip for `test_accuracy`:

```text
Accuracy of the final active prompt on a separate test snapshot after the
optimizer loop finished.
```

### Summary Fields

Use these formulas when explaining list rows:

```text
best_accuracy = max(baseline_accuracy, max(round.accuracy for recorded rounds))
round_count = number of recorded optimizer rounds
target_progress = best_accuracy / target_accuracy
```

`best_accuracy` is validation-set best accuracy, not final test accuracy.
`test_accuracy` is separate and may be null when test split sampling is missing
or the run has not reached final validation yet.

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
- numeric input or slider: `target_accuracy`, default `0.78`, min `0.01`, max `1`
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

Used by overview and history list pages. This endpoint is intentionally
lightweight for polling and tables; it does not include nested rounds,
diagnostic failures, raw outputs, or validation snapshot ids.

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
        "target_accuracy": 0.78,
        "optimizer_model": "deepseek/deepseek-v4-flash",
        "evaluator_provider": "openrouter",
        "evaluator_model": "tencent/hy3-preview",
        "started_at": "2026-05-29T10:00:00+00:00",
        "finished_at": "2026-05-29T10:12:00+00:00",
        "prompt_version_id": 2,
        "baseline_eval_run_id": 40,
        "current_eval_run_id": null,
        "baseline_accuracy": 0.5,
        "best_accuracy": 0.72,
        "test_accuracy": 0.71,
        "round_count": 1,
        "error_message": null
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
  | 'evaluating'
  | 'completed'
  | 'completed_max_rounds'
  | 'failed'
  | 'cancelled'

export interface OptimizerRunSummary {
  optimizer_run_id: number
  status: OptimizerRunStatus
  max_rounds: number
  target_accuracy: number
  optimizer_model: string
  evaluator_provider: string
  evaluator_model: string
  started_at: string
  finished_at: string | null
  prompt_version_id: number | null
  baseline_eval_run_id: number | null
  current_eval_run_id: number | null
  baseline_accuracy: number | null
  best_accuracy: number | null
  test_accuracy: number | null
  round_count: number
  error_message: string | null
}
```

#### GET `/optimizer/history/{run_id}`

Used when the operator opens one run. This endpoint returns the full run detail,
including `val_snapshot_ids`, per-round diagnostics, nested failure samples,
confusion matrices, parsed/raw evaluator outputs, log snippets, and hardware
metadata.

Missing run response, HTTP 404:

```json
{
  "detail": "optimizer-run-not-found"
}
```

Type:

```ts
export interface OptimizerRoundFailure {
  source_case_id: string | null
  expected_action: string
  predicted_action: string
  confidence: number | null
  log_snippet: string
  hardware_info: Record<string, unknown>
  raw_output: string | null
  parsed_output: unknown
}

export interface OptimizerRound {
  round_number: number
  accuracy: number
  previous_best_accuracy: number | null
  accuracy_delta: number | null
  prompt_version_id: number
  failed_case_count: number
  kept: boolean
  eval_run_id: number | null
  optimizer_model: string
  failure_analysis: string
  confusion_matrix: Record<string, Record<string, number>>
  skip_reason: string | null
  per_action_metrics: Record<string, {
    total: number
    correct: number
    accuracy: number
  }> | null
  per_action_deltas: Record<string, {
    baseline_accuracy: number
    candidate_accuracy: number
    delta: number
    baseline_total: number
    candidate_total: number
    tolerance: number
  }> | null
  reject_reason: string | null
  optimizer_raw_output: string | null
  failures: OptimizerRoundFailure[]
}

export interface OptimizerRunDetail extends Omit<OptimizerRunSummary, 'best_accuracy' | 'round_count'> {
  val_snapshot_ids: string[]
  rounds: OptimizerRound[]
}
```

#### POST `/optimizer/run`

Used by `StartOptimizerPanel`.

Request:

```json
{
  "max_rounds": 5,
  "target_accuracy": 0.78
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

Let an operator inspect optimization progress, see which generated prompt
versions were kept and auto-activated by the backend, and manually activate a
different version when needed.

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
Generated prompt versions may be auto-activated by the backend when the
candidate strictly improves the best validation accuracy. The UI should still
link to the existing prompt activation workflow so operators can inspect or
override the active prompt version.

## Polling Rules

When any optimizer run has `status = "running"`:

- poll `/optimizer/history` every 3 seconds
- fetch `/optimizer/history/{run_id}` only when a run detail panel or route is
  opened
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
server/api/arbiter/optimizer/history/[id].get.ts
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
- `GET /optimizer/history` includes active runs while they are running and
  returns summary objects only.
- `GET /optimizer/history/{run_id}` returns full run detail and 404
  `optimizer-run-not-found` for missing runs.
- `GET /review-queue` returns only pending entries and sorts by confidence.
- The current deployment has non-empty `data/eval_pool.json` for non-empty UI QA,
  or seed fixtures are available for demo/testing.
- OpenAPI `/openapi.json` includes the optimizer router so frontend types can be
  generated.
