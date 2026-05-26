<script setup lang="ts">
import type { DecisionRecord, DecisionStats, PrimaryAction } from '~/types/api'

definePageMeta({ middleware: 'auth' })

const api = useApi()

const decisions = ref<DecisionRecord[]>([])
const stats = ref<DecisionStats | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const selectedDecision = ref<DecisionRecord | null>(null)
const filterAction = ref<PrimaryAction | null>(null)
const page = ref(0)
const PAGE_SIZE = 20

async function load() {
  loading.value = true
  error.value = null
  try {
    const [dRes, sRes] = await Promise.all([
      api.getDecisions({
        limit: PAGE_SIZE,
        offset: page.value * PAGE_SIZE,
        action: filterAction.value,
      }),
      stats.value ? Promise.resolve(null) : api.getDecisionStats(),
    ])
    if (dRes.status === 'success') decisions.value = dRes.data.decisions
    if (sRes?.status === 'success') stats.value = sRes.data
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Load failed'
  } finally {
    loading.value = false
  }
}

watch(filterAction, () => { page.value = 0; load() })
onMounted(load)

const PRIMARY_ACTIONS: PrimaryAction[] = [
  'trigger_rebuild',
  'trigger_fallback',
  'trigger_restart',
  'notify_human',
  'send_email',
]
</script>

