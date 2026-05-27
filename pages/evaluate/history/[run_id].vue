<script setup lang="ts">
import type { EvalRun, EvalRunResult } from '~/types/api'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const api = useApi()

const run = ref<EvalRun | null>(null)
const results = ref<EvalRunResult[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const notFound = ref(false)
const failuresOnly = ref(false)

const runId = computed(() => Number(route.params.run_id))

const displayedResults = computed(() =>
  failuresOnly.value ? results.value.filter(r => !r.is_correct) : results.value,
)

function accuracyColor(acc: number): string {
  if (acc >= 0.8) return 'var(--action-rebuild)'
  if (acc >= 0.5) return 'var(--action-fallback)'
  return 'var(--action-notify)'
}

function formatAccuracy(acc: number): string {
  return (acc * 100).toFixed(1) + '%'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

function duration(r: EvalRun): string {
  const ms = new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()
  return (ms / 1000).toFixed(1) + 's'
}

function formatLatency(ms: number | null): string {
  return ms != null ? `${ms} ms` : '—'
}

async function load() {
  loading.value = true
  error.value = null
  notFound.value = false
  try {
    const res = await api.getEvalRunDetail(runId.value)
    if (res.status === 'success') {
      run.value = res.data.run
      results.value = res.data.results
    } else {
      error.value = res.message
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('run-not-found') || msg.includes('404')) notFound.value = true
    else error.value = msg
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <AppTopBar :title="`Run #${runId}`" subtitle="Evaluation detail">
    <template #actions>
      <NuxtLink to="/evaluate/history" class="arb-detail__back">← History</NuxtLink>
    </template>
  </AppTopBar>

  <div class="arb-detail">
    <div v-if="loading" class="arb-detail__loading"><UiSpinner size="sm" /></div>

    <div v-else-if="notFound" class="arb-detail__not-found">
      Run not found.
    </div>

    <div v-else-if="error" class="arb-detail__error">{{ error }}</div>

    <template v-else-if="run">
      <!-- Summary card -->
      <UiCard class="arb-detail__summary">
        <div class="arb-detail__summary-grid">
          <div class="arb-detail__stat">
            <span class="arb-detail__stat-label">Run ID</span>
            <span class="arb-detail__stat-val num">#{{ run.run_id }}</span>
          </div>
          <div class="arb-detail__stat">
            <span class="arb-detail__stat-label">Provider</span>
            <span class="arb-detail__stat-val">{{ run.provider }}</span>
          </div>
          <div class="arb-detail__stat">
            <span class="arb-detail__stat-label">Model</span>
            <span class="arb-detail__stat-val mono">{{ run.model }}</span>
          </div>
          <div class="arb-detail__stat">
            <span class="arb-detail__stat-label">Accuracy</span>
            <span
              class="arb-detail__stat-val arb-detail__acc"
              :style="{ color: accuracyColor(run.accuracy) }"
            >{{ formatAccuracy(run.accuracy) }}</span>
          </div>
          <div class="arb-detail__stat">
            <span class="arb-detail__stat-label">Correct / Total</span>
            <span class="arb-detail__stat-val num">{{ run.correct }} / {{ run.total }}</span>
          </div>
          <div class="arb-detail__stat">
            <span class="arb-detail__stat-label">Timeouts</span>
            <span class="arb-detail__stat-val num">{{ run.timeout_count }}</span>
          </div>
          <div class="arb-detail__stat">
            <span class="arb-detail__stat-label">Duration</span>
            <span class="arb-detail__stat-val num">{{ duration(run) }}</span>
          </div>
          <div class="arb-detail__stat arb-detail__stat--wide">
            <span class="arb-detail__stat-label">Started</span>
            <span class="arb-detail__stat-val">{{ formatDate(run.started_at) }}</span>
          </div>
        </div>
      </UiCard>

      <!-- Results table -->
      <div class="arb-detail__results-header">
        <span class="arb-detail__results-title">Per-question results</span>
        <button
          class="arb-detail__toggle"
          :class="{ 'arb-detail__toggle--active': failuresOnly }"
          @click="failuresOnly = !failuresOnly"
        >
          {{ failuresOnly ? 'Show all' : 'Failures only' }}
        </button>
      </div>

      <div class="arb-detail__table-wrap">
        <table class="arb-detail__table">
          <thead>
            <tr>
              <th>Case</th>
              <th>Expected</th>
              <th>Predicted</th>
              <th>Result</th>
              <th>Latency</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in displayedResults"
              :key="r.test_case_id"
              class="arb-detail__result-row"
              :class="{ 'arb-detail__result-row--fail': !r.is_correct }"
            >
              <td class="num">#{{ r.test_case_id }}</td>
              <td><UiActionBadge :action="r.expected_action" size="sm" /></td>
              <td><UiActionBadge :action="r.predicted_action" size="sm" /></td>
              <td>
                <span
                  class="arb-detail__verdict"
                  :class="r.is_correct ? 'arb-detail__verdict--pass' : 'arb-detail__verdict--fail'"
                >
                  {{ r.is_correct ? 'PASS' : 'FAIL' }}
                </span>
              </td>
              <td class="num arb-detail__latency">{{ formatLatency(r.latency_ms) }}</td>
            </tr>
            <tr v-if="displayedResults.length === 0">
              <td colspan="5" class="arb-detail__empty-row">No results match the current filter.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.arb-detail {
  padding: 28px 32px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.arb-detail__back {
  font-size: 13px;
  color: var(--fg-3);
  text-decoration: none;
  transition: color var(--dur-fast);
}
.arb-detail__back:hover { color: var(--fg-1); }

.arb-detail__loading { padding: 40px; text-align: center; }
.arb-detail__not-found,
.arb-detail__error {
  padding: 40px;
  text-align: center;
  color: var(--fg-4);
  font-size: 13px;
}
.arb-detail__error { color: var(--action-notify); }

/* Summary card */
.arb-detail__summary { display: flex; flex-direction: column; }
.arb-detail__summary-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24px 32px;
}
.arb-detail__stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.arb-detail__stat--wide { flex: 1; }
.arb-detail__stat-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--fg-4);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.arb-detail__stat-val {
  font-size: 15px;
  font-weight: 600;
  color: var(--fg-1);
}
.arb-detail__acc { font-family: var(--font-mono); font-size: 18px; }

/* Results header */
.arb-detail__results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.arb-detail__results-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-2);
}
.arb-detail__toggle {
  font-size: 12px;
  font-family: var(--font-mono);
  padding: 4px 10px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg-3);
  cursor: pointer;
  transition: all var(--dur-fast);
}
.arb-detail__toggle:hover,
.arb-detail__toggle--active {
  border-color: var(--action-notify);
  color: var(--action-notify);
  background: var(--action-notify-soft);
}

/* Table */
.arb-detail__table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
}
.arb-detail__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.arb-detail__table th {
  padding: 10px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: var(--fg-4);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border);
  background: var(--bg-1);
  white-space: nowrap;
}
.arb-detail__table td {
  padding: 10px 14px;
  color: var(--fg-2);
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
  vertical-align: middle;
}
.arb-detail__result-row:last-child td { border-bottom: none; }
.arb-detail__result-row--fail td {
  background: rgba(239, 68, 68, 0.04);
  border-left: 2px solid var(--action-notify);
}
.arb-detail__result-row--fail td:not(:first-child) { border-left: none; }

.arb-detail__verdict {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: var(--r-sm);
}
.arb-detail__verdict--pass {
  background: var(--action-rebuild-soft);
  color: var(--action-rebuild);
}
.arb-detail__verdict--fail {
  background: var(--action-notify-soft);
  color: var(--action-notify);
}
.arb-detail__latency { color: var(--fg-4); }
.arb-detail__empty-row {
  text-align: center;
  color: var(--fg-4);
  padding: 24px;
  font-size: 13px;
}
.num { font-family: var(--font-mono); font-size: 12px; }
.mono { font-family: var(--font-mono); font-size: 12px; }
</style>
