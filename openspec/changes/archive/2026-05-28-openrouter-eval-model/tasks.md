## 1. Types

- [x] 1.1 Add `model?: string` to `EvaluateRequest` interface in `types/api.ts`
- [x] 1.2 Add `persisted: boolean` and `discard_reason: 'timeout_ratio_exceeded' | null` to `EvaluationSummary` interface in `types/api.ts`

## 2. API Composable

- [x] 2.1 Update `runEvaluation(promptId?, model?)` in `composables/useApi.ts` to accept optional `model` param and include it in the request body when provided

## 3. Evaluate Page — Model Selector

- [x] 3.1 Add `selectedModel` ref (`ref<string>('')`) and `activeProvider` ref to `pages/evaluate/index.vue`; load active provider on mount via `getProviders()` (already called or add call)
- [x] 3.2 Render model selector section (conditionally `v-if="activeProvider === 'openrouter'"`) with three quick-pick buttons: DeepSeek Flash (`deepseek-flash`), Qwen Plus (`qwen-plus`), HY3 (`hy3`)
- [x] 3.3 Add free-text input below quick-pick buttons; typing clears the active quick-pick selection
- [x] 3.4 Pass `selectedModel || undefined` as second argument to `runEvaluation()` in `runEval()`
- [x] 3.5 Add model label chip near the "Run evaluation" button showing `openrouter · <model>` or `openrouter · default` when provider is openrouter

## 4. Evaluate Page — Discard Warning

- [x] 4.1 Add discard warning banner in the results section (`v-if="result && result.persisted === false"`)
- [x] 4.2 Map `discard_reason` to human-readable text: `timeout_ratio_exceeded` → "Result not saved — timeout rate exceeded 50%. Run again to retry."; unknown → "Result not saved."

## 5. Sidebar Footer — Model Label

- [x] 5.1 Read active provider and selectedModel from a shared reactive source (or prop-drill from page) in `AppSidebar.vue`; alternatively expose `activeProvider` + `activeModel` from a Pinia store or via `useProviderState()` composable
- [x] 5.2 When active provider is `openrouter`, render a secondary label beneath the provider name in the sidebar footer showing the model shorthand or "default"
- [x] 5.3 When active provider is not `openrouter`, sidebar footer reverts to showing only the provider name (no secondary line)

## 6. Provider Config

- [x] 6.1 Verify the provider selector page/component renders `openrouter` when present in `available_providers` — no code change needed if it already iterates the array dynamically; confirm and mark done

## 7. Decisions Page — Model Display

- [x] 7.1 Add `model?: string` to `DecisionData` interface in `types/api.ts`
- [x] 7.2 In `pages/decisions.vue` table, add model display next to `UiProviderChip` (e.g., a `mono` chip showing `d.model` when present)
- [x] 7.3 In the decision detail panel, show model alongside provider and source badges
