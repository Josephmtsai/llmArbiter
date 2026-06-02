<script setup lang="ts">
import { Play } from 'lucide-vue-next'
import type { PromptVersion } from '~/types/api'

const promptId = defineModel<number | undefined>('promptId', { required: true })
const model = defineModel<string>('model', { required: true })

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
      <UiField label="Model override">
        <UiInput v-model="model" placeholder="Optional OpenRouter-compatible model" mono />
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
