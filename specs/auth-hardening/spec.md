# Spec: Auth Hardening

## Feature ID
`auth-hardening`

## Summary

強化 Nuxt 端的密碼登入流程：修正 `server/api/auth/login.post.ts` 的輸入驗證與 timing-safe 密碼比對、於 Nitro 啟動時斷言 `NUXT_AUTH_PASSWORD` 已正確設定、加入登入 rate limit、在 `useApi` 攔截 401 導回登入頁並保留原路徑、讓 `useAuthStore` 誠實回報 logout 失敗與區分錯誤類型，並補上 Vitest 測試。

## Source doc

- SA 評估報告（本次 session 產出）P0 #1「login route 缺乏防禦」與 P0 #4「401 未全域攔截、logout 假成功」。
- 現況程式碼：`server/api/auth/login.post.ts`、`server/api/auth/logout.post.ts`、`middleware/auth.ts`、`stores/useAuthStore.ts`、`pages/login.vue`、`composables/useApi.ts`。
- `specs/auth-hardening/review-codex-1.md`（codex adversarial review，verdict no-ship，驅動 retry #1）。

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

### Retry #1 追加問題（codex review）

| # | 位置 | 問題 |
|---|------|------|
| 10 | login route | 以 h3 的 `getRequestIP(event, { xForwardedFor: true })` 取 IP，那是**最左側**、由 client 自行填寫的條目；每次換一個假前綴即可取得全新 rate-limit bucket。 |
| 11 | `.env.example` / 啟動斷言 | placeholder 本身長度 ≥ 32，長度檢查放行；以 placeholder 部署等同公開已知密碼。 |
| 12 | rate limiter | Map 無筆數上限，且每次 `hit()` 都全表掃描（O(n)）—— 正好在被灌爆的端點上。 |
| 13 | `stores/useAuthStore.ts` | `login()` 失敗未清 `authenticated`；`middleware/auth.ts:5` 見到殘留的 `true` 會跳過伺服器檢查。 |
| 14 | `composables/useApi.ts` | 把上游 API 的 401 一律當成自己的 session 過期，造成假登出；慢請求的 401 也會踢掉剛重新登入的 session。 |
| 15 | `tests/` | `login.post.ts`（0/24 行）與 `assert-config.ts`（0/8 行）完全沒有行為覆蓋；密碼測試無法分辨 timing-safe 比對與 `===`；Map 清理測試看不到清理發生。 |
| 16 | `utils/auth.ts` | `resolveSafeRedirect` 以字面前綴判斷，`/settings/%2e%2e/login` 與 `/login/` 均會放行；控制字元未擋，URL parser 會把 tab/LF/CR 抽掉並摺成 `//evil.com`。 |

## Scope

### In Scope

1. **Login route 防禦**（`server/api/auth/login.post.ts`）
   - body 驗證：`password` 缺少或非 string → `400 Bad Request`。
   - 使用 `useRuntimeConfig(event)`。
   - 密碼比對改為 timing-safe：雙方先做 SHA-256 digest 再 `crypto.timingSafeEqual`，避免長度不同時提前 return。
   - 比對邏輯抽成純函式 `verifyLoginPassword(input, expected)`，放在 `server/utils/auth.ts`。

2. **啟動時設定斷言**（`server/plugins/assert-config.ts`）
   - Nitro plugin 於 server 啟動時檢查 `authPassword`：非字串、長度 < 32、或等於已知 placeholder → `throw`，讓程序啟動失敗。
   - `nuxt-auth-utils` 若已把 `session.password` 放進 runtimeConfig，一併以同一規則檢查。
   - `nuxt build` 不執行 Nitro plugin，因此 CI build 不受影響。

3. **登入 rate limit**
   - In-memory `Map<ip, { count, windowStart }>`，每 IP 每 60 秒最多 5 次嘗試（成功或失敗皆計）。
   - 超過 → `429 Too Many Requests`，附 `Retry-After` header（秒）。
   - `createRateLimiter({ limit, windowMs, maxKeys })` 純函式，放在 `server/utils/auth.ts`；login route 以 module-level singleton 使用。
   - IP 來源：`X-Forwarded-For` 的**最右側**條目（須通過 IP 格式檢查），取不到時退回 `getRequestIP(event)`，再取不到時以 `'unknown'` 為 key。

