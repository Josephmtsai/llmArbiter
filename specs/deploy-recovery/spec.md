# Spec: Deploy Recovery

## Feature ID

`deploy-recovery`

## Summary

修復 Railway production 連續兩次部署失敗。兩個獨立的問題：(A) 啟動時 `assertStrongSecret`
對 `NUXT_AUTH_PASSWORD` 與 `NUXT_SESSION_PASSWORD` 套用同一個 32 字元下限，導致 crashloop；
改為 **per-secret 下限**（auth 降到 8、session 維持 32）。(B) `railway.toml` 的
`healthcheckPath = "/"` 打到受 `middleware/auth.ts` 保護的頁面路由，未登入時回 302，
healthcheck 判定失敗；新增不需驗證的 `server/api/health.ts` 並把 healthcheck 指過去。

## Source

- Railway 部署日誌（兩次）：
  - 第一次：`Error: NUXT_AUTH_PASSWORD must be set and at least 32 characters long. See .env.example.` → crashloop。
  - 第二次：`Path: / … Attempt #1 failed with HTTP 302. … 1/1 replicas never became healthy!`
- 使用者需求（原話）：「auth password 可以不要這麼長嗎 大概8-15就好了」、「幫我改」。
- 現況程式碼：`server/utils/auth.ts`、`server/plugins/assert-config.ts`、`railway.toml`、
  `middleware/auth.ts`、`pages/index.vue`、`server/api/arbiter/[...].ts`、`server/utils/proxyPolicy.ts`。
- 前置 spec：`specs/auth-hardening/`（本次要調整的斷言由該 feature 引入）。

---

## 問題 A — 啟動斷言擋掉 `NUXT_AUTH_PASSWORD`

### 現象

第一次部署 crashloop，`server/plugins/assert-config.ts:12` 呼叫
`server/utils/auth.ts:73` 的 `assertStrongSecret('NUXT_AUTH_PASSWORD', config.authPassword)` 拋出。

### 根因（含「這不是 regression」的證據）

**env var 名稱從來沒有變過。** 已驗證：

```
$ git show 1035083^1:nuxt.config.ts | grep -n authPassword
9:    authPassword: '',
```

`1035083` 是 `Merge branch 'feat/auth-hardening'`，其第一父節點（merge 前的 main）
就已經有 `runtimeConfig.authPassword`，Nuxt 對應的 env var 一直是 `NUXT_AUTH_PASSWORD`。
所以 Railway 上那個變數本來就設錯（或設成短字串），**auth-hardening 只是把它暴露出來**。

在 auth-hardening 之前，app 會照常啟動，但 `authPassword` 為 `''`（`nuxt.config.ts:9` 的預設值），
登入邏輯拿使用者輸入去比對空字串 —— 那是壞掉的 auth，不是可用的 auth。
（auth-hardening 已同時在 `server/api/auth/login.post.ts` 加上 `typeof authPassword !== 'string'`
的守衛，但空字串仍是 string，該守衛擋不住；擋住它的正是這道啟動斷言。）

**結論：crashloop 是 fail-closed 設計正確運作的結果，不是 bug。** 要修的是「下限對
`NUXT_AUTH_PASSWORD` 而言過嚴」，不是「拿掉斷言」。

### 關鍵限制：兩個 secret 共用同一個下限

```ts
// server/utils/auth.ts:6
export const MIN_SECRET_LENGTH = 32
// server/utils/auth.ts:74
if (typeof value !== 'string' || value.length < MIN_SECRET_LENGTH) { … }
```

```ts
// server/plugins/assert-config.ts:12 與 :19 —— 同一個函式，同一個下限
assertStrongSecret('NUXT_AUTH_PASSWORD', config.authPassword)
assertStrongSecret('NUXT_SESSION_PASSWORD', (session as { password: unknown }).password)
```

`NUXT_SESSION_PASSWORD` 是 **nuxt-auth-utils 的 cookie 加密金鑰**（iron-webcrypto 的
seal/unseal key），該套件本身就要求 ≥ 32 字元並會自行拒絕，**必須維持 32，不可調降**。
把 `MIN_SECRET_LENGTH` 直接改成 8 會同時放寬 session 金鑰 —— 這道斷言就等於失效，
而真正的錯誤會延後到 nuxt-auth-utils 自己在某個請求裡拋出，錯誤訊息也更難懂。

