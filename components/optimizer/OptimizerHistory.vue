<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  ConfusionMatrix,
  OptimizerErrorCluster,
  OptimizerModelComparison,
  OptimizerRound,
  OptimizerRoundFailure,
  OptimizerRun,
} from '~/types/api'
import { bestOptimizerAccuracy, isOptimizerRunActive, optimizerRoundCount } from '~/utils/optimizerState'

const props = defineProps<{
  runs: OptimizerRun[]
  selectedRun: OptimizerRun | null
  loading: boolean
}>()

defineEmits<{ selectRun: [id: number] }>()

const sortedRounds = computed(() =>
  props.selectedRun
    ? [...(props.selectedRun.rounds ?? [])].sort((a, b) => a.round_number - b.round_number)
    : [],
)

const expandedRounds = ref<Set<number>>(new Set())
const failureFilters = ref<Record<number, { expected: string; predicted: string }>>({})

function toggleRound(n: number) {
  if (expandedRounds.value.has(n)) expandedRounds.value.delete(n)
  else expandedRounds.value.add(n)
}

watch(
  () => props.selectedRun?.optimizer_run_id,
  () => {
    expandedRounds.value = new Set()
    failureFilters.value = {}
  },
)

function formatPercent(value: number | null | undefined): string {
  if (value == null) return 'n/a'
  return `${(value * 100).toFixed(1)}%`
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'n/a'
  return new Date(value).toLocaleString()
}

function durationLabel(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return 'Running'
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  return Number.isFinite(ms) && ms >= 0 ? `${(ms / 1000).toFixed(1)}s` : 'n/a'
}

function formatConfidence(value: number | null | undefined): string {
  return value == null ? 'n/a' : formatPercent(value)
}

function deltaLabel(delta: number | null | undefined): string {
  if (delta == null) return '--'
  const pct = (delta * 100).toFixed(1)
  return delta >= 0 ? `+${pct}%` : `${pct}%`
}

function deltaToneClass(delta: number | null | undefined): string {
  if (delta == null) return 'optimizer-history__delta--neutral'
  return delta >= 0 ? 'optimizer-history__delta--positive' : 'optimizer-history__delta--negative'
}

function confusionPredictedActions(matrix: ConfusionMatrix): string[] {
  const cols = new Set<string>()
  for (const predicted of Object.values(matrix)) {
    for (const key of Object.keys(predicted)) cols.add(key)
  }
  return [...cols].sort()
}

function shortAction(action: string): string {
  return action.replace('trigger_', '').replace('notify_', 'notify/').replace('send_', 'send/')
}

function bestRoundAccuracy(run: OptimizerRun): number | null {
  return bestOptimizerAccuracy(run) ?? null
}

function currentEvalLabel(run: OptimizerRun): string {
  return run.status === 'evaluating' ? 'Test eval' : 'Current eval'
}

function currentEvalMessage(run: OptimizerRun): string {
  return run.status === 'evaluating' ? 'Final test eval is running' : 'Evaluating'
}

function roundAnalysis(round: OptimizerRound): string | null {
  return round.failure_analysis ?? round.analysis_text ?? null
}

function failureFilter(roundNumber: number): { expected: string; predicted: string } {
  return failureFilters.value[roundNumber] ?? { expected: '', predicted: '' }
}

function updateFailureFilter(roundNumber: number, key: 'expected' | 'predicted', event: Event) {
  const value = (event.target as HTMLSelectElement).value
  const current = failureFilter(roundNumber)
  failureFilters.value = {
    ...failureFilters.value,
    [roundNumber]: {
      ...current,
      [key]: value,
    },
  }
}

function uniqueFailureActions(
  failures: OptimizerRoundFailure[] | undefined,
  key: 'expected_action' | 'predicted_action',
): string[] {
  if (!failures) return []
  return [...new Set(failures.map((failure) => String(failure[key])))].sort()
}

function filteredFailures(round: OptimizerRound): OptimizerRoundFailure[] {
  const failures = round.failures ?? []
  const filter = failureFilter(round.round_number)
  return failures.filter((failure) => {
    const expectedMatches = !filter.expected || failure.expected_action === filter.expected
    const predictedMatches = !filter.predicted || failure.predicted_action === filter.predicted
    return expectedMatches && predictedMatches
  })
}

