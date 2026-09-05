# Tasks: Auth Hardening

## Feature ID
`auth-hardening`

> **Retry #1（2026-09-05）**：codex adversarial review 回報 no-ship（8 Major / 3 Minor）。
> 本檔的 Task 程式碼片段已更新為實作後的實際樣貌（原本是 SA 草稿），
> AC 亦重新依「行為」分組並補上 retry 新增的項目。變更摘要見文末〈Retry #1 修正對照〉。

---

## Task 1 — Server auth utils（純函式）

**File:** `server/utils/auth.ts`、`server/utils/constantTime.ts`（皆為新增）

```ts
// server/utils/constantTime.ts
import { timingSafeEqual } from 'node:crypto'

export function bufferEquals(a: Buffer, b: Buffer): boolean {
  return timingSafeEqual(a, b)
}
```

```ts
// server/utils/auth.ts（節錄）
export const MIN_SECRET_LENGTH = 32
// Retry #2：由「完全相等的 Set」改為「片段比對」。原本大小寫一變、尾端多一個換行
// 就整個失效，而那正是 placeholder 實際外流的樣子。
export const PLACEHOLDER_SECRET_FRAGMENTS: readonly string[] = [
  'replace-me-with-openssl-rand-hex-32-output',
  'change-me-at-least-32-characters-long',
  'change-me',
  'replace-me',
  'your-secret-here',
]

export function isPlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return PLACEHOLDER_SECRET_FRAGMENTS.some((fragment) => normalized.includes(fragment))
}

export function verifyLoginPassword(input: string, expected: string): boolean {
  return bufferEquals(sha256(input), expectedDigest(expected))
}

export function assertStrongSecret(name: string, value: unknown): void // 長度 + placeholder
export function isIpAddress(value: string): boolean
export function clientIpFromForwardedFor(header: string | undefined | null): string | undefined
export function createRateLimiter(opts: {
  limit: number
  windowMs: number
  maxKeys?: number
}): RateLimiter
export function resetExpectedDigestCache(): void // 測試 seam
```

Rate limiter 的三個實作重點：

1. **不是每次 `hit()` 都掃 Map**。原設計每次請求都走一遍全表（O(n)），
   正好是攻擊者灌爆的那個端點最不該有的複雜度。改為每個 window 最多掃一次；
   撐過清掃的舊 bucket 由 `now - windowStart >= windowMs` 的 staleness 檢查重啟，
   計數不會跨 window 累積。
2. **`maxKeys` 上限（預設 10,000）**。表滿且找不到既有 bucket 時 **fail closed**
   （回 `allowed: false`），因為「悄悄停止 rate limit 的登入端點」比「短暫不可用」更糟。
   Retry #2 拿掉了這條路徑上原本的「強制再掃一次」：那是一次 O(maxKeys) 全表掃描，
   而表一旦滿了，攻擊者每送一個請求就能觸發一次 —— 正好是第 1 點的節流要擋掉的成本。
   節流的那次清掃是唯一的回收路徑，最壞情況下表也只會滿一個 window。
   **fail closed 維持不變**（Human Gate 已核可的失敗方向）。
3. **`size` getter**。讓測試能直接觀察 bucket 數，而不是只能從 `allowed` 反推。

`constantTime.ts` 獨立成檔的理由見 spec 的 AD「timing-safe 測試 seam」。

### AC — 密碼驗證與 rate limit（AC-1.x）

- [x] AC-1.1: Given 相同字串／正確密碼，When `verifyLoginPassword(a, a)` 或 POST `/api/auth/login`，Then 回 `true` /
      `{ ok: true }` 並建立 session。
- [x] AC-1.2: Given 不同字串（含長度不同、任一方為空字串），When 呼叫，Then 回 `false` 且不拋錯；
      經由 route 時回 401 且**不**建立 session。
- [x] AC-1.3: Given `createRateLimiter({ limit: 5, windowMs: 60_000 })`，When 同一 key 在同一視窗內 `hit` 5 次，
      Then 每次 `allowed === true`。
- [x] AC-1.4: Given 同上，When 第 6 次 `hit`／第 6 次 POST，Then `allowed === false`／HTTP 429，
      且 `Retry-After` 介於 1 到 60（視窗邊緣不得回 0）。密碼正確與否不影響。
- [x] AC-1.5: Given key 已被拒絕，When `now` 超過 `windowStart + windowMs`，Then 重新 `allowed === true`；
      **即使期間沒有觸發任何清掃**也一樣（staleness 檢查獨立於 sweep）。
- [x] AC-1.6: Given 兩個不同 key／兩個不同來源 IP，When 其中一個超過 limit，Then 另一個不受影響。
- [x] AC-1.7: Given 50 個已過期的 bucket，When 下一次 `hit()` 觸發清掃，Then `limiter.size` 由 50 降為 1 ——
      測試直接觀察 Map 大小，不是只看 `allowed`。
