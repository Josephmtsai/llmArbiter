<script setup lang="ts">
defineProps<{ label?: string; hint?: string }>()
</script>

<template>
  <div class="arb-field">
    <label v-if="label" class="arb-field__label">{{ label }}</label>
    <slot />
    <div v-if="hint" class="arb-field__hint">{{ hint }}</div>
  </div>
</template>

<style scoped>
.arb-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.arb-field__label {
  font-size: 12px;
  color: var(--fg-2);
  font-weight: 500;
}
.arb-field__hint {
  font-size: 11px;
  color: var(--fg-3);
}
</style>