4. **全域 401 攔截**（`composables/useApi.ts`）
   - `$fetch.create` 加入 `onResponseError`：status 401 且 `import.meta.client` 且目前 route 不是 `/login` 時，先以 `authStore.check()` 向伺服器確認 session 是否真的失效；確認失效才 `authStore.reset()` 並 `navigateTo({ path: '/login', query: { redirect: <current fullPath> } })`。
   - 同時間的多個 401 收斂成一次探測、一次 reset、一次導頁。
   - Server-side 執行（SSR）不攔截，避免 SSR 期間 navigateTo 副作用。

5. **Redirect 保留與 open-redirect 防護**
   - `middleware/auth.ts` 未登入時導向 `/login?redirect=<to.fullPath>`。
   - `pages/login.vue` 登入成功後讀取 `route.query.redirect`，交由 `resolveSafeRedirect` 判斷。
   - `resolveSafeRedirect(raw: unknown): string` 放在 `utils/auth.ts`：先擋掉絕對 URL / protocol-relative / 反斜線 / 控制字元，再以 WHATWG URL **normalise**，最後才判斷 origin 與是否為 `/login` 的任一變形。

6. **`useAuthStore` 誠實回報**
   - `login(password)`：401 → `'Invalid password'`；429 → `'Too many attempts, try again later'`；其他 → `'Server error, please try again'`。任何失敗都必須把 `authenticated` 清為 `false`。
   - `logout()`：呼叫失敗時**保持** `authenticated = true`、設定 `error`、回傳 `false`。
   - `reset()`：僅清本地狀態，供 401 攔截使用。
   - `components/AppTopBar.vue` 依 `logout()` 回傳值決定是否導頁。

7. **測試**（Vitest）—— 見 `tasks.md` Task 8 的檔案／AC 對照表。

### Out of Scope

- 更換 session 機制或 nuxt-auth-utils 版本。
- 多使用者 / 角色權限。
- Redis 或其他外部 rate-limit store（Railway 目前單一 instance，in-memory 足夠）。
- `server/api/arbiter/[...].ts` proxy 的強化（另一 feature `proxy-hardening`）。retry #1 的 401 修正刻意完全留在 `composables/useApi.ts` 內，不跨越 branch 邊界。
- Login 頁 UI 改版；僅在既有錯誤區塊顯示新訊息。
- CSRF token（session cookie 已由 nuxt-auth-utils 設 `SameSite=Lax`，且 login POST 僅接受 JSON body）。

## Architecture Decision

