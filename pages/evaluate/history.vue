<script setup lang="ts">
import type { EvalRun } from '~/types/api'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const runs = ref<EvalRun[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

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

function durationSecs(run: EvalRun): string {
  const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
  return (ms / 1000).toFixed(1) + 's'
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await api.getEvalHistory()
    if (res.status === 'success') runs.value = res.data.runs
    else error.value = res.message
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Load failed'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <AppTopBar title="Eval history" :subtitle="runs.length ? `${runs.length} runs` : ''">
    <template #actions>
      <NuxtLink to="/evaluate/history/compare">
        <UiButton variant="primary" size="sm">Compare runs →</UiButton>
      </NuxtLink>
    </template>
  </AppTopBar>

  <div class="arb-history">
    <div v-if="loading" class="arb-history__loading"><UiSpinner size="sm" /></div>
    <div v-else-if="error" class="arb-history__error">{{ error }}</div>
    <div v-else-if="runs.length === 0" class="arb-history__empty">
      No evaluation runs yet.
    </div>

    <div v-else class="arb-history__table-wrap">
      <table class="arb-history__table">
        <thead>
          <tr>
            <th>Run</th>
            <th>Prompt Ver.</th>
            <th>Provider</th>
            <th>Model</th>
            <th>Accuracy</th>
            <th>Correct / Total</th>
            <th>Timeouts</th>
            <th>Duration</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="run in runs"
            :key="run.run_id"
            class="arb-history__row"
            @click="navigateTo(`/evaluate/history/${run.run_id}`)"
          >
            <td class="num">#{{ run.run_id }}</td>
            <td class="num">v{{ run.prompt_version_id }}</td>
            <td>{{ run.provider }}</td>
            <td class="mono">{{ run.model }}</td>
            <td>
              <span class="arb-history__acc" :style="{ color: accuracyColor(run.accuracy) }">
                {{ formatAccuracy(run.accuracy) }}
              </span>
            </td>
            <td class="num">{{ run.correct }} / {{ run.total }}</td>
            <td class="num">{{ run.timeout_count }}</td>
            <td class="num">{{ durationSecs(run) }}</td>
            <td class="arb-history__date">{{ formatDate(run.started_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.arb-history {
  padding: 28px 32px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.arb-history__loading { padding: 40px; text-align: center; }
.arb-history__empty {
  padding: 40px;
  text-align: center;
  color: var(--fg-4);
  font-size: 13px;
}
.arb-history__error { padding: 12px; color: var(--action-notify); font-size: 13px; }

.arb-history__table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
}
.arb-history__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.arb-history__table th {
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
.arb-history__table td {
  padding: 11px 14px;
  color: var(--fg-2);
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
}
.arb-history__row {
  cursor: pointer;
  transition: background var(--dur-fast);
}
.arb-history__row:hover td { background: var(--bg-2); }
.arb-history__row:last-child td { border-bottom: none; }
.arb-history__acc {
  font-weight: 700;
  font-family: var(--font-mono);
  font-size: 13px;
}
.arb-history__date { color: var(--fg-4); }
.num { font-family: var(--font-mono); font-size: 12px; }
.mono { font-family: var(--font-mono); font-size: 12px; }
</style>
