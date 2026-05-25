# Arbiter — Design Brief for Claude Design

> **目的**：這份文件是給 Claude Design 的完整設計資訊包。
> 包含系統定位、User Flow、Domain 概念、精確 API Schema 與畫面清單。
> 資料來源：`https://artbiter-production.up.railway.app/openapi.json`（直接解析）

---

## A. 系統定位

**Arbiter** 是一個 CI/CD 建構失敗自動決策系統的**管理介面 Demo Site**。

當 Jenkins build 失敗，後端 Arbiter 系統分析 log 並透過 LLM 決定要：
- 重跑 build（`trigger_rebuild`）
- 換機器重跑（`trigger_fallback`）
- 重啟 daemon（`trigger_restart`）
- 通知人工介入（`notify_human`）
- 發送 Email 通知（`send_email`）

**這個前端 Demo Site** 讓使用者可以：
1. 手動貼入 log 測試 AI 決策（核心功能）
2. 查看歷史決策紀錄與統計
3. 調整系統設定（confidence 閾值、LLM provider、system prompt 版本）
4. 管理測試案例並執行評估

**技術棧**：Vue 3 + Nuxt.js + TypeScript + Tailwind CSS（深色主題）

---

## B. 核心 User Flow

### Flow 1：手動分析（最重要）

```
使用者進入 /analyze
  → 貼入 CI build log snippet（大 textarea）
  → 選填：hardware_info（key-value pairs）、fail_count_24h（數字）
  → 點擊「Analyze」→ POST /analyze
  → 顯示決策結果：
      ├── primary_action（大標籤，顏色對應語意）
      ├── side_action（若不為 null 顯示副標籤）
      ├── confidence（帶動畫的進度條 0.0–1.0，顏色三段）
      ├── reason（AI 決策說明）
      └── thinking（可展開的思考過程文字）
```

### Flow 2：決策歷史

```
使用者進入 /decisions
  → 表格顯示歷史決策（時間、action、confidence、source、provider）
  → 篩選器：action / provider / since / until（datetime picker）
  → 點擊單筆展開：查看完整 log_snippet + reason
  → 統計卡片區（GET /decisions/stats?window_hours=24）：
      各 action 數量分佈（圓餅圖或橫條圖）
```

### Flow 3：系統設定（三個 Tab）

```
/settings
  ├── [Rules Tab]
  │     GET /config/rules → 顯示所有規則清單
  │     點擊數值 → inline edit → PATCH /config/rules/{rule_name}
  │
  ├── [Provider Tab]
  │     GET /config/provider → 顯示 active_provider + available_providers
  │     切換下拉 → PATCH /config/provider { provider: "claude" }
  │
  └── [Prompts Tab]
        GET /config/prompts → 顯示版本列表（id, label, 建立時間, 是否啟用）
        點擊「Activate」→ PATCH /config/prompts/{prompt_id}/activate
        點擊「+ 新增」→ 展開表單 → POST /config/prompts { label, content }
```

### Flow 4：測試案例 & 評估

```
/cases
  GET /cases → 分頁列表（limit/offset）
  POST /cases → 新增表單（description, log_snippet, expected_action）
  DELETE /cases/{case_id} → 刪除確認 dialog
  POST /cases/seed → 一鍵載入預設測試集

/evaluate
  POST /evaluate { prompt_version_id: "active" | number }
  → 顯示執行中動畫 → 結果：
      各 case PASS/FAIL、整體正確率（%）、每題 expected vs actual
  GET /evaluate/results?prompt_version_id=N → 查看歷史評估結果
```

---

## C. Domain 概念（必讀）

### primary_action 語意與 UI 顏色

| Action | 語意 | 觸發情境 | 建議顏色 |
|--------|------|---------|---------|
| `trigger_rebuild` | 重跑 Build | flaky test、transient 網路 | 藍色 `#3b82f6` |
| `trigger_fallback` | 換機器重跑 | 硬體異常、資源不足 | 橙色 `#f97316` |
| `trigger_restart` | 重啟 Daemon | service/daemon 崩潰 | 紫色 `#a855f7` |
| `notify_human` | 通知人工 | 原因不明、高風險 | 紅色 `#ef4444` |
| `send_email` | 發送 Email | 正式通知場景 | 灰色 `#6b7280` |