<template>
  <AppTopBar title="Decisions" subtitle="Decision history" />

  <div class="arb-decisions">
    <!-- Stats row -->
    <div v-if="stats" class="arb-decisions__stats">
      <UiCard class="arb-decisions__stat">
        <UiEyebrow>Avg confidence</UiEyebrow>
        <span class="arb-decisions__stat-val num">
          {{ stats.avg_confidence != null ? Math.round(stats.avg_confidence * 100) + '%' : '—' }}
        </span>
      </UiCard>
      <UiCard
        v-for="action in PRIMARY_ACTIONS"
        :key="action"
        class="arb-decisions__stat"
      >
        <UiActionBadge :action="action" size="sm" />
        <span class="arb-decisions__stat-val num">{{ stats.by_action[action] ?? 0 }}</span>
      </UiCard>
    </div>

    <!-- Filter bar -->
    <div class="arb-decisions__toolbar">
      <div class="arb-decisions__filters">
        <button
          class="arb-decisions__filter-btn"
          :class="{ 'arb-decisions__filter-btn--active': filterAction === null }"
          @click="filterAction = null"
        >
          All
        </button>
        <button
          v-for="action in PRIMARY_ACTIONS"
          :key="action"
          class="arb-decisions__filter-btn"
          :class="{ 'arb-decisions__filter-btn--active': filterAction === action }"
          @click="filterAction = action"
        >
          {{ action.replace(/_/g, ' ') }}
        </button>
      </div>
    </div>

    <!-- Table -->
    <div class="arb-decisions__table-wrap">
      <div v-if="loading" class="arb-decisions__loading">
        <UiSpinner size="sm" />
      </div>
      <div v-else-if="error" class="arb-decisions__error">{{ error }}</div>
      <div v-else-if="decisions.length === 0" class="arb-decisions__empty">
        No decisions found.
      </div>
      <table v-else class="arb-decisions__table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Action</th>
            <th>Confidence</th>
            <th>Source</th>
            <th>Provider</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="d in decisions"
            :key="d.id"
            class="arb-decisions__row"
            @click="selectedDecision = d"
          >
            <td class="num">#{{ d.id }}</td>
            <td><UiActionBadge :action="d.primary_action" size="sm" /></td>
            <td><UiSmallMeter :value="d.confidence" /></td>
            <td><UiSourceBadge :source="d.source" /></td>
            <td><UiProviderChip :provider="d.provider" /></td>
            <td class="num arb-decisions__td-time">{{ new Date(d.created_at).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="!loading && decisions.length > 0" class="arb-decisions__pagination">
      <UiButton variant="ghost" size="sm" :disabled="page === 0" @click="page--; load()">
        Prev
      </UiButton>
      <span class="arb-decisions__page-info num">Page {{ page + 1 }}</span>
      <UiButton variant="ghost" size="sm" :disabled="decisions.length < PAGE_SIZE" @click="page++; load()">
        Next
      </UiButton>
    </div>
  </div>

  <!-- Detail drawer -->
  <Teleport to="body">
    <div v-if="selectedDecision" class="arb-drawer-overlay" @click.self="selectedDecision = null">
      <div class="arb-drawer">
        <div class="arb-drawer__header">
          <span class="arb-drawer__title num">#{{ selectedDecision.id }}</span>
          <button class="arb-drawer__close" @click="selectedDecision = null">✕</button>
        </div>
        <div class="arb-drawer__body">
          <div class="arb-drawer__row">
            <UiActionBadge :action="selectedDecision.primary_action" size="lg" />
            <UiSourceBadge :source="selectedDecision.source" />
            <UiProviderChip :provider="selectedDecision.provider" />
          </div>
          <UiSmallMeter :value="selectedDecision.confidence" />
          <div class="arb-drawer__section">
            <UiEyebrow>Reason</UiEyebrow>
            <p class="arb-drawer__text">{{ selectedDecision.reason }}</p>
          </div>
          <div class="arb-drawer__section">
            <UiEyebrow>Log snippet</UiEyebrow>
            <pre class="arb-drawer__snippet">{{ selectedDecision.log_snippet }}</pre>
          </div>
          <div class="arb-drawer__section">
            <UiEyebrow>Created</UiEyebrow>
            <span class="arb-drawer__text num">{{ new Date(selectedDecision.created_at).toLocaleString() }}</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.arb-decisions {
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
}
.arb-decisions__stats {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.arb-decisions__stat {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 100px;
}
.arb-decisions__stat-val {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 600;
  color: var(--fg-0);
  line-height: 1;
}
.arb-decisions__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.arb-decisions__filters {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.arb-decisions__filter-btn {
  padding: 5px 10px;
  font-size: 12px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--fg-3);
  cursor: pointer;
  transition: all var(--dur-fast);
  font-family: var(--font-mono);
}
.arb-decisions__filter-btn:hover { background: var(--bg-2); color: var(--fg-1); }
.arb-decisions__filter-btn--active {
  background: var(--bg-3);
  border-color: var(--border);
  color: var(--fg-0);
}
.arb-decisions__table-wrap {
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  overflow: hidden;
}
.arb-decisions__loading,
.arb-decisions__empty {
  padding: 32px;
  text-align: center;
  color: var(--fg-4);
  font-size: 13px;
}
.arb-decisions__error {
  padding: 16px;
  color: var(--action-notify);
  font-size: 13px;
}
.arb-decisions__table {
  width: 100%;
  border-collapse: collapse;
}
.arb-decisions__table th {
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
.arb-decisions__table td {
  padding: 11px 14px;
  font-size: 13px;
  color: var(--fg-2);
  border-bottom: 1px solid var(--border-subtle);
}
.arb-decisions__row {
  cursor: pointer;
  transition: background var(--dur-fast);
}
.arb-decisions__row:hover td { background: var(--bg-2); }
.arb-decisions__row:last-child td { border-bottom: none; }
.arb-decisions__td-time { font-size: 11px; color: var(--fg-4); }
.arb-decisions__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.arb-decisions__page-info {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg-3);
}

/* Drawer */
.arb-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 100;
  display: flex;
  justify-content: flex-end;
}
.arb-drawer {
  width: 420px;
  max-width: 100vw;
  height: 100vh;
  background: var(--bg-1);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.arb-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
}
.arb-drawer__title {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-0);
}
.arb-drawer__close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--fg-3);
  cursor: pointer;
  border-radius: var(--r-sm);
  font-size: 12px;
}
.arb-drawer__close:hover { background: var(--bg-2); }
.arb-drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.arb-drawer__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.arb-drawer__section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.arb-drawer__text {
  font-size: 13.5px;
  color: var(--fg-1);
  line-height: 1.6;
  margin: 0;
}
.arb-drawer__snippet {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--fg-3);
  background: var(--bg-inset);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: 10px 12px;
  white-space: pre-wrap;
  margin: 0;
  max-height: 180px;
  overflow-y: auto;
}
</style>
