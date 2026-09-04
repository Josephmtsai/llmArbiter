# Spec: Tooling Baseline

## Feature ID
`tooling-baseline`

## Summary
專案 `CLAUDE.md` / `AGENTS.md` 宣告的工程準則（ESLint + Prettier、husky + lint-staged、覆蓋率門檻、CI lint）目前**沒有任何一項實際生效**：`pnpm lint` 直接失敗（沒有 `eslint.config.js`）、沒有 `.prettierrc`、沒有 `.husky/`、`vitest.config.ts` 沒有 coverage 設定、CI 只跑 type-check + `vitest run --passWithNoTests` + build。本 feature 把這些工具鏈補到「可執行、可擋錯、不會立刻紅燈」的基線，並把現況與文件不符之處（rsbuild、Tailwind、pre-commit 步驟）列為 Open Questions 交由 Human Gate 決定。

## Source doc
- SA 體檢報告 P1「Tooling baseline」（artifact `arbiter-sa-assessment`）
- `CLAUDE.md` §2 程式碼品質與自動化、§5 測試與提交
- `AGENTS.md` §1、§2、§6

## Current State（SA 實測，2026-09-04）

| 項目 | 現況 |
|------|------|
| ESLint | `eslint@9.39.4` 已安裝，但無 flat config → `pnpm lint` 報 "couldn't find an eslint.config.(js\|mjs\|cjs) file" |
| ESLint plugins | 未安裝 `eslint-plugin-vue` / `typescript-eslint` / `@nuxt/eslint` |
| Prettier | `prettier@3.8.3` 已安裝，無 `.prettierrc` / `.prettierignore` |
| husky / lint-staged | 未安裝，`package.json` 無 `prepare` script，`.git/hooks` 只有 sample |
| Vitest coverage | `@vitest/coverage-v8` 已安裝，`vitest.config.ts` 無 `coverage` 區塊、無 thresholds |
| 覆蓋率（上次 `coverage/` 產出，未設 include） | statements 22.41% / functions 50.36% / branches 75.33%，55 個檔案 |
| 測試檔 | `tests/*.test.ts` 共 4 支（evalDisplay、optimizerHistory、optimizerOverview、optimizerState） |
| CI | verify job：install → nuxt prepare → vue-tsc → `vitest run --passWithNoTests` → build；**無 lint、無 coverage** |
| `package.json` scripts | `test: "vitest"`（watch 模式）、`test:coverage: "vitest --coverage"`、`lint: "eslint . --fix"` |
| 程式碼風格（grep 實測） | 分號：`.ts` 與 `.vue <script>` **0 行**以分號結尾；字串一律單引號；多行結尾 trailing comma；2 空白縮排 |
| 超過 100 字元的行 | 共 398 行：`.ts` 56、`.vue <script>` 95、`.vue <template>` 134、`.vue <style>` 50 |
| `console.*` / `any` | 皆 0 處（規則開 error 不會造成基線違規） |
| inline `style=` | 29 處（ESLint 預設不管；屬 Tailwind Open Question） |
| Tailwind 實際使用 | 40 個 `.vue` 中只有約 13 處 utility class；`<style scoped>` 共 5,187 行，樣式主要走 `design-tokens.css` CSS 變數 |
| rsbuild | 未安裝，`nuxt.config.ts` 未設 `builder`；README 已寫「optional future optimization」 |
| Dockerfile | `pnpm install --frozen-lockfile` 在 `COPY . .` 之前執行，且 `.dockerignore` 排除 `.git/` → 加 `prepare` script 後必須確保 husky 在容器內不會失敗 |

## Scope

