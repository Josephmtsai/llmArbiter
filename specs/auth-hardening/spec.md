# Spec: Auth Hardening

## Feature ID
`auth-hardening`

## Summary

強化 Nuxt 端的密碼登入流程：修正 `server/api/auth/login.post.ts` 的輸入驗證與 timing-safe 密碼比對、於 Nitro 啟動時斷言 `NUXT_AUTH_PASSWORD` 已正確設定、加入登入 rate limit、在 `useApi` 攔截 401 導回登入頁並保留原路徑、讓 `useAuthStore` 誠實回報 logout 失敗與區分錯誤類型，並補上 Vitest 測試。

## Source doc

- SA 評估報告（本次 session 產出）P0 #1「login route 缺乏防禦」與 P0 #4「401 未全域攔截、logout 假成功」。
- 現況程式碼：`server/api/auth/login.post.ts`、`server/api/auth/logout.post.ts`、`middleware/auth.ts`、`stores/useAuthStore.ts`、`pages/login.vue`、`composables/useApi.ts`。
- `specs/auth-hardening/review-codex-1.md`（codex adversarial review，verdict no-ship，驅動 retry #1）。
- `specs/auth-hardening/review-codex-2.md`（第二輪 review，1 P0 / 3 P1 / 3 P2，驅動 retry #2）。

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

### Retry #2 追加問題（codex review 第二輪）

| # | 嚴重度 | 位置 | 問題 |
|---|--------|------|------|
| 17 | **P0** | `utils/auth.ts` | retry #1 的修正只在解析**前**檢查一次，於是正規化本身成了攻擊面：`new URL('/a/%2e%2e//evil.com', PARSE_BASE).pathname` 是 `//evil.com`，而輸入 `/a/%2e%2e//evil.com` 完全通過前置檢查。`url.origin !== PARSE_BASE` 對相對路徑輸入恆為 false，在這個情境下是死碼，擋不到它。另外 `/login` 為大小寫敏感比對，`/LOGIN` 走到同一個頁面卻會放行。 |
| 18 | P1 | `stores/useAuthStore.ts` | `check()` 把網路錯誤與 5xx 一律歸為「已登出」。探測失敗不是任何事情的證據，卻會觸發登出。 |
| 19 | P1 | `composables/useApi.ts` | 探測的收斂狀態放在 `useApi()` 的閉包裡，不同實例各有一份；跨實例的 401 會重複探測、重複導頁。慢探測回來時也沒有時序判斷，會覆蓋使用者剛重新建立的 session。 |
| 20 | P1 | rate limiter | 容量已滿的路徑無視 `lastSweep` 節流，直接強制全表掃描；表一滿，攻擊者每個請求都能觸發一次 O(maxKeys) —— 正是節流本來要擋的成本。 |
| 21 | P2 | `tests/` | `server/utils/constantTime.ts` 只被當作 mock seam，本身沒有任何直接測試。 |
| 22 | P2 | `tasks.md` | AC-7.3（SSR 分支）長期掛著未勾選，以「測試環境限制」結案。 |
| 23 | P2 | `server/utils/auth.ts` | placeholder 比對是完全相等，大小寫、前後空白、附加字尾任一發生就完全失效。 |

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
   - 同時間的多個 401 收斂成一次探測、一次 reset、一次導頁，**跨不同 `useApi()` 實例亦然**（收斂狀態放在 store）。
   - 只有 `check()` 回 `'unauthenticated'` 才登出；回 `'unknown'`（探測本身失敗）時什麼都不做。
   - Server-side 執行（SSR）不攔截，避免 SSR 期間 navigateTo 副作用。判斷抽成純函式 `shouldHandleUnauthorized({ status, isClient, path })`，兩個分支皆可測。

