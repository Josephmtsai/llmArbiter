# Tasks: Auth Hardening

## Feature ID
`auth-hardening`

---

## Task 1 — Server auth utils（純函式）

**File:** `server/utils/auth.ts`（新增）

```ts
import { createHash, timingSafeEqual } from 'node:crypto'

export function verifyPassword(input: string, expected: string): boolean {
  const a = createHash('sha256').update(input).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSec: number
}

export interface RateLimiter {
  hit(key: string, now?: number): RateLimitResult
  reset(): void
}

export function createRateLimiter(opts: { limit: number; windowMs: number }): RateLimiter {
  const buckets = new Map<string, { count: number; windowStart: number }>()

  return {
    hit(key, now = Date.now()) {
      // 順手清除過期 entry，避免 Map 無限成長
      for (const [k, b] of buckets) {
        if (now - b.windowStart >= opts.windowMs) buckets.delete(k)
      }
      const bucket = buckets.get(key)
      if (!bucket) {
        buckets.set(key, { count: 1, windowStart: now })
        return { allowed: true, retryAfterSec: 0 }
      }
      bucket.count += 1
      if (bucket.count > opts.limit) {
        const retryAfterSec = Math.ceil((bucket.windowStart + opts.windowMs - now) / 1000)
        return { allowed: false, retryAfterSec: Math.max(retryAfterSec, 1) }
      }
      return { allowed: true, retryAfterSec: 0 }
    },
    reset() {
      buckets.clear()
    },
  }
}
```

### AC
- [ ] AC-1.1: Given 相同字串，When 呼叫 `verifyPassword(a, a)`，Then 回傳 `true`。
- [ ] AC-1.2: Given 不同字串（含長度不同、其中一方為空字串），When 呼叫 `verifyPassword`，Then 回傳 `false` 且不拋錯。
- [ ] AC-1.3: Given `createRateLimiter({ limit: 5, windowMs: 60_000 })`，When 同一 key 在同一視窗內 `hit` 5 次，Then 每次 `allowed === true`。
- [ ] AC-1.4: Given 同上，When 第 6 次 `hit`，Then `allowed === false` 且 `retryAfterSec` 介於 1 到 60。
- [ ] AC-1.5: Given key 已被拒絕，When 傳入 `now` 超過 `windowStart + windowMs`，Then 重新 `allowed === true`。
- [ ] AC-1.6: Given 兩個不同 key，When 其中一個超過 limit，Then 另一個不受影響。

---

## Task 2 — Login route 防禦

**File:** `server/api/auth/login.post.ts`

```ts
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 })

export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const gate = limiter.hit(ip)
  if (!gate.allowed) {
    setHeader(event, 'Retry-After', String(gate.retryAfterSec))
    throw createError({ statusCode: 429, message: 'Too many attempts' })
  }

  const body = await readBody<unknown>(event).catch(() => null)
  const password =
    body && typeof body === 'object' && 'password' in body
      ? (body as { password?: unknown }).password
      : undefined
  if (typeof password !== 'string' || password.length === 0) {
    throw createError({ statusCode: 400, message: 'Password is required' })
  }

  const config = useRuntimeConfig(event)
  if (!verifyPassword(password, config.authPassword)) {
    throw createError({ statusCode: 401, message: 'Invalid password' })
  }

  await setUserSession(event, { user: { role: 'admin' } })
  return { ok: true }
})
```

備註：rate limit 檢查放在 body 驗證之前，讓格式錯誤的請求也計入次數。`limiter` 為 module-level singleton（Nitro 單一 instance）。

### AC
- [ ] AC-2.1: Given body 為空、非 JSON、或缺少 `password`，When POST `/api/auth/login`，Then 回 400 而非 500。
- [ ] AC-2.2: Given `password` 為空字串，When POST，Then 回 400（即使 `authPassword` 亦為空字串也不可登入）。
- [ ] AC-2.3: Given 密碼錯誤，When POST，Then 回 401 且不建立 session。
- [ ] AC-2.4: Given 密碼正確，When POST，Then 回 `{ ok: true }` 且後續 GET `/api/auth/check` 回 `{ ok: true }`。
- [ ] AC-2.5: Given 同一 IP 於 60 秒內已 POST 5 次，When 第 6 次 POST（不論密碼對錯），Then 回 429 且帶 `Retry-After` header。
- [ ] AC-2.6: Given 程式碼，When 檢視 login route，Then 不存在 `!==` / `===` 直接比對密碼，且 `useRuntimeConfig` 有傳入 `event`。

