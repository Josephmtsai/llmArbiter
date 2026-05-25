<script setup lang="ts">
defineProps<{ padding?: string | number; clickable?: boolean }>()
</script>

<template>
  <div class="arb-card" :class="{ 'arb-card--clickable': clickable }">
    <slot />
  </div>
</template>

<style scoped>
.arb-card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 18px;
  transition:
    border-color var(--dur-fast),
    background var(--dur-fast);
}
.arb-card--clickable {
  cursor: pointer;
}
.arb-card--clickable:hover {
  background: var(--bg-2);
}
</style>
