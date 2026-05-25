<script setup lang="ts">
defineProps<{ color?: string }>()
</script>

<template>
  <span class="arb-chip">
    <span v-if="color" class="arb-chip__dot" :style="{ background: color }" />
    <slot />
  </span>
</template>

<style scoped>
.arb-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: var(--r-pill);
  background: var(--bg-2);
  border: 1px solid var(--border);
  font-size: 11px;
  font-weight: 500;
  color: var(--fg-1);
  white-space: nowrap;
}
.arb-chip__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  flex-shrink: 0;
}
</style>
