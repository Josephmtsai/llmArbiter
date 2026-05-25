<script setup lang="ts">
defineProps<{
  modelValue?: string
  placeholder?: string
  rows?: number
  mono?: boolean
}>()

defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <textarea
    class="arb-textarea"
    :class="{ 'arb-textarea--mono': mono }"
    :value="modelValue"
    :rows="rows ?? 4"
    :placeholder="placeholder"
    @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>

<style scoped>
.arb-textarea {
  padding: 10px 12px;
  background: var(--bg-inset);
  color: var(--fg-0);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  font-size: 14px;
  font-family: var(--font-sans);
  line-height: 1.5;
  outline: none;
  resize: vertical;
  width: 100%;
  transition:
    border-color var(--dur-fast),
    box-shadow var(--dur-fast);
}
.arb-textarea--mono {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
}
.arb-textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}
.arb-textarea::placeholder {
  color: var(--fg-3);
}
</style>
