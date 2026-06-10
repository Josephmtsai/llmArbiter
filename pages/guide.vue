<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const lang = ref<'en' | 'zh'>('en')
function t(obj: { en: string; zh: string }): string {
  return obj[lang.value]
}

interface BiStr {
  en: string
  zh: string
}

interface FlowStep {
  eyebrow: string
  title: BiStr
  body: BiStr
  meta: string
}

interface StatItem {
  label: BiStr
  value: string
  note: BiStr
}

interface EndpointGroup {
  label: BiStr
  endpoints: string[]
}

interface FlowNode {
  label: BiStr
  body: BiStr
  tag: string
  important?: boolean
}

interface VisualLane {
  label: BiStr
  nodes: FlowNode[]
}

interface Checkpoint {
  label: string
  title: BiStr
  body: BiStr
}

interface GateCard {
  num: string
  label: BiStr
  formula: string
  rejectLabel: BiStr
  example: { title: BiStr; lines: string[] }
  note?: BiStr
}

interface ToleranceRow {
  action: string
  display: BiStr
  tolerance: string
  appliesWhen: BiStr
  protected: boolean
}

interface RoundState {
  badgeClass: string
  label: BiStr
  body: BiStr
  skipReasons?: string[]
}

// ── Pool stats ────────────────────────────────────────────────
const poolStats: StatItem[] = [
  {
    label: { en: 'Eval pool', zh: '評估池' },
    value: '12,000',
    note: { en: '2,400 cases per action across five CI/hardware action types.', zh: '五種 CI / 硬體動作類別，每類 2,400 筆案例。' },
  },
  {
    label: { en: 'Train split', zh: '訓練集' },
    value: '10,400',
    note: { en: 'Used for relabeling and curation — not used for optimizer scoring.', zh: '用於重新標記與資料整理，不用於最佳化器評分。' },
  },
  {
    label: { en: 'Validation split', zh: '驗證集' },
    value: '800',
    note: { en: 'Optimizer snapshots 200 of these per run (40/action) — fixed for the whole run.', zh: '最佳化器每次執行從中抽樣 200 筆（每動作 40 筆），全程固定不變。' },
  },
  {
    label: { en: 'Test split', zh: '測試集' },
    value: '800',
    note: { en: 'Final test snapshot is 400 cases (80/action), evaluated once after the optimizer loop.', zh: '最終測試快照為 400 筆（每動作 80 筆），只在最佳化迴圈結束後評估一次。' },
  },
]

// ── Visual flow lanes ─────────────────────────────────────────
const visualLanes: VisualLane[] = [
  {
    label: { en: 'Pool preparation', zh: '池資料準備' },
    nodes: [
      {
        label: { en: 'Raw logs', zh: '原始日誌' },
        body: { en: 'LogChunks, Travis CI, BGL, and HPC hardware logs enter the pool builder.', zh: 'LogChunks、Travis CI、BGL 及 HPC 硬體日誌進入資料池建構器。' },
        tag: 'inputs',
      },
      {
        label: { en: 'Review queue', zh: '審核佇列' },
        body: { en: 'Low-confidence relabels wait for confirm, correct, or reject before joining the trusted pool.', zh: '低信心度重新標記的案例須經確認、更正或拒絕後，才能加入可信資料池。' },
        tag: 'human check',
        important: true,
      },
      {
        label: { en: 'Split pool', zh: '資料分割' },
        body: { en: 'Train (10,400), validation (800), and test (800) splits stay separated so optimizer scoring remains honest.', zh: '訓練（10,400）、驗證（800）、測試（800）三份資料保持隔離，確保最佳化器評分不受污染。' },
        tag: '12,000 cases',
      },
    ],
  },
  {
    label: { en: 'Optimizer loop', zh: '最佳化迴圈' },
    nodes: [
      {
        label: { en: 'Val snapshot', zh: '驗證快照' },
        body: { en: 'Each run snapshots 200 fixed validation cases (40/action) before scoring baseline and candidates. Same 200 cases every round.', zh: '每次執行在評估基準與候選提示之前，先抽取 200 筆固定驗證案例（每動作 40 筆）。每輪使用相同的 200 筆。' },
        tag: 'fixed · 200 cases',
        important: true,
      },
      {
        label: { en: 'Baseline eval', zh: '基準評估' },
        body: { en: 'The active prompt is measured first on the snapshot, producing baseline accuracy and failure clusters.', zh: '先以快照評估現行提示，產生基準準確率與失敗叢集。' },
        tag: 'source=optimizer',
      },
      {
        label: { en: 'Candidate round', zh: '候選輪次' },
        body: { en: 'The optimizer LLM reads per-action confusion clusters to identify systematic failure patterns, then writes analysis_text, generates an inactive prompt version, and evaluates it on the same snapshot.', zh: '最佳化器 LLM 讀取各動作的混淆叢集以找出系統性失敗模式，撰寫 analysis_text，生成非啟用的候選提示版本，並以相同快照進行評估。' },
        tag: 'round N',
      },
      {
        label: { en: 'Two-gate decision', zh: '雙閘決策' },
        body: { en: 'Kept only if (1) overall validation accuracy improves AND (2) no protected action (notify_human, send_email) regresses beyond tolerance.', zh: '候選提示須同時通過兩道閘：（1）整體驗證準確率提升，且（2）受保護動作（notify_human、send_email）回退幅度不超過容差。' },
        tag: 'both gates',
        important: true,
      },
    ],
  },
  {
    label: { en: 'Release gate', zh: '發布閘控' },
    nodes: [
      {
        label: { en: 'Held-out test', zh: '保留測試集' },
        body: { en: 'After target accuracy or max rounds, the best prompt is scored on the reserved test snapshot (400 cases, 80/action).', zh: '達到目標準確率或最大輪數後，以保留測試快照（400 筆，每動作 80 筆）評估最佳提示。' },
        tag: 'test_accuracy',
        important: true,
      },
      {
        label: { en: 'History view', zh: '歷史紀錄' },
        body: { en: 'Runs, rounds, confusion matrices, and failure samples are persisted in PostgreSQL.', zh: '執行記錄、輪次、混淆矩陣與失敗樣本均儲存於 PostgreSQL。' },
        tag: 'auditable',
      },
      {
        label: { en: 'Manual activation', zh: '人工啟用' },
        body: { en: 'Generated prompts remain inactive until an operator activates the chosen version.', zh: '生成的提示版本保持非啟用狀態，直到操作員手動選擇啟用。' },
        tag: 'operator gate',
        important: true,
      },
    ],
  },
]

// ── Checkpoints ───────────────────────────────────────────────
const checkpoints: Checkpoint[] = [
  {
    label: 'Important',
    title: { en: 'Validation snapshot is fixed per run', zh: '驗證快照在每次執行中固定不變' },
    body: { en: 'Every baseline and candidate round is scored against the same 200 validation cases, so accuracy movement across rounds is directly comparable.', zh: '每次基準評估與候選輪次都對同一組 200 筆驗證案例評分，使跨輪次的準確率變動直接可比。' },
  },
  {
    label: 'Important',
    title: { en: 'Per-action regression gate protects critical actions', zh: '各動作回退閘保護關鍵動作' },
    body: { en: 'Even if overall validation accuracy improves, a candidate is rejected when notify_human or send_email regresses beyond 2%. trigger_* actions allow up to 5%.', zh: '即使整體驗證準確率提升，只要 notify_human 或 send_email 回退超過 2%，候選提示即遭拒。trigger_* 動作允許最多 5% 的回退。' },
  },
  {
    label: 'Important',
    title: { en: 'Candidates are not auto-activated', zh: '候選提示不自動啟用' },
    body: { en: 'The optimizer generates prompt versions, but the active production prompt changes only through the operator-controlled prompt activation gate.', zh: '最佳化器只生成提示版本；現行生產提示只能透過操作員控制的提示啟用閘才能變更。' },
  },
  {
    label: 'Important',
    title: { en: 'Validation accuracy ≠ Test accuracy', zh: '驗證準確率 ≠ 測試準確率' },
    body: { en: 'Round accuracy and accuracy_delta measure performance on the validation snapshot. test_accuracy is reported once after the loop ends on a separate held-out set.', zh: '輪次準確率與 accuracy_delta 衡量的是驗證快照上的表現。test_accuracy 只在迴圈結束後，對獨立保留集評估一次後回報。' },
  },
]

