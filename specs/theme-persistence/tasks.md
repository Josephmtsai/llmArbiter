# Tasks: Theme Persistence

## Feature ID
`theme-persistence`

執行順序：Task 1 → 2 → 3 → 4。

---

## Task 1 — `app.vue` 綁定 reactive theme
**File:** `app.vue`

`useHead` 的 `data-theme` 由寫死的 `'dark'` 改為 `useTheme()` 回傳的 `theme` ref。

### AC
- [ ] AC-1.1: Given `app.vue`，When grep `'dark'`，Then 不再有寫死的 `data-theme: 'dark'`。
- [ ] AC-1.2: Given SSR 輸出，When 檢視 `<html>`，Then `data-theme` 屬性存在且為 `dark`（伺服器端無 localStorage，預設值不變）。

---

## Task 2 — `useTheme` 交出 DOM 控制權
**File:** `composables/useTheme.ts`

`apply()` 移除 `document.documentElement.setAttribute(...)`，只保留 state 更新與 `localStorage.setItem`。

### AC
- [ ] AC-2.1: Given `composables/useTheme.ts`，When grep `setAttribute`，Then 無結果。
- [ ] AC-2.2: Given 呼叫 `toggle()`，When 檢查 `localStorage['arb-theme']`，Then 值已更新。
- [ ] AC-2.3: Given `localStorage` 沒有 `arb-theme`，When 呼叫 `init()`，Then `theme.value === 'dark'`。

---

## Task 3 — 消除閃爍
**File:** `nuxt.config.ts`

在 `app.head.script` 加入一段 inline script，於首次繪製前讀 `localStorage['arb-theme']` 並設定 `document.documentElement.dataset.theme`。內容為寫死常數，不含任何使用者輸入。須用 try/catch 包住（無痕視窗或封鎖 site data 時 localStorage 存取本身會 throw）。

### AC
- [ ] AC-3.1: Given `localStorage['arb-theme'] = 'light'`，When 重新整理任何頁面，Then 從第一幀起 `data-theme` 就是 `light`，不出現 dark 閃爍。
- [ ] AC-3.2: Given 瀏覽器封鎖 site data（localStorage 讀取 throw），When 載入頁面，Then 頁面正常渲染為 dark，console 無未捕捉的例外。

---

## Task 4 — 測試
**File:** `tests/useTheme.test.ts`（新增）

### AC
- [ ] AC-4.1: Given `pnpm test`，When 執行，Then 新測試涵蓋「還原 light」「toggle 寫入 localStorage」「無儲存值時預設 dark」三情境且全部通過。
- [ ] AC-4.2: Given `pnpm test:coverage`，When 執行，Then 四項門檻皆未下降（41 / 41 / 51 / 78）。
- [ ] AC-4.3: Given `pnpm lint:check`、`pnpm vue-tsc`、`pnpm build`，When 執行，Then 三者 exit 0。

---

## 端對端驗收（QA）
- [ ] AC-E2E-1: dark → 切換到 light → 重新整理 → 仍是 light。
- [ ] AC-E2E-2: light → 切換到 dark → 重新整理 → 仍是 dark。
- [ ] AC-E2E-3: 切換鈕的圖示狀態與實際 `data-theme` 一致（修正前兩者會不同步）。
