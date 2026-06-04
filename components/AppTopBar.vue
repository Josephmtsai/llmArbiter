<script setup lang="ts">
import { Sun, Moon, LogOut, Menu } from 'lucide-vue-next'

defineProps<{ title: string; subtitle?: string }>()

const { theme, toggle } = useTheme()
const authStore = useAuthStore()
const sidebarOpen = useState('mobile:sidebarOpen', () => false)

async function handleLogout() {
  await authStore.logout()
  await navigateTo('/login')
}
</script>

<template>
  <header class="arb-topbar">
    <button class="arb-topbar__hamburger" aria-label="Open menu" @click="sidebarOpen = !sidebarOpen">
      <Menu :size="20" color="var(--fg-2)" :stroke-width="1.75" />
    </button>
    <div class="arb-topbar__title-block">
      <h1 class="arb-topbar__title">{{ title }}</h1>
      <p v-if="subtitle" class="arb-topbar__subtitle">{{ subtitle }}</p>
    </div>
    <div class="arb-topbar__actions">
      <slot name="actions" />
      <button class="arb-topbar__icon-btn" :title="theme === 'dark' ? 'Switch to light' : 'Switch to dark'" @click="toggle">
        <Sun v-if="theme === 'dark'" :size="16" color="var(--fg-3)" :stroke-width="1.75" />
        <Moon v-else :size="16" color="var(--fg-3)" :stroke-width="1.75" />
      </button>
      <button class="arb-topbar__icon-btn" title="Sign out" @click="handleLogout">
        <LogOut :size="16" color="var(--fg-3)" :stroke-width="1.75" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.arb-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 32px;
  background: var(--bg-0);
  border-bottom: 1px solid var(--border-subtle);
  min-height: 64px;
}
.arb-topbar__title-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
  margin: 0 12px;
}
.arb-topbar__title {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.025em;
  color: var(--fg-0);
  margin: 0;
  line-height: 1.2;
}
.arb-topbar__subtitle {
  font-size: 12px;
  color: var(--fg-3);
  margin: 0;
}
.arb-topbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.arb-topbar__icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--r-sm);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background var(--dur-fast);
  color: var(--fg-3);
}
.arb-topbar__icon-btn:hover {
  background: var(--bg-2);
}
.arb-topbar__hamburger {
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--r-sm);
  background: transparent;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--dur-fast);
}
.arb-topbar__hamburger:hover { background: var(--bg-2); }

@media (max-width: 767px) {
  .arb-topbar__hamburger { display: flex; }
  .arb-topbar { padding: 12px 16px; z-index: 201; }
  .arb-topbar__title {
    font-size: 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .arb-topbar__subtitle {
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
