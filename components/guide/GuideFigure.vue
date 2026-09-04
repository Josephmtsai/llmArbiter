<script setup lang="ts">
defineProps<{
  eyebrow: string
  title: string
  caption?: string
}>()
</script>

<template>
  <figure class="gfig">
    <figcaption class="gfig__head">
      <span class="gfig__eyebrow">{{ eyebrow }}</span>
      <strong class="gfig__title">{{ title }}</strong>
      <p v-if="caption" class="gfig__caption">{{ caption }}</p>
    </figcaption>
    <div class="gfig__scroll">
      <slot />
    </div>
  </figure>
</template>

<style scoped>
.gfig {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
  margin: 0;
}

.gfig__head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gfig__eyebrow {
  color: var(--fg-4);
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.gfig__title {
  color: var(--fg-1);
  font-size: 14px;
  font-weight: 620;
}

.gfig__caption {
  margin: 0;
  color: var(--fg-3);
  font-size: 13px;
  line-height: 1.6;
}

.gfig__scroll {
  overflow-x: auto;
  overflow-y: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  background: var(--bg-1);
  padding: 16px;
}

.gfig__scroll :deep(svg) {
  display: block;
  width: 100%;
  min-width: 900px;
  height: auto;
}
</style>
