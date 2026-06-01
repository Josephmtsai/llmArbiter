# Frontend 更新文件：Optimizer History 新增 Eval Run 連結

## 異動原因

`GET /api/arbiter/optimizer/history` 新增兩個欄位，讓前端可以從 optimizer run 直接連結到對應的 eval run 詳情頁。

---

## API 變更

### `GET /api/arbiter/optimizer/history`

#### 新增欄位

| 欄位 | 位置 | 型別 | 說明 |
|------|------|------|------|
| `baseline_eval_run_id` | `runs[]` 頂層 | `number \| null` | baseline 評估的 eval run id |
| `eval_run_id` | `runs[].rounds[]` | `number \| null` | 該輪評估的 eval run id |

#### Response 範例

```json
{
  "status": "success",
  "data": {
    "runs": [
      {
        "optimizer_run_id": 4,
        "status": "completed_max_rounds",
        "max_rounds": 3,
        "target_accuracy": 0.8,
        "started_at": "2026-06-01T10:00:00.000000+00:00",
        "finished_at": "2026-06-01T10:15:00.000000+00:00",
        "baseline_eval_run_id": 24,
        "rounds": [
          {
            "round_number": 1,
            "accuracy": 0.65,
            "prompt_version_id": 5,
            "failed_case_count": 35,
            "kept": true,
            "eval_run_id": 25
          },
          {
            "round_number": 2,
            "accuracy": 0.63,
            "prompt_version_id": 6,
            "failed_case_count": 37,
            "kept": false,
            "eval_run_id": 26
          }
        ]
      }
    ]
  },
  "message": ""
}
```

#### 舊資料（runs 1~3）的行為

舊的 optimizer run（在此次 deploy 之前執行的）`baseline_eval_run_id` 和 `eval_run_id` 都會是 `null`，前端需要處理 null 的情況。

---

## 相關 API

### 查看 Eval Run 詳情

```
GET /api/arbiter/evaluate/history/{run_id}
X-API-Key: <your-key>
```

Response 包含：
- `run.accuracy`、`run.total`、`run.correct`、`run.status`
- `results[]`：每一筆 case 的 `predicted_action`、`expected_action`、`is_correct`

---

## 前端建議實作

### Optimizer History 頁面

```
Optimizer Run #4  [completed_max_rounds]  target: 80%
├── Baseline eval → [查看詳情] → /evaluate/history/24   accuracy: 61%
├── Round 1       → [查看詳情] → /evaluate/history/25   accuracy: 65% ✅ kept
└── Round 2       → [查看詳情] → /evaluate/history/26   accuracy: 63% ✗ reverted
```

### 處理 null 的邏輯

```ts
// baseline_eval_run_id 可能是 null（舊資料）
const baselineLink = run.baseline_eval_run_id
  ? `/evaluate/history/${run.baseline_eval_run_id}`
  : null

// rounds[].eval_run_id 可能是 null（舊資料）
const roundLink = round.eval_run_id
  ? `/evaluate/history/${round.eval_run_id}`
  : null
```

### accuracy 顯示邏輯

`rounds` 為空陣列時代表 baseline 已達標（直接 completed），accuracy 從 baseline eval 取：

```ts
// 如果 rounds 是空的，accuracy 要從 baseline eval run 取
// 打 GET /evaluate/history/{baseline_eval_run_id} 取得 run.accuracy
if (run.rounds.length === 0 && run.baseline_eval_run_id) {
  // fetch baseline eval detail to show accuracy
}
```

---

## 部署狀態

- **Branch**: `main`
- **Commit**: `d0723ef`
- **Deploy**: Railway 自動 deploy（push 後約 2~3 分鐘生效）