- [x] AC-1.8: Given `maxKeys` 已滿且所有 bucket 都還在視窗內，When 以新 key `hit()`，
      Then 回 `allowed === false`（fail closed）且 `limiter.size` 不再成長。
- [x] AC-1.9: Given `verifyLoginPassword`，When 比對任何一對密碼，Then 一定經過 `bufferEquals`
      （`node:crypto.timingSafeEqual`），且兩側皆為 32 bytes。
      **把函式主體換成 `return input === expected` 必須讓本 AC 失敗**。
- [x] AC-1.10: Given 同一個 `expected`，When 連續多次呼叫，Then 期望值的 digest 為同一個 Buffer 實例
      （只雜湊一次）；`expected` 改變時重新雜湊。
- [x] AC-1.11: Given body 為空、非 JSON、缺少 `password`、`password` 非字串或為空字串，
      When POST `/api/auth/login`，Then 回 **400**（不是 500，也不得因 `authPassword` 恰為空字串而登入成功）。
- [x] AC-1.12: Given 同一 IP 已用盡視窗額度，When 第 6 次送出**格式錯誤**的 body，Then 回 429 而非 400 ——
      rate limit 必須排在 body 驗證之前，格式錯誤的請求也要計數。
- [x] AC-1.13:（程式碼檢視）login route 內不存在以 `===` / `!==` 直接比對密碼，
      且 `useRuntimeConfig` 有傳入 `event`。
- [x] AC-1.14: Given `maxKeys` 已滿，When 以新 key 連續 `hit()`，Then 每次都回 `allowed === false`，
      且**不觸發清掃** —— 即使表內已有過期的 bucket，也要等節流允許的下一次清掃才回收。
      （測試以 `maxKeys: 3` 與跨兩個 window 的時間軸觀察：容量路徑上 `size` 不因過期 bucket 而下降。）
- [x] AC-1.15: Given `bufferEquals` 直接被呼叫，When 兩個內容相同但物件不同的 Buffer、內容不同但等長的 Buffer、
      以及**長度不同**的 Buffer，Then 分別回 `true`、`false`、**拋 `RangeError`**。
      長度不同時拋錯是關鍵案例：`===`、`.equals()`、`Buffer.compare()` 都只會安靜地回 `false`，
      只有 `node:crypto.timingSafeEqual` 會拒絕 —— 這排除了本模組存在目的所要防的每一種捷徑寫法。
  - **不是用 spy 驗證的原因**：Vite 會把 Node builtin externalise，`vi.mock('node:crypto')` 攔不到
    （實測 factory 的 stub 被忽略、真函式照跑）；module namespace 物件是凍結的，`vi.spyOn` 會拋
    `Cannot redefine property`；改動 CJS `require('crypto')` 的屬性則對 ESM named export 不可見。
    要讓 spy 成立必須在整個測試設定裡 alias `node:crypto`，波及範圍遠大於這一條斷言的價值。

### AC — Client 位址解析（AC-2.x）

- [x] AC-2.1: Given `X-Forwarded-For: 1.2.3.4, 5.6.7.8`，When 解析，Then 取**最右側**的 `5.6.7.8`
      （proxy 是 append，最右側才是離我們最近的那一跳寫的）。單一條目、前後空白皆正確處理。
- [x] AC-2.2: Given header 不存在、為空、最右側條目不是 IP（`not-an-ip`、`for=1.2.3.4`、`localhost` 等），
      When 解析，Then 回 `undefined`，讓呼叫端 fallback，而不是拿垃圾當 bucket key。
- [x] AC-2.3: Given 攻擊者每次送出不同的偽造前綴（`X-Forwarded-For: <random>, 5.6.7.8`），When 連續 POST 6 次，
      Then 第 6 次仍回 429 —— 偽造前綴不能換到新的 bucket。反之，兩個**真正不同**的最右側位址必須分到不同 bucket。
- [x] AC-2.4: Given header 是垃圾但 socket 位址可取得，When POST，Then 以 socket 位址（`getRequestIP(event)`）計數。
- [x] AC-2.5: Given 完全取不到任何位址，When POST，Then 落到共用的 `'unknown'` bucket
      （Human Gate 已核可：共用 bucket 是安全的失敗方向）。

### AC — Secret 設定（AC-3.x）

- [x] AC-3.1: Given `NUXT_AUTH_PASSWORD` 長度 ≥ 32 且不是 placeholder，When 呼叫 `assertStrongSecret` /
      啟動 Nitro，Then 不拋錯、正常啟動。
- [x] AC-3.2: Given 值為 `undefined`、`null`、非字串、空字串或長度 < 32，When 檢查，
      Then 拋錯，訊息含 `at least 32 characters`。
