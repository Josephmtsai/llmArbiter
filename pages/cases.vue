<script setup lang="ts">
import type { TestCase, PrimaryAction } from '~/types/api'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const cases = ref<TestCase[]>([])
const casesTotal = ref(0)
const loading = ref(true)
const error = ref<string | null>(null)
const showForm = ref(false)

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

    <!-- Cases list -->
    <div v-if="loading" class="arb-cases__loading"><UiSpinner size="sm" /></div>
    <div v-else-if="error" class="arb-cases__error">{{ error }}</div>
    <div v-else-if="cases.length === 0" class="arb-cases__empty">
      No test cases yet. Create one to start building your evaluation suite.
    </div>
    <div v-else class="arb-cases__list">
      <UiCard v-for="tc in cases" :key="tc.id" class="arb-cases__item">
        <div class="arb-cases__item-header">
          <div class="arb-cases__item-meta">
            <span class="arb-cases__item-id num">#{{ tc.id }}</span>
            <span class="arb-cases__item-desc">{{ tc.description }}</span>
          </div>
          <div class="arb-cases__item-actions">
            <ActionBadge :action="tc.expected_action" size="sm" />
            <button class="arb-cases__delete-btn" title="Delete" @click="deleteCase(tc.id)">✕</button>
          </div>
        </div>
        <pre class="arb-cases__snippet">{{ tc.log_snippet }}</pre>
      </UiCard>
    </div>
  </div>
</template>

<style scoped>
.arb-cases {
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}
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
.arb-cases__list { display: flex; flex-direction: column; gap: 10px; }
.arb-cases__item { display: flex; flex-direction: column; gap: 10px; }
.arb-cases__item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.arb-cases__item-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.arb-cases__item-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-4);
  flex-shrink: 0;
}
.arb-cases__item-desc {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--fg-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.arb-cases__item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
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
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: 10px 12px;
  white-space: pre-wrap;
  margin: 0;
  max-height: 100px;
  overflow-y: auto;
}
</style>
