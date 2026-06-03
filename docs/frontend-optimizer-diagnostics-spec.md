# Frontend Spec: Optimizer Diagnostics UI

## Why

Backend optimizer runs now persist diagnostic evidence for stagnant or
regressing prompt optimization. The frontend must expose this data so operators
can understand whether poor accuracy is caused by model choice, prompt quality,
eval-label noise, or specific action confusion clusters.

## Goals

- Show optimizer run history with model, baseline accuracy, round accuracy,
  kept/rejected status, and final test accuracy.
- Show per-round diagnostic details including confusion matrix and failure
  analysis.
- Show representative failed cases with log snippets and hardware metadata.
- Support model-comparison results when the backend exposes them.
- Avoid displaying secrets or full raw prompt bodies by default.

## Non-Goals

- Do not edit prompts directly in this UI.
- Do not auto-activate generated prompts.
- Do not expose API keys, authorization headers, or secret environment values.
- Do not require live streaming updates in v1; polling is acceptable.

## API Assumptions

The frontend expects `GET /optimizer/history` to return runs with existing
fields plus optional diagnostic fields.

```json
{
  "status": "success",
  "data": [
    {
      "optimizer_run_id": 12,
      "status": "completed_max_rounds",
      "optimizer_model": "anthropic/claude-sonnet-4-6",
      "evaluator_provider": "openrouter",
      "evaluator_model": "deepseek/deepseek-chat",
      "target_accuracy": 0.78,
      "baseline_accuracy": 0.53,
      "test_accuracy": 0.48,
      "started_at": "2026-06-03T10:00:00Z",
      "finished_at": "2026-06-03T10:08:00Z",
      "val_snapshot_ids": ["..."],
      "rounds": [
        {
          "round_number": 1,
          "accuracy": 0.48,
          "previous_best_accuracy": 0.53,
          "accuracy_delta": -0.05,
          "prompt_version_id": 44,
          "failed_case_count": 104,
          "kept": false,
          "eval_run_id": 91,
          "optimizer_model": "anthropic/claude-sonnet-4-6",
          "failure_analysis": "The prompt confuses restartable service failures with human review.",
          "confusion_matrix": {
            "trigger_restart": {
              "notify_human": 18,
              "trigger_fallback": 7
            }
          },
          "failures": [
            {
              "expected_action": "trigger_restart",
              "predicted_action": "notify_human",
              "confidence": 0.62,
              "log_snippet": "service daemon timeout...",
              "hardware_info": {
                "source_dataset": "logchunks",
                "source_path": "...",
                "line_no": 123
              },
              "parsed_output": {},
              "raw_output": ""
            }
          ]
        }
      ]
    }
  ]
}
```

## Requirements

### Requirement: Optimizer history list shows diagnostic summary

The UI SHALL show optimizer runs in reverse chronological order.

#### Scenario: Run summary visible

- **WHEN** the user opens the optimizer page
- **THEN** each run row or card shows run ID, status, optimizer model, baseline
  accuracy, best round accuracy, final test accuracy, round count, and
  started/finished time.

#### Scenario: Regression is visually clear

- **WHEN** a round accuracy is lower than previous best accuracy
- **THEN** the UI marks it as rejected or regressed and shows negative accuracy
  delta.

### Requirement: Round detail shows keep/reject reasoning

The UI SHALL allow opening a run to inspect each optimizer round.

#### Scenario: Round detail visible

- **WHEN** the user expands a run
- **THEN** the UI shows each round with round number, candidate prompt version
  ID, eval run ID, accuracy, previous best accuracy, accuracy delta,
  kept/rejected badge, failed case count, and optimizer model.

#### Scenario: Failure analysis visible

- **WHEN** a round has `failure_analysis`
- **THEN** the UI displays it in a readable text panel.

### Requirement: Confusion matrix is displayed

The UI SHALL show action-level confusion data for each round.

#### Scenario: Confusion matrix table

- **WHEN** a round has `confusion_matrix`
- **THEN** the UI renders a matrix or table with expected actions as rows and
  predicted actions as columns.

#### Scenario: Top confusions highlighted

- **WHEN** a confusion pair has high count
- **THEN** the UI highlights the pair and lists top confusion clusters.

### Requirement: Failure samples are inspectable

The UI SHALL show representative failed cases for a selected round.

#### Scenario: Failed case list

- **WHEN** the user selects a round
- **THEN** the UI shows failed cases with expected action, predicted action,
  confidence, log snippet preview, and hardware metadata summary.

#### Scenario: Failed case detail

- **WHEN** the user opens a failed case
- **THEN** the UI shows bounded `log_snippet`, formatted `hardware_info`, and
  parsed/raw evaluator output when present.

### Requirement: Sensitive content is handled safely

The UI SHALL avoid accidental secret exposure.

#### Scenario: Raw output collapsed by default

- **WHEN** `raw_output` is present
- **THEN** it is collapsed by default and requires explicit expansion.

#### Scenario: Long text is bounded

- **WHEN** `log_snippet` or raw output is long
- **THEN** the UI displays a bounded preview with expand/collapse.

### Requirement: Model comparison results are visible

When backend model-comparison results are available, the UI SHALL display them
as a comparison table.

#### Scenario: Model comparison table

- **WHEN** model comparison results are available
- **THEN** the UI shows model name, baseline accuracy, candidate accuracy,
  accuracy delta, failure count, generated prompt version ID, and would-keep
  decision.

## UX Notes

- Put the primary view on the optimizer page, not a hidden admin-only route.
- Use compact tables for runs and rounds.
- Use badges for `kept`, `rejected`, `completed`, `failed`, and `cancelled`.
- Use a matrix/table for confusion data, not only a chart.
- Failure samples should be searchable or filterable by expected and predicted
  action.
- Keep the layout operational and dense; this is a debugging surface, not a
  marketing page.

## Acceptance Criteria

- User can identify which optimizer model was used for a run.
- User can see baseline accuracy, each round accuracy, and final test accuracy.
- User can tell whether a candidate prompt was kept or rejected.
- User can inspect why a round failed via confusion matrix and failure samples.
- User can compare optimizer models on the same snapshot if comparison data
  exists.
- UI does not expose secrets or full raw outputs by default.
