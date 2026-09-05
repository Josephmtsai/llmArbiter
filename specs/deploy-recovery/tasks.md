# Tasks: Deploy Recovery

## Feature ID

`deploy-recovery`

> 修 production：(A) 啟動斷言把 `NUXT_AUTH_PASSWORD` 與 `NUXT_SESSION_PASSWORD` 綁在同一個
> 32 字元下限，導致 crashloop → 改 per-secret 下限（8 / 32）。
> (B) Railway healthcheck 打 `/` 拿到 302 → 新增 `/api/health` 並改指過去。
> 設計理由與 residual risks 見 `spec.md`。

---

## Task 1 — Per-secret 最低長度（純函式）

**File:** `server/utils/auth.ts`（修改）

```ts
/**
 * Minimum length for `NUXT_SESSION_PASSWORD`, and the default for any caller
 * that does not say otherwise. 32 is not ours to lower: nuxt-auth-utils uses
 * this value as the iron-webcrypto seal key and requires 32 characters itself.
 */
export const MIN_SECRET_LENGTH = 32

/**
 * Minimum length for `NUXT_AUTH_PASSWORD`. Deliberately lower than
 * MIN_SECRET_LENGTH: this one is a human-typed login password, and the login
 * endpoint is rate limited to 5 attempts per IP per minute
 * (`server/api/auth/login.post.ts`), which is what makes 8 defensible here.
 * That rate limiter is a load-bearing part of this number -- see spec
 * `deploy-recovery`, AD-2 and R-1/R-3.
 */
export const MIN_AUTH_PASSWORD_LENGTH = 8

export function assertStrongSecret(
  name: string,
  value: unknown,
  minLength: number = MIN_SECRET_LENGTH,
): void {
  // Measured after trim. The raw length would wave through a secret that is
  // mostly padding; at the old floor of 32 that took deliberate effort, at 8 it
  // is one stray copy-paste away. Only the *measurement* is trimmed -- the
  // stored value is left untouched, because trimming it would silently change
  // what an existing deployment has to type (spec R-2).
  if (typeof value !== 'string' || value.trim().length < minLength) {
    throw new Error(
      `${name} must be set and at least ${minLength} characters long. See .env.example.`,
    )
  }
  if (isPlaceholderSecret(value)) {
    throw new Error(
      `${name} is still set to the .env.example placeholder. ` +
        'Generate a real secret with: openssl rand -hex 32',
    )
  }
}
```

三個約束：

1. **預設值取嚴的那個（32）**。未來新增的呼叫端若忘記傳 `minLength`，拿到的是 32 而非 8。
2. **placeholder 檢查完全不動** —— 位置（長度之後）、實作、`PLACEHOLDER_SECRET_FRAGMENTS`
   內容都不變。它與長度是兩道獨立的閘門。
3. **`MIN_SECRET_LENGTH` 這個 export 名稱保留**，不改名、不刪除
   （`.nuxt/types/nitro-imports.d.ts` 的 auto-import 表引用它）。

### AC — Per-secret 下限（AC-1.x）

- [x] AC-1.1: Given `NUXT_AUTH_PASSWORD` 為 8–31 字元的非 placeholder 字串
      （逐一測 8、9、15、31），When 呼叫
      `assertStrongSecret('NUXT_AUTH_PASSWORD', v, MIN_AUTH_PASSWORD_LENGTH)`，Then **不拋錯**。
      這是本 feature 存在的理由：這些值在變更前全部會讓 process 啟動失敗。
- [x] AC-1.2: Given 值為 `undefined`、`null`、非字串（數字、物件）、空字串、
      或 1–7 字元的字串，When 以 `MIN_AUTH_PASSWORD_LENGTH` 檢查，Then 拋錯，
      訊息含 **`at least 8 characters long`**（不得再出現 `32`）且含變數名 `NUXT_AUTH_PASSWORD`。
- [x] AC-1.3: Given 值為 31 字元字串，When 以 `MIN_SECRET_LENGTH` 檢查
      （即 session 的路徑），Then **仍然拋錯**，訊息含 `at least 32 characters long`。
      **這條是防回歸的核心**：它保證「把 8 套到 session 上」會讓測試失敗。
- [x] AC-1.4: Given 值為 32 字元字串，When 以 `MIN_SECRET_LENGTH` 檢查，Then 不拋錯
      （邊界值：32 通過、31 不通過）。同理以 `MIN_AUTH_PASSWORD_LENGTH` 檢查時
      8 通過、7 不通過。
- [x] AC-1.5:（不變式）Given `assertStrongSecret` 只傳兩個參數（沿用預設），
      When 傳入 31 字元字串，Then 拋錯 —— 預設下限必須是 32，不是 8。
- [x] AC-1.6: Given `MIN_AUTH_PASSWORD_LENGTH` 與 `MIN_SECRET_LENGTH`，
      When 讀取，Then 分別為 `8` 與 `32`，且 `MIN_AUTH_PASSWORD_LENGTH < MIN_SECRET_LENGTH`。
- [x] AC-1.7:（trim，AD-4）Given 8 個空白 `'        '`、`'   \n\t  '`、
      以及 `'  abcd  '`（8 字元、trim 後 4），When 以 `MIN_AUTH_PASSWORD_LENGTH` 檢查，
      Then **拋長度錯誤**。Given `'  abcdefgh  '`（trim 後 8），Then 不拋錯。
      同一組行為在 `MIN_SECRET_LENGTH` 下同樣成立（32 個空白必須被拒）。