- **純函式抽離**：`verifyLoginPassword` / `createRateLimiter` / `assertStrongSecret` / `clientIpFromForwardedFor` 放 `server/utils/auth.ts`。Nitro 會 auto-import `server/utils/*`，同時 Vitest 可用相對路徑直接 import，不需 mock Nitro runtime。
- **SHA-256 normalize 再 timingSafeEqual**：`timingSafeEqual` 要求等長 buffer；先對雙方做 `createHash('sha256')` 可讓長度固定為 32 bytes，避免以長度差異提前 return 洩漏資訊。
- **timing-safe 測試 seam（`server/utils/constantTime.ts`）**：Vitest 無法從「來源模組」的角度 mock Node 內建模組 —— `vi.mock('node:crypto')` 只會替換測試檔自己的 binding，來源模組拿到的仍是真貨（實測 spy 呼叫數為 0）；`vi.spyOn(nodeCrypto, 'timingSafeEqual')` 則直接拋 `TypeError: Cannot redefine property`（namespace 已封裝）。因此把 `timingSafeEqual` 包成單行的第一方模組，讓測試有地方掛 spy。代價是多一個檔案，換來的是「把 `verifyLoginPassword` 改成 `return input === expected` 會讓測試失敗」這個可執行的保證；剩下未被驗證的部分只有那一行 wrapper，用眼睛看得完。
- **Rate limit 設計**：fixed window（非 sliding）以維持 KISS。清掃改為**每個 window 最多一次**而非每次 `hit()`（每次掃描是 O(bucket 數)，對被灌爆的端點是錯的複雜度）；跨 window 的正確性由 `now - windowStart >= windowMs` 的 staleness 檢查保證，與清掃無關。另設 `maxKeys`（預設 10,000）上限，表滿時強制清掃一次，仍滿則 **fail closed**：悄悄停止計數的登入端點比短暫不可用更糟。限制常數 `limit=5`、`windowMs=60_000` 寫在 login route 建立 limiter 處，不放 runtimeConfig（YAGNI）。
- **XFF 取最右側**：proxy 是把自己看到的位址 **append** 上去，所以最右側才是離我們最近、client 無法偽造的那一跳（Railway edge 即為此行為）。h3 的 `getRequestIP(event, { xForwardedFor: true })` 取最左側，那完全由 client 決定。最右側條目還要通過 IP 格式檢查，否則不採用，避免拿任意字串當 bucket key。三段 fallback：XFF 最右側 → socket 位址 → 共用的 `'unknown'`（Human Gate 核可：共用 bucket 是安全的失敗方向）。
- **Placeholder 明確列黑名單**：`.env.example` 的 placeholder 是公開字串，長度也 ≥ 32，只檢查長度等於放行一個人人都知道的密碼。`PLACEHOLDER_SECRETS` 同時保留已淘汰的舊 placeholder，讓照舊版範例部署的環境也會被擋下。`.env.example` 本身的值也改成一眼看得出不能用的字串，並在註解寫明啟動會斷言。
- **啟動斷言用 Nitro plugin 而非 nuxt.config hook**：plugin 只在 runtime 執行，不會讓 CI `pnpm build` 因缺 env 失敗。`session.password` 只在 runtimeConfig 真的有該欄位時才檢查，避免對自己不擁有的設定形狀報錯。
- **401 攔截放在 `useApi` 而非 route middleware**：session 過期多發生在頁面已載入後的 API 呼叫，route middleware 攔不到；`useApi` 是所有 `/api/arbiter/*` 呼叫的唯一入口。
- **401 先探測再登出**：`/api/arbiter/*` 的 401 有兩個來源 —— 自己的 session 過期，或上游 API 拒絕了一個我們本來就有權發的請求。response 本身分不出來，所以先 `authStore.check()` 問伺服器；只有伺服器也說沒登入才清狀態。這同時解掉「慢請求的 401 在使用者重新登入後才抵達」的競態，且探測回來後會重讀 route，避免在使用者已自行走到 `/login` 時又導一次。整個修正自我涵蓋在 `composables/useApi.ts`，沒有動 proxy route。
- **`reset()` 與 `logout()` 分離**：`logout()` 必須真的成功才清狀態；`reset()` 給「伺服器已判定未登入」的情境用。兩者語意不同，不合併。
- **登入失敗必須清 `authenticated`**：`middleware/auth.ts:5` 在 `authenticated` 為真時直接放行、不做伺服器檢查，所以被拒絕的登入若留下殘值，等於把錯密碼變成 client 端通行證。
- **實作偏離（D1）**：函式名由 spec 的 `verifyPassword` 改為 `verifyLoginPassword`。`nuxt-auth-utils` 已 auto-import 一個語意不同的 `verifyPassword(hash, plain)`（scrypt 驗證），同名會在全域 auto-import 造成 `Duplicated imports` 警告與靜默覆蓋。
- **實作偏離（D2, retry #1）**：新增 `server/utils/constantTime.ts`。交辦指示只要求「證明用了 timing-safe 原語」，未指定作法；在不新增檔案的前提下無法在 Vitest 中觀測到 `node:crypto` 的呼叫（證據見上方 AD）。
- **Open-redirect 規則**：不做白名單（app 路由會持續增加），改為「先過濾再 normalise 再判斷」：絕對 URL / `//` 開頭 / 含反斜線 / 含 C0 控制字元或 DEL 一律退回 fallback；通過後以 WHATWG URL 對相對 base 解析，重新確認 origin 未跑掉，最後才比對 `pathname` 是否為 `/login` 或 `/login/`。控制字元必須在解析**前**擋掉，因為 URL parser 會直接把 tab/LF/CR 抽掉，`/<LF>/evil.com` 會被摺成 protocol-relative 的 `//evil.com`。

## Acceptance Criteria

See `tasks.md`.

## Coverage 實測（Developer retry #1, 2026-09-05）

`pnpm test:coverage`（20 test files / 311 tests 全數通過）All files：

| Metric | 實測 | 調整後門檻 |
| --- | --- | --- |
| statements | 49.80 | 47 |
| branches | 85.43 | 83 |
| functions | 70.25 | 68 |
| lines | 49.80 | 47 |

依 tooling-baseline AD-6 的 ratchet 規則（實測向下取整減 2，只升不降），
`vitest.config.ts` 門檻由 46 / 81 / 65 / 46 調升為上表數值。

retry #1 前後對照：新增的兩個測試檔把 `server/api/auth/login.post.ts`（原 0/24 行）與
`server/plugins/assert-config.ts`（原 0/8 行）都推到 100%，這是 All files 由 48.59 升到 49.80、
functions 由 67.58 升到 70.25 的主因。