- [x] AC-3.3: Given 值等於 `.env.example` 的 placeholder（含已淘汰的舊 placeholder），When 檢查，
      Then 拋錯並提示 `openssl rand -hex 32` —— placeholder 長度 ≥ 32，只靠長度檢查會放行一個公開已知的密碼。
- [x] AC-3.4: Given 任一檢查失敗，When 讀取錯誤訊息，Then 訊息包含出問題的變數名
      （`NUXT_AUTH_PASSWORD` / `NUXT_SESSION_PASSWORD`）。
- [x] AC-3.5: Given 伺服器完全沒有設定 `authPassword`（runtimeConfig 為空字串），When POST 任意密碼，
      Then 回 **401**，不得建立 session。
- [x] AC-3.6: Given `nuxt-auth-utils` 已把 `session.password` 放進 runtimeConfig，When 啟動，
      Then 一併以同一規則檢查；Given runtimeConfig 沒有 `session`、`session` 非物件、或 `session` 內沒有 `password`，
      Then 跳過該檢查（不對自己不擁有的設定形狀報錯）。
- [x] AC-3.7: Given 環境完全沒有 `NUXT_AUTH_PASSWORD`，When 執行 `pnpm build`，Then build 成功
      （Nitro plugin 不在 build 期執行）。
- [x] AC-3.8: Given placeholder 的大小寫變體、前後有空白／換行、前後接了其他字（`prod-replace-me-...`、
      `change-me-at-least-32-characters-long-production`），When 檢查，Then 一律拋錯。
      Given 一個真的隨機 secret（openssl hex、長 passphrase），Then 放行。
  - **這道檢查的範圍就到這裡**：它擋的是「複製了範例檔卻忘了改」，不是「刻意挑一個弱密碼的維運者」。
    任何不在清單上的短密碼只要長度 ≥ 32 就會通過（已寫成一條測試把這個界線記在案上）。
    不要把它描述成能防禦刻意繞過。

---

## Task 2 — Login route 防禦

**File:** `server/api/auth/login.post.ts`

```ts
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 })

export default defineEventHandler(async (event) => {
  // 刻意不用 getRequestIP(event, { xForwardedFor: true })：h3 取的是最左側，
  // 那是 client 自己寫的，攻擊者只要每次換一個假前綴就能拿到全新 bucket。
  const ip =
    clientIpFromForwardedFor(getRequestHeader(event, 'x-forwarded-for')) ??
    getRequestIP(event) ??
    'unknown'
  const gate = limiter.hit(ip)
  if (!gate.allowed) {
    setHeader(event, 'Retry-After', gate.retryAfterSec)
    throw createError({ statusCode: 429, message: 'Too many attempts' })
  }

  const body = await readBody<unknown>(event).catch(() => null)
  // ...缺 password / 非字串 / 空字串 → 400
  const config = useRuntimeConfig(event)
  if (!verifyLoginPassword(password, config.authPassword)) {
    throw createError({ statusCode: 401, message: 'Invalid password' })
  }
  await setUserSession(event, { user: { role: 'admin' } })
  return { ok: true }
})
```

**AC：** AC-1.1、AC-1.2、AC-1.4、AC-1.6、AC-1.11、AC-1.12、AC-1.13、AC-2.3、AC-2.4、AC-2.5、AC-3.5。

**測試：** `tests/loginRoute.test.ts`（19 個案例；以 `vi.stubGlobal` 補齊 h3 auto-import，
`vi.resetModules()` 讓每個案例拿到乾淨的 module-level limiter）。

---

## Task 3 — 啟動時設定斷言

**File:** `server/plugins/assert-config.ts`（新增）

```ts
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  assertStrongSecret('NUXT_AUTH_PASSWORD', config.authPassword)

  const session: unknown = (config as Record<string, unknown>).session
  if (session && typeof session === 'object' && 'password' in session) {
    assertStrongSecret('NUXT_SESSION_PASSWORD', (session as { password: unknown }).password)
  }
})
```

**AC：** AC-3.1、AC-3.2、AC-3.3、AC-3.6、AC-3.7。

**測試：** `tests/assertConfigPlugin.test.ts`（12 個案例）。

---

## Task 4 — 前端 redirect 純函式

**File:** `utils/auth.ts`（新增；Nuxt 會 auto-import `utils/*`）

```ts
// 同一組檢查，跑在原始輸入與正規化後的輸出上。
function isRootedRelativePath(value: string): boolean {
  if (!value.startsWith('/')) return false
  if (value.startsWith('//')) return false
  if (value.includes(BACKSLASH)) return false
  if (hasControlChars(value)) return false // C0 + DEL
  return true
}

/** `/login` in any casing, with or without the trailing slash. */
function isLoginPath(pathname: string): boolean {
  const lower = pathname.toLowerCase()
  return lower === '/login' || lower === '/login/'
}

export function resolveSafeRedirect(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback
  if (!isRootedRelativePath(raw)) return fallback

  let url: URL
  try {
    url = new URL(raw, PARSE_BASE)
  } catch {
    return fallback
  }
  if (url.origin !== PARSE_BASE) return fallback

  const normalized = `${url.pathname}${url.search}${url.hash}`
  if (!isRootedRelativePath(normalized)) return fallback
  if (isLoginPath(url.pathname)) return fallback

  return normalized
}
```

