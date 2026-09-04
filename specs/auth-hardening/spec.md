# Spec: Auth Hardening

## Feature ID
`auth-hardening`

## Summary

強化 Nuxt 端的密碼登入流程：修正 `server/api/auth/login.post.ts` 的輸入驗證與 timing-safe 密碼比對、於 Nitro 啟動時斷言 `NUXT_AUTH_PASSWORD` 已正確設定、加入登入 rate limit、在 `useApi` 攔截 401 導回登入頁並保留原路徑、讓 `useAuthStore` 誠實回報 logout 失敗與區分錯誤類型，並補上 Vitest 測試。

## Source doc

- SA 評估報告（本次 session 產出）P0 #1「login route 缺乏防禦」與 P0 #4「401 未全域攔截、logout 假成功」。
- 現況程式碼：`server/api/auth/login.post.ts`、`server/api/auth/logout.post.ts`、`middleware/auth.ts`、`stores/useAuthStore.ts`、`pages/login.vue`、`composables/useApi.ts`。

## 現況問題

| # | 位置 | 問題 |
|---|------|------|
| 1 | `server/api/auth/login.post.ts` | `readBody` 無驗證；body 缺 `password` 或非 JSON 時回 500 而非 400。 |
| 2 | `server/api/auth/login.post.ts` | 以 `!==` 比對密碼，非 timing-safe。 |
| 3 | `server/api/auth/login.post.ts` | `useRuntimeConfig()` 未傳入 `event`。 |
| 4 | `nuxt.config.ts` | `authPassword` 預設為 `''`；若部署忘記設定 env，空字串密碼即可登入。 |
| 5 | 登入端點 | 無 rate limit，可無限次暴力嘗試。 |
| 6 | `composables/useApi.ts` | 無 `onResponseError`；session 過期後各頁面各自出錯，不會導回 `/login`。 |
| 7 | `middleware/auth.ts` / `pages/login.vue` | 導向 `/login` 時遺失原路徑，登入後固定回 `/`。 |
| 8 | `stores/useAuthStore.ts` | `logout()` 以 `.catch(() => null)` 吞掉錯誤並仍設 `authenticated=false`（假登出）；`login()` 對 401 與 5xx 一律顯示相同錯誤。 |
| 9 | `tests/` | 無任何 auth 相關測試。 |

## Scope

### In Scope

1. **Login route 防禦**（`server/api/auth/login.post.ts`）
   - body 驗證：`password` 缺少或非 string → `400 Bad Request`。
   - 使用 `useRuntimeConfig(event)`。
   - 密碼比對改為 timing-safe：雙方先做 SHA-256 digest 再 `crypto.timingSafeEqual`，避免長度不同時提前 return。
   - 比對邏輯抽成純函式 `verifyPassword(input, expected)`，放在 `server/utils/auth.ts`。

2. **啟動時設定斷言**（新增 `server/plugins/assert-config.ts`）
   - Nitro plugin 於 server 啟動時讀取 `useRuntimeConfig().authPassword`；若為空或長度 < 32 → `throw new Error(...)`，讓程序啟動失敗。
   - `nuxt build` 不執行 Nitro plugin，因此 CI build 不受影響；只有 `node .output/server/index.mjs` / `pnpm dev` 啟動時檢查。

3. **登入 rate limit**
   - In-memory `Map<ip, { count, windowStart }>`，每 IP 每 60 秒最多 5 次嘗試（成功或失敗皆計）。
   - 超過 → `429 Too Many Requests`，附 `Retry-After` header（秒）。
   - 邏輯抽成 `createRateLimiter({ limit, windowMs })` 純函式，放在 `server/utils/auth.ts`；login route 以 module-level singleton 使用。
   - IP 來源：`getRequestIP(event, { xForwardedFor: true })`，取不到時以 `'unknown'` 為 key。

4. **全域 401 攔截**（`composables/useApi.ts`）
   - `$fetch.create` 加入 `onResponseError`：status 401 且 `import.meta.client` 且目前 route 不是 `/login` 時，呼叫 `authStore.reset()`（只清本地狀態，不打 logout API）並 `navigateTo({ path: '/login', query: { redirect: <current fullPath> } })`。
   - Server-side 執行（SSR）不攔截，避免 SSR 期間 navigateTo 副作用。

