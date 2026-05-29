<script setup lang="ts">
import type { TestCase, PrimaryAction } from '~/types/api'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const cases = ref<TestCase[]>([])
const casesTotal = ref(0)
const loading = ref(true)
const error = ref<string | null>(null)
const showForm = ref(false)
const expandedSnippets = ref<Set<number>>(new Set())
const collapsedGroups = ref<Set<PrimaryAction>>(new Set())

const form = reactive<Omit<TestCase, 'id'>>({
  description: '',
  log_snippet: '',
  expected_action: 'trigger_rebuild',
  hardware_info: undefined,
})
const saving = ref(false)
const formError = ref<string | null>(null)

const PRIMARY_ACTIONS: PrimaryAction[] = [
  'trigger_rebuild',
  'trigger_fallback',
  'trigger_restart',
  'notify_human',
  'send_email',
]

const ACTION_CSS_VAR: Record<PrimaryAction, string> = {
  trigger_rebuild: 'var(--action-rebuild)',
  trigger_fallback: 'var(--action-fallback)',
  trigger_restart: 'var(--action-restart)',
  notify_human: 'var(--action-notify)',
  send_email: 'var(--action-email)',
}

const ACTION_SOFT_VAR: Record<PrimaryAction, string> = {
  trigger_rebuild: 'var(--action-rebuild-soft)',
  trigger_fallback: 'var(--action-fallback-soft)',
  trigger_restart: 'var(--action-restart-soft)',
  notify_human: 'var(--action-notify-soft)',
  send_email: 'var(--action-email-soft)',
}

const groupedCases = computed(() =>
  PRIMARY_ACTIONS
    .map(action => ({ action, items: cases.value.filter(c => c.expected_action === action) }))
    .filter(g => g.items.length > 0),
)

const summaryByAction = computed(() =>
  Object.fromEntries(
    PRIMARY_ACTIONS.map(a => [a, cases.value.filter(c => c.expected_action === a).length]),
  ) as Record<PrimaryAction, number>,
)

function toggleSnippet(id: number) {
  if (expandedSnippets.value.has(id)) expandedSnippets.value.delete(id)
  else expandedSnippets.value.add(id)
}

function toggleGroup(action: PrimaryAction) {
  if (collapsedGroups.value.has(action)) collapsedGroups.value.delete(action)
  else collapsedGroups.value.add(action)
}

