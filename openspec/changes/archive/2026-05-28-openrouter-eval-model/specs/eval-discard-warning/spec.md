## ADDED Requirements

### Requirement: Discard warning shown when evaluation result is not persisted
When the `POST /evaluate` response includes `persisted: false`, the Evaluate results section SHALL display an inline warning banner above the results table. The banner SHALL explain that the result was not saved and map `discard_reason` to a human-readable explanation.

#### Scenario: Result discarded due to timeout ratio
- **WHEN** response has `persisted: false` and `discard_reason: "timeout_ratio_exceeded"`
- **THEN** warning banner reads: "Result not saved — timeout rate exceeded 50%. Run again to retry."

#### Scenario: Result discarded with unknown reason
- **WHEN** response has `persisted: false` and `discard_reason` is a value other than known strings
- **THEN** warning banner reads: "Result not saved." without a specific reason

#### Scenario: Result persisted normally
- **WHEN** response has `persisted: true`
- **THEN** no warning banner is shown and results display as normal

### Requirement: Types updated for persisted and discard_reason fields
`EvaluationSummary` in `types/api.ts` SHALL include `persisted: boolean` and `discard_reason: 'timeout_ratio_exceeded' | null`. `EvaluateRequest` SHALL include optional `model?: string`.

#### Scenario: TypeScript compilation succeeds
- **WHEN** `EvaluationSummary` is used in evaluate page with `result.persisted` and `result.discard_reason`
- **THEN** `vue-tsc --noEmit` passes with no type errors