- [x] AC-1.8:（placeholder 不受影響）Given `PLACEHOLDER_SECRET_FRAGMENTS` 的任一值
      及其大小寫變體、前後空白／換行、附加前後綴，When 以
      **`MIN_AUTH_PASSWORD_LENGTH`**（較寬鬆的下限）檢查，Then 仍拋 `placeholder` 錯誤 ——
      放寬長度不得讓 placeholder 從長度閘門溜進來後又躲過第二道。
      特別涵蓋短片段 `'change-me'`（9 字元，在舊的 32 下限被長度擋掉，
      在新的 8 下限下**必須由 placeholder 檢查接手**）。
- [x] AC-1.9:（順序）Given 一個既太短**又**是 placeholder 的值（如 `'change'`，6 字元），
      When 檢查，Then 拋的是**長度**錯誤（長度閘門在前，行為與變更前一致）。
      > 修正：`'change'` 其實**不是** placeholder ——
      > `isPlaceholderSecret` 是拿 fragment 去 `includes` 受測值，
      > `'change'.includes('change-me')` 為 false。而在 8 的下限下，
      > 最短的 fragment `'change-me'`（9 字元）已經過得了長度閘門，
      > 所以「既太短又是 placeholder」在 auth 路徑上不存在。
      > 測試改以 `MIN_SECRET_LENGTH` + `'change-me'` 釘住閘門順序：
      > 該值同時 9 < 32 且為 placeholder，拋的必須是長度錯誤。
- [x] AC-1.10:（rate limiter 未受影響）Given `createRateLimiter({ limit: 5, windowMs: 60_000 })`，
      When 同一 key 在同一視窗內 `hit` 5 次，Then 皆 `allowed === true`；第 6 次
      `allowed === false` 且 `retryAfterSec` 介於 1–60。不同 key 互不影響；
      視窗過期後重新放行。**本 AC 存在的理由**：8 字元下限的可接受性建立在這個
      rate limiter 上（spec AD-2 / R-1），所以每次改動 `server/utils/auth.ts`
      都必須重新證明它沒被動到。
- [x] AC-1.11:（rate limiter 未受影響，route 層）Given 同一來源 IP，
      When 連續 POST `/api/auth/login` 6 次（密碼正確與否皆然、body 格式錯誤亦然），
      Then 第 6 次回 **429** 並帶 `Retry-After` header。

**測試：** `tests/serverAuthUtils.test.ts`（修改）、`tests/loginRoute.test.ts`（既有，AC-1.11 已涵蓋，
確認仍通過即可）。

> ⚠️ `tests/serverAuthUtils.test.ts:124` 現有斷言
> `/must be set and at least 32 characters long/` 搭配的案例含 `'a'.repeat(31)`。
> 31 字元在**預設下限**下仍應拋錯（AC-1.5），所以該案例可留在預設路徑；
> 但同一組 `it.each` 內的 `['an empty string', '']` 等案例若改走
> `MIN_AUTH_PASSWORD_LENGTH`，訊息會變成 `at least 8`。
> **必須把這組測試依「檢查用的下限」拆開**，不要只改正則讓它同時容納 8 和 32 ——
> 那會讓測試對「哪個 secret 套哪個下限」失去分辨力，正是 AC-1.3 要防的東西。

---

## Task 2 — 呼叫端各自傳入下限

**File:** `server/plugins/assert-config.ts`（修改）

```ts
import { assertStrongSecret, MIN_AUTH_PASSWORD_LENGTH, MIN_SECRET_LENGTH } from '../utils/auth'

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  // The login password is a human-typed secret behind a rate-limited endpoint,
  // so it gets the lower floor. The session password is nuxt-auth-utils'
  // encryption key and must stay at 32 -- the module requires it, and lowering
  // it here would push the failure into a runtime request instead.
  assertStrongSecret('NUXT_AUTH_PASSWORD', config.authPassword, MIN_AUTH_PASSWORD_LENGTH)

  const session: unknown = (config as Record<string, unknown>).session
  if (session && typeof session === 'object' && 'password' in session) {
    assertStrongSecret(
      'NUXT_SESSION_PASSWORD',
      (session as { password: unknown }).password,
      MIN_SECRET_LENGTH,
    )
  }
})
```

兩個下限**都明確傳入**（session 那個即使等於預設值也照寫）：讀這段程式的人不必翻到
`server/utils/auth.ts` 才知道兩者不同，而且日後改預設值不會默默改動 session 的行為。

### AC — 啟動斷言（AC-2.x）

- [x] AC-2.1: Given `runtimeConfig.authPassword` 為 8 字元的非 placeholder 字串
      且無 `session`，When 啟動 plugin，Then **不拋錯**（變更前會拋）。
- [x] AC-2.2: Given `authPassword` 為 7 字元、空字串、`undefined` 或非字串，
      When 啟動，Then 拋錯，訊息含 `NUXT_AUTH_PASSWORD` 與 `at least 8`。
