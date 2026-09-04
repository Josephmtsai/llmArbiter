<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>()
</script>

<template>
  <button
    :type="type ?? 'button'"
    class="arb-btn"
    :class="[`arb-btn--${variant ?? 'primary'}`, `arb-btn--${size ?? 'md'}`]"
    :disabled="disabled || loading"
  >
    <UiSpinner v-if="loading" :size="14" />
    <slot v-if="!loading" name="icon" />
    <slot />
  </button>
</template>

<style scoped>
.arb-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: var(--r-sm);
  font-family: var(--font-sans);
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background var(--dur-fast),
    border-color var(--dur-fast);
  user-select: none;
  white-space: nowrap;
  flex-shrink: 0;
}
.arb-btn:disabled {
  background: var(--bg-2) !important;
  color: var(--fg-4) !important;
  border-color: var(--border) !important;
  cursor: not-allowed;
}
.arb-btn--md {
  height: 36px;
  padding: 0 14px;
  font-size: 14px;
}
.arb-btn--sm {
  height: 28px;
  padding: 0 10px;
  font-size: 13px;
}

.arb-btn--primary {
  background: var(--accent);
  color: #fff;
}
.arb-btn--primary:hover:not(:disabled) {
  background: var(--accent-hover);
}
.arb-btn--primary:active:not(:disabled) {
  background: var(--accent-press);
}

.arb-btn--secondary {
  background: var(--bg-2);
  color: var(--fg-0);
  border-color: var(--border);
}
.arb-btn--secondary:hover:not(:disabled) {
  background: var(--bg-3);
}

.arb-btn--ghost {
  background: transparent;
  color: var(--fg-1);
}
.arb-btn--ghost:hover:not(:disabled) {
  background: var(--bg-2);
}

.arb-btn--danger {
  background: transparent;
  color: var(--danger);
  border-color: var(--border);
}
.arb-btn--danger:hover:not(:disabled) {
  background: var(--danger-soft);
}

.arb-btn:focus-visible {
  outline: none;
  box-shadow: var(--ring-focus);
  border-color: var(--border-focus);
}
</style>
