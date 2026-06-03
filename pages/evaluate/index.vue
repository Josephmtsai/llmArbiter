<script setup lang="ts">
import type { EvaluationSummary, PromptVersion, EvalRun, EvalJob } from '~/types/api'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const prompts = ref<PromptVersion[]>([])
const selectedPromptId = ref<number | undefined>(undefined)
const result = ref<EvaluationSummary | null>(null)
const error = ref<string | null>(null)
const loadingPrompts = ref(true)
const history = ref<EvalRun[]>([])
const loadingHistory = ref(true)

const activeJob = ref<EvalJob | null>(null)
const pollInterval = ref<ReturnType<typeof setInterval> | null>(null)
const cancelling = ref(false)
const cancelMessage = ref<string | null>(null)
let finishing = false

const activeProvider = useState<string | null>('sidebar:activeProvider', () => null)
const activeModel = useState<string | null>('sidebar:activeModel', () => null)

const QUICK_MODELS = [
  { label: 'DeepSeek Flash', value: 'deepseek-flash' },
  { label: 'Qwen Plus', value: 'qwen-plus' },
  { label: 'HY3', value: 'hy3' },
] as const

const selectedQuickModel = ref<string | null>(null)
const customModel = ref('')

const effectiveModel = computed(() => customModel.value.trim() || selectedQuickModel.value || '')

function pickQuickModel(val: string) {
  const isDeselect = selectedQuickModel.value === val
  selectedQuickModel.value = isDeselect ? null : val
  if (!isDeselect) customModel.value = ''  // only clear on selection, not on deselect
}

function onCustomModelInput() {
  selectedQuickModel.value = null
}

// Keep activeModel shared state in sync with the computed
watch(effectiveModel, (val) => {
  activeModel.value = val || null
})

// Clear model selection when provider changes away from openrouter
watch(activeProvider, (val) => {
  if (val !== 'openrouter') {
    selectedQuickModel.value = null
    customModel.value = ''
  }
})

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

async function loadProvider() {
  try {
    const res = await api.getProviders()
    activeProvider.value = res.active_provider ?? null
  } catch { /* silent */ }
}

async function loadHistory() {
  loadingHistory.value = true
  try {
    const res = await api.getEvalHistory()
    if (res.status === 'success') history.value = res.data.runs.filter(r => r.source == null || r.source === 'db')
  } catch { /* silent */ } finally {
    loadingHistory.value = false
  }
}

function stopPolling() {
  if (pollInterval.value) {
    clearInterval(pollInterval.value)
    pollInterval.value = null
  }
}

