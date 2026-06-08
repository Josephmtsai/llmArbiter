<script setup lang="ts">
import { Ban, Bot } from 'lucide-vue-next'
import { computed } from 'vue'

const optimizerDefaultModel = useState<string | null>('sidebar:optimizerDefaultModel', () => null)
import type { ArbiterAction, EvalPoolStats, OptimizerRun } from '~/types/api'
import {
  ARBITER_ACTIONS,
  bestOptimizerAccuracy,
  isEvalPoolEmpty,
  optimizerRoundCount,
} from '~/utils/optimizerState'

const maxRounds = defineModel<number>('maxRounds', { required: true })
const targetAccuracy = defineModel<number>('targetAccuracy', { required: true })

const props = defineProps<{
  stats: EvalPoolStats | null
  lowestCoverage: { action: ArbiterAction; count: number } | null
  reviewTotal: number
  latestRun: OptimizerRun | null
  activeRun: OptimizerRun | null
  runs: OptimizerRun[]
  loadingStats: boolean
  starting: boolean
  cancellingRunId: number | null
}>()

defineEmits<{
  start: []
  cancel: [run: OptimizerRun]
  selectRun: [id: number]
}>()

const segments = Array.from({ length: 10 }, (_, index) => index + 1)
const poolIsEmpty = computed(() => isEvalPoolEmpty(props.stats))

function formatPercent(value: number | null | undefined): string {
  if (value == null) return 'n/a'
  return `${Math.round(value * 100)}%`
}

function formatDate(value: string | null): string {
  if (!value) return 'Running'
  return new Date(value).toLocaleString()
}

function coverageCount(action: ArbiterAction): number {
  return props.stats?.by_action[action] ?? 0
}

function activeSegments(action: ArbiterAction): number {
  const total = Math.max(props.stats?.total ?? 0, 1)
  return Math.ceil(Math.min(1, coverageCount(action) / total) * segments.length)
}
</script>

<template>
  <section class="optimizer-overview">
    <div v-if="activeRun" class="optimizer-overview__run-banner">
      <div>
        <UiEyebrow>Active run</UiEyebrow>
        <strong class="num">#{{ activeRun.optimizer_run_id }}</strong>
        <span>{{ activeRun.status }}</span>
      </div>
      <UiButton
        variant="danger"
        size="sm"
        :loading="cancellingRunId === activeRun.optimizer_run_id"
        @click="$emit('cancel', activeRun)"
      >
        <template #icon><Ban :size="14" /></template>
        Cancel
      </UiButton>
    </div>

    <div class="optimizer-overview__stats-grid">
      <UiCard class="optimizer-overview__stat">
        <UiEyebrow>Eval pool total</UiEyebrow>
        <strong class="optimizer-overview__stat-value num">{{ stats?.total ?? '...' }}</strong>
        <span v-if="poolIsEmpty" class="optimizer-overview__stat-note">No eval pool cases yet.</span>
      </UiCard>
      <UiCard class="optimizer-overview__stat">
        <UiEyebrow>Lowest coverage</UiEyebrow>
        <strong class="optimizer-overview__stat-value">{{ lowestCoverage?.count ?? '...' }}</strong>
        <span class="optimizer-overview__stat-note">{{ lowestCoverage?.action ?? 'loading' }}</span>
      </UiCard>
      <UiCard class="optimizer-overview__stat">
        <UiEyebrow>Review pending</UiEyebrow>
        <strong class="optimizer-overview__stat-value num">{{ reviewTotal }}</strong>
        <span class="optimizer-overview__stat-note">low-confidence cases</span>
      </UiCard>
      <UiCard class="optimizer-overview__stat">
        <UiEyebrow>Latest status</UiEyebrow>
        <strong class="optimizer-overview__stat-value">{{ latestRun?.status ?? 'Idle' }}</strong>
        <span class="optimizer-overview__stat-note">optimizer</span>
      </UiCard>
    </div>

    <div class="optimizer-overview__main-grid">
      <UiCard class="optimizer-overview__panel">
        <div class="optimizer-overview__panel-head">
          <UiEyebrow>Action coverage</UiEyebrow>
          <span v-if="loadingStats" class="optimizer-overview__muted">Loading</span>
        </div>
        <div v-if="poolIsEmpty" class="optimizer-overview__empty">
          No eval pool cases yet. Import a dataset or review pending relabeled cases before running pool evaluation.
        </div>
        <div v-else class="optimizer-overview__coverage-list">
          <div v-for="action in ARBITER_ACTIONS" :key="action" class="optimizer-overview__coverage-row">
            <UiActionBadge :action="action" size="sm" />
            <div class="optimizer-overview__segments">
              <span
                v-for="segment in segments"
                :key="segment"
                class="optimizer-overview__segment"
                :class="{ 'optimizer-overview__segment--active': segment <= activeSegments(action) }"
              />
            </div>
            <span
              class="optimizer-overview__coverage-count num"
              :class="{ 'optimizer-overview__coverage-count--low': coverageCount(action) < 20 }"
            >
              {{ coverageCount(action) }}
            </span>
          </div>
        </div>
      </UiCard>

      <UiCard class="optimizer-overview__panel">
        <UiEyebrow>Start optimizer</UiEyebrow>
        <div class="optimizer-overview__form-grid">
          <UiField label="Max rounds">
            <UiInput v-model.number="maxRounds" type="number" min="1" max="20" mono />
          </UiField>
          <UiField label="Target accuracy">
            <UiInput v-model.number="targetAccuracy" type="number" min="0.01" max="1" step="0.01" mono />
          </UiField>
        </div>
        <div v-if="optimizerDefaultModel" class="optimizer-overview__model-info">
          <span class="optimizer-overview__model-info-label">Optimizer model</span>
          <code class="optimizer-overview__model-info-value">{{ optimizerDefaultModel }}</code>
        </div>
        <UiButton
          class="optimizer-overview__wide-btn"
          :loading="starting"
          :disabled="!!activeRun"
          @click="$emit('start')"
        >
          <template #icon><Bot :size="15" /></template>
          Start optimizer
        </UiButton>
      </UiCard>
    </div>

    <UiCard>
      <UiEyebrow>Recent optimizer runs</UiEyebrow>
      <div v-if="runs.length === 0" class="optimizer-overview__empty">
        No optimizer runs yet. Start an optimization run after the eval pool has enough coverage.
      </div>
      <table v-else class="optimizer-overview__table">
        <thead>
          <tr>
            <th>Run</th>
            <th>Status</th>
            <th>Rounds</th>
            <th>Best</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="run in runs.slice(0, 5)"
            :key="run.optimizer_run_id"
            class="optimizer-overview__click-row"
            @click="$emit('selectRun', run.optimizer_run_id)"
          >
            <td class="num">#{{ run.optimizer_run_id }}</td>
            <td>{{ run.status }}</td>
            <td class="num">{{ optimizerRoundCount(run) }}</td>
            <td class="num">{{ formatPercent(bestOptimizerAccuracy(run)) }}</td>
            <td class="num">{{ formatDate(run.started_at) }}</td>
          </tr>
        </tbody>
      </table>
    </UiCard>
  </section>
