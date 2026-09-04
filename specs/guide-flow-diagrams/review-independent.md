# Independent Code Review — `guide-flow-diagrams`

**VERDICT: FAIL**

Reviewer: independent reviewer standing in for `codex-reviewer` (Codex CLI out of date, could not run).
Branch: `feat/guide-flow-diagrams` (work is present in the working tree, **uncommitted**).
Date: 2026-09-05.

One blocker in `GuideRunSequenceDiagram.vue` — a paint-order / opacity defect that hides the
lifelines inside the LOOP fragment and puts mismatched knockout halos on the six in-loop message
labels. It is a ~2-line CSS/markup fix. Everything else is good work: the ports are faithful to the
source geometry, the token mapping is disciplined, the tests are real tests (not smoke tests), and
the page wiring is minimal and surgical.

## Verification actually run

| Gate | Result |
|---|---|
| `pnpm exec vitest run` | **PASS** — 7 files / 87 tests (28 new). Reproduced. |
| `pnpm exec vue-tsc --noEmit` | **PASS** — exit 0, no errors. Reproduced. |
| `pnpm lint` | **CANNOT RUN** — no ESLint config file exists anywhere in the repo (`eslint . --fix` with ESLint 9 requires `eslint.config.js`). Pre-existing; not caused by this change; not counted against this review. |
| Visual (browser, 375px / ≥1120px, both themes) | **NOT INDEPENDENTLY RUN.** Findings below are derived from SVG painting semantics and token values, which are deterministic. |

---

## Findings

### BLOCKER

**B1 — Sequence diagram: the opaque LOOP fragment paints over all five lifelines, and the in-loop
label halos are the wrong colour.**

`components/guide/GuideRunSequenceDiagram.vue:35-45` and `assets/css/guide-diagrams.css:139-143`

The lifelines are emitted first (lines 35-39), then the loop frame rect (line 42):

```
35  <line class="gd-lifeline" x1="100" y1="88" x2="100" y2="688" stroke-dasharray="3,3" />
...
42  <rect class="gd-fragment" x="252" y="268" width="672" height="272" rx="4" />
```

`.gd-fragment` resolves to `fill: var(--bg-inset)` — `#080603` (dark) / `#ede2c0` (light), both
**fully opaque**. The source used `fill="rgba(45,49,66,0.02)"`, a 2% wash. SVG paints in document
order, so the frame now covers everything already drawn beneath it: the lifelines at x=300, 500,
700 and 900 all fall inside x 252-924, so every lifeline disappears between y=268 and y=540 — the
region the diagram exists to explain. The spec's token map (`spec.md:223`) mapped a 2%-alpha value
onto an opaque token; the porting rule that justified deleting node underlays ("node fills are
opaque tokens", `spec.md` porting rule 4) does not apply here in reverse.

Second-order effect from the same cause: `.gd-label--knockout` strokes with `var(--bg-1)`, which
matches `.gfig__scroll`'s background — but the six labels inside the fragment (`ANALYZE + GENERATE`,
`ANALYSIS + CANDIDATE`, `EVAL CANDIDATE · 200`, `ACC + PER-ACTION`, `KEEP / REJECT GATES`,
`INSERT ROUND + FAILURES`, lines 72/75/79/82/86/90) now sit on `--bg-inset`, so each gets a visibly
lighter `#1c1610` halo on a `#080603` panel in dark mode. Six mismatched rectangles across the busiest
part of the figure.

Suggested fix — split the class so the large frame stays a wash while the LOOP tag box stays opaque:

```css
/* assets/css/guide-diagrams.css */
.gd-fragment { fill: var(--bg-inset); stroke: var(--border); stroke-width: 1; }
.gd-fragment--frame { fill: var(--fg-3); fill-opacity: 0.04; }   /* wash, lifelines show through */
```

