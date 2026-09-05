# Spec: Theme Persistence

## Feature ID
`theme-persistence`

## Summary
使用者切換到 light 主題後重新整理頁面，主題會跳回 dark。`localStorage['arb-theme']` 有正確寫入 `light`，但 reload 後 `document.documentElement` 的 `data-theme` 仍是 `dark`。本 feature 修正還原流程，並消除切換當下的閃爍（FOUC）。

## Source
- `specs/guide-flow-diagrams/handoff-dev.json` 的 `observations`（Developer 在視覺驗證時實測發現，當時不在範圍內故只回報）
- `specs/tooling-baseline/handoff-dev.json` 的 `observations`

## Current State（實測）

| 檔案 | 現況 |
|------|------|
| `composables/useTheme.ts` | `useState<Theme>('theme', () => 'dark')`；`apply()` 同時 `setAttribute` 與 `localStorage.setItem`；`init()` 讀 localStorage 後呼叫 `apply` |
| `layouts/default.vue:4` | `onMounted(init)` |
| `app.vue:2-4` | `useHead({ htmlAttrs: { 'data-theme': 'dark' } })` — **寫死字串** |

## Root Cause
`app.vue` 的 `useHead` 把 `data-theme` 宣告為常數 `'dark'`。unhead 在 hydration 與後續 patch 時會依自己的 head entry 還原該屬性，覆蓋掉 `init()` 用 `document.documentElement.setAttribute()` 直接寫進去的值。兩者是各自獨立的 source of truth，unhead 贏。

`init()` 本身沒有錯——它讀到的 `saved` 是正確的 `light`，`theme` state 也變成 `light`，只有 DOM 屬性被蓋回去。因此畫面是 dark、但任何依賴 `theme` state 的 UI（主題切換鈕的圖示）會顯示 light，兩者不一致。

## Scope

### In Scope
1. `app.vue`：`data-theme` 改為綁定 `useTheme()` 的 `theme` ref，讓 unhead 成為唯一的 source of truth。
2. `composables/useTheme.ts`：`apply()` 移除手動 `setAttribute`（改由 unhead 負責），保留 `localStorage.setItem`。
3. `nuxt.config.ts`：加入一段 render-blocking 的 inline head script，在首次繪製前依 `localStorage['arb-theme']` 設好 `data-theme`，避免 SSR 送出 dark、hydration 後才翻成 light 的閃爍。
4. 測試：新增 `tests/useTheme.test.ts` 覆蓋 還原 / 切換 / 無 localStorage 值 三種情境。

### Out of Scope
- 新增「跟隨系統」(`prefers-color-scheme`) 選項。
- 改動 `assets/css/design-tokens.css` 的任何 token。
- 主題切換的動畫或轉場。

## Architecture Decision

### AD-1：以 unhead 為單一 source of truth，而非在 `init()` 裡想辦法覆蓋 unhead
把 `useHead` 的值綁到 reactive ref，unhead 會自動 patch DOM。相反方向（保留寫死的 head entry、在 `init()` 之後再 `setAttribute` 一次）只是跟 unhead 搶同一個屬性，任何一次 head patch 都會再把它蓋回去，是治標。

### AD-2：inline script 而非只靠 `onMounted`
`onMounted` 在 hydration 之後才跑，使用者會先看到一幀 dark。CLAUDE.md §3 禁止未 sanitize 的 `v-html`，但本 script 是寫死的常數字串、不含任何使用者輸入，經由 `nuxt.config.ts` 的 `app.head.script` 注入，不涉及 XSS 面。

## Acceptance Criteria
See `tasks.md`.

---

## Findings During Implementation

SA 階段漏掉的兩處，實作時發現並一併處理：

1. **`nuxt.config.ts:14` 也有一份寫死的 `htmlAttrs: { 'data-theme': 'dark' }`。** 原 spec 只記錄了 `app.vue` 那一處。兩個 head entry 搶同一個屬性是同一個 bug class，已移除，改由 `app.vue` 的 ref 綁定單獨負責。

2. **`init()` 只掛在 `layouts/default.vue`，`layouts/auth.vue` 沒有。** 因此 `/login` 這類使用 auth layout 的頁面根本不會還原主題——inline script 設好的值還會被 unhead 蓋回 dark。已把 `onMounted(init)` 移到 `app.vue`，一處涵蓋所有 layout。

## AC-3.2 的實測結果（部分不達標，原因非本 feature）

在 headless Chrome 用 `Object.defineProperty` 讓 `window.localStorage` 的 getter 直接 throw（等同 Chrome 封鎖 site data 的真實行為）實測：

- **主題部分通過**：`data-theme` 維持 `dark`，`useTheme` 不再拋出任何例外。
- **頁面部分不通過**：Nuxt 仍在 app 初始化階段捕捉到 `SecurityError: blocked` 並渲染 500 錯誤頁。

根因**不在本 feature**：`nuxt-auth-utils` 的 client plugin 在初始化時無防護地呼叫
`localStorage.getItem("temp-nuxt-auth-utils-popup")`。

已用實驗證明其為既有缺陷，而非本次變更造成：把本 feature 的 5 個檔案 `git stash` 後重新 build 並跑同一個測試，結果**完全相同**（同樣的 `[nuxt] error caught during app initialization SecurityError: blocked`、同樣的 500 頁）。

建議另開 issue 處理 `nuxt-auth-utils` 的封鎖情境，不在本 feature 範圍內修改第三方模組行為。

### 更正：AC-3.2 已修復（review round 1 之後）

上一節把 AC-3.2 的失敗歸為「既有缺陷、不在範圍內」。codex-reviewer 判定這是 BLOCKER，理由成立——歸咎於第三方不會讓驗收條件通過。

修法：pre-paint script 追加一層保護。它位於 `<head>`，早於 Nuxt entry bundle 與所有 module plugin 執行；偵測到 `localStorage` getter 拋出時，就地安裝一個記憶體內的 Storage 替代品，`nuxt-auth-utils` 那段無防護的 `getItem` 因此取得 `null` 而非例外。

之所以不能用 `plugins/` 解決：Nuxt 先註冊 module plugin、再註冊 app plugin，使用者的 plugin 排不到 `nuxt-auth-utils` 前面。`<head>` script 可以。

替代品僅存在記憶體、不寫入任何持久化儲存，因此使用者「封鎖 site data」的隱私設定仍然被尊重——差別只在頁面會正常渲染而不是死掉。

CDP 實測（封鎖 site data）：無 500、登入表單正常渲染、`data-theme=dark`、零未捕捉錯誤、已 hydrate。