所以本 spec 的核心變更是把「一個全域下限」改成「**per-secret 下限**」。

### 設計決策

| # | 決策 | Rationale |
|---|------|-----------|
| **AD-1** | `assertStrongSecret` 增加第三個參數 `minLength`，預設維持 `MIN_SECRET_LENGTH`（32） | 只有一條程式路徑（長度 → placeholder），不需要複製函式或維護 name→min 的查表。預設值取**嚴**的那個：未來新增的呼叫端若忘記傳，拿到的是 32 而不是 8，失敗方向安全。 |
| **AD-2** | 新增 `export const MIN_AUTH_PASSWORD_LENGTH = 8`；`MIN_SECRET_LENGTH = 32` 原樣保留 | 兩個常數各自具名、可 grep、可在測試中直接引用。保留 `MIN_SECRET_LENGTH` 是為了不動既有的 export 介面（Nitro auto-import 表、`.nuxt/types/nitro-imports.d.ts` 都引用它）。 |
| **AD-3** | 錯誤訊息改為插值 `minLength`，不再硬編 32 | 訊息必須說出**該變數實際的**下限，否則維運者照著訊息把 8 字元密碼補到 32，問題原封不動。 |
| **AD-4** | 長度改為 **trim 後**再量 | 見下方〈AD-4 詳述〉。 |

#### 為什麼 auth 是 8 而不是 12 或 15

使用者說「大概 8-15 就好」。取**區間下緣 8**：這樣他在 8–15 之間挑任何長度都能通過。
取 12 會讓「我設了 10 個字」再度 crashloop，等於沒解決問題。下限的用途是擋掉明顯的
誤設（空字串、`x`、忘記設），不是替維運者決定密碼強度。

#### 為什麼 8 字元在**這個**情境可接受：補償控制

登入端點已有 rate limiter（`server/utils/auth.ts` 的 `createRateLimiter`，於
`server/api/auth/login.post.ts` 建立為 module-level singleton）：成功與失敗都計數，
且 rate limit 排在 body 驗證**之前**（格式錯誤的請求也計數）。

> **修正（review round 1）**：本節原本寫「IP 取 `X-Forwarded-For` 的最右側條目
> （**不可由 client 偽造**）」。括號裡那句是**錯的斷言** —— Railway 對 forwarding
> header 的語意公開資料互相矛盾（見 R-9 的兩個連結，連 Railway 員工的說法都打架），
> 沒有任何一端可以被斷言為不可偽造。實作因此改成**兩層**：

1. **per-address**：`LOGIN_ATTEMPTS_PER_ADDRESS = 5` 次/60 秒。key 由
   `resolveRateLimitKey` 依序取 `X-Real-IP` → `X-Envoy-External-Address` →
   `X-Forwarded-For` 最右 → socket → 共用 `unknown`，前兩者由 edge 覆寫、
   client 寫不進來，每一層都過 `isIpAddress` 驗證（避免用垃圾字串當 bucket key）。
2. **global**：`LOGIN_ATTEMPTS_GLOBAL = 30` 次/60 秒，**不分來源**。

第 2 層才是讓 8 字元下限站得住的關鍵：不論 key 怎麼解析、不論 Railway 的 proxy 語意
最後是哪一種，甚至在 key 完全由攻擊者選定的最壞情況下，總猜測速率都被鎖在
**43,200 次/日**。8 字元的小寫+數字空間是 36^8 ≈ 2.8 × 10^12，窮舉一半需 ~10^8 年。
**8 字元的可接受性因此不再依賴任何無法確認的外部行為。**
所以 `tasks.md` 開了 AC（AC-1.5 / AC-2.6）專門驗證這兩層都仍然生效。