- [x] AC-2.3: Given `authPassword` 合法（8 字元）且 `session.password` 為 **31 字元**，
      When 啟動，Then 拋錯，訊息含 `NUXT_SESSION_PASSWORD` 與 **`at least 32`**。
      **兩個下限必須在同一次啟動中各自生效** —— 這是本 task 的核心斷言。
- [x] AC-2.4: Given `authPassword` 為 8 字元、`session.password` 為 32 字元，
      兩者皆非 placeholder，When 啟動，Then 不拋錯。
- [x] AC-2.5: Given `authPassword` 或 `session.password` 為 placeholder（含大小寫變體、
      含 9 字元的短片段 `change-me`），When 啟動，Then 拋 `placeholder` 錯誤並提示
      `openssl rand -hex 32`（行為不變）。
- [x] AC-2.6: Given `session` 不存在、非物件、為 `null`、或內無 `password` 鍵，
      When 啟動，Then 跳過 session 檢查、不拋錯（行為不變）。
- [x] AC-2.7: Given 環境完全沒有 `NUXT_AUTH_PASSWORD`，When 執行 `pnpm build`，
      Then build 成功（Nitro plugin 不在 build 期執行，行為不變）。

**測試：** `tests/assertConfigPlugin.test.ts`（修改；既有的
`['too short', 'a'.repeat(31)]` 案例對 `NUXT_AUTH_PASSWORD` **不再成立**，
必須改為 7 字元，並新增一條 31 字元的 **session** 案例以覆蓋 AC-2.3）。

---

## Task 3 — Health 端點

**File:** `server/api/health.ts`（**新增**；review round 1 由 `health.get.ts` 改名）

```ts
/**
 * Railway's healthcheck target (`railway.toml`).
 *
 * It cannot be `/`: that route carries `definePageMeta({ middleware: 'auth' })`,
 * and `middleware/auth.ts` redirects an unauthenticated SSR request to /login,
 * which answers 302 -- Railway only accepts 2xx, so every deploy failed.
 *
 * This is a Nitro server route, so the app-side route middleware never runs for
 * it, and it is outside `/api/arbiter/**` so the proxy catch-all never sees it.
 *
 * The body is a fixed constant on purpose. This endpoint is unauthenticated, so
 * anything it reports -- env, version, uptime, upstream reachability -- is free
 * reconnaissance. It answers exactly one question: is this process alive.
 */
export default defineEventHandler(() => ({ status: 'ok' }))
```

**刻意不做的事：** 不讀 `useRuntimeConfig()`、不接受 query 參數、不檢查 session、
不探測上游 API、不回版本或 uptime。這是 liveness，不是 readiness
（把上游可達性綁進去，上游一抖動整個服務就會被 Railway 重啟）。

### AC — Health 端點（AC-3.x）

- [x] AC-3.1: Given **未登入**（不帶任何 cookie），When GET `/api/health`，
      Then 回 **200**，且**不是** 3xx —— 不得發生任何導向 `/login` 的行為。
- [x] AC-3.2: Given 同上，When 檢視回應，Then body 為 JSON `{ "status": "ok" }`。
- [x] AC-3.3: Given 帶著有效 session cookie，When GET `/api/health`，
      Then 回應與未登入時**完全相同**（端點不隨驗證狀態改變）。
- [x] AC-3.4:（不洩漏）Given 回應 body，When 以**相等**斷言比對，
      Then 恰好等於 `{ status: 'ok' }`，沒有任何額外的鍵。
      並額外斷言序列化後的字串不含 `NUXT_`、`apiKey`、`apiBaseUrl`、`authPassword`、
      `session`、`password`、以及 `runtimeConfig` 任何欄位的值。
      （以相等斷言為主、關鍵字黑名單為輔：黑名單擋不住沒想到的欄位。）
- [x] AC-3.5:（不被 catch-all 攔到）Given 路由表，When 請求 `/api/health`，
      Then 由 `server/api/health.ts` 處理，**不**進入 `server/api/arbiter/[...].ts`；
      回應不含 proxy 的錯誤形狀（`405 method-not-allowed` / `404 not-allowed` /
      `502 upstream-*`），也不需要上游 API 可達。
      （驗證方式：在**沒有** `NUXT_API_BASE_URL` / `NUXT_API_KEY` 可達上游的情況下
      仍回 200。）
- [~] AC-3.6: ~~Given POST / PUT / DELETE `/api/health`，When 請求，Then **不**回 200
      （`.get.ts` 只註冊 GET；預期 405）。~~
      **DEVIATION（review round 1，刻意不滿足此 AC）**：檔案改名為 `server/api/health.ts`，
      **任何 method 都回 200**。理由：
      > 1. `.get.ts` 下實測 `HEAD /api/health` 回 **404**（POST 亦然）。
      > 2. Railway 的[官方文件](https://docs.railway.com/guides/healthchecks)只寫
      >    「會查詢到收到任何 2xx」，**沒有記載探針用哪個 HTTP method**。整個 GET-only
      >    的限制因此建立在一個沒有依據的假設上；HEAD 又正是探針的慣例作法。
      > 3. 這個 handler 回固定常數、不碰 I/O、不讀組態、不持有狀態 ——
      >    **沒有 method 能擴大的表面**，「限縮 method 表面」在此保護不到任何東西。
      >
      > 拿一個保護不到東西的限制，換「探針一定打得中」，在 production 掛掉的當下
      > 明顯划算。以 `tests/e2e/health.e2e.test.ts` 對 built server 釘住
      > （GET / HEAD / POST / PUT / DELETE / OPTIONS 全部須 2xx）。見 spec R-10 與 AD-7。
- [x] AC-3.7: Given `/api/arbiter/health`（上游的那一條，經 proxy），When **未登入**請求，
      Then 仍回 **401** —— 新端點不得意外放寬 proxy 上 `health` 前綴的存取。
      這兩條路徑是不同的東西（spec 問題 B 的警示方塊）。

**測試：** `tests/healthEndpoint.test.ts`（**新增**）+ `tests/e2e/health.e2e.test.ts`（round 1 **新增**）。

- `tests/healthEndpoint.test.ts` 以與 `tests/assertConfigPlugin.test.ts` 相同的手法
  （`vi.stubGlobal('defineEventHandler', fn => fn)`）直接 import handler 並呼叫，覆蓋
  AC-3.2、AC-3.3、AC-3.4。
  > **review round 1 修正**：這個手法把 `defineEventHandler` 換成 identity，
  > 因此它**看不到** Nitro 的路由、method 比對、status code、header 與 catch-all 優先序 ——
  > 原本 15 個案例中有 9 個只是換句話重講同一條 body 相等斷言。已刪除那些空殼案例，
  > 只保留 2 條這個層級真正測得到的（body 恰好相等、完全不看 request）。
  > 刪掉的不是覆蓋範圍，是假的覆蓋範圍；真的那份由下面的 e2e 檔以真實請求接手。
- `tests/e2e/health.e2e.test.ts` 對 `node .output/server/index.mjs` 發真實 HTTP 請求，
  覆蓋 AC-3.1、AC-3.5、AC-3.6（依 DEVIATION 改為「任何 method 皆 2xx」）、AC-4.1，
  並額外斷言 GET 與 HEAD 皆無 `Set-Cookie`、`/` 仍為 302。
  AC-4.1 的作法是**從 `railway.toml` 讀出 `healthcheckPath` 再去請求那條路徑**，
  而不是拿它跟常數字串比對 —— 把它改回 `/` 或改成不存在的路徑，測試都會紅
  （已用手動 mutation 驗證：改回 `health.get.ts` 紅 6 條，改回 `/` 紅 2 條）。
- AC-3.7 需要 proxy 與上游，仍屬 runtime 驗證（見 DoD）。

---

## Task 4 — Railway 設定

**File:** `railway.toml`（修改）

```toml
[deploy]
startCommand = "node .output/server/index.mjs"
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

