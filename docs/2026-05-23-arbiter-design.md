# CI/CD LLM Arbiter — Architecture Design

**Date**: 2026-05-23
**Status**: Approved

---

## Overview

動態分析 Jenkins / CI build 失敗 log，透過可切換的 LLM provider（Ollama / Claude / Codex）判斷根本原因，根據 confidence 自動執行修復動作或通知人工介入。

---

## System Architecture

```
Frontend (Vue + Nuxt.js)          [獨立 GitHub repo]
  Prompt 管理 / Test Cases / 評估結果
  型別由 openapi-typescript 從 /openapi.json 生成
  API Key 存放在 Nuxt 後端環境變數 (runtimeConfig)
      │ REST API (X-API-Key header, server-side)
Backend (FastAPI)                 [本 repo — Railway]
  routers → services → providers → repositories
      │
  ┌───┴────────────────────────┐
  │ LLM Provider Registry      │
  │  ollama / claude / codex   │
  └────────────────────────────┘
      │
  PostgreSQL (Railway) / SQLite (local)
```

---

## 核心概念：兩層獨立邏輯

**這是最容易誤解的部分。Confidence 不決定做哪個 action，兩件事完全分開。**

### 第一層：LLM 決定做什麼（看 error pattern）

LLM 分析 build log 後，根據錯誤類型選出 primary_action：

| Error Pattern | primary_action | 說明 |
|---|---|---|
| OOM / Disk full / 硬體問題 | `trigger_fallback` | 換機器處理資源問題 |
| Network timeout / Linker error / Flaky test | `trigger_rebuild` | 暫時性錯誤，重跑即可 |
| Daemon crash / Service not responding | `trigger_restart` | 重啟服務 |
| Code defect / CVE / 複雜問題 / 重複失敗 | `notify_human` | 需要人工判斷 |
| Production deploy failure | `send_email` | 正式 email 通知 |

### 第二層：Confidence 決定怎麼執行（系統 override）

LLM 選完 action 後，系統根據 confidence score 決定執行方式：

```
confidence ≥ 0.8   → 直接執行 primary_action（全自動，不通知人）
confidence 0.5–0.79 → 執行 primary_action + 強制附加 notify_human（人工知情）
confidence < 0.5   → 忽略 LLM 的選擇，強制改成 notify_human（不信任判斷）
```

**舉例說明：**
```
LLM 判斷 → trigger_fallback（OOM 錯誤），confidence = 0.9
結果 → 執行 trigger_fallback only（高信心，全自動）

LLM 判斷 → trigger_fallback（OOM 錯誤），confidence = 0.6
結果 → 執行 trigger_fallback + notify_human（中信心，附帶通知）

LLM 判斷 → trigger_fallback（OOM 錯誤），confidence = 0.3
結果 → 強制改為 notify_human（低信心，不自動執行任何動作）
```

### 五個 Actions

| Action | 觸發條件 | 實作狀態 |
|--------|----------|----------|
| `trigger_rebuild` | 暫時性錯誤、flaky test | ✅ 實作（stub） |
| `trigger_fallback` | 硬體 / 資源異常 | ✅ 實作（stub） |
| `trigger_restart` | service/daemon 崩潰 | ⚠️ Stub |
| `notify_human` | 複雜問題 / 低信心兜底 | ✅ 實作（log） |
| `send_email` | 正式 email 通知 | ⚠️ Stub |

**Multi-action**：每次最多 2 個（primary_action + side_action）。
- `primary_action`：LLM 選出的主要動作
- `side_action`：`notify_human` 或 `send_email`，可為 null

---

## LLM Decision Format

```json
{
  "primary_action": "trigger_rebuild",
  "side_action": "send_email",
  "confidence": 0.85,
  "reason": "transient network timeout detected",
  "thinking": "..."
}
```

---

## 決策完整流程

```
CI Build 失敗
      │
      ▼
POST /analyze
  ├─ build_log (Jenkins 輸出)
  └─ hardware_info (OS、機器規格)
      │
      ▼
┌─────────────────────────────────┐
│  LLM 分析 (prompt v2)           │
│                                 │
│  Error Pattern Guide 對照表：   │
│  · Linker error   → rebuild     │
│  · OOM / disk     → fallback    │
│  · daemon crash   → restart     │
│  · code defect    → notify      │
│  · 重複失敗 >= 3  → notify      │
│                                 │
│  回傳 JSON:                     │
│  { primary_action,              │
│    side_action,                 │
│    confidence 0.0~1.0,          │
│    reason, thinking }           │
└─────────────────────────────────┘
      │
      ▼
Confidence Routing（值存 DB，可 API 修改）

  confidence >= 0.8 (auto_execute_threshold)
      │  └─▶ 直接執行 primary action（全自動）
      │
  0.5 <= confidence < 0.8 (fallback_threshold)
      │  └─▶ 執行 primary action
      │       + 強制附加 side_action = notify_human（人工知情）
      │
  confidence < 0.5
      └─▶ primary 強制改為 notify_human（不信任 LLM 判斷）

      │
      ▼
Action Executor
  ┌─────────────────┬──────────────────────┐
  │ primary_action  │ side_action (可 null) │
  │ （執行類）      │ （通知類）           │
  ├─────────────────┼──────────────────────┤
  │ trigger_rebuild │ notify_human         │
  │ trigger_fallback│ send_email (stub)    │
  │ trigger_restart │                      │
  │ notify_human    │                      │
  └─────────────────┴──────────────────────┘
      │
      ▼
寫入 decisions table（audit log）
回傳 API response
```

