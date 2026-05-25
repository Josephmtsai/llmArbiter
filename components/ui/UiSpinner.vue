<script setup lang="ts">
const props = defineProps<{ size?: number | 'sm' | 'md' | 'lg' }>()

const SIZE_MAP: Record<string, number> = { sm: 14, md: 20, lg: 28 }

const px = computed(() => {
  if (typeof props.size === 'number') return props.size
  return SIZE_MAP[props.size ?? 'sm'] ?? 14
})
</script>

<template>
  <span
    class="inline-block rounded-full"
    :style="{
      width: `${px}px`,
      height: `${px}px`,
      border: '1.5px solid rgba(255,255,255,0.25)',
      borderTopColor: 'currentColor',
      animation: 'arb-spin 0.7s linear infinite',
    }"
  />
</template>
