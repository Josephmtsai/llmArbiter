# CI/CD LLM Arbiter — Architecture & Flow Diagrams

---

## 1. 整體系統架構

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Vue + Nuxt.js)          [獨立 GitHub repo]   │
│  Prompt 管理 / Test Cases / 評估結果 / Audit Log        │
│  openapi-typescript → src/types/api.ts (from /openapi.json) │
└────────────────────────┬────────────────────────────────┘
                         │ REST API
┌────────────────────────▼────────────────────────────────┐
│  Backend (FastAPI)                                      │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ /analyze │  │/decisions│  │/prompts  │  │/config │  │
│  │ /evaluate│  │          │  │/cases    │  │/rules  │  │
│  └────┬─────┘  └──────────┘  └──────────┘  └────────┘  │
│       │                                                  │
│  ┌────▼──────────────────────────────────────────────┐  │
│  │  Core Analysis Pipeline                           │  │
│  │  log_extractor → prompt_builder                   │  │
│  │  → llm_provider → tool_call_parser                │  │
│  │  → confidence_router → action_executor            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────┐   ┌──────────────────────────┐ │
│  │  LLM Provider       │   │  SQLAlchemy Async        │ │
│  │  Registry           │   │  decisions               │ │
│  │  ┌───────────────┐  │   │  decision_rules          │ │
│  │  │ OllamaProvider│  │   │  prompt_versions         │ │
│  │  │ ClaudeProvider│  │   │  test_cases              │ │
│  │  │ CodexProvider │  │   │  eval_results            │ │
│  │  └───────────────┘  │   └──────────────────────────┘ │
│  └─────────────────────┘                                │
└─────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
  LLM_PROVIDER env var          DATABASE_URL env var
  ┌───────────────────┐         ┌──────────────────────┐
  │ ollama  :11434    │         │ SQLite (local dev)   │
  │ claude  API       │         │ PostgreSQL (Railway) │
  │ codex   API       │         └──────────────────────┘
  └───────────────────┘
```

---

## 2. 核心分析流水線（POST /analyze）

```
POST /analyze
{ log_snippet, hardware_info, fail_count_24h }
    │
    ▼
┌─────────────────────────────┐
│ 1. log_extractor            │
│                             │
│  前 LOG_HEAD_LINES 行       │
│  + 第一個 error 後          │
│    LOG_ERROR_TAIL_LINES 行  │
│  + 最後 LOG_FINAL_LINES 行  │
│  （去重）                   │
└──────────────┬──────────────┘
               │ log_snippet (trimmed)
               ▼
┌─────────────────────────────┐
│ 2. prompt_builder           │
│                             │
│  system: DB active prompt   │
│  user:   log + hardware     │
└──────────────┬──────────────┘
               │ (system, user)
               ▼
┌─────────────────────────────┐
│ 3. llm_provider             │  ◀── LLM_PROVIDER env var
│                             │       or /config/provider API
│  OllamaProvider  (XML/JSON) │
│  ClaudeProvider  (tool_use) │
│  CodexProvider   (OpenAI)   │
└──────────────┬──────────────┘
               │ raw LLM output
               ▼
┌─────────────────────────────┐
│ 4. tool_call_parser         │
│                             │
│  JSON 解析 → ArbiterDecision│
│  失敗 → notify_human, 0.0   │
└──────────────┬──────────────┘
               │ ArbiterDecision
               ▼
┌─────────────────────────────┐     decision_rules table
│ 5. confidence_router        │ ◀── auto_execute_threshold
│                             │     fallback_threshold
│  ≥ 0.8  → auto execute      │     repeat_fail_limit
│  ≥ 0.5  → + force notify   │
│  < 0.5  → notify only       │
└──────────────┬──────────────┘
               │ (primary_action, side_action)
               ▼
┌──────────────────────────────────────────────┐
│ 6. action_executor                           │
│                                              │
│  trigger_rebuild   → re-trigger build        │
│  trigger_fallback  → switch machine, rebuild │
│  trigger_restart   → [STUB] log intent       │
│  notify_human      → log + alert             │
│  send_email        → [STUB] log intent       │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
             ┌──────────────────┐
             │ decisions table  │  ← audit log 寫入
             │ (audit log)      │
             └──────────────────┘
                       │
                       ▼
        { status, data: ArbiterDecision, message }
```

---

## 3. LLM Provider 切換機制

```
                   ┌─────────────────────────┐
                   │   PROVIDER_REGISTRY      │
                   │                         │
                   │  "ollama" → OllamaProvider│
                   │  "claude" → ClaudeProvider│
                   │  "codex"  → CodexProvider │
                   │  (可擴充，只需登記)       │
                   └─────────────┬───────────┘
                                 │ get_provider()
                    ┌────────────┼────────────┐
                    │            │            │
              ENV 切換      API 切換     未知 provider
         LLM_PROVIDER=       PATCH         ValueError
           ollama/claude/   /config/
           codex            provider
         （重啟生效）       （即時生效）