---

## Task 3 — 啟動時設定斷言

**File:** `server/plugins/assert-config.ts`（新增）

```ts
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const password = config.authPassword
  if (typeof password !== 'string' || password.length < 32) {
    throw new Error(
      'NUXT_AUTH_PASSWORD must be set and at least 32 characters long. See .env.example.',
    )
  }
})
```

### AC
- [ ] AC-3.1: Given `NUXT_AUTH_PASSWORD` 未設定或長度 < 32，When 執行 `node .output/server/index.mjs` 或 `pnpm dev`，Then 程序啟動失敗並輸出含 `NUXT_AUTH_PASSWORD` 的錯誤訊息。
- [ ] AC-3.2: Given `NUXT_AUTH_PASSWORD` 長度 ≥ 32，When 啟動，Then 正常啟動。
- [ ] AC-3.3: Given 環境完全沒有 `NUXT_AUTH_PASSWORD`，When 執行 `pnpm build`，Then build 成功（plugin 不在 build 期執行）。

---

## Task 4 — 前端 redirect 純函式

**File:** `utils/auth.ts`（新增；Nuxt 會 auto-import `utils/*`）

```ts
export function resolveSafeRedirect(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback
  if (!raw.startsWith('/')) return fallback
  if (raw.startsWith('//')) return fallback
  if (raw.includes('\\')) return fallback
  if (raw === '/login' || raw.startsWith('/login?')) return fallback
  return raw
}
```

### AC
- [ ] AC-4.1: Given `'/decisions?limit=10'`，When 呼叫，Then 原樣回傳。
- [ ] AC-4.2: Given `'https://evil.com'`、`'//evil.com'`、含反斜線的路徑、`undefined`、陣列，When 呼叫，Then 回傳 `'/'`。
- [ ] AC-4.3: Given `'/login'` 或 `'/login?redirect=/x'`，When 呼叫，Then 回傳 `'/'`（避免登入後又回到登入頁）。

---

## Task 5 — Middleware 帶 redirect、Login 頁回原路徑

**File:** `middleware/auth.ts`

```ts
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return
  const authStore = useAuthStore()
  if (authStore.authenticated) return
  const ok = await authStore.check()
  if (!ok) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
```

**File:** `pages/login.vue`（`submit()` 部分）

```ts
const route = useRoute()

async function submit() {
  const ok = await authStore.login(password.value)
  if (ok) {
    await navigateTo(resolveSafeRedirect(route.query.redirect))
  }
}
```

### AC
- [ ] AC-5.1: Given 未登入，When 直接開啟 `/decisions?limit=10`，Then 導向 `/login?redirect=%2Fdecisions%3Flimit%3D10`。
- [ ] AC-5.2: Given 在 `/login?redirect=/decisions` 登入成功，When 登入完成，Then 導向 `/decisions`。
- [ ] AC-5.3: Given 在 `/login?redirect=https://evil.com` 登入成功，When 登入完成，Then 導向 `/`。
- [ ] AC-5.4: Given 在 `/login`（無 redirect）登入成功，When 登入完成，Then 導向 `/`（維持現行行為）。

---

## Task 6 — useAuthStore 誠實回報

**File:** `stores/useAuthStore.ts`

```ts
export const useAuthStore = defineStore('auth', () => {
  const authenticated = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  function reset() {
    authenticated.value = false
    error.value = null
  }

  async function login(password: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      await $fetch('/api/auth/login', { method: 'POST', body: { password } })
      authenticated.value = true
      return true
    } catch (err) {
      const e = err as { statusCode?: number; status?: number }
      const status = e.statusCode ?? e.status
      if (status === 401) error.value = 'Invalid password'
      else if (status === 429) error.value = 'Too many attempts, try again later'
      else error.value = 'Server error, please try again'
      return false
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
      authenticated.value = false
      return true
    } catch {
      error.value = 'Logout failed, please try again'
      return false
    } finally {
      loading.value = false
    }
  }

  async function check(): Promise<boolean> {
    /* 維持現行實作 */
  }

  return { authenticated, loading, error, login, logout, check, reset }
})
```

**File:** `components/AppTopBar.vue`

```ts
async function handleLogout() {
  const ok = await authStore.logout()
  if (ok) await navigateTo('/login')
}
```

