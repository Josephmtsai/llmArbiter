<script setup lang="ts">
defineProps<{
  modelValue?: string | number
  placeholder?: string
  type?: string
  mono?: boolean
  disabled?: boolean
}>()

defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <input
    class="arb-input"
    :class="{ 'arb-input--mono': mono }"
    :value="modelValue"
    :placeholder="placeholder"
    :type="type ?? 'text'"
    :disabled="disabled"
    v-bind="$attrs"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<style scoped>
.arb-input {
  height: 36px;
  padding: 0 12px;
  background: var(--bg-0);
  color: var(--fg-0);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  font-size: 14px;
  font-family: var(--font-sans);
  outline: none;
  width: 100%;
  transition:
    border-color var(--dur-fast),
    box-shadow var(--dur-fast);
}
.arb-input--mono {
  font-family: var(--font-mono);
  font-size: 13px;
}
.arb-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}
.arb-input:disabled {
  color: var(--fg-4);
  cursor: not-allowed;
}
.arb-input::placeholder {
  color: var(--fg-3);
}
</style>