### In Scope
1. **`eslint.config.js`**（flat config）：`eslint-plugin-vue` `flat/strongly-recommended`（= Priority A + B）、`typescript-eslint` recommended、`eslint-config-prettier` 置於最後關閉格式類規則；自訂規則 `no-console: error`、`@typescript-eslint/no-explicit-any: error`、`max-len` / `vue/max-len` 100；`ignores` 含 `.nuxt`、`.output`、`node_modules`、`coverage`、`.husky`。
2. **`.prettierrc` + `.prettierignore`**：`semi: false`、`singleQuote: true`、`printWidth: 100`、`tabWidth: 2`、`trailingComma: "all"`（全部依現況決定，避免大規模 reformat）。
3. **husky + lint-staged**：`prepare: "husky"`、`.husky/pre-commit` 跑 `lint-staged` + `vitest run --changed`；`.husky/pre-push` 跑 `pnpm vue-tsc` + `pnpm test`（拆分理由見 AD-4，需 Human Gate 決定）；Dockerfile build stage 加 `ENV HUSKY=0`。
4. **`vitest.config.ts` coverage**：provider v8、reporter `text` + `lcov`、`include` 限定 `pages/ components/ composables/ stores/ utils/ server/ middleware/`、thresholds `lines 20 / statements 20 / functions 45 / branches 70`，並以註解記錄 ratchet 規則。
5. **`package.json` scripts**：`test` → `vitest run`、新增 `test:watch: "vitest"`、`test:coverage` → `vitest run --coverage`、新增 `lint:check: "eslint ."`（`lint` 維持 `--fix`）。
6. **CI `.github/workflows/ci.yml`**：verify job 新增 `pnpm lint:check` 步驟、Test 步驟改 `pnpm test:coverage`、移除 `--passWithNoTests`。
7. **基線修正（Baseline）**：首次執行 ESLint 後，能 `--fix` 的自動修；其餘以最小改動修到 **0 error**（warning 允許）；任一規則違規 > 50 處者暫降為 `warn` 並記錄在本 spec「Baseline Log」。
8. **新增依賴**（`pnpm add -D`，版本為 SA 於 2026-09-04 以 `pnpm view` 查得的最新 major）：
   - `eslint-plugin-vue@^10`（10.10.0）
   - `typescript-eslint@^8`（8.69.0）
   - `eslint-config-prettier@^10`（10.1.8）
   - `husky@^9`（9.1.7）
   - `lint-staged@^17`（17.4.1；需 Node ≥ 20.17，專案 engines `20.19.x` 符合）

### Out of Scope
- 修改 `CLAUDE.md` / `AGENTS.md` / `README.md` 內容（rsbuild、Tailwind、pre-commit 條目留給 Open Questions 決定後另開 `docs:` commit）。
- 消除 29 處 inline style 或把 scoped CSS 改寫成 Tailwind。
- 提升覆蓋率到 80%（本 feature 只鎖住現況不倒退；`stores/`、`server/`、多數 `pages/` 目前 0% 覆蓋，由後續 feature 逐步補）。
- CI 加入 `prettier --check`（lint-staged 已在本地強制；等 baseline 穩定後再加）。
- 上傳 lcov 到 Codecov 等外部服務。
- 修改 `vitest.config.ts` 現有的 `@ts-expect-error`（Vite 5/7 型別衝突，與本 feature 無關）。

## Architecture Decision

### AD-1：ESLint plugin 方案 — 採 `eslint-plugin-vue` + `typescript-eslint`，不用 `@nuxt/eslint`

| 方案 | 新增直接依賴 | 優點 | 缺點 |
|------|-------------|------|------|
| **A. `eslint-plugin-vue` + `typescript-eslint` + `eslint-config-prettier`（採用）** | 3 | 設定完整存在 repo；`pnpm lint` 在 fresh clone 不需先 `nuxt prepare`；pre-commit hook 不依賴 `.nuxt/` | 需手動關閉 `no-undef`（Nuxt auto-import 的 `ref`、`definePageMeta`、`useRuntimeConfig` 等由 TS 檢查，ESLint 不需重複） |
| B. `@nuxt/eslint` | 1（但會以 transitive 拉入 A 的套件） | 自動產生 auto-import globals；Nuxt 官方 | 需在 `nuxt.config.ts` 註冊 module；config 由 `.nuxt/eslint.config.mjs` 產生，**lint 前必須 `nuxt prepare`**，pre-commit 在乾淨環境會失敗 |

