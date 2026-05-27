<script setup lang="ts">
import {
  Zap,
  ListChecks,
  FlaskConical,
  Gauge,
  SlidersHorizontal,
  BookOpen,
  ChevronsUpDown,
} from 'lucide-vue-next'

const route = useRoute()
const api = useApi()

const NAV_ITEMS = [
  { id: 'analyze', label: 'Analyze', icon: Zap, href: '/' },
  { id: 'decisions', label: 'Decisions', icon: ListChecks, href: '/decisions', count: null as number | null },
  { id: 'cases', label: 'Test cases', icon: FlaskConical, href: '/cases', count: null as number | null },
  { id: 'evaluate', label: 'Evaluate', icon: Gauge, href: '/evaluate' },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal, href: '/settings' },
  { id: 'guide', label: 'How it works', icon: BookOpen, href: '/guide' },
]

const apiOnline = ref(false)
const latencyMs = ref<number | null>(null)
const activeProvider = ref<string | null>(null)

async function pollStatus() {
  try {
    const t0 = Date.now()
    await api.healthCheck()
    latencyMs.value = Date.now() - t0
    apiOnline.value = true
  } catch {
    apiOnline.value = false
    latencyMs.value = null
  }
  try {
    const res = await api.getProviders()
    activeProvider.value = res.active_provider ?? null
  } catch {
    activeProvider.value = null
  }
}

onMounted(pollStatus)

function isActive(href: string): boolean {
  if (href === '/') return route.path === '/'
  return route.path.startsWith(href)
}
</script>

<template>
  <aside class="arb-sidebar">
    <!-- Brand -->
    <div class="arb-sidebar__brand">
      <div class="arb-sidebar__logo">
        <span class="arb-sidebar__logo-mark">A</span>
        <div class="arb-sidebar__logo-dot" />
      </div>
      <span class="arb-sidebar__wordmark">Arbiter</span>
    </div>

    <!-- Workspace chip -->
    <div class="arb-sidebar__workspace">
      <div class="arb-sidebar__ws-avatar">JT</div>
      <div class="arb-sidebar__ws-info">
        <span class="arb-sidebar__ws-name">joseph / cicd</span>
        <span class="arb-sidebar__ws-env">production</span>
      </div>
      <ChevronsUpDown :size="14" color="var(--fg-3)" />
    </div>

    <!-- Nav -->
    <nav class="arb-sidebar__nav">
      <NuxtLink
        v-for="item in NAV_ITEMS"
        :key="item.id"
        :to="item.href"
        class="arb-sidebar__nav-item"
        :class="{ 'arb-sidebar__nav-item--active': isActive(item.href) }"
      >
        <component
          :is="item.icon"
          :size="16"
          :color="isActive(item.href) ? 'var(--fg-0)' : 'var(--fg-3)'"
          :stroke-width="1.75"
        />
        <span class="arb-sidebar__nav-label">{{ item.label }}</span>
        <span v-if="item.count != null" class="arb-sidebar__nav-count num">{{ item.count }}</span>
      </NuxtLink>
    </nav>

    <div class="arb-sidebar__spacer" />

    <!-- Status footer -->
    <div class="arb-sidebar__status">
      <div class="arb-sidebar__status-row">
        <span
          class="arb-sidebar__status-dot"
          :class="apiOnline ? 'arb-sidebar__status-dot--online' : 'arb-sidebar__status-dot--offline'"
        />
        <span class="arb-sidebar__status-text">{{ apiOnline ? 'API online' : 'API offline' }}</span>
        <span v-if="latencyMs !== null" class="arb-sidebar__status-latency num">{{ latencyMs }}ms</span>
      </div>
      <div class="arb-sidebar__status-row">
        <span
          class="arb-sidebar__status-dot"
          :class="activeProvider ? 'arb-sidebar__status-dot--online' : 'arb-sidebar__status-dot--offline'"
        />
        <span class="arb-sidebar__status-text">{{ activeProvider ?? '—' }}</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.arb-sidebar {
  width: 240px;
  flex-shrink: 0;
  height: 100vh;
  position: sticky;
  top: 0;
  background: var(--bg-0);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  padding: 20px 14px;
  overflow: hidden;
}

.arb-sidebar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 18px;
}
.arb-sidebar__logo {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--bg-1);
  border: 1px solid var(--border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}
.arb-sidebar__logo-mark {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 600;
  color: var(--fg-0);
}
.arb-sidebar__logo-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--accent);
}
.arb-sidebar__wordmark {
  font-weight: 600;
  font-size: 16px;
  letter-spacing: -0.02em;
  color: var(--fg-0);
}

.arb-sidebar__workspace {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  background: var(--bg-1);
  border: 1px solid var(--border-subtle);
  margin-bottom: 18px;
  cursor: pointer;
}
.arb-sidebar__ws-avatar {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.arb-sidebar__ws-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.arb-sidebar__ws-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg-0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.arb-sidebar__ws-env {
  font-size: 10px;
  color: var(--fg-3);
  font-family: var(--font-mono);
}

.arb-sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.arb-sidebar__nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: var(--r-sm);
  font-size: 13.5px;
  color: var(--fg-2);
  background: transparent;
  cursor: pointer;
  text-decoration: none;
  transition: background var(--dur-fast);
  font-weight: 400;
}
.arb-sidebar__nav-item:hover:not(.arb-sidebar__nav-item--active) {
  background: var(--bg-2);
}
.arb-sidebar__nav-item--active {
  background: var(--bg-3);
  color: var(--fg-0);
  font-weight: 500;
}
.arb-sidebar__nav-label { flex: 1; }
.arb-sidebar__nav-count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-3);
}

.arb-sidebar__status {
  padding: 10px;
  border-radius: 8px;
  background: var(--bg-1);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.arb-sidebar__spacer { flex: 1; }
.arb-sidebar__status-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.arb-sidebar__status-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  flex-shrink: 0;
}
.arb-sidebar__status-dot--online { background: var(--success); }
.arb-sidebar__status-dot--offline { background: var(--conf-low); }
.arb-sidebar__status-text { font-size: 11px; color: var(--fg-2); flex: 1; }
.arb-sidebar__status-latency {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-4);
}
</style>
