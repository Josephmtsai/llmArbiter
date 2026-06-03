## Context

後端 June 2026 更新將 optimizer history 從 JSON 檔遷移至 PostgreSQL，大幅擴充 `OptimizerRun` 與 `OptimizerRound` 欄位（診斷文字、confusion matrix、model metadata），並為 `EvalRun` 加入 `source` 欄位（`db` / `pool` / `optimizer`）。

前端目前的 `OptimizerHistory.vue` 只顯示 run ID、status、best accuracy，round table 只有基本欄位；`EvalRun.source` 型別定義錯誤（`'manual' | 'pool'`）且已影響現有的 source filter 邏輯。

## Goals / Non-Goals

**Goals:**
- 補齊 TypeScript 型別（`OptimizerRun`、`OptimizerRound`、`EvalRun.source`）
- 重構 `OptimizerHistory.vue` 展示診斷資料（model badges、accuracy 走勢、confusion matrix、failure analysis）
- Eval history / jobs 列表加 source badge
- Eval run detail polling 顯示即時準確率
- Provider switcher 加 NVIDIA NIM

**Non-Goals:**
- 不在 UI 編輯 prompt
- 不自動 activate 生成的 prompt
- 不做 streaming（polling 已足夠）
- 不顯示 `val_snapshot_ids` 完整清單（只顯示 count）

## Decisions

### D1: 修正 `EvalRun.source` 型別並更新 filter

**決定**：將 `EvalRun.source` 從 `'manual' | 'pool'` 改為 `'db' | 'pool' | 'optimizer'`。

`getEvalHistory()` 中的 allowlist filter 從 `source == null || source === 'manual'` 改為 `source == null || source === 'db' || source === 'pool'`（即排除 `'optimizer'`）。`history/index.vue` 使用 `getEvalRunSource` 的 optimizer ID 追蹤邏輯保留，作為雙重確認機制。

**為何不只靠 `getEvalRunSource`**：backend 現在直接標記 `source: 'optimizer'`，前端型別準確後可直接用，不需要額外 API 呼叫取 optimizer 歷史來比對 run ID。

### D2: Confusion Matrix 渲染為 inline 表格

**決定**：在 `OptimizerHistory.vue` 內 inline 渲染 confusion matrix，不抽成獨立元件。

Matrix 只在 round detail 展開時出現，資料格式固定（`expected → predicted: count`），inline 渲染更簡單。若未來需要在多處重用，再抽取。

### D3: Failure Analysis 與 Failed Cases 使用折疊 (`<details>`)

**決定**：`analysis_text` 與 raw output 使用原生 `<details>/<summary>` 做折疊，預設收起。

符合 spec 安全要求（raw output 不預設展開），且不需要引入額外 state。

### D4: 不新增獨立元件，在 `OptimizerHistory.vue` 內重構

**決定**：本次重構在現有 `OptimizerHistory.vue` 進行，不拆分成多個子元件。

診斷 UI 只出現在 optimizer 頁面，抽元件的重用效益低；單檔維護更直覺。若未來 round detail 需要獨立路由再拆。

### D5: Eval run 即時進度透過現有 polling 機制實現

**決定**：`pages/evaluate/history/[run_id].vue` 的 polling 已有框架；只需在 `status === 'running'` 時顯示 `correct / total (accuracy%)` 而非等到 `completed`。不新增 polling interval，使用現有頻率。

## Risks / Trade-offs

- **EvalRun.source 型別破壞性修正** → 已有 `getEvalHistory` filter 邏輯依賴舊型別；修正時需同步更新 filter 條件與 `history/index.vue` 的 `sourceLabel`/`sourceClass` 函數。降低風險：Task 1 先修型別，Task 2 再改 UI。
- **Confusion matrix key 可能為未知 action** → 使用動態 key 渲染，不 hardcode action 名稱；未知值直接顯示原始字串。
- **`analysis_text` 長度可達 2000 字** → 折疊預設收起，展開時 `max-height` + `overflow-y: auto` 限制顯示區域。
- **`OptimizerHistory.vue` 變大** → 接受此 trade-off，保持單檔；未來若需拆分再處理。

## Migration Plan

1. 修正 `types/api.ts`（型別補齊 + source 修正）
2. 更新 `useApi.ts` filter 邏輯
3. 更新 `OptimizerHistory.vue`（新 UI）
4. 更新 eval history / jobs 的 source badge
5. 更新 eval run detail polling 顯示即時進度
6. 加 NVIDIA provider 選項

所有變更純前端，不需 DB migration 或 deploy coordination。可直接 merge 到 main。

## Open Questions

- `EvalJob`（running jobs）是否也有 `source` 欄位回傳？若有需同步更新 `EvalJob` 型別。
- Confusion matrix 是否需要高亮「最多混淆的 pair」？spec 提到但未給定閾值，先渲染完整 matrix，高亮邏輯留 TODO。