// ── Keep/Reject Gate data ─────────────────────────────────────
const gateCards: GateCard[] = [
  {
    num: '1',
    label: { en: 'Overall accuracy gate', zh: '整體準確率閘' },
    formula: 'overall_pass = round_accuracy > previous_best_accuracy',
    rejectLabel: { en: 'Rejected: no overall improvement', zh: '拒絕：整體未改善' },
    example: {
      title: { en: 'Example — fails Gate 1', zh: '範例 — 未通過閘 1' },
      lines: [
        'previous_best_accuracy = 0.7600',
        'round_accuracy         = 0.6000',
        'overall_pass           = 0.6000 > 0.7600 = false',
        '→ Rejected (even if one action improved)',
      ],
    },
  },
  {
    num: '2',
    label: { en: 'Per-action regression gate', zh: '各動作回退閘' },
    formula: 'action_pass = action_delta ≥ −tolerance  (for each action with baseline ≥ 10 samples)',
    rejectLabel: { en: 'Rejected: action regression', zh: '拒絕：動作回退' },
    example: {
      title: { en: 'Example — fails Gate 2 despite overall gain', zh: '範例 — 整體提升但未通過閘 2' },
      lines: [
        'previous_best_accuracy    = 0.7600',
        'round_accuracy            = 0.7900  ← overall_pass = true',
        '',
        'send_email baseline_acc   = 0.8000',
        'send_email candidate_acc  = 0.7400',
        'send_email delta          = −0.0600',
        'send_email tolerance      =  0.0200',
        'action_pass(send_email)   = −0.0600 ≥ −0.0200 = false',
        '→ Rejected: action-regressed:send_email',
      ],
    },
    note: { en: 'Gate 2 applies only when the baseline has ≥ 10 samples for that action. notify_human and send_email are protected at ±2% because an unexpected drop routes real incidents to automated-only paths, bypassing the human escalation layer.', zh: 'Gate 2 僅在該動作基準樣本數 ≥ 10 時生效。notify_human 與 send_email 採用 ±2% 嚴格容差，因為偵測率意外下降會使真實事件繞過人工升級層，僅由自動化流程處理。' },
  },
]

const toleranceRows: ToleranceRow[] = [
  { action: 'notify_human', display: { en: 'Notify Human', zh: '通知人工' }, tolerance: '±2%', appliesWhen: { en: 'baseline ≥ 10 samples', zh: '基準 ≥ 10 筆' }, protected: true },
  { action: 'send_email', display: { en: 'Escalate', zh: '升級通報' }, tolerance: '±2%', appliesWhen: { en: 'baseline ≥ 10 samples', zh: '基準 ≥ 10 筆' }, protected: true },
  { action: 'trigger_rebuild', display: { en: 'Rebuild', zh: '重建' }, tolerance: '±5%', appliesWhen: { en: 'baseline ≥ 10 samples', zh: '基準 ≥ 10 筆' }, protected: false },
  { action: 'trigger_fallback', display: { en: 'Fallback', zh: '降級回退' }, tolerance: '±5%', appliesWhen: { en: 'baseline ≥ 10 samples', zh: '基準 ≥ 10 筆' }, protected: false },
  { action: 'trigger_restart', display: { en: 'Restart', zh: '重啟' }, tolerance: '±5%', appliesWhen: { en: 'baseline ≥ 10 samples', zh: '基準 ≥ 10 筆' }, protected: false },
]

// ── Round states ──────────────────────────────────────────────
const roundStates: RoundState[] = [
  {
    badgeClass: 'arb-guide__badge--kept',
    label: { en: 'Kept', zh: '保留' },
    body: { en: 'Candidate passed both gates — overall validation accuracy improved and no protected action regressed beyond tolerance. The candidate became the new best prompt for subsequent rounds.', zh: '候選提示通過雙閘：整體驗證準確率提升，且受保護動作回退未超出容差。該候選成為後續輪次的新最佳提示。' },
  },
  {
    badgeClass: 'arb-guide__badge--rejected',
    label: { en: 'Rejected: no overall improvement', zh: '拒絕：整體未改善' },
    body: { en: 'Overall validation accuracy did not improve compared to the previous best. The previous best prompt is kept. This is the most common rejection reason.', zh: '整體驗證準確率未優於先前最佳值，保留原最佳提示。這是最常見的拒絕原因。' },
  },
  {
    badgeClass: 'arb-guide__badge--rejected',
    label: { en: 'Rejected: action regression', zh: '拒絕：動作回退' },
    body: { en: 'Overall accuracy improved, but at least one protected action (notify_human or send_email) regressed beyond its tolerance. Even a net improvement is rejected when a critical action degrades.', zh: '整體準確率提升，但至少一個受保護動作（notify_human 或 send_email）回退超出容差。即使有淨改善，只要關鍵動作劣化即遭拒絕。' },
  },
  {
    badgeClass: 'arb-guide__badge--skipped',
    label: { en: 'Skipped', zh: '略過' },
    body: { en: 'The optimizer model did not return a usable candidate prompt. A skipped round is NOT evidence the prompt got worse — it means no candidate was tested. The backend retries once before recording a skip.', zh: '最佳化器模型未回傳可用的候選提示。略過的輪次並非表示提示變差——它代表沒有候選被測試。後端重試一次後才記錄略過。' },
    skipReasons: [
      'optimizer-candidate-invalid-json',
      'optimizer-candidate-missing-actions:<action>',
      'optimizer-candidate-missing-json-contract',
      'optimizer-candidate-missing-fields:<field>',
      'optimizer-candidate-unsupported-actions:<action>',
    ],
  },
]

