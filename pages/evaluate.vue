<script setup lang="ts">
import type { EvaluationSummary, PromptVersion } from '~/types/api'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const prompts = ref<PromptVersion[]>([])
const selectedPromptId = ref<number | undefined>(undefined)
const running = ref(false)
const result = ref<EvaluationSummary | null>(null)
const error = ref<string | null>(null)
const loadingPrompts = ref(true)

async function loadPrompts() {
  try {
    const res = await api.getPrompts()
    if (res.status === 'success') {
      prompts.value = res.data
      const active = res.data.find(p => p.active)
      if (active) selectedPromptId.value = active.id
    }
  } catch { /* silent */ } finally {
    loadingPrompts.value = false
  }
}

async function runEval() {
  running.value = true
  error.value = null
  result.value = null
  try {
    const res = await api.runEvaluation(selectedPromptId.value)
    if (res.status === 'success') result.value = res.data
    else error.value = res.message
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Evaluation failed'
  } finally {
    running.value = false
  }
}

const scoreColor = computed(() => {
  if (!result.value) return 'var(--fg-3)'
  const s = result.value.score
  if (s >= 0.8) return 'var(--conf-high)'
  if (s >= 0.5) return 'var(--conf-mid)'
  return 'var(--conf-low)'
})

onMounted(loadPrompts)
</script>

<template>
  <AppTopBar title="Evaluate" subtitle="Run test suite against prompt versions" />

  <div class="arb-eval">
    <div class="arb-eval__controls">
      <UiCard class="arb-eval__control-card">
        <div class="arb-eval__control-row">
          <UiField label="Prompt version" style="flex: 1">
            <UiSelect v-model.number="selectedPromptId" :disabled="loadingPrompts">
              <option v-for="p in prompts" :key="p.id" :value="p.id">
                {{ p.label }}{{ p.active ? ' (active)' : '' }}
              </option>
            </UiSelect>
          </UiField>
          <UiButton
            variant="primary"
            :loading="running"
            :disabled="prompts.length === 0"
            style="margin-top: 20px"
            @click="runEval"
          >
            Run evaluation
          </UiButton>
        </div>
        <p class="arb-eval__hint">
          Runs all test cases through the selected prompt and scores pass/fail against expected actions.
        </p>
      </UiCard>
    </div>

    <div v-if="error" class="arb-eval__error">{{ error }}</div>

    <div v-if="running" class="arb-eval__running">
      <UiSpinner size="sm" />
      <span>Running evaluation…</span>
    </div>

    <!-- Summary -->
    <template v-if="result">
      <div class="arb-eval__summary">
        <UiCard class="arb-eval__summary-stat">
          <UiEyebrow>Score</UiEyebrow>
          <span class="arb-eval__score-val num" :style="{ color: scoreColor }">
            {{ Math.round(result.score * 100) }}%
          </span>
        </UiCard>
        <UiCard class="arb-eval__summary-stat">
          <UiEyebrow>Pass / Total</UiEyebrow>
          <span class="arb-eval__score-val num">{{ result.pass_count }} / {{ result.total_count }}</span>
        </UiCard>
        <UiCard class="arb-eval__summary-stat">
          <UiEyebrow>Avg confidence</UiEyebrow>
          <span class="arb-eval__score-val num">{{ Math.round(result.avg_confidence * 100) }}%</span>
        </UiCard>
      </div>

      <!-- Results table -->
      <div class="arb-eval__table-wrap">
        <table class="arb-eval__table">
          <thead>
            <tr>
              <th>Case</th>
              <th>Expected</th>
              <th>Actual</th>
              <th>Confidence</th>
              <th>Pass</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in result.results"
              :key="r.case_id"
              :class="r.pass ? 'arb-eval__row--pass' : 'arb-eval__row--fail'"
            >
              <td class="num">#{{ r.case_id }}</td>
              <td><ActionBadge :action="r.expected" size="sm" /></td>
              <td><ActionBadge :action="r.actual" size="sm" /></td>
              <td><SmallMeter :value="r.confidence" /></td>
              <td class="arb-eval__td-pass">
                <span v-if="r.pass" class="arb-eval__pass-dot arb-eval__pass-dot--ok" />
                <span v-else class="arb-eval__pass-dot arb-eval__pass-dot--fail" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.arb-eval {
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
}
.arb-eval__controls { display: flex; flex-direction: column; }
.arb-eval__control-card { display: flex; flex-direction: column; gap: 12px; }
.arb-eval__control-row { display: flex; align-items: flex-end; gap: 16px; }
.arb-eval__hint { font-size: 12px; color: var(--fg-4); margin: 0; }
.arb-eval__error {
  padding: 12px 14px;
  border-radius: var(--r-sm);
  background: var(--bg-tint-danger);
  border: 1px solid rgba(248, 113, 113, 0.2);
  font-size: 13px;
  color: var(--action-notify);
}
.arb-eval__running {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--fg-3);
  padding: 12px 0;
}
.arb-eval__summary {
  display: flex;
  gap: 12px;
}
.arb-eval__summary-stat {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 140px;
}
.arb-eval__score-val {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 700;
  color: var(--fg-0);
  line-height: 1;
}
.arb-eval__table-wrap {
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  overflow: hidden;
}
.arb-eval__table {
  width: 100%;
  border-collapse: collapse;
}
.arb-eval__table th {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-4);
  padding: 10px 14px;
  text-align: left;
  background: var(--bg-1);
  border-bottom: 1px solid var(--border-subtle);
}
.arb-eval__table td {
  padding: 11px 14px;
  font-size: 13px;
  color: var(--fg-2);
  border-bottom: 1px solid var(--border-subtle);
}
.arb-eval__table tr:last-child td { border-bottom: none; }
.arb-eval__row--pass td { background: rgba(52, 211, 153, 0.03); }
.arb-eval__row--fail td { background: rgba(248, 113, 113, 0.03); }
.arb-eval__td-pass { text-align: center; }
.arb-eval__pass-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
}
.arb-eval__pass-dot--ok { background: var(--conf-high); }
.arb-eval__pass-dot--fail { background: var(--conf-low); }
</style>
