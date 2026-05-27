<script setup lang="ts">
import type { PrimaryAction, SideAction } from '~/types/api'

const props = defineProps<{
  action: PrimaryAction | SideAction | 'timeout'
  size?: 'sm' | 'lg'
}>()

const ACTION_META: Record<string, { color: string; soft: string }> = {
  trigger_rebuild: { color: 'var(--action-rebuild)', soft: 'var(--action-rebuild-soft)' },
  trigger_fallback: { color: 'var(--action-fallback)', soft: 'var(--action-fallback-soft)' },
  trigger_restart: { color: 'var(--action-restart)', soft: 'var(--action-restart-soft)' },
  notify_human: { color: 'var(--action-notify)', soft: 'var(--action-notify-soft)' },
  send_email: { color: 'var(--action-email)', soft: 'var(--action-email-soft)' },
  timeout: { color: 'var(--fg-3)', soft: 'var(--bg-2)' },
}

const FALLBACK = { color: 'var(--fg-3)', soft: 'var(--bg-2)' }
const meta = computed(() => ACTION_META[props.action ?? ''] ?? FALLBACK)
const isLg = computed(() => props.size === 'lg')
</script>

<template>
  <span
    class="arb-action-badge"
    :class="isLg ? 'arb-action-badge--lg' : 'arb-action-badge--sm'"
    :style="{
      background: meta.soft,
      borderColor: meta.color,
      color: meta.color,
    }"
  >
    <span class="arb-action-badge__dot" />
    {{ action }}
  </span>
</template>

<style scoped>
.arb-action-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid;
  font-family: var(--font-mono);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}
.arb-action-badge--sm {
  padding: 4px 10px;
  border-radius: var(--r-sm);
  font-size: 12px;
}
.arb-action-badge--lg {
  padding: 8px 14px;
  border-radius: var(--r-md);
  font-size: 14px;
  gap: 8px;
}
.arb-action-badge__dot {
  border-radius: 999px;
  background: currentColor;
  flex-shrink: 0;
}
.arb-action-badge--sm .arb-action-badge__dot { width: 6px; height: 6px; }
.arb-action-badge--lg .arb-action-badge__dot { width: 7px; height: 7px; }
</style>