先 **normalise 再判斷**：`..` 與 `%2e%2e` 對瀏覽器來說都是路徑片段，
字面比對 `startsWith('/login')` 會把 `/settings/%2e%2e/login` 放行，
使用者按下登入後又被丟回表單。控制字元要在解析前擋掉，因為 URL parser 會直接
把 tab / LF / CR 抽掉，`/<LF>/evil.com` 會被摺成 protocol-relative 的 `//evil.com`。

**Retry #2 的關鍵修正：檢查必須跑兩次。** retry #1 只在解析「之前」檢查一次，
於是正規化本身變成了攻擊面：`new URL('/a/%2e%2e//evil.com', PARSE_BASE).pathname`
是 `//evil.com`，一個 protocol-relative 目標，而輸入 `/a/%2e%2e//evil.com` 完全通過
前置檢查。`url.origin !== PARSE_BASE` 這道檢查在這個情境下**永遠不會擋到它** ——
輸入是相對路徑，origin 恆等於 base。（該檢查仍保留，作為 `URL` 行為異常時的縱深防禦，
但不能倚賴它擋下這一類。）所以正規化後的字串要重跑一次完整的 `isRootedRelativePath`。
`/login` 的比對同時改為 case-insensitive：Vue Router 的路由比對不分大小寫，
`/LOGIN` 會走到同一個頁面，字面比對 `=== '/login'` 卻放行它。

### AC（AC-4.x）

- [x] AC-4.1: Given `'/decisions?limit=10'`，When 呼叫，Then 原樣回傳；query 與 hash 經過 normalise 後保留。
- [x] AC-4.2: Given `'https://evil.com'`、`'//evil.com'`、含反斜線的路徑、`'javascript:alert(1)'`、空字串、
      `undefined`、`null`、陣列、數字、物件，When 呼叫，Then 回 `'/'`。
- [x] AC-4.3: Given `'/login'`、`'/login/'`、`'/login?redirect=/x'`、`'/login#anchor'`、`'/login/#anchor'`，
      When 呼叫，Then 回 `'/'`。
- [x] AC-4.4: Given `'/settings/%2e%2e/login'`、`'/settings/%2E%2E/login'`、`'/settings/../login'`、
      `'/a/b/.%2e/%2e./login'`，When 呼叫，Then 回 `'/'`；Given `'/settings/%2e%2e/decisions'`，
      Then 回 normalise 後的 `'/decisions'`。
- [x] AC-4.5: Given 路徑含 C0 控制字元或 DEL（LF、CR、tab、NUL、VT…），When 呼叫，Then 回 `'/'`。
- [x] AC-4.6: Given URL 解析拋錯或解析結果落在其他 origin，When 呼叫，Then 回 `'/'` 而非拋出例外。
      （以 stub `URL` 強制觸發：實測沒有任何以 `/` 開頭的字串能讓 WHATWG parser 拋錯，但防禦保留。）
- [x] AC-4.7: Given `'/a/%2e%2e//evil.com'`、`'/a/%2E%2E//evil.com'`、`'/a/..//evil.com'`、
      `'/%2e%2e//evil.com'`、`'/settings/%2e%2e/%2e%2e//evil.com'`，When 呼叫，Then 回 `'/'`。
      這些輸入都通過解析前的檢查，卻在正規化後變成 protocol-relative 的 `//evil.com`；
      本 AC 存在的意義就是釘住「正規化後要重新檢查一次」。
- [x] AC-4.8: Given `'/LOGIN'`、`'/Login'`、`'/lOgIn/'`、`'/LOGIN?redirect=/x'`、
      `'/settings/%2e%2e/LogIn'`，When 呼叫，Then 回 `'/'`（`/login` 比對不分大小寫）。

---

## Task 5 — Middleware 帶 redirect、Login 頁回原路徑

**File:** `middleware/auth.ts`、`pages/login.vue`

Retry #2 變更：`check()` 現在回傳三態，middleware 改為只認 `'authenticated'`。

```ts
// 只要不是明確確認過的 session，就送回表單。`unknown` 代表探測根本沒拿到答案，
// 而一個「檢查失敗就放行」的守衛不是守衛。注意這裡和 401 攔截器的差別：
// 這裡決定的是要不要**放人進來**，所以 fail closed；那裡決定的是要不要**把人登出**，
// 所以必須拿到明確的否定答案。
const outcome = await authStore.check()
if (outcome !== 'authenticated') {
  return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
}
```

