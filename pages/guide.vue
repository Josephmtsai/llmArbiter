<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

interface FlowStep {
  eyebrow: string
  title: string
  body: string
  meta: string
}

interface StatItem {
  label: string
  value: string
  note: string
}

interface EndpointGroup {
  label: string
  endpoints: string[]
}

interface FlowNode {
  label: string
  body: string
  tag: string
  important?: boolean
}

interface VisualLane {
  label: string
  nodes: FlowNode[]
}

interface Checkpoint {
  label: string
  title: string
  body: string
}

interface GateCard {
  num: string
  label: string
  formula: string
  rejectLabel: string
  example: { title: string; lines: string[] }
  note?: string
}

interface ToleranceRow {
  action: string
  display: string
  tolerance: string
  appliesWhen: string
  protected: boolean
}

interface RoundState {
  badgeClass: string
  label: string
  body: string
  skipReasons?: string[]
}

// ── Pool stats (June 2026 expansion) ────────────────────────
const poolStats: StatItem[] = [
  {
    label: 'Eval pool',
    value: '12,000',
    note: '2,400 cases per action across five CI/hardware action types.',
  },
  {
    label: 'Train split',
    value: '10,400',
    note: 'Used for relabeling and curation — not used for optimizer scoring.',
  },
  {
    label: 'Validation split',
    value: '800',
    note: 'Optimizer snapshots 200 of these per run (40/action) — fixed for the whole run.',
  },
  {
    label: 'Test split',
    value: '800',
    note: 'Final test snapshot is 400 cases (80/action), evaluated once after the optimizer loop.',
  },
]

// ── Visual flow lanes ────────────────────────────────────────
const visualLanes: VisualLane[] = [
  {
    label: 'Pool preparation',
    nodes: [
      {
        label: 'Raw logs',
        body: 'LogChunks, Travis CI, BGL, and HPC hardware logs enter the pool builder.',
        tag: 'inputs',
      },
      {
        label: 'Review queue',
        body: 'Low-confidence relabels wait for confirm, correct, or reject before joining the trusted pool.',
        tag: 'human check',
        important: true,
      },
      {
        label: 'Split pool',
        body: 'Train (10,400), validation (800), and test (800) splits stay separated so optimizer scoring remains honest.',
        tag: '12,000 cases',
      },
    ],
  },
  {
    label: 'Optimizer loop',
    nodes: [
      {
        label: 'Val snapshot',
        body: 'Each run snapshots 200 fixed validation cases (40/action) before scoring baseline and candidates. Same 200 cases every round.',
        tag: 'fixed · 200 cases',
        important: true,
      },
      {
        label: 'Baseline eval',
        body: 'The active prompt is measured first on the snapshot, producing baseline accuracy and failure clusters.',
        tag: 'source=optimizer',
      },
      {
        label: 'Candidate round',
        body: 'The optimizer model analyzes failures, creates an inactive prompt version, and evaluates it on the same snapshot.',
        tag: 'round N',
      },
      {
        label: 'Two-gate decision',
        body: 'Kept only if (1) overall validation accuracy improves AND (2) no protected action (notify_human, send_email) regresses beyond tolerance.',
        tag: 'both gates',
        important: true,
      },
    ],
  },
  {
    label: 'Release gate',
    nodes: [
      {
        label: 'Held-out test',
        body: 'After target accuracy or max rounds, the best prompt is scored on the reserved test snapshot (400 cases, 80/action).',
        tag: 'test_accuracy',
        important: true,
      },
      {
        label: 'History view',
        body: 'Runs, rounds, confusion matrices, and failure samples are persisted in PostgreSQL.',
        tag: 'auditable',
      },
      {
        label: 'Manual activation',
        body: 'Generated prompts remain inactive until an operator activates the chosen version.',
        tag: 'operator gate',
        important: true,
      },
    ],
  },
]

