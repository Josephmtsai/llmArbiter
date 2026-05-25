# Vue 3 + Nuxt.js 專案規範與工程準則

本檔是 Codex 的專案指示入口，內容由 `CLAUDE.md` 搬移並補上 Codex 工作方式。開始任何實作前，先閱讀 `README.md` 的 Tech Stack、Code Standards、Codex Task Checklist，以及 `docs/for-claude-design.md` 中被 README 指到的設計與型別規格。

## 1. 環境與依賴管理 (Environment)
- **Runtime**: Node.js 20+，透過 `.nvmrc` 或 `.node-version` 管理。
- **Package Manager**: 統一使用 **pnpm**。
- **Build Tool**: **rsbuild**，搭配 Nuxt.js rsbuild 整合。
- **Dependencies**:
  - 核心依賴記錄於 `package.json`，鎖定版本使用 `pnpm-lock.yaml`。
  - 禁止混用 npm / yarn / pnpm。
  - 嚴禁直接修改 `node_modules`。

## 2. 程式碼品質與自動化 (Quality & Automation)
- **Linting & Formatting**: 統一使用 **ESLint** + **Prettier**。
  - 遵循 Vue 3 官方風格指南 Priority A 與 Priority B rules。
  - 單行長度上限 100 字元；縮排 2 格空白。
  - 指令: `pnpm lint` / `pnpm format`。
- **Strict TypeScript**:
  - `tsconfig.json` 啟用 `strict: true`。
  - 所有 composables、props、emits 必須有完整型別。
  - 嚴禁使用 `any`。若第三方庫限制，須加 `// @ts-expect-error` 並加註釋說明。
  - 驗證: `pnpm vue-tsc --noEmit`。
- **禁令**:
  - 嚴禁 `console.log()`，請用統一的 logger utility。
  - 嚴禁 `v-html` 使用未 sanitize 的輸入。
  - 不直接修改 bug 後混入 main；開 feature branch 修正、提交，再 merge。
- **功能修改**:
  - 確保修改不影響既有功能；若有影響，應先提出分析。

## 3. 安全與防禦性設計 (Security & Resilience)
- 嚴禁 hardcode secret，統一由 `.env` 讀取，Nuxt 透過 `runtimeConfig`。
- 前端不得存放任何 private key；`runtimeConfig.public` 只放可公開的值。
- XSS 防護：避免 `v-html`，若必要使用 `DOMPurify` sanitize。
- API 呼叫統一透過 Nuxt `useFetch` / `$fetch`，不直接使用 raw `fetch` 或 axios。

## 4. 工程哲學與架構 (Architecture)
- **KISS & YAGNI**: 不預先設計複雜抽象；三處相似邏輯才考慮提取 composable。
- **Composition API 優先**: 一律使用 `<script setup lang="ts">`，禁止 Options API。
- **組件設計**:
  - UI 展示組件不含業務邏輯，業務邏輯放 composables。
  - Props 從父傳子，events 從子往父，跨元件狀態用 Pinia store。
  - 組件檔名使用 PascalCase；composable 檔名使用 camelCase 並加 `use` 前綴。
- **Nuxt 慣例**:
  - `pages/`: 路由頁面
  - `components/`: 可複用 UI 組件，自動 import
  - `composables/`: 可複用邏輯，自動 import
  - `stores/`: Pinia stores
  - `server/api/`: Nuxt server routes
  - `assets/`: 靜態資源
- **Pinia**:
  - Store 使用 Composition API 風格，`defineStore` with setup function。
  - 禁止在 store 外部直接 mutate state。
- **Tailwind CSS**:
  - 禁止 inline style，優先使用 Tailwind utility classes。
  - 自訂 token 統一寫入 `tailwind.config.ts`，避免魔術數字。
  - 響應式斷點遵循 mobile-first 原則。

