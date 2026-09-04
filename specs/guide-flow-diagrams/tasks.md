# Tasks: Guide Page — Auto Optimizer Flow Diagrams

## Feature ID
`guide-flow-diagrams`

Branch: `feat/guide-flow-diagrams`. Read `spec.md` first — the token map, porting rules
and bilingual strings there are normative. Source geometry: `docs/art/auto-optimizer-flow.html`
(do not modify that file).

Order matters: Tasks 1–2 create the shared pieces the diagrams depend on; Tasks 3–6 are
independent of each other; Task 7 wires the page; Task 8 adds tests; Task 9 verifies.

---

## Task 1 — Shared diagram stylesheet
**Files:** `assets/css/guide-diagrams.css` (new), `nuxt.config.ts`

Create the stylesheet with exactly the classes in the spec's token map (`.gd`, `.gd-title`,
`.gd-meta`, `.gd-label`, `.gd-label--focal`, `.gd-label--http`, `.gd-label--knockout`,
`.gd-legend`, `.gd-callout`, `.gd-node`, `.gd-node--store`, `.gd-node--focal`,
`.gd-node--ui`, `.gd-node--model`, `.gd-edge`, `.gd-edge--focal`, `.gd-edge--http`,
`.gd-marker`, `.gd-marker--focal`, `.gd-marker--http`, `.gd-rule`, `.gd-ribbon`,
`.gd-ribbon--focal`, `.gd-bar`, `.gd-lifeline`, `.gd-activation`, `.gd-fragment`).
Every colour value is a `var(--…)` from `design-tokens.css`; no hex/rgba literals.
Register it in `nuxt.config.ts` `css` immediately after `design-tokens.css`.

### AC
- [ ] AC-1.1: `assets/css/guide-diagrams.css` contains no `#[0-9a-f]` colour and no `rgb(`/`rgba(` literal (grep returns nothing).
- [ ] AC-1.2: `nuxt.config.ts` `css` array lists `~/assets/css/guide-diagrams.css` after `~/assets/css/design-tokens.css`.
- [ ] AC-1.3: Every selector in the file starts with `.gd`.

---

## Task 2 — `GuideFigure.vue` frame component
**File:** `components/guide/GuideFigure.vue` (new)

`<script setup lang="ts">` with `defineProps<{ eyebrow: string; title: string; caption?: string }>()`.
Template and scoped styles per spec ("GuideFigure.vue" section): `<figure class="gfig">`,
`<figcaption class="gfig__head">` (eyebrow, title, optional caption), `<div class="gfig__scroll">`
wrapping `<slot />`. `.gfig__scroll` is `overflow-x: auto`; `:deep(svg)` inside it is
`display:block; width:100%; min-width:900px; height:auto`.

### AC
- [ ] AC-2.1: Renders eyebrow, title and caption text from props; caption `<p>` is absent when the prop is omitted.
- [ ] AC-2.2: Slot content renders inside `.gfig__scroll`.
- [ ] AC-2.3: Styles use only design tokens (`--fg-*`, `--bg-*`, `--border-*`, `--r-*`, `--font-*`); no inline `style` attributes.

---

## Task 3 — `GuidePoolSankey.vue`
**File:** `components/guide/GuidePoolSankey.vue` (new)

Port `#pool-sankey` (source lines 171–235) following the spec's porting rules 1–9:
- `useId()` → `titleId`, `descId`; `<svg class="gd" viewBox="0 0 1000 792" role="img" :aria-labelledby="…">`.
- `<title>` "Eval pool split and optimizer snapshot usage" and `<desc>` verbatim.
- Drop the background rect. Ribbons → `gd-ribbon` / `gd-ribbon--focal`; bars → `gd-bar`;
  column headers + LEGEND → `gd-label`; 12px labels → `gd-title`; 9px mono → `gd-meta`;
  legend rule → `gd-rule`; legend text → `gd-legend`; legend swatches → `gd-ribbon` /
  `gd-ribbon--focal`; italic line → `gd-callout`.
- No `<defs>` content is needed (source has an empty `<defs>`; omit it).