> `healthcheckTimeout` **維持 30**：spec AD-10 的「提高到 100」建議經 Human Gate
> 決議**未採納**（2026-09-05）。AC-4.2 只要求 ≥ 30，故仍通過。

### AC（AC-4.x）

- [x] AC-4.1: Given `railway.toml`，When 讀取 `healthcheckPath`，
      Then 值為 `"/api/health"`，且該路徑存在對應的 `server/api/health.ts`
      （路徑與檔案必須對得起來，不能只改其中一邊）。
- [x] AC-4.2: Given `railway.toml`，When 讀取 `healthcheckTimeout`，
      Then 值為明確的數字且 ≥ 30。（建議 100；維持 30 亦通過本 AC ——
      spec AD-10 說明了 302 才是失敗原因，timeout 不是。）
- [x] AC-4.3: Given `railway.toml`，When 檢視，Then `startCommand`、
      `restartPolicyType`、`restartPolicyMaxRetries`、`[build]` 區塊**未變更**。

---

## Task 5 — 文件同步

**Files:** `.env.example`、`README.md`

### `.env.example`

- 第 4–8 行 `NUXT_AUTH_PASSWORD` 的註解：`minimum 32 characters` → **`minimum 8 characters`**，
  並加一句「建議 8–15 個**隨機**字元，不要用單字」（spec R-1）。
- 第 10–11 行 `NUXT_SESSION_PASSWORD`：補上註解明說**必須 ≥ 32**、
  這是 nuxt-auth-utils 的要求、**不可與 auth password 的下限混淆**。
  （現況該處只寫了產生指令，沒寫長度要求 —— 兩個下限分歧後這個缺漏會變成陷阱。）

### `README.md`

| 行 | 現況 | 應改為 |
|---|------|--------|
| 59 | `` `NUXT_AUTH_PASSWORD` … (min 32 chars for `nuxt-auth-utils`) `` | min **8** chars；並移除 `for nuxt-auth-utils`（**這個敘述本來就是錯的** —— nuxt-auth-utils 不使用 auth password） |
| 60 | `` `NUXT_SESSION_PASSWORD` … (min 32 chars for `nuxt-auth-utils`) `` | 維持 min 32，敘述正確不動 |
| 70–71 | `NUXT_AUTH_PASSWORD=change-me-at-least-32-characters-long` 等 | 與**實際的** `.env.example` 同步（現況這段是**過期的**：真正的 `.env.example` 用的是 `replace-me-with-openssl-rand-hex-32-output`） |
| 217–218 | `<strong-secret-min-32-chars>` / `<strong-session-secret-min-32-chars>` | auth 改為 `<random-secret-min-8-chars>`；session 維持 32 |
| 224 | 「must both be at least 32 characters」 | 改為分述：auth ≥ 8、session ≥ 32，並說明為何不同（rate limit 為補償控制；session 是加密金鑰） |
| 228 | `5. **Health check** path: `/` (Nuxt returns 200 on root).` | 改為 `/api/health`，並更正括號內的敘述 —— **`/` 不會回 200**，它是受 auth 保護的頁面，未登入回 302，這正是部署失敗的原因 |
| 252–253 | 同 217–218 的第二處 | 同步 |
| 270–271 | `railway.toml` 引用區塊的 `healthcheckPath` / `healthcheckTimeout` | 與 Task 4 同步 |