// ── Flow steps ─────────────────────────────────────────────────
const flowSteps: FlowStep[] = [
  {
    eyebrow: 'Phase 0',
    title: { en: 'Build and curate the eval pool', zh: '建立並整理評估池' },
    body: { en: 'LogChunks, Travis CI, BGL, and HPC logs are converted into labeled eval cases. Low-confidence relabels go to the review queue before they join the trusted pool. Cases sharing a split_group key are assigned to the same data split to prevent near-duplicate leakage across train, validation, and test boundaries.', zh: 'LogChunks、Travis CI、BGL 及 HPC 日誌轉換為已標記的評估案例。低信心度的重新標記進入審核佇列。共享同一 split_group 鍵的案例會被分配到同一資料集，防止近似重複案例洩漏至訓練、驗證與測試邊界之間。' },
    meta: 'generate_eval_pool_from_logs.py + relabel_eval_pool.py',
  },
  {
    eyebrow: 'Phase 1',
    title: { en: 'Start an optimizer run', zh: '啟動最佳化執行' },
    body: { en: 'The backend creates an optimizer_runs row, records the optimizer/evaluator models, and samples a fixed validation snapshot (200 cases, 40 per action) — so every round is scored against the same cases.', zh: '後端建立 optimizer_runs 記錄，記下最佳化器與評估器的模型名稱，並抽樣固定的驗證快照（200 筆，每動作 40 筆），使每輪都與相同案例比較。' },
    meta: 'POST /optimizer/run',
  },
  {
    eyebrow: 'Phase 2',
    title: { en: 'Measure the baseline', zh: '測量基準值' },
    body: { en: 'The active prompt is evaluated on the validation snapshot (source=optimizer). The run stores baseline_accuracy — the accuracy of the active prompt before any candidate was generated.', zh: '以驗證快照評估現行提示（source=optimizer），執行記錄 baseline_accuracy——即生成任何候選提示之前的現行提示準確率。' },
    meta: 'POST /evaluate + GET /evaluate/history/{id}',
  },
  {
    eyebrow: 'Phase 3',
    title: { en: 'Analyze failures and generate a candidate', zh: '分析失敗並生成候選提示' },
    body: { en: 'The optimizer LLM reads failed cases and per-action confusion clusters to identify systematic failure patterns, writes analysis_text, generates an inactive prompt version, and evaluates that candidate on the same validation snapshot. The validation accuracy delta measures improvement over the previous best — not over all 12,000 pool cases.', zh: '最佳化器 LLM 讀取失敗案例與各動作混淆叢集，找出系統性失敗模式，撰寫 analysis_text，生成非啟用的候選提示版本，並以相同驗證快照評估。驗證準確率 delta 衡量相對於先前最佳值的改善幅度，而非對全部 12,000 筆池案例的改善。' },
    meta: 'OpenRouter optimizer model',
  },
  {
    eyebrow: 'Phase 4',
    title: { en: 'Two-gate keep/reject decision', zh: '雙閘保留／拒絕決策' },
    body: { en: 'A candidate is kept only when it passes both the overall accuracy gate (round > previous best) and the per-action regression gate (notify_human and send_email must not drop more than 2%; other actions allow 5%). Round accuracy, kept flag, reject_reason, confusion matrix, and failure samples are stored in PostgreSQL.', zh: '候選提示須同時通過整體準確率閘（本輪 > 先前最佳）與各動作回退閘（notify_human 與 send_email 最多允許 2% 下降，其他動作允許 5%）才被保留。輪次準確率、保留旗標、reject_reason、混淆矩陣與失敗樣本均儲存於 PostgreSQL。' },
    meta: 'optimizer_rounds + optimizer_round_failures',
  },
  {
    eyebrow: 'Phase 5',
    title: { en: 'Run the final test evaluation', zh: '執行最終測試評估' },
    body: { en: 'After reaching the target accuracy or max rounds, the best prompt is evaluated against the held-out test snapshot (400 cases, 80 per action) and the run records test_accuracy. This is a one-time check — test data is never used to decide which round to keep.', zh: '達到目標準確率或最大輪數後，以保留測試快照（400 筆，每動作 80 筆）評估最佳提示，執行記錄 test_accuracy。這是一次性檢查——測試資料永遠不用於決定保留哪輪。' },
    meta: 'snapshot_test_set()',
  },
]

// ── DB artifacts ───────────────────────────────────────────────
const dbArtifacts: Array<BiStr> = [
  { en: 'optimizer_runs: status, model names, baseline_accuracy, test_accuracy, val/test snapshot ids', zh: 'optimizer_runs：狀態、模型名稱、baseline_accuracy、test_accuracy、驗證/測試快照 ID' },
  { en: 'optimizer_rounds: accuracy, kept, reject_reason, skip_reason, prompt_version_id, analysis_text, confusion_matrix', zh: 'optimizer_rounds：準確率、保留旗標、reject_reason、skip_reason、提示版本 ID、analysis_text、混淆矩陣' },
  { en: 'optimizer_round_failures: bounded samples with expected/predicted actions and log snippets', zh: 'optimizer_round_failures：附上預期/預測動作與日誌片段的有界失敗樣本' },
  { en: 'eval_runs: source=db, source=pool, or source=optimizer for history and jobs', zh: 'eval_runs：source=db、source=pool 或 source=optimizer，用於歷史記錄與任務' },
]

// ── Endpoint groups ────────────────────────────────────────────
const endpointGroups: EndpointGroup[] = [
  {
    label: { en: 'Optimizer', zh: '最佳化器' },
    endpoints: ['POST /optimizer/run', 'GET /optimizer/history', 'GET /optimizer/history/{run_id}', 'DELETE /optimizer/runs/{id}'],
  },
  {
    label: { en: 'Evaluation', zh: '評估' },
    endpoints: ['POST /evaluate', 'GET /evaluate/jobs', 'GET /evaluate/history', 'GET /evaluate/history/{id}'],
  },
  {
    label: { en: 'Pool review', zh: '資料池審核' },
    endpoints: ['GET /eval-pool/stats', 'GET /review-queue', 'PATCH /review-queue/{id}'],
  },
  {
    label: { en: 'Prompt gate', zh: '提示閘控' },
    endpoints: ['GET /config/prompts', 'PATCH /config/prompts/{id}/activate'],
  },
]

