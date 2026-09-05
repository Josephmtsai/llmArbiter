# Tasks: Tooling Baseline

## Feature ID
`tooling-baseline`

執行順序固定：Task 1 → 2 → 3 → 4（baseline 修正）→ 5 → 6 → 7 → 8。Task 4 的 reformat / 自動修正必須獨立成一個 `chore:` commit，與設定檔 commit 分開。

Human Gate 決定的項目（spec.md OQ-1 / OQ-2 / OQ-3）在 Developer 開工前必須有結論；本 tasks.md 以 SA 建議（OQ-2 A + `vue/no-static-inline-styles: warn`、OQ-3 Option 1）撰寫，若 Human Gate 選其他選項，Task 2 與 Task 6 依 spec.md 對應段落調整。

---

## Task 1 — 安裝依賴
**File:** `package.json`, `pnpm-lock.yaml`

```bash
pnpm add -D eslint-plugin-vue@^10 typescript-eslint@^8 eslint-config-prettier@^10 husky@^9 lint-staged@^17
```

不得混用 npm / yarn；不得手動編輯 `pnpm-lock.yaml`。

### AC
- [x] AC-1.1: Given fresh clone，When 執行 `pnpm install --frozen-lockfile`，Then 五個套件出現在 `devDependencies` 且 lockfile 一致（exit 0）。
- [x] AC-1.2: Given `package.json`，When 檢視 `devDependencies`，Then 沒有新增 `@nuxt/eslint`（AD-1）。

---

## Task 2 — ESLint flat config
**File:** `eslint.config.js`（新增）

```js
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

const maxLenOptions = {
  code: 100,
  ignoreUrls: true,
  ignoreStrings: true,
  ignoreTemplateLiterals: true,
  ignoreRegExpLiterals: true,
}

export default tseslint.config(
  {
    ignores: ['.nuxt/**', '.output/**', 'node_modules/**', 'coverage/**', '.husky/**', 'dist/**'],
  },
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/strongly-recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['**/*.{ts,vue,js,mjs}'],
    rules: {
      'no-undef': 'off', // Nuxt auto-imports；型別由 vue-tsc 檢查
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'max-len': ['error', maxLenOptions],
      'vue/max-len': [
        'error',
        { ...maxLenOptions, ignoreHTMLAttributeValues: true, ignoreHTMLTextContents: true },
      ],
      'vue/no-static-inline-styles': 'warn', // OQ-2；29 處既有 inline style
    },
  },
  {
    files: ['pages/**/*.vue', 'layouts/**/*.vue', 'app.vue'],
    rules: { 'vue/multi-word-component-names': 'off' }, // AD-2：Nuxt 路由檔名
  },
  {
    files: ['utils/logger.ts'],
    rules: { 'no-console': 'off' }, // 唯一允許直接使用 console 的檔案（silent-failure-elimination 會建立）
  },
  prettier,
)
```

注意：
- `eslint-config-prettier` 必須放最後，它會關閉 `vue/html-indent`、`vue/max-attributes-per-line`、`vue/html-self-closing` 等與 Prettier 衝突的格式規則。
- `utils/logger.ts` 尚不存在（屬 `silent-failure-elimination` feature），先保留該 override；ESLint 對不存在的檔案 pattern 不會報錯。
- 若 `eslint-plugin-vue@10` 的 config key 名稱與上面不同（例如 `flat/strongly-recommended` 改名），以套件 README 為準並在 handoff-dev.json 註記。