### AC（AC-5.x）

- [x] AC-5.1: Given `.env.example`，When 檢視 `NUXT_AUTH_PASSWORD` 的註解，
      Then 說明 minimum **8**、建議 8–15 隨機字元、並提示不要使用單字；
      不再出現「minimum 32」的敘述。
- [x] AC-5.2: Given `.env.example`，When 檢視 `NUXT_SESSION_PASSWORD` 的註解，
      Then 明確寫出 **≥ 32**（nuxt-auth-utils 要求）。
- [x] AC-5.3: Given `README.md`，When 全文檢視，Then 上表 8 處全部更新；
      全檔不再有任何「兩者都要 32」或「health check 打 `/`」的敘述；
      並包含 R-3 的提醒（8 字元的可接受性以「單一 replica + 每 IP rate limit」為前提，
      擴到多 replica 時須重新評估）。
- [x] AC-5.4:（一致性）Given `.env.example`、`README.md`、
      `server/utils/auth.ts` 的常數、與錯誤訊息，When 交叉比對，
      Then 四者對「auth ≥ 8 / session ≥ 32」的敘述完全一致，無殘留的 32/8 混用。
- [x] AC-5.5: Given `README.md` 第 70–71 行的 `.env.example` 引用區塊，
      When 與真實的 `.env.example` 比對，Then 兩者的變數名與 placeholder 值一致
      （順手修掉既有的過期內容）。

---

## Task 6 — 測試與 coverage

| File | 動作 | 涵蓋 |
| --- | --- | --- |
| `tests/serverAuthUtils.test.ts` | **修改** | AC-1.1–1.10（含第 124 行的 `/at least 32/` 斷言拆分）、AC-7.6–7.7（round 1） |
| `tests/assertConfigPlugin.test.ts` | **修改** | AC-2.1–2.6（`'a'.repeat(31)` 案例改為 7 字元；新增 31 字元的 session 案例）、AC-7.8–7.12（round 1） |
| `tests/healthEndpoint.test.ts` | **新增**（round 1 精簡為 2 案例） | AC-3.2、AC-3.3、AC-3.4 |
| `tests/e2e/health.e2e.test.ts` | **新增（round 1）** | AC-3.1、AC-3.5、AC-3.6、AC-4.1 |
| `tests/loginRoute.test.ts` | **修改（round 1）** | AC-1.11、AC-7.1–7.5 |
| `tests/e2e/proxy.e2e.test.ts` | **不改，確認通過** | 見下方說明 |
| `vitest.config.ts` | **修改** | coverage ratchet |

### `tests/e2e/proxy.e2e.test.ts` 的評估結論：**不需修改**

第 39 行 `const PASSWORD = 'e2e-password-at-least-32-characters-long'`（40 字元），
第 160–161 行同時餵給 `NUXT_AUTH_PASSWORD` 與 `NUXT_SESSION_PASSWORD`。
40 ≥ 32 ≥ 8，兩個下限都通過；字串也不是 `PLACEHOLDER_SECRET_FRAGMENTS` 的任一子字串
（`change-me-at-least-32-characters-long` 與它相似但不相同，`includes` 不成立）。
第 38 行的註解「nuxt-auth-utils requires a session password of at least 32 characters」
在變更後依然正確（它講的正是 session 那一個）。
**Developer 仍須實際跑一次 `pnpm test:e2e` 確認**，而不是只憑推論。

### Coverage ratchet（`vitest.config.ts`）

`server/api/health.ts` 落在 coverage 的 `include`（`server/**/*.ts`）內。
新檔必須有測試，否則會把 statements/functions 往下拉。
依 tooling-baseline AD-6 的 ratchet 規則（**實測向下取整減 2，只升不降**），
跑完 `pnpm test:coverage` 後把四個門檻各自更新為
`max(現值, floor(實測) - 2)`，並在註解記錄本次 feature 名稱與實測值。
現值：lines 49 / statements 49 / functions 71 / branches 85。

### AC（AC-6.x）

- [x] AC-6.1: Given 上述測試檔，When 執行 `pnpm test`，Then 全部通過，
      且**沒有任何既有測試因本次改動而需要放寬斷言**
      （拆分斷言以保留分辨力是允許的；把 `/at least 32/` 改成 `/at least \d+/` 不是）。
- [x] AC-6.2: Given `pnpm test:coverage`，When 檢視，Then
      `server/api/health.ts`、`server/utils/auth.ts`、`server/plugins/assert-config.ts`
      三者皆為 **100%** statements，且 All files 四項門檻依 ratchet 規則調升後仍通過。
