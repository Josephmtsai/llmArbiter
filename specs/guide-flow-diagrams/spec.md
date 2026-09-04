# Spec: Guide Page — Auto Optimizer Flow Diagrams

## Feature ID
`guide-flow-diagrams`

Branch: `feat/guide-flow-diagrams` (already checked out).

## Summary
Move the four inline-SVG diagrams drawn in `docs/art/auto-optimizer-flow.html` onto the
"How it works" page (`pages/guide.vue`, route `/guide`) as Vue SFC components, placing each
one in the section whose prose it explains. Diagrams are re-skinned onto the app's design
tokens (dark/light aware, Inter / JetBrains Mono), wrapped in a bilingual figure frame that
scrolls horizontally on narrow viewports, and covered by Vitest tests.

User request (verbatim): 「可以另開 branch 然後 sa 把剛剛的流程圖這三個放到 how it works
頁面在找地方放 比用說明清楚」— the diagrams explain the flow better than prose, so put them
where the prose currently does that job.

## Source material analysis

`docs/art/auto-optimizer-flow.html` contains **four** `<svg>` blocks of **three** diagram
types (the user's 「三個」 = three types; all four are placed — see Assumption A1 in
`handoff-sa.json`):

| id (source) | Type | viewBox | Subject |
|---|---|---|---|
| `pool-sankey` | Sankey | 1000 × 792 | 12,000-case pool → 60/20/20 split → what one run scores (200 val snapshot, 400 test snapshot) |
| `run-flow` | Flowchart (run level) | 1000 × 656 | `POST /optimizer/run` → snapshot + baseline → round loop → exit check → test acceptance → operator activation gate |
| `round-flow` | Flowchart (round level) | 1000 × 792 | Optimizer LLM analyze+generate → G0 structural check → evaluate → G1 → G2 → Kept / Rejected / Skipped |
| `round-seq` | Sequence | 1000 × 752 | Operator UI · Optimizer task · Optimizer LLM · Evaluator · PostgreSQL, loop fragment per round, final `test_accuracy` |

Each SVG already carries `role="img"`, `aria-labelledby`, `<title>`, `<desc>`, prefixed
marker ids (`run-arrow*`, `rnd-arrow*`, `seq-arrow*`), and no scripts. All colours, fonts
and a full-bleed `#f5f5f5` background rect are hard-coded — that is the part that must
change.

### Findings on the current page that affect placement

1. **`components/guide/GuideSplitDiagram.vue` is stale.** It still renders Train 10,400 /
   Val 800 / Test 800, while commit `ea6c1b5` ("fix: correct eval pool split numbers")
   updated only `pages/guide.vue` (7,200 / 2,400 / 2,400). The page currently shows
   contradictory numbers inside the same section. The Sankey carries the correct numbers
   and a superset of the information (it also shows the 200 / 400 snapshots and the
   "never scored" train share), so it **replaces** `GuideSplitDiagram`.
2. **`components/guide/GuideLoopDiagram.vue`** is an English-only HTML/CSS pseudo-diagram
   that mixes run level (snapshot, baseline, final test) and round level (gates, skip
   branch). `run-flow` + `round-flow` cover the same content at the correct granularity,
   with real flowchart semantics. Keeping it next to `run-flow` would show the same flow
   twice in one section, so it is **replaced** by `run-flow`. Its one fact not present in
   the SVG ("if baseline already meets the target the loop ends with no candidate rounds")
   is moved into the section's bilingual figure caption.
3. The gate section heading says "two gates"; `round-flow` labels three (G0 / G1 / G2). The
   page already treats a structurally invalid candidate as **Skipped** (not Rejected). The
   figure caption makes that reconciliation explicit; the heading is unchanged.
4. Endpoint naming: `run-flow` says `PATCH /prompts/{id}/activate`; the page's API map says
   `PATCH /config/prompts/{id}/activate`. The SVG text is corrected to the page's form.
5. The page has no serif font and does not load Geist. The app loads Inter + JetBrains Mono
   via `nuxt.config.ts` `app.head.link`. No new font links are added.