「最少新增依賴」若只看直接 devDependencies 是方案 B，但 B 的執行前提（`.nuxt/` 存在）與 pre-commit hook 目標衝突，且 transitive 依賴其實相同。採 A。

### AD-2：`vue/multi-word-component-names` 在 `pages/**`、`layouts/**`、`app.vue` 關閉
Nuxt 路由檔名（`cases.vue`、`index.vue`、`login.vue`、`default.vue`、`[run_id].vue`）由框架決定，無法改成多字；`components/**` 維持啟用。

### AD-3：Prettier 選項完全依現況
實測 `.ts` 與 `.vue <script>` 沒有任何分號、字串全部單引號、多行結尾有 trailing comma，因此 `semi: false` / `singleQuote: true` / `trailingComma: "all"`。`printWidth: 100` 與 CLAUDE.md 一致；預期首次 `prettier --write` 會重排約 150 行 script/ts 與部分 template（398 行超長中有 50 行在 `<style>`，Prettier 也會處理 CSS）。這是一次性 `chore:` commit，須與規則設定 commit 分開，方便 review。

### AD-4：pre-commit 只跑 lint-staged + 相關測試，vue-tsc 與全量測試移到 pre-push（**需 Human Gate 決定**）
CLAUDE.md §5 要求 pre-commit hooks 為「ESLint fix → Prettier format → vue-tsc → test」四步。實際限制：
- `pnpm vue-tsc` script 是 `nuxt prepare && vue-tsc --noEmit`，全專案跑一次通常 30–90 秒，且 `nuxt prepare` 會寫 `.nuxt/`。
- vue-tsc 無法只針對 staged 檔案做型別檢查（型別是跨檔案的）。
- 每次 commit 等 1 分鐘以上會導致開發者用 `--no-verify` 繞過，反而失去保護。

**Option 1（SA 建議，預設）**
```
pre-commit : lint-staged（eslint --fix + prettier --write，只針對 staged *.ts / *.vue）
             → vitest run --changed --passWithNoTests（只跑與變更相關的測試）
pre-push   : pnpm vue-tsc → pnpm test（全量）
```
CI 仍完整跑 lint:check + vue-tsc + coverage + build，作為最終防線。

**Option 2（嚴格照 CLAUDE.md）**：四步全放 pre-commit。代價是每次 commit 等 1 分鐘以上。若選此項，CLAUDE.md 不需改；若選 Option 1，需同步把 CLAUDE.md §5 / AGENTS.md §2 的 Pre-commit 條目改成「pre-commit: lint-staged + 相關測試；pre-push: vue-tsc + 全量測試」（另開 `docs:` commit）。

`vitest run --changed` 在沒有相關測試時會回 "No test files found" 並 exit 1，因此 hook 內保留 `--passWithNoTests`；CI 的全量 `vitest run --coverage` 則移除該旗標（CI 有 4 支測試，不會沒有測試）。

### AD-5：husky 與 Docker / Railway build 的相容
`prepare: "husky"` 會在每次 `pnpm install` 執行。Dockerfile build stage 在 `COPY . .` 之前跑 `pnpm install --frozen-lockfile`，且 `.dockerignore` 排除 `.git/`。husky 9 在找不到 `.git` 時只印訊息不會 exit 1，但為避免版本行為差異，Dockerfile build stage 明確加 `ENV HUSKY=0`（husky 官方支援的跳過方式）。GitHub Actions 有 `.git`，husky 正常安裝但不影響 CI 步驟。

