# Independent Code Review #2 — `guide-flow-diagrams`

**VERDICT: PASS** (with 7 non-blocking findings)

Reviewer: independent reviewer standing in for `codex-reviewer` (Codex CLI out of date, could not run).
Branch: `feat/guide-flow-diagrams`. Date: 2026-09-05.
Supersedes: `specs/guide-flow-diagrams/review-independent.md` (FAIL — B1 blocker, M1 major).

Both previously-reported defects are genuinely fixed in the code, the fix is the one that was
suggested, and it introduces no new occlusion. Everything else in the change set re-verified clean.
Nothing remaining rises above MINOR.

## Gates re-run for this pass

| Gate | Result |
|---|---|
| `pnpm exec vitest run` | **PASS** — 7 files / 87 tests, all green. Reproduced. |
| `pnpm vue-tsc --noEmit` | **PASS** — exit 0, no diagnostics. Reproduced. |
| `pnpm lint` | **CANNOT RUN** — no ESLint config exists anywhere in the repo (`find` for `eslint.config.*` / `.eslintrc*` returns nothing; `eslint . --fix` under ESLint 9 requires a flat config). Pre-existing, not caused by this change, not counted against the review. |
| Visual, both themes | Supplied by the developer (headless Chrome against `localhost:3111/guide`, dark + light via CDP `data-theme`). Accepted as evidence per the review brief; the static paint-order audit below independently corroborates it. |

---

## 1. Verification that B1 and M1 are actually fixed

### B1 — RESOLVED

`assets/css/guide-diagrams.css:139-150`

```css
.gd-fragment      { fill: var(--bg-inset); stroke: var(--border); stroke-width: 1; }
.gd-fragment--frame { fill: var(--fg-3); fill-opacity: 0.04; }
```

`components/guide/GuideRunSequenceDiagram.vue:42`

```html
<rect class="gd-fragment gd-fragment--frame" x="252" y="268" width="672" height="272" rx="4" />
```

- The override is declared **after** `.gd-fragment` at equal specificity (0,1,0 each), so
  `fill` / `fill-opacity` win under the cascade. Correct, and not dependent on selector order in
  the compiled bundle since both live in the same file in this order.
- The frame is the **only** element carrying `--frame`. The LOOP tab rect (line 43) and the legend
  swatch (line 131) keep the opaque `.gd-fragment` — matching the fix that was requested.
- Second-order effect of B1 is fixed by the same change: the six in-loop `.gd-label--knockout`
  labels (lines 72/75/79/82/86/90) knock out with `var(--bg-1)`, and the surface behind them is now
  `--bg-1` plus a 4% wash instead of opaque `--bg-inset`. The halo mismatch is gone.

### No new occlusion introduced — full paint-order audit of `GuideRunSequenceDiagram.vue`

Document order and what each opaque element covers:

| Order | Element | Opaque? | Crosses a lifeline? |
|---|---|---|---|
| 35-39 | 5 lifelines, x = 100/300/500/700/900, y 88→688 | — | (the subject) |
| 42 | loop frame, x 252-924, y 268-540 | **no** — 4% wash | crosses x = 300/500/700/900, shows through |
| 43 | LOOP tab rect, x **252-292**, y 268-284 | yes | **no** — nearest lifeline is x = 300, clears it by 8 units |
| 48-54 | 7 activation bars, x ±4 around 96/296/496/696/896 | yes | yes, **by design** (standard sequence-diagram semantics) |
| 57-97 | message lines and labels | — | drawn on top, no fill regions |
| 100-118 | 5 actor boxes, y 40-88 | yes | **no** — lifelines start at y = 88, boxes end at y = 88 |
| 121-132 | legend, y 712-730 | yes | **no** — lifelines end at y = 688 |

Conclusion: the only opaque shapes painted after the lifelines are the activation bars (intended)
and the LOOP tab (clears x=300). All four interior lifelines are continuous through y 268-540. The
developer's screenshots and this audit agree.

The `x=276 → 252` geometry nudge is also self-consistent: right edge stays at 924 (252 + 672 =
276 + 648), the tab's `LOOP` text at `x=272` anchor-middle occupies roughly x 260-284 inside the
252-292 box, and the tab no longer collides with the Optimizer-task activation bar at x 296-304.

### M1 — RESOLVED (materially; small residual, see m2 below)

`assets/css/guide-diagrams.css:24-27` — `.gd-label { fill: var(--fg-3); font-family: var(--font-mono) }`.

Recomputed WCAG contrast against `--bg-1` (the `.gfig__scroll` background):

