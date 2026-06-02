# Frontend 顯示指南：Eval Run 與 Optimizer 整合

## 一、兩種 Eval Run 的差異

系統有兩種觸發 eval 的來源，前端需要用不同方式呈現：

| 類型 | 觸發方式 | 資料來源 | 目的 |
|------|---------|---------|------|
| **手動 Eval** | 使用者點 UI 觸發 `POST /evaluate` | DB test cases 或 eval pool | 任意時間測試某個 prompt |
| **Optimizer Eval** | Optimizer 自動觸發 | eval pool（固定 `source=pool`） | baseline + 每輪優化的驗證 |

---

## 二、如何區分 Optimizer Eval vs 手動 Eval

### 目前後端限制

`GET /evaluate/history` 回傳的每筆 run **沒有 `source` 欄位**，無法直接判斷是哪種來源。

### 前端識別方法：交叉比對 optimizer history

從 `GET /optimizer/history` 取出所有 optimizer eval run 的 id，再對照 eval history：

```ts
// 1. 取 optimizer history
const optimizerRuns = await fetch('/api/arbiter/optimizer/history')

// 2. 建立「屬於 optimizer 的 eval_run_id」集合
const optimizerEvalIds = new Set<number>()
for (const run of optimizerRuns.data.runs) {
  if (run.baseline_eval_run_id) optimizerEvalIds.add(run.baseline_eval_run_id)
  for (const round of run.rounds) {
    if (round.eval_run_id) optimizerEvalIds.add(round.eval_run_id)
  }
}

// 3. 標記 eval history 中每筆的來源
const evalRuns = await fetch('/api/arbiter/evaluate/history')
const tagged = evalRuns.data.runs.map(run => ({
  ...run,
  triggeredBy: optimizerEvalIds.has(run.run_id) ? 'optimizer' : 'manual',
}))
```

### 建議後端補上 `source` 欄位（backlog）

請後端在 `eval_run_to_dict` 加入 `source: 'db' | 'pool'`，前端就不需要交叉比對。

---

## 三、Eval History 頁面建議設計

### 列表 UI

```text
┌─────────────────────────────────────────────────────────────────┐
│  Eval Run History                          [手動 Eval] [篩選 ▾] │
├────┬──────────┬───────────┬────────┬────────┬──────────────────┤
│ ID │ 來源     │ Model     │ 狀態   │準確率  │ 時間             │
├────┼──────────┼───────────┼────────┼────────┼──────────────────┤
│ 25 │ 🤖 Opt  │ gpt-4o-m  │ ✅完成 │ 65.0%  │ 06-01 10:05      │
│ 24 │ 🤖 Opt  │ gpt-4o-m  │ ✅完成 │ 61.0%  │ 06-01 10:00      │
│ 23 │ 👤 手動 │ gpt-4o-m  │ ❌失敗 │  -     │ 06-01 10:57      │
│ 21 │ 🤖 Opt  │ deepseek  │ ✅完成 │ 61.0%  │ 05-30 14:23      │
└────┴──────────┴───────────┴────────┴────────┴──────────────────┘
```

**狀態 badge：**
- `completed` → 完成
- `failed` → 失敗
- `running` → 執行中
- `cancelled` → 已取消

**準確率顯示：**
- `failed` 或 `running` 時顯示 `—`，不顯示 0%（避免誤解）
- 顏色：≥ 80% 綠、60~79% 黃、< 60% 紅

---

## 四、Optimizer History 頁面建議設計

### 整體結構

```text
Optimizer Run #4  [completed_max_rounds]
target: 80%  |  max rounds: 3  |  2026-06-01 10:00

  Baseline   eval_run #24  →  61.0%  [查看詳情]
  ─────────────────────────────────────
  Round 1    eval_run #25  →  65.0%  ✅ kept    [查看詳情]
  Round 2    eval_run #26  →  63.0%  ✗ reverted [查看詳情]
  Round 3    eval_run #27  →  64.0%  ✗ reverted [查看詳情]
  ─────────────────────────────────────
  最終準確率：65.0%（未達標）
```

