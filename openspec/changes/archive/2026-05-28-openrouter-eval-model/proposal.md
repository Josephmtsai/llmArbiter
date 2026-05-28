## Why

The backend has added OpenRouter as a fourth LLM provider and exposed a `model` parameter on `POST /evaluate`, letting users benchmark specific OpenRouter models (e.g. DeepSeek Flash, Qwen Plus, HY3). Without frontend support, users cannot switch to OpenRouter or pick a model, and they see no feedback when an evaluation is silently discarded due to high timeouts.

## What Changes

- Add `openrouter` to the provider selector dropdown (UI + `PATCH /config/provider` already supported by backend)
- On the Evaluate page, show a model selector when the active provider is `openrouter`:
  - Three quick-pick buttons: DeepSeek Flash, Qwen Plus, HY3
  - A free-text input for any raw OpenRouter model ID
  - Leaving blank = use server default (`OPENROUTER_MODEL`)
- Wire `model` into the `POST /evaluate` request body (optional field)
- Update `EvaluateRequest` type to include optional `model?: string`
- Update `EvaluationSummary` type to include `persisted: boolean` and `discard_reason: 'timeout_ratio_exceeded' | null`
- On the Evaluate results panel, show a warning banner when `persisted: false` with explanation text mapped from `discard_reason`

## Capabilities

### New Capabilities

- `eval-model-select`: Model selector UI on Evaluate page (active only when provider is openrouter); quick-pick shortcuts + free-text input; value wired to `POST /evaluate` body as optional `model` field
- `eval-discard-warning`: Warning banner on Evaluate results when `persisted: false`; maps `discard_reason` values to human-readable explanations

### Modified Capabilities

- `provider-config`: Provider selector gains `openrouter` as a valid option (existing `openspec/specs/` has no provider-config spec — this is a new addition to track)

## Impact

- `types/api.ts` — `EvaluateRequest` adds `model?: string`; `EvaluationSummary` adds `persisted: boolean`, `discard_reason: 'timeout_ratio_exceeded' | null`
- `composables/useApi.ts` — `runEvaluation` passes through `model` param
- `pages/evaluate/index.vue` — model selector section + discard warning in results
- `components/AppSidebar.vue` / provider selector in settings — no change needed (backend already accepts `openrouter`); the provider dropdown on the Settings/Config page picks up the new value automatically from `available_providers`