**重點：LLM 選哪個 primary action 由 prompt 的 Error Pattern Guide 決定，Confidence Routing 只決定是否附加通知、或否決 LLM 的選擇。**

---

## Confidence Routing 門檻（值存 DB，可 API 修改）

```
≥ auto_execute_threshold (預設 0.8)  → 自動執行 primary，無 side action
≥ fallback_threshold (預設 0.5)      → 執行 primary，強制附加 notify_human
< fallback_threshold                  → 強制改為 notify_human（不管 LLM 選什麼）
```

門檻調整方式：
```
PATCH /config/rules/auto_execute_threshold   { "value": "0.85" }
PATCH /config/rules/fallback_threshold       { "value": "0.6" }
```

---

## LLM Provider Registry Pattern

新增 provider = 新增一個 class + 在 `registry.py` 登記，不動任何其他程式碼。

```python
PROVIDER_REGISTRY: dict[str, type[LLMProvider]] = {
    'ollama': OllamaProvider,
    'claude': ClaudeProvider,
    'codex':  CodexProvider,
    # 未來：'gemini': GeminiProvider
}
```

切換方式：
- 環境變數 `LLM_PROVIDER=claude`（重啟生效）
- API `PATCH /config/provider`（即時生效，寫入 DB）

---

## Database（五張 Table）

```sql
prompt_versions   -- system prompt 版本管理
test_cases        -- 測試集（含 ground truth）
eval_results      -- 評估正確率與詳細結果
decisions         -- 每次分析的 audit log（含 provider、confidence）
decision_rules    -- confidence 閾值與 routing 規則（可 API 修改）
```

**Railway 相容**：SQLAlchemy + `DATABASE_URL` env var。
- 本地：`sqlite+aiosqlite:///./arbiter.db`
- Railway：PostgreSQL Plugin 自動注入 `DATABASE_URL`

---

## API Endpoints

```
POST /analyze                         接收 log + 硬體資訊 → 回傳決策
GET  /prompts                         列出所有 prompt 版本
POST /prompts                         新增 prompt 版本
PATCH /prompts/:ver/activate          設為使用中
GET  /cases                           列出所有 test case
POST /cases                           新增 test case
DELETE /cases/:id                     刪除 test case
POST /evaluate                        對指定版本跑測試集 → 回傳正確率
GET  /decisions                       查 audit log
GET  /config/rules                    查看所有 decision_rules
PATCH /config/rules/:rule_name        修改單一規則值
GET  /config/providers                列出 PROVIDER_REGISTRY 所有 provider
GET  /config/provider                 查看目前 active provider
PATCH /config/provider                切換 active provider（即時生效）
```

---

## Deployment

```
本機（Windows + RTX 2060）
  └── Ollama :11434 → Cloudflare Tunnel（推薦）/ ngrok

Railway
  ├── Backend   (FastAPI)                ← 本 repo
  │     └── 啟動指令：alembic upgrade head && uvicorn src.main:app
  │     └── /openapi.json 提供 API spec
  └── PostgreSQL Plugin（DATABASE_URL 自動注入）

Frontend (Vue + Nuxt.js)                ← 獨立 repo，獨立部署
  ├── NUXT_API_BASE_URL = https://artbiter-production.up.railway.app
  ├── NUXT_API_KEY      = <API key>      ← 後端 runtimeConfig，不暴露給瀏覽器
  └── 型別生成：npx openapi-typescript <NUXT_API_BASE_URL>/openapi.json -o src/types/api.ts
```

---

## Agent Workflow

```
SA  ──/opsx:propose──▶  Developer  ──/opsx:apply──▶  QA（/opsx:verify）
                                                        │
                                    ──PASS──▶  CICD（/opsx:archive）
                                    ──FAIL──▶  Developer（修正）
```

| Agent | 主要指令 | 職責 |
|-------|---------|------|
| SA | `/opsx:explore` → `/opsx:propose` | 需求釐清，產出 change artifacts |
| Developer | `/opsx:apply` | 實作 tasks.md |
| QA | `/opsx:verify` | 驗證 AC + spec，產出 PASS/FAIL |
| CICD | `/opsx:archive`（完成後） | 部署維護，封存 change |

---

## Open Questions（入職後確認）

1. 歷史 build log 有多少？格式統一嗎？
2. 87% 正確率 baseline 從哪裡來、怎麼量？
3. Redfish 硬體資訊 API 的連接方式？
4. `trigger_restart` 實際重啟目標（Jenkins agent / Docker container）？
5. `send_email` 使用 SMTP 還是 SendGrid / Mailgun？
6. 是否有現有 Jenkins 可接 Webhook？