</template>

<style scoped>
.optimizer-overview { display: flex; flex-direction: column; gap: 16px; }
.optimizer-overview__run-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 14px;
  border: 1px solid var(--accent); border-radius: var(--r-md); padding: 14px 16px;
  background: var(--accent-soft);
}
.optimizer-overview__run-banner > div { display: flex; align-items: center; gap: 10px; }
.optimizer-overview__stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.optimizer-overview__stat { display: flex; flex-direction: column; gap: 6px; }
.optimizer-overview__stat-value { color: var(--fg-0); font-size: 26px; font-weight: 700; line-height: 1; }
.optimizer-overview__stat-note, .optimizer-overview__muted { color: var(--fg-4); font-size: 12px; }
.optimizer-overview__main-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.8fr); gap: 14px; }
.optimizer-overview__panel { display: flex; flex-direction: column; gap: 14px; }
.optimizer-overview__panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.optimizer-overview__coverage-list { display: flex; flex-direction: column; gap: 10px; }
.optimizer-overview__coverage-row { display: grid; grid-template-columns: 150px minmax(0, 1fr) 42px; gap: 10px; align-items: center; }
.optimizer-overview__segments { display: grid; grid-template-columns: repeat(10, 1fr); gap: 3px; }
.optimizer-overview__segment { height: 8px; border-radius: var(--r-pill); background: var(--bg-2); }
.optimizer-overview__segment--active { background: var(--accent); }
.optimizer-overview__coverage-count { color: var(--fg-3); text-align: right; }
.optimizer-overview__coverage-count--low { color: var(--warning); }
.optimizer-overview__form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.optimizer-overview__model-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border-subtle);
  background: var(--bg-0);
}
.optimizer-overview__model-info-label {
  font-size: 11px;
  color: var(--fg-4);
  font-weight: 500;
  white-space: nowrap;
}
.optimizer-overview__model-info-value {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.optimizer-overview__wide-btn { width: 100%; justify-content: center; }
.optimizer-overview__empty { display: flex; justify-content: center; border: 1px dashed var(--border-subtle); border-radius: var(--r-md); padding: 22px; color: var(--fg-4); font-size: 13px; text-align: center; }
.optimizer-overview__table { width: 100%; border-collapse: collapse; margin-top: 12px; }
.optimizer-overview__table th, .optimizer-overview__table td { border-bottom: 1px solid var(--border-subtle); padding: 10px 12px; text-align: left; }
.optimizer-overview__table th { color: var(--fg-4); font-size: 11px; font-weight: 500; text-transform: uppercase; }
.optimizer-overview__table td { color: var(--fg-2); font-size: 13px; }
.optimizer-overview__click-row { cursor: pointer; }
.optimizer-overview__click-row:hover td { background: var(--bg-2); }
@media (max-width: 900px) {
  .optimizer-overview__run-banner { align-items: stretch; flex-direction: column; }
  .optimizer-overview__stats-grid, .optimizer-overview__main-grid, .optimizer-overview__form-grid { grid-template-columns: 1fr; }
  .optimizer-overview__coverage-row { grid-template-columns: 1fr; gap: 6px; }
}
</style>
