# Auto Prompt Optimizer v2 — Architecture

> 本文件反映截至 2026-06-03 的實際架構（含 optimizer-history-db 遷移）。
>
> **v2 vs v1 主要變更：**
> - Optimizer LLM 改走 OpenRouter（移除 Anthropic SDK 硬綁）
> - Eval pool 擴充至 4000 筆，加入 train/val/test split
> - 取樣從每 action 20 筆→40 筆（200 筆/輪），固定 val snapshot
> - Optimizer run 結束後新增 test-set 最終驗收（test_accuracy）
> - 新增 relabel_eval_pool.py（LLM 重標記 script）
>
> **optimizer-history-db 遷移（2026-06-03）：**
> - Optimizer run / round 從 JSON file 改存 PostgreSQL（service restart 不遺失）
> - 每 round 新增 confusion_matrix、analysis_text、failure samples 診斷資料
> - Eval source 從 `pool` 改標記為 `optimizer`
> - 新增 compare_optimizer_models.py 模型比較腳本

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      AUTO PROMPT OPTIMIZER v2 ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────────────────────────┘

 PHASE 0 ─── 一次性資料建立（CLI scripts）
 ─────────────────────────────────────────────────────────────────────────────────

  ┌──────────────────────┐    ┌──────────────────────┐
  │  LogChunks           │    │  BGL / HPC            │
  │  Travis CI logs      │    │  Hardware system logs  │
  └──────────┬───────────┘    └──────────┬────────────┘
             └──────────┬────────────────┘
                        ▼
          ┌─────────────────────────────┐
          │  generate_eval_pool_from    │
          │  _logs.py --total 4000      │  ← keyword heuristic label
          └─────────────┬───────────────┘    每 action 各 800 筆
                        │
                        ▼
          ┌─────────────────────────────┐
          │  Split 分配（deterministic）│
          │  每 action bucket：          │
          │  前 60% → split=train       │  480 筆/action（共 2400）
          │  次 20% → split=val         │  160 筆/action（共  800）
          │  後 20% → split=test        │  160 筆/action（共  800）
          └─────────────┬───────────────┘
                        ▼
                data/eval_pool.json
                （4000 筆，含 split 欄位）
                        │
                        ▼
          ┌─────────────────────────────┐
          │  relabel_eval_pool.py       │  ← 選擇性執行（改善 label 品質）
          │  --model openrouter/strong  │
          │  [--action FILTER]          │
          │  [--dry-run]                │
          └─────────────┬───────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │  confidence check     │
            └───────────┬───────────┘
                        │
           ┌────────────┴────────────┐
           │ confidence             │ confidence
           │ >= 0.8                 │ < 0.8
           ▼                        ▼
  ┌────────────────┐      ┌──────────────────────┐
  │ eval_pool.json │      │ review_queue.json     │
  │ source=        │      │ status=pending        │
  │ "llm-relabeled"│      └──────────┬────────────┘
  └────────┬───────┘                 │
           │              ┌──────────▼────────────┐
           │              │ GET /review-queue      │
           │              │ PATCH /review-queue    │  confirm/correct/reject
           │              │       /{id}            │
           │              └──────────┬─────────────┘
           │                         │ confirmed → pool
           └─────────────────────────┘

 PHASE 1 ─── Optimizer Run 啟動：快照 Val Set
 ─────────────────────────────────────────────────────────────────────────────────

  POST /optimizer/run
  {"max_rounds": N, "target_accuracy": T}
              │
              ▼ 202 + optimizer_run_id
  ┌───────────────────────────────────────────────────────────────────────┐
  │                    OPTIMIZER BACKGROUND TASK                           │
  │                                                                       │
  │  ① CREATE optimizer_runs row (PostgreSQL)                             │
  │     status=running, optimizer_model, evaluator_provider/model        │
  │                   ↓                                                   │
  │  ② snapshot_val_set()                                                │
  │     從 split=val 各 action 抽 40 筆 → val_snapshot_ids (200筆)        │
  │     整個 run 固定這批 ID，所有輪次使用相同題目（公平比較）              │
  │                   ↓                                                   │
  │  ③ UPDATE optimizer_runs: val_snapshot_ids, prompt_version_id         │
  │                                                                       │
  └───────────────────────────────────────────────────────────────────────┘

 PHASE 2 ─── Baseline 評估
 ─────────────────────────────────────────────────────────────────────────────────

  ┌───────────────────────────────────────────────────────────────────────┐
  │                                                                       │
  │  ④ _start_evaluation(active_pv_id, snapshot_ids=val_snapshot_ids)    │
  │     → POST /evaluate (source="optimizer", snapshot_ids=[...])        │
  │     → 回傳 baseline_eval_run_id                                       │
  │     → UPDATE optimizer_runs: baseline_eval_run_id, current_eval_run_id│
  │                   ↓                                                   │
  │  ⑤ _wait_for_evaluation(baseline_eval_run_id)                        │
  │     → EvalRun: Semaphore(10) concurrent LLM calls per case           │
  │     → JOIN TestCase → enriched failing_cases                         │
  │       { expected, predicted, log_snippet, hardware_info }             │
  │     → build confusion_matrix from all results                        │
  │     → returns (accuracy, failing_cases, total, confusion_matrix)     │
  │                   ↓                                                   │
  │  ⑥ UPDATE optimizer_runs:                                            │
  │     baseline_accuracy=accuracy, current_eval_run_id=null             │
  │                                                                       │
  └───────────────────────────────────────────────────────────────────────┘

 PHASE 3 ─── 每輪優化（OPRO-style loop）
 ─────────────────────────────────────────────────────────────────────────────────

  ┌──────────────────────────────────────────────────────────────────────┐
  │                            ROUND N                                    │
  │                                                                       │
  │  1. analyze_failures(prompt, failing_cases, confusion_matrix)        │
  │     │ → 格式化 confusion summary（expected→predicted: count）         │
  │     │ → 附上代表性 failing cases（含 log_snippet, hardware_info）     │
  │     │ → OPTIMIZER_MODEL (OpenRouter) 分析失敗模式                    │
  │     │   在 asyncio.to_thread 中同步呼叫 httpx.Client                 │
  │     ▼  → analysis_text（純文字）                                      │
  │                                                                       │
  │  2. generate_improved_prompt(current_prompt, analysis_text)          │
  │     │ → OPTIMIZER_MODEL 生成改進 prompt                               │
  │     │   指令含：禁止新增 action / 保留 JSON 格式 / 針對混淆叢集修正   │
  │     ▼  → improved_prompt                                              │
  │                                                                       │
  │  3. PromptVersion.create(label="optimizer-round-N", is_active=False) │
  │     → candidate_pv_id                                                 │
  │                                                                       │
  │  4. _start_evaluation(candidate_pv_id, snapshot_ids=val_snapshot_ids)│
  │     → source="optimizer"（標記為 optimizer 自動啟動）                 │
  │     → UPDATE optimizer_runs: current_eval_run_id（前端可見進度）      │
  │                                                                       │
  │  5. _wait_for_evaluation(round_eval_run_id)                          │
  │     → 同 Phase 2 ⑤：enriched failing_cases + confusion_matrix       │
  │     → returns (accuracy, failing_cases, total, confusion_matrix)     │
  │                                                                       │
  │  6. KEEP / REVERT（Darwin 借鑒）                                      │
  │     candidate_accuracy > best_accuracy                                │
  │     ├── YES → activate 候選 prompt，kept=True                        │
  │     └── NO  → 不 activate，kept=False                                │
  │                                                                       │
  │  7. INSERT optimizer_rounds row:                                      │
  │     round_number, accuracy, prompt_version_id, eval_run_id,          │
  │     kept, optimizer_model, analysis_text, confusion_matrix (JSON)    │
  │                                                                       │
  │  8. INSERT optimizer_round_failures rows（最多 FAILURE_SAMPLE_LIMIT） │
  │     expected_action, predicted_action, log_snippet, hardware_info,   │
  │     confidence                                                        │
  │                                                                       │
  │  9. UPDATE optimizer_runs: current_eval_run_id=null                  │
  │                                                                       │
  └──────────────────────┬───────────────────────────────────────────────┘
                         │
         ┌───────────────┼────────────────┐
         │ accuracy      │ rounds >= max  │ else
         │ >= target     │                │ next round
         ▼               ▼               ─┘
    ┌─────────┐   ┌──────────────────┐
    │completed│   │completed_max_    │
    │         │   │rounds            │
    └────┬────┘   └────────┬─────────┘
         └────────┬────────┘

 PHASE 4 ─── Test-Set 最終驗收
 ─────────────────────────────────────────────────────────────────────────────────

         ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │  snapshot_test_set()  →  split=test 各 action 各 80 筆（共 400 筆）   │
  │  _start_evaluation(best_pv_id, snapshot_ids=test_ids)                 │
  │  _wait_for_evaluation(...)                                             │
  │  UPDATE optimizer_runs: test_accuracy, status, finished_at            │
  │                                                                        │
  │  NOTE: test split 在整個 optimizer run 期間從未被 optimizer 看到，     │
  │        此為唯一一次使用，結果是真正無偏的泛化估計。                     │
  └───────────────────────────────────────────────────────────────────────┘

 PHASE 5 ─── 人工檢查 Gate（目前 kept candidate 會自動 activate）
 ─────────────────────────────────────────────────────────────────────────────────

  GET /optimizer/history  →  PostgreSQL optimizer_runs + optimizer_rounds JOIN
  ┌────────────────────────────────────────────────────────────────────────┐
  │ optimizer_run_id: 4                                                    │
  │ optimizer_model:  deepseek/deepseek-v3                                 │
  │ evaluator_provider: openrouter / evaluator_model: qwen-235b            │
  │ baseline_accuracy: 0.53                                                │
  │ val_snapshot_ids: ["abc123", ...]  ← 固定 val 快照 ID（可重現）        │
  │ test_accuracy: 0.87               ← 最終 test-set 驗收結果            │
  │                                                                        │
  │ round │ accuracy │ pv_id │ kept │ confusion_matrix  │ analysis_text   │
  │   1   │  0.48    │  v4   │  ✗  │ {restart→human:22}│ "prompt lacks.."│
  │   2   │  0.61    │  v5   │  ✓  │ {restart→human:10}│ "added rule.."  │
  │   3   │  0.85    │  v6   │  ✓  │ {email→human:5}   │ "email rule.."  │
  └────────────────────────────────────────────────────────────────────────┘
                  │
                  │ 系統已依 Darwin keep/revert 自動 activate kept candidate
                  │ 人工看 val accuracy 趨勢 + confusion 改善 + test_accuracy
                  │ 評估 prompt 內容品質，必要時手動切回或指定其他版本
                  ▼
       PATCH /prompts/{id}/activate  ← 手動覆寫目前 active prompt

 ─────────────────────────────────────────────────────────────────────────────────
 關鍵設計決策
 ─────────────────────────────────────────────────────────────────────────────────

  【D1-v2】Optimizer LLM 統一走 OpenRouter
    OPTIMIZER_MODEL=deepseek/deepseek-v3（預設，可改）
    認證：共用 OPENROUTER_API_KEY，不需獨立 API key
    實作：httpx.Client (sync) in asyncio.to_thread，純文字回應（無 JSON suffix）

  【D2】Optimizer 資料持久化到 PostgreSQL
    optimizer_runs      → run 層級（status, model, accuracy, val_snapshot_ids）
    optimizer_rounds    → round 層級（accuracy, kept, confusion_matrix, analysis_text）
    optimizer_round_failures → bounded failure samples（OPTIMIZER_FAILURE_SAMPLE_LIMIT=50）
    Service restart 後完整保留所有 run 記錄

  【D3-v2】取樣改為固定 val snapshot（非每輪隨機）
    ├── 固定快照確保各輪 accuracy 可 apples-to-apples 比較
    ├── train split (2400筆)：失敗分析素材（目前 optimizer 未直接使用）
    ├── val split   ( 800筆)：optimizer run 內固定 200 筆評分
    └── test split  ( 800筆)：鎖定，僅 run 結束後跑一次驗收

  【D4】Failure 診斷資料
    ├── confusion_matrix per round：找出主要混淆 cluster
    ├── analysis_text：optimizer LLM 針對 confusion 的分析文字
    └── failure samples：含 log_snippet + hardware_info，限 50 筆/round

  【D5-v2】Evaluator 與 Optimizer LLM 分離（D5 分離原則）
    ├── Evaluator：active provider（可任意切換，例如 nvidia/deepseek）
    └── Optimizer：OPTIMIZER_MODEL（分析+改進 prompt 用，必須與 evaluator 不同）

 ─────────────────────────────────────────────────────────────────────────────────
 完整 API 一覽
 ─────────────────────────────────────────────────────────────────────────────────

  OPTIMIZER
  ─────────────────────────────────────────────────────────────────────
  POST   /optimizer/run           觸發優化 loop
  GET    /optimizer/history       run + round 歷史（含 confusion_matrix, analysis_text）
  DELETE /optimizer/runs/{id}     取消進行中的 run（in-memory cancel flag）

  EVAL POOL
  ─────────────────────────────────────────────────────────────────────
  GET    /eval-pool/stats         {"total", "by_action", "by_split"}
  GET    /review-queue            列出低信心待審查 entries
  PATCH  /review-queue/{id}       confirm / correct / reject

  EVALUATION
  ─────────────────────────────────────────────────────────────────────
  POST   /evaluate                source="optimizer" + snapshot_ids（optimizer 內部）
  GET    /evaluate/jobs           進行中的評估 jobs（含 source 欄位）
  DELETE /evaluate/jobs/{id}      取消評估 job
  GET    /evaluate/history        所有歷史評估 runs（含 source 欄位）
  GET    /evaluate/history/{id}   單一 run 詳細結果（running 時即時 accuracy）

  PROMPT
  ─────────────────────────────────────────────────────────────────────
  GET    /prompts                 列出所有 PromptVersion
  PATCH  /prompts/{id}/activate   人工覆寫目前 active prompt

  CONFIG
  ─────────────────────────────────────────────────────────────────────
  GET    /config/provider         目前 provider + 可用清單
  PATCH  /config/provider         切換 provider（ollama/claude/codex/openrouter/nvidia）

 ─────────────────────────────────────────────────────────────────────────────────
 資料流總覽
 ─────────────────────────────────────────────────────────────────────────────────

  logs/ → generate_eval_pool_from_logs.py → eval_pool.json (4000筆, split欄位)
                                                   │
                                                   ▼ (選擇性)
                              relabel_eval_pool.py → 更新 expected_action / 移至 review_queue
                                                   │
                     ┌─────────────────────────────┤
                     │                             │
                train split                   val + test split
               (2400筆/5actions)              (各 800筆)
                     │                             │
                     ▼                             ▼
            失敗分析用素材              snapshot_val_set() / snapshot_test_set()
                                              → 固定 ID list → _start_evaluation()
                                                                │
                                                   ┌──────────▼──────────┐
                                                   │  eval_runs (DB)     │
                                                   │  source="optimizer" │
                                                   │  accuracy, correct  │
                                                   └──────────┬──────────┘
                                                              │
                                              ┌───────────────▼───────────────┐
                                              │  optimizer_runs (DB)          │
                                              │  baseline_accuracy            │
                                              │  val_snapshot_ids             │
                                              │  test_accuracy                │
                                              │  status, finished_at          │
                                              └───────────────┬───────────────┘
                                                              │
                                              ┌───────────────▼───────────────┐
                                              │  optimizer_rounds (DB)        │
                                              │  accuracy, kept               │
                                              │  confusion_matrix (JSON)      │
                                              │  analysis_text                │
                                              └───────────────┬───────────────┘
                                                              │
                                              ┌───────────────▼───────────────┐
                                              │  optimizer_round_failures(DB) │
                                              │  log_snippet, hardware_info   │
                                              │  expected/predicted action    │
                                              │  ≤ 50 rows / round            │
                                              └───────────────────────────────┘

 ─────────────────────────────────────────────────────────────────────────────────
 輔助工具
 ─────────────────────────────────────────────────────────────────────────────────

  scripts/compare_optimizer_models.py
    ├── 比較多個 OPTIMIZER_MODEL 在相同 val snapshot 的效果
    ├── 不 activate 任何 prompt（dry-run）
    └── 輸出：model / baseline_acc / candidate_acc / delta / would_keep

  scripts/generate_eval_pool_from_logs.py
    └── 從 logs/ 資料夾重新建立 eval_pool.json（含 split 分配）

  scripts/relabel_eval_pool.py
    └── LLM 重標記低品質 label，confidence < 0.8 移至 review_queue
```