- [x] AC-6.3: Given `pnpm lint:check` 與 `pnpm vue-tsc`，When 執行，
      Then 無 error、無 `any`、無 `console.log`（既有的
      `vue/no-static-inline-styles` warning 不在本次變更檔案中，可維持）。
- [x] AC-6.4: Given `pnpm build`，When 執行，Then 成功
      （即使環境未設 `NUXT_AUTH_PASSWORD`；呼應 AC-2.7）。
- [x] AC-6.5: Given `pnpm test:e2e`（需先 `pnpm build`），When 執行，Then 全部通過。

---

## Task 7 — Review round 1 修正（codex `review-codex-1.md`，verdict: no-ship）

三項 Major 各自的修法。F3 的修法同時改寫了 Task 3 的 AC-3.6（見該條 DEVIATION）。

### F1 — 限流 key 可由攻擊者控制

**Files:** `server/utils/auth.ts`（修改）、`server/api/auth/login.post.ts`（修改）

原本 key 取 `clientIpFromForwardedFor`（X-Forwarded-For 最右）。整個「auth 密碼下限降到 8」
的正當性都壓在這個限流器上，所以它是承重的。

codex 建議「改取最左邊」。**不採納**，因為 Railway 官方說法自相矛盾，照做等於押注在一個
沒有定論的假設上：