6. Theme: `<html data-theme="dark|light">` driven by `composables/useTheme.ts`; tokens live
   in `assets/css/design-tokens.css`. The guide page's "important" colour is amber
   (`rgba(245,158,11,…)` / `--warning`), which is the natural home for the source's coral
   accent.

## Placement table

Section names refer to the `<!-- ── … -->` comments in `pages/guide.vue`. Figure numbers
follow page order and match the source file's Fig. 1–4, so the in-SVG cross-reference
"Fig. 3 → kept / rejected / skipped" (run-flow node N3) stays valid.

| Fig. | Diagram | Component | Section (existing) | Exact position | Replaces / rationale |
|---|---|---|---|---|---|
| 1 | `pool-sankey` | `GuidePoolSankey` | **Data split diagram** (`ui.dataSplitsHeading`) | Where `<GuideSplitDiagram />` is now (after `.arb-guide__section-head`) | **Replaces `<GuideSplitDiagram />`** (stale numbers, Finding 1). The section description stays — it explains split_group and the two snapshots, which the Sankey visualises. |
| 2 | `run-flow` | `GuideRunFlowDiagram` | **Loop diagram** (`ui.loopHeading`, eyebrow "Optimizer loop") | Where `<GuideLoopDiagram />` is now | **Replaces `<GuideLoopDiagram />`** (Finding 2). Section heading/desc re-worded to run level (strings below). Precedes the gate section, which drills into one round. |
| 3 | `round-flow` | `GuideRoundFlowDiagram` | **Keep/Reject Gate section** (`ui.gateHeading`) | Between `.arb-guide__section-head` and `.arb-guide__gate-grid` | Precedes the two gate cards; the cards remain as the formula + worked-example detail for G1/G2. Caption reconciles G0 = pre-scoring structural check → Skipped. No prose removed. |
| 4 | `round-seq` | `GuideRunSequenceDiagram` | **Runtime flow (timeline)** (`ui.runtimeHeading`) | Between `.arb-guide__section-head` and `.arb-guide__timeline` | Precedes the Phase 0–5 timeline: the timeline's `meta` lines (`POST /optimizer/run`, `POST /evaluate`, optimizer model, `optimizer_rounds`, `snapshot_test_set()`) are exactly the actors/messages in the sequence. No prose removed. |

Sections not touched: hero, stats, flow lanes (`visualLanes` — bilingual and covers pool
preparation, which no SVG covers), round states, checkpoints, accuracy, persistence,
operator, API.

### Explicit removals
- `components/guide/GuideSplitDiagram.vue` — delete (only reference is `pages/guide.vue:458`).
- `components/guide/GuideLoopDiagram.vue` — delete (only reference is `pages/guide.vue:502`).
- No test references either file (verified via grep on `tests/`).

## Component design

All new files under `components/guide/`, `<script setup lang="ts">`, no `v-html`, no
`<iframe>`, no `<script>` inside SVG, no `console.log`, no `any`.

### `GuideFigure.vue` (frame, shared by all four)

```ts
defineProps<{
  eyebrow: string   // e.g. "Fig. 1 · Sankey" — already localised by the page
  title: string     // localised figure title
  caption?: string  // localised one-paragraph explanation
}>()
```

Template shape:

```html
<figure class="gfig">
  <figcaption class="gfig__head">
    <span class="gfig__eyebrow">{{ eyebrow }}</span>
    <strong class="gfig__title">{{ title }}</strong>
    <p v-if="caption" class="gfig__caption">{{ caption }}</p>
  </figcaption>
  <div class="gfig__scroll"><slot /></div>
</figure>
```

Scoped styles (tokens only, no magic colours):
- `.gfig` — `display:flex; flex-direction:column; gap:10px; min-width:0; max-width:100%; margin:0`.
- `.gfig__head` — flex column, gap 4px.
- `.gfig__eyebrow` — same recipe as `.arb-guide__section-label` (mono, 10px, uppercase,
  `--fg-4`, letter-spacing 0.05em).