### Confidence 三段區間

| 區間 | 系統行為 | UI 顏色 |
|------|---------|--------|
| `≥ 0.8` | 自動執行 | 綠色 `#22c55e` |
| `0.5 – 0.79` | 執行 + 強制附加 notify_human | 黃色 `#eab308` |
| `< 0.5` | 只通知人工 | 紅色 `#ef4444` |

### Source（觸發來源）

- `manual`：從這個 UI 手動貼 log
- `jenkins`：Jenkins CI 自動觸發
- `redfish`：硬體管理介面觸發

### Side Action

`primary_action` 之外的附加通知，只能是 `notify_human` 或 `send_email`，**可為 null**。
顯示時用較小的次要標籤，null 時不佔版面。

---

## D. 精確 API Schema

**Base URL**：`https://artbiter-production.up.railway.app`
**Auth**：所有請求需帶 header `X-API-Key: {apiKey}`

### TypeScript 型別定義

```typescript
// 通用回應包裝
interface ArbiterResponse<T = Record<string, unknown>> {
  status: 'success' | 'error'
  data: T
  message: string
}

// POST /analyze
interface AnalyzeRequest {
  log_snippet: string               // required
  hardware_info?: Record<string, unknown>  // default: {}
  fail_count_24h?: number           // default: 0
}

// /analyze 回應的 data 欄位（後端動態產出，參考格式）
interface DecisionData {
  primary_action: 'trigger_rebuild' | 'trigger_fallback' | 'trigger_restart' | 'notify_human' | 'send_email'
  side_action: 'notify_human' | 'send_email' | null
  confidence: number               // 0.0 ~ 1.0
  reason: string
  thinking: string | null
  source: 'manual' | 'jenkins' | 'redfish'
  provider: string
  decision_id: number
}

// GET /decisions 參數
interface GetDecisionsParams {
  limit?: number       // 1-200, default 50
  offset?: number      // default 0
  action?: string      // filter by action name
  provider?: string    // filter by provider name
  since?: string       // ISO 8601 datetime
  until?: string       // ISO 8601 datetime
}

// GET /decisions/stats 參數
interface GetStatsParams {
  window_hours?: number  // 1-8760, default 24
}

// GET /config/provider 回應
interface ProviderResponse {
  active_provider: string
  available_providers: string[]
}

// PATCH /config/provider
interface ProviderPatchBody {
  provider: string
}

// PATCH /config/rules/{rule_name}
interface RulePatchBody {
  value: number | string | boolean
}

// POST /config/prompts
interface PromptCreateRequest {
  label: string    // required
  content: string  // required
}

// POST /evaluate
interface EvaluateRequest {
  prompt_version_id: number | 'active'  // default: "active"
}

// GET /evaluate/results 參數
interface GetEvalResultsParams {
  prompt_version_id?: number
}

// POST /cases
interface TestCaseCreateRequest {
  description: string    // required
  log_snippet: string    // required
  expected_action: string // required
  hardware_info?: Record<string, unknown>
}
```

### API 端點一覽

```
GET  /health                                   健康檢查
POST /analyze                                  分析 log → 決策結果

GET  /decisions                                歷史決策列表（分頁＋篩選）
GET  /decisions/stats                          統計（各 action 數量）

GET  /config/rules                             所有規則列表
PATCH /config/rules/{rule_name}               修改單一規則值

GET  /config/provider                          目前 + 可用 providers
PATCH /config/provider                         切換 provider

GET  /config/prompts                           Prompt 版本列表
POST /config/prompts                           新增 Prompt 版本
PATCH /config/prompts/{prompt_id}/activate    啟用指定版本

GET  /cases                                    測試案例列表（分頁）
POST /cases                                    新增測試案例
GET  /cases/{case_id}                          取得單一案例
DELETE /cases/{case_id}                        刪除測試案例
POST /cases/seed                               載入預設測試集

POST /evaluate                                 執行評估
GET  /evaluate/results                         查看評估結果歷史
```

---

## E. 畫面清單