### AC
- [ ] AC-3.1: One `svg[role="img"]` with `<title>` and `<desc>`; `aria-labelledby` resolves to both.
- [ ] AC-3.2: Numbers visible in the SVG: 12,000 · 2,400 per action · 7,200 · 60% · 2,400 · 20% (×2) · 200 · 40/action · 400 · 80/action · 4,200 · "600 of 12,000".
- [ ] AC-3.3: Component markup contains no `fill=`/`stroke=`/`font-family=` attribute with a literal colour or font, and no `<script`.

---

## Task 4 — `GuideRunFlowDiagram.vue`
**File:** `components/guide/GuideRunFlowDiagram.vue` (new)

Port `#run-flow` (source lines 274–360):
- viewBox `0 0 1000 656`; `<title>` "Optimizer run lifecycle"; `<desc>` verbatim.
- Markers `${uid}-arrow`, `${uid}-arrow-focal` (source `run-arrow-accent`); the source's
  unused `run-arrow-link` marker is dropped. Polygons → `gd-marker` / `gd-marker--focal`.
- Arrows → `gd-edge`; the DONE→test-set arrow → `gd-edge gd-edge--focal`; PERSIST dashed
  arrow keeps `stroke-dasharray="5,4"`.
- Delete node underlay rects/polygons and label knockout rects (DONE, PERSIST, NEXT ROUND);
  those three labels get `gd-label gd-label--knockout`.
- N1, N2, N3, N4 (polygon), N5 → `gd-node`; PostgreSQL box → `gd-node gd-node--store`;
  N6 operator gate → `gd-node gd-node--focal`. Legend swatches likewise.
- **Text change:** N6 meta line → `PATCH /config/prompts/{id}/activate`.

### AC
- [ ] AC-4.1: One `svg[role="img"]` with `<title>` "Optimizer run lifecycle" and a `<desc>`.
- [ ] AC-4.2: Text includes "Start optimizer run", "Snapshot val set + baseline eval", "Round N: candidate + gates", "Target reached or max rounds?", "Test-set acceptance", "Operator activation gate", `PATCH /config/prompts/{id}/activate`, "Fig. 3 → kept / rejected / skipped".
- [ ] AC-4.3: All `marker-end="url(#…)"` references resolve to `<marker>` ids inside the same svg; ids carry the `useId()` prefix.
- [ ] AC-4.4: No literal colours/fonts, no `<script` (as AC-3.3).

---

## Task 5 — `GuideRoundFlowDiagram.vue`
**File:** `components/guide/GuideRoundFlowDiagram.vue` (new)

Port `#round-flow` (source lines 372–474):
- viewBox `0 0 1000 792`; `<title>` "Optimizer round gates"; `<desc>` verbatim.
- Markers `${uid}-arrow`, `${uid}-arrow-focal`; drop unused `rnd-arrow-link`.
- PASS→Kept arrow → `gd-edge gd-edge--focal`; PASS label → `gd-label gd-label--focal gd-label--knockout`.
- Knockout labels: VALID, YES, PASS, INVALID, NO GAIN, REGRESSION → `gd-label--knockout`.
- N7 Kept → `gd-node gd-node--focal`; N8 Rejected, N9 Skipped, N1, N2, N4 and the three
  gate polygons → `gd-node`.

### AC
- [ ] AC-5.1: One `svg[role="img"]` with `<title>` "Optimizer round gates" and a `<desc>`.
- [ ] AC-5.2: Text includes "G0 · Candidate valid?", "G1 · Overall accuracy > best?", "G2 · Protected actions hold?", "Kept → new best prompt", "Rejected → previous best stays", "Skipped → nothing tested", "notify_human, send_email ±2% · trigger_* ±5%".
- [ ] AC-5.3: Marker references resolve; no literal colours/fonts; no `<script`.

---

## Task 6 — `GuideRunSequenceDiagram.vue`
**File:** `components/guide/GuideRunSequenceDiagram.vue` (new)

