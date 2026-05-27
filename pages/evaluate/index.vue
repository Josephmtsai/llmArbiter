<script setup lang="ts">
import type { EvaluationSummary, PromptVersion, EvalRun } from '~/types/api'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const prompts = ref<PromptVersion[]>([])
const selectedPromptId = ref<number | undefined>(undefined)
const running = ref(false)
const result = ref<EvaluationSummary | null>(null)
const error = ref<string | null>(null)
const loadingPrompts = ref(true)
const history = ref<EvalRun[]>([])
const loadingHistory = ref(true)

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

async function loadHistory() {
  loadingHistory.value = true
  try {
    const res = await api.getEvalHistory()
    if (res.status === 'success') history.value = res.data.runs
  } catch { /* silent */ } finally {
    loadingHistory.value = false
  }
}

async function runEval() {
  running.value = true
  error.value = null
  result.value = null
  try {
    const res = await api.runEvaluation(selectedPromptId.value)
    if (res.status === 'success') {
      result.value = res.data
      await loadHistory()
    } else {
      error.value = res.message
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Evaluation failed'
  } finally {
    running.value = false
  }
}

function accuracyColor(v: number): string {
  if (v >= 0.8) return 'var(--conf-high)'
  if (v >= 0.5) return 'var(--conf-mid)'
  return 'var(--conf-low)'
}

const scoreColor = computed(() => {
  if (!result.value) return 'var(--fg-3)'
  return accuracyColor(result.value.accuracy)
})

onMounted(() => {
  loadPrompts()
  loadHistory()
})
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
          <UiEyebrow>Accuracy</UiEyebrow>
          <span class="arb-eval__score-val num" :style="{ color: scoreColor }">
            {{ Math.round(result.accuracy * 100) }}%
          </span>
        </UiCard>
        <UiCard class="arb-eval__summary-stat">
          <UiEyebrow>Correct / Total</UiEyebrow>
          <span class="arb-eval__score-val num">{{ result.correct }} / {{ result.total }}</span>
        </UiCard>
        <UiCard class="arb-eval__summary-stat">
          <UiEyebrow>Timeouts</UiEyebrow>
          <span class="arb-eval__score-val num">{{ result.results.filter(r => r.predicted_action === 'timeout').length }}</span>
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
              <th>Latency</th>
              <th>Pass</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in result.results"
              :key="r.test_case_id"
              :class="r.is_correct ? 'arb-eval__row--pass' : 'arb-eval__row--fail'"
            >
              <td class="num">#{{ r.test_case_id }}</td>
              <td><UiActionBadge :action="r.expected_action" size="sm" /></td>
              <td><UiActionBadge :action="r.predicted_action" size="sm" /></td>
              <td class="num arb-eval__td-latency">{{ r.latency_ms != null ? `${r.latency_ms}ms` : '—' }}</td>
              <td class="arb-eval__td-pass">
                <span v-if="r.is_correct" class="arb-eval__pass-dot arb-eval__pass-dot--ok" />
                <span v-else class="arb-eval__pass-dot arb-eval__pass-dot--fail" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- History -->
    <div class="arb-eval__history">
      <div class="arb-eval__history-header">
        <UiEyebrow>Past evaluations</UiEyebrow>
        <NuxtLink to="/evaluate/history" class="arb-eval__history-link">View all →</NuxtLink>
      </div>
      <div v-if="loadingHistory" class="arb-eval__history-empty">
        <UiSpinner size="sm" />
      </div>
      <div v-else-if="history.length === 0" class="arb-eval__history-empty">
        No past evaluations.
      </div>
      <div v-else class="arb-eval__history-list">
        <NuxtLink
          v-for="h in history.slice(0, 5)"
          :key="h.run_id"
          :to="`/evaluate/history/${h.run_id}`"
          class="arb-eval__history-link-card"
        >
          <UiCard :clickable="true" class="arb-eval__history-item">
            <div class="arb-eval__history-row">
              <span class="arb-eval__history-acc num" :style="{ color: accuracyColor(h.accuracy) }">
                {{ Math.round(h.accuracy * 100) }}%
              </span>
              <span class="arb-eval__history-ratio num">{{ h.correct }} / {{ h.total }}</span>
              <UiChip v-if="h.timeout_count > 0" color="var(--conf-low)">
                {{ h.timeout_count }} timeout
              </UiChip>
              <span class="arb-eval__history-provider">{{ h.provider }}</span>
            </div>
            <div class="arb-eval__history-meta">
              <span class="arb-eval__history-prompt num">prompt v{{ h.prompt_version_id }}</span>
              <span class="arb-eval__history-date num">{{ new Date(h.started_at).toLocaleString() }}</span>
            </div>
          </UiCard>
        </NuxtLink>
      </div>
    </div>
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
.arb-eval__td-latency { font-size: 11px; color: var(--fg-4); }
.arb-eval__td-pass { text-align: center; }
.arb-eval__pass-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
}
.arb-eval__pass-dot--ok { background: var(--conf-high); }
.arb-eval__pass-dot--fail { background: var(--conf-low); }
.arb-eval__history { display: flex; flex-direction: column; }
.arb-eval__history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.arb-eval__history-link {
  font-size: 12px;
  color: var(--fg-4);
  text-decoration: none;
  transition: color var(--dur-fast);
}
.arb-eval__history-link:hover { color: var(--fg-1); }
.arb-eval__history-link-card { text-decoration: none; display: block; }
.arb-eval__history-provider {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-4);
  margin-left: auto;
}
.arb-eval__history-empty {
  display: flex;
  justify-content: center;
  padding: 20px;
  font-size: 12px;
  color: var(--fg-4);
}
.arb-eval__history-list { display: flex; flex-direction: column; gap: 8px; }
.arb-eval__history-item { display: flex; flex-direction: column; gap: 6px; cursor: pointer; }
.arb-eval__history-row { display: flex; align-items: center; gap: 10px; }
.arb-eval__history-acc {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
  min-width: 48px;
}
.arb-eval__history-ratio {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg-3);
}
.arb-eval__history-meta { display: flex; gap: 12px; align-items: center; }
.arb-eval__history-prompt {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-4);
}
.arb-eval__history-date {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-4);
}
</style>
