## 1. History Card Model Label

- [x] 1.1 In `pages/evaluate/index.vue`, add a `<span v-if="h.model" class="arb-eval__history-model num">{{ h.model }}</span>` inside each history card's row, after the provider chip
- [x] 1.2 Add CSS for `.arb-eval__history-model` — mono font, small size, muted colour, subtle background chip matching the decisions page model chip style

## 2. Eval Result Delta

- [x] 2.1 Add `priorAccuracy` ref (`ref<number | null>(null)`) to `pages/evaluate/index.vue`
- [x] 2.2 In `runEval()`, snapshot `priorAccuracy.value = history.value[0]?.accuracy ?? null` synchronously before calling `await loadHistory()`
- [x] 2.3 Reset `priorAccuracy.value = null` at the start of `runEval()` (alongside `result.value = null`) so the previous delta is cleared while the new run is in progress
- [x] 2.4 Add `accuracyDelta` computed: returns `null` if `result.value` is null or `priorAccuracy` is null; otherwise `(result.value.accuracy - priorAccuracy.value) * 100` rounded to one decimal
- [x] 2.5 Add `deltaLabel` computed: returns `▲ +X.X%` (positive), `▼ −X.X%` (negative), or `→ 0.0%` (zero) based on `accuracyDelta`
- [x] 2.6 Add `deltaColor` computed: `var(--action-rebuild)` for positive, `var(--action-notify)` for negative, `var(--fg-4)` for zero
- [x] 2.7 Render the delta badge inline with the Accuracy stat value — `<span v-if="accuracyDelta !== null" class="arb-eval__delta-badge" :style="{ color: deltaColor }">{{ deltaLabel }}</span>`
- [x] 2.8 Add CSS for `.arb-eval__delta-badge` — mono font, small size (12px), vertically aligned with the accuracy number