Port `#round-seq` (source lines 523–649):
- viewBox `0 0 1000 752`; `<title>` "Optimizer run message sequence"; `<desc>` verbatim.
- Markers `${uid}-arrow`, `${uid}-arrow-focal`, `${uid}-arrow-http` (all three are used).
- Lifelines → `gd-lifeline` (keep `stroke-dasharray="3,3"`); activation bars → `gd-activation`;
  LOOP frame rect and LOOP tag rect → `gd-fragment` (keep the tag rect — it is a framed box,
  not a knockout); LOOP text and guard text → `gd-label`.
- Messages: `POST /OPTIMIZER/RUN` line → `gd-edge gd-edge--http`, label → `gd-label gd-label--http gd-label--knockout`;
  `TEST_ACCURACY` line → `gd-edge gd-edge--focal`, label → `gd-label gd-label--focal gd-label--knockout`;
  all other message labels → `gd-label gd-label--knockout`; return arrows keep `stroke-dasharray="5,4"`.
- Actors: Operator UI → `gd-node gd-node--ui`; Optimizer task → `gd-node`; Optimizer LLM
  and Evaluator → `gd-node gd-node--model`; PostgreSQL → `gd-node gd-node--store`.

### AC
- [ ] AC-6.1: One `svg[role="img"]` with `<title>` "Optimizer run message sequence" and a `<desc>`.
- [ ] AC-6.2: Text includes the five actors "Operator UI", "Optimizer task", "Optimizer LLM", "Evaluator", "PostgreSQL", plus "POST /OPTIMIZER/RUN", "EVAL BASELINE · 200", "EVAL CANDIDATE · 200", "KEEP / REJECT GATES", "INSERT ROUND + FAILURES", "EVAL TEST · 400", "TEST_ACCURACY".
- [ ] AC-6.3: Marker references resolve; no literal colours/fonts; no `<script`.

---

## Task 7 — Wire the page
**Files:** `pages/guide.vue`, delete `components/guide/GuideSplitDiagram.vue`, delete `components/guide/GuideLoopDiagram.vue`

1. Add the 11 new `fig*` keys and re-word `loopEyebrow` / `loopHeading` / `loopDesc` in the
   `ui` computed exactly as tabulated in `spec.md` (en + zh).
2. Data split section: add `id="data-splits"`; replace `<GuideSplitDiagram />` with
   ```html
   <GuideFigure :eyebrow="ui.figPoolEyebrow" :title="ui.figPoolTitle" :caption="ui.figPoolCaption">
     <GuidePoolSankey />
   </GuideFigure>
   ```
3. Loop section: add `id="run-lifecycle"`; replace `<GuideLoopDiagram />` with a
   `GuideFigure` (figRun* strings) wrapping `<GuideRunFlowDiagram />`.
4. Gate section: add `id="gates"`; insert a `GuideFigure` (figRound* strings) wrapping
   `<GuideRoundFlowDiagram />` between `.arb-guide__section-head` and `.arb-guide__gate-grid`.
5. Runtime flow section: add `id="runtime-flow"`; insert a `GuideFigure` (figSeq* strings)
   wrapping `<GuideRunSequenceDiagram />` between `.arb-guide__section-head` and
   `.arb-guide__timeline`.
6. Delete the two obsolete components. No other section is modified.

### AC
- [ ] AC-7.1: `/guide` renders four figures in this order: Sankey (data splits) → run flowchart (run lifecycle) → round flowchart (gates) → sequence (runtime flow).
- [ ] AC-7.2: `GuideSplitDiagram.vue` and `GuideLoopDiagram.vue` no longer exist and `grep -rn "GuideSplitDiagram\|GuideLoopDiagram"` over `pages components tests` returns nothing.
- [ ] AC-7.3: The stale 10,400 / 800 / 800 numbers no longer appear anywhere on `/guide`; the Sankey and the stat cards both show 7,200 / 2,400 / 2,400.
- [ ] AC-7.4: Clicking 中文 switches every figure eyebrow, title and caption and the run-lifecycle heading/desc to the zh strings from the spec; SVG-internal labels stay English.
- [ ] AC-7.5: Gate section heading still reads "The two gates a candidate must pass" / 「候選提示必須通過的兩道閘」, and the Fig. 3 caption explains G0 → Skipped.
- [ ] AC-7.6: Sections carry `id="data-splits"`, `id="run-lifecycle"`, `id="gates"`, `id="runtime-flow"`.
- [ ] AC-7.7: All existing prose, gate cards, tolerance table, round-state cards, timeline, checkpoints, accuracy cards, persistence, operator links and API map are unchanged.

