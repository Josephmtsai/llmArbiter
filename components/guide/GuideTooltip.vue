<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <span class="g-tooltip">
    <slot />
    <span class="g-tooltip__panel" role="tooltip">{{ text }}</span>
  </span>
</template>

<style scoped>
.g-tooltip {
  position: relative;
  display: inline-block;
  border-bottom: 1px dashed var(--fg-4);
  cursor: help;
}

.g-tooltip__panel {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  width: max-content;
  max-width: min(280px, 90vw);
  pointer-events: none;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 8px 10px;
  background: var(--bg-3);
  color: var(--fg-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.55;
  text-decoration: none;
  white-space: normal;
  opacity: 0;
  transition: opacity var(--dur-fast);
}

.g-tooltip:hover .g-tooltip__panel,
.g-tooltip:focus-within .g-tooltip__panel {
  opacity: 1;
}
</style>