- `.gfig__title` — `--fg-1`, 14px, weight 620. `.gfig__caption` — `--fg-3`, 13px, lh 1.6, margin 0.
- `.gfig__scroll` — `overflow-x:auto; overflow-y:hidden; border:1px solid var(--border-subtle);
  border-radius:var(--r-md); background:var(--bg-1); padding:16px`.
- `.gfig__scroll :deep(svg)` — `display:block; width:100%; min-width:900px; height:auto`.
  (900px keeps 8-unit labels ≥ 7.2px real; narrower viewports scroll the figure, never
  the page.)

### Diagram components

| Component | Source svg id | viewBox |
|---|---|---|
| `GuidePoolSankey.vue` | `pool-sankey` | `0 0 1000 792` |
| `GuideRunFlowDiagram.vue` | `run-flow` | `0 0 1000 656` |
| `GuideRoundFlowDiagram.vue` | `round-flow` | `0 0 1000 792` |
| `GuideRunSequenceDiagram.vue` | `round-seq` | `0 0 1000 752` |

Each component:

```ts
const uid = useId()                       // Vue 3.5, SSR-safe, Nuxt auto-import
const titleId = `${uid}-title`
const descId = `${uid}-desc`
// markers: `${uid}-arrow`, `${uid}-arrow-focal`, `${uid}-arrow-http`
```

