## 1. 型別補齊與修正（types/api.ts）

- [x] 1.1 將 `EvalRun.source` 型別從 `'manual' | 'pool'` 修正為 `'db' | 'pool' | 'optimizer'`
- [x] 1.2 在 `OptimizerRun` 介面新增欄位：`optimizer_model`、`evaluator_provider`、`evaluator_model`、`baseline_accuracy`、`current_eval_run_id`、`prompt_version_id`、`test_accuracy`
- [x] 1.3 在 `OptimizerRound` 介面新增欄位：`optimizer_model`、`analysis_text`、`confusion_matrix`、`previous_best_accuracy`、`accuracy_delta`
- [x] 1.4 新增 `ConfusionMatrix` type（`Record<string, Record<string, number>>`）

## 2. Source Filter 修正（composables/useApi.ts）

- [x] 2.1 將 `getEvalHistory` 內的 allowlist filter 從 `source === 'manual'` 改為排除 `source === 'optimizer'`（保留 `db`、`pool`、null）

## 3. Eval Source Badge（eval history 與 jobs 列表）

- [x] 3.1 在 `pages/evaluate/history/index.vue` 的 `sourceLabel` 與 `sourceClass` 函數更新：`db` → "Manual"（灰）、`pool` → "Pool"（藍）、`optimizer` → "Optimizer"（紫）
- [x] 3.2 若 eval jobs 列表有 source 欄位，同步加上 badge 顯示

## 4. Optimizer Diagnostics UI（components/optimizer/OptimizerHistory.vue）

- [x] 4.1 Run 列表卡片：加入 `optimizer_model` / `evaluator_model` badge 顯示
- [x] 4.2 Run 列表卡片：加入 baseline → best → test accuracy 走勢（三個數字 + 箭頭）
- [x] 4.3 Run detail 標頭：加入 optimizer model、evaluator provider/model 的 badge 區塊
- [x] 4.4 Run detail stats：加入 `baseline_accuracy`、`test_accuracy` 顯示
- [x] 4.5 `current_eval_run_id` 不為 null 時顯示「正在評估中」spinner 及可點擊連結
- [x] 4.6 Round 表格：加入 `kept` badge（綠色 Kept / 紅色 Rejected）與 `accuracy_delta`（正綠負紅）
- [x] 4.7 Round 表格：加入 `optimizer_model` 欄位
- [x] 4.8 Round 展開區：加入 `analysis_text` 折疊面板（`<details>`，預設收起）
- [x] 4.9 Round 展開區：加入 confusion matrix 表格（expected action 為 row，predicted action 為 column，cell 顯示 count）

## 5. Eval Run 即時進度（pages/evaluate/history/[run_id].vue）

- [x] 5.1 在 `status === 'running'` 的 polling 迴圈中，從 eval run detail API 取得即時 `correct`、`total`、`accuracy` 並顯示進度文字（"已完成 X / Y — Z%"）

## 6. NVIDIA NIM Provider（provider switcher）

- [x] 6.1 在 provider 選單中加入 `nvidia` 選項，label 顯示「NVIDIA NIM」