// ── Computed UI strings ────────────────────────────────────────
const ui = computed(() => ({
  heroEyebrow: t({ en: 'Auto Prompt Optimizer v2', zh: '自動提示最佳化器 v2' }),
  heroTitle: t({ en: 'A closed-loop prompt improvement system with held-out validation and per-action protection.', zh: '具保留集驗證與各動作保護機制的閉環提示改善系統。' }),
  heroCallout: t({ en: 'Improve on validation, protect critical actions, prove on test, activate by human choice.', zh: '在驗證集改善、保護關鍵動作、在測試集驗證、由人工選擇啟用。' }),
  dataSplitsEyebrow: t({ en: 'Data splits', zh: '資料分割' }),
  dataSplitsHeading: t({ en: 'Pool splits vs optimizer snapshot sizes', zh: '資料池分割 vs 最佳化器快照大小' }),
  flowEyebrow: t({ en: 'Flow diagram', zh: '流程圖' }),
  flowHeading: t({ en: 'The full optimizer flow in one picture', zh: '一張圖看懂完整最佳化器流程' }),
  loopEyebrow: t({ en: 'Optimizer loop', zh: '最佳化迴圈' }),
  loopHeading: t({ en: 'Step-by-step: from snapshot to kept or rejected', zh: '逐步說明：從快照到保留或拒絕' }),
  loopDesc: t({ en: 'Each optimizer run works through these steps in order. Both gates must pass for a round to be kept.', zh: '每次最佳化執行依序執行以下步驟。輪次必須同時通過兩道閘才能被保留。' }),
  gateEyebrow: t({ en: 'Keep / reject gate', zh: '保留 / 拒絕閘' }),
  gateHeading: t({ en: 'The two gates a candidate must pass', zh: '候選提示必須通過的兩道閘' }),
  toleranceLabel: t({ en: 'Regression tolerance', zh: '回退容差' }),
  toleranceByAction: t({ en: 'by action', zh: '依動作' }),
  toleranceColAction: t({ en: 'Action', zh: '動作' }),
  toleranceColTolerance: t({ en: 'Tolerance', zh: '容差' }),
  toleranceColApplies: t({ en: 'Applies when', zh: '適用條件' }),
  toleranceColProtected: t({ en: 'Protected', zh: '受保護' }),
  roundEyebrow: t({ en: 'Round outcomes', zh: '輪次結果' }),
  roundHeading: t({ en: 'All four round states explained', zh: '四種輪次狀態說明' }),
  skipReasonsLabel: t({ en: 'Common skip reasons', zh: '常見略過原因' }),
  runtimeEyebrow: t({ en: 'Runtime flow', zh: '執行流程' }),
  runtimeHeading: t({ en: 'From raw logs to a tested prompt candidate', zh: '從原始日誌到已測試的候選提示' }),
  checkpointEyebrow: t({ en: 'Important checkpoints', zh: '重要檢查點' }),
  checkpointHeading: t({ en: 'The parts that protect prompt quality', zh: '保護提示品質的關鍵環節' }),
  accuracyEyebrow: t({ en: 'Accuracy terms', zh: '準確率術語' }),
  accuracyHeading: t({ en: 'Three accuracy numbers, three different meanings', zh: '三個準確率數字，三種不同含義' }),
  accuracyBaselineLabel: t({ en: 'Baseline accuracy', zh: '基準準確率' }),
  accuracyBaselineBody: t({ en: "The starting point. Measured once at run start on the validation snapshot (200 cases). Every round's improvement is measured relative to the current best, which starts at baseline.", zh: '起始點。在執行開始時以驗證快照（200 筆）測量一次。每輪的改善幅度相對於當前最佳值計算，初始最佳值即為基準。' }),
  accuracyBestLabel: t({ en: 'Best accuracy', zh: '最佳準確率' }),
  accuracyBestBody: t({ en: 'The highest validation accuracy seen so far across baseline and all kept rounds. Used as the threshold for Gate 1. Rounds are compared against this, not against baseline.', zh: '迄今在基準與所有保留輪次中觀察到的最高驗證準確率。作為閘 1 的閾值，各輪次與此比較，而非與基準比較。' }),
  accuracyTestLabel: t({ en: 'Test accuracy', zh: '測試準確率' }),
  accuracyDeltaLabel: t({ en: 'Accuracy delta', zh: '準確率 delta' }),
  accuracyDeltaBody: t({ en: 'Per-round validation accuracy movement: round_accuracy − previous_best_accuracy. Positive means the candidate improved. This delta is always computed on the fixed validation snapshot, never on the held-out test data.', zh: '每輪驗證準確率變動：round_accuracy − previous_best_accuracy。正值表示候選提示有改善。此 delta 始終在固定驗證快照上計算，從不使用保留測試資料。' }),
  persistenceEyebrow: t({ en: 'Persistence', zh: '資料持久化' }),
  persistenceHeading: t({ en: 'History is database-backed', zh: '歷史記錄由資料庫支撐' }),
  persistenceDesc: t({ en: 'Optimizer runs, rounds, diagnostics, and failure samples are stored in PostgreSQL, so service restarts do not erase run history. The list endpoint stays lightweight; the detail endpoint loads the heavy failure samples for one run.', zh: '最佳化器執行記錄、輪次、診斷資訊與失敗樣本均儲存於 PostgreSQL，服務重啟不會清除執行歷史。列表端點保持輕量；詳細端點為單一執行載入完整失敗樣本。' }),
  operatorEyebrow: t({ en: 'Operator controls', zh: '操作員控制' }),
  operatorHeading: t({ en: 'Where each part shows up in the UI', zh: '各部分在 UI 中的位置' }),
  operatorOptimizerTitle: t({ en: 'Auto optimizer', zh: '自動最佳化器' }),
  operatorOptimizerCopy: t({ en: 'Start runs, review pool health, inspect rounds with gate decisions, and cancel active runs.', zh: '啟動執行、檢視資料池健康狀況、查看輪次閘決策，並取消進行中的執行。' }),
  operatorEvalTitle: t({ en: 'Eval history', zh: '評估歷史' }),
  operatorEvalCopy: t({ en: 'See source badges for db, pool, and optimizer runs, plus live progress while running.', zh: '查看 db、pool 與 optimizer 執行的來源標記，以及執行中的即時進度。' }),
  operatorPromptTitle: t({ en: 'Prompt settings', zh: '提示設定' }),
  operatorPromptCopy: t({ en: 'Generated prompt versions remain inactive until an operator activates one here.', zh: '生成的提示版本保持非啟用狀態，直到操作員在此處選擇啟用。' }),
  apiEyebrow: t({ en: 'API map', zh: 'API 對應表' }),
  apiHeading: t({ en: 'Endpoints used by the optimizer workflow', zh: '最佳化器工作流程使用的端點' }),
  miniMapKeyIdea: t({ en: 'Key idea', zh: '核心概念' }),
  miniMapLabels: ['Logs', 'Pool', 'Baseline', 'Candidate', 'Gate 1+2', 'Test'].map(en =>
    t({ en, zh: ({ Logs: '日誌', Pool: '資料池', Baseline: '基準', Candidate: '候選', 'Gate 1+2': '雙閘', Test: '測試' } as Record<string, string>)[en] ?? en })
  ),
}))
</script>

