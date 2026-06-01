<script setup lang="ts">
import type { OptimizerRun } from '~/types/api'
import { bestOptimizerAccuracy } from '~/utils/optimizerState'

const props = defineProps<{
  runs: OptimizerRun[]
  selectedRun: OptimizerRun | null
  loading: boolean
}>()

defineEmits<{ selectRun: [id: number] }>()

const trendPolyline = computed(() => {
  const rounds = props.selectedRun?.rounds ?? []
  if (rounds.length < 2) return ''
  const sorted = [...rounds].sort((a, b) => a.round_number - b.round_number)
  const maxIndex = sorted.length - 1
  return sorted
    .map((round, index) => {
      const x = maxIndex === 0 ? 0 : (index / maxIndex) * 100
      const y = 44 - Math.max(0, Math.min(1, round.accuracy)) * 40
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
})

function formatPercent(value: number | null | undefined): string {
  if (value == null) return 'n/a'
  return `${Math.round(value * 100)}%`
}
</script>

<template>
  <section class="optimizer-history">
    <UiCard>
      <div class="optimizer-history__panel-head">
        <UiEyebrow>Runs</UiEyebrow>
        <span v-if="loading" class="optimizer-history__muted">Loading</span>
      </div>
      <div v-if="runs.length === 0" class="optimizer-history__empty">
        No optimizer runs yet. Start an optimization run after the eval pool has enough coverage.
      </div>
      <button
        v-for="run in runs"
        v-else
        :key="run.optimizer_run_id"
        class="optimizer-history__run-list-item"
        :class="{ 'optimizer-history__run-list-item--active': selectedRun?.optimizer_run_id === run.optimizer_run_id }"
        type="button"
        @click="$emit('selectRun', run.optimizer_run_id)"
      >
        <span class="num">#{{ run.optimizer_run_id }}</span>
        <span>{{ run.status }}</span>
        <span class="num">{{ formatPercent(bestOptimizerAccuracy(run)) }}</span>
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

        <div class="optimizer-history__stats">
          <span>Target {{ formatPercent(selectedRun.target_accuracy) }}</span>
          <span>Best {{ formatPercent(bestOptimizerAccuracy(selectedRun)) }}</span>
          <span>{{ selectedRun.rounds.length }} rounds</span>
          <NuxtLink
            v-if="selectedRun.baseline_eval_run_id != null"
            :to="`/evaluate/history/${selectedRun.baseline_eval_run_id}`"
            class="optimizer-history__stats-link"
          >
            Baseline eval ↗
          </NuxtLink>
        </div>

        <div class="optimizer-history__trend">
          <svg v-if="trendPolyline" viewBox="0 0 100 48" preserveAspectRatio="none" aria-hidden="true">
            <polyline :points="trendPolyline" fill="none" stroke="var(--accent)" stroke-width="2" />
          </svg>
          <div v-else class="optimizer-history__empty optimizer-history__empty--compact">No round trend yet.</div>
        </div>

        <table v-if="selectedRun.rounds.length > 0" class="optimizer-history__table">
          <thead>
            <tr>
              <th>Round</th>
              <th>Accuracy</th>
              <th>Failed</th>
              <th>Prompt</th>
              <th>Kept</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="round in [...selectedRun.rounds].sort((a, b) => a.round_number - b.round_number)"
              :key="round.round_number"
            >
              <td class="num">{{ round.round_number }}</td>
              <td class="num">{{ formatPercent(round.accuracy) }}</td>
              <td class="num">{{ round.failed_case_count }}</td>
              <td><NuxtLink to="/settings" class="optimizer-history__link">v{{ round.prompt_version_id }}</NuxtLink></td>
              <td>{{ round.kept ? 'Yes' : 'No' }}</td>
            </tr>
          </tbody>
        </table>
      </template>
      <div v-else class="optimizer-history__empty">
        Select an optimizer run to inspect round history.
      </div>
    </UiCard>
  </section>
</template>

<style scoped>
.optimizer-history { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.8fr); gap: 14px; align-items: start; }
.optimizer-history__panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.optimizer-history__muted { color: var(--fg-4); font-size: 12px; }
.optimizer-history__empty { display: flex; justify-content: center; border: 1px dashed var(--border-subtle); border-radius: var(--r-md); padding: 22px; color: var(--fg-4); font-size: 13px; text-align: center; }
.optimizer-history__empty--compact { min-height: 64px; align-items: center; }
.optimizer-history__run-list-item { display: grid; width: 100%; grid-template-columns: 80px minmax(0, 1fr) 72px; gap: 8px; border: 0; border-bottom: 1px solid var(--border-subtle); padding: 10px 4px; background: transparent; color: var(--fg-2); cursor: pointer; text-align: left; }
.optimizer-history__run-list-item:hover, .optimizer-history__run-list-item--active { background: var(--bg-2); color: var(--fg-0); }
.optimizer-history__detail { display: flex; flex-direction: column; gap: 14px; }
.optimizer-history__title { margin: 4px 0 0; color: var(--fg-0); font-size: 18px; font-weight: 600; }
.optimizer-history__status-chip { border: 1px solid var(--border); border-radius: var(--r-pill); padding: 3px 9px; color: var(--fg-2); font-family: var(--font-mono); font-size: 11px; }
.optimizer-history__stats { display: flex; flex-wrap: wrap; gap: 8px; }
.optimizer-history__stats span { border: 1px solid var(--border-subtle); border-radius: var(--r-sm); padding: 5px 8px; color: var(--fg-3); font-family: var(--font-mono); font-size: 11px; }
.optimizer-history__stats-link { border: 1px solid var(--border-subtle); border-radius: var(--r-sm); padding: 5px 8px; color: var(--accent); font-family: var(--font-mono); font-size: 11px; text-decoration: none; }
.optimizer-history__stats-link:hover { text-decoration: underline; }
.optimizer-history__trend { height: 116px; border: 1px solid var(--border-subtle); border-radius: var(--r-md); padding: 12px; background: var(--bg-inset); }
.optimizer-history__trend svg { width: 100%; height: 100%; }
.optimizer-history__table { width: 100%; border-collapse: collapse; }
.optimizer-history__table th, .optimizer-history__table td { border-bottom: 1px solid var(--border-subtle); padding: 10px 12px; text-align: left; }
.optimizer-history__table th { color: var(--fg-4); font-size: 11px; font-weight: 500; text-transform: uppercase; }
.optimizer-history__table td { color: var(--fg-2); font-size: 13px; }
.optimizer-history__link { color: var(--accent); text-decoration: none; }
.optimizer-history__link:hover { text-decoration: underline; }
@media (max-width: 900px) { .optimizer-history { grid-template-columns: 1fr; } }
</style>