| 路徑 | 頁面 | 核心互動 |
|------|------|---------|
| `/login` | 登入頁 | 輸入 `AUTH_PASSWORD`，POST 到 Nuxt server route 驗證 |
| `/analyze` | 手動分析（首頁） | 貼 log → 看 AI 決策結果 |
| `/decisions` | 決策歷史 | 表格、篩選、統計卡片 |
| `/settings` | 系統設定 | Rules / Provider / Prompts 三個 Tab |
| `/cases` | 測試案例 | CRUD 列表 + seed 按鈕 |
| `/evaluate` | 評估 | 執行評估 + 結果展示 |

---

## F. 元件清單

### Layout / 全域

| 元件 | 說明 |
|------|------|
| `AppNavbar` | 頂部 nav，頁面連結 + Logout |
| `AppSidebar`（可選） | 側邊選單版本（視 RWD 需求） |
| `ApiErrorBanner` | 全域 API 錯誤提示橫幅 |
| `LoadingSkeleton` | 資料載入中的骨架屏 |
| `EmptyState` | 無資料時的空狀態插圖 + 文字 |

### 通用 UI 元件

| 元件 | Props |
|------|-------|
| `ActionBadge` | `action: string` → 顏色標籤 |
| `ConfidenceMeter` | `value: number` → 進度條 + 百分比 + 顏色 |
| `SourceBadge` | `source: string` → manual / jenkins / redfish 標籤 |
| `ProviderChip` | `provider: string` → ollama / claude / codex 標籤 |
| `ConfirmDialog` | 刪除確認 modal |

### 分析頁

| 元件 | 說明 |
|------|------|
| `LogInputForm` | `log_snippet` textarea + `hardware_info` key-value 動態欄位 + `fail_count_24h` input |
| `DecisionResultCard` | 完整決策結果展示（action / side_action / confidence / reason） |
| `ThinkingPanel` | 可展開 accordion，顯示 thinking 文字（monospace 字型） |

### 決策歷史頁

| 元件 | 說明 |
|------|------|
| `DecisionsTable` | 分頁表格，欄位：時間 / action / confidence / source / provider |
| `DecisionFilters` | action / provider 下拉 + since / until datetime 輸入 |
| `DecisionDetailDrawer` | 側邊 drawer，展開顯示 log_snippet + reason |
| `StatsCards` | 各 action 數量的卡片或圓餅圖 |

### 設定頁

| 元件 | 說明 |
|------|------|
| `RuleEditor` | 顯示規則 key/value，inline edit 後 PATCH |
| `ProviderSelector` | 目前 provider 顯示 + 切換下拉選單 |
| `PromptVersionList` | 版本列表（id / label / 建立時間 / 啟用中標示）+ Activate 按鈕 |
| `PromptCreateForm` | label + content（textarea）+ 送出 |

### 測試 & 評估頁

| 元件 | 說明 |
|------|------|
| `CasesTable` | 分頁列表（description / expected_action / 刪除按鈕） |
| `CaseCreateForm` | description + log_snippet + expected_action 表單 |
| `EvaluateRunner` | 選擇 prompt 版本 + Run 按鈕 + 執行中動畫 |
| `EvalResultTable` | 每個 case 的 expected / actual / PASS/FAIL + 整體正確率 |

---

## G. 視覺方向

- **主題**：深色系（dark mode only），類似 Vercel / Railway Dashboard 風格
- **背景層次**：
  - 頁面底層：`#0a0a0a`
  - 卡片 / 側邊欄：`#111111` 或 `#18181b`
  - 邊框：`#27272a`
  - Hover：`#1f1f23`
- **Accent**：藍色 `#3b82f6`（primary action），白色文字
- **字型**：
  - UI 文字：`Inter`（或系統字型）
  - log snippet / thinking / code：`JetBrains Mono` 或 `Fira Code`（monospace）
- **Confidence 動畫**：結果出現時進度條從 0 動畫到實際值（300ms ease-out）
- **決策結果進場**：`fade-in + translateY(-8px)` 動畫（200ms）

---

## H. 不需要知道的事

- Alembic migration 細節
- LLM provider 內部實作差異
- OpenSpec workflow 文件
- Python FastAPI 後端架構
- Pre-commit hooks 設定
- `.secrets.baseline` 等 CI 工具設定
