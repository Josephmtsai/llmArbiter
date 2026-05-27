<script setup lang="ts">
import type { Rule, ProviderResponse, PromptVersion } from '~/types/api'

definePageMeta({ middleware: 'auth' })

const api = useApi()

type Tab = 'rules' | 'providers' | 'prompts'
const activeTab = ref<Tab>('rules')

// --- Rules ---
const rules = ref<Rule[]>([])
const loadingRules = ref(true)
const savingRule = ref<string | null>(null)

async function loadRules() {
  loadingRules.value = true
  try {
    const res = await api.getRules()
    if (res.status === 'success') rules.value = res.data
  } catch { /* silent */ } finally {
    loadingRules.value = false
  }
}

async function saveRule(rule: Rule) {
  savingRule.value = rule.name
  try {
    await api.updateRule(rule.name, rule.value)
  } catch { /* silent */ } finally {
    savingRule.value = null
  }
}

// --- Providers ---
const providerInfo = ref<ProviderResponse | null>(null)
const loadingProviders = ref(true)
const settingProvider = ref(false)
const sharedActiveProvider = useState<string | null>('sidebar:activeProvider', () => null)

async function loadProviders() {
  loadingProviders.value = true
  try {
    const res = await api.getProviders()
    providerInfo.value = res
    sharedActiveProvider.value = res.active_provider ?? null
  } catch { /* silent */ } finally {
    loadingProviders.value = false
  }
}

async function selectProvider(p: string) {
  if (!providerInfo.value || providerInfo.value.active_provider === p) return
  settingProvider.value = true
  try {
    const res = await api.setProvider(p)
    providerInfo.value = res
    sharedActiveProvider.value = res.active_provider ?? null
  } catch { /* silent */ } finally {
    settingProvider.value = false
  }
}

// --- Prompts ---
const prompts = ref<PromptVersion[]>([])
const loadingPrompts = ref(true)
const selectedPromptId = ref<number | 'new' | null>(null)
const promptForm = reactive({ label: '', content: '' })
const savingPrompt = ref(false)
const activatingPrompt = ref<number | null>(null)

const selectedPrompt = computed(() =>
  prompts.value.find(p => p.id === selectedPromptId.value) ?? null
)

async function loadPrompts() {
  loadingPrompts.value = true
  try {
    const res = await api.getPrompts()
    if (res.status === 'success') {
      prompts.value = res.data
      const active = res.data.find(p => p.active)
      selectedPromptId.value = active?.id ?? res.data[0]?.id ?? null
    }
  } catch { /* silent */ } finally {
    loadingPrompts.value = false
  }
}

async function savePrompt() {
  savingPrompt.value = true
  try {
    const res = await api.createPrompt(promptForm.label, promptForm.content)
    if (res.status === 'success') {
      prompts.value.unshift(res.data)
      selectedPromptId.value = res.data.id
      promptForm.label = ''
      promptForm.content = ''
    }
  } catch { /* silent */ } finally {
    savingPrompt.value = false
  }
}

async function activatePrompt(id: number) {
  activatingPrompt.value = id
  try {
    const res = await api.activatePrompt(id)
    if (res.status === 'success') {
      prompts.value = prompts.value.map(p => ({ ...p, active: p.id === id }))
    }
  } catch { /* silent */ } finally {
    activatingPrompt.value = null
  }
}

watch(activeTab, (tab) => {
  if (tab === 'rules' && rules.value.length === 0) loadRules()
  if (tab === 'providers' && !providerInfo.value) loadProviders()
  if (tab === 'prompts' && prompts.value.length === 0) loadPrompts()
}, { immediate: true })
</script>