5. **Redirect 保留與 open-redirect 防護**
   - `middleware/auth.ts` 未登入時導向 `/login?redirect=<to.fullPath>`。
   - `pages/login.vue` 登入成功後讀取 `route.query.redirect`；只接受以 `/` 開頭且不以 `//` 開頭的相對路徑，否則回 `/`。
   - 路徑判斷抽成純函式 `resolveSafeRedirect(raw: unknown): string`，放在 `utils/auth.ts`（前端 utils，可被 Vitest 直接 import）。

6. **`useAuthStore` 誠實回報**
   - `login(password)`：HTTP 401 → `error = 'Invalid password'`；HTTP 429 → `error = 'Too many attempts, try again later'`；其他錯誤 → `error = 'Server error, please try again'`。回傳 `boolean`。
   - `logout()`：呼叫 logout API 失敗時**保持** `authenticated = true`、設定 `error`、回傳 `false`；成功才設 `authenticated = false` 並回傳 `true`。
   - 新增 `reset()`：僅清本地 `authenticated` / `error`，供 401 攔截使用。
   - `components/AppTopBar.vue` 的 logout 呼叫依 `logout()` 回傳值決定是否 `navigateTo('/login')`；失敗時不導頁。

7. **測試**（Vitest）
   - `tests/serverAuthUtils.test.ts`：`verifyPassword`（相同/不同/長度不同/空字串）、`createRateLimiter`（第 6 次拒絕、`retryAfterSec` 正確、視窗過期後重置、不同 IP 互不影響）。
   - `tests/authRedirect.test.ts`：`resolveSafeRedirect` 各種輸入。
   - `tests/useAuthStore.test.ts`：mock `$fetch`，驗證 login 401 / 429 / 500 訊息、logout 失敗保持 authenticated、`reset()`。

### Out of Scope

- 更換 session 機制或 nuxt-auth-utils 版本。
- 多使用者 / 角色權限。
- Redis 或其他外部 rate-limit store（Railway 目前單一 instance，in-memory 足夠）。
- `server/api/arbiter/[...].ts` proxy 的強化（另一 feature `proxy-hardening`）。
- Login 頁 UI 改版；僅在既有錯誤區塊顯示新訊息。
- CSRF token（session cookie 已由 nuxt-auth-utils 設 `SameSite=Lax`，且 login POST 僅接受 JSON body）。

## Architecture Decision

- **純函式抽離**：`verifyPassword` / `createRateLimiter` 放 `server/utils/auth.ts`。Nitro 會 auto-import `server/utils/*`，同時 Vitest 可用相對路徑直接 import，不需 mock Nitro runtime。
- **SHA-256 normalize 再 timingSafeEqual**：`timingSafeEqual` 要求等長 buffer；先對雙方做 `createHash('sha256')` 可讓長度固定為 32 bytes，避免以長度差異提前 return 洩漏資訊。
- **Rate limit 設計**：fixed window（非 sliding）以維持 KISS；Map 於每次 `hit()` 時順手清除過期 entry，避免記憶體無限成長。限制常數 `limit=5`、`windowMs=60_000` 寫在 login route 建立 limiter 處，不放 runtimeConfig（YAGNI）。
- **啟動斷言用 Nitro plugin 而非 nuxt.config hook**：plugin 只在 runtime 執行，不會讓 CI `pnpm build` 因缺 env 失敗；`.env.example` 已提供 ≥ 32 字元 placeholder。
- **401 攔截放在 `useApi` 而非 route middleware**：session 過期多發生在頁面已載入後的 API 呼叫，route middleware 攔不到；`useApi` 是所有 `/api/arbiter/*` 呼叫的唯一入口。攔截時只 `reset()` 本地狀態，不呼叫 logout API（session 已無效，呼叫也會 401）。
- **`reset()` 與 `logout()` 分離**：`logout()` 必須真的成功才清狀態；`reset()` 給「伺服器已判定未登入」的情境用。兩者語意不同，不合併。
- **Open-redirect 規則**：只接受 `startsWith('/') && !startsWith('//')` 且不含 `\`；不做白名單，因為 app 路由會持續增加。

## Acceptance Criteria

See `tasks.md`.
