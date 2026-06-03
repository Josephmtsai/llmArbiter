## Why

後端 June 2026 更新大幅擴充 Optimizer 診斷資料與 Eval Run 元資料，前端目前無法呈現這些新欄位，導致 operator 無法從 UI 判斷優化失敗原因、混淆模式或 eval run 來源。

## What Changes

- **OptimizerHistory UI 大幅重構**：顯示 optimizer model、evaluator、baseline → best → test accuracy 走勢、round kept/rejected badge + accuracy delta、confusion matrix 表格、failure analysis 折疊面板
- **型別補齊**：`OptimizerRun` 補 `optimizer_model`、`evaluator_provider`、`evaluator_model`、`baseline_accuracy`、`current_eval_run_id`、`prompt_version_id`、`test_accuracy`；`OptimizerRound` 補 `optimizer_model`、`analysis_text`、`confusion_matrix`、`previous_best_accuracy`、`accuracy_delta`
- **EvalRun source badge**：**BREAKING** — `EvalRun.source` 型別從 `'manual' | 'pool'` 修正為 `'db' | 'pool' | 'optimizer'`，eval history 列表與 jobs 列表加有色 badge
- **Eval run 即時準確率**：running 狀態 polling 時顯示即時 correct/accuracy 進度
- **NVIDIA NIM provider**：provider switcher 新增 `nvidia` 選項

## Capabilities

### New Capabilities

- `optimizer-diagnostics`: Optimizer 歷史頁面的診斷 UI — model badges、accuracy 走勢、round detail、confusion matrix、failure analysis
- `eval-run-source-badge`: Eval history 與 jobs 列表的 source 來源 badge（db / pool / optimizer）
- `eval-run-live-progress`: Eval run detail 在 running 狀態下顯示即時準確率進度
- `nvidia-provider-option`: Provider switcher 新增 NVIDIA NIM 選項

### Modified Capabilities

- `eval-run-source-tagging`: `EvalRun.source` 型別從 `'manual' | 'pool'` 修正為後端實際值 `'db' | 'pool' | 'optimizer'`，影響現有 source filter 邏輯

## Impact

- `types/api.ts` — `OptimizerRun`、`OptimizerRound`、`EvalRun` 型別變更
- `components/optimizer/OptimizerHistory.vue` — 主要重構目標
- `composables/useApi.ts` — `getEvalHistory` 內的 source filter 需隨型別修正
- `pages/evaluate/history/index.vue` — 加 source badge
- `pages/evaluate/history/[run_id].vue` — 加即時進度
- `pages/evaluate/jobs` / eval jobs 顯示處 — 加 source badge
- `components/ui/` 或 inline — 可能新增 ConfusionMatrix、SourceBadge 元件
