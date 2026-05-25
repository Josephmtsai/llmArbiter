<script setup lang="ts">
defineProps<{
  modelValue?: string | number
  options?: Array<string | { value: string | number; label: string }>
  mono?: boolean
  disabled?: boolean
}>()

defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <select
    class="arb-select"
    :class="{ 'arb-select--mono': mono }"
    :value="modelValue"
    :disabled="disabled"
    @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <template v-if="options">
      <option
        v-for="opt in options"
        :key="typeof opt === 'string' ? opt : opt.value"
        :value="typeof opt === 'string' ? opt : opt.value"
      >
        {{ typeof opt === 'string' ? opt : opt.label }}
      </option>
    </template>
    <slot v-else />
  </select>
</template>

<style scoped>
.arb-select {
  height: 36px;
  padding: 0 34px 0 12px;
  background: var(--bg-0);
  color: var(--fg-0);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  font-size: 14px;
  font-family: var(--font-sans);
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a7c63' stroke-width='1.75'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 16px;
  cursor: pointer;
  width: 100%;
}
.arb-select--mono {
  font-family: var(--font-mono);
  font-size: 13px;
}
.arb-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}
</style>