async function load() {
  loading.value = true
  try {
    const res = await api.getCases()
    if (res.status === 'success') {
      cases.value = res.data.items
      casesTotal.value = res.data.total
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Load failed'
  } finally {
    loading.value = false
  }
}

async function createCase() {
  saving.value = true
  formError.value = null
  try {
    const res = await api.createCase(form)
    if (res.status === 'success') {
      cases.value.unshift(res.data)
      showForm.value = false
      form.description = ''
      form.log_snippet = ''
      form.expected_action = 'trigger_rebuild'
    } else {
      formError.value = res.message
    }
  } catch (e) {
    formError.value = e instanceof Error ? e.message : 'Save failed'
  } finally {
    saving.value = false
  }
}

async function deleteCase(id: number) {
  await api.deleteCase(id).catch(() => null)
  cases.value = cases.value.filter(c => c.id !== id)
}

onMounted(load)
</script>

<template>
  <AppTopBar title="Test cases" :subtitle="`${casesTotal} cases`">
    <template #actions>
      <UiButton variant="primary" size="sm" @click="showForm = !showForm">
        {{ showForm ? 'Cancel' : 'New case' }}
      </UiButton>
    </template>
  </AppTopBar>

  <div class="arb-cases">
    <!-- New case form -->
    <UiCard v-if="showForm" class="arb-cases__form">
      <UiEyebrow>New test case</UiEyebrow>
      <div v-if="formError" class="arb-cases__form-error">{{ formError }}</div>
      <div class="arb-cases__form-grid">
        <UiField label="Description">
          <UiInput v-model="form.description" placeholder="Short description of this scenario" />
        </UiField>
        <UiField label="Expected action">
          <UiSelect v-model="form.expected_action">
            <option v-for="a in PRIMARY_ACTIONS" :key="a" :value="a">{{ a }}</option>
          </UiSelect>
        </UiField>
      </div>
      <UiField label="Log snippet">
        <UiTextarea
          v-model="form.log_snippet"
          :mono="true"
          placeholder="Paste the log content that should produce the expected action…"
          style="min-height: 120px"
        />
      </UiField>
      <div class="arb-cases__form-actions">
        <UiButton variant="primary" size="sm" :loading="saving" @click="createCase">
          Save case
        </UiButton>
      </div>
    </UiCard>

    <!-- Loading / error / empty -->
    <div v-if="loading" class="arb-cases__loading"><UiSpinner size="sm" /></div>
    <div v-else-if="error" class="arb-cases__error">{{ error }}</div>
    <div v-else-if="cases.length === 0" class="arb-cases__empty">
      No test cases yet. Create one to start building your evaluation suite.
    </div>

    <!-- Summary bar -->
    <div v-else class="arb-cases__summary">
      <div
        v-for="action in PRIMARY_ACTIONS"
        :key="action"
        class="arb-cases__summary-chip"
        :style="{
          color: summaryByAction[action] ? ACTION_CSS_VAR[action] : 'var(--fg-4)',
          background: summaryByAction[action] ? ACTION_SOFT_VAR[action] : 'var(--bg-2)',
          borderColor: summaryByAction[action] ? ACTION_CSS_VAR[action] : 'var(--border)',
          opacity: summaryByAction[action] ? 1 : 0.45,
        }"
      >
        <span class="arb-cases__summary-count">{{ summaryByAction[action] }}</span>
        {{ action }}
      </div>
    </div>

    <!-- Grouped sections -->
    <div v-if="!loading && !error && cases.length > 0" class="arb-cases__groups">
      <div
        v-for="group in groupedCases"
        :key="group.action"
        class="arb-cases__group"
        :style="{ '--group-color': ACTION_CSS_VAR[group.action], '--group-soft': ACTION_SOFT_VAR[group.action] }"
      >
        <!-- Group header -->
        <button class="arb-cases__group-header" @click="toggleGroup(group.action)">
          <span class="arb-cases__group-accent" />
          <UiActionBadge :action="group.action" size="sm" />
          <span class="arb-cases__group-count">{{ group.items.length }} case{{ group.items.length !== 1 ? 's' : '' }}</span>
          <span class="arb-cases__group-chevron" :class="{ 'arb-cases__group-chevron--open': !collapsedGroups.has(group.action) }">
            ›
          </span>
        </button>

        <!-- Cases rows -->
        <div v-if="!collapsedGroups.has(group.action)" class="arb-cases__rows">
          <div v-for="tc in group.items" :key="tc.id" class="arb-cases__row">
            <div class="arb-cases__row-main">
              <span class="arb-cases__row-id num">#{{ tc.id }}</span>
              <span class="arb-cases__row-desc">{{ tc.description }}</span>
              <div class="arb-cases__row-actions">
                <button
                  class="arb-cases__log-btn"
                  :class="{ 'arb-cases__log-btn--active': expandedSnippets.has(tc.id) }"
                  @click="toggleSnippet(tc.id)"
                >
                  {{ expandedSnippets.has(tc.id) ? 'hide log' : 'show log' }}
                </button>
                <button class="arb-cases__delete-btn" title="Delete" @click="deleteCase(tc.id)">✕</button>
              </div>
            </div>
            <pre v-if="expandedSnippets.has(tc.id)" class="arb-cases__snippet">{{ tc.log_snippet }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.arb-cases {
  padding: var(--page-pad);
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
}

/* Form */
.arb-cases__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.arb-cases__form-error {
  padding: 10px 12px;
  border-radius: var(--r-sm);
  background: var(--bg-tint-danger);
  border: 1px solid rgba(248, 113, 113, 0.2);
  font-size: 13px;
  color: var(--action-notify);
}
.arb-cases__form-grid {
  display: grid;
  grid-template-columns: 1fr 200px;
  gap: 12px;
}
.arb-cases__form-actions {
  display: flex;
  justify-content: flex-end;
}

/* Misc states */
.arb-cases__loading { padding: 40px; text-align: center; }
.arb-cases__empty {
  padding: 40px;
  text-align: center;
  color: var(--fg-4);
  font-size: 13px;
}
.arb-cases__error {
  padding: 12px;
  color: var(--action-notify);
  font-size: 13px;
}

/* Summary bar */
.arb-cases__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.arb-cases__summary-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  transition: opacity var(--dur-fast);
  white-space: nowrap;
}
.arb-cases__summary-count {
  font-weight: 700;
  font-size: 13px;
}

/* Groups */
.arb-cases__groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.arb-cases__group {
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  overflow: hidden;
}

/* Group header */
.arb-cases__group-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--bg-1);
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background var(--dur-fast);
}
.arb-cases__group-header:hover {
  background: var(--bg-2);
}
.arb-cases__group-accent {
  width: 3px;
  height: 18px;
  border-radius: 999px;
  background: var(--group-color);
  flex-shrink: 0;
}
.arb-cases__group-count {
  font-size: 12px;
  color: var(--fg-4);
  margin-left: 2px;
}
.arb-cases__group-chevron {
  margin-left: auto;
  font-size: 18px;
  color: var(--fg-4);
  line-height: 1;
  transform: rotate(90deg);
  transition: transform var(--dur-fast);
}
.arb-cases__group-chevron--open {
  transform: rotate(-90deg);
}

/* Case rows */
.arb-cases__rows {
  border-top: 1px solid var(--border);
}
.arb-cases__row {
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-0, var(--bg-inset));
}
.arb-cases__row:last-child {
  border-bottom: none;
}
.arb-cases__row-main {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
}
.arb-cases__row-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-4);
  flex-shrink: 0;
  width: 32px;
}
.arb-cases__row-desc {
  font-size: 13px;
  font-weight: 500;
  color: var(--fg-1);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.arb-cases__row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.arb-cases__log-btn {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg-3);
  cursor: pointer;
  transition: all var(--dur-fast);
}
.arb-cases__log-btn:hover,
.arb-cases__log-btn--active {
  border-color: var(--group-color);
  color: var(--group-color);
  background: var(--group-soft);
}
.arb-cases__delete-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--fg-4);
  cursor: pointer;
  border-radius: var(--r-sm);
  font-size: 11px;
  transition: all var(--dur-fast);
}
.arb-cases__delete-btn:hover {
  background: var(--bg-tint-danger);
  color: var(--action-notify);
}
.arb-cases__snippet {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--fg-3);
  background: var(--bg-inset);
  border-top: 1px solid var(--border-subtle);
  padding: 10px 16px 10px 58px;
  white-space: pre-wrap;
  margin: 0;
  max-height: 140px;
  overflow-y: auto;
}
</style>