### AC
- [x] AC-2.1: Given `eslint.config.js` 存在，When 執行 `pnpm exec eslint --print-config pages/index.vue`，Then 輸出包含 `vue/require-v-for-key`（Priority A）與 `vue/require-default-prop`（Priority B）且 `vue/attributes-order`（Priority C）不為 error。
- [x] AC-2.2: Given 一個含 `console.log('x')` 的暫時 `.ts` 檔，When 執行 `pnpm lint:check`，Then 回報 `no-console` error 且 exit code ≠ 0。
- [x] AC-2.3: Given 一個含 `const a: any = 1` 的暫時 `.ts` 檔，When 執行 `pnpm lint:check`，Then 回報 `@typescript-eslint/no-explicit-any` error。
- [x] AC-2.4: Given 一個含 101 字元純程式碼（非字串、非 URL）行的暫時 `.ts` 檔，When 執行 `pnpm lint:check`，Then 回報 `max-len` error。
- [x] AC-2.5: Given `pages/cases.vue`，When 執行 `pnpm lint:check`，Then 不出現 `vue/multi-word-component-names`。
- [x] AC-2.6: Given `components/ui/UiButton.vue`（單一檔案），When 執行 `pnpm exec eslint components/ui/UiButton.vue`，Then 不出現 `no-undef`（Nuxt auto-import 不誤報）。
- [x] AC-2.7: Given `.nuxt/` 已由 `nuxt prepare` 產生，When 執行 `pnpm lint:check`，Then 不掃描 `.nuxt/`、`.output/`、`coverage/`（可用 `--debug` 或違規檔案路徑確認）。

---

## Task 3 — Prettier 設定
**File:** `.prettierrc`（新增）, `.prettierignore`（新增）

`.prettierrc`
```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "trailingComma": "all"
}
```

`.prettierignore`
```
.nuxt/
.output/
node_modules/
coverage/
pnpm-lock.yaml
specs/
docs/
openspec/
graphify-out/
*.md
```

理由：`format` script 是 `prettier --write .`，不排除 `specs/`、`docs/`、`*.md` 會把 SA/QA 文件與 openspec 全部重排，污染 diff。

### AC
- [x] AC-3.1: Given 現有 `composables/useApi.ts`，When 執行 `pnpm exec prettier --check composables/useApi.ts`，Then 輸出不含「would reformat」以外的錯誤（可接受因 printWidth 造成的換行差異，但**不得**出現分號或雙引號的變更；用 `prettier --write` 後 `git diff` 驗證）。
- [x] AC-3.2: Given `.prettierignore`，When 執行 `pnpm format`，Then `git status` 中 `specs/`、`docs/`、`openspec/`、`*.md` 沒有任何變更。
- [x] AC-3.3: Given `eslint.config.js` 已含 `eslint-config-prettier`，When 對已 `prettier --write` 過的檔案執行 `pnpm lint:check`，Then 不出現任何 `vue/html-indent`、`vue/max-attributes-per-line`、`vue/html-self-closing` 錯誤（兩者不打架）。

---

## Task 4 — 基線修正（Baseline）
**File:** 所有 `*.ts` / `*.vue`（自動修正）, `eslint.config.js`（必要時降 warn）, `specs/tooling-baseline/spec.md`（Baseline Log）

步驟：
1. `pnpm exec eslint . --format json --output-file coverage/eslint-baseline.json`（或任何暫存路徑）統計每條規則的違規數，抄到 spec.md「Baseline Log」表格（規則、數量）。
2. `pnpm format`（Prettier 先跑）→ `pnpm lint`（`eslint --fix`）。
3. 剩餘 error：若某規則違規數 > 50，在 `eslint.config.js` 將該規則改為 `warn` 並在 Baseline Log 註記「暫降 warn，待 feature ___ 清理」；否則以最小改動逐一修正（不得改變執行邏輯，不得順手重構）。
4. 重複 `pnpm lint:check` 直到 **0 error**。warning 允許。
5. 本 task 的變更獨立 commit：`chore: apply eslint/prettier baseline`。

預期會碰到的規則（SA 預估，實際以步驟 1 為準）：
- `vue/require-default-prop`：約 23 個 optional prop 無預設值；若 > 50 才降 warn，否則加 `withDefaults` 或改為 required。
- `max-len` / `vue/max-len`：Prettier 重排後多數自動消失；剩餘多為 template 長 class / 長字串，已被 ignore 選項排除。
- `vue/no-static-inline-styles`：29 處，本來就是 `warn`。
- `@typescript-eslint/no-unused-vars`：`tsconfig` 已開 `noUnusedLocals`，預期 0。