### rounds 為空時（直接達標）

```text
Optimizer Run #1  [completed]
target: 70%  |  max rounds: 3

  Baseline   eval_run #18  →  100%  ✅ 已達標，無需優化  [查看詳情]
```

```ts
// rounds 為空代表 baseline 已達標
const isBaselinePassedDirectly = run.rounds.length === 0 && run.status === 'completed'
```

### 準確率折線圖（可選）

若有多個 round，可畫趨勢線：

```text
accuracy
 1.0 |
 0.8 |              ●
 0.6 |  ●  ─────●──
 0.4 |
     baseline  R1  R2  R3
```

---

## 五、Eval Run 詳情頁

**API：** `GET /api/arbiter/evaluate/history/{run_id}`

```json
{
  "run": {
    "run_id": 25,
    "prompt_version_id": 5,
    "provider": "codex",
    "model": "gpt-4o-mini",
    "status": "completed",
    "total": 100,
    "correct": 65,
    "timeout_count": 0,
    "accuracy": 0.65
  },
  "results": [
    {
      "test_case_id": 1,
      "predicted_action": "trigger_rebuild",
      "expected_action": "trigger_restart",
      "is_correct": false,
      "latency_ms": 312
    }
  ]
}
```

**建議顯示：**

```text
Eval Run #25  |  gpt-4o-mini  |  完成
準確率：65/100 (65.0%)   |   平均延遲：312ms

錯誤案例 (35 筆)
┌──────┬──────────────────┬──────────────────┬──────────┐
│ Case │ 預期             │ 實際預測          │ 延遲     │
├──────┼──────────────────┼──────────────────┼──────────┤
│   1  │ trigger_restart  │ trigger_rebuild   │ 312ms    │
│   5  │ notify_human     │ trigger_restart   │ 428ms    │
└──────┴──────────────────┴──────────────────┴──────────┘
```

Confusion Matrix（可選）可用 `expected_action` 與 `predicted_action` 在前端推導。

---

## 六、Eval Pool Stats（`eval_pool.json` 要不要顯示在前端？）

### 建議：顯示統計，不顯示原始資料

2000 筆原始 log 對使用者沒有直接價值，但**分布統計**很有用，讓使用者知道測試集是否均衡。

**API：** `GET /api/arbiter/eval-pool/stats`

```json
{
  "data": {
    "total": 2000,
    "by_action": {
      "trigger_rebuild": 400,
      "trigger_fallback": 400,
      "trigger_restart": 400,
      "notify_human": 400,
      "send_email": 400
    }
  }
}
```

**建議顯示（放在 Optimizer 頁面側欄或設定頁）：**

```text
Eval Pool
總計：2000 筆  每次評估抽樣：100 筆（每類各 20）

trigger_rebuild   ████████  400 筆
trigger_fallback  ████████  400 筆
trigger_restart   ████████  400 筆
notify_human      ████████  400 筆
send_email        ████████  400 筆
```

若某個 action < 20 筆，顯示警告：樣本不足，該類別準確率可能不準。

---

## 七、API 彙整

| 功能 | Method | Path |
|------|--------|------|
| 觸發手動 eval | POST | `/evaluate` |
| Eval 執行清單 | GET | `/evaluate/history` |
| Eval 詳情（含每筆結果） | GET | `/evaluate/history/{run_id}` |
| 執行中的 eval jobs | GET | `/evaluate/jobs` |
| Optimizer 啟動 | POST | `/optimizer/run` |
| Optimizer 歷史 | GET | `/optimizer/history` |
| Optimizer 取消 | DELETE | `/optimizer/runs/{id}` |
| Eval Pool 統計 | GET | `/eval-pool/stats` |
| Review Queue 清單 | GET | `/review-queue` |

所有 API 加上 prefix `/api/arbiter/`，需帶 header `X-API-Key: <key>`。