### AD-6：coverage thresholds 起點與 ratchet 規則
- `include` 縮到業務程式碼目錄後，分母會改變（現在的 22.41% 含 `app.vue`、`nuxt.config.ts`、`tailwind.config.ts`、`layouts/`）。Developer 必須在設定 `include` 後**重新量測**，確認 20/20/45/70 不會紅燈；若量測值低於門檻，以「量測值向下取整再減 2」為門檻並記錄在 Baseline Log。
- Ratchet 規則（寫進 `vitest.config.ts` 註解）：每個 feature 的 `handoff-dev.json` 附上跑完的 coverage 數字，thresholds 至少調到「新量測值 − 2」，只升不降。目標 80%（CLAUDE.md）。

### AD-7：`max-len` 的 ignore 選項
`max-len`（`.ts`）與 `vue/max-len`（`.vue`，涵蓋 template）皆設 `code: 100`，並開 `ignoreUrls`、`ignoreStrings`、`ignoreTemplateLiterals`、`ignoreRegExpLiterals`；`vue/max-len` 另開 `ignoreHTMLAttributeValues`、`ignoreHTMLTextContents`。理由：超長字串（Google Fonts URL、log snippet 假資料、class 串）拆行只會降低可讀性；Prettier 已負責可自動換行的部分。

## Baseline Log
（Developer 填寫：首次 `pnpm lint:check` 的統計、被暫降為 `warn` 的規則與數量、重新量測的 coverage 數字。）

| 規則 | 首次違規數 | 處置 |
|------|-----------|------|
| _待填_ | | |

Coverage（設定 `include` 後重新量測）：lines __ / statements __ / functions __ / branches __

## Open Questions（Human Gate 決定）

> **Human Gate 決議（2026-09-05）**：三題皆採 SA 建議 — OQ-1 選 A（刪除 rsbuild 規則）、OQ-2 選 A（改寫 Tailwind 規則並加 `vue/no-static-inline-styles: warn`）、OQ-3 採 Option 1（vue-tsc 與全量測試放 pre-push）。CLAUDE.md / AGENTS.md 的對應文件修改以獨立 `docs:` commit 處理。

### OQ-1：CLAUDE.md / AGENTS.md 的 rsbuild 條目
現況：未安裝、未設定，README 說「optional」；README 提到的 `@nuxt/rsbuild` 套件 SA 未能確認為官方套件。
- **Option A — 刪除規則**：把 §1 Build Tool 改為「Nuxt 預設 Vite builder」。影響：零程式碼變動，文件與現況一致。
- **Option B — 導入 rsbuild**：另開 feature 評估 Nuxt 3.15 對 rsbuild builder 的支援度、Vitest 仍走 Vite 的雙 bundler 維護成本、Railway build 時間。影響：中等風險，收益（build 速度）對目前專案規模不明顯。
- SA 建議：A。

### OQ-2：CLAUDE.md / AGENTS.md 的 Tailwind 條目
現況：Tailwind module 已安裝且 `tailwind.config.ts` 有完整 token，但實際只有約 13 處 utility class；5,187 行 scoped CSS 走 `design-tokens.css` CSS 變數；29 處 inline style。「禁止內聯 style；優先使用 Tailwind utility classes」規則從未被執行。
- **Option A — 改寫規則以符合現況**：改為「樣式優先使用 `design-tokens.css` CSS 變數 + scoped CSS；禁止 inline style；Tailwind 僅用於 layout utility」。影響：文件修改；29 處 inline style 仍需另開 feature 清理。
- **Option B — 維持規則並逐步遷移**：新程式碼一律 Tailwind，舊 CSS 分階段遷移。影響：5,000 行 CSS 遷移是長期債，且與 design-tokens 雙軌。
- SA 建議：A，並把 `vue/no-static-inline-styles: warn` 納入本 feature 的 ESLint 設定，讓 inline style 至少可見（不阻擋）。

### OQ-3：pre-commit 拆分（AD-4 Option 1 vs Option 2）
SA 建議 Option 1。若採 Option 1，需要同意另開 `docs:` commit 修改 CLAUDE.md §5 與 AGENTS.md §2。

## Acceptance Criteria
See `tasks.md`.
