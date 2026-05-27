<script setup lang="ts">
import type { Rule, PrimaryAction } from '~/types/api'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const rules = ref<Rule[]>([])

onMounted(async () => {
  try {
    const res = await api.getRules()
    if (res.status === 'success') rules.value = res.data
  } catch { /* silent */ }
})

function ruleVal(name: string, fallback: number): number {
  const r = rules.value.find(r => r.name === name)
  return typeof r?.value === 'number' ? r.value : fallback
}

const autoThreshold = computed(() => ruleVal('auto_execute_threshold', 0.8))
const fallbackThreshold = computed(() => ruleVal('fallback_threshold', 0.5))

const ERROR_PATTERNS: { pattern: string; action: PrimaryAction; note: string }[] = [
  { pattern: 'Linker error / Network timeout / Flaky test', action: 'trigger_rebuild', note: '暫時性錯誤，重跑即可' },
  { pattern: 'OOM / Disk full / Hardware resource issue', action: 'trigger_fallback', note: '換機器或釋放資源' },
  { pattern: 'Daemon crash / Service not responding', action: 'trigger_restart', note: '重啟服務' },
  { pattern: 'Code defect / CVE / Repeated failure ≥ 3', action: 'notify_human', note: '需要人工判斷' },
  { pattern: 'Production deploy failure', action: 'send_email', note: '正式 email 通知' },
]
</script>

