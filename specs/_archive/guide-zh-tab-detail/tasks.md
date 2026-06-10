# Tasks: Guide Page — ZH/EN Tab + Enriched Content

## Feature ID
`guide-zh-tab-detail`

---

## Task 1 — Language toggle UI
**File:** `pages/guide.vue`

Add `lang` ref and `t()` helper in `<script setup>`, and render a tab strip below the top bar:

```typescript
const lang = ref<'en' | 'zh'>('en')
function t(obj: { en: string; zh: string }): string {
  return obj[lang.value]
}
```

Tab strip renders two buttons (EN | 中文), placed as first child inside `<main class="arb-guide">`. Active tab uses `--bg-3` background, inactive uses transparent. Uses existing token variables only — no magic colours.

### AC
- [ ] AC-1.1: Clicking "中文" switches all visible text on the page to Chinese. Clicking "EN" switches back to English.
- [ ] AC-1.2: Language state is page-local (not persisted, resets on navigate-away).
- [ ] AC-1.3: Tab strip is visually consistent with the optimizer page tab pattern.

---

## Task 2 — Convert all data arrays to bilingual objects
**File:** `pages/guide.vue`

For every user-visible string field in the data arrays (`poolStats`, `visualLanes`, `checkpoints`, `gateCards`, `toleranceRows`, `roundStates`, `flowSteps`, `dbArtifacts`, `endpointGroups`), convert the field from `string` to `{ en: string; zh: string }`. Update the TypeScript interfaces accordingly.

All hardcoded strings in the template (hero heading, hero lead, section headings, eyebrow labels, callout text, hero callout strong text) must also become bilingual. Prefer computed objects for static template strings rather than inline ternaries.

### AC
- [ ] AC-2.1: All section headings, body text, stat labels, eyebrow strings, gate formulas, gate examples, round state bodies, flow step bodies, checkpoint bodies, accuracy term descriptions, DB artifacts, endpoint labels, and operator control copy appear in Chinese when `lang === 'zh'`.
- [ ] AC-2.2: TypeScript types are updated — no `any`, no type assertions. `vue-tsc --noEmit` passes.
- [ ] AC-2.3: Code references (`<code>` blocks, formula strings, API endpoint strings, skip reason codes) remain in English in both language modes (technical identifiers must not be translated).
- [ ] AC-2.4: `GuideTooltip` text remains English-only in both modes (per spec scope).

---

## Task 3 — Enriched English content
**File:** `pages/guide.vue`

Expand the following sections with additional detail (English first; Chinese translation will be included in the bilingual objects from Task 2):

1. **Hero lead paragraph**: add one sentence describing the two-layer LLM arbiter concept — "The underlying arbiter uses a two-layer decision: an LLM chooses the action (trigger_rebuild, notify_human, etc.) and a confidence gate decides the execution mode (auto vs. human review)."
2. **Data splits desc**: add note about `split_group` near-duplicate prevention — "Cases sharing a split_group key are assigned to the same split to prevent near-duplicate leakage across train, validation, and test boundaries."
3. **Candidate round node body**: mention confusion clusters — add "The model reads per-action confusion clusters to identify systematic failure patterns before writing analysis_text."
4. **Gate 2 note**: expand to explain *why* protected actions are stricter — append "notify_human and send_email are protected at ±2% because an unexpected drop in detection rate routes real incidents to automated-only paths, bypassing the human escalation layer."
5. **Phase 0 flow step body**: already mentions log sources — verify they are all present (LogChunks, Travis CI, BGL, HPC); add `split_group` deduplication mention.
6. **Accuracy delta card**: add clarifying sentence — "This delta is always computed on the fixed validation snapshot, never on the held-out test data."

### AC
- [ ] AC-3.1: Hero lead includes the two-layer arbiter concept sentence.
- [ ] AC-3.2: Data splits section mentions `split_group` deduplication.
- [ ] AC-3.3: Candidate round node body mentions confusion clusters.
- [ ] AC-3.4: Gate 2 note includes the escalation-bypass explanation.
- [ ] AC-3.5: Accuracy delta card contains the "validation-only, never test data" clarifying sentence.

---

## Task 4 — Additional tooltips
**File:** `pages/guide.vue`

Add `GuideTooltip` wrappers to the following terms wherever they first appear in the template:

| Term / phrase | Tooltip text |
|---|---|
| `split_group` | "A deduplication key. Cases sharing a split_group are assigned to the same data split to prevent near-duplicate leakage across train/val/test boundaries." |
| `notify_human` | "A high-impact action routed to a human operator. Protected by the stricter 2% regression tolerance." |
| `send_email` | "An escalation action that sends an email to the team. Protected by the stricter 2% regression tolerance." |
| `source=optimizer` | "Eval runs created by the optimizer are tagged source=optimizer to distinguish them from manual evals (source=db) and pool runs (source=pool)." |
| confusion clusters / `confusion_matrix` | "Per-action prediction counts for a round. Used by the optimizer LLM to identify which action types are being confused and why." |
| held-out test / test snapshot | "A fixed set of 400 cases (80/action) never shown to the optimizer during training. Evaluated once after the loop finishes — results are not used to select rounds." |

### AC
- [ ] AC-4.1: Each listed term/phrase shows a tooltip on hover.
- [ ] AC-4.2: Tooltips are English-only in both language modes.
- [ ] AC-4.3: No duplicate tooltip on the same term in the same section.

---

## Task 5 — TypeScript & lint verification
**Files:** `pages/guide.vue`, any supporting type files

Run `pnpm vue-tsc --noEmit` and `pnpm lint` after implementation. Fix any errors.

### AC
- [ ] AC-5.1: `pnpm vue-tsc --noEmit` exits 0.
- [ ] AC-5.2: `pnpm lint` exits 0.
- [ ] AC-5.3: `pnpm exec vitest run --passWithNoTests` exits 0 (no regressions).