## 5. 測試與提交 (CI/CD & Git)
- **測試**: 使用 **Vitest** + **Vue Test Utils**。
  - 新功能必含測試，目標覆蓋率 80%+。
  - 指令: `pnpm test` / `pnpm test:coverage`。
- **Commit**: 遵循 Conventional Commits: `feat`, `fix`, `docs`, `test`, `chore`。
- **Pre-commit**: 本地應啟用 `lint-staged` + `husky`。
  - Hooks: ESLint fix -> Prettier format -> vue-tsc -> test。

## 6. Codex 與 README 工作順序
- README 的 **Codex Task Checklist** 是目前實作順序來源；每次開始任務先確認 checklist 與實際檔案狀態是否一致。
- 型別來源以 `types/api.ts` 與 `docs/for-claude-design.md` section D 為準。
- API integration 遵守 README：所有 API 經由 `$fetch` / `useFetch`，並帶 `X-API-Key`。
- Railway、rsbuild、環境變數設定依 README 內容完成。
- 若需要使用 OpenSpec workflow，優先使用已搬到 `.codex/skills` 的 `openspec-*` skills，或全域 Codex prompts `/opsx:explore`, `/opsx:propose`, `/opsx:apply`, `/opsx:archive`。

## 7. Agent Workflow & Handoff Protocol

### 流程

```text
SA  --handoff-sa.json-->  Developer  --spawn-->  codex-reviewer  --PASS-->  QA
                                                                  --FAIL-->  Developer (修正)
```

### 強制規則

1. Developer 完成後，必須先 spawn codex-reviewer agent，等 review PASS 才能 spawn QA。
2. codex-reviewer 回報 FAIL 時，必須回到 Developer 修正，禁止直接 spawn QA。
3. SA 完成後才能啟動 Developer，`handoff-sa.json` 的 `status` 必須為 `ready`。
4. QA 完成後回報使用者，不自動 merge 或 deploy。

### Handoff JSON 格式

存放路徑：`specs/<feature>/handoff-<from>.json`

```json
{
  "from": "sa",
  "to": "developer",
  "feature": "007-auth-flow",
  "status": "ready",
  "summary": "一句話說明做了什麼",
  "artifacts": ["specs/.../spec.md", "specs/.../tasks.md"],
  "assumptions": ["假設一", "假設二"]
}
```

Developer 完成時額外加入：

```json
{
  "from": "developer",
  "to": "qa",
  "feature": "007-auth-flow",
  "status": "ready",
  "summary": "實作了 useAuth composable 與 LoginForm 組件",
  "changed_files": ["composables/useAuth.ts", "components/LoginForm.vue", "stores/auth.ts"],
  "ac_ref": "specs/007-auth-flow/tasks.md"
}
```

### Context Package

| 接收方 | 必讀 | 不需要 |
|--------|------|--------|
| Developer | handoff-sa.json + artifacts 列出的所有文件 | 無限制 |
| QA | handoff-dev.json 的 `ac_ref` + `changed_files`，以及 tasks.md 的 AC 區塊 | 架構決策、ADR、local-setup.md |

### 每個 Agent 的完成義務

- **SA**: 產出 `handoff-sa.json`，artifacts 必須列出所有 spec 文件路徑。
- **Developer**: 產出 `handoff-dev.json`，changed_files 必須完整列出，告知 orchestrator 可以 spawn codex-reviewer。
- **codex-reviewer**: 產出 review report，回報 PASS/FAIL verdict，PASS 才告知 orchestrator 可以 spawn QA。
- **QA**: 不產出 handoff，直接以測試報告回報 orchestrator。

## 8. 知識圖譜 (Knowledge Graph)

專案可建立 graphify 知識圖譜，位於 `graphify-out/graph.json`。

遇到下列情境時，執行 `/graphify query "<問題>"` 查詢圖譜，禁止直接將 graph.json 載入 context：
- 修改跨組件的共用 composable 或 Pinia store
- 回答架構問題或追蹤依賴關係
- 新增功能前確認影響範圍
- 重構前了解社群邊界
