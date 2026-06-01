# Optimizer Eval-Link Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface `baseline_eval_run_id` and per-round `eval_run_id` from the optimizer history API in the History tab so operators can navigate directly to the corresponding eval run detail page.

**Architecture:** Two-file change: add nullable fields to the existing TypeScript interfaces in `types/api.ts`, then update `OptimizerHistory.vue` to render a baseline eval chip in the stats row and an Eval column in the round table. No new composables, no extra API calls, no new pages.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), Nuxt 3 (`NuxtLink`), TypeScript strict, Vitest for unit tests, `pnpm vue-tsc --noEmit` for type checking.

---

## File Map

| Action | Path | Change |
|--------|------|--------|
| Modify | `types/api.ts` | Add `baseline_eval_run_id: number \| null` to `OptimizerRun`; add `eval_run_id: number \| null` to `OptimizerRound` |
| Modify | `components/optimizer/OptimizerHistory.vue` | Baseline eval chip in stats row; Eval column in round table; CSS for link-chip |

---

## Task 1: Extend TypeScript interfaces

**Files:**
- Modify: `types/api.ts` (lines 276–292, `OptimizerRound` and `OptimizerRun` interfaces)

- [ ] **Step 1: Confirm current type-check baseline passes**

```bash
cd D:\claude\llmArbiter
pnpm vue-tsc
```

Expected: zero errors. If there are pre-existing errors, note them — they are not your responsibility.

- [ ] **Step 2: Add `eval_run_id` to `OptimizerRound`**

In `types/api.ts`, find the `OptimizerRound` interface (currently ends at `kept?: boolean`) and add one field:

```ts
export interface OptimizerRound {
  round_number: number
  accuracy: number
  prompt_version_id: number
  failed_case_count: number
  kept?: boolean
  eval_run_id: number | null   // ← add this line
}
```

- [ ] **Step 3: Add `baseline_eval_run_id` to `OptimizerRun`**

In `types/api.ts`, find the `OptimizerRun` interface (currently ends at `rounds: OptimizerRound[]`) and add one field:

```ts
export interface OptimizerRun {
  optimizer_run_id: number
  status: OptimizerRunStatus
  max_rounds: number
  target_accuracy: number
  started_at: string
  finished_at: string | null
  rounds: OptimizerRound[]
  baseline_eval_run_id: number | null   // ← add this line
}
```

- [ ] **Step 4: Verify type-check still passes**

```bash
pnpm vue-tsc
```

