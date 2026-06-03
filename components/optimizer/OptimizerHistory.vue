<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { OptimizerRun, ConfusionMatrix } from '~/types/api'
import { bestOptimizerAccuracy } from '~/utils/optimizerState'

const props = defineProps<{
  runs: OptimizerRun[]
  selectedRun: OptimizerRun | null
  loading: boolean
}>()

defineEmits<{ selectRun: [id: number] }>()

const sortedRounds = computed(() =>
  props.selectedRun
    ? [...props.selectedRun.rounds].sort((a, b) => a.round_number - b.round_number)
    : [],
)

const expandedRounds = ref<Set<number>>(new Set())

function toggleRound(n: number) {
  if (expandedRounds.value.has(n)) expandedRounds.value.delete(n)
  else expandedRounds.value.add(n)
}

watch(() => props.selectedRun?.optimizer_run_id, () => {
  expandedRounds.value = new Set()
})

function formatPercent(value: number | null | undefined): string {
  if (value == null) return 'n/a'
  return `${(value * 100).toFixed(1)}%`
}

function deltaColor(delta: number | null | undefined): string {
  if (delta == null) return 'var(--fg-4)'
  return delta >= 0 ? 'var(--action-rebuild)' : 'var(--action-notify)'
}

function deltaLabel(delta: number | null | undefined): string {
  if (delta == null) return '—'
  const pct = (delta * 100).toFixed(1)
  return delta >= 0 ? `+${pct}%` : `${pct}%`
}

function confusionPredictedActions(matrix: ConfusionMatrix): string[] {
  const cols = new Set<string>()
  for (const predicted of Object.values(matrix)) {
    for (const k of Object.keys(predicted)) cols.add(k)
  }
  return [...cols].sort()
}

function shortAction(action: string): string {
  return action.replace('trigger_', '').replace('notify_', 'notify/').replace('send_', 'send/')
}

function bestRoundAccuracy(run: OptimizerRun): number | null {
  const acc = bestOptimizerAccuracy(run)
  return acc ?? null
}
</script>