async function finishJob(runId: number) {
  if (finishing) return
  finishing = true
  stopPolling()
  priorAccuracy.value = history.value[0]?.accuracy ?? null
  try {
    const res = await api.getEvalRunDetail(runId)
    if (res.status === 'success') {
      if (res.data.run.status === 'completed') {
        result.value = {
          prompt_version_id: res.data.run.prompt_version_id,
          total: res.data.run.total,
          correct: res.data.run.correct,
          timeout_count: res.data.run.timeout_count,
          accuracy: res.data.run.accuracy,
          results: res.data.results,
          persisted: res.data.run.persisted,
          discard_reason: res.data.run.discard_reason,
        }
        await loadHistory()
      } else {
        error.value = `Evaluation ${res.data.run.status} — no results saved`
      }
    } else {
      error.value = res.message || 'Failed to load evaluation result'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to fetch result'
  } finally {
    activeJob.value = null
    finishing = false
  }
}

function startPolling(runId: number) {
  stopPolling()
  pollInterval.value = setInterval(async () => {
    try {
      const res = await api.getEvalJobs()
      if (res.status !== 'success') return
      const job = res.data.jobs.find(j => j.run_id === runId)
      if (job) {
        activeJob.value = job
      } else {
        await finishJob(runId)
      }
    } catch { /* silent — keep polling */ }
  }, 2500)
}

async function runEval() {
  error.value = null
  result.value = null
  priorAccuracy.value = null
  cancelMessage.value = null
  finishing = false
  try {
    const res = await api.startEvaluation(selectedPromptId.value, effectiveModel.value || undefined)
    if (res.status === 'success') {
      const { run_id } = res.data
      activeJob.value = { run_id, status: 'running', completed: 0, total: 0, provider: activeProvider.value ?? '', model: effectiveModel.value, started_at: new Date().toISOString() }
      startPolling(run_id)
    } else {
      error.value = res.message
    }
  } catch (e: unknown) {
    const status = e && typeof e === 'object' && 'status' in e ? (e as { status: number }).status : 0
    if (status === 429) error.value = 'Max concurrent evaluations reached. Wait for a running job to finish.'
    else if (status === 404) error.value = 'Prompt not found. Please select a valid prompt version.'
    else error.value = e instanceof Error ? e.message : 'Failed to start evaluation'
  }
}

async function cancelJob() {
  if (!activeJob.value) return
  cancelling.value = true
  const runId = activeJob.value.run_id
  try {
    const outcome = await api.cancelEvalJob(runId)
    if (outcome === 'cancelled') {
      stopPolling()
      activeJob.value = null
      cancelMessage.value = 'Evaluation cancelled'
    } else if (outcome === 'already-ended') {
      await finishJob(runId)
    } else {
      cancelMessage.value = 'Cancellation timed out — job may still complete'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Cancel failed'
  } finally {
    cancelling.value = false
  }
}

function accuracyColor(v: number): string {
  if (v >= 0.8) return 'var(--conf-high)'
  if (v >= 0.5) return 'var(--conf-mid)'
  return 'var(--conf-low)'
}

const priorAccuracy = ref<number | null>(null)

const scoreColor = computed(() => {
  if (!result.value) return 'var(--fg-3)'
  return accuracyColor(result.value.accuracy)
})

const accuracyDelta = computed<number | null>(() => {
  if (!result.value || priorAccuracy.value === null) return null
  return Math.round((result.value.accuracy - priorAccuracy.value) * 1000) / 10
})

const deltaLabel = computed(() => {
  if (accuracyDelta.value === null) return ''
  if (accuracyDelta.value > 0) return `▲ +${accuracyDelta.value.toFixed(1)}%`
  if (accuracyDelta.value < 0) return `▼ ${accuracyDelta.value.toFixed(1)}%`
  return `→ 0.0%`
})

const deltaColor = computed(() => {
  if (accuracyDelta.value === null) return 'var(--fg-4)'
  if (accuracyDelta.value > 0) return 'var(--action-rebuild)'
  if (accuracyDelta.value < 0) return 'var(--action-notify)'
  return 'var(--fg-4)'
})

const discardMessage = computed(() => {
  if (!result.value) return null
  const p = result.value.persisted
  // undefined = old API (field absent) → no warning; true = persisted normally → no warning
  if (p !== false && p !== null) return null
  if (result.value.discard_reason === 'timeout_ratio_exceeded')
    return 'Result not saved — timeout rate exceeded 50%. Run again to retry.'
  return 'Result not saved.'
})

onMounted(async () => {
  await Promise.all([loadPrompts(), loadHistory(), loadProvider()])
  try {
    const res = await api.getEvalJobs()
    if (res.status === 'success' && res.data.jobs.length > 0) {
      activeJob.value = res.data.jobs[0]
      startPolling(res.data.jobs[0].run_id)
    }
  } catch { /* silent */ }
})

onUnmounted(() => {
  stopPolling()
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
          <div class="arb-eval__run-col">
            <span v-if="activeProvider === 'openrouter'" class="arb-eval__model-chip num">
              openrouter · {{ effectiveModel || 'default' }}
            </span>
            <UiButton
              variant="primary"
              :disabled="prompts.length === 0 || !!activeJob"
              @click="runEval"
            >
              Run evaluation
            </UiButton>
          </div>
        </div>

        <!-- OpenRouter model selector -->
        <div v-if="activeProvider === 'openrouter'" class="arb-eval__model-section">
          <UiEyebrow>Model</UiEyebrow>
          <div class="arb-eval__model-picker">
            <button
              v-for="m in QUICK_MODELS"
              :key="m.value"
              class="arb-eval__model-btn"
              :class="{ 'arb-eval__model-btn--active': selectedQuickModel === m.value }"
              @click="pickQuickModel(m.value)"
            >
              {{ m.label }}
            </button>
          </div>
          <input
            v-model="customModel"
            class="arb-eval__model-input"
            placeholder="Or enter any OpenRouter model ID…"
            @input="onCustomModelInput"
          />
        </div>

        <p class="arb-eval__hint">
          Runs all test cases through the selected prompt and scores pass/fail against expected actions.
        </p>
      </UiCard>
    </div>

    <div v-if="error" class="arb-eval__error">{{ error }}</div>

    <!-- Active job progress -->
    <div v-if="activeJob" class="arb-eval__progress-section">
      <div class="arb-eval__progress-bar-wrap">
        <div
          class="arb-eval__progress-bar-fill"
          :style="{ width: activeJob.total > 0 ? `${Math.round(activeJob.completed / activeJob.total * 100)}%` : '2%' }"
        />
      </div>
      <div class="arb-eval__progress-meta">
        <span class="num">{{ activeJob.completed }}&thinsp;/&thinsp;{{ activeJob.total || '…' }}</span>
        <span v-if="activeJob.total > 0" class="num">{{ Math.round(activeJob.completed / activeJob.total * 100) }}%</span>
        <span>{{ activeJob.provider }}<template v-if="activeJob.model"> · {{ activeJob.model }}</template></span>
      </div>
      <div class="arb-eval__progress-actions">
        <UiButton
          variant="ghost"
          size="sm"
          class="arb-eval__cancel-btn"
          :disabled="cancelling"
          :loading="cancelling"
          @click="cancelJob"
        >
          Cancel
        </UiButton>
      </div>
    </div>
    <div v-if="cancelMessage" class="arb-eval__cancel-msg">{{ cancelMessage }}</div>

    <!-- Discard warning -->
    <div v-if="discardMessage" class="arb-eval__discard-warn">
      ⚠ {{ discardMessage }}
    </div>

    <!-- Summary -->
    <template v-if="result">
      <div class="arb-eval__summary">
        <UiCard class="arb-eval__summary-stat">
          <UiEyebrow>Accuracy</UiEyebrow>
          <div class="arb-eval__accuracy-row">
            <span class="arb-eval__score-val num" :style="{ color: scoreColor }">
              {{ Math.round(result.accuracy * 100) }}%
            </span>
            <span
              v-if="accuracyDelta !== null"
              class="arb-eval__delta-badge num"
              :style="{ color: deltaColor }"
            >{{ deltaLabel }}</span>
          </div>
        </UiCard>
        <UiCard class="arb-eval__summary-stat">
          <UiEyebrow>Correct / Total</UiEyebrow>
          <span class="arb-eval__score-val num">{{ result.correct }} / {{ result.total }}</span>
        </UiCard>
        <UiCard class="arb-eval__summary-stat">
          <UiEyebrow>Timeouts</UiEyebrow>
          <span class="arb-eval__score-val num">{{ (result.results ?? []).filter(r => r.predicted_action === 'timeout').length }}</span>
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
              v-for="r in (result.results ?? [])"
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
              <span v-if="h.model" class="arb-eval__history-model num">{{ h.model }}</span>
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
  padding: var(--page-pad);
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
}
.arb-eval__controls { display: flex; flex-direction: column; }
.arb-eval__control-card { display: flex; flex-direction: column; gap: 12px; }
.arb-eval__control-row { display: flex; align-items: flex-end; gap: 16px; }
.arb-eval__hint { font-size: 12px; color: var(--fg-4); margin: 0; }

.arb-eval__run-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  padding-bottom: 1px;
}
.arb-eval__model-chip {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-3);
  background: var(--bg-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: 2px 8px;
  white-space: nowrap;
}

.arb-eval__model-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid var(--border-subtle);
}
.arb-eval__model-picker {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.arb-eval__model-btn {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 4px 12px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg-3);
  cursor: pointer;
  transition: all var(--dur-fast);
}
.arb-eval__model-btn:hover {
  border-color: var(--fg-3);
  color: var(--fg-1);
}
.arb-eval__model-btn--active {
  border-color: var(--action-rebuild);
  color: var(--action-rebuild);
  background: var(--action-rebuild-soft);
}
.arb-eval__model-input {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 6px 10px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border);
  background: var(--bg-0);
  color: var(--fg-1);
  width: 100%;
  outline: none;
  transition: border-color var(--dur-fast);
}
.arb-eval__model-input:focus { border-color: var(--fg-3); }
.arb-eval__model-input::placeholder { color: var(--fg-4); }

.arb-eval__discard-warn {
  padding: 10px 14px;
  border-radius: var(--r-sm);
  background: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.25);
  font-size: 13px;
  color: var(--action-fallback);
}

.arb-eval__error {
  padding: 12px 14px;
  border-radius: var(--r-sm);
  background: var(--bg-tint-danger);
  border: 1px solid rgba(248, 113, 113, 0.2);
  font-size: 13px;
  color: var(--action-notify);
}
.arb-eval__progress-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  background: var(--bg-1);
}
.arb-eval__progress-bar-wrap {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: var(--bg-2);
  overflow: hidden;
}
.arb-eval__progress-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--action-rebuild);
  transition: width 0.5s ease;
  min-width: 4px;
}
.arb-eval__progress-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--fg-3);
}
.arb-eval__progress-actions {
  display: flex;
  justify-content: flex-end;
}
.arb-eval__cancel-btn { color: var(--action-notify) !important; }
.arb-eval__cancel-msg {
  font-size: 12px;
  color: var(--fg-4);
  font-family: var(--font-mono);
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
.arb-eval__accuracy-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.arb-eval__delta-badge {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
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
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
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
.arb-eval__history-model {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-4);
  background: var(--bg-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: 1px 6px;
}
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
