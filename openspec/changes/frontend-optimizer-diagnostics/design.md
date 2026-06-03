## Context

`docs/frontend-optimizer-diagnostics-spec.md` defines the desired operator-facing diagnostics view for optimizer runs. The current frontend already has a baseline optimizer diagnostics surface: run model badges, baseline/best/test accuracy, eval links, kept/rejected round state, accuracy delta, collapsed round analysis, and confusion matrix rendering. The active gap is deeper diagnosis: representative failed cases, safe raw output handling, and optional model comparison results.

The backend contract is additive. `GET /optimizer/history` may return optional diagnostic fields on runs and rounds. The frontend must tolerate missing fields because deployments can be out of phase and not every run will have diagnostic payloads.

## Goals / Non-Goals

**Goals:**

- Make failed optimizer rounds diagnosable from `/optimizer` without requiring operators to inspect raw JSON.
- Display representative failed cases with expected/predicted action, confidence, bounded log preview, hardware metadata, and optional evaluator output.
- Display model comparison results when provided by the backend.
- Keep raw output, long logs, and prompt-like text collapsed or bounded by default.
- Preserve existing optimizer history selection, eval links, confusion matrix, and round expansion behavior.

**Non-Goals:**

- Do not edit prompts from the diagnostics view.
- Do not auto-activate generated prompts.
- Do not add live streaming updates; polling or existing refresh behavior is sufficient for v1.
- Do not expose API keys, authorization headers, environment secrets, or full prompt bodies.
- Do not require a new endpoint unless the backend later makes diagnostics too large for `GET /optimizer/history`.

## Decisions

1. **Use optional frontend types for diagnostic payloads.**
   - Add optional `failure_analysis`, `failures`, and `model_comparisons` fields while keeping existing fields valid.
   - Rationale: backend diagnostic fields are additive and may be absent on older runs.
   - Alternative considered: require all diagnostics on every run. Rejected because historical runs and phased backend deploys would render poorly.

2. **Support both `failure_analysis` and existing `analysis_text`.**
   - Prefer `failure_analysis` when present; fall back to `analysis_text`.
   - Rationale: the clean MD spec names `failure_analysis`, while current frontend/backend-adjacent work already introduced `analysis_text`.
   - Alternative considered: rename the existing field only. Rejected because it risks breaking already archived behavior.

3. **Render diagnostics as compact operational tables and expandable panels.**
   - Use dense tables/lists for runs, rounds, failure samples, and model comparisons.
   - Keep large text behind expand/collapse controls with bounded preview heights.
   - Rationale: this is a debugging surface for repeated operator use, not a marketing page.

4. **Keep secret safety defensive and UI-local.**
   - Never render API headers or environment values.
   - Raw evaluator output is collapsed by default and long values are bounded.
   - Hardware metadata is formatted as key/value summary and can omit suspicious secret-like keys if present.
   - Rationale: diagnostic payloads can contain model output and log fragments; accidental overexposure is the main frontend risk.

5. **Add focused component tests instead of broad E2E coverage in v1.**
   - Cover optional diagnostics, missing diagnostics, collapsed raw output, bounded long text controls, and model comparison table.
   - Rationale: the behavior is mostly render/state logic in optimizer components.

## Risks / Trade-offs

- Diagnostic payloads may be large → Keep samples bounded and collapsed; consider backend pagination later if payload size becomes a production issue.
- Field names may differ between backend versions → Use optional fields and compatibility fallback for `failure_analysis`/`analysis_text`.
- Raw output may contain sensitive values → Collapse by default, bound display, and avoid rendering known secret/header keys.
- OptimizerHistory may become too large → Extract presentational components if the implementation becomes hard to test or scan.