---

## Task 8 — Tests
**Files:** `tests/guideDiagrams.test.ts`, `tests/guideFigure.test.ts`, `tests/guidePage.test.ts` (all new)

Follow `tests/optimizerOverview.test.ts` style (`mount` from `@vue/test-utils`, relative
imports, `describe/it/expect` from vitest).

`guideDiagrams.test.ts` — iterate over
`[GuidePoolSankey, GuideRunFlowDiagram, GuideRoundFlowDiagram, GuideRunSequenceDiagram]`:
- exactly one `svg[role="img"]`;
- `title` and `desc` exist with non-empty text; `aria-labelledby` equals `"<titleId> <descId>"` and both ids exist in the svg;
- `wrapper.html()` does not match `/<script/i`, `/font-family=/`, `/#[0-9a-f]{3,8}\b/i`, `/rgba?\(/`;
- every `url(#X)` in the html has a matching `id="X"` on a `<marker>`;
- a wrapper component rendering the same diagram twice yields two different `<title>` ids.

`guideFigure.test.ts` — props render; caption omitted when absent; slot renders inside `.gfig__scroll`.

`guidePage.test.ts` — `vi.stubGlobal('ref', ref)`, `vi.stubGlobal('computed', computed)`,
`vi.stubGlobal('definePageMeta', () => undefined)` before importing the page; mount with
`global.stubs` for `AppTopBar`, `UiEyebrow`, `UiCard`, `NuxtLink`, `GuideTooltip`,
`GuideFigure` (`<figure><slot /></figure>`), and the four diagrams as
`<svg data-test="pool-sankey" />` etc. Assert:
- `#data-splits [data-test="pool-sankey"]`, `#run-lifecycle [data-test="run-flow"]`, `#gates [data-test="round-flow"]`, `#runtime-flow [data-test="run-seq"]` exist;
- no element matches `guidesplitdiagram, guideloopdiagram` (case-insensitive tag check on `html()`);
- after `await wrapper.findAll('.arb-guide__lang-tab')[1].trigger('click')`, the text contains 「一次 optimizer run 的骨幹」 and no longer contains "The backbone of one optimizer run".

### AC
- [ ] AC-8.1: `pnpm exec vitest run` passes with the three new files; existing tests still pass.
- [ ] AC-8.2: Each of the four diagram components is covered by the shared assertions above (no diagram left out).
- [ ] AC-8.3: The page test verifies placement by section id, not by DOM order alone.

---

## Task 9 — Verification (quality gates)
Run and fix until clean:
- `pnpm vue-tsc --noEmit`
- `pnpm lint`
- `pnpm exec vitest run`
- `pnpm dev` → open `/guide` in dark and light themes at ≥1120px and at 375px wide.

### AC
- [ ] AC-9.1: `pnpm vue-tsc --noEmit` exits 0 (no `any`, no `@ts-expect-error` added).
- [ ] AC-9.2: `pnpm lint` exits 0.
- [ ] AC-9.3: `pnpm exec vitest run` exits 0.
- [ ] AC-9.4: At 375px width the page body has no horizontal scrollbar; each figure scrolls horizontally inside its own frame.
- [ ] AC-9.5: In both themes every diagram is legible: node fills contrast with the frame, arrows and labels visible, knockout labels are not struck through by their arrow, focal elements (activation gate, Kept, PASS, TEST_ACCURACY, scored ribbons) use the amber `--warning` family.
- [ ] AC-9.6: `docs/art/auto-optimizer-flow.html` is unchanged (`git diff --stat -- docs/art` is empty).

---

## Developer completion
Produce `specs/guide-flow-diagrams/handoff-dev.json` (from "developer", to "qa",
`changed_files` complete including deletions, `ac_ref: "specs/guide-flow-diagrams/tasks.md"`)
and tell the orchestrator to spawn **codex-reviewer** (not QA).