```

---

## 4. Confidence Routing 決策樹

```
LLM 輸出 confidence
         │
         ▼
  fail_count_24h
  >= repeat_fail_limit?
    │         │
   Yes        No
    │         │
    ▼         ▼
 notify    confidence
 human    >= auto_threshold (0.8)?
             │         │
            Yes        No
             │         │
             ▼         ▼
          execute   confidence
          primary + >= fallback_threshold (0.5)?
          side          │         │
                       Yes        No
                        │         │
                        ▼         ▼
                     execute    only
                     primary + notify
                     force      human
                     notify_human
                     as side
```

---

## 5. 部署架構

```
本機（Windows + RTX 2060）
  ┌─────────────────────┐
  │  Ollama :11434      │
  │  hermes3:8b         │
  └──────────┬──────────┘
             │
  ┌──────────▼──────────┐
  │  Cloudflare Tunnel  │  ← 固定 URL（推薦）
  │  or ngrok           │    每次重啟需更新
  └──────────┬──────────┘    OLLAMA_BASE_URL
             │
             ▼
┌────────────────────────────────────────┐
│  Railway                               │
│                                        │
│  ┌────────────┐    ┌────────────────┐  │
│  │  Frontend  │    │    Backend     │  │
│  │  (Nuxt.js) │    │    (FastAPI)   │  │
│  │  [另一repo]│    │                │  │
│  └────────────┘    │  startup:      │  │
│                    │  alembic up +  │  │
│  ┌─────────────────│  uvicorn       │  │
│  │  PostgreSQL     └────────────────┘  │
│  │  Plugin                             │
│  │  (DATABASE_URL  ← 自動注入)         │
│  └─────────────────────────────────────┘
│                                        │
│  Environment Variables:                │
│  LLM_PROVIDER = ollama|claude|codex   │
│  OLLAMA_BASE_URL = <tunnel URL>       │
│  CLAUDE_API_KEY / CODEX_API_KEY       │
└────────────────────────────────────────┘
```

---

## 6. Agent 開發工作流程

```
使用者需求
    │
    ▼
┌──────────────────────────────────────┐
│  SA (System Analyst)                 │
│                                      │
│  /opsx:explore  → 釐清需求           │
│  /opsx:propose  → 產出               │
│    proposal.md  (what & why)         │
│    design.md    (how)                │
│    specs/**     (requirements + AC)  │
│    tasks.md     (實作清單)           │
└────────────────────┬─────────────────┘
                     │ handoff-sa.json
                     ▼
┌──────────────────────────────────────┐
│  Developer                           │
│                                      │
│  /opsx:apply → 執行 tasks.md         │
│  python-core skill 最佳化 code       │
│  pre-commit 通過後 commit            │
└────────────────────┬─────────────────┘
                     │ handoff-dev.json
                     ▼
┌──────────────────────────────────────┐
│  codex-reviewer                      │
│  code review → PASS / FAIL           │
└────────┬─────────────────────────────┘
      PASS │              │ FAIL
           │              ▼
           │         Developer（修正）
           ▼
┌──────────────────────────────────────┐
│  QA                                  │
│                                      │
│  /opsx:verify → 驗證 AC + spec       │
│  pytest → 覆蓋率 ≥ 80%               │
│  PASS/FAIL verdict                   │
└────────────────────┬─────────────────┘
                  PASS │
                       ▼
┌──────────────────────────────────────┐
│  CICD                                │
│                                      │
│  Railway 部署                        │
│  alembic upgrade head                │
│  /opsx:archive → 封存 change         │
└──────────────────────────────────────┘
```

---

## 7. DB Schema

```
┌─────────────────┐     ┌──────────────────────┐
│ prompt_versions │     │ decision_rules        │
│─────────────────│     │──────────────────────│
│ id (PK)         │     │ id (PK)               │
│ version         │     │ rule_name (UNIQUE)    │
│ content         │     │ rule_value (JSONB)    │
│ is_active       │     │ description           │
│ created_at      │     │ updated_at            │
└────────┬────────┘     └──────────────────────┘
         │ 1
         │             ┌──────────────────────┐
         │ N           │ decisions             │
┌────────▼────────┐    │──────────────────────│
│ eval_results    │    │ id (PK)               │
│─────────────────│    │ log_snippet           │
│ id (PK)         │    │ hardware_info (JSONB) │
│ prompt_ver_id──►│    │ primary_action        │
│ accuracy        │    │ side_action           │
│ detail (JSONB)  │    │ confidence            │
│ ran_at          │    │ reason                │
└─────────────────┘    │ thinking              │
                       │ provider              │
┌─────────────────┐    │ created_at            │
│ test_cases      │    └──────────────────────┘
│─────────────────│
│ id (PK)         │
│ log_snippet     │
│ hardware_info   │
│ expected_action │
│ created_at      │
└─────────────────┘
```
