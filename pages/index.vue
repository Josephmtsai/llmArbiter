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

const activeProvider = useState<string | null>('sidebar:activeProvider', () => null)
const activeModel = useState<string | null>('sidebar:activeModel', () => null)

const QUICK_MODELS = [
  { label: 'DeepSeek Flash', value: 'deepseek-flash' },
  { label: 'Qwen Plus', value: 'qwen-plus' },
  { label: 'HY3', value: 'hy3' },
] as const

const selectedQuickModel = ref<string | null>(null)
const customModel = ref('')

const effectiveModel = computed(() => customModel.value.trim() || selectedQuickModel.value || '')

function pickQuickModel(val: string) {
  const isDeselect = selectedQuickModel.value === val
  selectedQuickModel.value = isDeselect ? null : val
  if (!isDeselect) customModel.value = ''
}

function onCustomModelInput() {
  selectedQuickModel.value = null
}

watch(effectiveModel, (val) => {
  activeModel.value = val || null
})

watch(activeProvider, (val) => {
  if (val !== 'openrouter') {
    selectedQuickModel.value = null
    customModel.value = ''
  }
})

async function analyze() {
  if (!logSnippet.value.trim()) return
  analyzing.value = true
  error.value = null
  result.value = null
  try {
    const res = await api.analyze({
      log_snippet: logSnippet.value,
      fail_count_24h: failCount.value,
      ...(effectiveModel.value ? { model: effectiveModel.value } : {}),
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
        <!-- OpenRouter model selector -->
        <div v-if="activeProvider === 'openrouter'" class="arb-analyze__model-section">
          <UiEyebrow>Model</UiEyebrow>
          <div class="arb-analyze__model-picker">
            <button
              v-for="m in QUICK_MODELS"
              :key="m.value"
              class="arb-analyze__model-btn"
              :class="{ 'arb-analyze__model-btn--active': selectedQuickModel === m.value }"
              @click="pickQuickModel(m.value)"
            >
              {{ m.label }}
            </button>
          </div>
          <input
            v-model="customModel"
            class="arb-analyze__model-input"
            placeholder="Or enter any OpenRouter model ID…"
            @input="onCustomModelInput"
          />
        </div>

        <div class="arb-analyze__input-row">
          <UiField label="Failures in last 24h" style="width: 160px">
            <UiInput
              v-model.number="failCount"
              type="number"
              placeholder="e.g. 3"
              :mono="true"
            />
          </UiField>
          <div class="arb-analyze__run-col">
            <span v-if="activeProvider === 'openrouter'" class="arb-analyze__model-chip num">
              openrouter · {{ effectiveModel || 'default' }}
            </span>
            <UiButton
              variant="primary"
              :loading="analyzing"
              :disabled="!logSnippet.trim()"
              @click="analyze"
            >
              Analyze
            </UiButton>
          </div>
        </div>
      </UiCard>

      <!-- Error -->
      <div v-if="error" class="arb-analyze__error">
        {{ error }}
      </div>

      <!-- Result card -->
      <UiCard v-if="result" class="arb-analyze__result">
        <div class="arb-analyze__result-header">
          <UiActionBadge :action="result.primary_action" size="lg" />
          <div class="arb-analyze__result-meta">
            <UiProviderChip :provider="result.provider" />
            <span v-if="result.model" class="arb-analyze__model-chip num">{{ result.model }}</span>
            <UiChip v-if="result.duration_ms">{{ result.duration_ms }}ms</UiChip>
          </div>
        </div>

        <UiConfidenceMeter :value="result.confidence" :animate="true" :large="true" />

        <div class="arb-analyze__result-section">
          <UiEyebrow>Reason</UiEyebrow>
          <p class="arb-analyze__result-text">{{ result.reason }}</p>
        </div>

        <div v-if="result.thinking" class="arb-analyze__result-section">
          <UiEyebrow>Thinking</UiEyebrow>
          <pre class="arb-analyze__thinking">{{ result.thinking }}</pre>
        </div>

        <div class="arb-analyze__result-footer">
          <UiSourceBadge :source="result.source" />
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
              <UiActionBadge :action="d.primary_action" size="sm" />
              <UiSmallMeter :value="d.confidence" />
            </div>
            <p class="arb-analyze__recent-snippet">{{ d.log_snippet }}</p>
            <div class="arb-analyze__recent-footer">
              <UiSourceBadge :source="d.source" />
              <span class="arb-analyze__recent-time num">{{ new Date(d.created_at).toLocaleTimeString() }}</span>
            </div>
          </UiCard>
        </div>
      </div>

      <div class="arb-analyze__rail-section">
        <div class="arb-analyze__routing-header">
          <UiEyebrow>Confidence routing</UiEyebrow>
          <NuxtLink to="/guide" class="arb-analyze__routing-guide-link">How it works →</NuxtLink>
        </div>
        <p class="arb-analyze__routing-note">Confidence does NOT pick the action — it controls how the chosen action is executed.</p>
        <div class="arb-analyze__routing-list">
          <div class="arb-analyze__routing-row arb-analyze__routing-row--high">
            <span class="arb-analyze__routing-badge num">≥ 80%</span>
            <span class="arb-analyze__routing-label">Auto-execute primary — no side action</span>
          </div>
          <div class="arb-analyze__routing-row arb-analyze__routing-row--mid">
            <span class="arb-analyze__routing-badge num">50–79%</span>
            <span class="arb-analyze__routing-label">Execute primary + force notify_human</span>
          </div>
          <div class="arb-analyze__routing-row arb-analyze__routing-row--low">
            <span class="arb-analyze__routing-badge num">&lt; 50%</span>
            <span class="arb-analyze__routing-label">Override: force notify_human</span>
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
  padding: var(--page-pad);
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
.arb-analyze__model-chip {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-4);
  background: var(--bg-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: 1px 6px;
}
.arb-analyze__model-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid var(--border-subtle);
}
.arb-analyze__model-picker {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.arb-analyze__model-btn {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 4px 12px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg-3);
  cursor: pointer;
  transition: all var(--dur-fast);
}
.arb-analyze__model-btn:hover {
  border-color: var(--fg-3);
  color: var(--fg-1);
}
.arb-analyze__model-btn--active {
  border-color: var(--action-rebuild);
  color: var(--action-rebuild);
  background: var(--action-rebuild-soft);
}
.arb-analyze__model-input {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 6px 10px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border);
  background: var(--bg-0);
  color: var(--fg-1);
  width: 100%;
  outline: none;
  transition: border-color var(--dur-fast);
}
.arb-analyze__model-input:focus { border-color: var(--fg-3); }
.arb-analyze__model-input::placeholder { color: var(--fg-4); }
.arb-analyze__run-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
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
.arb-analyze__routing-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.arb-analyze__routing-guide-link {
  font-size: 11px;
  color: var(--accent);
  text-decoration: none;
  font-family: var(--font-mono);
}
.arb-analyze__routing-guide-link:hover { text-decoration: underline; }
.arb-analyze__routing-note {
  font-size: 11px;
  color: var(--fg-4);
  margin: 0 0 10px;
  line-height: 1.5;
}
.arb-analyze__routing-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.arb-analyze__routing-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border-subtle);
}
.arb-analyze__routing-row--high { background: rgba(52, 211, 153, 0.05); }
.arb-analyze__routing-row--mid  { background: rgba(251, 191, 36, 0.05); }
.arb-analyze__routing-row--low  { background: rgba(248, 113, 113, 0.05); }
.arb-analyze__routing-badge {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  min-width: 44px;
  flex-shrink: 0;
}
.arb-analyze__routing-row--high .arb-analyze__routing-badge { color: var(--conf-high); }
.arb-analyze__routing-row--mid  .arb-analyze__routing-badge { color: var(--conf-mid); }
.arb-analyze__routing-row--low  .arb-analyze__routing-badge { color: var(--conf-low); }
.arb-analyze__routing-label {
  font-size: 11px;
  color: var(--fg-2);
  line-height: 1.4;
}

/* ── Mobile breakpoints ──────────────────────────────── */
@media (max-width: 768px) {
  /* 1.1 Stack two columns → single column */
  .arb-analyze {
    grid-template-columns: 1fr;
  }

  /* 1.2 Input row: button on top, field below, both full-width */
  .arb-analyze__input-row {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  /* 1.3 Run column: stretch children (button) to full width */
  .arb-analyze__run-col {
    align-items: stretch;
  }

  /* 1.4 Result header: stack ActionBadge + meta vertically */
  .arb-analyze__result-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  /* 1.5 Right rail flows full-width automatically in single-column grid */
  .arb-analyze__right {
    width: 100%;
  }
}
</style>
