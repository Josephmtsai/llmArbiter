## 1. Source Spec And Current State

- [x] 1.1 Read `docs/frontend-optimizer-diagnostics-spec.md`, this proposal, this design, and the optimizer-diagnostics delta spec before coding.
- [x] 1.2 Compare the current `types/api.ts` optimizer diagnostic types against the MD API assumptions.
- [x] 1.3 Compare current `components/optimizer/OptimizerHistory.vue` behavior against the existing `openspec/specs/optimizer-diagnostics/spec.md` to avoid regressing already implemented diagnostics.

## 2. Diagnostic Types

- [x] 2.1 Add strict optional types for optimizer round failure samples, including expected action, predicted action, confidence, log snippet, hardware metadata, parsed output, and raw output.
- [x] 2.2 Add strict optional types for optimizer model comparison rows, including model name, baseline accuracy, candidate accuracy, accuracy delta, failure count, generated prompt version ID, and would-keep decision.
- [x] 2.3 Add `failure_analysis?: string | null` support while preserving existing `analysis_text?: string | null` compatibility.
- [x] 2.4 Avoid `any`; use `unknown`, `Record<string, unknown>`, or explicit interfaces for parsed/raw diagnostic payloads.

## 3. Optimizer Diagnostics UI

- [x] 3.1 Update optimizer round detail to display `failure_analysis` when present and fall back to `analysis_text`.
- [x] 3.2 Add failed-case preview UI for selected/expanded rounds with expected action, predicted action, confidence, log snippet preview, and hardware metadata summary.
- [x] 3.3 Add compact filter/search controls for failed cases by expected and predicted action.
- [x] 3.4 Add failed-case detail expansion with bounded long log snippets, formatted `hardware_info`, formatted `parsed_output`, and collapsed `raw_output` by default.
- [x] 3.5 Redact or omit secret-like metadata keys such as authorization headers, API keys, tokens, passwords, and secrets.
- [x] 3.6 Add optional model-comparison table on optimizer run detail when comparison data is present.
- [x] 3.7 Preserve existing run selection, eval links, current eval indicator, model badges, accuracy progression, kept/rejected badges, accuracy deltas, and confusion matrix behavior.

## 4. Component Structure And Styling

- [x] 4.1 Keep the primary diagnostics view on `/optimizer`; do not add a hidden admin-only route.
- [x] 4.2 Extract focused presentational components only if `OptimizerHistory.vue` becomes hard to scan or test.
- [x] 4.3 Use compact operational tables, badges, details/summary, and bounded text areas consistent with the existing optimizer UI.
- [x] 4.4 Avoid inline styles for new UI unless preserving existing behavior requires a temporary compatibility path.

## 5. Tests

- [x] 5.1 Add or update Vue component tests for failure sample list rendering.
- [x] 5.2 Add tests for missing `failures` and missing model comparisons producing no broken empty table.
- [x] 5.3 Add tests for `failure_analysis` preferred over `analysis_text` and `analysis_text` fallback.
- [x] 5.4 Add tests proving raw output is collapsed by default and long log snippets are bounded or expandable.
- [x] 5.5 Add tests for model comparison table fields and would-keep badge display.
- [x] 5.6 Add tests for secret-like metadata redaction/omission.

## 6. Verification And Handoff

- [x] 6.1 Run targeted Vitest tests for optimizer diagnostics and existing optimizer state/history tests.
- [x] 6.2 Run `pnpm vue-tsc --noEmit`.
- [x] 6.3 Run `pnpm build`.
- [x] 6.4 Run `openspec.cmd validate frontend-optimizer-diagnostics --strict`.
- [x] 6.5 Produce `specs/frontend-optimizer-diagnostics/handoff-dev.json` with changed files, verification, and known gaps.
- [x] 6.6 After Developer handoff, spawn code review first; only proceed to QA after reviewer PASS.