5. **Redirect 保留與 open-redirect 防護**
   - `middleware/auth.ts` 未登入時導向 `/login?redirect=<to.fullPath>`。
   - `pages/login.vue` 登入成功後讀取 `route.query.redirect`，交由 `resolveSafeRedirect` 判斷。
   - `resolveSafeRedirect(raw: unknown): string` 放在 `utils/auth.ts`：先擋掉絕對 URL / protocol-relative / 反斜線 / 控制字元，再以 WHATWG URL **normalise**，接著對**正規化後的結果重跑同一組檢查**（正規化會產生新的 protocol-relative 目標），最後才比對 `pathname` 是否為 `/login` 的任一變形（不分大小寫）。

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
- **timing-safe 測試 seam（`server/utils/constantTime.ts`）**：Vitest 無法從「來源模組」的角度 mock Node 內建模組 —— `vi.mock('node:crypto')` 只會替換測試檔自己的 binding，來源模組拿到的仍是真貨（實測 spy 呼叫數為 0）；`vi.spyOn(nodeCrypto, 'timingSafeEqual')` 則直接拋 `TypeError: Cannot redefine property`（namespace 已封裝）。因此把 `timingSafeEqual` 包成單行的第一方模組，讓測試有地方掛 spy。代價是多一個檔案，換來的是「把 `verifyLoginPassword` 改成 `return input === expected` 會讓測試失敗」這個可執行的保證；剩下未被驗證的部分只有那一行 wrapper。**（retry #2）** 那一行現在也有了自己的測試 `tests/constantTime.test.ts`，以行為而非 spy 釘住委派 —— 作法與不得已的理由見下方 D7。
- **Rate limit 設計**：fixed window（非 sliding）以維持 KISS。清掃改為**每個 window 最多一次**而非每次 `hit()`（每次掃描是 O(bucket 數)，對被灌爆的端點是錯的複雜度）；跨 window 的正確性由 `now - windowStart >= windowMs` 的 staleness 檢查保證，與清掃無關。另設 `maxKeys`（預設 10,000）上限，表滿且找不到既有 bucket 時 **fail closed**：悄悄停止計數的登入端點比短暫不可用更糟。**（retry #2 修正）** 這條路徑原本會「強制清掃一次再重試」，但那等於在表滿之後把節流整個讓開 —— 攻擊者每送一個請求就能買到一次 O(maxKeys) 全表掃描。改為不掃、直接回 429：節流的那次清掃是唯一的回收路徑，最壞情況下表也只會滿一個 window。fail closed 的方向不變。限制常數 `limit=5`、`windowMs=60_000` 寫在 login route 建立 limiter 處，不放 runtimeConfig（YAGNI）。
- **XFF 取最右側**：proxy 是把自己看到的位址 **append** 上去，所以最右側才是離我們最近、client 無法偽造的那一跳（Railway edge 即為此行為）。h3 的 `getRequestIP(event, { xForwardedFor: true })` 取最左側，那完全由 client 決定。最右側條目還要通過 IP 格式檢查，否則不採用，避免拿任意字串當 bucket key。三段 fallback：XFF 最右側 → socket 位址 → 共用的 `'unknown'`（Human Gate 核可：共用 bucket 是安全的失敗方向）。
- **Placeholder 片段比對**：`.env.example` 的 placeholder 是公開字串，長度也 ≥ 32，只檢查長度等於放行一個人人都知道的密碼。清單同時保留已淘汰的舊 placeholder，讓照舊版範例部署的環境也會被擋下。`.env.example` 本身的值也改成一眼看得出不能用的字串，並在註解寫明啟動會斷言。**（retry #2 修正）** 原本的 `PLACEHOLDER_SECRETS: ReadonlySet<string>` 是完全相等比對，大小寫一變、複製時多帶一個換行、或有人在後面補一個字就整個失效 —— 而那正是 placeholder 實際外流的樣子。改為 `PLACEHOLDER_SECRET_FRAGMENTS` 陣列加上 `isPlaceholderSecret()`：先 `trim().toLowerCase()`，再以 `includes` 做片段比對，同時把 `change-me` / `replace-me` / `your-secret-here` 這幾個常見詞根納入。**這道檢查的範圍僅止於「複製了範例檔卻忘了改」**：任何不在清單上的弱密碼只要長度 ≥ 32 都會通過，它擋不住、也不宣稱能擋住刻意繞過的維運者。這個界線本身寫成了一條測試，免得日後被誤讀成更強的保證。
- **啟動斷言用 Nitro plugin 而非 nuxt.config hook**：plugin 只在 runtime 執行，不會讓 CI `pnpm build` 因缺 env 失敗。`session.password` 只在 runtimeConfig 真的有該欄位時才檢查，避免對自己不擁有的設定形狀報錯。
- **401 攔截放在 `useApi` 而非 route middleware**：session 過期多發生在頁面已載入後的 API 呼叫，route middleware 攔不到；`useApi` 是所有 `/api/arbiter/*` 呼叫的唯一入口。
- **401 先探測再登出**：`/api/arbiter/*` 的 401 有兩個來源 —— 自己的 session 過期，或上游 API 拒絕了一個我們本來就有權發的請求。response 本身分不出來，所以先 `authStore.check()` 問伺服器；只有伺服器也說沒登入才清狀態。這同時解掉「慢請求的 401 在使用者重新登入後才抵達」的競態，且探測回來後會重讀 route，避免在使用者已自行走到 `/login` 時又導一次。整個修正自我涵蓋在 `composables/useApi.ts`，沒有動 proxy route。
- **`check()` 回傳三態，不是 boolean（retry #2）**：`CheckOutcome = 'authenticated' | 'unauthenticated' | 'unknown'`。舊版把網路錯誤與 5xx 都摺進 `false`，於是「問不到答案」和「答案是否定的」變成同一件事，探測失敗會把人登出。現在只有明確的否定（401 或 `{ ok: false }`）算未登入；探測本身失敗回 `'unknown'`，且**不寫入** `authenticated`。同一個 `'unknown'` 在兩處刻意得到相反的處理：`middleware/auth.ts` 決定的是要不要**放人進來**，所以 fail closed（導回 `/login`）；401 攔截器決定的是要不要**把人登出**，那是破壞性的方向，所以要求明確的否定答案才動手。這個不對稱是設計，不是疏漏，兩邊的註解都寫明了。
- **探測狀態放 store，且以世代戳記防過期（retry #2）**：`pendingProbe` 收斂與 `generation` 計數器移進 `useAuthStore` 的 setup closure。放在 store 而不是各自的 `useApi()` 實例，跨實例的 401 才會收斂成一次探測、一次導頁（`claimSignOut()` 以世代為鍵把關）。`login()`（成功與失敗都算）與成功的 `logout()` 會把世代 +1；探測開始時記下世代，回來時若世代已變就回 `'unknown'` 並丟棄結果，一個慢探測因此不可能清掉使用者剛建立的新 session。**刻意不用 module-level 變數**（即使交辦文字是這麼寫的）：Nuxt SSR 下 module scope 是跨請求共用的，一個訪客的探測會回答到另一個訪客身上；Pinia 每個請求各自建立 store 實例，setup closure 才是這份狀態正確的生命週期。
- **`reset()` 與 `logout()` 分離**：`logout()` 必須真的成功才清狀態；`reset()` 給「伺服器已判定未登入」的情境用。兩者語意不同，不合併。
- **登入失敗必須清 `authenticated`**：`middleware/auth.ts:5` 在 `authenticated` 為真時直接放行、不做伺服器檢查，所以被拒絕的登入若留下殘值，等於把錯密碼變成 client 端通行證。
- **實作偏離（D1）**：函式名由 spec 的 `verifyPassword` 改為 `verifyLoginPassword`。`nuxt-auth-utils` 已 auto-import 一個語意不同的 `verifyPassword(hash, plain)`（scrypt 驗證），同名會在全域 auto-import 造成 `Duplicated imports` 警告與靜默覆蓋。
- **實作偏離（D2, retry #1）**：新增 `server/utils/constantTime.ts`。交辦指示只要求「證明用了 timing-safe 原語」，未指定作法；在不新增檔案的前提下無法在 Vitest 中觀測到 `node:crypto` 的呼叫（證據見上方 AD）。
- **Open-redirect 規則**：不做白名單（app 路由會持續增加），改為「先過濾再 normalise 再判斷」：絕對 URL / `//` 開頭 / 含反斜線 / 含 C0 控制字元或 DEL 一律退回 fallback；通過後以 WHATWG URL 對相對 base 解析，重新確認 origin 未跑掉，最後才比對 `pathname` 是否為 `/login` 或 `/login/`。控制字元必須在解析**前**擋掉，因為 URL parser 會直接把 tab/LF/CR 抽掉，`/<LF>/evil.com` 會被摺成 protocol-relative 的 `//evil.com`。
- **同一組檢查必須跑兩次（retry #2，P0）**：retry #1 只在解析前檢查一次，結果正規化本身成了攻擊面 —— `new URL('/a/%2e%2e//evil.com', PARSE_BASE).pathname` 是 `//evil.com`，一個 protocol-relative 目標，而輸入完全通過了前置檢查。當時倚賴的 `url.origin !== PARSE_BASE` **在這個情境下永遠不會觸發**：輸入是相對路徑，origin 恆等於 base，那道檢查對這一類是死碼（實測確認）。修法是把檢查抽成 `isRootedRelativePath()`，對原始輸入與正規化後的輸出各跑一次。origin 檢查予以保留，作為 `URL` 行為異常時的縱深防禦，但不再是這一類的防線 —— 註解已寫明，以免下一個讀者再次誤信它。`/login` 的比對同時改為 case-insensitive：Vue Router 的路由比對不分大小寫，`/LOGIN` 會走到同一個頁面。
- **AC-7.3 改用純函式驗證，而非改動測試環境（retry #2）**：SSR 分支測不到的原因是 `vitest.config.ts` 的 `nuxt-import-meta-flags` plugin 會把 `import.meta.client` 文字替換成 `true`。動那個 plugin 的風險遠大於這一條 AC 的價值（它是全站 client/server 分支覆蓋率誠實與否的基礎）。改為把決策抽成純函式 `shouldHandleUnauthorized({ status, isClient, path })`，`isClient` 由參數傳入，兩個分支都直接測得到；攔截器唯一的職責變成把 `import.meta.client === true` 餵進去。攔截器測試以 `vi.stubGlobal` 綁進**真正的**這個函式而非 stub，兩邊不會各說各話。（`import.meta.client` 在 Nuxt 的型別是 `boolean | undefined`，所以是 `=== true` 而不是直接傳入。）
- **實作偏離（D6, retry #2）**：交辦指示寫的是「module-level singleton in the store」，實作放在 store 的 setup closure。理由見上方「探測狀態放 store」：module scope 在 SSR 下跨請求共用，會造成 session 狀態串台。行為上對 client 端完全相同，對 SSR 則是修正。
- **實作偏離（D7, retry #2）**：交辦指示要求「直接測試 `constantTime.ts`，spy `node:crypto` 的 `timingSafeEqual`」。**spy 在本專案不可行**，三種作法都實測失敗：(a) Vite 會把 Node builtin externalise，`vi.mock('node:crypto', factory)` 攔不到，factory 的 stub 被忽略、真函式照跑；(b) module namespace 物件是凍結的，`vi.spyOn(crypto, 'timingSafeEqual')` 拋 `Cannot redefine property`；(c) CJS 的 `require('crypto')` 物件雖可改，但改動對 ESM named export 不可見。唯一能讓 spy 成立的作法是在整個測試設定裡 alias `node:crypto`，波及範圍遠超這一條斷言。改為行為驗證：長度不同時拋 `RangeError`（`===`、`.equals()`、`Buffer.compare()` 都只會安靜回 `false`，只有真的 `timingSafeEqual` 會拒絕），加上「內容相同但物件不同 → true」，排除了這個 wrapper 存在目的所要防的每一種捷徑寫法。唯一仍無法以測試證明的是 timing 特性本身 —— 那本來就無法測，也正是這個模組只有一行的原因。

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