then `class="gd-fragment gd-fragment--frame"` on line 42 only (line 43's tag box and the line 131
legend swatch keep the opaque fill — the tag box *must* stay opaque to knock out the frame border
under it). Alternatively move line 42's `<rect>` above the lifelines, but that leaves the halo
mismatch unfixed, so the opacity change is the better fix. Add a regression assertion to
`tests/guideDiagrams.test.ts` that the frame rect does not carry a fully opaque fill class.

Note this also means the developer's stated visual verification ("headless Chrome, /guide, four
diagrams display correctly") did not catch a defect in the diagram they had just hand-edited.

### MAJOR

**M1 — 8px edge labels are mapped to `--fg-4`, which fails contrast in both themes.**

`assets/css/guide-diagrams.css:24-27`, applied at e.g.
`GuideRunFlowDiagram.vue:35,40,44`, `GuideRoundFlowDiagram.vue:34,37,39,43,46,49`,
`GuideRunSequenceDiagram.vue:44,45,58,61,65,68,72,75,79,82,86,90,94,97`.

`.gd-label { fill: var(--fg-4) }` on `--bg-1`:
- dark: `#5a4f3e` on `#1c1610` ≈ **2.2 : 1**
- light: `#b3a07d` on `#fffbf2` ≈ **2.5 : 1**

The source used `#7a8399` on `#f5f5f5` ≈ 3.5 : 1, so the port *reduced* contrast on the labels that
carry the branch semantics (`DONE`, `PERSIST`, `NEXT ROUND`, `VALID`, `YES`, `INVALID`, `NO GAIN`,
`REGRESSION`, and every sequence message). These render at 8/1000 of the SVG box — 7.2 px real at the
900px `min-width` floor. 2.2 : 1 at 7.2 px is not legible for many users and does not meet AC-9.5
("labels visible") in spirit.

This is spec-sanctioned (`spec.md:202` token map) so it is not the developer freelancing, but the
spec is wrong here. Suggested fix: `.gd-label { fill: var(--fg-3) }` (≈ 4.2 : 1 dark, ≈ 3.7 : 1
light) and leave `--fg-4` for the `LEGEND` / column-header text only, e.g. add
`.gd-label--muted { fill: var(--fg-4) }` for `EVAL POOL · TEST CASES`, `SPLIT · 60 / 20 / 20`,
`USED IN ONE OPTIMIZER RUN`, `LEGEND`. Requires an SA sign-off on the token-map change.

### MINOR

**m1 — `docs/art/auto-optimizer-flow.html` was modified in violation of the spec's own non-goal, and
AC-9.6 passes only vacuously.**

