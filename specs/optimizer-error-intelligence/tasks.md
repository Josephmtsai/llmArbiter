# Tasks: Optimizer Error Intelligence

## Feature ID
`optimizer-error-intelligence`

---

## Task 1 — Add TypeScript types
**File:** `types/api.ts`

Add the following types:

```typescript
export type OptimizerErrorType =
  | 'wrong_action'
  | 'confidence_too_high'
  | 'confidence_too_low'
  | 'missing_required_field'
  | 'invalid_json'
  | 'unsupported_action'
  | 'protected_action_regression'
  | 'unknown'
  | string

export interface OptimizerErrorRepresentativeCase {
  source_case_id: string | null
  expected_action: string | null
  predicted_action: string | null
  confidence: number | null
  log_snippet: string | null
  hardware_info?: Record<string, unknown>
  raw_output?: string | null
  parsed_output?: unknown
}

export interface OptimizerErrorCluster {
  error_type: OptimizerErrorType
  expected_action: string | null
  predicted_action: string | null
  count: number
  accuracy_impact: number | null
  representative_cases: OptimizerErrorRepresentativeCase[]
  suggested_rule_focus?: string | null
}
```

Extend `OptimizerRound`:
```typescript
error_clusters?: OptimizerErrorCluster[] | null
```

### AC
- [ ] AC-1.1: `pnpm vue-tsc --noEmit` passes with the new types.
- [ ] AC-1.2: `OptimizerRound.error_clusters` is typed as `OptimizerErrorCluster[] | null | undefined`.

---

## Task 2 — Add helper functions
**File:** `components/optimizer/OptimizerHistory.vue`

Add to `<script setup>`:

```typescript
const ERROR_TYPE_LABELS: Record<string, string> = {
  wrong_action: 'Wrong action',
  confidence_too_high: 'Confidence too high',
  confidence_too_low: 'Confidence too low',
  missing_required_field: 'Missing field',
  invalid_json: 'Invalid JSON',
  unsupported_action: 'Unsupported action',
  protected_action_regression: 'Protected action regression',
  unknown: 'Unknown',
}

function errorTypeLabel(errorType: string): string {
  return ERROR_TYPE_LABELS[errorType] ?? errorType
}

function formatImpact(value: number | null): string {
  if (value == null) return 'n/a'
  return `${(Math.abs(value) * 100).toFixed(1)}%`
}
```

### AC
- [ ] AC-2.1: Unknown `error_type` values (not in the map) return the raw key string.
- [ ] AC-2.2: `formatImpact(null)` returns `'n/a'`.
- [ ] AC-2.3: `formatImpact(0.06)` returns `'6.0%'`.

---

## Task 3 — Error Intelligence UI section
**File:** `components/optimizer/OptimizerHistory.vue`

Add the Error Intelligence section inside the expanded round detail (`v-if="expandedRounds.has(round.round_number)"` block), **after the per-action deltas div and before the failure samples div**.

