<script setup lang="ts">
import type { DecisionData, DecisionRecord } from '~/types/api'

definePageMeta({ middleware: 'auth' })

const api = useApi()

const logSnippet = ref('')
const failCount = ref<number | undefined>(undefined)
const result = ref<DecisionData | null>(null)
const analyzing = ref(false)
const error = ref<string | null>(null)
const recentDecisions = ref<DecisionRecord[]>([])
const loadingRecent = ref(false)

async function analyze() {
  if (!logSnippet.value.trim()) return
  analyzing.value = true
  error.value = null
  result.value = null
  try {
    const res = await api.analyze({
      log_snippet: logSnippet.value,
      fail_count_24h: failCount.value,
    })
    if (res.status === 'success') {
      result.value = res.data
      await fetchRecent()
    } else {
      error.value = res.message
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Analysis failed'
  } finally {
    analyzing.value = false
  }
}

async function fetchRecent() {
  loadingRecent.value = true
  try {
    const res = await api.getDecisions({ limit: 5 })
    if (res.status === 'success') recentDecisions.value = res.data.decisions
  } catch { /* silent */ } finally {
    loadingRecent.value = false
  }
}

onMounted(fetchRecent)
</script>

<template>
  <AppTopBar title="Analyze" subtitle="Submit a CI/CD log for AI triage" />

  <div class="arb-analyze">
    <div class="arb-analyze__left">
      <!-- Log input -->
      <UiCard class="arb-analyze__input-card">
        <UiEyebrow>Log snippet</UiEyebrow>
        <UiTextarea
          v-model="logSnippet"
          :mono="true"
          placeholder="Paste build log, error output, or system event here…"
          style="min-height: 220px; margin-top: 10px"
        />
        <div class="arb-analyze__input-row">
          <UiField label="Failures in last 24h" style="width: 160px">
            <UiInput
              v-model.number="failCount"
              type="number"
              placeholder="e.g. 3"
              :mono="true"
            />
          </UiField>
          <UiButton
            variant="primary"
            :loading="analyzing"
            :disabled="!logSnippet.trim()"
            @click="analyze"
          >
            Analyze
          </UiButton>
        </div>
      </UiCard>

      <!-- Error -->
      <div v-if="error" class="arb-analyze__error">
        {{ error }}
      </div>

      <!-- Result card -->
      <UiCard v-if="result" class="arb-analyze__result">
        <div class="arb-analyze__result-header">
          <ActionBadge :action="result.primary_action" size="lg" />
          <div class="arb-analyze__result-meta">
            <ProviderChip :provider="result.provider" />
            <UiChip v-if="result.duration_ms">{{ result.duration_ms }}ms</UiChip>
          </div>
        </div>

        <ConfidenceMeter :value="result.confidence" :animate="true" :large="true" />

        <div class="arb-analyze__result-section">
          <UiEyebrow>Reason</UiEyebrow>
          <p class="arb-analyze__result-text">{{ result.reason }}</p>
        </div>

        <div v-if="result.thinking" class="arb-analyze__result-section">
          <UiEyebrow>Thinking</UiEyebrow>
          <pre class="arb-analyze__thinking">{{ result.thinking }}</pre>
        </div>

        <div class="arb-analyze__result-footer">
          <SourceBadge :source="result.source" />
          <span class="arb-analyze__result-id num">#{{ result.decision_id }}</span>
        </div>
      </UiCard>
    </div>

    <!-- Right rail -->
    <div class="arb-analyze__right">
      <div class="arb-analyze__rail-section">
        <UiEyebrow style="margin-bottom: 10px">Recent decisions</UiEyebrow>
        <div v-if="loadingRecent" class="arb-analyze__loading">
          <UiSpinner size="sm" />
        </div>
        <div v-else-if="recentDecisions.length === 0" class="arb-analyze__empty">
          No decisions yet.
        </div>
        <div v-else class="arb-analyze__recent-list">
          <UiCard
            v-for="d in recentDecisions"
            :key="d.id"
            class="arb-analyze__recent-item"
          >
            <div class="arb-analyze__recent-row">
              <ActionBadge :action="d.primary_action" size="sm" />
              <SmallMeter :value="d.confidence" />
            </div>
            <p class="arb-analyze__recent-snippet">{{ d.log_snippet }}</p>
            <div class="arb-analyze__recent-footer">
              <SourceBadge :source="d.source" />
              <span class="arb-analyze__recent-time num">{{ new Date(d.created_at).toLocaleTimeString() }}</span>
            </div>
          </UiCard>
        </div>
      </div>

      <div class="arb-analyze__rail-section">
        <UiEyebrow style="margin-bottom: 10px">Action routing</UiEyebrow>
        <div class="arb-analyze__routing-list">
          <div class="arb-analyze__routing-row">
            <ActionBadge action="trigger_rebuild" size="sm" />
            <span class="arb-analyze__routing-label">≥ 80% confidence</span>
          </div>
          <div class="arb-analyze__routing-row">
            <ActionBadge action="trigger_fallback" size="sm" />
            <span class="arb-analyze__routing-label">50–79% + notify</span>
          </div>
          <div class="arb-analyze__routing-row">
            <ActionBadge action="notify_human" size="sm" />
            <span class="arb-analyze__routing-label">&lt; 50% — human review</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.arb-analyze {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 24px;
  padding: 28px 32px;
  flex: 1;
  align-items: start;
}
.arb-analyze__left {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.arb-analyze__input-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.arb-analyze__input-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
}
.arb-analyze__error {
  padding: 12px 14px;
  border-radius: var(--r-sm);
  background: var(--bg-tint-danger);
  border: 1px solid rgba(248, 113, 113, 0.2);
  font-size: 13px;
  color: var(--action-notify);
}
.arb-analyze__result {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.arb-analyze__result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.arb-analyze__result-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.arb-analyze__result-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.arb-analyze__result-text {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--fg-1);
  margin: 0;
}
.arb-analyze__thinking {
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--fg-3);
  background: var(--bg-inset);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: 12px;
  white-space: pre-wrap;
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
}
.arb-analyze__result-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.arb-analyze__result-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-4);
}
.arb-analyze__right {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.arb-analyze__rail-section {
  display: flex;
  flex-direction: column;
}
.arb-analyze__loading {
  display: flex;
  justify-content: center;
  padding: 24px;
}
.arb-analyze__empty {
  font-size: 12px;
  color: var(--fg-4);
  padding: 12px 0;
}
.arb-analyze__recent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.arb-analyze__recent-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.arb-analyze__recent-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.arb-analyze__recent-snippet {
  font-size: 11.5px;
  color: var(--fg-3);
  margin: 0;
  white-space: pre-wrap;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  font-family: var(--font-mono);
}
.arb-analyze__recent-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.arb-analyze__recent-time {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-4);
}
.arb-analyze__routing-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.arb-analyze__routing-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.arb-analyze__routing-label {
  font-size: 11.5px;
  color: var(--fg-3);
}
</style>