<template>
  <AppTopBar title="Settings" subtitle="Manage rules, providers, and prompt versions" />

  <div class="arb-settings">
    <!-- Tabs -->
    <div class="arb-settings__tabs">
      <button
        v-for="tab in (['rules', 'providers', 'prompts'] as Tab[])"
        :key="tab"
        class="arb-settings__tab"
        :class="{ 'arb-settings__tab--active': activeTab === tab }"
        @click="activeTab = tab"
      >
        {{ tab.charAt(0).toUpperCase() + tab.slice(1) }}
      </button>
    </div>

    <!-- Rules tab -->
    <div v-if="activeTab === 'rules'">
      <div v-if="loadingRules" class="arb-settings__loading"><UiSpinner size="sm" /></div>
      <div v-else-if="rules.length === 0" class="arb-settings__empty">No rules configured.</div>
      <div v-else class="arb-settings__rules-list">
        <UiCard
          v-for="rule in rules"
          :key="rule.name"
          class="arb-settings__rule"
        >
          <div class="arb-settings__rule-header">
            <span class="arb-settings__rule-name num">{{ rule.name }}</span>
            <span v-if="savingRule === rule.name" class="arb-settings__rule-saving">saving…</span>
          </div>
          <p v-if="rule.description" class="arb-settings__rule-desc">{{ rule.description }}</p>
          <div v-if="typeof rule.value === 'boolean'" class="arb-settings__rule-toggle">
            <label class="arb-settings__toggle">
              <input
                type="checkbox"
                :checked="rule.value"
                class="arb-settings__toggle-input"
                @change="rule.value = ($event.target as HTMLInputElement).checked; saveRule(rule)"
              />
              <span class="arb-settings__toggle-track">
                <span class="arb-settings__toggle-thumb" />
              </span>
              <span class="arb-settings__toggle-label">{{ rule.value ? 'Enabled' : 'Disabled' }}</span>
            </label>
          </div>
          <div v-else-if="typeof rule.value === 'number'" class="arb-settings__rule-num-row">
            <UiInput
              v-model.number="rule.value"
              type="number"
              :mono="true"
              class="arb-settings__rule-input--number"
              @change="saveRule(rule)"
            />
          </div>
          <div v-else class="arb-settings__rule-num-row">
            <UiInput
              v-model="rule.value"
              :mono="true"
              class="arb-settings__rule-input--text"
              @change="saveRule(rule)"
            />
          </div>
        </UiCard>
      </div>
    </div>

    <!-- Providers tab -->
    <div v-if="activeTab === 'providers'">
      <div v-if="loadingProviders" class="arb-settings__loading"><UiSpinner size="sm" /></div>
      <div v-else-if="!providerInfo" class="arb-settings__empty">Could not load providers.</div>
      <div v-else class="arb-settings__providers-list">
        <UiCard
          v-for="p in providerInfo.available_providers"
          :key="p"
          class="arb-settings__provider"
          :class="{ 'arb-settings__provider--active': providerInfo.active_provider === p }"
          :clickable="true"
          @click="selectProvider(p)"
        >
          <div class="arb-settings__provider-row">
            <span class="arb-settings__provider-name num">{{ p }}</span>
            <span v-if="providerInfo.active_provider === p" class="arb-settings__provider-active-badge">Active</span>
            <UiSpinner v-else-if="settingProvider" size="sm" />
          </div>
        </UiCard>
      </div>
    </div>

    <!-- Prompts tab -->
    <div v-if="activeTab === 'prompts'" class="arb-settings__prompts">
      <div v-if="loadingPrompts" class="arb-settings__loading"><UiSpinner size="sm" /></div>
      <template v-else>
        <!-- Version tab bar -->
        <div class="arb-settings__pv-bar">
          <button
            v-for="p in prompts"
            :key="p.id"
            class="arb-settings__pv-tab"
            :class="{ 'arb-settings__pv-tab--active': selectedPromptId === p.id }"
            @click="selectedPromptId = p.id"
          >
            <span class="arb-settings__pv-tab-label">{{ p.label }}</span>
            <span v-if="p.active" class="arb-settings__pv-tab-dot" />
          </button>
          <button
            class="arb-settings__pv-tab arb-settings__pv-tab--new"
            :class="{ 'arb-settings__pv-tab--active': selectedPromptId === 'new' }"
            @click="selectedPromptId = 'new'"
          >
            + New
          </button>
        </div>

        <!-- New version form -->
        <UiCard v-if="selectedPromptId === 'new'" class="arb-settings__prompt-form">
          <UiEyebrow>New prompt version</UiEyebrow>
          <UiField label="Label">
            <UiInput v-model="promptForm.label" placeholder="e.g. v3-extended-reasoning" />
          </UiField>
          <UiField label="Prompt content">
            <UiTextarea
              v-model="promptForm.content"
              :mono="true"
              placeholder="Enter system prompt content…"
              class="arb-settings__prompt-content"
            />
          </UiField>
          <div class="arb-settings__prompt-form-actions">
            <UiButton variant="ghost" size="sm" @click="selectedPromptId = prompts[0]?.id ?? null">
              Cancel
            </UiButton>
            <UiButton variant="primary" size="sm" :loading="savingPrompt" @click="savePrompt">
              Save version
            </UiButton>
          </div>
        </UiCard>

        <!-- Selected version panel -->
        <UiCard v-else-if="selectedPrompt" class="arb-settings__prompt-panel">
          <div class="arb-settings__prompt-panel-header">
            <div class="arb-settings__prompt-panel-meta">
              <span class="arb-settings__prompt-panel-label">{{ selectedPrompt.label }}</span>
              <span v-if="selectedPrompt.active" class="arb-settings__prompt-active-badge">Active</span>
              <span v-if="selectedPrompt.eval_score != null" class="arb-settings__prompt-score num">
                {{ Math.round(selectedPrompt.eval_score * 100) }}% eval
              </span>
            </div>
            <div class="arb-settings__prompt-panel-actions">
              <UiButton
                v-if="!selectedPrompt.active"
                variant="primary"
                size="sm"
                :loading="activatingPrompt === selectedPrompt.id"
                @click="activatePrompt(selectedPrompt.id)"
              >
                Activate
              </UiButton>
            </div>
          </div>
          <pre class="arb-settings__prompt-full">{{ selectedPrompt.content }}</pre>
          <span class="arb-settings__prompt-ts num">{{ new Date(selectedPrompt.created).toLocaleString() }}</span>
        </UiCard>

        <div v-else class="arb-settings__empty">No prompt versions. Click "+ New" to create one.</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.arb-settings {
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
}
.arb-settings__tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 0;
}
.arb-settings__tab {
  padding: 8px 16px;
  font-size: 13.5px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--fg-3);
  cursor: pointer;
  transition: all var(--dur-fast);
  margin-bottom: -1px;
  font-weight: 400;
}
.arb-settings__tab:hover { color: var(--fg-1); }
.arb-settings__tab--active {
  color: var(--fg-0);
  border-bottom-color: var(--accent);
  font-weight: 500;
}
.arb-settings__loading, .arb-settings__empty {
  padding: 32px;
  text-align: center;
  color: var(--fg-4);
  font-size: 13px;
}
.arb-settings__rules-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 560px;
}
.arb-settings__rule { display: flex; flex-direction: column; gap: 8px; }
.arb-settings__rule-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.arb-settings__rule-name {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-0);
}
.arb-settings__rule-saving {
  font-size: 11px;
  color: var(--fg-4);
  font-family: var(--font-mono);
}
.arb-settings__rule-desc { font-size: 12px; color: var(--fg-3); margin: 0; }
.arb-settings__toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.arb-settings__toggle-input { display: none; }
.arb-settings__toggle-track {
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: var(--bg-3);
  border: 1px solid var(--border);
  position: relative;
  transition: background var(--dur-fast);
}
.arb-settings__toggle-input:checked + .arb-settings__toggle-track {
  background: var(--accent);
  border-color: var(--accent);
}
.arb-settings__toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: var(--fg-3);
  transition: transform var(--dur-fast);
}
.arb-settings__toggle-input:checked ~ .arb-settings__toggle-track .arb-settings__toggle-thumb {
  transform: translateX(16px);
  background: #fff;
}
.arb-settings__toggle-label { font-size: 12px; color: var(--fg-2); }
.arb-settings__rule-num-row { display: flex; }
.arb-settings__rule-input--number { width: 120px; }
.arb-settings__rule-input--text { width: 180px; }
.arb-settings__providers-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 400px;
}
.arb-settings__provider {
  cursor: pointer;
  transition: all var(--dur-fast);
}
.arb-settings__provider--active {
  border-color: var(--accent) !important;
  background: var(--accent-soft) !important;
}
.arb-settings__provider-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.arb-settings__provider-name {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--fg-0);
}
.arb-settings__provider-active-badge {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--accent);
  background: var(--accent-soft);
  padding: 2px 8px;
  border-radius: var(--r-pill);
  border: 1px solid var(--accent-ring);
}
.arb-settings__prompts { display: flex; flex-direction: column; gap: 16px; }

