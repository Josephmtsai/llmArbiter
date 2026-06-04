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
        body: 'Train, validation, and test splits stay separated so optimizer scoring remains honest.',
        tag: '4,000 cases',
      },
    ],
  },
  {
    label: 'Optimizer loop',
    nodes: [
      {
        label: 'Val snapshot',
        body: 'Each run snapshots a fixed validation set before scoring baseline and candidates.',
        tag: 'stable score',
        important: true,
      },
      {
        label: 'Baseline eval',
        body: 'The active prompt is measured first, producing baseline accuracy and failure clusters.',
        tag: 'source=optimizer',
      },
      {
        label: 'Candidate round',
        body: 'The optimizer model analyzes failures, creates an inactive prompt version, and evaluates it.',
        tag: 'round N',
      },
      {
        label: 'Keep or reject',
        body: 'A candidate is kept only if validation accuracy beats the current best.',
        tag: 'decision gate',
        important: true,
      },
    ],
  },
  {
    label: 'Release gate',
    nodes: [
      {
        label: 'Held-out test',
        body: 'After target accuracy or max rounds, the best prompt is scored on the reserved test split.',
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

const checkpoints: Checkpoint[] = [
  {
    label: 'Important',
    title: 'Validation snapshot is fixed per run',
    body: 'Every baseline and candidate round is scored against the same validation cases, so accuracy movement is comparable.',
  },
  {
    label: 'Important',
    title: 'Candidates are not auto-activated',
    body: 'The optimizer can generate prompt versions, but the active production prompt changes only through the prompt settings gate.',
  },
  {
    label: 'Important',
    title: 'History list is lightweight',
    body: 'The list view shows run summaries; heavy round failure samples are loaded from the detail endpoint for one selected run.',
  },
]

const poolStats: StatItem[] = [
  {
    label: 'Eval pool',
    value: '4,000',
    note: 'Generated from CI and hardware logs across five action buckets.',
  },
  {
    label: 'Train split',
    value: '2,400',
    note: 'Used for relabeling and pool curation, not for optimizer scoring.',
  },
  {
    label: 'Validation split',
    value: '800',
    note: 'Each optimizer run snapshots 200 validation cases, 40 per action.',
  },
  {
    label: 'Test split',
    value: '800',
    note: 'Reserved for the final test_accuracy after the optimizer loop ends.',
  },
]

const flowSteps: FlowStep[] = [
  {
    eyebrow: 'Phase 0',
    title: 'Build and curate the eval pool',
    body:
      'LogChunks, Travis CI, BGL, and HPC logs are converted into labeled eval cases. Low-confidence relabels go to the review queue before they join the trusted pool.',
    meta: 'generate_eval_pool_from_logs.py + relabel_eval_pool.py',
  },
  {
    eyebrow: 'Phase 1',
    title: 'Start an optimizer run',
    body:
      'The backend creates an optimizer_runs row, records the optimizer/evaluator models, and snapshots a fixed validation set so every round is scored apples-to-apples.',
    meta: 'POST /optimizer/run',
  },
  {
    eyebrow: 'Phase 2',
    title: 'Measure the baseline',
    body:
      'The active prompt is evaluated with source=optimizer. The run stores baseline_accuracy, current_eval_run_id while polling, and the first confusion matrix.',
    meta: 'POST /evaluate + GET /evaluate/history/{id}',
  },
  {
    eyebrow: 'Phase 3',
    title: 'Analyze failures and generate a candidate',
    body:
      'The optimizer LLM reads failed cases and confusion clusters, writes analysis_text, generates an inactive prompt version, and evaluates that candidate on the same snapshot.',
    meta: 'OpenRouter optimizer model',
  },
  {
    eyebrow: 'Phase 4',
    title: 'Keep or reject each round',
    body:
      'A candidate is kept only when its validation accuracy improves on the current best. Round accuracy, kept flag, prompt version, confusion matrix, and bounded failure samples are stored in PostgreSQL.',
    meta: 'optimizer_rounds + optimizer_round_failures',
  },
  {
    eyebrow: 'Phase 5',
    title: 'Run the final test set',
    body:
      'After reaching the target accuracy or max rounds, the best prompt is evaluated against the held-out test split and the run records test_accuracy.',
    meta: 'snapshot_test_set()',
  },
]

const dbArtifacts = [
  'optimizer_runs: status, model names, baseline_accuracy, test_accuracy, snapshot ids',
  'optimizer_rounds: accuracy, kept, prompt_version_id, analysis_text, confusion_matrix',
  'optimizer_round_failures: bounded samples with expected/predicted actions and log snippets',
  'eval_runs: source=db, source=pool, or source=optimizer for history and jobs',
]

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
    <section class="arb-guide__hero">
      <div class="arb-guide__hero-copy">
        <UiEyebrow>Auto Prompt Optimizer v2</UiEyebrow>
        <h1 class="arb-guide__title">A closed-loop prompt improvement system with held-out validation.</h1>
        <p class="arb-guide__lead">
          The optimizer does not blindly activate a generated prompt. It builds a curated eval pool,
          snapshots a stable validation set, measures baseline accuracy, improves candidates round by
          round, and only exposes prompt versions for deliberate activation.
        </p>
      </div>
      <div class="arb-guide__hero-panel" aria-label="Optimizer loop summary">
        <div class="arb-guide__mini-map">
          <span>Logs</span>
          <span>Pool</span>
          <span>Baseline</span>
          <span>Candidate</span>
          <span>Test</span>
          <span>Activate</span>
        </div>
        <div class="arb-guide__hero-callout">
          <span class="arb-guide__marker">Key idea</span>
          <strong>Improve on validation, prove on test, activate by human choice.</strong>
        </div>
      </div>
    </section>

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

    <section class="arb-guide__stats" aria-label="Eval pool splits">
      <UiCard v-for="item in poolStats" :key="item.label" class="arb-guide__stat-card">
        <span class="arb-guide__stat-label">{{ item.label }}</span>
        <strong class="arb-guide__stat-value num">{{ item.value }}</strong>
        <span class="arb-guide__stat-note">{{ item.note }}</span>
      </UiCard>
    </section>

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

    <section class="arb-guide__section">
      <div class="arb-guide__section-head">
        <UiEyebrow>Operator controls</UiEyebrow>
        <h2 class="arb-guide__heading">Where each part shows up in the UI</h2>
      </div>

      <div class="arb-guide__surface-grid">
        <NuxtLink to="/optimizer" class="arb-guide__surface">
          <span class="arb-guide__surface-title">Auto optimizer</span>
          <span class="arb-guide__surface-copy">Start runs, review pool health, inspect rounds, and cancel active runs.</span>
        </NuxtLink>
        <NuxtLink to="/evaluate/history" class="arb-guide__surface">
          <span class="arb-guide__surface-title">Eval history</span>
          <span class="arb-guide__surface-copy">See source badges for db, pool, and optimizer runs, plus live progress while running.</span>
        </NuxtLink>
        <NuxtLink to="/settings?tab=prompts" class="arb-guide__surface">
          <span class="arb-guide__surface-title">Prompt settings</span>
          <span class="arb-guide__surface-copy">Generated prompt versions remain inactive until an operator activates one.</span>
        </NuxtLink>
      </div>
    </section>

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

.arb-guide__heading {
  margin: 0;
  color: var(--fg-0);
  font-size: 18px;
  font-weight: 620;
}

.arb-guide__timeline {
  display: grid;
  gap: 10px;
}

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
  color: var(--warning);
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

.arb-guide code {
  overflow-wrap: anywhere;
  color: var(--fg-2);
  font-family: var(--font-mono);
  font-size: 11px;
}

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

.arb-guide__surface-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.arb-guide__checkpoint-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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

.num {
  font-family: var(--font-mono);
}

@media (max-width: 920px) {
  .arb-guide__hero,
  .arb-guide__split,
  .arb-guide__surface-grid,
  .arb-guide__checkpoint-grid {
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
}

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
}
</style>
