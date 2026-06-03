<script setup lang="ts">
import type {
  EvalCompareGroup,
  EvalCompareGroupByProvider,
  EvalCompareGroupByPromptVersion,
  EvalRun,
} from '~/types/api'

definePageMeta({ middleware: 'auth' })

const api = useApi()

type Dimension = 'provider' | 'prompt_version'

const activeDimension = ref<Dimension>('provider')
const groups = ref<EvalCompareGroup[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

function isProviderGroup(g: EvalCompareGroup): g is EvalCompareGroupByProvider {
  return 'provider' in g
}

function isPromptGroup(g: EvalCompareGroup): g is EvalCompareGroupByPromptVersion {
  return 'prompt_version_id' in g
}

const providerGroups = computed(() =>
  (groups.value as EvalCompareGroup[]).filter(isProviderGroup) as EvalCompareGroupByProvider[],
)

const promptGroups = computed(() =>
  (groups.value as EvalCompareGroup[]).filter(isPromptGroup) as EvalCompareGroupByPromptVersion[],
)

const sortedProviderGroups = computed(() =>
  [...providerGroups.value].sort((a, b) => b.avg_accuracy - a.avg_accuracy),
)

const sortedPromptGroups = computed(() =>
  [...promptGroups.value].sort((a, b) => b.avg_accuracy - a.avg_accuracy),
)

function formatAccuracy(acc: number): string {
  return (acc * 100).toFixed(1) + '%'
}

function accuracyColor(acc: number): string {
  if (acc >= 0.8) return 'var(--action-rebuild)'
  if (acc >= 0.5) return 'var(--action-fallback)'
  return 'var(--action-notify)'
}

function dotBottomPct(run: EvalRun): string {
  return (run.accuracy * 100).toFixed(1) + '%'
}

async function fetchCompare() {
  loading.value = true
  error.value = null
  try {
    const res = await api.getEvalCompare(activeDimension.value)
    if (res.status === 'success') {
      groups.value = res.data.groups.map(g => ({
        ...g,
        runs: g.runs.filter(r => r.source == null || r.source === 'manual'),
      }))
    } else error.value = res.message
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Load failed'
  } finally {
    loading.value = false
  }
}

function switchDimension(dim: Dimension) {
  if (dim === activeDimension.value) return
  activeDimension.value = dim
  fetchCompare()
}

onMounted(fetchCompare)
</script>

<template>
  <AppTopBar title="Compare runs" subtitle="Accuracy across dimensions">
    <template #actions>
      <NuxtLink to="/evaluate/history" class="arb-compare__back">← History</NuxtLink>
    </template>
  </AppTopBar>

  <div class="arb-compare">
    <!-- Dimension toggle -->
    <div class="arb-compare__toggle-wrap">
      <div class="arb-compare__toggle">
        <button
          class="arb-compare__toggle-btn"
          :class="{ 'arb-compare__toggle-btn--active': activeDimension === 'provider' }"
          @click="switchDimension('provider')"
        >By provider</button>
        <button
          class="arb-compare__toggle-btn"
          :class="{ 'arb-compare__toggle-btn--active': activeDimension === 'prompt_version' }"
          @click="switchDimension('prompt_version')"
        >By prompt version</button>
      </div>
    </div>

    <div v-if="loading" class="arb-compare__loading"><UiSpinner size="sm" /></div>
    <div v-else-if="error" class="arb-compare__error">{{ error }}</div>

    <!-- ── By provider ── -->
    <template v-else-if="activeDimension === 'provider'">
      <div v-if="providerGroups.length === 0" class="arb-compare__empty">
        No evaluation data yet.
      </div>

      <template v-else>
        <!-- Bar chart -->
        <UiCard class="arb-compare__chart-card">
          <UiEyebrow>Accuracy by provider</UiEyebrow>
          <div class="arb-compare__chart">
            <div class="arb-compare__chart-y">
              <span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span>
            </div>
            <div class="arb-compare__chart-bars">
              <div
                v-for="group in sortedProviderGroups"
                :key="group.provider + group.model"
                class="arb-compare__bar-group"
              >
                <div class="arb-compare__bars-row">
                  <!-- Avg accuracy bar -->
                  <div class="arb-compare__bar-col">
                    <div class="arb-compare__bar-track">
                      <div
                        class="arb-compare__bar arb-compare__bar--avg"
                        :style="{
                          height: (group.avg_accuracy * 100).toFixed(1) + '%',
                          background: accuracyColor(group.avg_accuracy),
                        }"
                      >
                        <!-- Individual run dots -->
                        <NuxtLink
                          v-for="run in group.runs"
                          :key="run.run_id"
                          :to="`/evaluate/history/${run.run_id}`"
                          class="arb-compare__dot"
                          :style="{ bottom: dotBottomPct(run) }"
                          :title="`Run #${run.run_id} — ${formatAccuracy(run.accuracy)}`"
                        />
                      </div>
                    </div>
                    <span class="arb-compare__bar-label">avg</span>
                  </div>
                  <!-- Best accuracy bar -->
                  <div class="arb-compare__bar-col">
                    <div class="arb-compare__bar-track">
                      <div
                        class="arb-compare__bar arb-compare__bar--best"
                        :style="{
                          height: (group.best_accuracy * 100).toFixed(1) + '%',
                          background: accuracyColor(group.best_accuracy),
                          opacity: 0.55,
                        }"
                      />
                    </div>
                    <span class="arb-compare__bar-label">best</span>
                  </div>
                </div>
                <div class="arb-compare__group-label">
                  <span class="arb-compare__group-provider">{{ group.provider }}</span>
                  <span class="arb-compare__group-model mono">{{ group.model }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="sortedProviderGroups.length === 1" class="arb-compare__hint">
            Add more providers to compare.
          </div>
        </UiCard>

        <!-- Summary table -->
        <div class="arb-compare__table-wrap">
          <table class="arb-compare__table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Model</th>
                <th>Runs</th>
                <th>Avg Accuracy</th>
                <th>Best Accuracy</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="group in sortedProviderGroups" :key="group.provider + group.model">
                <td>{{ group.provider }}</td>
                <td class="mono">{{ group.model }}</td>
                <td class="num">{{ group.run_count }}</td>
                <td>
                  <span class="arb-compare__acc" :style="{ color: accuracyColor(group.avg_accuracy) }">
                    {{ formatAccuracy(group.avg_accuracy) }}
                  </span>
                </td>
                <td>
                  <span class="arb-compare__acc" :style="{ color: accuracyColor(group.best_accuracy) }">
                    {{ formatAccuracy(group.best_accuracy) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>

    <!-- ── By prompt version ── -->
    <template v-else>
      <div v-if="promptGroups.length === 0" class="arb-compare__empty">
        No evaluation data yet.
      </div>

      <template v-else>
        <UiCard class="arb-compare__chart-card">
          <UiEyebrow>Accuracy by prompt version</UiEyebrow>
          <div class="arb-compare__chart">
            <div class="arb-compare__chart-y">
              <span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span>
            </div>
            <div class="arb-compare__chart-bars">
              <div
                v-for="group in sortedPromptGroups"
                :key="group.prompt_version_id"
                class="arb-compare__bar-group"
              >
                <div class="arb-compare__bars-row">
                  <div class="arb-compare__bar-col">
                    <div class="arb-compare__bar-track">
                      <div
                        class="arb-compare__bar"
                        :style="{
                          height: (group.avg_accuracy * 100).toFixed(1) + '%',
                          background: accuracyColor(group.avg_accuracy),
                        }"
                      />
                    </div>
                  </div>
                </div>
                <div class="arb-compare__group-label">
                  <span class="arb-compare__group-provider">v{{ group.prompt_version_id }}</span>
                  <span class="arb-compare__group-model">{{ group.run_count }} run{{ group.run_count !== 1 ? 's' : '' }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="sortedPromptGroups.length === 1" class="arb-compare__hint">
            Only one prompt version evaluated so far.
          </div>
        </UiCard>
      </template>
    </template>
  </div>
</template>

<style scoped>
.arb-compare {
  padding: var(--page-pad);
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.arb-compare__back {
  font-size: 13px;
  color: var(--fg-3);
  text-decoration: none;
  transition: color var(--dur-fast);
}
.arb-compare__back:hover { color: var(--fg-1); }
.arb-compare__loading { padding: 40px; text-align: center; }
.arb-compare__empty {
  padding: 40px;
  text-align: center;
  color: var(--fg-4);
  font-size: 13px;
}
.arb-compare__error { padding: 12px; color: var(--action-notify); font-size: 13px; }

/* Dimension toggle */
.arb-compare__toggle-wrap { display: flex; }
.arb-compare__toggle {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
}
.arb-compare__toggle-btn {
  padding: 7px 16px;
  font-size: 13px;
  background: transparent;
  border: none;
  color: var(--fg-3);
  cursor: pointer;
  transition: all var(--dur-fast);
}
.arb-compare__toggle-btn + .arb-compare__toggle-btn {
  border-left: 1px solid var(--border);
}
.arb-compare__toggle-btn--active {
  background: var(--bg-2);
  color: var(--fg-1);
  font-weight: 600;
}

/* Chart card */
.arb-compare__chart-card {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.arb-compare__chart {
  display: flex;
  gap: 12px;
  align-items: stretch;
  height: 220px;
}
.arb-compare__chart-y {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  padding-bottom: 28px;
  font-size: 10px;
  color: var(--fg-4);
  font-family: var(--font-mono);
  flex-shrink: 0;
  width: 36px;
}
.arb-compare__chart-bars {
  flex: 1;
  display: flex;
  align-items: flex-end;
  gap: 24px;
  border-left: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
  padding: 8px 16px 0;
}
.arb-compare__bar-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 60px;
}
.arb-compare__bars-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  width: 100%;
  height: 180px;
}
.arb-compare__bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: 100%;
}
.arb-compare__bar-track {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
}
.arb-compare__bar {
  width: 100%;
  border-radius: 3px 3px 0 0;
  position: relative;
  transition: height 0.35s ease-out;
  min-height: 2px;
}
.arb-compare__bar-label {
  font-size: 9px;
  color: var(--fg-4);
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.arb-compare__group-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.arb-compare__group-provider {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg-1);
}
.arb-compare__group-model {
  font-size: 10px;
  color: var(--fg-4);
}

/* Run dots */
.arb-compare__dot {
  position: absolute;
  left: 50%;
  transform: translate(-50%, 50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bg-0, #0a0a0a);
  border: 2px solid currentColor;
  cursor: pointer;
  transition: transform var(--dur-fast);
  z-index: 1;
}
.arb-compare__dot:hover {
  transform: translate(-50%, 50%) scale(1.5);
}

.arb-compare__hint {
  font-size: 12px;
  color: var(--fg-4);
  text-align: center;
}

/* Summary table */
.arb-compare__table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
}
.arb-compare__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.arb-compare__table th {
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
.arb-compare__table td {
  padding: 11px 14px;
  color: var(--fg-2);
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
}
.arb-compare__table tr:last-child td { border-bottom: none; }
.arb-compare__acc {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
}
.num { font-family: var(--font-mono); font-size: 12px; }
.mono { font-family: var(--font-mono); font-size: 12px; }
</style>