<template>
  <AppTopBar title="How it works" subtitle="Decision engine architecture" />

  <div class="arb-guide">

    <!-- Overview -->
    <section class="arb-guide__section">
      <h2 class="arb-guide__heading">Two independent layers</h2>
      <p class="arb-guide__lead">
        Confidence does <strong>not</strong> decide which action to take.
        The two layers are completely separate.
      </p>

      <div class="arb-guide__layers">
        <!-- Layer 1 -->
        <UiCard class="arb-guide__layer">
          <div class="arb-guide__layer-badge arb-guide__layer-badge--1">Layer 1</div>
          <div class="arb-guide__layer-title">LLM picks the action</div>
          <p class="arb-guide__layer-desc">
            Analyzes the build log and selects <code>primary_action</code> based on the
            <strong>error pattern</strong> — not confidence.
          </p>
          <div class="arb-guide__layer-example">
            <span class="arb-guide__example-label">e.g.</span>
            OOM error → <UiActionBadge action="trigger_fallback" size="sm" />
          </div>
        </UiCard>

        <div class="arb-guide__arrow">→</div>

        <!-- Layer 2 -->
        <UiCard class="arb-guide__layer">
          <div class="arb-guide__layer-badge arb-guide__layer-badge--2">Layer 2</div>
          <div class="arb-guide__layer-title">Confidence controls execution</div>
          <p class="arb-guide__layer-desc">
            After the action is chosen, confidence determines whether to
            <strong>auto-execute</strong>, <strong>add a side notification</strong>, or
            <strong>override</strong> with human review.
          </p>
          <div class="arb-guide__layer-example">
            <span class="arb-guide__example-label">e.g.</span>
            confidence 0.6 → execute + notify_human
          </div>
        </UiCard>
      </div>
    </section>

    <!-- Error Pattern Table -->
    <section class="arb-guide__section">
      <h2 class="arb-guide__heading">Layer 1 — Error pattern → Action</h2>
      <p class="arb-guide__desc">The prompt's Error Pattern Guide maps symptom categories to actions.</p>
      <div class="arb-guide__table-wrap">
        <table class="arb-guide__table">
          <thead>
            <tr>
              <th>Error pattern</th>
              <th>Primary action</th>
              <th>Rationale</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in ERROR_PATTERNS" :key="row.action">
              <td class="arb-guide__td-pattern">{{ row.pattern }}</td>
              <td><UiActionBadge :action="row.action" size="sm" /></td>
              <td class="arb-guide__td-note">{{ row.note }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Confidence Routing -->
    <section class="arb-guide__section">
      <h2 class="arb-guide__heading">Layer 2 — Confidence routing</h2>
      <p class="arb-guide__desc">
        Thresholds are stored in the DB and adjustable via
        <NuxtLink to="/settings" class="arb-guide__link">Settings → Rules</NuxtLink>.
      </p>

      <div class="arb-guide__routing-cards">
        <UiCard class="arb-guide__routing-card arb-guide__routing-card--high">
          <div class="arb-guide__routing-threshold num">
            ≥ {{ Math.round(autoThreshold * 100) }}%
          </div>
          <div class="arb-guide__routing-rule num">auto_execute_threshold</div>
          <div class="arb-guide__routing-result">
            <strong>Auto-execute</strong> primary action<br />
            <span class="arb-guide__routing-sub">No side action — fully automated</span>
          </div>
          <div class="arb-guide__routing-example">
            <UiActionBadge action="trigger_fallback" size="sm" />
            <span class="arb-guide__routing-plus">only</span>
          </div>
        </UiCard>

        <UiCard class="arb-guide__routing-card arb-guide__routing-card--mid">
          <div class="arb-guide__routing-threshold num">
            {{ Math.round(fallbackThreshold * 100) }}–{{ Math.round(autoThreshold * 100) - 1 }}%
          </div>
          <div class="arb-guide__routing-rule num">fallback_threshold</div>
          <div class="arb-guide__routing-result">
            Execute primary action<br />
            <strong>+ force notify_human</strong> as side action
          </div>
          <div class="arb-guide__routing-example">
            <UiActionBadge action="trigger_fallback" size="sm" />
            <span class="arb-guide__routing-plus">+</span>
            <UiActionBadge action="notify_human" size="sm" />
          </div>
        </UiCard>

        <UiCard class="arb-guide__routing-card arb-guide__routing-card--low">
          <div class="arb-guide__routing-threshold num">
            &lt; {{ Math.round(fallbackThreshold * 100) }}%
          </div>
          <div class="arb-guide__routing-rule num">below fallback_threshold</div>
          <div class="arb-guide__routing-result">
            <strong>Override</strong> LLM choice<br />
            <span class="arb-guide__routing-sub">Force primary → notify_human</span>
          </div>
          <div class="arb-guide__routing-example">
            <UiActionBadge action="notify_human" size="sm" />
            <span class="arb-guide__routing-plus">forced</span>
          </div>
        </UiCard>
      </div>

      <!-- Example walkthrough -->
      <UiCard class="arb-guide__example-card">
        <UiEyebrow style="margin-bottom: 12px">Worked examples</UiEyebrow>
        <div class="arb-guide__examples">
          <div class="arb-guide__example">
            <span class="arb-guide__example-input">LLM → trigger_fallback, confidence 0.9</span>
            <span class="arb-guide__example-arrow">→</span>
            <span class="arb-guide__example-output high">Execute trigger_fallback only</span>
          </div>
          <div class="arb-guide__example">
            <span class="arb-guide__example-input">LLM → trigger_fallback, confidence 0.6</span>
            <span class="arb-guide__example-arrow">→</span>
            <span class="arb-guide__example-output mid">Execute trigger_fallback + notify_human</span>
          </div>
          <div class="arb-guide__example">
            <span class="arb-guide__example-input">LLM → trigger_fallback, confidence 0.3</span>
            <span class="arb-guide__example-arrow">→</span>
            <span class="arb-guide__example-output low">Override → notify_human only</span>
          </div>
        </div>
      </UiCard>
    </section>

    <!-- Multi-action -->
    <section class="arb-guide__section">
      <h2 class="arb-guide__heading">Multi-action structure</h2>
      <p class="arb-guide__desc">Each decision can have at most two actions: one primary and one side.</p>
      <div class="arb-guide__table-wrap">
        <table class="arb-guide__table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="num">primary_action</td>
              <td class="arb-guide__td-note">Action</td>
              <td>Chosen by LLM from error pattern — trigger_rebuild / trigger_fallback / trigger_restart / notify_human / send_email</td>
            </tr>
            <tr>
              <td class="num">side_action</td>
              <td class="arb-guide__td-note">Action | null</td>
              <td>notify_human or send_email — added by confidence routing, can be null</td>
            </tr>
            <tr>
              <td class="num">confidence</td>
              <td class="arb-guide__td-note">0.0 – 1.0</td>
              <td>LLM's self-assessed certainty — controls execution mode, not action selection</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

  </div>
</template>

<style scoped>
.arb-guide {
  padding: 28px 48px;
  display: flex;
  flex-direction: column;
  gap: 40px;
  flex: 1;
  max-width: 860px;
}
.arb-guide__section { display: flex; flex-direction: column; gap: 14px; }
.arb-guide__heading {
  font-size: 16px;
  font-weight: 600;
  color: var(--fg-0);
  margin: 0;
  letter-spacing: -0.01em;
}
.arb-guide__lead {
  font-size: 14px;
  color: var(--fg-1);
  line-height: 1.6;
  margin: 0;
}
.arb-guide__lead strong { color: var(--fg-0); }
.arb-guide__desc { font-size: 13px; color: var(--fg-3); margin: 0; line-height: 1.6; }
.arb-guide__link { color: var(--accent); text-decoration: none; }
.arb-guide__link:hover { text-decoration: underline; }

/* Layers */
.arb-guide__layers {
  display: flex;
  align-items: stretch;
  gap: 0;
}
.arb-guide__layer {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.arb-guide__arrow {
  display: flex;
  align-items: center;
  padding: 0 16px;
  font-size: 20px;
  color: var(--fg-4);
}
.arb-guide__layer-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--r-pill);
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono);
  width: fit-content;
}
.arb-guide__layer-badge--1 {
  background: rgba(99, 102, 241, 0.12);
  color: #818cf8;
  border: 1px solid rgba(99, 102, 241, 0.25);
}
.arb-guide__layer-badge--2 {
  background: rgba(52, 211, 153, 0.1);
  color: var(--conf-high);
  border: 1px solid rgba(52, 211, 153, 0.2);
}
.arb-guide__layer-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--fg-0);
}
.arb-guide__layer-desc {
  font-size: 12.5px;
  color: var(--fg-3);
  margin: 0;
  line-height: 1.6;
}
.arb-guide__layer-desc strong { color: var(--fg-1); }
.arb-guide__layer-example {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
  font-size: 12px;
  color: var(--fg-3);
}
.arb-guide__example-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-4);
}

