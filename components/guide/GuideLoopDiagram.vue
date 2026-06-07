<template>
  <div class="gld" aria-label="Optimizer loop flow diagram">

    <!-- Step 1: Snapshot -->
    <div class="gld__step gld__step--start">
      <span class="gld__step-num">①</span>
      <div class="gld__step-body">
        <strong>Run starts — val snapshot sampled</strong>
        <p>200 cases · 40 per action · fixed for the entire run. Every round in this run is scored on the same 200 cases.</p>
      </div>
      <span class="gld__tag">fixed snapshot</span>
    </div>

    <div class="gld__arrow" aria-hidden="true">↓</div>

    <!-- Step 2: Baseline eval -->
    <div class="gld__step">
      <span class="gld__step-num">②</span>
      <div class="gld__step-body">
        <strong>Baseline evaluation</strong>
        <p>Active prompt evaluated on the snapshot → <code>baseline_accuracy</code>. If baseline already meets the target, the loop ends here with no candidate rounds.</p>
      </div>
      <span class="gld__tag">source=optimizer</span>
    </div>

    <div class="gld__arrow" aria-hidden="true">↓</div>

    <!-- Step 3: Candidate round -->
    <div class="gld__step gld__step--round">
      <span class="gld__step-num">③</span>
      <div class="gld__step-body">
        <strong>Round N — generate &amp; evaluate candidate</strong>
        <p>Optimizer model reads failures and confusion matrix, writes analysis, generates a new prompt version, and evaluates it on the <em>same</em> 200 snapshot cases.</p>
      </div>
      <span class="gld__tag">round N</span>

      <!-- Skip branch -->
      <div class="gld__skip-branch">
        <div class="gld__skip-line" aria-hidden="true" />
        <div class="gld__skip-card">
          <span class="gld__badge gld__badge--skipped">Skipped</span>
          <span>No usable candidate returned (invalid JSON, missing actions…) — round recorded, next round starts</span>
        </div>
      </div>
    </div>

    <div class="gld__arrow" aria-hidden="true">↓</div>

    <!-- Gate 1 -->
    <div class="gld__gate">
      <div class="gld__gate-diamond" aria-hidden="true">◇</div>
      <div class="gld__gate-body">
        <span class="gld__gate-label">Gate 1 — overall accuracy</span>
        <code>round_accuracy &gt; previous_best_accuracy?</code>
      </div>
      <div class="gld__gate-paths">
        <div class="gld__gate-no">
          <span class="gld__gate-path-label">NO</span>
          <span class="gld__badge gld__badge--rejected">Rejected: no overall improvement</span>
        </div>
        <div class="gld__gate-yes">
          <span class="gld__gate-path-label">YES ↓</span>
        </div>
      </div>
    </div>

    <div class="gld__arrow" aria-hidden="true">↓</div>

    <!-- Gate 2 -->
    <div class="gld__gate gld__gate--2">
      <div class="gld__gate-diamond" aria-hidden="true">◇</div>
      <div class="gld__gate-body">
        <span class="gld__gate-label">Gate 2 — per-action regression</span>
        <code>all action deltas ≥ −tolerance?</code>
        <div class="gld__gate-tolerances">
          <span><code>notify_human</code> / <code>send_email</code> tolerance = 2%</span>
          <span><code>trigger_*</code> tolerance = 5%</span>
          <span class="gld__gate-note">Only applies when baseline has ≥ 10 samples for that action</span>
        </div>
      </div>
      <div class="gld__gate-paths">
        <div class="gld__gate-no">
          <span class="gld__gate-path-label">NO</span>
          <span class="gld__badge gld__badge--rejected">Rejected: action regression</span>
        </div>
        <div class="gld__gate-yes">
          <span class="gld__gate-path-label">YES ↓</span>
        </div>
      </div>
    </div>

    <div class="gld__arrow" aria-hidden="true">↓</div>

    <!-- Kept -->
    <div class="gld__step gld__step--kept">
      <span class="gld__badge gld__badge--kept">✓ Kept</span>
      <div class="gld__step-body">
        <p>Candidate becomes the new best prompt. Next round analyzes <em>its</em> failures.</p>
      </div>
      <!-- Loop-back indicator -->
      <div class="gld__loopback">
        <span class="gld__loopback-arrow" aria-hidden="true">↺</span>
        <span>if rounds remain → back to ③</span>
      </div>
    </div>

    <div class="gld__arrow" aria-hidden="true">↓</div>

    <!-- Step 5: Final test -->
    <div class="gld__step gld__step--final">
      <span class="gld__step-num">⑤</span>
      <div class="gld__step-body">
        <strong>Final test evaluation</strong>
        <p>After target accuracy reached or max rounds exhausted — best prompt evaluated on the held-out test snapshot (400 cases · 80 per action, run once). Records <code>test_accuracy</code>.</p>
      </div>
      <span class="gld__tag gld__tag--test">test_accuracy</span>
    </div>

  </div>
