<script setup lang="ts">
import type { EvalRun } from '~/types/api'
import {
  getEvalRunSource,
  getEvalRunSourceLabel,
  getEvalRunSourceTone,
  getRunAccuracyDisplay,
} from '~/utils/evalDisplay'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const runs = ref<EvalRun[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const deleteErrors = ref<Record<number, string>>({})

function sourceLabel(run: EvalRun): string {
  return getEvalRunSourceLabel(getEvalRunSource(run))
}

function sourceClass(run: EvalRun): string {
  const tone = getEvalRunSourceTone(getEvalRunSource(run))
  return tone ? `arb-history__source--${tone}` : ''
}

function statusLabel(status: string | undefined): string {
  return status ?? 'completed'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

function durationSecs(run: EvalRun): string {
  if (!run.finished_at) return '--'
  const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
  return (ms / 1000).toFixed(1) + 's'
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await api.getEvalHistory()
    if (res.status === 'success') {
      runs.value = res.data.runs
    } else {
      error.value = res.message || 'Load failed'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Load failed'
  } finally {
    loading.value = false
  }
}

async function deleteRun(run: EvalRun) {
  if (!window.confirm(`Delete run #${run.run_id}? This cannot be undone.`)) return
  deleteErrors.value = { ...deleteErrors.value }
  delete deleteErrors.value[run.run_id]
  try {
    await api.deleteEvalRun(run.run_id)
    runs.value = runs.value.filter(r => r.run_id !== run.run_id)
  } catch (e) {
    deleteErrors.value[run.run_id] = e instanceof Error ? e.message : 'Delete failed'
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
            <th>Source</th>
            <th>Status</th>
            <th>Prompt Ver.</th>
            <th>Provider</th>
            <th>Model</th>
            <th>Accuracy</th>
            <th>Correct / Total</th>
            <th>Timeouts</th>
            <th>Duration</th>
            <th>Started</th>
            <th></th>
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
            <td>
              <span v-if="sourceLabel(run)" class="arb-history__source" :class="sourceClass(run)">
                {{ sourceLabel(run) }}
              </span>
            </td>
            <td>
              <span class="arb-history__status">{{ statusLabel(run.status) }}</span>
            </td>
            <td class="num">v{{ run.prompt_version_id }}</td>
            <td>{{ run.provider }}</td>
            <td class="mono">{{ run.model }}</td>
            <td>
              <span class="arb-history__acc" :style="{ color: getRunAccuracyDisplay(run).color }">
                {{ getRunAccuracyDisplay(run).label }}
              </span>
            </td>
            <td class="num">{{ run.correct }} / {{ run.total }}</td>
            <td class="num">{{ run.timeout_count }}</td>
            <td class="num">{{ durationSecs(run) }}</td>
            <td class="arb-history__date">{{ formatDate(run.started_at) }}</td>
            <td class="arb-history__actions" @click.stop>
              <UiButton
                variant="ghost"
                size="sm"
                class="arb-history__delete-btn"
                @click.stop="deleteRun(run)"
              >
                Delete
              </UiButton>
              <span v-if="deleteErrors[run.run_id]" class="arb-history__delete-err">
                {{ deleteErrors[run.run_id] }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.arb-history {
  padding: var(--page-pad);
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
  -webkit-overflow-scrolling: touch;
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
.arb-history__source,
.arb-history__status {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: 3px 7px;
  font-family: var(--font-mono);
  font-size: 11px;
}
.arb-history__source--optimizer {
  color: #a78bfa;
  background: rgba(167, 139, 250, 0.12);
}
.arb-history__source--pool {
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.12);
}
.arb-history__source--manual {
  color: var(--fg-3);
  background: var(--bg-2);
}
.arb-history__status {
  color: var(--fg-3);
  background: var(--bg-2);
}
.arb-history__source-warning {
  border-top: 1px solid var(--border-subtle);
  padding: 8px 12px;
  color: var(--fg-4);
  font-size: 12px;
}
.arb-history__date { color: var(--fg-4); }
.num { font-family: var(--font-mono); font-size: 12px; }
.mono { font-family: var(--font-mono); font-size: 12px; }
.arb-history__actions {
  text-align: right;
  white-space: nowrap;
  padding-right: 8px;
}
.arb-history__delete-btn {
  color: var(--action-notify) !important;
  opacity: 0;
  transition: opacity var(--dur-fast);
}
.arb-history__row:hover .arb-history__delete-btn { opacity: 1; }
.arb-history__delete-err {
  display: block;
  font-size: 11px;
  color: var(--action-notify);
  margin-top: 2px;
}

@media (max-width: 767px) {
  .arb-history__delete-btn { opacity: 1; }
}
</style>