### AC（AC-5.x）

- [x] AC-5.1: Given 未登入，When 直接開啟 `/decisions?limit=10`，Then 導向 `/login?redirect=%2Fdecisions%3Flimit%3D10`。
  - 實測 `Location` 為 `/login?redirect=/decisions?limit=10`（Vue Router 不會對 query value 內的 `/` 與 `?`
    做 percent-encode）。以 `URLSearchParams` 解析後得到 `/decisions?limit=10`，與 AC 期望的目標路徑相同，
    僅字面編碼不同。
- [x] AC-5.2: Given 在 `/login?redirect=/decisions` 登入成功，When 登入完成，Then 導向 `/decisions`。
- [x] AC-5.3: Given 在 `/login?redirect=https://evil.com` 登入成功，When 登入完成，Then 導向 `/`。
- [x] AC-5.4: Given 在 `/login`（無 redirect）登入成功，When 登入完成，Then 導向 `/`（維持現行行為）。
- [x] AC-5.5: Given 探測因網路錯誤或 5xx 而回 `'unknown'`，When middleware 執行，
      Then 仍導向 `/login?redirect=<原 fullPath>`（fail closed）。

---

## Task 6 — useAuthStore 誠實回報

**File:** `stores/useAuthStore.ts`、`components/AppTopBar.vue`

retry #1 的唯一變更：`login()` 的 catch 開頭加上 `authenticated.value = false`。
`middleware/auth.ts:5` 會在 `authenticated` 為真時直接放行、跳過伺服器檢查，
所以一次被拒絕的登入若留下舊的 `true`，等於把錯密碼變成 client 端通行證。

**Retry #2：`check()` 由 boolean 改為三態，並把探測的收斂與時序都收進 store。**

```ts
export type CheckOutcome = 'authenticated' | 'unauthenticated' | 'unknown'

// 放在 store 的 setup closure 內，不是 module scope：Nuxt SSR 下 module-level
// 狀態是跨請求共用的，一個訪客的探測會回答到另一個訪客身上。Pinia 每個請求
// 各自建立 store 實例，closure 才是這份狀態正確的生命週期。
let generation = 0
let pendingProbe: Promise<CheckOutcome> | null = null
let signOutClaimedAt = -1
```

三件事分別解掉三個問題：

1. **`'unknown'`**：舊版把網路錯誤與 5xx 一律當成「沒登入」。只有明確的否定答案
   （401 或 `{ ok: false }`）才算未登入；探測本身失敗時什麼都不做，把判斷讓給呼叫端。
2. **`pendingProbe` 收斂**：一連串 401 共用同一個請求。放在 store 而非各自的 `useApi()`
   實例裡，跨實例的 401 才會收斂成一次。
3. **`generation` 世代戳記**：`login()`（成功與失敗都算）與成功的 `logout()` 會把世代 +1。
   探測開始時記下世代，回來時若世代已變，結果就是過期的，直接丟棄回 `'unknown'`，
   不寫入 `authenticated` —— 一個慢探測不能把使用者剛建立的新 session 清掉。
   `claimSignOut()` 也以世代為鍵，所以同一個世代內只會登出一次，而下一次登入／登出自動釋放。

### AC（AC-6.x）

- [x] AC-6.1: Given login API 回 401，When 呼叫 `login()`，Then 回 `false`、`error === 'Invalid password'`、
      `authenticated === false`。
- [x] AC-6.2: Given login API 回 429，When 呼叫 `login()`，Then `error === 'Too many attempts, try again later'`。
- [x] AC-6.3: Given login API 回 500 或根本沒有 status 的網路錯誤，When 呼叫 `login()`，
      Then `error === 'Server error, please try again'`。
- [x] AC-6.4: Given `authenticated === true` 且 logout API 失敗，When 呼叫 `logout()`，
      Then 回 `false`、`authenticated` 仍為 `true`、`error` 非 null。
- [x] AC-6.5: Given logout API 成功，When 呼叫 `logout()`，Then 回 `true`、`authenticated === false`。
- [x] AC-6.6: Given `authenticated === true`，When 呼叫 `reset()`，Then `authenticated === false`、
      `error === null`，且**不**發出任何 HTTP 請求。
- [x] AC-6.7: Given TopBar logout 失敗，When 使用者按 Logout，Then 停留在原頁面且不導向 `/login`。
- [x] AC-6.8: Given `authenticated === true`（先成功登入過），When 之後一次 `login()` 以 401 / 429 / 500 失敗，
      Then `authenticated` 必須被清為 `false`，不得留下過期的 `true`。
- [x] AC-6.9: Given `/api/auth/check` 回 401 或 `{ ok: false }`，When 呼叫 `check()`，
      Then 回 `'unauthenticated'` 且 `authenticated === false`。
