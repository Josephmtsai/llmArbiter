<script setup lang="ts">
const { init } = useTheme()
onMounted(init)
</script>

<template>
  <div class="arb-shell">
    <AppSidebar />
    <div class="arb-shell__main">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.arb-shell {
  display: flex;
  min-height: 100vh;
  background: var(--bg-0);
}
.arb-shell__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