### AC
- [x] AC-4.1: Given Task 1–3 完成，When 執行 `pnpm lint:check`，Then exit code 0 且 error 數為 0（warning 可有）。
- [x] AC-4.2: Given baseline 修正後，When 執行 `pnpm vue-tsc`，Then exit code 0（自動修正沒有破壞型別）。
- [x] AC-4.3: Given baseline 修正後，When 執行 `pnpm test`，Then 4 支既有測試全部通過。
- [x] AC-4.4: Given baseline 修正後，When 執行 `pnpm build`，Then exit code 0。
- [x] AC-4.5: Given spec.md「Baseline Log」，When 檢視，Then 每條首次違規的規則都有數量與處置；任何降為 `warn` 的規則都有記錄。
- [x] AC-4.6: Given `git log`，When 檢視，Then baseline 自動修正是獨立的 `chore:` commit，不含 Task 2/3/5–8 的設定檔變更。

---

## Task 5 — package.json scripts
**File:** `package.json`

```json
"scripts": {
  "build": "nuxt build",
  "dev": "nuxt dev",
  "generate": "nuxt generate",
  "preview": "nuxt preview",
  "lint": "eslint . --fix",
  "lint:check": "eslint .",
  "format": "prettier --write .",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "vue-tsc": "nuxt prepare && vue-tsc --noEmit",
  "prepare": "husky"
}
```

### AC
- [x] AC-5.1: Given 終端機，When 執行 `pnpm test`，Then Vitest 跑完一次即結束（不進 watch 模式），exit code 反映測試結果。
- [x] AC-5.2: Given 終端機，When 執行 `pnpm test:watch`，Then 進入 watch 模式（手動 `q` 離開）。
- [x] AC-5.3: Given `pnpm lint:check`，When 有 fixable 違規，Then 只回報不修改檔案（`git status` 乾淨）。
- [x] AC-5.4: Given `pnpm test:coverage`，When 執行，Then 產出 `coverage/lcov.info` 並在終端印出 text 摘要。

---

## Task 6 — husky + lint-staged
**File:** `package.json`（`lint-staged` 區塊）, `.husky/pre-commit`（新增）, `.husky/pre-push`（新增）, `Dockerfile`

`package.json` 新增：
```json
"lint-staged": {
  "*.{ts,vue,js,mjs}": ["eslint --fix", "prettier --write"],
  "*.{json,css}": ["prettier --write"]
}
```

`.husky/pre-commit`
```sh
pnpm exec lint-staged
pnpm exec vitest run --changed --passWithNoTests
```

`.husky/pre-push`（OQ-3 Option 1；若 Human Gate 選 Option 2，把這兩行併入 pre-commit 並刪除本檔）
```sh
pnpm vue-tsc
pnpm test
```

`Dockerfile` build stage，在 `RUN pnpm install --frozen-lockfile` 之前加：
```dockerfile
ENV HUSKY=0
```

首次啟用：`pnpm install`（觸發 `prepare`）→ `git config core.hooksPath` 應為 `.husky/_`。

### AC
- [x] AC-6.1: Given 執行過 `pnpm install`，When 執行 `git config core.hooksPath`，Then 輸出 `.husky/_`。
- [x] AC-6.2: Given 暫存一個含 `console.log` 的 `.ts` 檔，When `git commit`，Then commit 被 pre-commit hook 擋下（exit ≠ 0）且訊息含 `no-console`。
- [x] AC-6.3: Given 暫存一個格式不符（例如含分號、雙引號）但無 lint error 的 `.ts` 檔，When `git commit`，Then commit 成功且提交內容已被 Prettier 重排（分號移除）。
- [x] AC-6.4: Given 暫存一個與任何測試無關的檔案變更，When `git commit`，Then `vitest run --changed` 不因「No test files found」而失敗。
- [x] AC-6.5: Given `HUSKY=0` 環境變數，When 在**沒有 `.git/` 的目錄**（模擬 Docker build stage：複製專案到暫存目錄並刪除 `.git`）執行 `pnpm install --frozen-lockfile`，Then exit code 0。若本機有 Docker，改以 `docker build .` 驗證。
- [x] AC-6.6: Given `.husky/pre-push` 存在（Option 1），When `git push` 且 `vue-tsc` 有型別錯誤，Then push 被擋下。
- [x] AC-6.7: Given `.husky/` 目錄，When 執行 `pnpm lint:check`，Then `.husky/**` 不被掃描（Task 2 ignores）。