```vue
<!-- Error Intelligence -->
<div v-if="(round.error_clusters ?? []).length > 0" class="optimizer-history__error-intel">
  <div class="optimizer-history__section-label">Error Intelligence</div>
  <p class="optimizer-history__error-intel-desc">
    These are grouped validation failures used to guide the next prompt candidate.
  </p>
  <div class="optimizer-history__cluster-list">
    <details
      v-for="(cluster, ci) in round.error_clusters"
      :key="ci"
      class="optimizer-history__cluster"
    >
      <summary class="optimizer-history__cluster-summary">
        <span class="optimizer-history__cluster-type">{{ errorTypeLabel(cluster.error_type) }}</span>
        <template v-if="cluster.expected_action && cluster.predicted_action">
          <span class="optimizer-history__acc-arrow">·</span>
          <span class="optimizer-history__cluster-action">{{ shortAction(cluster.expected_action) }}</span>
          <span class="optimizer-history__acc-arrow">→</span>
          <span class="optimizer-history__cluster-action">{{ shortAction(cluster.predicted_action) }}</span>
        </template>
        <span class="optimizer-history__cluster-count num">{{ cluster.count }}</span>
        <span v-if="cluster.accuracy_impact != null" class="optimizer-history__cluster-impact num">
          {{ formatImpact(cluster.accuracy_impact) }}
        </span>
      </summary>
      <div class="optimizer-history__cluster-detail">
        <p v-if="cluster.suggested_rule_focus" class="optimizer-history__cluster-focus">
          {{ cluster.suggested_rule_focus }}
        </p>
        <div v-if="cluster.representative_cases.length > 0" class="optimizer-history__rep-cases">
          <div class="optimizer-history__section-label optimizer-history__section-label--minor">
            Representative cases
          </div>
          <details
            v-for="(rc, ri) in cluster.representative_cases"
            :key="ri"
            class="optimizer-history__failure"
          >
            <summary class="optimizer-history__failure-summary">
              <span>{{ rc.expected_action ?? 'n/a' }}</span>
              <span class="optimizer-history__acc-arrow">→</span>
              <span>{{ rc.predicted_action ?? 'n/a' }}</span>
              <span class="num">{{ formatConfidence(rc.confidence) }}</span>
            </summary>
            <div class="optimizer-history__failure-detail">
              <span v-if="rc.source_case_id" class="optimizer-history__metadata-item">
                <strong>source_case_id</strong>: {{ rc.source_case_id }}
              </span>
              <div v-if="rc.log_snippet" class="optimizer-history__log-preview">{{ rc.log_snippet }}</div>
              <details v-if="rc.raw_output" class="optimizer-history__raw-output">
                <summary>Raw output</summary>
                <pre>{{ rc.raw_output }}</pre>
              </details>
            </div>
          </details>
        </div>
      </div>
    </details>
  </div>
</div>
```

### AC
- [ ] AC-3.1: Section is hidden when `round.error_clusters` is `null`, `undefined`, or `[]`.
- [ ] AC-3.2: Section is shown when `round.error_clusters` has one or more entries.
- [ ] AC-3.3: Each cluster row shows: error type label, expected→predicted (when both non-null), count, accuracy_impact.
- [ ] AC-3.4: `suggested_rule_focus` is shown inside the cluster `<details>` body when present.
- [ ] AC-3.5: Representative cases `<details>` are **closed by default**.
- [ ] AC-3.6: `raw_output` per representative case is hidden behind a nested `<details>` (closed by default).
- [ ] AC-3.7: Section title is "Error Intelligence"; subtitle is "These are grouped validation failures used to guide the next prompt candidate."
- [ ] AC-3.8: Section is placed **after per-action deltas, before failure samples**.

---

## Task 4 — Scoped CSS
**File:** `components/optimizer/OptimizerHistory.vue`

Add to `<style scoped>`:

```css
.optimizer-history__error-intel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.optimizer-history__error-intel-desc {
  margin: 0;
  color: var(--fg-4);
  font-size: 11px;
}

.optimizer-history__cluster-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.optimizer-history__cluster {
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
}

.optimizer-history__cluster-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  color: var(--fg-3);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  user-select: none;
  list-style: none;
}

.optimizer-history__cluster-type {
  color: var(--fg-1);
}

.optimizer-history__cluster-action {
  font-family: var(--font-mono);
  font-size: 11px;
}

.optimizer-history__cluster-count {
  margin-left: auto;
  color: var(--fg-3);
  font-family: var(--font-mono);
  font-size: 11px;
}

.optimizer-history__cluster-impact {
  color: var(--action-notify);
  font-family: var(--font-mono);
  font-size: 11px;
}

.optimizer-history__cluster-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border-subtle);
  padding: 10px 12px;
  background: var(--bg-1);
}

.optimizer-history__cluster-focus {
  margin: 0;
  color: var(--fg-2);
  font-size: 12px;
  font-style: italic;
  line-height: 1.5;
}

.optimizer-history__rep-cases {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.optimizer-history__section-label--minor {
  font-size: 10px;
  margin-bottom: 0;
}
```

### AC
- [ ] AC-4.1: `pnpm vue-tsc --noEmit` exits 0.
- [ ] AC-4.2: `pnpm exec vitest run --passWithNoTests` exits 0 (28/28 pass).

---

## Task 5 — Run list guard
**File:** `components/optimizer/OptimizerHistory.vue`

Verify the run list sidebar (left column `v-for="run in runs"`) does NOT reference `error_clusters` anywhere. No new rendering of clusters in the list.

### AC
- [ ] AC-5.1: The run list sidebar template contains no reference to `error_clusters`.