`spec.md:300` ("`docs/art/auto-optimizer-flow.html` is left untouched — it remains the geometry
source"); `tasks.md:208` AC-9.6 requires `git diff --stat -- docs/art` to be empty.
`handoff-dev.json:29` states the file *was* edited (LOOP frame `x=276 → 252`).

`git ls-files docs/art` returns nothing — the entire directory is **untracked**, so
`git diff -- docs/art` is empty no matter what was changed, and AC-9.6 cannot detect a violation.
The edit itself was correct (it fixes the LOOP tag / activation-bar overlap and the components match
the edited source), but the geometry source of truth changed with no review trail. Suggested fix:
either commit `docs/art/` so future diffs are meaningful, or record the deviation as an accepted
spec amendment; and rewrite AC-9.6 to compare against something actually tracked.

**m2 — The entire implementation is uncommitted.**

`git diff --stat main...HEAD` is empty; the only commit on the branch is `cb6e890` (SA specs).
All ten source files sit in the working tree as modified/untracked. CLAUDE.md §2 requires the work
to be committed on the feature branch before merge. Nothing to fix in the code — just commit it
(Conventional Commits, `feat:`).

**m3 — `aria-labelledby` concatenates the title and the description.**

`GuidePoolSankey.vue:15`, `GuideRunFlowDiagram.vue:17`, `GuideRoundFlowDiagram.vue:17`,
`GuideRunSequenceDiagram.vue:18`.

`:aria-labelledby="\`${titleId} ${descId}\`"` makes the ~50-word `<desc>` part of the accessible
*name*. Screen readers will read the whole paragraph as the image's name, with no description left
to skip to. The conventional pairing is `:aria-labelledby="titleId"` +
`:aria-describedby="descId"`. This came from the source file and the spec/tests mandate the combined
form (`tasks.md:172`), so changing it means changing `guideDiagrams.test.ts:57` too. Non-blocking,
but it is the one place the accessibility work is technically off.

### NIT

**n1 — Two test assertions are incidentally coupled to values they don't own.**

- `tests/guideDiagrams.test.ts:73` — `expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i)` also sees
  `url(#<uid>-arrow)`. It passes today only because Vue's `useId()` happens to emit `v-0`-style ids;
  an `idPrefix` config change or a hex-looking id would fail the suite for no real reason. Scope the
  regex to attribute values, e.g. `/(?:fill|stroke)="#/i`.
- `tests/guidePage.test.ts:71` — `expect(html).not.toMatch(/\b800\b/)` asserts over the whole
  1,568-line page. Any future copy that legitimately contains "800" breaks it. Narrow it to
  `#data-splits`.

**n2 — Pre-existing repo hygiene gaps surfaced by this review (not this change's fault, not counted
against it):** no ESLint config anywhere (so `pnpm lint` and AC-9.2 are dead), and no `husky` /
`lint-staged` in `package.json` despite CLAUDE.md §5 requiring pre-commit hooks. Worth a separate
chore ticket.

**n3 — Raw px values in `GuideFigure.vue`'s scoped styles** (`10px`, `4px`, `13px`, `14px`, `16px`,
`900px`, `font-weight: 620`) technically brush against CLAUDE.md §4 "禁止魔術數字". They mirror the
existing recipes in `pages/guide.vue` exactly (`.arb-guide__section-label`, `.arb-guide__heading`),
the repo has no spacing/type scale tokens, and it does not use Tailwind at all. No change requested.

---

## CLAUDE.md rule compliance

| Rule | Result | Evidence |
|---|---|---|
| `<script setup lang="ts">` only, no Options API | PASS | All five new SFCs open with `<script setup lang="ts">`; `GuidePoolSankey.vue:1`, `GuideFigure.vue:1`, etc. |
| Strict TS, no `any`, no bare `@ts-expect-error` | PASS | `pnpm exec vue-tsc --noEmit` exit 0; grep for `: any` / `as any` / `@ts-expect-error` over `components/guide/*.vue` + `tests/guide*.ts` returns nothing. `GuideFigure.vue:2-6` uses a typed `defineProps<{…}>()`. |
| No `console.log` | PASS | grep for `console.` over all changed files returns nothing. |
| No unsanitised `v-html` | PASS | No `v-html` in any changed file. All SVG text is literal template content; no props reach the SVGs (`spec.md` rule 9, honoured). |
| No hardcoded secrets | PASS | No credentials; no `runtimeConfig` touched. |
| No inline `style`, tokens over literals | PASS | `grep 'style='` over `components/guide/Guide*.vue` returns nothing; asserted in `guideDiagrams.test.ts:75` and `guideFigure.test.ts:36`. `guide-diagrams.css` contains zero hex/`rgb()`/`rgba()` literals. |
| Components PascalCase, composables `useX` | PASS | `GuideFigure`, `GuidePoolSankey`, `GuideRunFlowDiagram`, `GuideRoundFlowDiagram`, `GuideRunSequenceDiagram`. No new composables. |
| New feature ships with tests | PASS | 3 new files, 28 new tests. |
| Does not break existing functionality | PASS | The 59 pre-existing tests still pass; `pages/guide.vue` diff is additive apart from the three intentionally re-worded `loop*` keys and the two component swaps. |

