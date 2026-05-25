<script setup lang="ts">
import type { AuditEvent } from '~/types/api'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const events = ref<AuditEvent[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const page = ref(0)
const PAGE_SIZE = 30

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await api.getAudit({ limit: PAGE_SIZE, offset: page.value * PAGE_SIZE })
    if (res.status === 'success') events.value = res.data
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Load failed'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <AppTopBar title="Audit log" subtitle="All system events and administrative actions" />

  <div class="arb-audit">
    <div v-if="loading" class="arb-audit__loading"><UiSpinner size="sm" /></div>
    <div v-else-if="error" class="arb-audit__error">{{ error }}</div>
    <div v-else-if="events.length === 0" class="arb-audit__empty">No audit events.</div>
    <div v-else class="arb-audit__timeline">
      <div
        v-for="ev in events"
        :key="`${ev.ts}-${ev.target}`"
        class="arb-audit__event"
      >
        <div class="arb-audit__event-icon">{{ ev.icon }}</div>
        <div class="arb-audit__event-body">
          <div class="arb-audit__event-header">
            <span class="arb-audit__event-text">{{ ev.text }}</span>
            <span class="arb-audit__event-target num">{{ ev.target }}</span>
          </div>
          <div class="arb-audit__event-meta">
            <span class="arb-audit__event-actor">{{ ev.actor }}</span>
            <UiChip>{{ ev.role }}</UiChip>
            <span class="arb-audit__event-kind num">{{ ev.kind }}</span>
            <span v-if="ev.delta" class="arb-audit__event-delta num">{{ ev.delta }}</span>
            <span class="arb-audit__event-ts num">{{ new Date(ev.ts).toLocaleString() }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!loading && events.length > 0" class="arb-audit__pagination">
      <UiButton variant="ghost" size="sm" :disabled="page === 0" @click="page--; load()">Prev</UiButton>
      <span class="arb-audit__page num">Page {{ page + 1 }}</span>
      <UiButton variant="ghost" size="sm" :disabled="events.length < PAGE_SIZE" @click="page++; load()">Next</UiButton>
    </div>
  </div>
</template>

<style scoped>
.arb-audit {
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
}
.arb-audit__loading, .arb-audit__empty {
  padding: 40px;
  text-align: center;
  color: var(--fg-4);
  font-size: 13px;
}
.arb-audit__error {
  color: var(--action-notify);
  font-size: 13px;
  padding: 12px;
}
.arb-audit__timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  overflow: hidden;
}
.arb-audit__event {
  display: flex;
  gap: 14px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  transition: background var(--dur-fast);
}
.arb-audit__event:last-child { border-bottom: none; }
.arb-audit__event:hover { background: var(--bg-1); }
.arb-audit__event-icon {
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 1px;
}
.arb-audit__event-body { flex: 1; min-width: 0; }
.arb-audit__event-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 5px;
}
.arb-audit__event-text { font-size: 13px; color: var(--fg-1); }
.arb-audit__event-target {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-3);
  flex-shrink: 0;
}
.arb-audit__event-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.arb-audit__event-actor { font-size: 11px; color: var(--fg-3); font-weight: 500; }
.arb-audit__event-kind {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-4);
}
.arb-audit__event-delta {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--hl-lime);
}
.arb-audit__event-ts {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-4);
  margin-left: auto;
}
.arb-audit__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.arb-audit__page {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg-3);
}
</style>