<template>
  <section class="optimizer-history">
    <!-- ── Run list ── -->
    <UiCard class="optimizer-history__list-card">
      <div class="optimizer-history__panel-head">
        <UiEyebrow>Runs</UiEyebrow>
        <span v-if="loading" class="optimizer-history__muted">Loading…</span>
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
          <span class="optimizer-history__status-chip" :class="`optimizer-history__status-chip--${run.status}`">{{ run.status }}</span>
        </div>
        <!-- Model badges -->
        <div v-if="run.optimizer_model || run.evaluator_model" class="optimizer-history__model-badges">
          <span v-if="run.optimizer_model" class="optimizer-history__badge optimizer-history__badge--opt">
            opt: {{ run.optimizer_model.split('/').pop() }}
          </span>
          <span v-if="run.evaluator_model" class="optimizer-history__badge optimizer-history__badge--eval">
            eval: {{ run.evaluator_model.split('/').pop() }}
          </span>
        </div>
        <!-- Accuracy flow: baseline → best → test -->
        <div class="optimizer-history__acc-flow">
          <span class="num">{{ formatPercent(run.baseline_accuracy) }}</span>
          <span class="optimizer-history__acc-arrow">→</span>
          <span class="num" :style="{ color: 'var(--action-rebuild)' }">{{ formatPercent(bestRoundAccuracy(run)) }}</span>
          <span class="optimizer-history__acc-arrow">→</span>
          <span class="num">{{ formatPercent(run.test_accuracy) }}</span>
        </div>
      </button>
    </UiCard>

    <!-- ── Run detail ── -->
    <UiCard class="optimizer-history__detail">
      <template v-if="selectedRun">
        <!-- Header -->
        <div class="optimizer-history__panel-head">
          <div>
            <UiEyebrow>Run detail</UiEyebrow>
            <h2 class="optimizer-history__title num">#{{ selectedRun.optimizer_run_id }}</h2>
          </div>
          <span class="optimizer-history__status-chip">{{ selectedRun.status }}</span>
        </div>

        <!-- Model badges -->
        <div class="optimizer-history__model-badges optimizer-history__model-badges--large">
          <span v-if="selectedRun.optimizer_model" class="optimizer-history__badge optimizer-history__badge--opt">
            optimizer: {{ selectedRun.optimizer_model }}
          </span>
          <span v-if="selectedRun.evaluator_provider || selectedRun.evaluator_model" class="optimizer-history__badge optimizer-history__badge--eval">
            eval: {{ [selectedRun.evaluator_provider, selectedRun.evaluator_model].filter(Boolean).join(' / ') }}
          </span>
        </div>

        <!-- Stats row -->
        <div class="optimizer-history__stats">
          <span>Target {{ formatPercent(selectedRun.target_accuracy) }}</span>
          <span>Baseline {{ formatPercent(selectedRun.baseline_accuracy) }}</span>
          <span>Best {{ formatPercent(bestRoundAccuracy(selectedRun)) }}</span>
          <span>Test {{ formatPercent(selectedRun.test_accuracy) }}</span>
          <span>{{ selectedRun.rounds.length }} rounds</span>
          <NuxtLink
            v-if="selectedRun.baseline_eval_run_id != null"
            :to="`/evaluate/history/${selectedRun.baseline_eval_run_id}`"
            class="optimizer-history__stats-link"
          >
            Baseline eval ↗
          </NuxtLink>
        </div>

        <!-- Currently evaluating -->
        <div v-if="selectedRun.current_eval_run_id != null && selectedRun.status === 'running'" class="optimizer-history__evaluating">
          <UiSpinner size="sm" />
          <span>Evaluating…</span>
          <NuxtLink :to="`/evaluate/history/${selectedRun.current_eval_run_id}`" class="optimizer-history__link">
            View eval #{{ selectedRun.current_eval_run_id }} ↗
          </NuxtLink>
        </div>

        <!-- Error message -->
        <div v-if="selectedRun.error_message" class="optimizer-history__error-msg">
          {{ selectedRun.error_message }}
        </div>

        <!-- Rounds -->
        <div v-if="sortedRounds.length > 0" class="optimizer-history__rounds">
          <div
            v-for="round in sortedRounds"
            :key="round.round_number"
            class="optimizer-history__round"
          >
            <!-- Round header row -->
            <button
              class="optimizer-history__round-head"
              type="button"
              @click="toggleRound(round.round_number)"
            >
              <span class="num">R{{ round.round_number }}</span>
              <span
                class="optimizer-history__kept-badge"
                :class="round.kept ? 'optimizer-history__kept-badge--kept' : 'optimizer-history__kept-badge--rejected'"
              >
                {{ round.kept ? 'Kept' : 'Rejected' }}
              </span>
              <span class="num" :style="{ color: deltaColor(round.accuracy_delta) }">
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
              <span class="optimizer-history__round-toggle">{{ expandedRounds.has(round.round_number) ? '▲' : '▼' }}</span>
            </button>

            <!-- Round expanded detail -->
            <div v-if="expandedRounds.has(round.round_number)" class="optimizer-history__round-detail">
              <!-- Failure analysis -->
              <details v-if="round.analysis_text" class="optimizer-history__analysis">
                <summary class="optimizer-history__analysis-summary">Failure analysis</summary>
                <p class="optimizer-history__analysis-body">{{ round.analysis_text }}</p>
              </details>

              <!-- Confusion matrix -->
              <div v-if="round.confusion_matrix && Object.keys(round.confusion_matrix).length > 0" class="optimizer-history__matrix">
                <div class="optimizer-history__matrix-label">Confusion matrix</div>
                <div class="optimizer-history__matrix-wrap">
                  <table class="optimizer-history__matrix-table">
                    <thead>
                      <tr>
                        <th class="optimizer-history__matrix-corner">expected ↓ / predicted →</th>
                        <th
                          v-for="col in confusionPredictedActions(round.confusion_matrix)"
                          :key="col"
                        >{{ shortAction(col) }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="(predicted, expected) in round.confusion_matrix"
                        :key="expected"
                      >
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
@media (max-width: 900px) { .optimizer-history { grid-template-columns: 1fr; } }

.optimizer-history__list-card { display: flex; flex-direction: column; gap: 0; padding: 0; overflow: hidden; }
.optimizer-history__panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; }
.optimizer-history__muted { color: var(--fg-4); font-size: 12px; }
.optimizer-history__empty {
  display: flex; justify-content: center; border: 1px dashed var(--border-subtle);
  border-radius: var(--r-md); padding: 22px; color: var(--fg-4); font-size: 13px; text-align: center; margin: 12px;
}
.optimizer-history__empty--compact { min-height: 48px; align-items: center; margin: 0; }

/* Run list items */
.optimizer-history__run-item {
  display: flex; flex-direction: column; gap: 6px;
  width: 100%; border: 0; border-bottom: 1px solid var(--border-subtle);
  padding: 10px 14px; background: transparent; color: var(--fg-2); cursor: pointer; text-align: left;
  transition: background var(--dur-fast);
}
.optimizer-history__run-item:hover,
.optimizer-history__run-item--active { background: var(--bg-2); color: var(--fg-0); }
.optimizer-history__run-item:last-child { border-bottom: none; }

.optimizer-history__run-item-head { display: flex; align-items: center; gap: 8px; }
.optimizer-history__acc-flow {
  display: flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 11px; color: var(--fg-3);
}
.optimizer-history__acc-arrow { color: var(--fg-4); }

/* Status chip */
.optimizer-history__status-chip {
  border: 1px solid var(--border); border-radius: var(--r-pill);
  padding: 2px 8px; font-family: var(--font-mono); font-size: 10px; color: var(--fg-3);
}