- [x] AC-6.10: Given `/api/auth/check` 因網路失敗、500、502、504 或無 status 的錯誤而失敗，When 呼叫 `check()`，
      Then 回 `'unknown'`，且 `authenticated` **維持原值不被更動**（探測失敗不是任何事情的證據）。
- [x] AC-6.11: Given 三個同時發生的 `check()`，When 探測仍在進行，Then 只發出一次 `$fetch`，三者拿到同一個結果；
      前一次探測完成後，下一次 `check()` 會重新發出請求（不是永久快取）。
- [x] AC-6.12: Given 一個仍在進行中的探測，When 期間發生 `login()` 或 `logout()`，Then 探測回來時回 `'unknown'`
      並**不寫入** `authenticated` —— 過期的結果不得覆蓋新的 session 狀態。
- [x] AC-6.13: Given 同一個世代內，When 連續呼叫 `claimSignOut()`，Then 只有第一次回 `true`；
      經過一次成功的 `login()` 後再呼叫，Then 又回 `true`（世代前進即釋放）。

---

## Task 7 — useApi 全域 401 攔截

**File:** `composables/useApi.ts`

`/api/arbiter/*` 的 401 有兩個互不相干的來源：我們自己的 session 過期，
或上游 API 拒絕了一個我們本來就有權發出的請求。第二種情況把使用者登出是錯的，
而 response 本身分不出來 —— 所以先問伺服器（`authStore.check()`），確認 session
真的沒了才清狀態。同一個探測也順帶解掉「慢請求的 401 在使用者重新登入後才抵達」
的競態。多個同時發生的 401 會被收斂成一次探測、一次 reset、一次導頁。

修正完全自我涵蓋在 `composables/useApi.ts` 內，沒有動 proxy route。

### AC（AC-7.x）

- [x] AC-7.1: Given 已登入且 session 於伺服器端失效，When 任一頁面透過 `useApi` 呼叫得到 401，
      Then 導向 `/login?redirect=<原 fullPath>` 且呼叫 `authStore.reset()`。
- [x] AC-7.2: Given 目前在 `/login`，When 收到 401，Then 不觸發 navigateTo（避免迴圈）；
      Given 探測期間使用者已自行走到 `/login`，Then 探測回來後也不導頁、不 reset。
- [x] AC-7.3: Given SSR 期間的 `useApi` 呼叫收到 401，When 執行，Then 不呼叫 `navigateTo`、不修改 store
      （由 `middleware/auth.ts` 處理）。
  - **Retry #2 補上了驗證**（此前一直是本 spec 唯一未勾選的項目）。做法不是去改
    `nuxt-import-meta-flags` plugin，而是把「要不要處理這個 401」的決策抽成純函式
    `shouldHandleUnauthorized({ status, isClient, path })`，`isClient` 由參數傳入。
    攔截器唯一的職責變成把 `import.meta.client === true` 餵進去。純函式的兩個分支
    都直接測得到，SSR 分支不再需要 plugin 配合。攔截器測試也以 `vi.stubGlobal` 綁進
    **真正的**這個函式（而非 stub），所以兩邊不會各說各話。
- [x] AC-7.4: Given 非 401 的錯誤（400 / 403 / 404 / 429 / 500 / 503），When 收到，
      Then 不探測、不 reset、不導頁，錯誤照常 throw 給呼叫端。
- [x] AC-7.5: Given 上游回 401 但 `authStore.check()` 回 `true`（我們的 session 仍有效），When 收到 401，
      Then **不**登出、**不**導頁。
- [x] AC-7.6: Given 一個延遲抵達的 401，且探測完成時 session 已重新建立，When 探測回傳 `true`，
      Then 不清除任何狀態。
- [x] AC-7.7: Given 4 個請求同時回 401，When 攔截器處理，Then `check()`、`reset()`、`navigateTo()` 各只發生一次。
      Retry #2 補強：**跨不同 `useApi()` 實例**的 401 也只會導頁一次
      （收斂狀態移到 store，由 `claimSignOut()` 把關）。
- [x] AC-7.8: Given 收到 401 但探測回 `'unknown'`（探測本身失敗），When 攔截器處理，
      Then **不** reset、**不**導頁。與 AC-5.5 的 middleware 行為刻意相反：
      登出是破壞性的方向，只有明確的否定答案才動手。

---

## Task 8 — 測試