<template>
  <AppTopBar title="How it works" subtitle="Auto Prompt Optimizer architecture" />

  <main class="arb-guide">

    <!-- ── Language toggle ───────────────────────────────────── -->
    <div class="arb-guide__lang-tabs" role="tablist" aria-label="Language / 語言">
      <button
        class="arb-guide__lang-tab"
        :class="{ 'arb-guide__lang-tab--active': lang === 'en' }"
        @click="lang = 'en'"
      >EN</button>
      <button
        class="arb-guide__lang-tab"
        :class="{ 'arb-guide__lang-tab--active': lang === 'zh' }"
        @click="lang = 'zh'"
      >中文</button>
    </div>

    <!-- ── Hero ──────────────────────────────────────────────── -->
    <section class="arb-guide__hero">
      <div class="arb-guide__hero-copy">
        <UiEyebrow>{{ ui.heroEyebrow }}</UiEyebrow>
        <h1 class="arb-guide__title">{{ ui.heroTitle }}</h1>
        <p class="arb-guide__lead">
          {{ lang === 'en'
            ? 'The optimizer does not blindly activate a generated prompt. It builds a curated eval pool, snapshots a stable validation set, measures '
            : '最佳化器不會盲目啟用生成的提示。它建立精選評估池、抽取穩定驗證集快照、測量' }}<GuideTooltip text="Accuracy of the active prompt on the run's fixed validation snapshot before any candidate prompt was generated.">{{ lang === 'en' ? 'baseline accuracy' : '基準準確率' }}</GuideTooltip>{{ lang === 'en' ? ', improves candidates round by round through a two-gate decision, and only exposes prompt versions for deliberate activation. The underlying arbiter uses a two-layer decision: an LLM chooses the action (trigger_rebuild, notify_human, etc.) and a confidence gate decides the execution mode (auto vs. human review).' : '，透過雙閘決策逐輪改善候選提示，只對刻意啟用的提示版本開放。底層仲裁器採用兩層決策：LLM 選擇動作（trigger_rebuild、notify_human 等），信心閘決定執行模式（自動 vs. 人工審核）。' }}
        </p>
      </div>
      <div class="arb-guide__hero-panel" aria-label="Optimizer loop summary">
        <div class="arb-guide__mini-map">
          <span v-for="label in ui.miniMapLabels" :key="label">{{ label }}</span>
        </div>
        <div class="arb-guide__hero-callout">
          <span class="arb-guide__marker">{{ ui.miniMapKeyIdea }}</span>
          <strong>{{ ui.heroCallout }}</strong>
        </div>
      </div>
    </section>

    <!-- ── Pool stats ─────────────────────────────────────────── -->
    <section class="arb-guide__stats" aria-label="Eval pool splits">
      <UiCard v-for="item in poolStats" :key="item.label.en" class="arb-guide__stat-card">
        <span class="arb-guide__stat-label">{{ t(item.label) }}</span>
        <strong class="arb-guide__stat-value num">{{ item.value }}</strong>
        <span class="arb-guide__stat-note">{{ t(item.note) }}</span>
      </UiCard>
    </section>

    <!-- ── Data split diagram ─────────────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>{{ ui.dataSplitsEyebrow }}</UiEyebrow>
        <h2 class="arb-guide__heading">{{ ui.dataSplitsHeading }}</h2>
        <p class="arb-guide__desc">
          {{ lang === 'en' ? 'The full pool has 12,000 cases, but the optimizer never evaluates all of them per round. A ' : '完整資料池有 12,000 筆案例，但最佳化器每輪不評估全部。每次執行開始時抽取一組 ' }}<GuideTooltip text="A fixed set of 200 validation cases (40 per action) sampled once at run start. Every round in the same run uses the same 200 cases — so accuracy numbers across rounds are directly comparable.">{{ lang === 'en' ? 'validation snapshot' : '200 筆驗證快照' }}</GuideTooltip>{{ lang === 'en' ? ' of 200 cases is sampled once when a run starts and used for every candidate round. The held-out test snapshot (400 cases) is only evaluated once after the loop ends. Cases sharing a ' : '（每動作 40 筆），用於所有候選輪次。保留測試快照（400 筆）只在迴圈結束後評估一次。共享 ' }}<GuideTooltip text="A deduplication key. Cases sharing a split_group are assigned to the same data split to prevent near-duplicate leakage across train/val/test boundaries.">split_group</GuideTooltip>{{ lang === 'en' ? ' key are assigned to the same data split to prevent near-duplicate leakage across train, validation, and test boundaries.' : ' 鍵的案例會被分配到同一資料集，防止近似重複案例洩漏。' }}
        </p>
      </div>
      <GuideSplitDiagram />
    </section>

    <!-- ── Flow diagram (lanes) ───────────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>{{ ui.flowEyebrow }}</UiEyebrow>
        <h2 class="arb-guide__heading">{{ ui.flowHeading }}</h2>
      </div>

      <div class="arb-guide__visual-flow" aria-label="Auto Prompt Optimizer flow diagram">
        <section v-for="lane in visualLanes" :key="lane.label.en" class="arb-guide__lane">
          <div class="arb-guide__lane-label">{{ t(lane.label) }}</div>
          <div class="arb-guide__lane-track">
            <article
              v-for="node in lane.nodes"
              :key="node.label.en"
              class="arb-guide__node"
              :class="{ 'arb-guide__node--important': node.important }"
            >
              <div class="arb-guide__node-head">
                <span>{{ t(node.label) }}</span>
                <span v-if="node.tag" class="arb-guide__node-tag">
                  <template v-if="node.tag === 'source=optimizer'">
                    <GuideTooltip text="Eval runs created by the optimizer are tagged source=optimizer to distinguish them from manual evals (source=db) and pool runs (source=pool).">{{ node.tag }}</GuideTooltip>
                  </template>
                  <template v-else>{{ node.tag }}</template>
                </span>
              </div>
              <span v-if="node.important" class="arb-guide__marker">{{ lang === 'en' ? 'Important checkpoint' : '重要檢查點' }}</span>
              <p>{{ t(node.body) }}</p>
            </article>
          </div>
        </section>
      </div>
    </section>

    <!-- ── Loop diagram ───────────────────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>{{ ui.loopEyebrow }}</UiEyebrow>
        <h2 class="arb-guide__heading">{{ ui.loopHeading }}</h2>
        <p class="arb-guide__desc">{{ ui.loopDesc }}</p>
      </div>
      <GuideLoopDiagram />
    </section>

    <!-- ── Keep/Reject Gate section ──────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>{{ ui.gateEyebrow }}</UiEyebrow>
        <h2 class="arb-guide__heading">{{ ui.gateHeading }}</h2>
        <p class="arb-guide__desc">
          <code>kept = overall_pass AND all(action_pass)</code> — {{ lang === 'en' ? 'both gates must pass simultaneously. Passing Gate 1 alone is not enough if a protected action regressed.' : '兩道閘必須同時通過。若受保護動作回退，單獨通過閘 1 並不夠。' }}
        </p>
      </div>

      <div class="arb-guide__gate-grid">
        <UiCard v-for="gate in gateCards" :key="gate.num" class="arb-guide__gate-card">
          <div class="arb-guide__gate-header">
            <span class="arb-guide__gate-num">Gate {{ gate.num }}</span>
            <strong>{{ t(gate.label) }}</strong>
          </div>
          <code class="arb-guide__gate-formula">{{ gate.formula }}</code>
          <div class="arb-guide__gate-example">
            <span class="arb-guide__gate-example-title">{{ t(gate.example.title) }}</span>
            <pre class="arb-guide__gate-pre">{{ gate.example.lines.join('\n') }}</pre>
          </div>
          <span class="arb-guide__badge arb-guide__badge--rejected">{{ t(gate.rejectLabel) }}</span>

          <!-- Gate 2 note with tooltips -->
          <template v-if="gate.num === '2' && gate.note">
            <p class="arb-guide__gate-note">
              {{ lang === 'en'
                ? 'Gate 2 applies only when the baseline has ≥ 10 samples for that action. '
                : 'Gate 2 僅在該動作基準樣本數 ≥ 10 時生效。' }}<GuideTooltip text="A high-impact action routed to a human operator. Protected by the stricter 2% regression tolerance.">notify_human</GuideTooltip>{{ lang === 'en' ? ' and ' : ' 與 ' }}<GuideTooltip text="An escalation action that sends an email to the team. Protected by the stricter 2% regression tolerance.">send_email</GuideTooltip>{{ lang === 'en' ? ' are protected at ±2% because an unexpected drop routes real incidents to automated-only paths, bypassing the human escalation layer.' : ' 採用 ±2% 嚴格容差，因為偵測率意外下降會使真實事件繞過人工升級層，僅由自動化流程處理。' }}
            </p>
          </template>
          <p v-else-if="gate.note" class="arb-guide__gate-note">{{ t(gate.note) }}</p>

          <!-- Tolerance table only for Gate 2 -->
          <template v-if="gate.num === '2'">
            <div class="arb-guide__section-label arb-guide__section-label--spaced">
              <GuideTooltip text="Maximum allowed drop in per-action accuracy. Protected actions (notify_human, send_email): 2%. Other actions: 5%.">{{ ui.toleranceLabel }}</GuideTooltip>
              {{ ui.toleranceByAction }}
            </div>
            <div class="arb-guide__tolerance-wrap">
              <table class="arb-guide__tolerance-table">
                <thead>
                  <tr>
                    <th>{{ ui.toleranceColAction }}</th>
                    <th>{{ ui.toleranceColTolerance }}</th>
                    <th>{{ ui.toleranceColApplies }}</th>
                    <th>{{ ui.toleranceColProtected }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in toleranceRows" :key="row.action" :class="{ 'arb-guide__tolerance-row--protected': row.protected }">
                    <td>
                      <template v-if="row.action === 'notify_human'">
                        <GuideTooltip text="A high-impact action routed to a human operator. Protected by the stricter 2% regression tolerance."><code>{{ row.action }}</code></GuideTooltip>
                      </template>
                      <template v-else-if="row.action === 'send_email'">
                        <GuideTooltip text="An escalation action that sends an email to the team. Protected by the stricter 2% regression tolerance."><code>{{ row.action }}</code></GuideTooltip>
                      </template>
                      <template v-else>
                        <code>{{ row.action }}</code>
                      </template>
                      <span class="arb-guide__tolerance-display">{{ t(row.display) }}</span>
                    </td>
                    <td class="num arb-guide__tolerance-val">{{ row.tolerance }}</td>
                    <td>{{ t(row.appliesWhen) }}</td>
                    <td>
                      <span v-if="row.protected" class="arb-guide__badge arb-guide__badge--protected">{{ lang === 'en' ? 'Strict' : '嚴格' }}</span>
                      <span v-else class="arb-guide__badge arb-guide__badge--neutral">{{ lang === 'en' ? 'Standard' : '標準' }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </UiCard>
      </div>
    </section>

    <!-- ── Round states section ───────────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>{{ ui.roundEyebrow }}</UiEyebrow>
        <h2 class="arb-guide__heading">{{ ui.roundHeading }}</h2>
      </div>

      <div class="arb-guide__state-grid">
        <article v-for="state in roundStates" :key="state.label.en" class="arb-guide__state-card">
          <span class="arb-guide__badge" :class="state.badgeClass">{{ t(state.label) }}</span>
          <p>{{ t(state.body) }}</p>
          <div v-if="state.skipReasons" class="arb-guide__skip-reasons">
            <span class="arb-guide__section-label">{{ ui.skipReasonsLabel }}</span>
            <code v-for="reason in state.skipReasons" :key="reason" class="arb-guide__skip-reason-code">{{ reason }}</code>
          </div>
        </article>
      </div>
    </section>

    <!-- ── Runtime flow (timeline) ───────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>{{ ui.runtimeEyebrow }}</UiEyebrow>
        <h2 class="arb-guide__heading">{{ ui.runtimeHeading }}</h2>
      </div>

      <div class="arb-guide__timeline">
        <article v-for="step in flowSteps" :key="step.eyebrow" class="arb-guide__step">
          <div class="arb-guide__step-index">{{ step.eyebrow }}</div>
          <div class="arb-guide__step-body">
            <h3>{{ t(step.title) }}</h3>
            <template v-if="step.eyebrow === 'Phase 3'">
              <p>
                {{ lang === 'en' ? 'The optimizer LLM reads per-action ' : '最佳化器 LLM 讀取各動作的' }}<GuideTooltip text="Per-action prediction counts for a round. Used by the optimizer LLM to identify which action types are being confused and why.">{{ lang === 'en' ? 'confusion clusters' : '混淆叢集' }}</GuideTooltip>{{ lang === 'en' ? ' to identify systematic failure patterns, then writes analysis_text, generates an inactive prompt version, and evaluates it on the same snapshot. The validation accuracy delta measures improvement over the previous best — not over all 12,000 pool cases.' : '以找出系統性失敗模式，撰寫 analysis_text，生成非啟用的候選提示版本，並以相同快照進行評估。驗證準確率 delta 衡量相對於先前最佳值的改善幅度，而非對全部 12,000 筆池案例的改善。' }}
              </p>
            </template>
            <p v-else>{{ t(step.body) }}</p>
            <code>{{ step.meta }}</code>
          </div>
        </article>
      </div>
    </section>

    <!-- ── Checkpoints ────────────────────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>{{ ui.checkpointEyebrow }}</UiEyebrow>
        <h2 class="arb-guide__heading">{{ ui.checkpointHeading }}</h2>
      </div>

      <div class="arb-guide__checkpoint-grid">
        <article v-for="checkpoint in checkpoints" :key="checkpoint.title.en" class="arb-guide__checkpoint">
          <span class="arb-guide__marker">{{ checkpoint.label }}</span>
          <h3>{{ t(checkpoint.title) }}</h3>
          <p>{{ t(checkpoint.body) }}</p>
        </article>
      </div>
    </section>

    <!-- ── Accuracy terms reference ──────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>{{ ui.accuracyEyebrow }}</UiEyebrow>
        <h2 class="arb-guide__heading">{{ ui.accuracyHeading }}</h2>
      </div>

      <div class="arb-guide__accuracy-grid">
        <UiCard class="arb-guide__accuracy-card">
          <strong><GuideTooltip text="Accuracy of the active prompt on the run's fixed validation snapshot before any candidate prompt was generated.">{{ ui.accuracyBaselineLabel }}</GuideTooltip></strong>
          <p>{{ ui.accuracyBaselineBody }}</p>
          <code>baseline_accuracy = eval(active_prompt, val_snapshot)</code>
        </UiCard>
        <UiCard class="arb-guide__accuracy-card">
          <strong><GuideTooltip text="Best validation accuracy reached by baseline or kept/evaluated rounds. This is not the final test accuracy.">{{ ui.accuracyBestLabel }}</GuideTooltip></strong>
          <p>{{ ui.accuracyBestBody }}</p>
          <code>best_accuracy = max(baseline, max(kept_rounds))</code>
        </UiCard>
        <UiCard class="arb-guide__accuracy-card">
          <strong><GuideTooltip text="Accuracy of the final active prompt on a separate test snapshot after the optimizer loop finished.">{{ ui.accuracyTestLabel }}</GuideTooltip></strong>
          <p>{{ lang === 'en' ? 'An unbiased final check. Measured once after the loop ends on the ' : '無偏見的最終檢驗。在迴圈結束後以' }}<GuideTooltip text="A fixed set of 400 cases (80/action) never shown to the optimizer during training. Evaluated once after the loop finishes — results are not used to select rounds.">{{ lang === 'en' ? 'held-out test snapshot' : '保留測試快照' }}</GuideTooltip>{{ lang === 'en' ? ' (400 cases). Never used to decide which round to keep — only reported as the final signal.' : '（400 筆）。不用於決定保留哪輪——僅作為最終信號回報。' }}</p>
          <code>test_accuracy = eval(final_prompt, test_snapshot)</code>
        </UiCard>
        <UiCard class="arb-guide__accuracy-card">
          <strong><GuideTooltip text="Movement in validation accuracy compared to the previous best. This is not final test accuracy.">{{ ui.accuracyDeltaLabel }}</GuideTooltip></strong>
          <p>{{ ui.accuracyDeltaBody }}</p>
          <code>accuracy_delta = round_accuracy − previous_best_accuracy</code>
        </UiCard>
      </div>
    </section>

    <!-- ── Persistence ────────────────────────────────────────── -->
    <section class="arb-guide__section arb-guide__split">
      <div class="arb-guide__info-block">
        <UiEyebrow>{{ ui.persistenceEyebrow }}</UiEyebrow>
        <h2 class="arb-guide__heading">{{ ui.persistenceHeading }}</h2>
        <p class="arb-guide__desc">{{ ui.persistenceDesc }}</p>
      </div>
      <div class="arb-guide__artifact-list">
        <div v-for="artifact in dbArtifacts" :key="artifact.en" class="arb-guide__artifact">
          {{ t(artifact) }}
        </div>
      </div>
    </section>

    <!-- ── Operator controls ──────────────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>{{ ui.operatorEyebrow }}</UiEyebrow>
        <h2 class="arb-guide__heading">{{ ui.operatorHeading }}</h2>
      </div>

      <div class="arb-guide__surface-grid">
        <NuxtLink to="/optimizer" class="arb-guide__surface">
          <span class="arb-guide__surface-title">{{ ui.operatorOptimizerTitle }}</span>
          <span class="arb-guide__surface-copy">{{ ui.operatorOptimizerCopy }}</span>
        </NuxtLink>
        <NuxtLink to="/evaluate/history" class="arb-guide__surface">
          <span class="arb-guide__surface-title">{{ ui.operatorEvalTitle }}</span>
          <span class="arb-guide__surface-copy">{{ ui.operatorEvalCopy }}</span>
        </NuxtLink>
        <NuxtLink to="/settings?tab=prompts" class="arb-guide__surface">
          <span class="arb-guide__surface-title">{{ ui.operatorPromptTitle }}</span>
          <span class="arb-guide__surface-copy">{{ ui.operatorPromptCopy }}</span>
        </NuxtLink>
      </div>
    </section>

    <!-- ── API map ────────────────────────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>{{ ui.apiEyebrow }}</UiEyebrow>
        <h2 class="arb-guide__heading">{{ ui.apiHeading }}</h2>
      </div>

      <div class="arb-guide__endpoint-grid">
        <UiCard v-for="group in endpointGroups" :key="group.label.en" class="arb-guide__endpoint-card">
          <h3>{{ t(group.label) }}</h3>
          <ul>
            <li v-for="endpoint in group.endpoints" :key="endpoint">
              <code>{{ endpoint }}</code>
            </li>
          </ul>
        </UiCard>
      </div>
    </section>

  </main>
</template>

<style scoped>
.arb-guide {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 28px;
  width: min(1120px, 100%);
  padding: var(--page-pad);
}

/* ── Language tabs ──────────────────────────────────────────── */
.arb-guide__lang-tabs {
  display: inline-flex;
  gap: 2px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  padding: 3px;
  background: var(--bg-1);
  align-self: flex-start;
}

.arb-guide__lang-tab {
  display: inline-flex;
  height: 30px;
  align-items: center;
  border: 0;
  border-radius: var(--r-sm);
  padding: 0 14px;
  background: transparent;
  color: var(--fg-3);
  cursor: pointer;
  font-size: 13px;
}

.arb-guide__lang-tab--active {
  background: var(--bg-3);
  color: var(--fg-0);
}

/* ── Hero ──────────────────────────────────────────────────── */
.arb-guide__hero {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
  gap: 24px;
  align-items: stretch;
}

.arb-guide__hero-copy {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.arb-guide__title {
  max-width: 760px;
  margin: 0;
  color: var(--fg-0);
  font-size: 30px;
  font-weight: 650;
  line-height: 1.14;
}

.arb-guide__lead,
.arb-guide__desc {
  margin: 0;
  color: var(--fg-3);
  font-size: 14px;
  line-height: 1.7;
}

.arb-guide__hero-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  padding: 14px;
  background: var(--bg-1);
}

.arb-guide__mini-map {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 18px;
  position: relative;
}

.arb-guide__mini-map::before {
  position: absolute;
  top: 50%;
  right: 18px;
  left: 18px;
  height: 1px;
  background: var(--border-subtle);
  content: '';
}

.arb-guide__mini-map span {
  position: relative;
  z-index: 1;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: 6px;
  color: var(--fg-3);
  background: var(--bg-inset);
  font-family: var(--font-mono);
  font-size: 11px;
  text-align: center;
}

.arb-guide__mini-map span:nth-child(3),
.arb-guide__mini-map span:nth-child(4) {
  border-color: rgba(96, 165, 250, 0.42);
  color: var(--fg-1);
  background: rgba(96, 165, 250, 0.08);
}

.arb-guide__mini-map span:nth-child(5) {
  border-color: rgba(168, 85, 247, 0.42);
  color: var(--fg-1);
  background: rgba(168, 85, 247, 0.08);
}

.arb-guide__hero-callout {
  border: 1px solid rgba(245, 158, 11, 0.32);
  border-radius: var(--r-sm);
  padding: 10px;
  background: rgba(245, 158, 11, 0.08);
}

.arb-guide__hero-callout strong {
  display: block;
  margin-top: 6px;
  color: var(--fg-1);
  font-size: 13px;
  line-height: 1.45;
}

/* ── Stats ──────────────────────────────────────────────────── */
.arb-guide__stats,
.arb-guide__endpoint-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.arb-guide__stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.arb-guide__stat-label,
.arb-guide__step-index {
  color: var(--fg-4);
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
}

.arb-guide__stat-value {
  color: var(--fg-0);
  font-size: 26px;
  line-height: 1;
}

.arb-guide__stat-note {
  color: var(--fg-3);
  font-size: 12px;
  line-height: 1.5;
}

/* ── Section layout ─────────────────────────────────────────── */
.arb-guide__section,
.arb-guide__section-head,
.arb-guide__info-block {
  display: flex;
  flex-direction: column;
}

.arb-guide__section {
  gap: 14px;
}

.arb-guide__section-head,
.arb-guide__info-block {
  gap: 8px;
}

.arb-guide__section-label {
  color: var(--fg-4);
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.arb-guide__section-label--spaced {
  margin-top: 12px;
}

.arb-guide__heading {
  margin: 0;
  color: var(--fg-0);
  font-size: 18px;
  font-weight: 620;
}

/* ── Visual flow lanes ──────────────────────────────────────── */
.arb-guide__visual-flow {
  display: grid;
  gap: 12px;
}

.arb-guide__lane {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}

.arb-guide__lane-label {
  display: flex;
  align-items: center;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  padding: 12px;
  background: var(--bg-2);
  color: var(--fg-2);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.4;
}

.arb-guide__lane-track {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  position: relative;
}

.arb-guide__lane-track::before {
  position: absolute;
  top: 50%;
  right: 6px;
  left: 6px;
  height: 1px;
  background: var(--border-subtle);
  content: '';
}

.arb-guide__node {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  padding: 12px;
  background: var(--bg-1);
}

.arb-guide__node--important {
  border-color: rgba(245, 158, 11, 0.45);
  background: rgba(245, 158, 11, 0.06);
}

.arb-guide__node-head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
}

.arb-guide__node-head > span:first-child {
  color: var(--fg-1);
  font-size: 13px;
  font-weight: 650;
}

.arb-guide__node-tag,
.arb-guide__marker {
  border: 1px solid rgba(245, 158, 11, 0.38);
  border-radius: var(--r-pill);
  padding: 2px 7px;
  color: var(--warning, var(--action-fallback));
  background: rgba(245, 158, 11, 0.08);
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  white-space: nowrap;
}

.arb-guide__node p {
  margin: 0;
  color: var(--fg-3);
  font-size: 12px;
  line-height: 1.55;
}

/* ── Gate section ───────────────────────────────────────────── */
.arb-guide__gate-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.arb-guide__gate-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.arb-guide__gate-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.arb-guide__gate-num {
  border-radius: var(--r-pill);
  padding: 2px 9px;
  background: var(--bg-3);
  color: var(--fg-2);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
}

.arb-guide__gate-header strong {
  color: var(--fg-1);
  font-size: 14px;
}

.arb-guide__gate-formula {
  display: block;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  background: var(--bg-inset);
  color: var(--fg-2);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.arb-guide__gate-example {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.arb-guide__gate-example-title {
  color: var(--fg-4);
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
}

.arb-guide__gate-pre {
  margin: 0;
  padding: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  background: var(--bg-inset);
  color: var(--fg-3);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.arb-guide__gate-note {
  margin: 0;
  color: var(--fg-4);
  font-size: 12px;
  font-style: italic;
  line-height: 1.5;
}

/* Tolerance table */
.arb-guide__tolerance-wrap {
  overflow-x: auto;
}

.arb-guide__tolerance-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.arb-guide__tolerance-table th {
  padding: 6px 8px;
  background: var(--bg-2);
  color: var(--fg-4);
  font-weight: 500;
  font-size: 11px;
  text-align: left;
  white-space: nowrap;
}

.arb-guide__tolerance-table td {
  padding: 7px 8px;
  border-top: 1px solid var(--border-subtle);
  color: var(--fg-3);
  vertical-align: middle;
}

.arb-guide__tolerance-row--protected td {
  background: rgba(239, 68, 68, 0.04);
}

.arb-guide__tolerance-display {
  display: block;
  color: var(--fg-4);
  font-size: 10px;
  margin-top: 2px;
}

.arb-guide__tolerance-val {
  color: var(--fg-1);
  font-weight: 600;
}

.arb-guide__tolerance-table code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-2);
}

/* ── Badges ─────────────────────────────────────────────────── */
.arb-guide__badge {
  border-radius: var(--r-pill);
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  display: inline-block;
  width: fit-content;
}

.arb-guide__badge--kept {
  background: var(--action-rebuild-soft);
  color: var(--action-rebuild);
}

.arb-guide__badge--rejected {
  background: var(--action-notify-soft);
  color: var(--action-notify);
}

.arb-guide__badge--skipped {
  background: rgba(251, 191, 36, 0.12);
  color: var(--action-fallback);
}

.arb-guide__badge--protected {
  background: rgba(239, 68, 68, 0.12);
  color: var(--action-notify);
}

.arb-guide__badge--neutral {
  background: var(--bg-2);
  color: var(--fg-4);
}

/* ── Round state grid ───────────────────────────────────────── */
.arb-guide__state-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.arb-guide__state-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  padding: 14px;
  background: var(--bg-1);
}

.arb-guide__state-card p {
  margin: 0;
  color: var(--fg-3);
  font-size: 12px;
  line-height: 1.55;
}

.arb-guide__skip-reasons {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 4px;
}

.arb-guide__skip-reason-code {
  display: block;
  padding: 3px 6px;
  border-radius: var(--r-sm);
  background: var(--bg-inset);
  color: var(--fg-3);
  font-family: var(--font-mono);
  font-size: 10px;
  word-break: break-all;
}

/* ── Accuracy grid ──────────────────────────────────────────── */
.arb-guide__accuracy-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.arb-guide__accuracy-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.arb-guide__accuracy-card strong {
  color: var(--fg-1);
  font-size: 14px;
}

.arb-guide__accuracy-card p {
  margin: 0;
  color: var(--fg-3);
  font-size: 13px;
  line-height: 1.6;
}

.arb-guide__accuracy-card code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-3);
  padding: 6px 8px;
  background: var(--bg-inset);
  border-radius: var(--r-sm);
  display: block;
  word-break: break-all;
}