### Theme-token coverage

Every token consumed by `guide-diagrams.css` and `GuideFigure.vue` —
`--font-sans`, `--font-mono`, `--fg-0`…`--fg-4`, `--bg-1`, `--bg-2`, `--bg-3`, `--bg-inset`,
`--border`, `--border-strong`, `--border-subtle`, `--warning`, `--warning-soft`, `--accent`,
`--accent-soft` — is defined in **both** the `:root, :root[data-theme='dark']` block
(`design-tokens.css:7-92`) and the `:root[data-theme='light']` block (`design-tokens.css:94-169`).
`--r-md` is theme-independent (`design-tokens.css:179`). No token resolves to `unset` in either
theme. **PASS.**

### Per-instance id uniqueness

Each diagram derives every id from `useId()` (`GuideRunSequenceDiagram.vue:4-9` etc.), and every
`url(#…)` is a bound expression off that uid (`:marker-end="\`url(#${arrowId})\`"`). No hardcoded
`id=` survives from the source (the source's `run-arrow` / `rnd-arrow` / `seq-arrow` prefixes are
gone). `guideDiagrams.test.ts:88-100` mounts each diagram twice and asserts both distinct `<title>`
ids and a duplicate-free marker id set; it passes for all four. No gradients or clipPaths exist in
any diagram, so markers are the complete set of intra-SVG references. **PASS.**

### Deleted-component cleanup

`grep -rn "GuideSplitDiagram\|GuideLoopDiagram" pages components tests composables stores server assets docs nuxt.config.ts` → **no hits** (only `specs/**`, which is documentation of the deletion).
Both files are staged-deleted in git status. No orphaned `ui` keys: `grep 'splitDiagram\|loopDiagram\|gsd__\|gld__' pages components tests` → nothing. The only `gsd__`/`gld__` CSS left in the tree is inside `.output/public/_nuxt/*.css`, a stale build artifact that is regenerated on the next build. **PASS.**

### Content accuracy against the rest of `/guide`

| Claim in the diagrams | Page's claim | Verdict |
|---|---|---|
| Pool 12,000, 2,400/action (`GuidePoolSankey.vue:49-50`) | `pages/guide.vue:78-79` `12,000` / "2,400 cases per action across five … action types" | consistent (5 × 2,400 = 12,000) |
| Train 7,200 · 60%, "never scored" (`:54,:62`) | `guide.vue:83-84` `7,200`, "60% of pool (1,440/action) — used for relabeling and curation, not optimizer scoring" | consistent |
| Val 2,400 · 20% (`:56`) | `guide.vue:88-89` `2,400`, "20% of pool (480/action)" | consistent |
| Test 2,400 · 20% (`:58`) | `guide.vue:93-94` `2,400`, "20% of pool (480/action)" | consistent |
| Val snapshot 200 · 40/action (`:64`) | `guide.vue:126,177,286,467` "200 fixed validation cases (40/action)" | consistent |
| Test snapshot 400 · 80/action (`:68`) | `guide.vue:153,310,686` "400 cases, 80 per action" | consistent |
| "Not drawn this run 4,200 · val 2,200 + test 2,000" (`:66`) | derived: (2,400−200) + (2,400−400) = 4,200 | arithmetic checks out |
| "600 of 12,000" / "Only 5% … ever scored" (`:76-77`) | 200 + 400 = 600; 600/12,000 = 5% | arithmetic checks out |
| `notify_human, send_email ±2% · trigger_* ±5%` (`GuideRoundFlowDiagram.vue:79`) | `guide.vue:182,237-241,304,553` — protected ±2%, `trigger_*` ±5% | consistent |
| G0 / G1 / G2, G0 → Skipped (`GuideRoundFlowDiagram.vue:63,73,78,93`) | heading still says "two gates" (`guide.vue:377` `gateHeading`), reconciled by `figRoundCaption` (`guide.vue:363`) | intentional per AC-7.5, reconciled in both languages |
| `PATCH /config/prompts/{id}/activate` (`GuideRunFlowDiagram.vue:79`) | matches the page's API map form; source said `PATCH /prompts/{id}/activate` | correction correctly applied |