</template>

<style scoped>
.gld {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
}

.gld__arrow {
  color: var(--fg-4);
  font-size: 18px;
  line-height: 1;
  padding: 2px 0;
}

/* Steps */
.gld__step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  padding: 14px;
  background: var(--bg-1);
  position: relative;
}

.gld__step--start {
  border-color: rgba(79, 140, 247, 0.38);
  background: rgba(79, 140, 247, 0.05);
}

.gld__step--round {
  border-color: var(--border);
  flex-wrap: wrap;
}

.gld__step--kept {
  border-color: rgba(56, 189, 248, 0.45);
  background: rgba(56, 189, 248, 0.05);
  flex-wrap: wrap;
  gap: 10px;
}

.gld__step--final {
  border-color: rgba(34, 197, 94, 0.38);
  background: rgba(34, 197, 94, 0.05);
}

.gld__step-num {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--bg-3);
  color: var(--fg-2);
  font-size: 12px;
  font-weight: 700;
}

.gld__step-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.gld__step-body strong {
  color: var(--fg-1);
  font-size: 13px;
}

.gld__step-body p {
  margin: 0;
  color: var(--fg-3);
  font-size: 12px;
  line-height: 1.55;
}

.gld__step-body code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-2);
}

.gld__tag {
  flex-shrink: 0;
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: var(--r-pill);
  padding: 2px 7px;
  color: var(--action-fallback);
  background: rgba(245, 158, 11, 0.08);
  font-family: var(--font-mono);
  font-size: 10px;
  white-space: nowrap;
  align-self: flex-start;
}

.gld__tag--test {
  border-color: rgba(34, 197, 94, 0.35);
  color: var(--success);
  background: rgba(34, 197, 94, 0.08);
}

/* Skip branch */
.gld__skip-branch {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-subtle);
}

.gld__skip-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex: 1;
}

.gld__skip-card span:last-child {
  color: var(--fg-4);
  font-size: 11px;
  line-height: 1.5;
}

/* Gates */
.gld__gate {
  width: 100%;
  border: 2px solid rgba(245, 158, 11, 0.45);
  border-radius: var(--r-md);
  padding: 14px;
  background: rgba(245, 158, 11, 0.05);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gld__gate--2 {
  border-color: rgba(168, 85, 247, 0.4);
  background: rgba(168, 85, 247, 0.05);
}

.gld__gate-diamond {
  font-size: 20px;
  color: var(--action-fallback);
  line-height: 1;
}

.gld__gate--2 .gld__gate-diamond {
  color: var(--action-restart);
}

.gld__gate-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gld__gate-label {
  color: var(--fg-2);
  font-size: 12px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.gld__gate-body code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg-1);
}

.gld__gate-tolerances {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
  padding: 8px;
  border-radius: var(--r-sm);
  background: rgba(168, 85, 247, 0.08);
}

.gld__gate-tolerances span {
  color: var(--fg-3);
  font-size: 12px;
}

.gld__gate-tolerances code {
  font-size: 11px;
  color: var(--fg-2);
}

.gld__gate-note {
  color: var(--fg-4) !important;
  font-size: 11px !important;
  font-style: italic;
}

.gld__gate-paths {
  display: flex;
  gap: 16px;
  align-items: center;
}

.gld__gate-no,
.gld__gate-yes {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gld__gate-path-label {
  color: var(--fg-4);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
}

/* Badges */
.gld__badge {
  border-radius: var(--r-pill);
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.gld__badge--kept {
  background: var(--action-rebuild-soft);
  color: var(--action-rebuild);
}

.gld__badge--rejected {
  background: var(--action-notify-soft);
  color: var(--action-notify);
}

.gld__badge--skipped {
  background: rgba(251, 191, 36, 0.12);
  color: var(--action-fallback);
}

/* Loop-back */
.gld__loopback {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-subtle);
}

.gld__loopback-arrow {
  font-size: 16px;
  color: var(--fg-4);
}

.gld__loopback span:last-child {
  color: var(--fg-4);
  font-size: 12px;
}

.gld__skip-line {
  width: 16px;
  height: 1px;
  background: var(--border-subtle);
  flex-shrink: 0;
  margin-top: 10px;
}
</style>
