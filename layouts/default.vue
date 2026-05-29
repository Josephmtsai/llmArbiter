<script setup lang="ts">
const { init } = useTheme()
const sidebarOpen = useState('mobile:sidebarOpen', () => false)
onMounted(init)
</script>

<template>
  <div class="arb-shell">
    <div v-if="sidebarOpen" class="arb-shell__overlay" @click="sidebarOpen = false" />
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
.arb-shell__overlay { display: none; }

@media (max-width: 767px) {
  .arb-shell__overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 199;
  }
}
</style>