No contradiction left on the page. The stale `10,400 / 800 / 800` split is gone repo-wide.

---

## AC-by-AC checklist

### Task 1 — shared stylesheet

| AC | Verdict | Evidence |
|---|---|---|
| AC-1.1 no hex / `rgb(` / `rgba(` | PASS | `grep '#[0-9a-fA-F]\{3\}\|rgb(\|rgba('` over `assets/css/guide-diagrams.css` → no matches |
| AC-1.2 registered after `design-tokens.css` | PASS | `nuxt.config.ts` `css: ['~/assets/css/design-tokens.css', '~/assets/css/guide-diagrams.css', …]` |
| AC-1.3 every selector starts `.gd` | PASS | all 26 rules in `guide-diagrams.css:9-143` are `.gd…`; no other selector present |

All 26 classes from the spec's token map exist: `.gd`, `-title`, `-meta`, `-label`,
`-label--focal/-http/-knockout`, `-legend`, `-callout`, `-node`, `-node--store/-focal/-ui/-model`,
`-edge`, `-edge--focal/-http`, `-marker`, `-marker--focal/-http`, `-rule`, `-ribbon`,
`-ribbon--focal`, `-bar`, `-lifeline`, `-activation`, `-fragment`.

### Task 2 — `GuideFigure.vue`

| AC | Verdict | Evidence |
|---|---|---|
| AC-2.1 renders eyebrow/title/caption, caption absent when omitted | PASS | `GuideFigure.vue:12-14` (`v-if="caption"`); `tests/guideFigure.test.ts:12-14, 23` |
| AC-2.2 slot inside `.gfig__scroll` | PASS | `GuideFigure.vue:16-18`; `tests/guideFigure.test.ts:33-35` |
| AC-2.3 tokens only, no inline styles | PASS | `GuideFigure.vue:38-73` uses `--fg-1/-3/-4`, `--font-mono`, `--border-subtle`, `--r-md`, `--bg-1`; `tests/guideFigure.test.ts:36` asserts no `style=` |

### Task 3 — `GuidePoolSankey.vue`

| AC | Verdict | Evidence |
|---|---|---|
| AC-3.1 one `svg[role="img"]` + title/desc + resolving `aria-labelledby` | PASS | `GuidePoolSankey.vue:10-18`; `tests/guideDiagrams.test.ts:40-60` |
| AC-3.2 all twelve numbers visible | PASS | `12,000 cases` `:49`, `2,400 per action` `:50`, `7,200 · 60%` `:54`, `2,400 · 20%` `:56,:58`, `200 · 40/action` `:64`, `400 · 80/action` `:68`, `4,200` `:66`, `600 of 12,000` `:76`; asserted `guideDiagrams.test.ts:18-21` |
| AC-3.3 no literal colour/font attrs, no `<script` | PASS | grep for `fill="#` / `stroke="#` / `font-family=` over `components/guide/Guide*.vue` → nothing; `guideDiagrams.test.ts:69-76` |

Porting fidelity spot-checked against `docs/art/auto-optimizer-flow.html:171-235`: all 6 ordinary
ribbons, 2 focal ribbons, 8 node bars and 18 text nodes match the source coordinates and strings
character-for-character; the `#f5f5f5` background rect and the empty `<defs>` are correctly dropped.

### Task 4 — `GuideRunFlowDiagram.vue`