| | before (`--fg-4`) | after (`--fg-3`) |
|---|---|---|
| dark `#1c1610` | `#5a4f3e` → 2.24 : 1 | `#8a7c63` → **4.39 : 1** |
| light `#fffbf2` | `#b3a07d` → 2.53 : 1 | `#8a7a5a` → **4.06 : 1** |

Roughly a 2× improvement in both themes and now above the 3 : 1 non-text/large threshold in both.
It lands just under the 4.5 : 1 small-text bar at the ~7.2-8.8 px effective render size; that
residue is logged as m2, non-blocking.

The `LOOP` label sits on the opaque `--bg-inset` tab rather than `--bg-1`: 4.95 : 1 (dark),
3.24 : 1 (light). Acceptable.

---

## 2. CLAUDE.md rule compliance (re-verified)

| Rule | Result | Evidence |
|---|---|---|
| `<script setup lang="ts">` only, no Options API | PASS | All 5 new SFCs open with it; no `defineComponent` in `components/`. |
| Strict TS, no `any`, no added `@ts-expect-error` | PASS | `pnpm vue-tsc --noEmit` exit 0; grep for `any` / `@ts-expect-error` over the changed files returns nothing. `GuideFigure.vue:2-6` uses typed `defineProps<{…}>()`. |
| No `console.*` | PASS | grep over `components/guide/*.vue`, `assets/css/guide-diagrams.css`, `tests/guide*.test.ts` — no hits. |
| No `v-html` | PASS | No hits. No props reach any SVG; all SVG text is literal template content. |
| No inline `style` | PASS | grep for `style=` in the changed components returns nothing; asserted by `guideDiagrams.test.ts:75` and `guideFigure.test.ts:36`. |
| No hardcoded colours/fonts in the SVGs | PASS | `grep -E "#[0-9a-fA-F]{3,8}\|rgba?\("` over `guide-diagrams.css` → no hits. `guideDiagrams.test.ts:69-76` asserts no `font-family=`, no hex, no `rgb(a)`, no `<script`, no `style=` in each rendered component. |
| Every colour a design token | PASS | 18 distinct tokens used; all defined in **both** the dark block (`design-tokens.css:7-92`) and the light block (`design-tokens.css:94-169`). `--r-md` is theme-independent. Nothing resolves to `unset`. |
| PascalCase components | PASS | `GuideFigure`, `GuidePoolSankey`, `GuideRunFlowDiagram`, `GuideRoundFlowDiagram`, `GuideRunSequenceDiagram`. |
| New feature ships with tests | PASS | 3 new files, 28 new tests. |
| Existing behaviour unaffected | PASS | 59 pre-existing tests still green; `pages/guide.vue` diff is purely additive apart from the three spec-mandated `loop*` rewordings and the two component swaps. |

---

## 3. Accessibility of each SVG

| Check | Sankey | Run flow | Round flow | Sequence |
|---|---|---|---|---|
| `role="img"` | ✓ :10-16 | ✓ :12-18 | ✓ :12-18 | ✓ :13-19 |
| `<title>` is the first child of `<svg>` | ✓ :17 | ✓ :19 | ✓ :19 | ✓ :20 |
| `<desc>` present, non-empty | ✓ :18 | ✓ :20 | ✓ :20 | ✓ :21 |
| `aria-labelledby` lists both ids, both resolve | ✓ | ✓ | ✓ | ✓ |
| Ids unique per instance (`useId()`) | ✓ | ✓ | ✓ | ✓ |
| No hardcoded id survives from the source | ✓ | ✓ (`run-arrow*` gone) | ✓ (`rnd-arrow*` gone) | ✓ (`seq-arrow*` gone) |

Markers are the complete set of intra-SVG references (no gradients, clipPaths, patterns or filters
exist in any of the four), so `guideDiagrams.test.ts:78-86` fully covers reference resolution.
`guideDiagrams.test.ts:88-100` mounts each diagram twice and asserts distinct `<title>` ids and a
duplicate-free marker-id set — all four pass.

One residual: `aria-labelledby` still concatenates title + desc, so the ~50-word description becomes
part of the accessible *name*. Carried forward as m3 (spec- and test-mandated; unchanged from the
previous pass).

---

## 4. Do the tests assert what they claim? Are the ACs met?

The tests are real assertions, not smoke tests: `guideDiagrams.test.ts` checks title text equality,
`aria-labelledby` string equality against the actual rendered ids, presence of 8-12 specific content
strings per diagram, the four negative markup patterns, marker-reference resolution, and
double-instance id uniqueness. `guidePage.test.ts` verifies placement via section id **and** child
ordering inside `#gates` / `#runtime-flow`, the absence of the retired components, the preserved
two-gate heading, and a real language toggle (`trigger('click')` then re-reading text and the four
eyebrows). `guideFigure.test.ts` covers all three of AC-2.1/2.2/2.3.

