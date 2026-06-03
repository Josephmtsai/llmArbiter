## Why

Backend optimizer runs now expose diagnostic evidence for stagnant or regressing prompt optimization. The frontend needs to make that evidence inspectable so operators can distinguish model-choice issues, prompt-quality issues, eval-label noise, and action-confusion clusters.

## What Changes

- Extend the optimizer diagnostics surface on `/optimizer` beyond summary accuracy and round badges.
- Show representative failed cases for selected optimizer rounds, including expected/predicted actions, confidence, bounded log snippet preview, and hardware metadata summary.
- Add safe drill-down for failed case details, keeping long log snippets and raw evaluator output collapsed or bounded by default.
- Add model-comparison display when backend data is present, including baseline/candidate accuracy, delta, failure count, generated prompt version, and would-keep decision.
- Preserve existing run/round diagnostics behavior: model badges, baseline/best/test accuracy, eval links, kept/rejected status, accuracy delta, failure analysis, and confusion matrix.
- Do not expose API keys, authorization headers, secret environment values, or full raw prompt bodies.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `optimizer-diagnostics`: Add failed-case inspection, sensitive-content handling, and optional model-comparison diagnostics to the existing optimizer diagnostics contract.

## Impact

- `types/api.ts`: add optional diagnostic payload fields for optimizer round failures and model comparisons, using strict types.
- `components/optimizer/OptimizerHistory.vue`: add compact failed-case and model-comparison views while preserving existing run selection and round expansion behavior.
- `components/optimizer/` or `components/ui/`: may add focused presentational components for confusion matrix, failed case previews, or model comparison if it keeps the optimizer history component maintainable.
- `tests/`: add focused Vitest/Vue Test Utils coverage for failure samples, collapsed raw output, bounded long text, and optional model comparison rendering.
- API integration continues through the existing optimizer history request; no new endpoint is required for v1.