**這個論證有一個明確的前提：密碼必須是隨機的。** 若維運者選了字典詞（`password`、
`arbiter1`），候選集只有 10^2–10^4，單一 IP 在 5 次/分鐘下數十分鐘內就會命中。
rate limiter 擋得住窮舉，擋不住猜中。這條寫在 residual risks，並要求
`.env.example` / `README.md` 明確指示「隨機產生，不要用單字」。

---

## 問題 B — Healthcheck 拿到 302

### 現象

最新一次部署 app 已能啟動（不再 crash），但：

```
Path: /
Attempt #1 failed with HTTP 302.
1/1 replicas never became healthy!
```

### 根因

```toml
# railway.toml:7
healthcheckPath = "/"
```

`/` 對應 `pages/index.vue`，其第 4 行是 `definePageMeta({ middleware: 'auth' })`。
`middleware/auth.ts` 是 **Nuxt route middleware**，SSR 階段就會執行；未登入時走到
第 14 行 `navigateTo({ path: '/login', query: { redirect: to.fullPath } })`，
SSR 下 `navigateTo` 對應一個 **302 redirect response**。Railway 的 healthcheck
只接受 2xx，302 判定為 unhealthy，重試耗盡後整個部署失敗。

**專案目前沒有任何 health 端點。** 已驗證：`server/api/` 底下只有 `arbiter/` 與 `auth/`，
沒有 `server/routes/`、沒有 `server/middleware/`，全庫沒有 `*health*` 的 server 檔案。

> ⚠️ 容易混淆的一點：`server/utils/proxyPolicy.ts:30` 的 `ALLOWED_PATH_PREFIXES`
> 確實含 `'health'`，但那是允許瀏覽器經 proxy 打**上游 API** 的
> `/api/arbiter/health`（`composables/useApi.ts:285` 的 `healthCheck()`）。
> 那條路徑會走 `server/api/arbiter/[...].ts`，而該 handler 第一件事就是
> `getSessionUser` 檢查 session（未登入回 401），**且它的存活取決於上游 API**。
> 拿它當 Railway healthcheck 是雙重錯誤。本 spec 新增的是**本地、無驗證**的端點。

### 設計決策