| AC | Verdict | Evidence |
|---|---|---|
| AC-4.1 svg + title "Optimizer run lifecycle" + desc | PASS | `GuideRunFlowDiagram.vue:19-20`; `guideDiagrams.test.ts:12,50` |
| AC-4.2 eight required strings | PASS | `:48,:53,:58,:68,:73,:78,:79,:59`; asserted `guideDiagrams.test.ts:22-26` |
| AC-4.3 markers resolve, ids carry the `useId()` prefix | PASS | `:22-27` define `${uid}-arrow` / `${uid}-arrow-focal`; all six `marker-end` bindings reference them (`:31-34,:36,:39,:43,:92`); `guideDiagrams.test.ts:78-86` |
| AC-4.4 no literal colours/fonts, no `<script` | PASS | as AC-3.3 |

Compared against source `:274-360`: the unused `run-arrow-link` marker is dropped as specified, all
seven node underlay rects/polygons and the three knockout rects are removed, `stroke-dasharray="5,4"`
is preserved on the PERSIST arrow (`:39`) and the legend "Write" swatch (`:92`), and the N6 meta line
is the corrected `PATCH /config/prompts/{id}/activate`. Geometry is byte-identical to the source.

### Task 5 — `GuideRoundFlowDiagram.vue`

| AC | Verdict | Evidence |
|---|---|---|
| AC-5.1 svg + title "Optimizer round gates" + desc | PASS | `GuideRoundFlowDiagram.vue:19-20`; `guideDiagrams.test.ts:13` |
| AC-5.2 seven required strings | PASS | `:63,:73,:78,:83,:88,:93,:79`; asserted `guideDiagrams.test.ts:27-31` |
| AC-5.3 markers resolve, no literal colours/fonts, no `<script` | PASS | `:22-27`, refs at `:31-33,:35-36,:38,:42,:45,:48`; `guideDiagrams.test.ts:69-86` |

Knockout labels VALID / YES / PASS / INVALID / NO GAIN / REGRESSION all carry `gd-label--knockout`
(`:34,:37,:39,:43,:46,:49`); PASS additionally carries `gd-label--focal` and its arrow
`gd-edge--focal` (`:38-39`); N7 Kept is `gd-node--focal` (`:82`). Matches source `:372-474`.

### Task 6 — `GuideRunSequenceDiagram.vue`

| AC | Verdict | Evidence |
|---|---|---|
| AC-6.1 svg + title "Optimizer run message sequence" + desc | PASS | `GuideRunSequenceDiagram.vue:20-21`; `guideDiagrams.test.ts:14` |
| AC-6.2 five actors + seven message labels | PASS | actors `:101,:105,:109,:113,:117`; messages `:58,:65,:79,:86,:90,:94,:97`; asserted `guideDiagrams.test.ts:32-36` |
| AC-6.3 markers resolve, no literal colours/fonts, no `<script` | PASS | all three markers `:23-31` are used (`arrowHttpId` `:57,:127`; `arrowFocalId` `:96,:129`; `arrowId` elsewhere) |
| Loop fragment renders as a readable fragment | **FAIL — see B1** | `:42` opaque `.gd-fragment` fill hides the lifelines drawn at `:35-39` and mismatches the `--bg-1` knockout halos on `:72,:75,:79,:82,:86,:90` |

The developer's LOOP-frame fix (`x=276 → 252`) is correct: the tag box now occupies x 252-292 and the
Optimizer task activation bar x 296-304, so the "O" of LOOP is no longer occluded (`:42-44` vs `:49`).

### Task 7 — page wiring

