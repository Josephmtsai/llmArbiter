<script setup lang="ts">
import type { EvalRun, EvalRunResult } from '~/types/api'
import {
  averageLatencyMs,
  countFailedResults,
  getEvalRunSource,
  getEvalRunSourceLabel,
  getEvalRunSourceTone,
  getRunAccuracyDisplay,
  hasMeaningfulAccuracy,
} from '~/utils/evalDisplay'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const api = useApi()

const run = ref<EvalRun | null>(null)
const results = ref<EvalRunResult[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const notFound = ref(false)
const failuresOnly = ref(false)
const deleting = ref(false)
const deleteError = ref<string | null>(null)
const expandedId = ref<number | null>(null)
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)
let loadSeq = 0

const runId = computed(() => Number(route.params.run_id))
const displayedResults = computed(() =>
  failuresOnly.value ? results.value.filter(result => !result.is_correct) : results.value,
)
const failedCount = computed(() => countFailedResults(results.value))
const averageLatency = computed(() => averageLatencyMs(results.value))
const runSource = computed(() => (run.value ? getEvalRunSource(run.value) : null))
const runSourceLabel = computed(() => getEvalRunSourceLabel(runSource.value))
const runSourceClass = computed(() => {
  const tone = getEvalRunSourceTone(runSource.value)
  return tone ? `arb-detail__source--${tone}` : ''
})
const liveProgressLabel = computed(() => {
  if (!run.value || run.value.status !== 'running' || run.value.total <= 0) return null
  const pct = (run.value.accuracy * 100).toFixed(1)
  const remaining = Math.max(run.value.total - run.value.correct, 0)
  return `${run.value.correct} / ${run.value.total} completed (${pct}%) - ${remaining} remaining`
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

function duration(currentRun: EvalRun): string {
  if (!currentRun.finished_at) return '--'
  const ms = new Date(currentRun.finished_at).getTime() - new Date(currentRun.started_at).getTime()
  return Number.isFinite(ms) && ms >= 0 ? `${(ms / 1000).toFixed(1)}s` : '--'
}

function formatLatency(ms: number | null): string {
  return ms != null ? `${ms} ms` : '--'
}

function formatConfidence(c: number | null | undefined): string {
  if (c == null) return '--'
  return `${(c * 100).toFixed(0)}%`
}

function confidenceColor(c: number | null | undefined): string {
  if (c == null) return 'var(--fg-4)'
  if (c >= 0.8) return 'var(--fg-1)'
  if (c >= 0.5) return 'var(--action-fallback)'
  return 'var(--action-notify)'
}

function sourcePath(result: EvalRunResult): string | null {
  const p = result.hardware_info?.source_path
  return typeof p === 'string' ? p : null
}

function resultReason(result: EvalRunResult): string | null {
  return result.reason ?? result.parsed_output?.reason ?? null
}

function resultThinking(result: EvalRunResult): string | null {
  return result.thinking ?? result.parsed_output?.thinking ?? null
}

function statusLabel(status: string | undefined): string {
  return status ?? 'completed'
}

function toggleExpand(id: number) {
  expandedId.value = expandedId.value === id ? null : id
}

function stopPolling() {
  if (pollTimer.value) { clearInterval(pollTimer.value); pollTimer.value = null }
}

async function load() {
  const seq = ++loadSeq
  loading.value = true
  error.value = null
  notFound.value = false
  try {
    const res = await api.getEvalRunDetail(runId.value)
    if (seq !== loadSeq) return
    if (res.status === 'success') {
      run.value = res.data.run
      results.value = res.data.results
      if (res.data.run.status === 'running') {
        stopPolling()
        pollTimer.value = setInterval(async () => {
          try {
            const poll = await api.getEvalRunDetail(runId.value)
            if (seq !== loadSeq) return
            if (poll.status === 'success') {
              run.value = poll.data.run
              if (poll.data.run.status !== 'running') {
                results.value = poll.data.results
                stopPolling()
              }
            }
          } catch { /* keep polling */ }
        }, 3000)
      }
    } else {
      error.value = res.message
    }
  } catch (e: unknown) {
    if (seq !== loadSeq) return
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('run-not-found') || msg.includes('404')) notFound.value = true
    else error.value = msg
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

async function deleteRun() {
  if (!window.confirm(`Delete run #${runId.value}? This cannot be undone.`)) return
  deleting.value = true
  deleteError.value = null
  try {
    await api.deleteEvalRun(runId.value)
    await navigateTo('/evaluate/history')
  } catch (e) {
    deleteError.value = e instanceof Error ? e.message : 'Delete failed'
  } finally {
    deleting.value = false
  }
}

onMounted(load)
onUnmounted(stopPolling)
</script>

<template>
  <AppTopBar :title="`Run #${runId}`" subtitle="Evaluation detail">
    <template #actions>
      <NuxtLink to="/evaluate/history" class="arb-detail__back">History</NuxtLink>
      <UiButton
        variant="ghost"
        size="sm"
        class="arb-detail__delete-btn arb-detail__delete-desktop"
        :disabled="loading || deleting"
        :loading="deleting"
        @click="deleteRun"
      >
        Delete run
      </UiButton>
    </template>
  </AppTopBar>

  <div v-if="deleteError" class="arb-detail__delete-err-bar">{{ deleteError }}</div>
  <div v-if="!loading && !notFound && !error" class="arb-detail__sub-bar">
    <UiButton
      variant="ghost"
      size="sm"
      class="arb-detail__delete-btn arb-detail__delete-mobile"
      :disabled="loading || deleting"
      :loading="deleting"
      @click="deleteRun"
    >
      Delete run
    </UiButton>
  </div>

  <div class="arb-detail">
    <div v-if="loading" class="arb-detail__loading"><UiSpinner size="sm" /></div>

    <div v-else-if="notFound" class="arb-detail__not-found">
      Run not found.
    </div>

    <div v-else-if="error" class="arb-detail__error">{{ error }}</div>

    <template v-else-if="run">
      <UiCard class="arb-detail__summary">
        <div class="arb-detail__summary-grid">
          <div class="arb-detail__stat">
            <span class="arb-detail__stat-label">Run ID</span>
            <span class="arb-detail__stat-val num">#{{ run.run_id }}</span>
          </div>
          <div class="arb-detail__stat">
            <span class="arb-detail__stat-label">Status</span>
            <span class="arb-detail__stat-val mono">{{ statusLabel(run.status) }}</span>
          </div>
          <div v-if="runSourceLabel" class="arb-detail__stat">
            <span class="arb-detail__stat-label">Source</span>
            <span class="arb-detail__source" :class="runSourceClass">{{ runSourceLabel }}</span>
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
              :style="{ color: getRunAccuracyDisplay(run).color }"
            >
              {{ getRunAccuracyDisplay(run).label }}
            </span>
            <span v-if="!hasMeaningfulAccuracy(run)" class="arb-detail__stat-note">Not final</span>
          </div>
          <div class="arb-detail__stat">
            <span class="arb-detail__stat-label">Correct / Total</span>
            <span class="arb-detail__stat-val num">{{ run.correct }} / {{ run.total }}</span>
            <span v-if="liveProgressLabel" class="arb-detail__live-progress">{{ liveProgressLabel }}</span>
          </div>
          <div class="arb-detail__stat">
            <span class="arb-detail__stat-label">Timeouts</span>
            <span class="arb-detail__stat-val num">{{ run.timeout_count }}</span>
          </div>
          <div class="arb-detail__stat">
            <span class="arb-detail__stat-label">Duration</span>
            <span class="arb-detail__stat-val num">{{ duration(run) }}</span>
          </div>
          <div class="arb-detail__stat">
            <span class="arb-detail__stat-label">Avg latency</span>
            <span class="arb-detail__stat-val num">
              {{ averageLatency != null ? `${averageLatency} ms` : '--' }}
            </span>
          </div>
          <div class="arb-detail__stat arb-detail__stat--wide">
            <span class="arb-detail__stat-label">Started</span>
            <span class="arb-detail__stat-val">{{ formatDate(run.started_at) }}</span>
          </div>
        </div>
      </UiCard>

      <div class="arb-detail__results-header">
        <span class="arb-detail__results-title">
          Per-question results
          <span class="arb-detail__failed-count num">{{ failedCount }} failed</span>
        </span>
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
              <th>Confidence</th>
              <th>Latency</th>
              <th class="arb-detail__th-expand" />
            </tr>
          </thead>
          <tbody>
            <template
              v-for="result in displayedResults"
              :key="result.test_case_id"
            >
              <!-- Main row -->
              <tr
                class="arb-detail__result-row"
                :class="{
                  'arb-detail__result-row--fail': !result.is_correct,
                  'arb-detail__result-row--expanded': expandedId === result.test_case_id,
                }"
                @click="toggleExpand(result.test_case_id)"
              >
                <td class="num">#{{ result.test_case_id }}</td>
                <td><UiActionBadge :action="result.expected_action" size="sm" /></td>
                <td><UiActionBadge :action="result.predicted_action" size="sm" /></td>
                <td>
                  <span
                    class="arb-detail__verdict"
                    :class="result.is_correct ? 'arb-detail__verdict--pass' : 'arb-detail__verdict--fail'"
                  >
                    {{ result.is_correct ? 'PASS' : 'FAIL' }}
                  </span>
                </td>
                <td
                  class="num arb-detail__confidence"
                  :style="{ color: confidenceColor(result.confidence) }"
                >
                  {{ formatConfidence(result.confidence) }}
                </td>
                <td class="num arb-detail__latency">{{ formatLatency(result.latency_ms) }}</td>
                <td class="arb-detail__expand-chevron">
                  {{ expandedId === result.test_case_id ? '▲' : '▼' }}
                </td>
              </tr>

              <!-- Detail panel row -->
              <tr
                v-if="expandedId === result.test_case_id"
                class="arb-detail__panel-row"
                :class="{ 'arb-detail__panel-row--fail': !result.is_correct }"
              >
                <td colspan="7" class="arb-detail__panel-cell">
                  <div class="arb-detail__panel">
                    <!-- Reason -->
                    <div v-if="resultReason(result)" class="arb-detail__panel-section">
                      <div class="arb-detail__panel-label">Reason</div>
                      <p class="arb-detail__panel-text">{{ resultReason(result) }}</p>
                    </div>

                    <!-- Thinking -->
                    <div v-if="resultThinking(result)" class="arb-detail__panel-section">
                      <div class="arb-detail__panel-label">Thinking</div>
                      <p class="arb-detail__panel-text arb-detail__panel-text--thinking">{{ resultThinking(result) }}</p>
                    </div>

                    <!-- Log Snippet -->
                    <div v-if="result.log_snippet" class="arb-detail__panel-section">
                      <div class="arb-detail__panel-label">Log Snippet</div>
                      <pre class="arb-detail__panel-pre">{{ result.log_snippet }}</pre>
                    </div>

                    <!-- Source Path -->
                    <div v-if="sourcePath(result)" class="arb-detail__panel-section">
                      <div class="arb-detail__panel-label">Source Path</div>
                      <code class="arb-detail__panel-code">{{ sourcePath(result) }}</code>
                    </div>

                    <div
                      v-if="!resultReason(result) && !resultThinking(result) && !result.log_snippet && !sourcePath(result)"
                      class="arb-detail__panel-empty"
                    >
                      No additional detail available.
                    </div>
                  </div>
                </td>
              </tr>
            </template>

            <tr v-if="displayedResults.length === 0">
              <td colspan="7" class="arb-detail__empty-row">No results match the current filter.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.arb-detail {
  padding: var(--page-pad);
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
.arb-detail__delete-btn { color: var(--action-notify) !important; }
.arb-detail__delete-err-bar {
  padding: 8px 32px;
  font-size: 12px;
  color: var(--action-notify);
}
.arb-detail__sub-bar {
  display: none;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--border-subtle);
}
.arb-detail__delete-mobile { display: none; }

@media (max-width: 767px) {
  .arb-detail__delete-desktop { display: none !important; }
  .arb-detail__sub-bar { display: flex; }
  .arb-detail__delete-mobile { display: inline-flex; }
  .arb-detail__delete-err-bar { padding: 8px 16px; }
}
.arb-detail__loading { padding: 40px; text-align: center; }
.arb-detail__not-found,
.arb-detail__error {
  padding: 40px;
  text-align: center;
  color: var(--fg-4);
  font-size: 13px;
}
.arb-detail__error { color: var(--action-notify); }
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
.arb-detail__source {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: 3px 7px;
  font-family: var(--font-mono);
  font-size: 11px;
}
.arb-detail__source--optimizer {
  color: #a78bfa;
  background: rgba(167, 139, 250, 0.12);
}
.arb-detail__source--pool {
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.12);
}
.arb-detail__source--manual {
  color: var(--fg-3);
  background: var(--bg-2);
}
.arb-detail__acc { font-family: var(--font-mono); font-size: 18px; }
.arb-detail__stat-note {
  font-size: 11px;
  color: var(--fg-4);
}
.arb-detail__live-progress {
  font-size: 11px;
  color: var(--action-rebuild);
  font-family: var(--font-mono);
}
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
.arb-detail__failed-count {
  margin-left: 8px;
  color: var(--action-notify);
  font-size: 11px;
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
  -webkit-overflow-scrolling: touch;
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
.arb-detail__th-expand { width: 28px; }
.arb-detail__table td {
  padding: 10px 14px;
  color: var(--fg-2);
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
  vertical-align: middle;
}

/* Main result rows */
.arb-detail__result-row {
  cursor: pointer;
  transition: background var(--dur-fast);
}
.arb-detail__result-row:hover td { background: var(--bg-2); }
.arb-detail__result-row--fail td {
  background: rgba(239, 68, 68, 0.04);
  border-left: 2px solid var(--action-notify);
}
.arb-detail__result-row--fail td:not(:first-child) { border-left: none; }
.arb-detail__result-row--expanded td { border-bottom: none; }

/* Chevron */
.arb-detail__expand-chevron {
  text-align: center;
  color: var(--fg-4);
  font-size: 9px;
  width: 28px;
}

/* Verdict */
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

.arb-detail__confidence { font-weight: 600; }
.arb-detail__latency { color: var(--fg-4); }

/* Detail panel */
.arb-detail__panel-row td { padding: 0; border-bottom: 1px solid var(--border-subtle); }
.arb-detail__panel-row--fail td {
  border-left: 2px solid var(--action-notify);
}
.arb-detail__panel-cell { padding: 0 !important; }
.arb-detail__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-1);
  border-top: 1px solid var(--border-subtle);
}
.arb-detail__panel-section { display: flex; flex-direction: column; gap: 4px; }
.arb-detail__panel-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-4);
}
.arb-detail__panel-text {
  font-size: 13px;
  color: var(--fg-2);
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
}
.arb-detail__panel-text--thinking {
  color: var(--fg-3);
  font-style: italic;
}
.arb-detail__panel-pre {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  background: var(--bg-0);
  border: 1px solid var(--border-subtle);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg-2);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 240px;
  overflow-y: auto;
}
.arb-detail__panel-code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-3);
  word-break: break-all;
}
.arb-detail__panel-empty {
  font-size: 12px;
  color: var(--fg-4);
  font-style: italic;
}

.arb-detail__empty-row {
  text-align: center;
  color: var(--fg-4);
  padding: 24px;
  font-size: 13px;
}
.num { font-family: var(--font-mono); font-size: 12px; }
.mono { font-family: var(--font-mono); font-size: 12px; }
</style>