## Coverage 實測（Developer retry #2, 2026-09-05）

`pnpm test:coverage`（21 test files / 361 tests 全數通過）All files：

| Metric | 實測 | 調整後門檻 |
| --- | --- | --- |
| statements | 50.18 | 48 |
| branches | 86.06 | 84 |
| functions | 71.00 | 69 |
| lines | 50.18 | 48 |

依同一 ratchet 規則，`vitest.config.ts` 門檻由 47 / 83 / 68 / 47 調升為上表數值。

retry #2 前後對照：新增 50 個測試案例（311 → 361），主要落在
`stores/useAuthStore.ts`（branches 85.71 → **91.89**）、`utils/auth.ts`（維持 100/100/100/100，
但新增的 10 個 AC-4.7／AC-4.8 案例把正規化後的路徑釘住）、
以及新檔 `tests/constantTime.test.ts`。`server/utils/auth.ts`、`server/utils/constantTime.ts`、
`server/api/auth/login.post.ts`、`server/plugins/assert-config.ts`、`middleware/auth.ts`
維持 100%。

`stores/useAuthStore.ts` 未覆蓋的 3 個分支（第 4、69、87 行）是 SSR-only 的
`useRequestHeaders` 路徑與型別防禦性的 fallback，與 AC-7.3 同類型的環境限制，
但不涉及任何安全決策。