| AC | Verdict | Evidence |
|---|---|---|
| AC-7.1 four figures in order Sankey → run → round → sequence | PASS | `pages/guide.vue:470,514,531,628`; `guidePage.test.ts:47-48` asserts the exact DOM order |
| AC-7.2 both components deleted, no references | PASS | both files deleted; repo-wide grep clean outside `specs/**`; `guidePage.test.ts:68-69` |
| AC-7.3 no stale 10,400 / 800 / 800 | PASS | `guidePage.test.ts:70-71`; grep for `10,400` / `10400` over `pages components tests docs` → nothing |
| AC-7.4 中文 switches every figure string + run-lifecycle heading; SVG labels stay English | PASS | `guide.vue:352-366` all eleven `fig*` keys plus the three re-worded `loop*` keys have en+zh; `guidePage.test.ts:81-102` asserts four zh eyebrows, three zh titles, both zh headings, and that the en string is gone. No `t()` reaches any SVG — the diagram components take no props. |
| AC-7.5 gate heading unchanged, caption explains G0 → Skipped | PASS | `guide.vue:377` unchanged; `guide.vue:363` `figRoundCaption`; `guidePage.test.ts:77-78` |
| AC-7.6 four section ids | PASS | `guide.vue:462,510,527,623`; `guidePage.test.ts:38-41` |
| AC-7.7 all other prose/cards/tables unchanged | PASS | `git diff pages/guide.vue` touches only: the three `loop*` re-wordings, the eleven added `fig*` keys, four `id=` attributes, and the four `<GuideFigure>` blocks. Nothing else. |

### Task 8 — tests

| AC | Verdict | Evidence |
|---|---|---|
| AC-8.1 vitest passes with the three new files, existing tests still green | PASS | reproduced: 7 files / 87 tests, 0 failures |
| AC-8.2 all four diagrams covered by the shared assertions | PASS | `guideDiagrams.test.ts:10-15` `describe.each` over all four × 5 shared tests = 20 |
| AC-8.3 placement asserted by section id, not DOM order alone | PASS | `guidePage.test.ts:38-41` uses `#data-splits [data-test=…]` descendant selectors; `:51-63` additionally checks intra-section sibling order |

### Task 9 — quality gates

| AC | Verdict | Evidence |
|---|---|---|
| AC-9.1 `vue-tsc --noEmit` exit 0, no `any` / new `@ts-expect-error` | PASS | reproduced, exit 0; grep clean |
| AC-9.2 `pnpm lint` exit 0 | **CANNOT VERIFY** | no ESLint config in the repo (pre-existing, see n2); not counted against this change |
| AC-9.3 `vitest run` exit 0 | PASS | reproduced |
| AC-9.4 no page-level horizontal scroll at 375px; each figure scrolls in its own frame | PASS (structural) | `GuideFigure.vue:59-73`: `.gfig` `min-width:0; max-width:100%`, `.gfig__scroll` `overflow-x:auto` with `border-box` sizing (`design-tokens.css:193-197`), `:deep(svg)` `width:100%; min-width:900px`. The 900px floor is confined to the scroll container's content box. Not verified in a browser. |
| AC-9.5 legible in both themes, focal elements amber | **FAIL** | B1 (lifelines hidden, halo mismatch inside the loop fragment) and M1 (2.2 : 1 / 2.5 : 1 edge labels). Focal mapping itself is correct: `--warning` / `--warning-soft` on `gd-*--focal` throughout. |
| AC-9.6 `git diff --stat -- docs/art` empty | PASS (vacuously) | `docs/art/` is untracked, so the check can never fail — see m1. The file *was* modified. |

---

## What to do next

Per CLAUDE.md §7, this goes back to **Developer**, not QA.

1. Fix **B1** (required). ~2 lines in `guide-diagrams.css` + 1 class on
   `GuideRunSequenceDiagram.vue:42`, plus a regression assertion.
2. Decide on **M1** with the SA — it is a spec-level token choice, not an implementation slip, but
   2.2 : 1 on 7.2 px text should not ship.
3. Commit the work on the branch (**m2**), and settle the `docs/art` tracking question (**m1**).
4. m3 / n1 / n2 / n3 are optional and can be deferred.

Re-run after the fix: `pnpm exec vitest run`, `pnpm exec vue-tsc --noEmit`, and a real browser pass
on `/guide` at 375px and ≥1120px in **both** themes — specifically looking at the sequence diagram's
loop fragment, which is where the defect is.