| File | 內容 |
| --- | --- |
| `tests/serverAuthUtils.test.ts` | AC-1.1–1.10、AC-1.14、AC-2.1、AC-2.2、AC-3.1–3.4、AC-3.8（67 cases） |
| `tests/constantTime.test.ts` | AC-1.15（4 cases，retry #2 新增） |
| `tests/loginRoute.test.ts` | AC-1.1、1.2、1.4、1.6、1.11、1.12、AC-2.3–2.5、AC-3.5（19 cases） |
| `tests/assertConfigPlugin.test.ts` | AC-3.1–3.3、AC-3.6（12 cases） |
| `tests/authRedirect.test.ts` | AC-4.1–4.8（50 cases） |
| `tests/authMiddleware.test.ts` | AC-5.1、AC-5.5（5 cases） |
| `tests/loginRedirect.test.ts` | AC-5.2–5.4（6 cases） |
| `tests/useAuthStore.test.ts` | AC-6.1–6.6、AC-6.8–6.13（29 cases） |
| `tests/useApiAuthInterceptor.test.ts` | AC-7.1–7.8（24 cases） |
| `tests/appTopBarLogout.test.ts` | AC-6.7（2 cases） |

### AC（AC-8.x）

- [x] AC-8.1: Given 上述測試檔，When 執行 `pnpm test`，Then 全部通過。
- [x] AC-8.2: Given `pnpm test:coverage`，When 檢視本功能碰過的檔案，Then statements 覆蓋率 ≥ 80%；
      `server/api/auth/login.post.ts` 與 `server/plugins/assert-config.ts` 不得為 0%。
- [x] AC-8.3: Given 完成後，When 執行 `pnpm lint:check` 與 `pnpm vue-tsc`，Then 無錯誤、無 `any`、無 `console.log`。

---

## Definition of Done

- Task 1–8 的 AC 全部勾選。（Retry #2 補上了 AC-7.3，本 spec 已無未勾選項目。）
- `pnpm lint:check`、`pnpm vue-tsc`、`pnpm test:coverage`、`pnpm build` 全部通過。
- 手動驗證（本機 `pnpm dev` 或等價的 build 產物腳本）：錯密碼 5 次後第 6 次顯示 rate-limit 訊息；
  登入後刪除 cookie 再操作任一頁面會回到 `/login?redirect=...`；登入後回到原頁。
- `handoff-dev.json` 列出所有 `changed_files`。

---

## Retry #1 修正對照（2026-09-05）

| # | Review 指出 | 修正 | 新 AC |
| --- | --- | --- | --- |
| 1 | XFF 取最左側，可偽造前綴繞過 rate limit | 改取最右側並驗證是否為 IP | AC-2.1–2.5 |
| 2 | `.env.example` 的 placeholder 通過長度斷言 | `PLACEHOLDER_SECRETS` 明確拒絕 | AC-3.3 |
| 3 | Map 無上限且每次 hit 都 O(n) 掃描 | `maxKeys` + 每 window 掃一次 + fail closed | AC-1.7、AC-1.8 |
| 4 | 登入失敗未清 `authenticated`，middleware 會跳過伺服器檢查 | catch 開頭 `authenticated.value = false` | AC-6.8 |
| 5 | 401 攔截把上游 401 誤判為 session 過期 | 先 `authStore.check()` 探測再決定（僅改 `useApi.ts`） | AC-7.5–7.7 |
| 6 | login route 與 assert-config 行為覆蓋率 0% | 新增兩個測試檔，兩者皆 100% | AC-8.2 |
| 7 | 密碼測試無法證明用了 timing-safe 原語 | 抽出 `constantTime.ts` 作為 mock seam；改成 `===` 會讓測試失敗 | AC-1.9 |
| 8 | Map 清理測試看不到清理發生 | 加 `size` getter，直接斷言 50 → 1 | AC-1.7 |
| 9 | `resolveSafeRedirect` 未 normalise、漏掉 `/login` 變形與控制字元 | 先解析再判斷，補控制字元檢查 | AC-4.4–4.6 |
| 10 | （降級為 Minor）重複雜湊 expected | 加一格 memo，註解寫明理由是省重複工，不是防洩漏 | AC-1.10 |

---

## 驗證紀錄（Developer retry #1, 2026-09-05）

| Gate | 指令 | 結果 |
| --- | --- | --- |
| Lint | `pnpm lint:check` | exit 0；0 errors / 10 warnings（皆為既有的 `vue/no-static-inline-styles`，不在本次變更檔案中） |
| Types | `pnpm vue-tsc` | exit 0 |
| Tests | `pnpm test:coverage` | exit 0；20 files / 311 tests 全數通過 |
| Build | `pnpm build` | exit 0，`Build complete!`，4.84 MB（1.07 MB gzip） |

覆蓋率實測（All files）：statements 49.80 / branches 85.43 / functions 70.25 / lines 49.80。
依 ratchet 規則（實測向下取整減 2，只升不降），`vitest.config.ts` 門檻由
46 / 81 / 65 / 46 調升為 **47 / 83 / 68 / 47** 並重新驗證通過。