---

## Task 7 — Vitest coverage thresholds
**File:** `vitest.config.ts`

```ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // @ts-expect-error Nuxt resolves Vite 7 while Vitest 2 types reference Vite 5.
  plugins: [vue()],
  resolve: {
    alias: {
      '~': new URL('.', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'pages/**/*.{ts,vue}',
        'components/**/*.{ts,vue}',
        'composables/**/*.ts',
        'stores/**/*.ts',
        'utils/**/*.ts',
        'server/**/*.ts',
        'middleware/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts'],
      // Ratchet 規則（spec AD-6）：每個 feature 交付時把 thresholds 調到「新量測值 − 2」，只升不降。
      // 目標 80%（CLAUDE.md §5）。起點 = 2026-09-04 量測值向下取整再減 2。
      thresholds: {
        lines: 20,
        statements: 20,
        functions: 45,
        branches: 70,
      },
    },
  },
})
```

設定 `include` 後**重新量測**（AD-6）；若任一項低於門檻，把該項改為「量測值向下取整 − 2」並在 spec.md Baseline Log 記錄四個量測值。

### AC
- [x] AC-7.1: Given `vitest.config.ts` 更新，When 執行 `pnpm test:coverage`，Then exit code 0 且終端 text 報表只列出 `include` 內的目錄（不含 `app.vue`、`nuxt.config.ts`、`tailwind.config.ts`、`layouts/`、`tests/`）。
- [x] AC-7.2: Given 暫時把 `thresholds.lines` 改成 `99`，When 執行 `pnpm test:coverage`，Then exit code ≠ 0 且訊息含 "ERROR: Coverage for lines"（門檻真的會擋）。改回後恢復 exit 0。
- [x] AC-7.3: Given spec.md Baseline Log，When 檢視，Then 四個重新量測的 coverage 數字已填入，且每個 threshold ≤ 對應量測值。
- [x] AC-7.4: Given `vitest.config.ts`，When 檢視，Then thresholds 上方有 ratchet 規則註解。

---

## Task 8 — CI workflow
**File:** `.github/workflows/ci.yml`

verify job 步驟改為：
```yaml
      - name: Prepare Nuxt types
        run: pnpm exec nuxt prepare

      - name: Lint
        run: pnpm lint:check

      - name: Type check
        run: pnpm vue-tsc

      - name: Test (with coverage)
        run: pnpm test:coverage

      - name: Build
        run: pnpm build
```

deploy job 不變。`--passWithNoTests` 移除。

### AC
- [ ] AC-8.1: Given PR 推上 GitHub，When CI verify job 執行，Then 出現 `Lint` 與 `Test (with coverage)` 兩個步驟且全部綠燈。
- [x] AC-8.2: Given `ci.yml`，When grep `passWithNoTests`，Then 無結果。
- [ ] AC-8.3: Given 一個故意含 `console.log` 的 PR（可用暫時 branch 驗證後關閉），When CI 執行，Then verify job 在 `Lint` 步驟失敗，`deploy` job 不執行。
- [x] AC-8.4: Given CI 的 `Lint` 步驟，When 檢視，Then 位於 `Prepare Nuxt types` 之後（保險起見，即使 AD-1 方案不依賴 `.nuxt/`）。

---

## 交付清單（handoff-dev.json 的 `changed_files` 至少包含）
- `package.json`, `pnpm-lock.yaml`
- `eslint.config.js`, `.prettierrc`, `.prettierignore`
- `.husky/pre-commit`, `.husky/pre-push`
- `vitest.config.ts`
- `.github/workflows/ci.yml`
- `Dockerfile`
- `specs/tooling-baseline/spec.md`（Baseline Log 填寫）
- Task 4 自動修正影響的所有 `*.ts` / `*.vue`（列出檔數即可，逐檔清單附在 commit）

> **AC-8.1 / AC-8.3 未勾選**：兩條都要求觀察 GitHub Actions 上的 `Lint` 與 `Test (with coverage)` 步驟實際執行，必須 push 才能驗證。本機無法證實，故保留未勾。其餘 35 條已於 2026-09-05 在 main（ef0555c）基礎上實測通過。