/* ── Timeline ───────────────────────────────────────────────── */
.arb-guide__timeline {
  display: grid;
  gap: 10px;
}

.arb-guide__step {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  padding: 14px;
  background: var(--bg-1);
}

.arb-guide__step-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.arb-guide__step h3,
.arb-guide__endpoint-card h3 {
  margin: 0;
  color: var(--fg-1);
  font-size: 14px;
  font-weight: 620;
}

.arb-guide__step p {
  margin: 0;
  color: var(--fg-3);
  font-size: 13px;
  line-height: 1.6;
}

/* ── Checkpoints ────────────────────────────────────────────── */
.arb-guide__checkpoint-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.arb-guide__checkpoint {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid rgba(245, 158, 11, 0.32);
  border-radius: var(--r-md);
  padding: 14px;
  background: rgba(245, 158, 11, 0.06);
}

.arb-guide__checkpoint h3 {
  margin: 0;
  color: var(--fg-1);
  font-size: 14px;
  font-weight: 650;
}

.arb-guide__checkpoint p {
  margin: 0;
  color: var(--fg-3);
  font-size: 12px;
  line-height: 1.55;
}

/* ── Split layout ───────────────────────────────────────────── */
.arb-guide__split {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 16px;
  align-items: start;
}

.arb-guide__artifact-list {
  display: grid;
  gap: 8px;
}