| AC | Status | Note |
|---|---|---|
| 1.1 / 1.2 / 1.3 | PASS | Zero hex/rgb in the CSS; `nuxt.config.ts:35` sits immediately after `design-tokens.css`; all 28 selectors start with `.gd`. |
| 2.1 / 2.2 / 2.3 | PASS | `guideFigure.test.ts`; scoped styles use only `--fg-*`, `--bg-1`, `--border-subtle`, `--r-md`, `--font-mono`. |
| 3.1 / 3.2 / 3.3 | PASS | All 12 required numbers present and asserted. |
| 4.1 / 4.2 / 4.3 / 4.4 | PASS | Including the corrected `PATCH /config/prompts/{id}/activate`. |
| 5.1 / 5.2 / 5.3 | PASS | |
| 6.1 / 6.2 / 6.3 | PASS | |
| 7.1 - 7.7 | PASS | `grep -rn "GuideSplitDiagram\|GuideLoopDiagram" pages components tests` → no hits; both files deleted (git status `D`); `10,400` gone from `pages/` and `components/`; gate heading preserved; all four section ids present; no prose removed. |
| 8.1 / 8.2 / 8.3 | PASS | 87/87; all four diagrams in the `describe.each`; placement asserted by section id. |
| 9.1 | PASS | vue-tsc exit 0. |
| 9.2 | **BLOCKED (pre-existing)** | No ESLint config in the repo — see m6. |
| 9.3 | PASS | |
| 9.4 / 9.5 | PASS (visual evidence supplied) | `.gfig` sets `min-width: 0; max-width: 100%` and `.gfig__scroll` is `overflow-x: auto`, so the 900px `min-width` on the SVG is contained inside the figure and cannot widen `.arb-guide` (`width: min(1120px, 100%)`). |
| 9.6 | PASS **vacuously** | `docs/art/` is untracked, so the git-diff test can never fail — see m5. |

---

## 5. Diagram content vs. the facts in `pages/guide.vue`

The Sankey is internally consistent at exactly **k = 0.04 px per case**, and every quantity matches
the page:

| Sankey element | px | implied cases | `pages/guide.vue` |
|---|---|---|---|
| Pool bar `:38` y 148-628 | 480 | 12,000 | `:78` 12,000, `:79` 2,400/action × 5 actions ✓ |
| Train bar `:39` | 288 | 7,200 | `:83-84` 7,200 = 60% ✓ |
| Validation bar `:40` | 96 | 2,400 | `:88-89` 2,400 = 20% ✓ |
| Test bar `:41` | 96 | 2,400 | `:93-94` 2,400 = 20% ✓ |
| Relabel/review `:42` | 288 | 7,200 | "used for relabeling and curation, not optimizer scoring" ✓ |
| Val snapshot `:43` | 8 | 200 | `:89`, `:126`, `:286` 200 cases = 40/action ✓ |
| Not drawn `:44` | 168 | 4,200 | 2,200 val + 2,000 test = 4,200 ✓ (label `:66` states the same decomposition) |
| Test snapshot `:45` | 16 | 400 | `:94`, `:153`, `:310` 400 cases = 80/action ✓ |
| "600 of 12,000" `:76` | — | 200 + 400 | ✓ |
| "Only 5% of the pool is ever scored" `:77` | — | 600/12,000 | ✓ |

Every col-1→col-2 and col-2→col-3 ribbon band height matches its endpoint bars exactly. No stale
10,400 / 800 / 800 numbers survive anywhere.

Other cross-checks:
- `GuideRoundFlowDiagram.vue:79` `notify_human, send_email ±2% · trigger_* ±5%` matches
  `pages/guide.vue:237-241` (notify_human, send_email = ±2%; trigger_rebuild/fallback/restart = ±5%).
- `GuideRoundFlowDiagram.vue:94` "skip_reason · retried once first" matches `pages/guide.vue:264`
  ("The backend retries once before recording a skip").