### AC
- [ ] AC-6.1: Given login API 回 401，When 呼叫 `login()`，Then 回傳 `false`、`error === 'Invalid password'`、`authenticated === false`。
- [ ] AC-6.2: Given login API 回 429，When 呼叫 `login()`，Then `error === 'Too many attempts, try again later'`。
- [ ] AC-6.3: Given login API 回 500 或網路錯誤，When 呼叫 `login()`，Then `error === 'Server error, please try again'`。
- [ ] AC-6.4: Given `authenticated === true` 且 logout API 失敗，When 呼叫 `logout()`，Then 回傳 `false`、`authenticated` 仍為 `true`、`error` 非 null。
- [ ] AC-6.5: Given logout API 成功，When 呼叫 `logout()`，Then 回傳 `true`、`authenticated === false`。
- [ ] AC-6.6: Given `authenticated === true`，When 呼叫 `reset()`，Then `authenticated === false`、`error === null`，且**不**發出任何 HTTP 請求。
- [ ] AC-6.7: Given TopBar logout 失敗，When 使用者按 Logout，Then 停留在原頁面且不導向 `/login`。

---

## Task 7 — useApi 全域 401 攔截

**File:** `composables/useApi.ts`

```ts
const api = $fetch.create({
  baseURL: '/api/arbiter',
  onResponseError({ response }) {
    if (response.status !== 401) return
    if (!import.meta.client) return
    const route = useRoute()
    if (route.path === '/login') return
    useAuthStore().reset()
    void navigateTo({ path: '/login', query: { redirect: route.fullPath } })
  },
})
```

備註：`useRoute` / `useAuthStore` / `navigateTo` 均在 Nuxt app context 內可用；`useApi()` 本身只在 setup / composable 中被呼叫，interceptor 執行時 app context 仍存在。若 Developer 發現 interceptor 內取不到 context，改為在 `useApi()` 函式內先取 `route` 與 `authStore`，再於 `$fetch.create` 閉包中使用。

### AC
- [ ] AC-7.1: Given 已登入且 session 於伺服器端失效，When 任一頁面透過 `useApi` 呼叫得到 401，Then 瀏覽器導向 `/login?redirect=<原 fullPath>` 且 `authStore.authenticated === false`。
- [ ] AC-7.2: Given 目前在 `/login`，When 收到 401，Then 不觸發 navigateTo（避免迴圈）。
- [ ] AC-7.3: Given SSR 期間的 `useApi` 呼叫收到 401，When 執行，Then 不呼叫 `navigateTo`、不修改 store（由 `middleware/auth.ts` 處理）。
- [ ] AC-7.4: Given 非 401 的錯誤（404 / 500），When 收到，Then 行為與現況相同（錯誤照常 throw 給呼叫端）。

---

## Task 8 — 測試

**File:** `tests/serverAuthUtils.test.ts`（新增）

```ts
import { describe, expect, it } from 'vitest'
import { createRateLimiter, verifyPassword } from '../server/utils/auth'
// 覆蓋 AC-1.1 ~ AC-1.6；rate limiter 測試以明確傳入 now 控制時間，不用 fake timers
```

**File:** `tests/authRedirect.test.ts`（新增）

```ts
import { describe, expect, it } from 'vitest'
import { resolveSafeRedirect } from '../utils/auth'
// 覆蓋 AC-4.1 ~ AC-4.3
```

**File:** `tests/useAuthStore.test.ts`（新增）

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
// 以 vi.stubGlobal('$fetch', vi.fn()) 模擬 Nuxt 的 $fetch；
// useRequestHeaders 亦需 stubGlobal 為 () => ({})
// 覆蓋 AC-6.1 ~ AC-6.6
```

### AC
- [ ] AC-8.1: Given 上述三個測試檔，When 執行 `pnpm test`，Then 全部通過。
- [ ] AC-8.2: Given `pnpm test:coverage`，When 檢視 `server/utils/auth.ts`、`utils/auth.ts`、`stores/useAuthStore.ts`，Then 每檔 statements 覆蓋率 ≥ 80%。
- [ ] AC-8.3: Given 完成後，When 執行 `pnpm lint` 與 `pnpm vue-tsc --noEmit`，Then 無錯誤、無 `any`、無 `console.log`。

---

## Definition of Done

- Task 1–8 的 AC 全部勾選。
- `pnpm lint`、`pnpm vue-tsc --noEmit`、`pnpm test`、`pnpm build` 全部通過。
- 手動驗證（本機 `pnpm dev`）：錯密碼 5 次後第 6 次顯示 rate-limit 訊息；登入後刪除 cookie 再操作任一頁面會回到 `/login?redirect=...`；登入後回到原頁。
- `handoff-dev.json` 列出所有 `changed_files`。