.arb-guide__artifact {
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: 10px 12px;
  color: var(--fg-2);
  background: var(--bg-1);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
}

/* ── Surfaces ───────────────────────────────────────────────── */
.arb-guide__surface-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.arb-guide__surface {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  padding: 14px;
  background: var(--bg-1);
  color: inherit;
  text-decoration: none;
  transition:
    border-color var(--dur-fast),
    background var(--dur-fast);
}

.arb-guide__surface:hover {
  border-color: var(--border);
  background: var(--bg-2);
}

.arb-guide__surface-title {
  color: var(--fg-1);
  font-size: 14px;
  font-weight: 620;
}

.arb-guide__surface-copy {
  color: var(--fg-3);
  font-size: 12px;
  line-height: 1.55;
}

/* ── Endpoint cards ─────────────────────────────────────────── */
.arb-guide__endpoint-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.arb-guide__endpoint-card ul {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.arb-guide__endpoint-card li {
  min-width: 0;
}

/* ── Shared ─────────────────────────────────────────────────── */
.arb-guide code {
  overflow-wrap: anywhere;
  color: var(--fg-2);
  font-family: var(--font-mono);
  font-size: 11px;
}

.num {
  font-family: var(--font-mono);
}

/* ── Responsive: 920px ──────────────────────────────────────── */
@media (max-width: 920px) {
  .arb-guide__hero,
  .arb-guide__split,
  .arb-guide__surface-grid {
    grid-template-columns: 1fr;
  }

  .arb-guide__stats,
  .arb-guide__endpoint-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .arb-guide__lane {
    grid-template-columns: 1fr;
  }

  .arb-guide__lane-track {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .arb-guide__lane-track::before {
    display: none;
  }

  .arb-guide__gate-grid {
    grid-template-columns: 1fr;
  }

  .arb-guide__state-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .arb-guide__accuracy-grid {
    grid-template-columns: 1fr;
  }

  .arb-guide__checkpoint-grid {
    grid-template-columns: 1fr;
  }
}

/* ── Responsive: 640px ──────────────────────────────────────── */
@media (max-width: 640px) {
  .arb-guide {
    gap: 22px;
  }

  .arb-guide__title {
    font-size: 24px;
    line-height: 1.2;
  }

  .arb-guide__lead,
  .arb-guide__desc {
    font-size: 13px;
  }

  .arb-guide__hero-panel {
    padding: 10px;
  }

  .arb-guide__mini-map,
  .arb-guide__lane-track {
    grid-template-columns: 1fr;
  }

  .arb-guide__mini-map::before,
  .arb-guide__lane-track::before {
    display: none;
  }

  .arb-guide__mini-map span {
    min-height: 34px;
  }

  .arb-guide__stats,
  .arb-guide__endpoint-grid {
    grid-template-columns: 1fr;
  }

  .arb-guide__step {
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 12px;
  }

  .arb-guide__stat-value {
    font-size: 23px;
  }

  .arb-guide__state-grid {
    grid-template-columns: 1fr;
  }
}
</style>
