# Frontend Change Guide — Backend Updates (June 2026)

本文件列出後端本輪變更對前端的影響，優先序從高到低。
Optimizer 診斷 UI 詳細規格請見 `docs/frontend-optimizer-diagnostics-spec.md`。

---

## 1. Optimizer History（高優先，破壞性變更）

### 1.1 Endpoint

```
GET /optimizer/history
```

### 1.2 Response 結構變化

原本的 `optimizer_history.json` 已移至 PostgreSQL，response 欄位大幅擴充。

**Run 層級新增欄位：**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `prompt_version_id` | `int \| null` | 被優化的起始 prompt PV ID |
| `baseline_accuracy` | `float \| null` | Baseline eval 準確率（eval run 34 那筆） |
| `current_eval_run_id` | `int \| null` | 正在執行的 eval run ID（`null` = 沒有） |
| `optimizer_model` | `string` | 用來生成 prompt 的 LLM（e.g. `deepseek/deepseek-v3`） |
| `evaluator_provider` | `string` | 執行 eval 的 provider（e.g. `openrouter`） |
| `evaluator_model` | `string` | 執行 eval 的 model |

**Round 層級新增欄位：**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `optimizer_model` | `string` | 本輪用的 optimizer model |
| `analysis_text` | `string \| null` | LLM 產生的失敗分析文字 |
| `confusion_matrix` | `object \| null` | 混淆矩陣，格式見下 |

**`confusion_matrix` 格式：**
```json
{
  "trigger_restart": {
    "notify_human": 18,
    "trigger_fallback": 7
  }
}
```
key = expected_action，value = `{ predicted_action: count }`

**完整 sample response：**
```json
{
  "status": "success",
  "data": {
    "runs": [
      {
        "optimizer_run_id": 1,
        "status": "completed_max_rounds",
        "max_rounds": 3,
        "target_accuracy": 0.9,
        "optimizer_model": "deepseek/deepseek-v3",
        "evaluator_provider": "openrouter",
        "evaluator_model": "qwen/qwen3-235b-a22b",
        "started_at": "2026-06-03T10:00:00Z",
        "finished_at": "2026-06-03T10:20:00Z",
        "prompt_version_id": 3,
        "baseline_eval_run_id": 34,
        "baseline_accuracy": 0.115,
        "current_eval_run_id": null,
        "val_snapshot_ids": ["abc", "def", "..."],
        "test_accuracy": null,
        "error_message": null,
        "rounds": [
          {
            "round_number": 1,
            "accuracy": 0.535,
            "prompt_version_id": 4,
            "failed_case_count": 93,
            "kept": false,
            "eval_run_id": 35,
            "optimizer_model": "deepseek/deepseek-v3",
            "analysis_text": "The prompt fails to distinguish...",
            "confusion_matrix": {
              "trigger_restart": { "notify_human": 22 }
            }
          }
        ]
      }
    ]
  }
}
```

### 1.3 前端需要做的事

1. **Run 卡片** 顯示 `baseline_accuracy` → `best_round_accuracy` → `test_accuracy` 的 accuracy 走勢
2. **Optimizer model / Evaluator** 以小 badge 呈現（`optimizer: deepseek-v3` / `eval: qwen-235b`）
3. **`current_eval_run_id` 不為 null** 時顯示「正在評估中」spinner，可點擊跳至對應 eval run
4. **Round 卡片** 展開後顯示：
   - `analysis_text`（折疊，預設收起）
   - `confusion_matrix` 渲染成表格（expected rows × predicted columns）
5. **Accuracy delta** = `round.accuracy - baseline_accuracy`，負數標紅、正數標綠

詳細 UX spec 見 `docs/frontend-optimizer-diagnostics-spec.md`。

---

## 2. Eval Run — 新增 `source` 欄位（中優先）

### 2.1 受影響的 endpoints

```
GET /evaluate/history            # list of runs
GET /evaluate/history/{run_id}   # run detail
GET /evaluate/jobs               # running jobs
```

### 2.2 新增欄位

```json
{
  "run_id": 34,
  "source": "optimizer",
  ...
}
```

| `source` 值 | 說明 |
|-------------|------|
| `db` | 手動觸發（用 DB 的 test cases） |
| `pool` | 手動觸發（從 eval pool 取樣） |
| `optimizer` | Auto Prompt Optimizer 自動啟動 |

### 2.3 前端需要做的事

在 eval run 列表和 jobs 列表中加一個小 badge：
- `db` → 灰色 「Manual」
- `pool` → 藍色 「Pool」
- `optimizer` → 紫色 「Optimizer」

讓使用者能快速區分哪些 eval run 是 optimizer 自動跑的。

---

## 3. Eval Run Detail — 執行中即時準確率（中優先）

### 3.1 Endpoint

```
GET /evaluate/history/{run_id}
```

### 3.2 行為變化

當 `status: "running"` 時，`correct`、`timeout_count`、`accuracy` 欄位會根據已完成的筆數即時計算（不再是 `0`）。

```json
{
  "run": {
    "run_id": 32,
    "status": "running",
    "total": 200,
    "correct": 23,          // ← 即時更新，原本是 0
    "timeout_count": 0,
    "accuracy": 0.115,      // ← 即時更新，原本是 0.0
    ...
  }
}
```

### 3.3 前端需要做的事

**如果正在 poll 執行中的 eval run**，現在可以顯示即時進度：

```
已完成 23/200 (11.5%) — 剩餘 177 筆
```

不需要等到 `status: completed` 才更新準確率數字。

---

## 4. Provider Switcher — 新增 NVIDIA NIM（低優先）

### 4.1 Endpoint

```
GET /config/provider     # 取得目前 provider 及清單
PATCH /config/provider   # 切換 provider
```

### 4.2 新增 provider

```json
{
  "provider": "nvidia",
  "model": "deepseek-ai/deepseek-v4-flash"
}
```

provider list 現在包含：`ollama` | `claude` | `codex` | `openrouter` | `nvidia`

### 4.3 前端需要做的事

Provider 下拉選單加入 `nvidia` 選項，label 顯示 `NVIDIA NIM`。

使用者切換到 `nvidia` 後，後端需在 Railway 設定：
```
LLM_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi-...
NVIDIA_MODEL=deepseek-ai/deepseek-v4-flash
```

---

## 優先序總結

| # | 功能 | 影響範圍 | 優先序 |
|---|------|---------|--------|
| 1 | Optimizer history 新欄位 + diagnostics UI | `/optimizer` 頁面 | 高 |
| 2 | Eval run `source` badge | Eval history / jobs 列表 | 中 |
| 3 | Eval run 即時準確率 | Eval run detail polling | 中 |
| 4 | NVIDIA provider 選項 | Config / provider switcher | 低 |

---

## 注意事項

- Optimizer history response 結構已破壞性更新（從 JSON file → DB），舊欄位全部保留，只有新增。
- `val_snapshot_ids` 陣列可能有 200 個元素，前端不需要顯示完整清單，只顯示 `count` 即可。
- `analysis_text` 可能很長（500~2000 字），折疊預設收起。
- Confusion matrix 的 action key 可能包含：`trigger_rebuild` / `trigger_restart` / `trigger_fallback` / `notify_human` / `send_email`。