function metadataEntries(metadata: Record<string, unknown> | undefined): Array<[string, string]> {
  if (!metadata) return []
  return Object.entries(metadata)
    .filter(([key]) => !isSecretLikeKey(key))
    .map(([key, value]) => [key, stringifyValue(sanitizeMetadataValue(value))])
}

function isSecretLikeKey(key: string): boolean {
  return /(authorization|api[_-]?key|token|password|secret|x-api-key)/i.test(key)
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeMetadataValue(item))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isSecretLikeKey(key))
      .map(([key, nestedValue]) => [key, sanitizeMetadataValue(nestedValue)]),
  )
}

function stringifyValue(value: unknown): string {
  if (value == null) return 'n/a'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function formatStructured(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function modelComparisonName(comparison: OptimizerModelComparison): string {
  return comparison.model_name ?? comparison.model ?? 'Unknown model'
}

function modelComparisonDecisionLabel(comparison: OptimizerModelComparison): string {
  if (comparison.would_keep == null) return 'n/a'
  return comparison.would_keep ? 'Would keep' : 'Reject'
}

function modelComparisonDecisionClass(comparison: OptimizerModelComparison): string {
  if (comparison.would_keep == null) return 'optimizer-history__kept-badge--neutral'
  return comparison.would_keep
    ? 'optimizer-history__kept-badge--kept'
    : 'optimizer-history__kept-badge--rejected'
}

const ERROR_TYPE_LABELS: Record<string, string> = {
  wrong_action: 'Wrong action',
  confidence_too_high: 'Confidence too high',
  confidence_too_low: 'Confidence too low',
  missing_required_field: 'Missing field',
  invalid_json: 'Invalid JSON',
  unsupported_action: 'Unsupported action',
  protected_action_regression: 'Protected action regression',
  unknown: 'Unknown',
}

function errorTypeLabel(errorType: string): string {
  return ERROR_TYPE_LABELS[errorType] ?? errorType
}

function formatImpact(value: number | null): string {
  if (value == null) return 'n/a'
  return `${(Math.abs(value) * 100).toFixed(1)}%`
}

function errorClusters(round: OptimizerRound): OptimizerErrorCluster[] {
  return round.error_clusters ?? []
}
</script>

<template>
  <section class="optimizer-history">
    <UiCard class="optimizer-history__list-card">
      <div class="optimizer-history__panel-head">
        <UiEyebrow>Runs</UiEyebrow>
        <span v-if="loading" class="optimizer-history__muted">Loading</span>
      </div>
      <div v-if="runs.length === 0" class="optimizer-history__empty">
        No optimizer runs yet.
      </div>
      <button
        v-for="run in runs"
        v-else
        :key="run.optimizer_run_id"
        class="optimizer-history__run-item"
        :class="{ 'optimizer-history__run-item--active': selectedRun?.optimizer_run_id === run.optimizer_run_id }"
        type="button"
        @click="$emit('selectRun', run.optimizer_run_id)"
      >
        <div class="optimizer-history__run-item-head">
          <span class="num">#{{ run.optimizer_run_id }}</span>
          <span class="optimizer-history__status-chip" :class="`optimizer-history__status-chip--${run.status}`">
            {{ run.status }}
          </span>
        </div>
        <div v-if="run.optimizer_model || run.evaluator_model" class="optimizer-history__model-badges">
          <span v-if="run.optimizer_model" class="optimizer-history__badge optimizer-history__badge--opt">
            opt: {{ run.optimizer_model.split('/').pop() }}
          </span>
          <span v-if="run.evaluator_model" class="optimizer-history__badge optimizer-history__badge--eval">
            eval: {{ run.evaluator_model.split('/').pop() }}
          </span>
        </div>
        <div class="optimizer-history__acc-flow">
          <span class="num">{{ formatPercent(run.baseline_accuracy) }}</span>
          <span class="optimizer-history__acc-arrow">to</span>
          <span class="num optimizer-history__best-accuracy">{{ formatPercent(bestRoundAccuracy(run)) }}</span>
          <span class="optimizer-history__acc-arrow">to</span>
          <span class="num">{{ formatPercent(run.test_accuracy) }}</span>
        </div>
      </button>
    </UiCard>

    <UiCard class="optimizer-history__detail">
      <template v-if="selectedRun">
        <div class="optimizer-history__panel-head">
          <div>
            <UiEyebrow>Run detail</UiEyebrow>
            <h2 class="optimizer-history__title num">#{{ selectedRun.optimizer_run_id }}</h2>
          </div>
          <span class="optimizer-history__status-chip">{{ selectedRun.status }}</span>
        </div>

        <div class="optimizer-history__model-badges optimizer-history__model-badges--large">
          <span v-if="selectedRun.optimizer_model" class="optimizer-history__badge optimizer-history__badge--opt">
            optimizer: {{ selectedRun.optimizer_model }}
          </span>
          <span
            v-if="selectedRun.evaluator_provider || selectedRun.evaluator_model"
            class="optimizer-history__badge optimizer-history__badge--eval"
          >
            eval: {{ [selectedRun.evaluator_provider, selectedRun.evaluator_model].filter(Boolean).join(' / ') }}
          </span>
        </div>

        <div class="optimizer-history__run-meta">
          <div>
            <span>Started</span>
            <strong class="num">{{ formatDate(selectedRun.started_at) }}</strong>
          </div>
          <div>
            <span>Finished</span>
            <strong class="num">{{ formatDate(selectedRun.finished_at) }}</strong>
          </div>
          <div>
            <span>Duration</span>
            <strong class="num">{{ durationLabel(selectedRun.started_at, selectedRun.finished_at) }}</strong>
          </div>
          <div>
            <span>Max rounds</span>
            <strong class="num">{{ selectedRun.max_rounds }}</strong>
          </div>
          <div>
            <span>Prompt version</span>
            <strong class="num">{{ selectedRun.prompt_version_id ?? 'n/a' }}</strong>
          </div>
          <div>
            <span>{{ currentEvalLabel(selectedRun) }}</span>
            <NuxtLink
              v-if="selectedRun.current_eval_run_id != null"
              :to="`/evaluate/history/${selectedRun.current_eval_run_id}`"
              class="optimizer-history__link"
            >
              #{{ selectedRun.current_eval_run_id }}
            </NuxtLink>
            <strong v-else class="num">n/a</strong>
          </div>
        </div>

        <div class="optimizer-history__stats">
          <span>Target {{ formatPercent(selectedRun.target_accuracy) }}</span>
          <span>Baseline {{ formatPercent(selectedRun.baseline_accuracy) }}</span>
          <span>Best {{ formatPercent(bestRoundAccuracy(selectedRun)) }}</span>
          <span>Test {{ formatPercent(selectedRun.test_accuracy) }}</span>
          <span>{{ optimizerRoundCount(selectedRun) }} rounds</span>
          <NuxtLink
            v-if="selectedRun.baseline_eval_run_id != null"
            :to="`/evaluate/history/${selectedRun.baseline_eval_run_id}`"
            class="optimizer-history__stats-link"
          >
            Baseline eval
          </NuxtLink>
          <NuxtLink
            v-if="selectedRun.test_eval_run_id != null"
            :to="`/evaluate/history/${selectedRun.test_eval_run_id}`"
            class="optimizer-history__stats-link"
          >
            Test eval
          </NuxtLink>
        </div>

        <div
          v-if="selectedRun.current_eval_run_id != null && isOptimizerRunActive(selectedRun)"
          class="optimizer-history__evaluating"
        >
          <UiSpinner size="sm" />
          <span>{{ currentEvalMessage(selectedRun) }}</span>
          <NuxtLink :to="`/evaluate/history/${selectedRun.current_eval_run_id}`" class="optimizer-history__link">
            View eval #{{ selectedRun.current_eval_run_id }}
          </NuxtLink>
        </div>

        <div v-if="selectedRun.error_message" class="optimizer-history__error-msg">
          {{ selectedRun.error_message }}
        </div>

        <div
          v-if="selectedRun.model_comparisons && selectedRun.model_comparisons.length > 0"
          class="optimizer-history__comparison"
        >
          <div class="optimizer-history__section-label">Model comparison</div>
          <div class="optimizer-history__table-wrap">
            <table class="optimizer-history__data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Baseline</th>
                  <th>Candidate</th>
                  <th>Delta</th>
                  <th>Failed</th>
                  <th>Prompt</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="comparison in selectedRun.model_comparisons" :key="modelComparisonName(comparison)">
                  <td>{{ modelComparisonName(comparison) }}</td>
                  <td class="num">{{ formatPercent(comparison.baseline_accuracy) }}</td>
                  <td class="num">{{ formatPercent(comparison.candidate_accuracy) }}</td>
                  <td class="num" :class="deltaToneClass(comparison.accuracy_delta)">
                    {{ deltaLabel(comparison.accuracy_delta) }}
                  </td>
                  <td class="num">{{ comparison.failure_count ?? 'n/a' }}</td>
                  <td class="num">{{ comparison.generated_prompt_version_id ?? 'n/a' }}</td>
                  <td>
                    <span
                      class="optimizer-history__kept-badge"
                      :class="modelComparisonDecisionClass(comparison)"
                    >
                      {{ modelComparisonDecisionLabel(comparison) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="sortedRounds.length > 0" class="optimizer-history__rounds">
          <div v-for="round in sortedRounds" :key="round.round_number" class="optimizer-history__round">
            <button class="optimizer-history__round-head" type="button" @click="toggleRound(round.round_number)">
              <span class="num">R{{ round.round_number }}</span>

              <!-- Skipped round: LLM returned an invalid candidate -->
              <template v-if="round.skip_reason">
                <span class="optimizer-history__kept-badge optimizer-history__kept-badge--skipped">Skipped</span>
                <span class="optimizer-history__skip-reason num">{{ round.skip_reason }}</span>
              </template>

              <!-- Normal round: evaluated and kept or rejected -->
              <template v-else>
                <span
                  class="optimizer-history__kept-badge"
                  :class="round.kept ? 'optimizer-history__kept-badge--kept' : 'optimizer-history__kept-badge--rejected'"
                >
                  {{ round.kept ? 'Kept' : round.reject_reason ? `Rejected: ${round.reject_reason}` : 'Rejected' }}
                </span>
                <span class="num" :class="deltaToneClass(round.accuracy_delta)">
                  {{ deltaLabel(round.accuracy_delta) }}
                </span>
                <span class="num">{{ formatPercent(round.accuracy) }}</span>
                <span class="optimizer-history__muted num">{{ round.failed_case_count }} failed</span>
                <NuxtLink
                  v-if="round.eval_run_id != null"
                  :to="`/evaluate/history/${round.eval_run_id}`"
                  class="optimizer-history__link"
                  @click.stop
                >
                  eval #{{ round.eval_run_id }}
                </NuxtLink>
                <NuxtLink
                  :to="`/settings?tab=prompts&prompt=${round.prompt_version_id}`"
                  class="optimizer-history__link"
                  @click.stop
                >
                  pv{{ round.prompt_version_id }}
                </NuxtLink>
                <span v-if="round.optimizer_model" class="optimizer-history__badge optimizer-history__badge--opt">
                  {{ round.optimizer_model.split('/').pop() }}
                </span>
              </template>

              <span class="optimizer-history__round-toggle">
                {{ expandedRounds.has(round.round_number) ? 'Collapse' : 'Expand' }}
              </span>
            </button>

            <div v-if="expandedRounds.has(round.round_number)" class="optimizer-history__round-detail">
              <details v-if="roundAnalysis(round)" class="optimizer-history__analysis">
                <summary class="optimizer-history__analysis-summary">Failure analysis</summary>
                <p class="optimizer-history__analysis-body">{{ roundAnalysis(round) }}</p>
              </details>

              <div v-if="round.confusion_matrix && Object.keys(round.confusion_matrix).length > 0" class="optimizer-history__matrix">
                <div class="optimizer-history__section-label">Confusion matrix</div>
                <div class="optimizer-history__matrix-wrap">
                  <table class="optimizer-history__matrix-table">
                    <thead>
                      <tr>
                        <th class="optimizer-history__matrix-corner">expected / predicted</th>
                        <th v-for="col in confusionPredictedActions(round.confusion_matrix)" :key="col">
                          {{ shortAction(col) }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(predicted, expected) in round.confusion_matrix" :key="expected">
                        <td class="optimizer-history__matrix-row-label">{{ shortAction(String(expected)) }}</td>
                        <td
                          v-for="col in confusionPredictedActions(round.confusion_matrix)"
                          :key="col"
                          class="num optimizer-history__matrix-cell"
                          :class="{ 'optimizer-history__matrix-cell--nonzero': (predicted[col] ?? 0) > 0 }"
                        >
                          {{ predicted[col] ?? 0 }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div v-if="round.per_action_deltas && Object.keys(round.per_action_deltas).length > 0" class="optimizer-history__per-action">
                <div class="optimizer-history__section-label">Per-action deltas</div>
                <div class="optimizer-history__matrix-wrap">
                  <table class="optimizer-history__matrix-table">
                    <thead>
                      <tr>
                        <th class="optimizer-history__matrix-corner">Action</th>
                        <th class="num">Baseline</th>
                        <th class="num">Candidate</th>
                        <th class="num">Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(entry, action) in round.per_action_deltas" :key="action">
                        <td class="optimizer-history__matrix-row-label">{{ shortAction(String(action)) }}</td>
                        <td class="num">{{ formatPercent(entry.baseline_accuracy) }}</td>
                        <td class="num">{{ formatPercent(entry.candidate_accuracy) }}</td>
                        <td
                          class="num optimizer-history__delta-cell"
                          :class="[deltaToneClass(entry.delta), { 'optimizer-history__delta-cell--regression': entry.delta < 0 && Math.abs(entry.delta) > entry.tolerance }]"
                        >
                          {{ deltaLabel(entry.delta) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Error Intelligence -->
              <div v-if="errorClusters(round).length > 0" class="optimizer-history__error-intel">
                <div class="optimizer-history__section-label">Error Intelligence</div>
                <p class="optimizer-history__error-intel-desc">
                  These are grouped validation failures used to guide the next prompt candidate.
                </p>
                <div class="optimizer-history__cluster-list">
                  <details
                    v-for="(cluster, ci) in errorClusters(round)"
                    :key="ci"
                    class="optimizer-history__cluster"
                  >
                    <summary class="optimizer-history__cluster-summary">
                      <span class="optimizer-history__cluster-type">{{ errorTypeLabel(cluster.error_type) }}</span>
                      <template v-if="cluster.expected_action && cluster.predicted_action">
                        <span class="optimizer-history__acc-arrow">·</span>
                        <span class="optimizer-history__cluster-action">{{ shortAction(cluster.expected_action) }}</span>
                        <span class="optimizer-history__acc-arrow">→</span>
                        <span class="optimizer-history__cluster-action">{{ shortAction(cluster.predicted_action) }}</span>
                      </template>
                      <span class="optimizer-history__cluster-count num">{{ cluster.count }}</span>
                      <span v-if="cluster.accuracy_impact != null" class="optimizer-history__cluster-impact num">
                        {{ formatImpact(cluster.accuracy_impact) }}
                      </span>
                    </summary>
                    <div class="optimizer-history__cluster-detail">
                      <p v-if="cluster.suggested_rule_focus" class="optimizer-history__cluster-focus">
                        {{ cluster.suggested_rule_focus }}
                      </p>
                      <div v-if="cluster.representative_cases.length > 0" class="optimizer-history__rep-cases">
                        <div class="optimizer-history__section-label optimizer-history__section-label--minor">
                          Representative cases
                        </div>
                        <details
                          v-for="(rc, ri) in cluster.representative_cases"
                          :key="ri"
                          class="optimizer-history__failure"
                        >
                          <summary class="optimizer-history__failure-summary">
                            <span>{{ rc.expected_action ?? 'n/a' }}</span>
                            <span class="optimizer-history__acc-arrow">→</span>
                            <span>{{ rc.predicted_action ?? 'n/a' }}</span>
                            <span class="num">{{ formatConfidence(rc.confidence) }}</span>
                          </summary>
                          <div class="optimizer-history__failure-detail">
                            <span v-if="rc.source_case_id" class="optimizer-history__metadata-item">
                              <strong>source_case_id</strong>: {{ rc.source_case_id }}
                            </span>
                            <div v-if="rc.log_snippet" class="optimizer-history__log-preview">{{ rc.log_snippet }}</div>
                            <details v-if="rc.raw_output" class="optimizer-history__raw-output">
                              <summary>Raw output</summary>
                              <pre>{{ rc.raw_output }}</pre>
                            </details>
                          </div>
                        </details>
                      </div>
                    </div>
                  </details>
                </div>
              </div>

              <div v-if="round.failures && round.failures.length > 0" class="optimizer-history__failures">
                <div class="optimizer-history__section-label">Failure samples</div>
                <div class="optimizer-history__failure-filters">
                  <label>
                    Expected
                    <select
                      :value="failureFilter(round.round_number).expected"
                      @change="updateFailureFilter(round.round_number, 'expected', $event)"
                    >
                      <option value="">All</option>
                      <option
                        v-for="action in uniqueFailureActions(round.failures, 'expected_action')"
                        :key="action"
                        :value="action"
                      >
                        {{ shortAction(action) }}
                      </option>
                    </select>
                  </label>
                  <label>
                    Predicted
                    <select
                      :value="failureFilter(round.round_number).predicted"
                      @change="updateFailureFilter(round.round_number, 'predicted', $event)"
                    >
                      <option value="">All</option>
                      <option
                        v-for="action in uniqueFailureActions(round.failures, 'predicted_action')"
                        :key="action"
                        :value="action"
                      >
                        {{ shortAction(action) }}
                      </option>
                    </select>
                  </label>
                </div>

                <div class="optimizer-history__failure-list">
                  <details
                    v-for="(failure, index) in filteredFailures(round)"
                    :key="`${failure.expected_action}-${failure.predicted_action}-${index}`"
                    class="optimizer-history__failure"
                  >
                    <summary class="optimizer-history__failure-summary">
                      <span>{{ shortAction(String(failure.expected_action)) }}</span>
                      <span class="optimizer-history__acc-arrow">to</span>
                      <span>{{ shortAction(String(failure.predicted_action)) }}</span>
                      <span class="num">{{ formatConfidence(failure.confidence) }}</span>
                    </summary>
                    <div class="optimizer-history__failure-detail">
                      <span v-if="failure.source_case_id != null" class="optimizer-history__metadata-item">
                        <strong>source_case_id</strong>: {{ failure.source_case_id }}
                      </span>
                      <div class="optimizer-history__log-preview">{{ failure.log_snippet }}</div>
                      <div v-if="metadataEntries(failure.hardware_info).length > 0" class="optimizer-history__metadata">
                        <span
                          v-for="[key, value] in metadataEntries(failure.hardware_info)"
                          :key="key"
                          class="optimizer-history__metadata-item"
                        >
                          <strong>{{ key }}</strong>: {{ value }}
                        </span>
                      </div>
                      <pre v-if="failure.parsed_output != null" class="optimizer-history__structured-output">{{
                        formatStructured(failure.parsed_output)
                      }}</pre>
                      <details v-if="failure.raw_output" class="optimizer-history__raw-output">
                        <summary>Raw evaluator output</summary>
                        <pre>{{ failure.raw_output }}</pre>
                      </details>
                    </div>
                  </details>
                  <div v-if="filteredFailures(round).length === 0" class="optimizer-history__empty optimizer-history__empty--compact">
                    No failure samples match the selected filters.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="optimizer-history__empty optimizer-history__empty--compact">
          No rounds yet.
        </div>
      </template>
      <div v-else class="optimizer-history__empty">
        Select an optimizer run to inspect round history.
      </div>
    </UiCard>
  </section>
</template>

<style scoped>
.optimizer-history {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(320px, 1.8fr);
  gap: 14px;
  align-items: start;
}

@media (max-width: 900px) {
  .optimizer-history {
    grid-template-columns: 1fr;
  }
}

.optimizer-history__list-card {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  padding: 0;
}

.optimizer-history__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
}

.optimizer-history__muted {
  color: var(--fg-4);
  font-size: 12px;
}

.optimizer-history__empty {
  display: flex;
  justify-content: center;
  border: 1px dashed var(--border-subtle);
  border-radius: var(--r-md);
  margin: 12px;
  padding: 22px;
  color: var(--fg-4);
  font-size: 13px;
  text-align: center;
}

.optimizer-history__empty--compact {
  min-height: 48px;
  align-items: center;
  margin: 0;
}

.optimizer-history__run-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--border-subtle);
  padding: 10px 14px;
  background: transparent;
  color: var(--fg-2);
  cursor: pointer;
  text-align: left;
  transition: background var(--dur-fast);
}

.optimizer-history__run-item:hover,
.optimizer-history__run-item--active {
  background: var(--bg-2);
  color: var(--fg-0);
}

.optimizer-history__run-item:last-child {
  border-bottom: none;
}

.optimizer-history__run-item-head,
.optimizer-history__acc-flow,
.optimizer-history__model-badges,
.optimizer-history__stats,
.optimizer-history__evaluating,
.optimizer-history__round-head,
.optimizer-history__failure-summary,
.optimizer-history__failure-filters {
  display: flex;
  align-items: center;
}

.optimizer-history__run-item-head,
.optimizer-history__evaluating,
.optimizer-history__failure-summary {
  gap: 8px;
}

.optimizer-history__acc-flow,
.optimizer-history__model-badges,
.optimizer-history__stats,
.optimizer-history__failure-filters {
  flex-wrap: wrap;
  gap: 6px;
}

.optimizer-history__acc-flow {
  color: var(--fg-3);
  font-family: var(--font-mono);
  font-size: 11px;
}

.optimizer-history__acc-arrow {
  color: var(--fg-4);
}

.optimizer-history__best-accuracy,
.optimizer-history__delta--positive {
  color: var(--action-rebuild);
}

.optimizer-history__delta--negative {
  color: var(--action-notify);
}

.optimizer-history__delta--neutral {
  color: var(--fg-4);
}

.optimizer-history__status-chip {
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  padding: 2px 8px;
  color: var(--fg-3);
  font-family: var(--font-mono);
  font-size: 10px;
}

.optimizer-history__model-badges--large {
  margin-bottom: 4px;
}

.optimizer-history__badge {
  border-radius: var(--r-sm);
  padding: 2px 7px;
  font-family: var(--font-mono);
  font-size: 10px;
  white-space: nowrap;
}

.optimizer-history__badge--opt {
  background: rgba(167, 139, 250, 0.12);
  color: #a78bfa;
}

.optimizer-history__badge--eval {
  background: rgba(96, 165, 250, 0.12);
  color: #60a5fa;
}

.optimizer-history__detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.optimizer-history__run-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.optimizer-history__run-meta > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: 8px 10px;
  background: var(--bg-1);
}

.optimizer-history__run-meta span {
  color: var(--fg-4);
  font-size: 10px;
  text-transform: uppercase;
}

.optimizer-history__run-meta strong {
  color: var(--fg-2);
  font-size: 11px;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.optimizer-history__title {
  margin: 4px 0 0;
  color: var(--fg-0);
  font-size: 18px;
  font-weight: 600;
}

.optimizer-history__stats span,
.optimizer-history__stats-link {
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: 4px 8px;
  color: var(--fg-3);
  font-family: var(--font-mono);
  font-size: 11px;
}

.optimizer-history__stats-link,
.optimizer-history__link {
  color: var(--accent);
  text-decoration: none;
}

.optimizer-history__stats-link:hover,
.optimizer-history__link:hover {
  text-decoration: underline;
}

.optimizer-history__evaluating {
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  padding: 8px 12px;
  background: var(--bg-2);
  color: var(--fg-3);
  font-size: 13px;
}

.optimizer-history__error-msg {
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: var(--r-md);
  padding: 8px 12px;
  background: var(--action-notify-soft);
  color: var(--action-notify);
  font-family: var(--font-mono);
  font-size: 12px;
}

.optimizer-history__link {
  font-family: var(--font-mono);
  font-size: 11px;
}

.optimizer-history__rounds,
.optimizer-history__round-detail,
.optimizer-history__failure-list,
.optimizer-history__failure-detail {
  display: flex;
  flex-direction: column;
}

.optimizer-history__rounds {
  gap: 4px;
}

.optimizer-history__round {
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
}

.optimizer-history__round-head {
  flex-wrap: wrap;
  gap: 10px;
  width: 100%;
  border: none;
  padding: 10px 12px;
  background: transparent;
  color: var(--fg-2);
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  transition: background var(--dur-fast);
}

.optimizer-history__round-head:hover {
  background: var(--bg-2);
}

.optimizer-history__round-toggle {
  margin-left: auto;
  color: var(--fg-4);
  font-size: 10px;
}

.optimizer-history__kept-badge {
  border-radius: var(--r-pill);
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
}

.optimizer-history__kept-badge--kept {
  background: var(--action-rebuild-soft);
  color: var(--action-rebuild);
}

.optimizer-history__kept-badge--rejected {
  background: var(--action-notify-soft);
  color: var(--action-notify);
}

.optimizer-history__kept-badge--neutral {
  background: var(--bg-2);
  color: var(--fg-4);
}

.optimizer-history__kept-badge--skipped {
  background: rgba(251, 191, 36, 0.12);
  color: var(--action-fallback);
}

.optimizer-history__skip-reason {
  color: var(--fg-3);
  font-family: var(--font-mono);
  font-size: 11px;
  word-break: break-all;
}

.optimizer-history__round-detail {
  gap: 12px;
  border-top: 1px solid var(--border-subtle);
  padding: 12px;
  background: var(--bg-1);
}

.optimizer-history__analysis,
.optimizer-history__failure,
.optimizer-history__raw-output {
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
}

.optimizer-history__analysis-summary,
.optimizer-history__failure-summary,
.optimizer-history__raw-output summary {
  padding: 8px 12px;
  color: var(--fg-3);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  user-select: none;
}

.optimizer-history__analysis-body,
.optimizer-history__log-preview,
.optimizer-history__structured-output,
.optimizer-history__raw-output pre {
  max-height: 220px;
  overflow-y: auto;
  white-space: pre-wrap;
}

.optimizer-history__analysis-body {
  border-top: 1px solid var(--border-subtle);
  margin: 0;
  padding: 8px 12px 12px;
  color: var(--fg-2);
  font-size: 12px;
  line-height: 1.6;
}

.optimizer-history__section-label {
  margin-bottom: 6px;
  color: var(--fg-4);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.optimizer-history__matrix-wrap,
.optimizer-history__table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
}

.optimizer-history__matrix-table,
.optimizer-history__data-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 11px;
}

.optimizer-history__matrix-table th,
.optimizer-history__matrix-table td,
.optimizer-history__data-table th,
.optimizer-history__data-table td {
  border: 1px solid var(--border-subtle);
  padding: 5px 10px;
  text-align: left;
}

.optimizer-history__matrix-table th,
.optimizer-history__data-table th {
  background: var(--bg-2);
  color: var(--fg-4);
  font-weight: 500;
}

.optimizer-history__matrix-cell {
  color: var(--fg-4);
  text-align: center;
}

.optimizer-history__matrix-cell--nonzero {
  background: var(--action-notify-soft);
  color: var(--action-notify);
  font-weight: 700;
}

.optimizer-history__delta-cell--regression {
  background: var(--action-notify-soft);
  color: var(--action-notify);
  font-weight: 700;
}

.optimizer-history__matrix-row-label {
  background: var(--bg-2);
  color: var(--fg-3);
  font-weight: 500;
}

.optimizer-history__matrix-corner {
  min-width: 120px;
  font-size: 10px;
}

.optimizer-history__failure-filters label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fg-4);
  font-size: 11px;
}

.optimizer-history__failure-filters select {
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: 4px 8px;
  background: var(--bg-2);
  color: var(--fg-2);
  font-size: 11px;
}

.optimizer-history__failure-list {
  gap: 8px;
}

.optimizer-history__failure-detail {
  gap: 8px;
  border-top: 1px solid var(--border-subtle);
  padding: 10px 12px;
}

.optimizer-history__log-preview,
.optimizer-history__structured-output,
.optimizer-history__raw-output pre {
  border-radius: var(--r-sm);
  margin: 0;
  padding: 8px;
  background: var(--bg-inset);
  color: var(--fg-2);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
}

.optimizer-history__metadata {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.optimizer-history__metadata-item {
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: 3px 6px;
  color: var(--fg-3);
  font-size: 11px;
}

@media (max-width: 640px) {
  .optimizer-history__run-meta {
    grid-template-columns: 1fr;
  }
}

/* ── Error Intelligence ─────────────────────────────────────── */
.optimizer-history__error-intel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.optimizer-history__error-intel-desc {
  margin: 0;
  color: var(--fg-4);
  font-size: 11px;
}

.optimizer-history__cluster-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.optimizer-history__cluster {
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
}

.optimizer-history__cluster-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  color: var(--fg-3);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  list-style: none;
  user-select: none;
}

.optimizer-history__cluster-type {
  color: var(--fg-1);
}

.optimizer-history__cluster-action {
  font-family: var(--font-mono);
  font-size: 11px;
}

.optimizer-history__cluster-count {
  margin-left: auto;
  color: var(--fg-3);
  font-family: var(--font-mono);
  font-size: 11px;
}

.optimizer-history__cluster-impact {
  color: var(--action-notify);
  font-family: var(--font-mono);
  font-size: 11px;
}

.optimizer-history__cluster-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border-subtle);
  padding: 10px 12px;
  background: var(--bg-1);
}

.optimizer-history__cluster-focus {
  margin: 0;
  color: var(--fg-2);
  font-size: 12px;
  font-style: italic;
  line-height: 1.5;
}

.optimizer-history__rep-cases {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.optimizer-history__section-label--minor {
  font-size: 10px;
  margin-bottom: 0;
}
</style>
