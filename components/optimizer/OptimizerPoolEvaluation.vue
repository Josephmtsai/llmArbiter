<script setup lang="ts">
import { Play } from 'lucide-vue-next'
import type { PromptVersion } from '~/types/api'

const promptId = defineModel<number | undefined>('promptId', { required: true })
const model = defineModel<string>('model', { required: true })

const optimizerDefaultModel = useState<string | null>('sidebar:optimizerDefaultModel', () => null)

function pickConfiguredModel() {
  if (!optimizerDefaultModel.value) return
  model.value = model.value === optimizerDefaultModel.value ? '' : optimizerDefaultModel.value
}

defineProps<{
  prompts: PromptVersion[]
  loadingPrompts: boolean
  poolIsEmpty: boolean
  starting: boolean
  acceptedRunId: number | null
  error: string | null
}>()

defineEmits<{ start: [] }>()
</script>

<template>
  <section class="optimizer-pool">
    <UiCard class="optimizer-pool__panel">
      <UiEyebrow>Pool evaluation</UiEyebrow>
      <p class="optimizer-pool__muted">
        Runs the active prompt against aggregate eval pool samples using source=pool.
        Raw pool cases stay out of this view; inspect saved run results from history.
      </p>
      <UiField label="Prompt version">
        <UiSelect v-model.number="promptId" :disabled="loadingPrompts">
          <option v-for="prompt in prompts" :key="prompt.id" :value="prompt.id">
            {{ prompt.label }}{{ prompt.active ? ' (active)' : '' }}
          </option>
        </UiSelect>
      </UiField>
      <UiField label="Model">
        <div v-if="optimizerDefaultModel" class="optimizer-pool__model-picker">
          <button
            class="optimizer-pool__model-btn"
            :class="{ 'optimizer-pool__model-btn--active': model === optimizerDefaultModel }"
            @click="pickConfiguredModel"
          >
            {{ optimizerDefaultModel }}
            <span class="optimizer-pool__model-btn-tag">configured</span>
          </button>
        </div>
        <UiInput v-model="model" placeholder="Or enter a model ID…" mono />
      </UiField>
      <UiButton
        class="optimizer-pool__wide-btn"
        :loading="starting"
        :disabled="poolIsEmpty"
        @click="$emit('start')"
      >
        <template #icon><Play :size="15" /></template>
        Start pool evaluation
      </UiButton>
      <div v-if="error" class="optimizer-pool__error">{{ error }}</div>
      <div v-if="acceptedRunId" class="optimizer-pool__notice">
        Evaluation accepted:
        <NuxtLink :to="`/evaluate/history/${acceptedRunId}`" class="optimizer-pool__link">
          run #{{ acceptedRunId }}
        </NuxtLink>
        <span class="optimizer-pool__notice-extra">opens after the run is saved.</span>
      </div>
    </UiCard>
  </section>
</template>

<style scoped>
.optimizer-pool { max-width: 620px; }
.optimizer-pool__panel { display: flex; flex-direction: column; gap: 14px; }
.optimizer-pool__model-picker { margin-bottom: 6px; }
.optimizer-pool__model-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 4px 12px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg-3);
  cursor: pointer;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: all var(--dur-fast);
}
.optimizer-pool__model-btn:hover { border-color: var(--fg-3); color: var(--fg-1); }
.optimizer-pool__model-btn--active {
  border-color: var(--action-rebuild);
  color: var(--action-rebuild);
  background: var(--action-rebuild-soft);
}
.optimizer-pool__model-btn-tag {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fg-4);
  background: var(--bg-2);
  border-radius: var(--r-sm);
  padding: 1px 4px;
  flex-shrink: 0;
}
.optimizer-pool__muted { margin: 0; color: var(--fg-4); font-size: 12px; }
.optimizer-pool__wide-btn { width: 100%; justify-content: center; }
.optimizer-pool__error,
.optimizer-pool__notice {
  border-radius: var(--r-sm);
  padding: 10px 12px;
  font-size: 13px;
}
.optimizer-pool__error {
  border: 1px solid rgba(248, 113, 113, 0.24);
  background: var(--bg-tint-danger);
  color: var(--action-notify);
}
.optimizer-pool__notice {
  border: 1px solid rgba(96, 165, 250, 0.24);
  background: var(--accent-soft);
  color: var(--fg-1);
}
.optimizer-pool__link {
  color: var(--accent);
  text-decoration: none;
}
.optimizer-pool__link:hover { text-decoration: underline; }
.optimizer-pool__notice-extra {
  display: block;
  margin-top: 4px;
  color: var(--fg-4);
  font-size: 12px;
}
</style>
