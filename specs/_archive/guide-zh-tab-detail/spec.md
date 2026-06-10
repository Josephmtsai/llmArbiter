# Spec: Guide Page — ZH/EN Tab + Enriched Content

## Feature ID
`guide-zh-tab-detail`

## Summary
Add a language switcher (English / 中文) to the How It Works guide page, enrich all section text with more detail drawn from `docs/`, and add tooltips to additional key terms throughout the page.

## Problem Statement
The guide page is English-only. Non-English readers (primarily Mandarin-speaking operators) cannot read the documentation in their preferred language. Additionally, the current text is concise but could be more detailed to help new users understand the two-layer LLM arbiter architecture, confidence routing, eval pool design, and the two-gate keep/reject system.

## Scope

### In Scope
1. **Language toggle** — EN / 中文 tab strip at the top of `pages/guide.vue`. State is page-local (`ref<'en' | 'zh'>`). No routing change, no URL query param.
2. **Bilingual data** — all user-visible string data (section headings, body text, stat notes, eyebrows, gate descriptions, round states, flow steps, checkpoint descriptions, accuracy term explanations, DB artifact labels, endpoint group labels, operator control copy, hero copy) translated to Traditional Chinese.
3. **Enriched content** — expand key explanations drawing from `docs/architecture.md`, `docs/2026-05-23-arbiter-design.md`, and `docs/for-claude-design.md`:
   - Hero section: add two-sentence description of the LLM arbiter's two-layer logic (LLM picks action, confidence picks execution mode).
   - Data splits: add note about `split_group` near-duplicate prevention and why test data cannot be used during the loop.
   - Flow diagram: add more detail to "Candidate round" node about how the optimizer LLM reads confusion clusters.
   - Gate section: add Gate 1 and Gate 2 note explaining *why* protected actions (notify_human, send_email) have stricter tolerance (high-impact human-facing actions).
   - Runtime flow steps: expand Phase 0 to mention log source types (LogChunks, Travis CI, BGL, HPC hardware).
   - Accuracy terms: add a note to "Accuracy delta" clarifying it is validation-only, never test data.
4. **Additional tooltips** — add `GuideTooltip` to terms not yet covered:
   - `split_group` — "A deduplication key. Cases sharing a split_group are assigned to the same data split to prevent near-duplicate leakage across train/val/test boundaries."
   - `notify_human` — "A high-impact action routed to a human operator. Protected by the stricter 2% regression tolerance."
   - `send_email` — "An escalation action that sends an email to the team. Protected by the stricter 2% regression tolerance."
   - `source=optimizer` — "Eval runs created by the optimizer are tagged source=optimizer to distinguish them from manual eval (source=db) and pool runs (source=pool)."
   - `confusion_matrix` / "confusion clusters" — "Per-action prediction counts for a round. Used by the optimizer LLM to identify which action types are being confused and why."
   - `held-out test` / `test snapshot` — "A fixed set of 400 cases (80/action) that is never shown to the optimizer during training or candidate selection. Only evaluated once after the loop finishes."

### Out of Scope
- URL-level i18n routing (no `/zh/guide`)
- Persistent language preference (no localStorage)
- Full Vue i18n library integration
- Any new page sections not already present

## Architecture Decision

### Pattern: inline bilingual object map
Rather than a separate i18n file or a full library, the data arrays in `<script setup>` will be extended so each string field becomes an object `{ en: string, zh: string }`. A `lang` ref (local) drives a computed helper `t(obj)` that returns `obj[lang.value]`.

```typescript
const lang = ref<'en' | 'zh'>('en')
function t(obj: { en: string; zh: string }): string {
  return obj[lang.value]
}
```

Data structures change from `string` to `{ en: string; zh: string }` for all user-visible text. Static interface types are updated accordingly. The template uses `t(item.label)`, `t(item.body)`, etc.

This is:
- Zero external dependencies
- Type-safe
- Easily extended per section
- Confined to a single file (guide.vue)

### Language toggle UI
A small two-button tab strip added immediately below `<AppTopBar>`, inside `<main class="arb-guide">`, before the hero section. Styling reuses existing `--border-subtle`, `--bg-1`, `--bg-3` tokens to match the optimizer page tab strip pattern.

### `GuideTooltip` contract (unchanged)
The existing `GuideTooltip` component takes a `text` prop. Tooltip text will NOT be translated in v1 (too much overhead); only EN tooltip text is provided. A follow-up can add bilingual tooltip text.

## Acceptance Criteria
See `tasks.md`.