/* Version tab bar */
.arb-settings__pv-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 0;
}
.arb-settings__pv-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--fg-3);
  font-size: 13px;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: color var(--dur-fast);
  margin-bottom: -1px;
  white-space: nowrap;
}
.arb-settings__pv-tab:hover { color: var(--fg-1); }
.arb-settings__pv-tab--active {
  color: var(--fg-0);
  border-bottom-color: var(--accent);
  font-weight: 500;
}
.arb-settings__pv-tab--new {
  font-family: var(--font-sans, inherit);
  font-size: 12px;
  color: var(--fg-4);
  margin-left: 4px;
}
.arb-settings__pv-tab--new:hover { color: var(--accent); }
.arb-settings__pv-tab--new.arb-settings__pv-tab--active { color: var(--accent); border-bottom-color: var(--accent); }
.arb-settings__pv-tab-label { flex: 1; }
.arb-settings__pv-tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--conf-high);
  flex-shrink: 0;
}

/* New version form */
.arb-settings__prompt-form { display: flex; flex-direction: column; gap: 14px; }
.arb-settings__prompt-content { min-height: 240px; }
.arb-settings__prompt-form-actions { display: flex; justify-content: flex-end; gap: 8px; }

/* Version content panel */
.arb-settings__prompt-panel { display: flex; flex-direction: column; gap: 14px; }
.arb-settings__prompt-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.arb-settings__prompt-panel-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.arb-settings__prompt-panel-label { font-size: 14px; font-weight: 600; color: var(--fg-0); }
.arb-settings__prompt-panel-actions { display: flex; align-items: center; gap: 6px; }
.arb-settings__prompt-active-badge {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--conf-high);
  background: rgba(52, 211, 153, 0.12);
  padding: 2px 8px;
  border-radius: var(--r-pill);
}
.arb-settings__prompt-score {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-4);
}
.arb-settings__prompt-full {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.65;
  color: var(--fg-2);
  background: var(--bg-inset);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: 14px 16px;
  white-space: pre-wrap;
  margin: 0;
  overflow-y: auto;
  max-height: 60vh;
}
.arb-settings__prompt-ts {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-4);
}
</style>