> - [security-critical questions on edge proxy](https://station.railway.com/questions/security-critical-questions-on-edge-prox-8fddd775)
>   —— 員工 phin：edge 會**清掉** client 送來的 XFF，所以第一個值就是真實 IP。
> - [which header should I rely on for real client IP](https://station.railway.com/questions/which-header-should-i-rely-on-for-real-c-d78a6f96)
>   —— 員工 sam-a：client **可以**偽造 XFF，但真實 IP 永遠在最左，因為 edge 是**附加**在後面。
>   （這兩句不能同時為真：若 edge 是附加，被偽造的值就在左邊。）
>   同串社群回覆 zah340 則說 Railway 附加在**尾端**，只有最右可信。

**採取的作法是不去解這個歧義**，改成兩層：

1. `resolveRateLimitKey(getHeader, socketAddress)` 依序取
   `X-Real-IP` → `X-Envoy-External-Address` → 最右的 `X-Forwarded-For` → socket 位址 →
   共用的 `UNKNOWN_RATE_LIMIT_KEY`（`'unknown'`）。前兩個由 edge 控制、client 寫不進來，
   排在最前；**每一層都走既有的 `isIpAddress` 驗證**，避免任意字串變成桶名或撞到
   `'unknown'` 桶。
2. **全域上限桶**：`LOGIN_ATTEMPTS_GLOBAL = 30` / 60 秒，與 key 完全無關，
   所有請求共用一桶。就算攻擊者每次請求都能換一個新的 per-address 桶，
   整個 process 的猜測速率仍被壓在 30/分（43,200/日）。
   `.env.example` 要求的 8 個隨機字元 ≥ 36^8 ≈ 2.8×10^12，用盡一半需要 ~10^8 年。
   30 這個數字的取法：是 per-address 額度（5）的六倍，一般使用（含手滑重試、
   多人同時登入）撞不到，但把暴力破解壓成無意義。
3. 兩個桶都 hit、**不短路**；任一超限就回 429 並帶 `Retry-After`（取兩者較大的）。
4. `server/utils/auth.ts` 原本那句「Railway's edge appends the address it saw, so the
   rightmost entry is the last trustworthy one」是**錯誤斷言**，已改寫為誠實版本
   （最右只是「有記載的行為之一」，是第三順位，兩端都不視為權威），
   並在該處與 `login.post.ts` 附上上面兩個連結。

#### AC（AC-7.x，F1）

- [x] AC-7.1:（優先序）Given 同時帶 `X-Real-IP`、`X-Envoy-External-Address` 與
      `X-Forwarded-For`，且 XFF 每次請求兩端都換值，When 連續 POST `/api/auth/login`，
      Then 全部落在 `X-Real-IP` 那一個桶 —— 第 6 次即 429。
      **client 偽造 XFF 不能換到新桶。**
- [x] AC-7.2:（次順位）Given 無 `X-Real-IP`（或其值不是合法位址）但有
      `X-Envoy-External-Address`，Then 以後者為 key；兩者皆無時才退回最右的 XFF，
      再無則 socket，最後才是共用的 `'unknown'` 桶。
- [x] AC-7.3:（共用桶）Given 三個位址標頭每次都塞不同的垃圾字串（皆非合法 IP）
      且無 socket 位址，When 連續請求，Then 全部共用 `'unknown'` 一個桶，第 6 次 429。
- [x] AC-7.4:（全域上限會開火）Given 30 個**互不相同、合法**的偽造來源位址各打一次，
      Then 前 30 次照常回 401；第 31 次（無論來源多新）回 **429** 並帶 `Retry-After`。
      —— 這條是 F1 的核心：key 選得再差，總速率仍有上限。
- [x] AC-7.5:（不誤傷正常使用）Given 6 個不同來源各嘗試 4 次（共 24 次，< 30），
      Then 全部回 401，沒有任何一次 429。
- [x] AC-7.6:（純函式層）Given `resolveRateLimitKey` 直接呼叫，Then 涵蓋優先序、
      socket 退回（含 `::ffff:127.0.0.1`）、前後空白 trim、垃圾值拒絕、
      以及「有 edge 標頭時 client 的 XFF 推不動 key」。
- [x] AC-7.7:（常數）Given `LOGIN_ATTEMPTS_PER_ADDRESS`、`LOGIN_ATTEMPTS_GLOBAL`、
      `LOGIN_RATE_LIMIT_WINDOW_MS`，Then 分別為 `5`、`30`、`60_000`。

> **未解決的殘留風險**（spec R-9）：全域桶會讓攻擊者有能力對所有人造成 429 附帶損害；
> 且計數在單一 process 內，多 replica 時每個 replica 各算一份。兩者都記在 spec，不在本輪處理。

### F2 — 健康但不可用的部署

**File:** `server/plugins/assert-config.ts`（修改）

原本啟動只斷言兩個密碼。`nuxt.config.ts` 把 `apiKey` 預設為 `''`、`apiBaseUrl` 完全沒驗，
所以少設 `NUXT_API_KEY` 的部署會**啟動成功、`/api/health` 回 200、被標記為 live**，
然後每一個 dashboard 請求都在上游失敗。

修法：啟動時快速失敗 —— `apiKey` 必須非空（trim 後），`apiBaseUrl` 必須是絕對的
http(s) URL。訊息沿用既有風格（`... See .env.example.`）。

**刻意不做**：不把上游連通性做進 health 端點，也不在啟動時去 ping 上游。
只驗**組態**。上游抖一下不該害整個服務重啟（liveness ≠ readiness）。

#### AC（AC-7.x，F2）

- [x] AC-7.8: Given `NUXT_API_KEY` 缺少／為空字串／只有空白／非字串，When 啟動，
      Then 拋錯，訊息含 `NUXT_API_KEY` 與 `non-empty`。
- [x] AC-7.9: Given `NUXT_API_BASE_URL` 為空、只有空白、相對路徑（`/api`）、
      無 scheme（`example.com`）、`file:`／`ftp:` scheme、或非字串，When 啟動，
      Then 拋錯，訊息含 `absolute http(s) URL`。
- [x] AC-7.10: Given `http://` 與 `https://` 的合法 URL（含帶 port、帶 path），
      When 啟動，Then 不拋錯。
- [x] AC-7.11:（順序）Given 密碼與 proxy 設定同時不合法，Then 先拋**密碼**的錯
      （既有斷言在前，行為不變）。
- [x] AC-7.12:（不探測上游）Given 一個絕對不可達的 `NUXT_API_BASE_URL`
      （如 `http://127.0.0.1:1`），When 啟動，Then **不拋錯**、不發出任何請求 ——
      啟動只檢查組態。（`tests/e2e/health.e2e.test.ts` 正是用這個值把服務叫起來的。）

### F3 — health 路徑完全沒被測到

見 Task 3 的 AC-3.6 DEVIATION（`health.get.ts` → `health.ts`、任何 method 皆 200）
與 Task 3 的測試段落（空殼單元測試刪除、新增 e2e）。

---

## 預期異動檔案清單（完整）

### 實作（5）

| File | 動作 | 內容 |
| --- | --- | --- |
| `server/utils/auth.ts` | 修改 | 新增 `MIN_AUTH_PASSWORD_LENGTH = 8`；`assertStrongSecret` 加第三參數 `minLength`；長度改 trim 後量；訊息插值。**round 1** 追加 `resolveRateLimitKey`、`UNKNOWN_RATE_LIMIT_KEY` 與三個 login 限流常數，並改寫關於 XFF 的錯誤註解 |
| `server/plugins/assert-config.ts` | 修改 | 兩個呼叫端各自明確傳入下限。**round 1** 追加 `NUXT_API_KEY` / `NUXT_API_BASE_URL` 的啟動斷言 |
| `server/api/health.ts` | **新增** | `defineEventHandler(() => ({ status: 'ok' }))`。**round 1** 由 `health.get.ts` 改名（見 AC-3.6 DEVIATION） |
| `server/api/auth/login.post.ts` | **修改（round 1）** | 限流 key 改用 `resolveRateLimitKey`；新增與來源無關的全域上限桶 |
| `railway.toml` | 修改 | `healthcheckPath` → `/api/health`；`healthcheckTimeout` 維持 30（AD-10 未採納） |

### 文件（4）

| File | 動作 | 內容 |
| --- | --- | --- |
| `.env.example` | 修改 | 第 5 行「minimum 32 characters」→ 8 + 隨機性提醒；第 10–11 行補 session 的 ≥ 32 說明。**round 1** 補上兩層限流的敘述與「兩個 API 變數為必填且啟動即斷言」 |
| `README.md` | 修改 | 第 59、60、70–71、217–218、224、228、252–253、270–271 行（見 Task 5 對照表）。**round 1** 補上轉發標頭歧義的說明方塊、單一 replica 的但書、部署前四個變數的確認清單，以及 healthcheck「任何 method」的敘述 |
| `specs/deploy-recovery/spec.md` | 修改（round 1） | 補償控制段落更正、AD-7 推翻、新增 AD-11 與 R-8–R-11 |
| `specs/deploy-recovery/review-codex-1.md` | **新增（round 1）** | codex 對抗性 review 報告（no-ship，3 Major），一併入版控留存 |

### 測試（6）

| File | 動作 | 內容 |
| --- | --- | --- |
| `tests/serverAuthUtils.test.ts` | 修改 | 第 124 行的 `/must be set and at least 32 characters long/` 斷言與其 `it.each` 需依下限拆分；新增 8/31/32 邊界與 trim 案例 |
| `tests/assertConfigPlugin.test.ts` | 修改 | `['too short', 'a'.repeat(31)]` → 7 字元；新增 `session: { password: 'a'.repeat(31) }` 案例（AC-2.3） |
| `tests/healthEndpoint.test.ts` | **新增** | AC-3.2–3.4（**round 1** 刪除 9 條空殼案例，剩 2 條） |
| `tests/e2e/health.e2e.test.ts` | **新增（round 1）** | AC-3.1、AC-3.5、AC-3.6、AC-4.1 |
| `tests/loginRoute.test.ts` | **修改（round 1）** | AC-7.1–7.5；原第 184 行寫死鏈序的案例已重寫 |
| `vitest.config.ts` | 修改 | coverage ratchet + 註解記錄 |

### 已評估、確認**不需**異動（7）

> `server/api/auth/login.post.ts` 原列於此（理由「不驗長度」）。review round 1 之後它**確實**改了 ——
> 改的不是長度驗證，是限流 key 的取得方式與新增的全域上限桶，已移到上面的實作表。

`nuxt.config.ts`（`authPassword: ''` 預設保留）、
`server/api/auth/check.get.ts`、`server/api/arbiter/[...].ts`、
`server/utils/proxyPolicy.ts`（其 `'health'` 前綴指的是上游路徑）、
`server/utils/constantTime.ts`、
`tests/e2e/proxy.e2e.test.ts`（40 字元密碼兩個下限都通過）、
`Dockerfile` 與 `.github/workflows/ci.yml`（未引用 healthcheck 路徑或密碼長度；已 grep 確認）。
另：`middleware/auth.ts`、`pages/index.vue` 的 302 行為是**正確的**，刻意不動 ——
修的是 healthcheck 打錯路徑，不是 auth 守衛。

---

## Definition of Done

- Task 1–7 的 AC 全部勾選（AC-3.6 為刻意的 DEVIATION，見該條）。
- `pnpm lint:check`、`pnpm vue-tsc`、`pnpm test:coverage`、`pnpm build`、`pnpm test:e2e` 全部通過。
- **Runtime 驗證**（以 build 產物 `node .output/server/index.mjs` 跑，
  AC-3.1、AC-3.5、AC-3.6、AC-3.7、AC-2.1、AC-2.3 需要真實路由表／真實啟動）：
  1. 以 `NUXT_AUTH_PASSWORD` = 8 字元隨機字串 + `NUXT_SESSION_PASSWORD` = 32 字元啟動 → **成功啟動**。
  2. 以 `NUXT_AUTH_PASSWORD` = 7 字元啟動 → 啟動失敗，訊息含 `at least 8`。
  3. 以 `NUXT_SESSION_PASSWORD` = 31 字元啟動 → 啟動失敗，訊息含 `NUXT_SESSION_PASSWORD` 與 `at least 32`。
  4. `curl -i http://127.0.0.1:8080/api/health`（無 cookie）→ `200`，body `{"status":"ok"}`。
  5. `curl -i http://127.0.0.1:8080/` （無 cookie）→ 仍為 `302`（確認未誤改 auth 行為）。
  6. ~~`curl -i -X POST http://127.0.0.1:8080/api/health` → 405。~~
     **round 1 改為**：`curl -i -X POST` → `200`（AC-3.6 DEVIATION）。
  7. `curl -I http://127.0.0.1:8080/api/health`（HEAD）→ `200`。
     這條在 round 1 之前是 **404**，是本輪最重要的 runtime 回歸點。
  8. `curl -i http://127.0.0.1:8080/api/arbiter/health`（無 cookie）→ 仍為 `401`。
  9. 以 8 字元密碼連續 6 次 POST `/api/auth/login` → 第 6 次 `429` + `Retry-After`（AC-1.11）。
  10. 以 `NUXT_API_KEY=`（空字串）啟動 → 啟動失敗，訊息含 `NUXT_API_KEY` 與
      `non-empty`（AC-7.8）。
  11. 以 `NUXT_API_BASE_URL=not-a-url` 啟動 → 啟動失敗，訊息含
      `absolute http(s) URL`（AC-7.9）。
- **部署前的人工確認**（spec R-6）：Railway service variables 中
  `NUXT_AUTH_PASSWORD`（≥ 8）、`NUXT_SESSION_PASSWORD`（≥ 32）、
  `NUXT_API_KEY`（非空）、`NUXT_API_BASE_URL`（絕對 http(s) URL）**四個**皆已設定，
  且前兩者都不是 `.env.example` 的 placeholder。
  後兩個自 round 1 起是**硬性開機條件**（spec R-11）：漏設會讓新部署起不來，
  Railway 會保留舊版本繼續服務 —— 這是刻意的，比「起得來但每個請求都失敗」好。
- `handoff-dev.json` 列出所有 `changed_files`。