/* Model badges */
.optimizer-history__model-badges { display: flex; flex-wrap: wrap; gap: 4px; }
.optimizer-history__model-badges--large { margin-bottom: 4px; }
.optimizer-history__badge {
  font-family: var(--font-mono); font-size: 10px;
  border-radius: var(--r-sm); padding: 2px 7px; white-space: nowrap;
}
.optimizer-history__badge--opt { color: #a78bfa; background: rgba(167,139,250,0.12); }
.optimizer-history__badge--eval { color: #60a5fa; background: rgba(96,165,250,0.12); }

/* Detail panel */
.optimizer-history__detail { display: flex; flex-direction: column; gap: 14px; }
.optimizer-history__title { margin: 4px 0 0; color: var(--fg-0); font-size: 18px; font-weight: 600; }

.optimizer-history__stats {
  display: flex; flex-wrap: wrap; gap: 6px;
}
.optimizer-history__stats span {
  border: 1px solid var(--border-subtle); border-radius: var(--r-sm);
  padding: 4px 8px; color: var(--fg-3); font-family: var(--font-mono); font-size: 11px;
}
.optimizer-history__stats-link {
  border: 1px solid var(--border-subtle); border-radius: var(--r-sm);
  padding: 4px 8px; color: var(--accent); font-family: var(--font-mono); font-size: 11px;
  text-decoration: none;
}
.optimizer-history__stats-link:hover { text-decoration: underline; }

.optimizer-history__evaluating {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: var(--r-md);
  background: var(--bg-2); border: 1px solid var(--border-subtle);
  font-size: 13px; color: var(--fg-3);
}
.optimizer-history__error-msg {
  padding: 8px 12px; border-radius: var(--r-md);
  background: var(--action-notify-soft); border: 1px solid rgba(239,68,68,0.2);
  font-size: 12px; color: var(--action-notify); font-family: var(--font-mono);
}

.optimizer-history__link { color: var(--accent); text-decoration: none; font-size: 11px; font-family: var(--font-mono); }
.optimizer-history__link:hover { text-decoration: underline; }

/* Rounds */
.optimizer-history__rounds { display: flex; flex-direction: column; gap: 4px; }
.optimizer-history__round {
  border: 1px solid var(--border-subtle); border-radius: var(--r-md); overflow: hidden;
}
.optimizer-history__round-head {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  width: 100%; padding: 10px 12px; background: transparent; border: none;
  cursor: pointer; text-align: left; font-size: 12px; color: var(--fg-2);
  transition: background var(--dur-fast);
}
.optimizer-history__round-head:hover { background: var(--bg-2); }
.optimizer-history__round-toggle { margin-left: auto; color: var(--fg-4); font-size: 10px; }

.optimizer-history__kept-badge {
  border-radius: var(--r-pill); padding: 2px 8px; font-size: 10px; font-weight: 600;
}
.optimizer-history__kept-badge--kept { color: var(--action-rebuild); background: var(--action-rebuild-soft); }
.optimizer-history__kept-badge--rejected { color: var(--action-notify); background: var(--action-notify-soft); }

/* Round detail */
.optimizer-history__round-detail {
  display: flex; flex-direction: column; gap: 12px;
  padding: 12px; border-top: 1px solid var(--border-subtle); background: var(--bg-1);
}

/* Failure analysis */
.optimizer-history__analysis { border: 1px solid var(--border-subtle); border-radius: var(--r-sm); }
.optimizer-history__analysis-summary {
  padding: 8px 12px; cursor: pointer; font-size: 12px; font-weight: 600;
  color: var(--fg-3); list-style: none; user-select: none;
}
.optimizer-history__analysis-summary::-webkit-details-marker { display: none; }
.optimizer-history__analysis-body {
  padding: 8px 12px 12px; font-size: 12px; color: var(--fg-2); line-height: 1.6;
  white-space: pre-wrap; max-height: 300px; overflow-y: auto; margin: 0;
  border-top: 1px solid var(--border-subtle);
}

/* Confusion matrix */
.optimizer-history__matrix-label { font-size: 11px; font-weight: 600; color: var(--fg-4); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
.optimizer-history__matrix-wrap { overflow-x: auto; border: 1px solid var(--border-subtle); border-radius: var(--r-sm); }
.optimizer-history__matrix-table { border-collapse: collapse; font-size: 11px; font-family: var(--font-mono); }
.optimizer-history__matrix-table th, .optimizer-history__matrix-table td {
  border: 1px solid var(--border-subtle); padding: 5px 10px; text-align: center;
}
.optimizer-history__matrix-table th { background: var(--bg-2); color: var(--fg-4); font-weight: 500; }
.optimizer-history__matrix-corner { text-align: left; font-size: 10px; min-width: 100px; }
.optimizer-history__matrix-row-label { background: var(--bg-2); color: var(--fg-3); text-align: left; font-weight: 500; }
.optimizer-history__matrix-cell { color: var(--fg-4); }
.optimizer-history__matrix-cell--nonzero { color: var(--action-notify); font-weight: 700; background: var(--action-notify-soft); }
</style>
