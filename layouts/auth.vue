<script setup lang="ts">
const { init } = useTheme()
onMounted(init)
</script>

<template>
  <div class="arb-auth-shell">
    <slot />
  </div>
</template>

<style scoped>
.arb-auth-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-0);
  background-image: radial-gradient(
    ellipse 80% 50% at 50% -10%,
    rgba(79, 140, 247, 0.12),
    transparent
  );
}
</style>
