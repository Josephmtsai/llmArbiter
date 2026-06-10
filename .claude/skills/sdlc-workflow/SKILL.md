---
name: sdlc-workflow
description: Orchestrate the Gated SDLC pipeline for a feature. Manages SA → Human Gate → Developer → codex-reviewer → QA with retry tracking and stop conditions. Use when starting, resuming, or checking the status of a feature pipeline.
metadata:
  type: workflow
  version: "1.0"
---

# SDLC Workflow Orchestrator

Runs the full gated SDLC pipeline with human review gate and retry limits.

```
SA → [HUMAN GATE] → Developer → codex-reviewer → QA
                                     ↑ retry (max 2)  ↓
                                     └──── needs-fix ──┘
                                     retry_count ≥ max_retries → ⛔ STOP
```

---

## Entry Points

- `/sdlc:run [feature-name]` — start a new pipeline or resume from current phase
- `/sdlc:status [feature-name]` — report current pipeline phase without executing

---

## Phase Detection

Before doing anything, read `specs/<feature>/` to determine the current phase:

| Condition | Phase |
|-----------|-------|
| No `handoff-sa.json` | **Phase 0: SA** |
| `handoff-sa.json` status = `"pending-human-review"` | **Phase 1: Human Gate** |
| `handoff-sa.json` status = `"ready"`, no `handoff-dev.json` | **Phase 2: Developer** |
| `handoff-dev.json` status = `"ready"`, no codex report | **Phase 3: codex-reviewer** |
| codex PASS, no QA result | **Phase 4: QA** |
| `handoff-qa.json` status = `"needs-fix"` | **Phase 5: Developer Retry** |
| Any handoff status = `"blocked"` | **⛔ BLOCKED** |
| QA PASS | **✅ Done** |

---

## Execution Steps

### Step 1 — Determine feature name

If no feature name provided, use **AskUserQuestion**:
> "請輸入 feature 名稱（kebab-case，例如 `007-structured-logging`）："

Then read `specs/<feature>/` to detect phase.

---

### Step 2 — Execute current phase

#### Phase 0: SA

Spawn SA agent with this prompt:
```
你是 SA（系統分析師）。請針對 feature "<feature>" 進行需求分析，並在 specs/<feature>/ 目錄下產出：
- spec.md（需求規格）
- tasks.md（實作任務與 AC）
- handoff-sa.json（status 必須設為 "pending-human-review"）

handoff-sa.json 格式：
{
  "from": "sa",
  "to": "developer",
  "feature": "<feature>",
  "status": "pending-human-review",
  "summary": "...",
  "artifacts": ["specs/<feature>/spec.md", "specs/<feature>/tasks.md"],
  "assumptions": [...]
}
```

完成後進入 Phase 1。

---

#### Phase 1: Human Gate

1. 讀取 `specs/<feature>/spec.md` 與 `specs/<feature>/tasks.md`
2. 呼叫 **AskUserQuestion**，展示 spec 摘要並請人工決策：

   問題：「請審閱 `<feature>` 的 spec，選擇下一步：」
   選項：
   - **Approve** — spec 正確，繼續開發
   - **Request Changes** — spec 需要修改，說明問題

3. **Approve** → 將 `handoff-sa.json` 的 `status` 改為 `"ready"` → 進入 Phase 2
4. **Request Changes** → 將 feedback 帶回 SA 重新設計 → 回 Phase 0

---

#### Phase 2: Developer

讀取 `handoff-sa.json` 與所有 artifacts，檢查 `retry_count`：
- 首次：`retry_count = 0`
- Retry：從 `handoff-qa.json` 取得 `retry_count` 和 `failed_ac`

Spawn Developer agent：
```
你是 Developer。請依據以下文件實作 feature "<feature>"：
- 必讀：handoff-sa.json 或 handoff-qa.json（retry 時）+ artifacts 列出的所有文件
- 若是 retry，優先修正 handoff-qa.json 的 failed_ac 問題

完成後產出 handoff-dev.json：
{
  "from": "developer",
  "to": "qa",
  "feature": "<feature>",
  "status": "ready",
  "summary": "...",
  "changed_files": [...],
  "ac_ref": "specs/<feature>/tasks.md",
  "retry_count": <current_retry_count>,
  "max_retries": 2,
  "retry_history": [...]
}
```

完成後進入 Phase 3。

---

#### Phase 3: codex-reviewer

**例外**：若 `git diff --stat` 顯示 `< 50 lines changed` 且是 hotfix/chore，跳過直接進 Phase 4。

Spawn codex-reviewer agent：
```
你是 codex-reviewer。針對 feature "<feature>" 的 branch diff 執行 adversarial review：
  codex-companion.mjs adversarial-review

輸出 verdict：ship / needs-attention / no-ship
禁止修改任何檔案，只輸出 report。
```

- **PASS**（ship 或 needs-attention with minor issues）→ 進入 Phase 4
- **FAIL**（no-ship）→
  - 讀取 `handoff-dev.json` 的 `retry_count`
  - 若 `retry_count < max_retries`：回 Phase 2（Developer retry）
  - 若 `retry_count >= max_retries`：**⛔ STOP**（見 Blocked 處理）

---

#### Phase 4: QA

讀取 `handoff-dev.json` 的 `ac_ref` 與 `changed_files`。

Spawn QA agent：
```
你是 QA。請針對 feature "<feature>" 驗證以下 AC：
- 必讀：handoff-dev.json 的 ac_ref + changed_files
- 僅需閱讀 tasks.md 的 AC 區塊

若全部 AC 通過：輸出 PASS 測試報告。
若有 AC 失敗：產出 handoff-qa.json：
{
  "from": "qa",
  "to": "developer",
  "feature": "<feature>",
  "status": "needs-fix",
  "summary": "...",
  "failed_ac": [...],
  "retry_count": <retry_count + 1>,
  "max_retries": 2
}
```

- **PASS** → **✅ Done**，回報使用者，等待人工決定是否 merge
- **FAIL** →
  - 讀取新的 `handoff-qa.json` 的 `retry_count`
  - 若 `retry_count < max_retries`：回 Phase 2（Developer retry）
  - 若 `retry_count >= max_retries`：**⛔ STOP**（見 Blocked 處理）

---

#### Phase 5: Developer Retry

等同 Phase 2，但需讀取 `handoff-qa.json` 取得 `failed_ac`。

---

### ⛔ Blocked 處理

當任何環節 `retry_count >= max_retries` 且仍 FAIL：

1. 將當前 handoff 的 `status` 更新為 `"blocked"`
2. 停止 spawn 任何 agent
3. 回報使用者：
   ```
   ⛔ Pipeline blocked: <feature>
   原因：<codex-reviewer/QA> 在 <retry_count> 次重試後仍 FAIL
   最後錯誤：<verdict/failed_ac>
   等待人工介入後請執行 /sdlc:run <feature> 繼續。
   ```

---

## /sdlc:status 模式

不執行任何 agent，只讀取 handoff JSONs 並輸出狀態表：

```
Feature: <feature>
Current Phase: <phase>
Retry Count: <n> / 2
Status: <pending-human-review | ready | needs-fix | blocked | done>
Last Action: <summary from latest handoff>
```

---

## 安全守則

- 永遠不自動 merge 或 push
- Human Gate 是唯一可以讓 pipeline 從 SA 進入 Developer 的關卡
- blocked 狀態只有人工確認後才能清除（手動修改 handoff JSON 的 status 並重跑 /sdlc:run）
- codex-reviewer 禁止修改任何檔案
