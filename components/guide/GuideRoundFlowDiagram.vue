<script setup lang="ts">
import { useId } from 'vue'

const uid = useId()
const titleId = `${uid}-title`
const descId = `${uid}-desc`
const arrowId = `${uid}-arrow`
const arrowFocalId = `${uid}-arrow-focal`
</script>

<template>
  <svg
    class="gd"
    viewBox="0 0 1000 792"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    :aria-labelledby="`${titleId} ${descId}`"
  >
    <title :id="titleId">Optimizer round gates</title>
    <desc :id="descId">Flowchart of one optimizer round: the optimizer LLM analyzes failures and generates a candidate, gate G0 validates its structure, the candidate is evaluated on the fixed validation snapshot, gate G1 requires overall accuracy to improve and gate G2 requires protected actions to stay within tolerance; outcomes are kept, rejected or skipped.</desc>
    <defs>
      <marker :id="arrowId" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <polygon class="gd-marker" points="0 0, 8 3, 0 6" />
      </marker>
      <marker :id="arrowFocalId" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <polygon class="gd-marker gd-marker--focal" points="0 0, 8 3, 0 6" />
      </marker>
    </defs>

    <!-- Main-line arrows -->
    <line class="gd-edge" x1="320" y1="88" x2="320" y2="128" :marker-end="`url(#${arrowId})`" />
    <line class="gd-edge" x1="320" y1="184" x2="320" y2="220" :marker-end="`url(#${arrowId})`" />
    <line class="gd-edge" x1="320" y1="300" x2="320" y2="336" :marker-end="`url(#${arrowId})`" />
    <text class="gd-label gd-label--knockout" x="352" y="321" font-size="8" text-anchor="middle" letter-spacing="0.06em">VALID</text>
    <line class="gd-edge" x1="320" y1="392" x2="320" y2="428" :marker-end="`url(#${arrowId})`" />
    <line class="gd-edge" x1="320" y1="508" x2="320" y2="540" :marker-end="`url(#${arrowId})`" />
    <text class="gd-label gd-label--knockout" x="346" y="527" font-size="8" text-anchor="middle" letter-spacing="0.06em">YES</text>
    <line class="gd-edge gd-edge--focal" x1="320" y1="620" x2="320" y2="664" :marker-end="`url(#${arrowFocalId})`" />
    <text class="gd-label gd-label--focal gd-label--knockout" x="350" y="645" font-size="8" text-anchor="middle" letter-spacing="0.06em">PASS</text>

    <!-- Branch arrows -->
    <line class="gd-edge" x1="480" y1="260" x2="600" y2="260" :marker-end="`url(#${arrowId})`" />
    <text class="gd-label gd-label--knockout" x="542" y="249" font-size="8" text-anchor="middle" letter-spacing="0.06em">INVALID</text>

    <path class="gd-edge" d="M480,468 L712,468 Q720,468 720,476 L720,500" :marker-end="`url(#${arrowId})`" />
    <text class="gd-label gd-label--knockout" x="596" y="457" font-size="8" text-anchor="middle" letter-spacing="0.06em">NO GAIN</text>

    <path class="gd-edge" d="M480,580 L712,580 Q720,580 720,572 L720,548" :marker-end="`url(#${arrowId})`" />
    <text class="gd-label gd-label--knockout" x="596" y="569" font-size="8" text-anchor="middle" letter-spacing="0.06em">REGRESSION</text>

    <!-- N1 start -->
    <rect class="gd-node" x="200" y="40" width="240" height="48" rx="20" />
    <text class="gd-title" x="320" y="60" font-size="12" font-weight="600" text-anchor="middle">Round N starts</text>
    <text class="gd-meta" x="320" y="76" font-size="9" text-anchor="middle">input: best prompt so far + its failures</text>

    <!-- N2 analyze + generate -->
    <rect class="gd-node" x="200" y="128" width="240" height="56" rx="6" />
    <text class="gd-title" x="320" y="152" font-size="12" font-weight="600" text-anchor="middle">Optimizer LLM: analyze + generate</text>
    <text class="gd-meta" x="320" y="168" font-size="9" text-anchor="middle">confusion → analysis_text → candidate</text>

    <!-- N3 G0 -->
    <polygon class="gd-node" points="320,220 480,260 320,300 160,260" />
    <text class="gd-title" x="320" y="256" font-size="12" font-weight="600" text-anchor="middle">G0 · Candidate valid?</text>
    <text class="gd-meta" x="320" y="272" font-size="8" text-anchor="middle">JSON · fields · actions · output contract</text>

    <!-- N4 evaluate -->
    <rect class="gd-node" x="200" y="336" width="240" height="56" rx="6" />
    <text class="gd-title" x="320" y="360" font-size="12" font-weight="600" text-anchor="middle">Save inactive version + evaluate</text>
    <text class="gd-meta" x="320" y="376" font-size="9" text-anchor="middle">same 200 val cases · per-action metrics</text>

    <!-- N5 G1 -->
    <polygon class="gd-node" points="320,428 480,468 320,508 160,468" />
    <text class="gd-title" x="320" y="464" font-size="12" font-weight="600" text-anchor="middle">G1 · Overall accuracy &gt; best?</text>
    <text class="gd-meta" x="320" y="480" font-size="8" text-anchor="middle">round_accuracy &gt; previous_best_accuracy</text>

    <!-- N6 G2 -->
    <polygon class="gd-node" points="320,540 480,580 320,620 160,580" />
    <text class="gd-title" x="320" y="576" font-size="12" font-weight="600" text-anchor="middle">G2 · Protected actions hold?</text>
    <text class="gd-meta" x="320" y="592" font-size="8" text-anchor="middle">notify_human, send_email ±2% · trigger_* ±5%</text>

    <!-- N7 kept (focal) -->
    <rect class="gd-node gd-node--focal" x="200" y="664" width="240" height="48" rx="20" />
    <text class="gd-title" x="320" y="684" font-size="12" font-weight="600" text-anchor="middle">Kept → new best prompt</text>
    <text class="gd-meta" x="320" y="700" font-size="9" text-anchor="middle">kept=true · baseline for next round</text>

    <!-- N8 rejected -->
    <rect class="gd-node" x="600" y="500" width="240" height="48" rx="20" />
    <text class="gd-title" x="720" y="520" font-size="12" font-weight="600" text-anchor="middle">Rejected → previous best stays</text>
    <text class="gd-meta" x="720" y="536" font-size="9" text-anchor="middle">kept=false · reject_reason recorded</text>

    <!-- N9 skipped -->
    <rect class="gd-node" x="600" y="236" width="240" height="48" rx="20" />
    <text class="gd-title" x="720" y="256" font-size="12" font-weight="600" text-anchor="middle">Skipped → nothing tested</text>
    <text class="gd-meta" x="720" y="272" font-size="9" text-anchor="middle">skip_reason · retried once first</text>

    <!-- Legend -->
    <line class="gd-rule" x1="30" y1="752" x2="970" y2="752" />
    <text class="gd-label" x="30" y="768" font-size="8" letter-spacing="0.14em">LEGEND</text>
    <rect class="gd-node" x="100" y="760" width="20" height="10" rx="5" />
    <text class="gd-legend" x="128" y="769" font-size="9">Start / outcome</text>
    <rect class="gd-node" x="240" y="760" width="16" height="10" rx="2" />
    <text class="gd-legend" x="264" y="769" font-size="9">Step</text>
    <polygon class="gd-node" points="328,760 340,765 328,770 316,765" />
    <text class="gd-legend" x="348" y="769" font-size="9">Gate</text>
    <rect class="gd-node gd-node--focal" x="420" y="760" width="20" height="10" rx="5" />
    <text class="gd-legend" x="448" y="769" font-size="9">Only outcome that moves the best prompt forward</text>
  </svg>
</template>