單檔覆蓋率：`server/utils/auth.ts` 100%、`server/utils/constantTime.ts` 100%、
`server/api/auth/login.post.ts` **100%**（retry 前 0/24 行）、
`server/plugins/assert-config.ts` **100%**（retry 前 0/8 行）、
`utils/auth.ts` 100%、`middleware/auth.ts` 100%、
`stores/useAuthStore.ts` statements 100% / branches 85.71、`composables/useApi.ts` statements 100%。

AC-5.x 與 AC-3.7 沿用 retry 前以 build 產物（`node .output/server/index.mjs`）跑的 14 項 runtime 檢查；
本次未改動 `middleware/auth.ts` 與 `pages/login.vue`，該批驗證仍然成立。

---

## Retry #2 修正對照（2026-09-05）

codex adversarial review 第二輪：1 P0 / 3 P1 / 3 P2。

| # | 嚴重度 | Review 指出 | 修正 | 新 AC |
| --- | --- | --- | --- | --- |
| 1 | P0 | retry #1 的 `resolveSafeRedirect` 正規化後會產出 protocol-relative 目標；`url.origin !== PARSE_BASE` 對相對路徑輸入是死碼 | 抽出 `isRootedRelativePath`，在正規化**之後**重跑一次完整檢查；`/login` 比對改為 case-insensitive | AC-4.7、AC-4.8 |
| 2 | P1 | `check()` 把網路錯誤與 5xx 當成「已登出」 | 回傳 `CheckOutcome` 三態；只有 401 / `{ ok: false }` 算未登入，其餘回 `'unknown'` 且不動 `authenticated` | AC-6.9、AC-6.10、AC-5.5、AC-7.8 |
| 3 | P1 | 探測收斂只在單一 `useApi()` 實例內；慢探測回來會覆蓋新 session | 收斂與世代戳記移進 store（setup closure），過期結果直接丟棄 | AC-6.11、AC-6.12、AC-6.13、AC-7.7 |
| 4 | P1 | 容量路徑無視 `lastSweep` 節流，表滿時每個請求都觸發 O(maxKeys) 全表掃描 | 移除該路徑上的第二次清掃，直接回 429；**fail closed 維持不變** | AC-1.14 |
| 5 | P2 | `constantTime.ts` 沒有被直接測到 | 新增 `tests/constantTime.test.ts`，以行為釘住委派（詳見 AC-1.15 的說明；spy `node:crypto` 在本專案不可行，已實證） | AC-1.15 |
| 6 | P2 | AC-7.3 長期未勾選 | 抽出純函式 `shouldHandleUnauthorized({ status, isClient, path })`，兩個分支都直接測；**未改動 vitest transform** | AC-7.3（補勾） |
| 7 | P2 | placeholder 比對是完全相等，大小寫或空白一變就失效 | 先 trim + lowercase，改為片段比對；同時把「只擋複製貼上、不擋刻意繞過」寫成測試與文件 | AC-3.8 |

---

## 驗證紀錄（Developer retry #2, 2026-09-05）

| Gate | 指令 | 結果 |
| --- | --- | --- |
| Lint | `pnpm lint:check` | exit 0；0 errors / 10 warnings（皆為既有的 `vue/no-static-inline-styles`，不在本次變更檔案中） |
| Types | `pnpm vue-tsc` | exit 0 |
| Tests | `pnpm test` | exit 0；**21 files / 361 tests** 全數通過（retry #1 為 20 files / 311 tests） |
| Coverage | `pnpm test:coverage` | exit 0，門檻調升後仍通過 |
| Build | `pnpm build` | exit 0，`Build complete!`，4.85 MB（1.07 MB gzip） |
| Format | `npx prettier --check`（12 個變更檔） | `All matched files use Prettier code style!` |

覆蓋率實測（All files）：statements 50.18 / branches 86.06 / functions 71.00 / lines 50.18。
依 ratchet 規則（實測向下取整減 2，只升不降），`vitest.config.ts` 門檻由
47 / 83 / 68 / 47 調升為 **48 / 84 / 69 / 48** 並重新驗證通過。

單檔覆蓋率：`server/utils/auth.ts` 100%、`server/utils/constantTime.ts` 100%、
`server/api/auth/login.post.ts` 100%、`server/plugins/assert-config.ts` 100%、
`utils/auth.ts` **100 / 100 / 100 / 100**、`middleware/auth.ts` 100%、
`stores/useAuthStore.ts` lines 100 / branches 91.89（retry #1 為 85.71）。

AC-5.x 與 AC-3.7 沿用 retry 前以 build 產物（`node .output/server/index.mjs`）跑的 14 項 runtime 檢查；
本次未改動 `pages/login.vue`，`middleware/auth.ts` 的改動只在「拿到非 `'authenticated'` 時導頁」，
導頁的目標與 query 未變，該批驗證仍然成立。