| # | 決策 | Rationale |
|---|------|-----------|
| **AD-5** | 新增 `server/api/health.ts`，回 `200` + `{ status: 'ok' }` | 見下方「為什麼不受 `middleware/auth.ts` 影響」。 |
| **AD-6** | 路徑取 `/api/health`，不取 `/health` 或 `/healthz` | `server/api/*` 是專案既有的慣例（`server/routes/` 目前不存在，為它新增一個目錄只為一個端點是多餘的）。`/api/health` 也與上游的 `/api/arbiter/health` 在字面上就區分得開。 |
| **AD-7** | ~~檔名用 `.get.ts` 後綴，只註冊 GET~~ **推翻（review round 1）**：檔名為 `health.ts`，**任何 method 都回 200**。 | 原理由是「減少端點的可用面」。實測 `.get.ts` 下 `HEAD /api/health` 回的是 **404**（不是 405），而 Railway 的[官方文件](https://docs.railway.com/guides/healthchecks)只說輪詢到收到「任何 2xx」，**沒有記載探針用哪個 method** —— 整個 GET-only 的設計因此建立在一個沒有依據的假設上。此 handler 回固定常數、不碰 I/O、不讀組態，沒有 method 能擴大的表面，拿它換「探針一定打得中」明顯划算。見 R-10。 |
| **AD-8** | 回應體固定為 `{ status: 'ok' }`，**不含任何組態** | 見下方「不得洩漏」。 |
| **AD-9** | `railway.toml` 的 `healthcheckPath` 改為 `/api/health` | |
| **AD-10** | ~~`healthcheckTimeout` 由 `30` 提高到 `100`~~ **未採納（Human Gate 決議 2026-09-05）**：維持 `30`。 | 見下方「timeout 是否足夠」。 |

#### 為什麼 `server/api/health.ts` 不受 `middleware/auth.ts` 影響（必須確認的前提）

`middleware/auth.ts` 是 `defineNuxtRouteMiddleware`，屬於 **Vue Router 的 app 端 route
middleware**，只在 Nuxt 解析**頁面路由**時執行，且是逐頁以
`definePageMeta({ middleware: 'auth' })` 掛上的（不是 `.global.ts`）。
`/api/health` 由 **Nitro 的 server route table** 處理，根本不會進入 Vue Router，
所以 app 端 middleware 對它不存在。

三項已驗證的旁證：
1. 沒有 `server/middleware/` 目錄 —— 不存在會攔截所有 Nitro 請求的全域 server middleware。
2. `middleware/auth.ts` 不是 `.global`，是各頁面自行宣告。
3. `server/api/auth/check.get.ts` 已經是一個「不需登入即可存取、只回
   `{ ok: !!session?.user }`」的 Nitro 端點，實證了這條路徑上沒有 app 端守衛。

#### 為什麼不會被 `server/api/arbiter/[...].ts` 的 catch-all 攔到（必須確認的前提）

catch-all 掛在 `server/api/arbiter/[...].ts`，Nitro 依檔案位置只把它註冊在
**`/api/arbiter/**`** 之下；`server/utils/proxyPolicy.ts:81` 的
`PROXY_MOUNT_PREFIX = '/api/arbiter/'` 也印證了這個掛載點。`/api/health` 不以該前綴開頭，
既不會被路由到 catch-all，`validateProxyPath` 也碰不到它。
（`server/api/` 底下沒有任何 `[...].ts`，只有 `arbiter/` 與 `auth/` 兩個子目錄。）

#### 不得洩漏任何組態或 secret

health 端點的唯一職責是回答「這個 process 還活著嗎」。它**不得**回傳：
env var、`useRuntimeConfig()` 的任何欄位、API base URL、版本／commit SHA、
uptime／記憶體、上游可達性、session 狀態。這是一個**未驗證**的公開端點，
任何多回的欄位都是免費送給掃描器的偵察資訊。回應體固定為 `{ status: 'ok' }`，
不接受 query 參數、不隨環境改變。這條寫成 AC-3.4（以「回應體必須完全等於該物件」
的相等斷言釘住，而不是「不含某些關鍵字」的黑名單）。

#### 端點**不得**遮蓋啟動失敗（刻意的設計）

health 端點回 200 的前提是 process 起得來，而 `server/plugins/assert-config.ts`
是 Nitro plugin，在任何請求之前執行、失敗即終止 process。所以組態錯誤的部署
**永遠不會**有東西回應 healthcheck —— 它會 crashloop 然後 healthcheck timeout。
這是正確的：一個「即使 secret 設錯也回 200」的 health 端點會讓問題 A 那類部署
悄悄上線。本 spec 不加任何「health 端點先於 assert 註冊」之類的處理。

> **AD-11（review round 1 追加）—— 這個論證原本有個漏洞。**
> `assert-config.ts` 當時只驗兩個密碼，而 `nuxt.config.ts` 的 `apiKey` 預設空字串、
> `apiBaseUrl` 完全沒驗。於是 `NUXT_API_KEY` 沒設時 process 照樣起來、`/api/health`
> 回 200、Railway 判定部署成功 —— 但每個 dashboard 請求都帶著空的 `X-API-Key` 打上游而
> 失敗。**健康但不可用**，正是這一段宣稱不會發生的事。
>
> 修法是**啟動時 fail fast**：`apiKey` 必須非空、`apiBaseUrl` 必須是合法的 http/https
> absolute URL。啟動失敗時 Railway 不會切換流量，舊 deployment 繼續服務。
>
> **刻意不做**：把上游連通性檢查放進啟動或 health 端點。上游是否此刻可達不是這個
> deployment 的組態屬性；綁進去只會讓上游抖一下就害部署失敗（或服務被重啟）。
> liveness 與 readiness 的界線維持不變，改的是「組態的完整性」該在何時被檢查。見 R-11。

#### `healthcheckTimeout = 30` 是否足夠

`healthcheckTimeout` 是 Railway 允許 replica 變成 healthy 的**總時窗**（期間會重試），
不是固定等待。時間從容器啟動起算，涵蓋 Node 啟動 + Nitro server bootstrap。
Nitro 冷啟動通常 1–3 秒，30 秒在正常情況下綽綽有餘 —— **問題 B 不是 timeout 造成的**
（日誌顯示 `Attempt #1 failed with HTTP 302`，是明確的失敗回應，不是逾時）。

即便如此建議提高到 **100**：這個值只在「replica 還沒 healthy」時消耗，
健康的部署第一次嘗試就通過、完全不受影響；而它換到的是對 Railway 平台端
排程／網路抖動的餘裕。改動成本為零、風險為零。若 reviewer 認為超出本 feature 範圍，
維持 30 也不影響任何 AC（AC-4.2 只要求該值明確、且 ≥ 30）。

> **未採納（Human Gate 決議，2026-09-05）**：本節的「提高到 100」建議**不採納**。
> `healthcheckTimeout` **維持 30**，`railway.toml` 該行不動。理由是 timeout 從來不是
> 本次失敗的原因（日誌為 `Attempt #1 failed with HTTP 302`，是明確的失敗回應而非逾時），
> 而 AC-4.2 只要求 ≥ 30，故維持 30 仍然通過。Task 4 的程式碼區塊中
> `healthcheckTimeout = 100` 一行同樣不採納。

---

## Scope

### In Scope

1. **Per-secret 最低長度**（`server/utils/auth.ts`、`server/plugins/assert-config.ts`）
   - `MIN_AUTH_PASSWORD_LENGTH = 8`（新增）、`MIN_SECRET_LENGTH = 32`（保留）。
   - `assertStrongSecret(name, value, minLength = MIN_SECRET_LENGTH)`。
   - 長度以 `value.trim().length` 衡量（AD-4）。
   - 錯誤訊息插值實際的 `minLength`。
   - `assert-config.ts` 兩個呼叫端各自明確傳入下限。
   - placeholder 檢查、順序、行為完全不動。
2. **Health 端點**（`server/api/health.ts`，新增）
   - GET `/api/health` → `200` + `{ status: 'ok' }`，無驗證、無組態。
3. **`railway.toml`**：`healthcheckPath = "/api/health"`。
   （`healthcheckTimeout` 維持 `30` —— AD-10 的提高建議未採納，見 Human Gate 決議。）
4. **文件同步**：`.env.example`、`README.md`（下限說明、`.env.example` 區塊、
   Railway 章節、healthcheck 路徑）。
5. **測試**：更新受影響的既有斷言、新增 health 端點測試、coverage ratchet。

### Out of Scope

- 拿掉或弱化啟動斷言本身（它正確運作，見「根因」）。
- 調降 `NUXT_SESSION_PASSWORD` 的 32 字元下限（nuxt-auth-utils 硬性要求）。
- 改變 login 的密碼比對、rate limit 參數、或任何 auth 流程邏輯
  （本 feature 只改**接受哪些設定值**，不改**如何驗證**）。
- 把密碼強度規則（字元類別、字典檢查、zxcvbn）加進斷言 —— YAGNI，
  且會把「擋誤設」的檢查誤導成「保證強度」的檢查（見 auth-hardening AC-3.8 的界線說明）。
- 分散式／全域 rate limit、帳號鎖定（見 residual risks R-3）。
- 對 health 端點加上 readiness 語意（檢查上游 API、DB）。Railway 這裡要的是
  liveness；把上游可達性綁進去會讓上游一抖動就整個服務被重啟。
- `Dockerfile`（`HEALTHCHECK` 指令未使用，Railway 用的是 `railway.toml`）。
- `.github/workflows/ci.yml`（已確認未引用 healthcheck 路徑或密碼長度）。

---

## 影響範圍

### 行為變更

| 對象 | 變更前 | 變更後 |
|------|--------|--------|
| `NUXT_AUTH_PASSWORD` 長度 8–31 | 啟動失敗 | **啟動成功** |
| `NUXT_AUTH_PASSWORD` 長度 < 8（含空字串、未設定） | 啟動失敗 | 啟動失敗（訊息改為「at least 8」） |
| `NUXT_SESSION_PASSWORD` 長度 < 32 | 啟動失敗 | 啟動失敗（**不變**） |
| 任一 secret 為 placeholder | 啟動失敗 | 啟動失敗（**不變**） |
| GET `/`（未登入） | 302 → `/login` | 302 → `/login`（**不變**，僅不再是 healthcheck 目標） |
| GET `/api/health` | 404 | **200** `{ status: 'ok' }` |
| Railway healthcheck | 打 `/` → 302 → 失敗 | 打 `/api/health` → 200 → 通過 |

### 未受影響（已逐一確認）

- **`tests/e2e/proxy.e2e.test.ts:39`**：`PASSWORD = 'e2e-password-at-least-32-characters-long'`
  長 40 字元，同時作為 `NUXT_AUTH_PASSWORD` 與 `NUXT_SESSION_PASSWORD`（第 160–161 行）。
  40 ≥ 32 ≥ 8，兩個下限都通過；字串也不含任何 `PLACEHOLDER_SECRET_FRAGMENTS`
  （`change-me-at-least-32-characters-long` 與它只是相似，不是子字串）。
  **本檔不需修改**，但註解（第 38 行）敘述的仍是 session 的要求，依然正確。
- `server/api/auth/login.post.ts`：不改。長度檢查從來只在啟動時做，login 端點不驗長度。
- `server/utils/constantTime.ts`、`verifyLoginPassword`、`isPlaceholderSecret`、
  `createRateLimiter`、`clientIpFromForwardedFor`：不改。
- `middleware/auth.ts`、`pages/*`、`composables/useApi.ts`、`stores/useAuthStore.ts`：不改。
- `nuxt.config.ts`：不改（`authPassword: ''` 預設值保留；它靠啟動斷言擋，不靠預設值）。
- `server/api/arbiter/[...].ts`、`server/utils/proxyPolicy.ts`：不改
  （`ALLOWED_PATH_PREFIXES` 的 `'health'` 是上游路徑，與 `/api/health` 無關）。
- `Dockerfile`、`.github/workflows/ci.yml`：不改。

---

## AD-4 詳述：長度該不該在 trim 後才量（SA 建議：**要**）

### 現況殘留

```ts
// server/utils/auth.ts:73-85（現況）
export function assertStrongSecret(name: string, value: unknown): void {
  if (typeof value !== 'string' || value.length < MIN_SECRET_LENGTH) { throw … }  // ← 未 trim
  if (isPlaceholderSecret(value)) { … }                                           // ← 內部才 trim
}
```

長度檢查跑在**未 trim 的原字串**上，而且排在 placeholder 檢查**之前**。
所以 32 個空白目前會完整通過兩道檢查。

### 為什麼降到 8 之後這件事變得要緊

32 個空白不是任何人會不小心產生的東西 —— 要打出來得刻意為之。
**8 個空白則完全在意外的射程內**：Railway 的變數編輯框貼上時多帶了縮排、
`.env` 檔裡寫成 `NUXT_AUTH_PASSWORD=        `、從表格或聊天訊息複製時帶進前後空白。
下限降到 8 等於把這個殘留從「理論上」搬到「踩得到」。

更一般的情況不只是全空白：`"  abcd  "` 是 8 個字元、實際熵只有 4 個字元，
現在也會通過。

### 建議：採用，但**只改衡量方式，不改被比對的值**

```ts
export function assertStrongSecret(
  name: string,
  value: unknown,
  minLength: number = MIN_SECRET_LENGTH,
): void {
  // Measured after trim: the raw length would wave through a secret that is
  // mostly padding. At the old floor of 32 that took deliberate effort; at 8 it
  // is one stray copy-paste away. The stored value itself is left alone --
  // see below.
  if (typeof value !== 'string' || value.trim().length < minLength) {
    throw new Error(`${name} must be set and at least ${minLength} characters long. See .env.example.`)
  }
  if (isPlaceholderSecret(value)) { … }   // 完全不動
}
```

**理由：**
1. 成本是一個 `.trim()` 和一條測試；收益是關掉一個下限調降後才真正可觸及的洞。
2. 與 `isPlaceholderSecret` 的既有作法一致（它已經是 `value.trim().toLowerCase()`），
   兩道檢查用同一套正規化，不會出現「長度看到一種字串、placeholder 看到另一種」。
3. 不改變任何**合法**設定的行為：真實 secret 不含前後空白，`trim()` 是 no-op。

**刻意不做的部分：不 trim 被比對的值。** login 時比對的仍是
`useRuntimeConfig(event).authPassword` 的原字串。若把儲存值也 trim，
一個前後真的帶空白的既有密碼會**默默改變**（維運者原本要輸入含空白的密碼，
改動後變成不含），那是行為變更而非防護。目前的取捨是：這種設定通過斷言，
但維運者必須連同空白一起輸入才能登入 —— 這是既有行為，不在本 feature 變更範圍。
以 R-2 記錄。

**替代方案（不建議）**：把 `value.trim().length === 0` 單獨列為一條錯誤訊息更清楚的檢查。
不採用是因為它只擋全空白、擋不到 `"  abcd  "`，多一條分支卻少一半覆蓋。

---

## Residual Risks

| # | 風險 | 嚴重度 | 處置 |
|---|------|--------|------|
| **R-1** | 8 字元密碼若是字典詞（`password`、`arbiter1`），rate limiter 的 5 次/分鐘擋得住窮舉、擋不住「猜中」—— 數十分鐘即可試完常見詞表前 100 名。 | 中 | **接受**（使用者明示要求 8–15）。緩解：`.env.example` 與 `README.md` 必須指示「隨機產生」並附指令（AC-5.1、AC-5.3）。斷言**不**做字典檢查（out of scope，理由見 Scope）。 |
| **R-2** | 前後帶空白的 secret 通過斷言後，實際登入必須連空白一起輸入才會相符（比對用的是原字串）。 | 低 | **記錄不修**。AD-4 只改長度的衡量方式；trim 儲存值是行為變更，需另外的 Human Gate。 |
| **R-3** | rate limiter 是 **per-IP、in-memory、單 instance**。分散式來源可繞過每 IP 額度；Railway 若擴到多 replica，每個 replica 各有一份計數。32 字元時這不要緊，8 字元時它是補償控制的一部分。 | 中 | **記錄不修**（外部 store 已在 auth-hardening 列為 out of scope，前提是單一 instance）。若日後擴 replica，必須重新評估 8 字元的下限。**寫進 `README.md` 的部署說明**（AC-5.3）。 |
| **R-4** | 長度是 `String.length`（UTF-16 code unit），不是字素。8 個 emoji 算 16、8 個 CJK 字算 8。 | 極低 | **記錄不修**。方向是保守的（多數非 ASCII 字元算 ≥ 1），且與既有行為一致。 |
| **R-5** | `/api/health` 是公開未驗證端點，可被用來確認服務存在、或當成廉價的 liveness 探針灌流量。 | 極低 | **接受**。回應體是固定常數、不碰 I/O、不查組態；它洩漏的資訊不多於「這個網域有東西在跑」，而那本來就能從 `/` 的 302 得知。無 rate limit（YAGNI）。 |
| **R-6** | 降低下限後，若 Railway 上那個變數其實是**設錯名稱**（而非太短），部署仍會失敗 —— 只是錯誤訊息一樣。 | 低 | **由部署驗證涵蓋**：`tasks.md` 的 DoD 要求人工確認 Railway 上 `NUXT_AUTH_PASSWORD` 與 `NUXT_SESSION_PASSWORD` 兩者皆已設定且長度分別 ≥ 8 / ≥ 32。 |
| **R-7** | 兩個下限分歧後，日後有人「順手統一」又把 session 拉回 8。 | 低 | 以測試釘住（AC-1.3：session 必須拒絕 31 字元），並在 `server/utils/auth.ts` 的常數上加註「session 的 32 是 nuxt-auth-utils 的硬性要求，不可調降」。 |
| **R-8**（review round 1 追加） | 長度以 `value.trim().length` 衡量，而 `String.prototype.trim` 只去掉 whitespace 與 BOM，**不含零寬字元**。`"​​​abcde"`（三個 U+200B）因此通過 8 字元下限，但只有 5 個可見字元。 | 極低 | **記錄不修**。這是 AD-4 的已知邊界。擴大 trim 的字元集會動到「衡量什麼」以外的語意（比對用的仍是原字串，見 R-2），且此情境需要操作者主動貼入零寬字元 —— 不是 copy-paste 意外的形狀。真正的補償控制仍是 rate limiter（R-9）。 |
| **R-9**（review round 1 追加） | per-address rate limit 的 key 取自 forwarding header，而 Railway 對這些 header 的語意**公開資料自相矛盾**（[staff：edge strip 掉 XFF、最左可信](https://station.railway.com/questions/security-critical-questions-on-edge-prox-8fddd775) vs [staff：client 可偽造但 edge 是 append、最左可信](https://station.railway.com/questions/which-header-should-i-rely-on-for-real-c-d78a6f96) —— 後者本身矛盾，同串社群回答則說 append、只有最右可信）。若賭錯邊，攻擊者每次請求換一個偽造值就能拿到全新的 bucket。 | 中 | **已緩解**。(1) key 依序取 `X-Real-IP` → `X-Envoy-External-Address` → XFF 最右 → socket → 共用 `unknown`，前兩者由 edge 覆寫、client 寫不進來，每一層都過 `isIpAddress`；(2) 另加**不分來源的全域上限** 30 次/分鐘（`LOGIN_ATTEMPTS_GLOBAL`），無論 key 怎麼解析、無論 Railway 的語意最後是哪一種，總猜測速率都被封死 —— 8 字元下限因此不再懸在一個無法確認的外部行為上。**殘留**：全域上限是共用的，攻擊流量會連帶讓正常使用者在該分鐘內吃到 429（一分鐘的鎖定，接受）；且它與 R-3 一樣是單 instance 的計數。 |
| **R-10**（review round 1 追加） | `/api/health` 改為**任何 method 都回 200**（原 `.get.ts` 只註冊 GET，實測 `HEAD` 回 404）。 | 極低 | **刻意接受**。Railway 的[官方文件](https://docs.railway.com/guides/healthchecks)只寫「輪詢到收到任何 2xx」，**沒有記載探針用哪個 method**，而 HEAD 是探針的慣例作法 —— 把 AC-3.6 的「限縮 method 表面」換成「探針一定打得中」在 production 掛掉時明顯划算。此 handler 回固定常數、不碰 I/O、不讀組態、不持有狀態，沒有 method 能擴大的表面。以 `tests/e2e/health.e2e.test.ts` 釘住（GET/HEAD/POST/PUT/DELETE/OPTIONS 皆須 2xx）。 |
| **R-11**（review round 1 追加） | 啟動時新增 `NUXT_API_KEY` 非空與 `NUXT_API_BASE_URL` 合法 URL 的斷言後，這兩個變數變成**啟動的硬性條件**：既有部署若漏設，升級後會從「啟動但每個請求失敗」變成「啟動失敗」。 | 低 | **刻意如此**（fail fast）。啟動失敗時 Railway 不會切換流量，舊 deployment 繼續服務；「健康但不可用」則會把壞的版本推上線。錯誤訊息直接點名變數，`.env.example` 與 `README.md` 已同步。刻意**不**做上游連通性檢查（不論在啟動或 health 端點）—— 那會讓上游抖一下就害部署失敗或服務重啟。 |

---

## Acceptance Criteria

See `tasks.md`.

## Assumptions

1. Railway healthcheck 只接受 2xx；3xx 判定為失敗（由部署日誌 `failed with HTTP 302` 佐證）。
2. `healthcheckTimeout` 的單位是秒，語意為「允許 replica 變 healthy 的總時窗」。
3. Railway 目前是單一 replica（沿用 auth-hardening assumption 1）。R-3 的成立以此為前提。
4. nuxt-auth-utils 對 session password 的 32 字元要求不會放寬；即使放寬，本專案也維持 32。
5. 使用者會在 Railway 重新設定 `NUXT_AUTH_PASSWORD` 為 8–15 字元的**隨機**字串；
   本 spec 只負責讓該長度可被接受，不負責替他產生。
