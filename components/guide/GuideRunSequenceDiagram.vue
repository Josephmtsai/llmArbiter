<script setup lang="ts">
import { useId } from 'vue'

const uid = useId()
const titleId = `${uid}-title`
const descId = `${uid}-desc`
const arrowId = `${uid}-arrow`
const arrowFocalId = `${uid}-arrow-focal`
const arrowHttpId = `${uid}-arrow-http`
</script>

<template>
  <svg
    class="gd"
    viewBox="0 0 1000 752"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    :aria-labelledby="titleId"
    :aria-describedby="descId"
  >
    <title :id="titleId">Optimizer run message sequence</title>
    <desc :id="descId">
      Sequence diagram of an optimizer run: the operator UI starts the run, the optimizer task
      measures the baseline with the evaluator, then loops asking the optimizer LLM for an analysis
      and candidate, evaluating the candidate, applying the keep or reject gates and persisting the
      round, and finally scores the best prompt on the test snapshot.
    </desc>
    <defs>
      <marker :id="arrowId" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <polygon class="gd-marker" points="0 0, 8 3, 0 6" />
      </marker>
      <marker :id="arrowFocalId" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <polygon class="gd-marker gd-marker--focal" points="0 0, 8 3, 0 6" />
      </marker>
      <marker :id="arrowHttpId" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <polygon class="gd-marker gd-marker--http" points="0 0, 8 3, 0 6" />
      </marker>
    </defs>

    <!-- Lifelines -->
    <line class="gd-lifeline" x1="100" y1="88" x2="100" y2="688" stroke-dasharray="3,3" />
    <line class="gd-lifeline" x1="300" y1="88" x2="300" y2="688" stroke-dasharray="3,3" />
    <line class="gd-lifeline" x1="500" y1="88" x2="500" y2="688" stroke-dasharray="3,3" />
    <line class="gd-lifeline" x1="700" y1="88" x2="700" y2="688" stroke-dasharray="3,3" />
    <line class="gd-lifeline" x1="900" y1="88" x2="900" y2="688" stroke-dasharray="3,3" />

    <!-- Loop fragment frame -->
    <rect class="gd-fragment gd-fragment--frame" x="252" y="268" width="672" height="272" rx="4" />
    <rect class="gd-fragment" x="252" y="268" width="40" height="16" rx="2" />
    <text
      class="gd-label"
      x="272"
      y="280"
      font-size="8"
      text-anchor="middle"
      letter-spacing="0.12em"
    >
      LOOP
    </text>
    <text class="gd-label gd-label--knockout" x="344" y="300" font-size="8" letter-spacing="0.04em">
      [round N · until accuracy ≥ target or N = max_rounds]
    </text>

    <!-- Activation bars -->
    <rect class="gd-activation" x="96" y="120" width="8" height="44" />
    <rect class="gd-activation" x="296" y="120" width="8" height="508" />
    <rect class="gd-activation" x="496" y="320" width="8" height="44" />
    <rect class="gd-activation" x="696" y="188" width="8" height="56" />
    <rect class="gd-activation" x="696" y="388" width="8" height="48" />
    <rect class="gd-activation" x="696" y="572" width="8" height="48" />
    <rect class="gd-activation" x="896" y="504" width="8" height="16" />

    <!-- m1 POST run -->
    <line
      class="gd-edge gd-edge--http"
      x1="104"
      y1="128"
      x2="296"
      y2="128"
      :marker-end="`url(#${arrowHttpId})`"
    />
    <text
      class="gd-label gd-label--http gd-label--knockout"
      x="200"
      y="117"
      font-size="8"
      text-anchor="middle"
      letter-spacing="0.06em"
    >
      POST /OPTIMIZER/RUN
    </text>
    <!-- m2 202 -->
    <line
      class="gd-edge"
      x1="296"
      y1="156"
      x2="104"
      y2="156"
      stroke-dasharray="5,4"
      :marker-end="`url(#${arrowId})`"
    />
    <text
      class="gd-label gd-label--knockout"
      x="200"
      y="145"
      font-size="8"
      text-anchor="middle"
      letter-spacing="0.06em"
    >
      202 · RUN_ID
    </text>

    <!-- m3 baseline eval -->
    <line class="gd-edge" x1="304" y1="196" x2="696" y2="196" :marker-end="`url(#${arrowId})`" />
    <text
      class="gd-label gd-label--knockout"
      x="600"
      y="185"
      font-size="8"
      text-anchor="middle"
      letter-spacing="0.06em"
    >
      EVAL BASELINE · 200
    </text>
    <!-- m4 baseline return -->
    <line
      class="gd-edge"
      x1="696"
      y1="236"
      x2="304"
      y2="236"
      stroke-dasharray="5,4"
      :marker-end="`url(#${arrowId})`"
    />
    <text
      class="gd-label gd-label--knockout"
      x="400"
      y="225"
      font-size="8"
      text-anchor="middle"
      letter-spacing="0.06em"
    >
      BASELINE ACC + FAILURES
    </text>

    <!-- m5 analyze + generate -->
    <line class="gd-edge" x1="304" y1="328" x2="496" y2="328" :marker-end="`url(#${arrowId})`" />
    <text
      class="gd-label gd-label--knockout"
      x="400"
      y="317"
      font-size="8"
      text-anchor="middle"
      letter-spacing="0.06em"
    >
      ANALYZE + GENERATE
    </text>
    <!-- m6 candidate return -->
    <line
      class="gd-edge"
      x1="496"
      y1="356"
      x2="304"
      y2="356"
      stroke-dasharray="5,4"
      :marker-end="`url(#${arrowId})`"
    />
    <text
      class="gd-label gd-label--knockout"
      x="400"
      y="345"
      font-size="8"
      text-anchor="middle"
      letter-spacing="0.06em"
    >
      ANALYSIS + CANDIDATE
    </text>

    <!-- m7 eval candidate -->
    <line class="gd-edge" x1="304" y1="396" x2="696" y2="396" :marker-end="`url(#${arrowId})`" />
    <text
      class="gd-label gd-label--knockout"
      x="600"
      y="385"
      font-size="8"
      text-anchor="middle"
      letter-spacing="0.06em"
    >
      EVAL CANDIDATE · 200
    </text>
    <!-- m8 candidate return -->
    <line
      class="gd-edge"
      x1="696"
      y1="428"
      x2="304"
      y2="428"
      stroke-dasharray="5,4"
      :marker-end="`url(#${arrowId})`"
    />
    <text
      class="gd-label gd-label--knockout"
      x="400"
      y="417"
      font-size="8"
      text-anchor="middle"
      letter-spacing="0.06em"
    >
      ACC + PER-ACTION
    </text>

    <!-- m9 self: gates -->
    <path
      class="gd-edge"
      d="M304,456 L328,456 Q336,456 336,464 L336,472 Q336,480 328,480 L304,480"
      :marker-end="`url(#${arrowId})`"
    />
    <text class="gd-label gd-label--knockout" x="348" y="471" font-size="8" letter-spacing="0.06em">
      KEEP / REJECT GATES
    </text>

    <!-- m10 persist round -->
    <line class="gd-edge" x1="304" y1="512" x2="896" y2="512" :marker-end="`url(#${arrowId})`" />
    <text
      class="gd-label gd-label--knockout"
      x="800"
      y="501"
      font-size="8"
      text-anchor="middle"
      letter-spacing="0.06em"
    >
      INSERT ROUND + FAILURES
    </text>

    <!-- m11 test eval -->
    <line class="gd-edge" x1="304" y1="580" x2="696" y2="580" :marker-end="`url(#${arrowId})`" />
    <text
      class="gd-label gd-label--knockout"
      x="600"
      y="569"
      font-size="8"
      text-anchor="middle"
      letter-spacing="0.06em"
    >
      EVAL TEST · 400
    </text>
    <!-- m12 test_accuracy (headline) -->
    <line
      class="gd-edge gd-edge--focal"
      x1="696"
      y1="612"
      x2="304"
      y2="612"
      :marker-end="`url(#${arrowFocalId})`"
    />
    <text
      class="gd-label gd-label--focal gd-label--knockout"
      x="400"
      y="601"
      font-size="8"
      text-anchor="middle"
      letter-spacing="0.06em"
    >
      TEST_ACCURACY
    </text>

    <!-- Actors -->
    <rect class="gd-node gd-node--ui" x="28" y="40" width="144" height="48" rx="6" />
    <text class="gd-title" x="100" y="60" font-size="12" font-weight="600" text-anchor="middle">
      Operator UI
    </text>
    <text class="gd-meta" x="100" y="76" font-size="9" text-anchor="middle">Nuxt · /optimizer</text>

    <rect class="gd-node" x="228" y="40" width="144" height="48" rx="6" />
    <text class="gd-title" x="300" y="60" font-size="12" font-weight="600" text-anchor="middle">
      Optimizer task
    </text>
    <text class="gd-meta" x="300" y="76" font-size="9" text-anchor="middle">FastAPI · asyncio</text>

    <rect class="gd-node gd-node--model" x="428" y="40" width="144" height="48" rx="6" />
    <text class="gd-title" x="500" y="60" font-size="12" font-weight="600" text-anchor="middle">
      Optimizer LLM
    </text>
    <text class="gd-meta" x="500" y="76" font-size="9" text-anchor="middle">OPTIMIZER_MODEL</text>

    <rect class="gd-node gd-node--model" x="628" y="40" width="144" height="48" rx="6" />
    <text class="gd-title" x="700" y="60" font-size="12" font-weight="600" text-anchor="middle">
      Evaluator
    </text>
    <text class="gd-meta" x="700" y="76" font-size="9" text-anchor="middle">
      EvalRun · Semaphore(10)
    </text>

    <rect class="gd-node gd-node--store" x="828" y="40" width="144" height="48" rx="6" />
    <text class="gd-title" x="900" y="60" font-size="12" font-weight="600" text-anchor="middle">
      PostgreSQL
    </text>
    <text class="gd-meta" x="900" y="76" font-size="9" text-anchor="middle">
      runs · rounds · failures
    </text>

    <!-- Legend -->
    <line class="gd-rule" x1="30" y1="712" x2="970" y2="712" />
    <text class="gd-label" x="30" y="728" font-size="8" letter-spacing="0.14em">LEGEND</text>
    <line class="gd-edge" x1="100" y1="724" x2="120" y2="724" :marker-end="`url(#${arrowId})`" />
    <text class="gd-legend" x="128" y="728" font-size="9">Sync call</text>
    <line
      class="gd-edge"
      x1="220"
      y1="724"
      x2="240"
      y2="724"
      stroke-dasharray="5,4"
      :marker-end="`url(#${arrowId})`"
    />
    <text class="gd-legend" x="248" y="728" font-size="9">Return</text>
    <line
      class="gd-edge gd-edge--http"
      x1="320"
      y1="724"
      x2="340"
      y2="724"
      :marker-end="`url(#${arrowHttpId})`"
    />
    <text class="gd-legend" x="348" y="728" font-size="9">HTTP call</text>
    <line
      class="gd-edge gd-edge--focal"
      x1="440"
      y1="724"
      x2="460"
      y2="724"
      :marker-end="`url(#${arrowFocalId})`"
    />
    <text class="gd-legend" x="468" y="728" font-size="9">Headline result</text>
    <rect class="gd-fragment gd-fragment--swatch" x="580" y="720" width="16" height="10" rx="2" />
    <text class="gd-legend" x="604" y="728" font-size="9">Loop fragment (one round)</text>
  </svg>
</template>