/* Tables */
.arb-guide__table-wrap {
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  overflow: hidden;
}
.arb-guide__table {
  width: 100%;
  border-collapse: collapse;
}
.arb-guide__table th {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-4);
  padding: 10px 14px;
  text-align: left;
  background: var(--bg-1);
  border-bottom: 1px solid var(--border-subtle);
}
.arb-guide__table td {
  padding: 10px 14px;
  font-size: 12.5px;
  color: var(--fg-2);
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: middle;
}
.arb-guide__table tr:last-child td { border-bottom: none; }
.arb-guide__td-pattern { font-family: var(--font-mono); font-size: 11.5px; color: var(--fg-1); }
.arb-guide__td-note { color: var(--fg-3); font-size: 12px; }

/* Routing cards */
.arb-guide__routing-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.arb-guide__routing-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.arb-guide__routing-threshold {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
}
.arb-guide__routing-card--high .arb-guide__routing-threshold { color: var(--conf-high); }
.arb-guide__routing-card--mid  .arb-guide__routing-threshold { color: var(--conf-mid); }
.arb-guide__routing-card--low  .arb-guide__routing-threshold { color: var(--conf-low); }
.arb-guide__routing-rule {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-4);
  margin-bottom: 2px;
}
.arb-guide__routing-result {
  font-size: 12.5px;
  color: var(--fg-2);
  line-height: 1.5;
}
.arb-guide__routing-result strong { color: var(--fg-0); }
.arb-guide__routing-sub { font-size: 11px; color: var(--fg-4); }
.arb-guide__routing-example {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
  margin-top: auto;
}
.arb-guide__routing-plus {
  font-size: 11px;
  color: var(--fg-4);
  font-family: var(--font-mono);
}

/* Worked examples */
.arb-guide__example-card { display: flex; flex-direction: column; }
.arb-guide__examples { display: flex; flex-direction: column; gap: 8px; }
.arb-guide__example {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12.5px;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  background: var(--bg-inset);
}
.arb-guide__example-input {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--fg-2);
  flex: 1;
}
.arb-guide__example-arrow { color: var(--fg-4); flex-shrink: 0; }
.arb-guide__example-output {
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}
.arb-guide__example-output.high { color: var(--conf-high); }
.arb-guide__example-output.mid  { color: var(--conf-mid); }
.arb-guide__example-output.low  { color: var(--conf-low); }
</style>