// ── Checkpoints ──────────────────────────────────────────────
const checkpoints: Checkpoint[] = [
  {
    label: 'Important',
    title: 'Validation snapshot is fixed per run',
    body: 'Every baseline and candidate round is scored against the same 200 validation cases, so accuracy movement across rounds is directly comparable.',
  },
  {
    label: 'Important',
    title: 'Per-action regression gate protects critical actions',
    body: 'Even if overall validation accuracy improves, a candidate is rejected when notify_human or send_email regresses beyond 2%. trigger_* actions allow up to 5%.',
  },
  {
    label: 'Important',
    title: 'Candidates are not auto-activated',
    body: 'The optimizer generates prompt versions, but the active production prompt changes only through the operator-controlled prompt activation gate.',
  },
  {
    label: 'Important',
    title: 'Validation accuracy ≠ Test accuracy',
    body: 'Round accuracy and accuracy_delta measure performance on the validation snapshot. test_accuracy is reported once after the loop ends on a separate held-out set.',
  },
]

// ── Keep/Reject Gate data ────────────────────────────────────
const gateCards: GateCard[] = [
  {
    num: '1',
    label: 'Overall accuracy gate',
    formula: 'overall_pass = round_accuracy > previous_best_accuracy',
    rejectLabel: 'Rejected: no overall improvement',
    example: {
      title: 'Example — fails Gate 1',
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
    label: 'Per-action regression gate',
    formula: 'action_pass = action_delta ≥ −tolerance  (for each action with baseline ≥ 10 samples)',
    rejectLabel: 'Rejected: action regression',
    example: {
      title: 'Example — fails Gate 2 despite overall gain',
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
    note: 'Gate 2 applies only when the baseline has ≥ 10 samples for that action.',
  },
]

const toleranceRows: ToleranceRow[] = [
  { action: 'notify_human', display: 'Notify Human', tolerance: '±2%', appliesWhen: 'baseline ≥ 10 samples', protected: true },
  { action: 'send_email', display: 'Escalate', tolerance: '±2%', appliesWhen: 'baseline ≥ 10 samples', protected: true },
  { action: 'trigger_rebuild', display: 'Rebuild', tolerance: '±5%', appliesWhen: 'baseline ≥ 10 samples', protected: false },
  { action: 'trigger_fallback', display: 'Fallback', tolerance: '±5%', appliesWhen: 'baseline ≥ 10 samples', protected: false },
  { action: 'trigger_restart', display: 'Restart', tolerance: '±5%', appliesWhen: 'baseline ≥ 10 samples', protected: false },
]

// ── Round states ─────────────────────────────────────────────
const roundStates: RoundState[] = [
  {
    badgeClass: 'g-badge--kept',
    label: 'Kept',
    body: 'Candidate passed both gates — overall validation accuracy improved and no protected action regressed beyond tolerance. The candidate became the new best prompt for subsequent rounds.',
  },
  {
    badgeClass: 'g-badge--rejected',
    label: 'Rejected: no overall improvement',
    body: 'Overall validation accuracy did not improve compared to the previous best. The previous best prompt is kept. This is the most common rejection reason.',
  },
  {
    badgeClass: 'g-badge--rejected',
    label: 'Rejected: action regression',
    body: 'Overall accuracy improved, but at least one protected action (notify_human or send_email) regressed beyond its tolerance. Even a net improvement is rejected when a critical action degrades.',
  },
  {
    badgeClass: 'g-badge--skipped',
    label: 'Skipped',
    body: 'The optimizer model did not return a usable candidate prompt. A skipped round is NOT evidence the prompt got worse — it means no candidate was tested. The backend retries once before recording a skip.',
    skipReasons: [
      'optimizer-candidate-invalid-json',
      'optimizer-candidate-missing-actions',
      'optimizer-candidate-missing-json-contract',
      'optimizer-candidate-missing-fields',
      'optimizer-candidate-unsupported-actions',
    ],
  },
]

// ── Flow steps ────────────────────────────────────────────────
const flowSteps: FlowStep[] = [
  {
    eyebrow: 'Phase 0',
    title: 'Build and curate the eval pool',
    body: 'LogChunks, Travis CI, BGL, and HPC logs are converted into labeled eval cases. Low-confidence relabels go to the review queue before they join the trusted pool. Near-duplicate entries are grouped by split_group to prevent leakage across train/val/test.',
    meta: 'generate_eval_pool_from_logs.py + relabel_eval_pool.py',
  },
  {
    eyebrow: 'Phase 1',
    title: 'Start an optimizer run',
    body: 'The backend creates an optimizer_runs row, records the optimizer/evaluator models, and samples a fixed validation snapshot (200 cases, 40 per action) — so every round is scored against the same cases.',
    meta: 'POST /optimizer/run',
  },
  {
    eyebrow: 'Phase 2',
    title: 'Measure the baseline',
    body: 'The active prompt is evaluated on the validation snapshot (source=optimizer). The run stores baseline_accuracy — the accuracy of the active prompt before any candidate was generated.',
    meta: 'POST /evaluate + GET /evaluate/history/{id}',
  },
  {
    eyebrow: 'Phase 3',
    title: 'Analyze failures and generate a candidate',
    body: 'The optimizer LLM reads failed cases and confusion clusters, writes analysis_text, generates an inactive prompt version, and evaluates that candidate on the same validation snapshot. The validation accuracy delta measures improvement over the previous best — not over all 12,000 pool cases.',
    meta: 'OpenRouter optimizer model',
  },
  {
    eyebrow: 'Phase 4',
    title: 'Two-gate keep/reject decision',
    body: 'A candidate is kept only when it passes both the overall accuracy gate (round > previous best) and the per-action regression gate (notify_human and send_email must not drop more than 2%; other actions allow 5%). Round accuracy, kept flag, reject_reason, confusion matrix, and failure samples are stored in PostgreSQL.',
    meta: 'optimizer_rounds + optimizer_round_failures',
  },
  {
    eyebrow: 'Phase 5',
    title: 'Run the final test evaluation',
    body: 'After reaching the target accuracy or max rounds, the best prompt is evaluated against the held-out test snapshot (400 cases, 80 per action) and the run records test_accuracy. This is a one-time check — test data is never used to decide which round to keep.',
    meta: 'snapshot_test_set()',
  },
]

// ── DB artifacts ──────────────────────────────────────────────
const dbArtifacts = [
  'optimizer_runs: status, model names, baseline_accuracy, test_accuracy, val/test snapshot ids',
  'optimizer_rounds: accuracy, kept, reject_reason, skip_reason, prompt_version_id, analysis_text, confusion_matrix',
  'optimizer_round_failures: bounded samples with expected/predicted actions and log snippets',
  'eval_runs: source=db, source=pool, or source=optimizer for history and jobs',
]

// ── Endpoint groups ───────────────────────────────────────────
const endpointGroups: EndpointGroup[] = [
  {
    label: 'Optimizer',
    endpoints: ['POST /optimizer/run', 'GET /optimizer/history', 'GET /optimizer/history/{run_id}', 'DELETE /optimizer/runs/{id}'],
  },
  {
    label: 'Evaluation',
    endpoints: ['POST /evaluate', 'GET /evaluate/jobs', 'GET /evaluate/history', 'GET /evaluate/history/{id}'],
  },
  {
    label: 'Pool review',
    endpoints: ['GET /eval-pool/stats', 'GET /review-queue', 'PATCH /review-queue/{id}'],
  },
  {
    label: 'Prompt gate',
    endpoints: ['GET /config/prompts', 'PATCH /config/prompts/{id}/activate'],
  },
]
</script>

<template>
  <AppTopBar title="How it works" subtitle="Auto Prompt Optimizer architecture" />

  <main class="arb-guide">

    <!-- ── Hero ──────────────────────────────────────────────── -->
    <section class="arb-guide__hero">
      <div class="arb-guide__hero-copy">
        <UiEyebrow>Auto Prompt Optimizer v2</UiEyebrow>
        <h1 class="arb-guide__title">A closed-loop prompt improvement system with held-out validation and per-action protection.</h1>
        <p class="arb-guide__lead">
          The optimizer does not blindly activate a generated prompt. It builds a curated eval pool,
          snapshots a stable validation set, measures
          <GuideTooltip text="Accuracy of the active prompt on the run's fixed validation snapshot before any candidate prompt was generated.">baseline accuracy</GuideTooltip>,
          improves candidates round by round through a two-gate decision, and only exposes prompt versions for deliberate activation.
        </p>
      </div>
      <div class="arb-guide__hero-panel" aria-label="Optimizer loop summary">
        <div class="arb-guide__mini-map">
          <span>Logs</span>
          <span>Pool</span>
          <span>Baseline</span>
          <span>Candidate</span>
          <span>Gate 1+2</span>
          <span>Test</span>
        </div>
        <div class="arb-guide__hero-callout">
          <span class="arb-guide__marker">Key idea</span>
          <strong>Improve on validation, protect critical actions, prove on test, activate by human choice.</strong>
        </div>
      </div>
    </section>

    <!-- ── Pool stats ─────────────────────────────────────────── -->
    <section class="arb-guide__stats" aria-label="Eval pool splits">
      <UiCard v-for="item in poolStats" :key="item.label" class="arb-guide__stat-card">
        <span class="arb-guide__stat-label">{{ item.label }}</span>
        <strong class="arb-guide__stat-value num">{{ item.value }}</strong>
        <span class="arb-guide__stat-note">{{ item.note }}</span>
      </UiCard>
    </section>

    <!-- ── Data split diagram ─────────────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>Data splits</UiEyebrow>
        <h2 class="arb-guide__heading">Pool splits vs optimizer snapshot sizes</h2>
        <p class="arb-guide__desc">
          The full pool has 12,000 cases, but the optimizer never evaluates all of them per round.
          A <GuideTooltip text="A fixed set of 200 validation cases (40 per action) sampled once at run start. Every round in the same run uses the same 200 cases — so accuracy numbers across rounds are directly comparable.">validation snapshot</GuideTooltip>
          of 200 cases is sampled once when a run starts and used for every candidate round. The held-out test snapshot (400 cases) is only evaluated once after the loop ends.
        </p>
      </div>
      <GuideSplitDiagram />
    </section>

    <!-- ── Flow diagram (lanes) ───────────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>Flow diagram</UiEyebrow>
        <h2 class="arb-guide__heading">The full optimizer flow in one picture</h2>
      </div>

      <div class="arb-guide__visual-flow" aria-label="Auto Prompt Optimizer flow diagram">
        <section v-for="lane in visualLanes" :key="lane.label" class="arb-guide__lane">
          <div class="arb-guide__lane-label">{{ lane.label }}</div>
          <div class="arb-guide__lane-track">
            <article
              v-for="node in lane.nodes"
              :key="node.label"
              class="arb-guide__node"
              :class="{ 'arb-guide__node--important': node.important }"
            >
              <div class="arb-guide__node-head">
                <span>{{ node.label }}</span>
                <span class="arb-guide__node-tag">{{ node.tag }}</span>
              </div>
              <span v-if="node.important" class="arb-guide__marker">Important checkpoint</span>
              <p>{{ node.body }}</p>
            </article>
          </div>
        </section>
      </div>
    </section>

    <!-- ── Loop diagram ───────────────────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>Optimizer loop</UiEyebrow>
        <h2 class="arb-guide__heading">Step-by-step: from snapshot to kept or rejected</h2>
        <p class="arb-guide__desc">
          Each optimizer run works through these steps in order. Both gates must pass for a round to be kept.
        </p>
      </div>
      <GuideLoopDiagram />
    </section>

    <!-- ── Keep/Reject Gate section ──────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>Keep / reject gate</UiEyebrow>
        <h2 class="arb-guide__heading">The two gates a candidate must pass</h2>
        <p class="arb-guide__desc">
          <code>kept = overall_pass AND all(action_pass)</code> — both gates must pass simultaneously.
          Passing Gate 1 alone is not enough if a protected action regressed.
        </p>
      </div>

      <div class="arb-guide__gate-grid">
        <UiCard v-for="gate in gateCards" :key="gate.num" class="arb-guide__gate-card">
          <div class="arb-guide__gate-header">
            <span class="arb-guide__gate-num">Gate {{ gate.num }}</span>
            <strong>{{ gate.label }}</strong>
          </div>
          <code class="arb-guide__gate-formula">{{ gate.formula }}</code>
          <div class="arb-guide__gate-example">
            <span class="arb-guide__gate-example-title">{{ gate.example.title }}</span>
            <pre class="arb-guide__gate-pre">{{ gate.example.lines.join('\n') }}</pre>
          </div>
          <span class="arb-guide__badge arb-guide__badge--rejected">{{ gate.rejectLabel }}</span>
          <p v-if="gate.note" class="arb-guide__gate-note">{{ gate.note }}</p>

          <!-- Tolerance table only for Gate 2 -->
          <template v-if="gate.num === '2'">
            <div class="arb-guide__section-label" style="margin-top: 12px;">
              <GuideTooltip text="Maximum allowed drop in per-action accuracy. Protected actions (notify_human, send_email): 2%. Other actions: 5%.">Regression tolerance</GuideTooltip>
              by action
            </div>
            <div class="arb-guide__tolerance-wrap">
              <table class="arb-guide__tolerance-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Tolerance</th>
                    <th>Applies when</th>
                    <th>Protected</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in toleranceRows" :key="row.action" :class="{ 'arb-guide__tolerance-row--protected': row.protected }">
                    <td><code>{{ row.action }}</code><span class="arb-guide__tolerance-display">{{ row.display }}</span></td>
                    <td class="num arb-guide__tolerance-val">{{ row.tolerance }}</td>
                    <td>{{ row.appliesWhen }}</td>
                    <td>
                      <span v-if="row.protected" class="arb-guide__badge arb-guide__badge--protected">Strict</span>
                      <span v-else class="arb-guide__badge arb-guide__badge--neutral">Standard</span>
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
        <UiEyebrow>Round outcomes</UiEyebrow>
        <h2 class="arb-guide__heading">All four round states explained</h2>
      </div>

      <div class="arb-guide__state-grid">
        <article v-for="state in roundStates" :key="state.label" class="arb-guide__state-card">
          <span class="arb-guide__badge" :class="state.badgeClass">{{ state.label }}</span>
          <p>{{ state.body }}</p>
          <div v-if="state.skipReasons" class="arb-guide__skip-reasons">
            <span class="arb-guide__section-label">Common skip reasons</span>
            <code v-for="reason in state.skipReasons" :key="reason" class="arb-guide__skip-reason-code">{{ reason }}</code>
          </div>
        </article>
      </div>
    </section>

    <!-- ── Runtime flow (timeline) ───────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>Runtime flow</UiEyebrow>
        <h2 class="arb-guide__heading">From raw logs to a tested prompt candidate</h2>
      </div>

      <div class="arb-guide__timeline">
        <article v-for="step in flowSteps" :key="step.eyebrow" class="arb-guide__step">
          <div class="arb-guide__step-index">{{ step.eyebrow }}</div>
          <div class="arb-guide__step-body">
            <h3>{{ step.title }}</h3>
            <p>{{ step.body }}</p>
            <code>{{ step.meta }}</code>
          </div>
        </article>
      </div>
    </section>

    <!-- ── Checkpoints ────────────────────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>Important checkpoints</UiEyebrow>
        <h2 class="arb-guide__heading">The parts that protect prompt quality</h2>
      </div>

      <div class="arb-guide__checkpoint-grid">
        <article v-for="checkpoint in checkpoints" :key="checkpoint.title" class="arb-guide__checkpoint">
          <span class="arb-guide__marker">{{ checkpoint.label }}</span>
          <h3>{{ checkpoint.title }}</h3>
          <p>{{ checkpoint.body }}</p>
        </article>
      </div>
    </section>

    <!-- ── Accuracy terms reference ──────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>Accuracy terms</UiEyebrow>
        <h2 class="arb-guide__heading">Three accuracy numbers, three different meanings</h2>
      </div>

      <div class="arb-guide__accuracy-grid">
        <UiCard class="arb-guide__accuracy-card">
          <strong><GuideTooltip text="Accuracy of the active prompt on the run's fixed validation snapshot before any candidate prompt was generated.">Baseline accuracy</GuideTooltip></strong>
          <p>The starting point. Measured once at run start on the validation snapshot (200 cases). Every round's improvement is measured relative to the current best, which starts at baseline.</p>
          <code>baseline_accuracy = eval(active_prompt, val_snapshot)</code>
        </UiCard>
        <UiCard class="arb-guide__accuracy-card">
          <strong><GuideTooltip text="Best validation accuracy reached by baseline or kept/evaluated rounds. This is not the final test accuracy.">Best accuracy</GuideTooltip></strong>
          <p>The highest validation accuracy seen so far across baseline and all kept rounds. Used as the threshold for Gate 1. Rounds are compared against this, not against baseline.</p>
          <code>best_accuracy = max(baseline, max(kept_rounds))</code>
        </UiCard>
        <UiCard class="arb-guide__accuracy-card">
          <strong><GuideTooltip text="Accuracy of the final active prompt on a separate test snapshot after the optimizer loop finished.">Test accuracy</GuideTooltip></strong>
          <p>An unbiased final check. Measured once after the loop ends on the held-out test snapshot (400 cases). Never used to decide which round to keep — only reported as the final signal.</p>
          <code>test_accuracy = eval(final_prompt, test_snapshot)</code>
        </UiCard>
        <UiCard class="arb-guide__accuracy-card">
          <strong><GuideTooltip text="Movement in validation accuracy compared to the previous best. This is not final test accuracy.">Accuracy delta</GuideTooltip></strong>
          <p>Per-round validation accuracy movement: <code>round_accuracy − previous_best_accuracy</code>. Positive means the candidate improved. This is validation accuracy, not final test accuracy.</p>
          <code>accuracy_delta = round_accuracy − previous_best_accuracy</code>
        </UiCard>
      </div>
    </section>

    <!-- ── Persistence ────────────────────────────────────────── -->
    <section class="arb-guide__section arb-guide__split">
      <div class="arb-guide__info-block">
        <UiEyebrow>Persistence</UiEyebrow>
        <h2 class="arb-guide__heading">History is database-backed</h2>
        <p class="arb-guide__desc">
          Optimizer runs, rounds, diagnostics, and failure samples are stored in PostgreSQL, so service
          restarts do not erase run history. The list endpoint stays lightweight; the detail endpoint
          loads the heavy failure samples for one run.
        </p>
      </div>
      <div class="arb-guide__artifact-list">
        <div v-for="artifact in dbArtifacts" :key="artifact" class="arb-guide__artifact">
          {{ artifact }}
        </div>
      </div>
    </section>

    <!-- ── Operator controls ──────────────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>Operator controls</UiEyebrow>
        <h2 class="arb-guide__heading">Where each part shows up in the UI</h2>
      </div>

      <div class="arb-guide__surface-grid">
        <NuxtLink to="/optimizer" class="arb-guide__surface">
          <span class="arb-guide__surface-title">Auto optimizer</span>
          <span class="arb-guide__surface-copy">Start runs, review pool health, inspect rounds with gate decisions, and cancel active runs.</span>
        </NuxtLink>
        <NuxtLink to="/evaluate/history" class="arb-guide__surface">
          <span class="arb-guide__surface-title">Eval history</span>
          <span class="arb-guide__surface-copy">See source badges for db, pool, and optimizer runs, plus live progress while running.</span>
        </NuxtLink>
        <NuxtLink to="/settings?tab=prompts" class="arb-guide__surface">
          <span class="arb-guide__surface-title">Prompt settings</span>
          <span class="arb-guide__surface-copy">Generated prompt versions remain inactive until an operator activates one here.</span>
        </NuxtLink>
      </div>
    </section>

    <!-- ── API map ────────────────────────────────────────────── -->
    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>API map</UiEyebrow>
        <h2 class="arb-guide__heading">Endpoints used by the optimizer workflow</h2>
      </div>

      <div class="arb-guide__endpoint-grid">
        <UiCard v-for="group in endpointGroups" :key="group.label" class="arb-guide__endpoint-card">
          <h3>{{ group.label }}</h3>
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
