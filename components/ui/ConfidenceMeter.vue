<script setup lang="ts">
const props = defineProps<{ value: number; large?: boolean; animate?: boolean }>()

const displayWidth = ref(props.animate ? 0 : props.value)

watch(
  () => props.value,
  (v) => {
    if (!props.animate) { displayWidth.value = v; return }
    displayWidth.value = 0
    setTimeout(() => { displayWidth.value = v }, 30)
  },
  { immediate: true },
)

function confidenceColor(v: number): string {
  if (v >= 0.8) return 'var(--conf-high)'
  if (v >= 0.5) return 'var(--conf-mid)'
  return 'var(--conf-low)'
}

function confidenceLabel(v: number): string {
  if (v >= 0.8) return 'auto-execute'
  if (v >= 0.5) return 'execute + force notify'
  return 'notify only'
}

const color = computed(() => confidenceColor(props.value))
const label = computed(() => confidenceLabel(props.value))
const pct = computed(() => Math.round(props.value * 100))
</script>

<template>
  <div class="arb-conf">
    <div class="arb-conf__header">
      <UiEyebrow>Confidence</UiEyebrow>
      <span class="arb-conf__pct num" :style="{ color }">{{ pct }}%</span>
    </div>
    <div class="arb-conf__track" :class="large ? 'arb-conf__track--lg' : ''">
      <div
        class="arb-conf__fill"
        :style="{
          width: `${Math.round(displayWidth * 100)}%`,
          background: color,
          transition: animate ? 'width 320ms cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
        }"
      />
    </div>
    <div class="arb-conf__footer">
      <span class="arb-conf__raw num mono">{{ value.toFixed(2) }}</span>
      <span class="arb-conf__label" :style="{ color }">{{ label }}</span>
    </div>
  </div>
</template>

<style scoped>
.arb-conf { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.arb-conf__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.arb-conf__pct {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
}
.arb-conf__track {
  height: 8px;
  border-radius: 999px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  overflow: hidden;
}
.arb-conf__track--lg { height: 10px; }
.arb-conf__fill { height: 100%; border-radius: 999px; }
.arb-conf__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.arb-conf__raw {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-3);
}
.arb-conf__label { font-size: 11px; }
</style>