- `GuideRunFlowDiagram.vue:79` `PATCH /config/prompts/{id}/activate` matches the API map at
  `pages/guide.vue:339` (the source file's `PATCH /prompts/{id}/activate` was correctly amended).
- Sequence: baseline eval (y 196-236) is *outside* the loop frame (268-540), candidate eval / gates /
  persist are *inside*, `EVAL TEST · 400` (y 580) is *after* the loop — matching the page's Phase
  timeline and "evaluated once after the loop ends".

No factual error found in any diagram.

---

## 6. Remaining findings — all MINOR, none blocking

**m1 — Fig. 4 legend swatch no longer depicts the thing it labels.**
`GuideRunSequenceDiagram.vue:131-132` — the "Loop fragment (one round)" swatch keeps opaque
`.gd-fragment` (`--bg-inset`), while the actual loop frame is now a 4% `--fg-3` wash. In dark theme
the swatch reads near-black while the frame it stands for reads as a faint lightening. Keeping the
swatch opaque was the right call for a 16×10 px chip (a 4% fill would be invisible), so this is a
cosmetic mismatch, not a defect. Optional fix: give the swatch a stronger `--frame`-flavoured fill,
or drop the swatch's fill entirely and let the stroke carry it.

**m2 — Residual small-text contrast on `.gd-label` / `.gd-meta`.**
`guide-diagrams.css:19-27` — `--fg-3` yields 4.39 : 1 (dark) / 4.06 : 1 (light) at an effective
7.2-8.8 px, just under the 4.5 : 1 WCAG AA small-text bar. Big improvement over 2.2 : 1 and above the
3 : 1 graphical threshold; accept as-is, or bump `.gd-label`/`.gd-meta` to `--fg-2`
(`#b8a888` / `#6e5d3c` → ~8.3 : 1 dark, ~6.4 : 1 light) if strict AA is wanted.

**m3 — `.gd-label--focal` is low-contrast in the light theme only.**
`guide-diagrams.css:29-31` — `--warning` light `#ca8a04` on `--bg-1` `#fffbf2` ≈ **2.85 : 1**
(dark is 9.34 : 1). Affects the `PASS` label (`GuideRoundFlowDiagram.vue:39`) and `TEST_ACCURACY`
(`GuideRunSequenceDiagram.vue:97`). Mitigated by the knockout halo, the amber arrow, and the fact
that both target nodes are separately labelled in full. Fix if desired: a dedicated
`--warning-text` token, or use `--warning` only for strokes/fills and `--fg-1` for the focal text.

**m4 — `aria-labelledby` concatenates `<title>` + `<desc>`** (carried over from review #1, unchanged).
All four diagrams. Makes the 50-word description part of the accessible *name*. Conventional pairing
is `aria-labelledby={titleId}` + `aria-describedby={descId}`. Spec- and test-mandated
(`tasks.md:172`), so changing it needs an SA amendment plus `guideDiagrams.test.ts:57`.

**m5 — Spec drift not yet recorded in the spec.**
(a) `.gd-fragment--frame` is not in the spec's normative token map (`spec.md:223`), and Task 1's AC
says the stylesheet contains "exactly the classes in the spec's token map"; the class is correct and
necessary, but `spec.md` / `tasks.md` should be amended before archiving so the archived spec matches
the shipped code. (b) `docs/art/auto-optimizer-flow.html` was edited (per `handoff-dev.json:29`)
despite `spec.md:300` listing it as a non-goal; the directory is untracked so AC-9.6 passes
vacuously. The edit itself was correct — record it as an accepted deviation, and either commit
`docs/art/` or rewrite AC-9.6 against something tracked.

**m6 — `pnpm lint` / AC-9.2 are dead (pre-existing, not this change).**
No `eslint.config.*` or `.eslintrc*` anywhere in the repo, and no `husky` / `lint-staged` in
`package.json` despite CLAUDE.md §5. Separate chore ticket.

**m7 — Two brittle test assertions (carried over, nit-level).**
`guideDiagrams.test.ts:73` `/#[0-9a-f]{3,8}\b/i` also inspects `url(#<uid>-arrow)`; it passes only
because Vue's `useId()` emits `v-N`. Scope it to `/(?:fill|stroke)="#/i`.
`guidePage.test.ts:71` `/\b800\b/` scans the whole 1,568-line page; narrow it to `#data-splits`.

**Housekeeping (not a code finding):** the implementation is still entirely uncommitted —
`git diff --stat main...HEAD` is empty and all thirteen files sit in the working tree. Commit on the
feature branch (Conventional Commits, `feat:`) before merge.

---

## Verdict

**PASS.** B1 and M1 are genuinely fixed in the code, the fix matches what was requested, and the
paint-order audit confirms no new occlusion — including that the legend swatch and LOOP tab
correctly kept the opaque class while only the lifeline-spanning frame became translucent. Project
rules, SVG accessibility, test quality and diagram-vs-page factual accuracy all re-verify clean.
The seven remaining items are MINOR and may be handled as follow-ups. Clear to proceed to QA.
