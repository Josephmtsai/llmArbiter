<template>
  <div class="gsd" aria-label="Eval pool data split diagram">
    <!-- Root -->
    <div class="gsd__root">
      <span class="gsd__root-label">Eval Pool</span>
      <strong class="gsd__root-value num">12,000 cases</strong>
      <span class="gsd__root-sub">2,400 per action × 5 actions</span>
    </div>

    <div class="gsd__trunk" aria-hidden="true" />

    <!-- Three branches -->
    <div class="gsd__branches">
      <!-- Train -->
      <div class="gsd__branch">
        <div class="gsd__connector" aria-hidden="true" />
        <div class="gsd__split gsd__split--train">
          <span class="gsd__split-label">Train</span>
          <strong class="num">10,400</strong>
          <span class="gsd__split-sub">2,080 / action</span>
          <span class="gsd__split-note">Relabeling &amp; curation — not used for optimizer scoring</span>
        </div>
      </div>

      <!-- Val -->
      <div class="gsd__branch">
        <div class="gsd__connector" aria-hidden="true" />
        <div class="gsd__split gsd__split--val">
          <span class="gsd__split-label">Validation</span>
          <strong class="num">800</strong>
          <span class="gsd__split-sub">160 / action</span>
        </div>
        <div class="gsd__snapshot-connector" aria-hidden="true" />
        <div class="gsd__snapshot">
          <span class="gsd__snapshot-label">Optimizer snapshot</span>
          <strong class="num">200 cases</strong>
          <span class="gsd__snapshot-sub">40 / action · sampled once at run start, fixed for entire run</span>
        </div>
      </div>

      <!-- Test -->
      <div class="gsd__branch">
        <div class="gsd__connector" aria-hidden="true" />
        <div class="gsd__split gsd__split--test">
          <span class="gsd__split-label">Test</span>
          <strong class="num">800</strong>
          <span class="gsd__split-sub">160 / action</span>
        </div>
        <div class="gsd__snapshot-connector" aria-hidden="true" />
        <div class="gsd__snapshot gsd__snapshot--test">
          <span class="gsd__snapshot-label">Final test snapshot</span>
          <strong class="num">400 cases</strong>
          <span class="gsd__snapshot-sub">80 / action · used once after optimizer loop ends</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gsd {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  width: 100%;
}

.gsd__root {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 12px 20px;
  background: var(--bg-2);
  text-align: center;
}

.gsd__root-label {
  color: var(--fg-4);
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.gsd__root-value {
  color: var(--fg-0);
  font-size: 20px;
}

.gsd__root-sub {
  color: var(--fg-3);
  font-size: 12px;
}

.gsd__trunk {
  width: 1px;
  height: 20px;
  background: var(--border-subtle);
}

.gsd__branches {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  width: 100%;
  position: relative;
}

/* Horizontal line connecting branches */
.gsd__branches::before {
  content: '';
  position: absolute;
  top: 0;
  left: calc(16.666% + 8px);
  right: calc(16.666% + 8px);
  height: 1px;
  background: var(--border-subtle);
}

.gsd__branch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.gsd__connector {
  width: 1px;
  height: 20px;
  background: var(--border-subtle);
}

.gsd__split {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  padding: 10px 8px;
  background: var(--bg-1);
  text-align: center;
}

.gsd__split--train {
  border-color: var(--border-subtle);
}

.gsd__split--val {
  border-color: rgba(79, 140, 247, 0.35);
  background: rgba(79, 140, 247, 0.05);
}

.gsd__split--test {
  border-color: rgba(34, 197, 94, 0.35);
  background: rgba(34, 197, 94, 0.05);
}

.gsd__split-label {
  color: var(--fg-4);
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.gsd__split strong {
  color: var(--fg-0);
  font-size: 17px;
}

.gsd__split-sub {
  color: var(--fg-3);
  font-size: 11px;
}

.gsd__split-note {
  margin-top: 4px;
  color: var(--fg-4);
  font-size: 11px;
  line-height: 1.4;
  font-style: italic;
}

.gsd__snapshot-connector {
  width: 1px;
  height: 16px;
  background: var(--border-subtle);
  border-left: 1px dashed var(--border);
}

.gsd__snapshot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
  border: 1px dashed rgba(79, 140, 247, 0.5);
  border-radius: var(--r-md);
  padding: 10px 8px;
  background: rgba(79, 140, 247, 0.04);
  text-align: center;
}

.gsd__snapshot--test {
  border-color: rgba(34, 197, 94, 0.5);
  background: rgba(34, 197, 94, 0.04);
}

.gsd__snapshot-label {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.gsd__snapshot--test .gsd__snapshot-label {
  color: var(--success);
}

.gsd__snapshot strong {
  color: var(--fg-0);
  font-size: 15px;
}

.gsd__snapshot-sub {
  color: var(--fg-3);
  font-size: 11px;
  line-height: 1.4;
}

@media (max-width: 640px) {
  .gsd__branches {
    grid-template-columns: 1fr;
  }

  .gsd__branches::before {
    display: none;
  }

  .gsd__branch {
    margin-top: 12px;
  }
}
</style>