Expected: zero errors (the two new fields are nullable — existing mock objects in tests use `Pick<>` types that don't require these fields, so no test code needs updating).

- [ ] **Step 5: Commit**

```bash
git add types/api.ts
git commit -m "feat: add baseline_eval_run_id and eval_run_id to optimizer types"
```

---

## Task 2: Add baseline eval link to the run detail stats row

**Files:**
- Modify: `components/optimizer/OptimizerHistory.vue` (template section, `optimizer-history__stats` div; style section)

The stats row currently renders three `<span>` chips. We add a fourth element — a `NuxtLink` — that only renders when `baseline_eval_run_id` is non-null.

- [ ] **Step 1: Replace the stats div in the template**

Find this block in `OptimizerHistory.vue` (around line 68–70):

```html
<div class="optimizer-history__stats">
  <span>Target {{ formatPercent(selectedRun.target_accuracy) }}</span>
  <span>Best {{ formatPercent(bestOptimizerAccuracy(selectedRun)) }}</span>
  <span>{{ selectedRun.rounds.length }} rounds</span>
</div>
```

Replace with:

```html
<div class="optimizer-history__stats">
  <span>Target {{ formatPercent(selectedRun.target_accuracy) }}</span>
  <span>Best {{ formatPercent(bestOptimizerAccuracy(selectedRun)) }}</span>
  <span>{{ selectedRun.rounds.length }} rounds</span>
  <NuxtLink
    v-if="selectedRun.baseline_eval_run_id != null"
    :to="`/evaluate/history/${selectedRun.baseline_eval_run_id}`"
    class="optimizer-history__stats-link"
  >
    Baseline eval ↗
  </NuxtLink>
</div>
```

- [ ] **Step 2: Add the CSS rule for the stats link**

In the `<style scoped>` block, after the `.optimizer-history__stats span` rule (around line 124), add:

```css
.optimizer-history__stats-link { border: 1px solid var(--border-subtle); border-radius: var(--r-sm); padding: 5px 8px; color: var(--accent); font-family: var(--font-mono); font-size: 11px; text-decoration: none; }
.optimizer-history__stats-link:hover { text-decoration: underline; }
```

- [ ] **Step 3: Verify type-check**

```bash
pnpm vue-tsc
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add components/optimizer/OptimizerHistory.vue
git commit -m "feat: show baseline eval link in optimizer run detail stats"
```

---

## Task 3: Add Eval column to the round table

**Files:**
- Modify: `components/optimizer/OptimizerHistory.vue` (round table `<thead>` and `<tbody>`)

The round table currently has 5 columns: Round | Accuracy | Failed | Prompt | Kept. Add a 6th column `Eval`.

- [ ] **Step 1: Add the `<th>` header**

Find the `<thead>` block (around line 83–89):

```html
<thead>
  <tr>
    <th>Round</th>
    <th>Accuracy</th>
    <th>Failed</th>
    <th>Prompt</th>
    <th>Kept</th>
  </tr>
</thead>
```

Replace with:

```html
<thead>
  <tr>
    <th>Round</th>
    <th>Accuracy</th>
    <th>Failed</th>
    <th>Prompt</th>
    <th>Kept</th>
    <th>Eval</th>
  </tr>
</thead>
```

- [ ] **Step 2: Add the `<td>` cell in each row**

Find the `<tbody>` rows block (around lines 91–101):

```html
<tr
  v-for="round in [...selectedRun.rounds].sort((a, b) => a.round_number - b.round_number)"
  :key="round.round_number"
>
  <td class="num">{{ round.round_number }}</td>
  <td class="num">{{ formatPercent(round.accuracy) }}</td>
  <td class="num">{{ round.failed_case_count }}</td>
  <td><NuxtLink to="/settings" class="optimizer-history__link">v{{ round.prompt_version_id }}</NuxtLink></td>
  <td>{{ round.kept ? 'Yes' : 'No' }}</td>
</tr>
```

Replace with:

```html
<tr
  v-for="round in [...selectedRun.rounds].sort((a, b) => a.round_number - b.round_number)"
  :key="round.round_number"
>
  <td class="num">{{ round.round_number }}</td>
  <td class="num">{{ formatPercent(round.accuracy) }}</td>
  <td class="num">{{ round.failed_case_count }}</td>
  <td><NuxtLink to="/settings" class="optimizer-history__link">v{{ round.prompt_version_id }}</NuxtLink></td>
  <td>{{ round.kept ? 'Yes' : 'No' }}</td>
  <td>
    <NuxtLink
      v-if="round.eval_run_id != null"
      :to="`/evaluate/history/${round.eval_run_id}`"
      class="optimizer-history__link"
    >
      ↗ {{ round.eval_run_id }}
    </NuxtLink>
    <span v-else class="optimizer-history__muted">—</span>
  </td>
</tr>
```

- [ ] **Step 3: Run the full test suite**

```bash
pnpm test
```

Expected: all existing tests pass. (No new unit tests are required — the changed code is template rendering with no extractable pure logic; correctness is covered by TypeScript compilation.)

- [ ] **Step 4: Final type-check**

```bash
pnpm vue-tsc
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add components/optimizer/OptimizerHistory.vue
git commit -m "feat: add eval run link column to optimizer round table"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| Add `baseline_eval_run_id: number \| null` to `OptimizerRun` | Task 1 Step 3 |
| Add `eval_run_id: number \| null` to `OptimizerRound` | Task 1 Step 2 |
| Baseline eval chip in stats row with link to `/evaluate/history/{id}` | Task 2 Step 1 |
| Chip hidden when `baseline_eval_run_id` is null | Task 2 Step 1 (`v-if`) |
| Eval column in round table linking to `/evaluate/history/{eval_run_id}` | Task 3 Step 2 |
| Show `—` when `eval_run_id` is null | Task 3 Step 2 (`v-else`) |
| Zero-rounds run: only baseline link shown, no fetch | Satisfied: round table guarded by `v-if="selectedRun.rounds.length > 0"` (pre-existing), baseline chip shown via Task 2 |
| No new API calls | Confirmed: no composable changes |
| `pnpm vue-tsc` passes | Task 1 Step 4, Task 2 Step 3, Task 3 Step 4 |

All requirements covered. No gaps.