```html
<svg
  class="gd"
  viewBox="0 0 1000 656"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  :aria-labelledby="`${titleId} ${descId}`"
>
  <title :id="titleId">Optimizer run lifecycle</title>
  <desc :id="descId">…verbatim from source…</desc>
  <defs>
    <marker :id="`${uid}-arrow`" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon class="gd-marker" points="0 0, 8 3, 0 6" />
    </marker>
    …
  </defs>
  <line … class="gd-edge" :marker-end="`url(#${uid}-arrow)`" />
</svg>
```

Rules for porting the markup (apply to all four):
1. Keep every coordinate, `points`, `d`, `x/y/width/height/rx`, `text-anchor`, `font-size`,
   `font-weight`, `letter-spacing`, `stroke-dasharray` exactly as in the source.
2. Remove **all** `fill`, `stroke`, `font-family`, `font-style` attributes and replace them
   with the classes in the token map below.
3. Remove the full-bleed background `<rect width="100%" height="100%" fill="#f5f5f5"/>`
   (the `GuideFigure` frame supplies the background).
4. Remove the "underlay" rect/polygon that the source draws beneath every node (the first
   of each pair of identical shapes, `fill="#f5f5f5"`); node fills are opaque tokens so the
   underlay is redundant.
5. Replace each label "knockout" rect (`<rect … fill="#f5f5f5"/>` placed behind an edge
   label such as DONE / PERSIST / NEXT ROUND / VALID / YES / PASS / INVALID / NO GAIN /
   REGRESSION / every sequence message label / the LOOP tag) by deleting the rect and adding
   `gd-label--knockout` to the `<text>` it protected. The class uses `paint-order: stroke`
   with a `--bg-1` stroke, so legibility no longer depends on Geist-vs-Inter glyph widths.
   Exception: the LOOP tag rect in the sequence diagram is a framed box, keep it as
   `class="gd-fragment"`.
6. Marker ids and `url(#…)` references use the `useId()` prefix (unique per instance).
7. `<title>` / `<desc>` text is copied verbatim from the source (English).
8. Text edits to source content: in `GuideRunFlowDiagram`, N6 meta line becomes
   `PATCH /config/prompts/{id}/activate`. Everything else verbatim.
9. No props on the diagram components. The page passes bilingual copy to `GuideFigure`,
   not to the SVG.

### Token map (shared stylesheet `assets/css/guide-diagrams.css`)

Registered in `nuxt.config.ts` →
`css: ['~/assets/css/design-tokens.css', '~/assets/css/guide-diagrams.css', …]`.
Rationale: four SFCs would otherwise duplicate the same ~60 lines (CLAUDE.md §4 "three
similar → extract"); scoped styles cannot reach slotted SVG descendants without `:deep()`;
a second global token-consumer file mirrors the existing `design-tokens.css` pattern. All
selectors are prefixed `gd-` and touch nothing outside the diagrams.

| Class | Applies to | Source value | Token rule |
|---|---|---|---|
| `.gd` | `<svg>` | — | `font-family: var(--font-sans); overflow: visible` |
| `.gd-title` | 12px node/actor titles, column labels "Train/Validation/Test", "Eval pool", column-3 labels | `#2d3142` Geist 600 | `fill: var(--fg-0)` |
| `.gd-meta` | 9px mono sub-lines under titles | `#4f5d75` Geist Mono | `fill: var(--fg-3); font-family: var(--font-mono)` |
| `.gd-label` | 8px mono uppercase (column headers, LEGEND, edge labels, sequence messages, loop guard) | `#4f5d75` / `#7a8399` Geist Mono | `fill: var(--fg-4); font-family: var(--font-mono)` |
| `.gd-label--focal` | PASS, TEST_ACCURACY | `#eb6c36` | `fill: var(--warning)` |
| `.gd-label--http` | POST /OPTIMIZER/RUN | `#2e5aa8` | `fill: var(--accent)` |
| `.gd-label--knockout` | any edge label that had a knockout rect | rect `#f5f5f5` | `paint-order: stroke; stroke: var(--bg-1); stroke-width: 4px; stroke-linejoin: round` |
| `.gd-legend` | 9px legend text | `#4f5d75` Geist | `fill: var(--fg-3)` |
| `.gd-callout` | Sankey italic serif line | Instrument Serif italic 14px | `fill: var(--fg-2); font-style: italic` (sans; the app has no serif) |
| `.gd-node` | step rects, decision polygons, start/end pills, legend swatches | `#ffffff` / stroke `#2d3142` | `fill: var(--bg-2); stroke: var(--border-strong); stroke-width: 1` |
| `.gd-node--store` | PostgreSQL box, "Persisted state" swatch, sequence PostgreSQL actor | `rgba(45,49,66,.05)` / `#4f5d75` | `fill: var(--bg-3); stroke: var(--border)` |
| `.gd-node--focal` | Operator activation gate, Kept, "only path / only outcome" swatches | `rgba(235,108,54,.08)` / `#eb6c36` | `fill: var(--warning-soft); stroke: var(--warning)` |
| `.gd-node--ui` | Operator UI actor | `rgba(79,93,117,.10)` / `#7a8399` | `fill: var(--accent-soft); stroke: var(--accent)` |
| `.gd-node--model` | Optimizer LLM, Evaluator actors | `rgba(45,49,66,.03)` / `rgba(45,49,66,.30)` | `fill: var(--bg-inset); stroke: var(--border)` |
| `.gd-edge` | solid arrows, self-call path, loop-back path, legend arrow swatches | `#4f5d75` 1.2 | `fill: none; stroke: var(--fg-3); stroke-width: 1.2` |
| `.gd-edge--focal` | DONE→test-set, PASS→Kept, TEST_ACCURACY return | `#eb6c36` | `stroke: var(--warning)` |
| `.gd-edge--http` | POST /optimizer/run | `#2e5aa8` | `stroke: var(--accent)` |
| `.gd-marker`, `.gd-marker--focal`, `.gd-marker--http` | marker polygons | `#4f5d75` / `#eb6c36` / `#2e5aa8` | `fill: var(--fg-3)` / `var(--warning)` / `var(--accent)` |
| `.gd-rule` | legend divider lines | `rgba(45,49,66,.10)` | `stroke: var(--border-subtle); stroke-width: .8` |
| `.gd-ribbon` | Sankey ordinary ribbons + legend swatch | `rgba(79,93,117,.18)` | `fill: var(--fg-3); fill-opacity: .22` |
| `.gd-ribbon--focal` | Sankey scored ribbons + legend swatch | `rgba(235,108,54,.28)` | `fill: var(--warning); fill-opacity: .45` |
| `.gd-bar` | Sankey node bars | `#2d3142` | `fill: var(--fg-1)` |
| `.gd-lifeline` | sequence lifelines | `rgba(45,49,66,.20)` dashed | `stroke: var(--border-strong); stroke-width: 1` |
| `.gd-activation` | sequence activation bars | `rgba(45,49,66,.06)` / `#4f5d75` | `fill: var(--bg-3); stroke: var(--fg-3); stroke-width: .8` |
| `.gd-fragment` | LOOP frame, LOOP tag box, legend swatch | `rgba(45,49,66,.02)` / `rgba(45,49,66,.22)` | `fill: var(--bg-inset); stroke: var(--border); stroke-width: 1` |

Dark and light themes both work automatically because every colour is a token from
`design-tokens.css`; nothing in the diagrams is a raw hex/rgba value (enforced by test).

## Bilingual strings (added to the `ui` computed in `pages/guide.vue`)

All figure copy goes through `t()`. Keys and values:

| Key | en | zh |
|---|---|---|
| `figPoolEyebrow` | `Fig. 1 · Sankey` | `圖 1 · Sankey` |
| `figPoolTitle` | `Where the 12,000 test cases go: only 600 are ever scored` | `測試案例的流向：12,000 筆裡只有 600 筆會被評分` |
| `figPoolCaption` | `Ribbon width equals case count. The train split is used only for relabeling and review — the optimizer never scores it. The validation snapshot is reused every round; the test snapshot is scored once after the loop ends.` | `帶寬等於案例數。訓練集只用於重新標記與人工審核，最佳化器從未拿它評分；驗證快照每輪重複使用，測試快照只在迴圈結束後使用一次。` |
| `figRunEyebrow` | `Fig. 2 · Flowchart · Run level` | `圖 2 · 流程圖 · Run 層級` |
| `figRunTitle` | `The backbone of one optimizer run` | `一次 optimizer run 的骨幹` |
| `figRunCaption` | `From POST /optimizer/run to manual activation by the operator. If the baseline already meets the target, the loop exits before any candidate round. The inside of each round — candidate generation and the three gates — is expanded in Fig. 3.` | `從 POST /optimizer/run 到 operator 手動啟用。若基準已達目標，迴圈不會產生任何候選輪次就直接結束。每一輪的細節（候選生成與三道 gate）展開在圖 3。` |
| `figRoundEyebrow` | `Fig. 3 · Flowchart · Round level` | `圖 3 · 流程圖 · Round 層級` |
| `figRoundTitle` | `Inside one round: how a candidate becomes kept, rejected, or skipped` | `每一輪的三道 gate：候選 prompt 怎麼變成 kept / rejected / skipped` |
| `figRoundCaption` | `G0 is a structural pre-check that runs before scoring — a candidate that fails it is Skipped, not Rejected. G1 requires overall validation accuracy to improve; G2 requires protected actions to stay within tolerance. Those two are the keep/reject gates detailed below.` | `G0 在評分前擋掉結構不合法的候選——未通過者記為 Skipped 而非 Rejected。G1 要求整體驗證準確率進步；G2 要求受保護的 action 不能退步超過容差。這兩道就是下方詳述的保留／拒絕閘。` |
| `figSeqEyebrow` | `Fig. 4 · Sequence` | `圖 4 · 循序圖` |
| `figSeqTitle` | `Who talks to whom in a run: analysis, scoring, and record-keeping` | `一次 run 的訊息往返：誰負責分析、誰負責評分、誰負責留下紀錄` |
| `figSeqCaption` | `The Optimizer LLM and the Evaluator are two different models: the former only reads failures and rewrites the prompt; the latter only scores the 200 / 400 cases. Every round is written to PostgreSQL.` | `Optimizer LLM 與 Evaluator 是兩個不同的模型：前者只讀失敗樣本並改寫 prompt，後者只對 200 / 400 筆案例出題評分。所有輪次資料寫入 PostgreSQL。` |

Re-worded existing keys (the Loop section becomes run level):

| Key | en | zh |
|---|---|---|
| `loopEyebrow` | `Run lifecycle` | `執行生命週期` |
| `loopHeading` | `One run, start to finish: from snapshot to test accuracy` | `一次執行從頭到尾：從快照到測試準確率` |
| `loopDesc` | `Every optimizer run follows this backbone. Rounds repeat until the target accuracy is reached or max_rounds is exhausted; only the operator can activate the result.` | `每次最佳化執行都遵循這條骨幹。輪次會重複直到達到目標準確率或用盡 max_rounds；只有操作員能啟用結果。` |

SVG-internal labels stay in English (technical identifiers, same policy as `<code>` and
tooltips on this page — see archived `guide-zh-tab-detail` spec, AC-2.3 / AC-2.4).

## Section anchors (for tests and deep links)

Add `id` attributes to the four host `<section>` elements: `data-splits`, `run-lifecycle`,
`gates`, `runtime-flow`. No other markup changes to those sections beyond inserting the
`GuideFigure` block.

## Testing strategy

Existing tests mount components directly with `@vue/test-utils` and stub auto-imported
components by name (`tests/optimizerHistory.test.ts` stubs `NuxtLink`, `ClientOnly`). The
page test follows that pattern; Nuxt auto-imports used by `pages/guide.vue` (`ref`,
`computed`, `definePageMeta`) are provided with `vi.stubGlobal` because there is no
`@nuxt/test-utils` in the project.

- `tests/guideDiagrams.test.ts` — one `describe` per diagram component (data-driven over the
  four imports): renders exactly one `svg[role="img"]`; has a non-empty `<title>` and
  `<desc>`; `aria-labelledby` lists both ids and both ids resolve inside the svg; markup
  contains no `<script`, no `font-family=`, no hex colour (`/#[0-9a-f]{3,8}\b/i`) and no
  `rgba(`; every `url(#…)` reference resolves to a `<marker>` id in the same svg. Plus one
  test that mounts a wrapper rendering the same diagram twice and asserts the two `<title>`
  ids differ.
- `tests/guideFigure.test.ts` — renders eyebrow/title/caption props and slot; omits the
  caption node when the prop is not passed; the scroll container exists.
- `tests/guidePage.test.ts` — mounts `pages/guide.vue` with stubs; asserts each diagram stub
  is inside its section (`#data-splits`, `#run-lifecycle`, `#gates`, `#runtime-flow`), that
  no `GuideSplitDiagram` / `GuideLoopDiagram` element is rendered, and that clicking the
  中文 tab changes the four figure titles.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Inter / JetBrains Mono glyphs are wider than Geist; labels could collide | Knockout via `paint-order: stroke` (no fixed-width rects); Developer visually checks all four at 1120px and 375px in both themes and nudges `x` only where needed. |
| `paint-order` unsupported in a very old browser | Degrades to un-knocked text over a 1.2px line — still legible. |
| `useId()` needs Vue ≥ 3.5 | `package.json` has `vue: ^3.5.0`; Nuxt auto-imports it. Tests mount with plain Vue, where it also works. |
| Page test cannot resolve Nuxt auto-imports | `vi.stubGlobal` for `ref` / `computed` / `definePageMeta` + name-based stubs for `AppTopBar`, `UiEyebrow`, `UiCard`, `NuxtLink`, `GuideTooltip`, `GuideFigure`, and the four diagrams. If the page mount proves brittle, keep the section-id + stub assertions and drop the language-toggle assertion, noting it in `handoff-dev.json`. |
| Global CSS file loaded on every route | ~60 lines, `gd-`-prefixed; no selector touches non-guide markup. |
| Deleting `GuideLoopDiagram` loses its "baseline already meets target" note | Moved into `figRunCaption` (both languages). |

## Non-goals
- No change to optimizer behaviour, API calls, stores, or any route.
- No new fonts, no Google Fonts link changes, no serif face.
- `docs/art/auto-optimizer-flow.html` is left untouched (it remains the geometry source).
- No SVG-internal label translation, no animation, no interactivity in the diagrams.
