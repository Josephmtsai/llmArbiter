<script setup lang="ts">
const props = defineProps<{ value: number }>()

function confidenceColor(v: number): string {
  if (v >= 0.8) return 'var(--conf-high)'
  if (v >= 0.5) return 'var(--conf-mid)'
  return 'var(--conf-low)'
}

const color = computed(() => confidenceColor(props.value))
const pct = computed(() => Math.round(props.value * 100))
</script>

<template>
  <div class="arb-small-meter">
    <div class="arb-small-meter__track">
      <div class="arb-small-meter__fill" :style="{ width: `${pct}%`, background: color }" />
    </div>
    <span class="arb-small-meter__pct num" :style="{ color }">{{ pct }}%</span>
  </div>
</template>

<style scoped>
.arb-small-meter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.arb-small-meter__track {
  width: 64px;
  height: 5px;
  border-radius: 999px;
  background: var(--bg-2);
  overflow: hidden;
}
.arb-small-meter__fill { height: 100%; }
.arb-small-meter__pct {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  min-width: 32px;
}
</style>
