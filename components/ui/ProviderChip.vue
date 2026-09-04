<script setup lang="ts">
defineProps<{ provider: string; model?: string }>()
</script>

<template>
  <UiChip class="arb-provider-chip"> {{ provider }}{{ model ? ` · ${model}` : '' }} </UiChip>
</template>

<style scoped>
.arb-provider-chip :deep(span) {
  font-family: var(--font-mono);
}
</style>
