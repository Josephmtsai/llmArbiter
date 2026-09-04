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
    viewBox="0 0 1000 656"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    :aria-labelledby="`${titleId} ${descId}`"
  >
    <title :id="titleId">Optimizer run lifecycle</title>
    <desc :id="descId">Flowchart of one optimizer run: snapshot the validation set and measure the baseline, loop rounds of candidate generation and gating until the target accuracy or max rounds is reached, score the best prompt on the held-out test snapshot, then hand off to the operator activation gate.</desc>
    <defs>
      <marker :id="arrowId" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <polygon class="gd-marker" points="0 0, 8 3, 0 6" />
      </marker>
      <marker :id="arrowFocalId" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <polygon class="gd-marker gd-marker--focal" points="0 0, 8 3, 0 6" />
      </marker>
    </defs>

    <!-- Arrows first -->
    <line class="gd-edge" x1="400" y1="96" x2="400" y2="136" :marker-end="`url(#${arrowId})`" />
    <line class="gd-edge" x1="400" y1="192" x2="400" y2="232" :marker-end="`url(#${arrowId})`" />
    <line class="gd-edge" x1="400" y1="288" x2="400" y2="328" :marker-end="`url(#${arrowId})`" />
    <line class="gd-edge" x1="400" y1="400" x2="400" y2="440" :marker-end="`url(#${arrowId})`" />
    <text class="gd-label gd-label--knockout" x="432" y="421" font-size="8" text-anchor="middle" letter-spacing="0.06em">DONE</text>
    <line class="gd-edge gd-edge--focal" x1="400" y1="496" x2="400" y2="536" :marker-end="`url(#${arrowFocalId})`" />

    <!-- Persist (dashed write) -->
    <line class="gd-edge" x1="520" y1="260" x2="640" y2="260" stroke-dasharray="5,4" :marker-end="`url(#${arrowId})`" />
    <text class="gd-label gd-label--knockout" x="580" y="249" font-size="8" text-anchor="middle" letter-spacing="0.06em">PERSIST</text>

    <!-- Loop back: next round -->
    <path class="gd-edge" d="M240,364 L88,364 Q80,364 80,356 L80,268 Q80,260 88,260 L280,260" :marker-end="`url(#${arrowId})`" />
    <text class="gd-label gd-label--knockout" x="92" y="313" font-size="8" letter-spacing="0.06em">NEXT ROUND</text>

    <!-- N1 start -->
    <rect class="gd-node" x="280" y="48" width="240" height="48" rx="20" />
    <text class="gd-title" x="400" y="68" font-size="12" font-weight="600" text-anchor="middle">Start optimizer run</text>
    <text class="gd-meta" x="400" y="84" font-size="9" text-anchor="middle">POST /optimizer/run · max_rounds · target</text>

    <!-- N2 snapshot + baseline -->
    <rect class="gd-node" x="280" y="136" width="240" height="56" rx="6" />
    <text class="gd-title" x="400" y="160" font-size="12" font-weight="600" text-anchor="middle">Snapshot val set + baseline eval</text>
    <text class="gd-meta" x="400" y="176" font-size="9" text-anchor="middle">200 fixed cases → baseline_accuracy</text>

    <!-- N3 round -->
    <rect class="gd-node" x="280" y="232" width="240" height="56" rx="6" />
    <text class="gd-title" x="400" y="256" font-size="12" font-weight="600" text-anchor="middle">Round N: candidate + gates</text>
    <text class="gd-meta" x="400" y="272" font-size="9" text-anchor="middle">Fig. 3 → kept / rejected / skipped</text>

    <!-- Store -->
    <rect class="gd-node gd-node--store" x="640" y="232" width="160" height="56" rx="6" />
    <text class="gd-title" x="720" y="256" font-size="12" font-weight="600" text-anchor="middle">PostgreSQL</text>
    <text class="gd-meta" x="720" y="272" font-size="9" text-anchor="middle">runs · rounds · failures</text>

    <!-- N4 exit decision -->
    <polygon class="gd-node" points="400,328 560,364 400,400 240,364" />
    <text class="gd-title" x="400" y="360" font-size="12" font-weight="600" text-anchor="middle">Target reached or max rounds?</text>
    <text class="gd-meta" x="400" y="376" font-size="8" text-anchor="middle">accuracy ≥ target · rounds ≥ max_rounds</text>

    <!-- N5 test acceptance -->
    <rect class="gd-node" x="280" y="440" width="240" height="56" rx="6" />
    <text class="gd-title" x="400" y="464" font-size="12" font-weight="600" text-anchor="middle">Test-set acceptance</text>
    <text class="gd-meta" x="400" y="480" font-size="9" text-anchor="middle">best prompt × 400 held-out → test_accuracy</text>

    <!-- N6 operator gate (focal) -->
    <rect class="gd-node gd-node--focal" x="280" y="536" width="240" height="48" rx="20" />
    <text class="gd-title" x="400" y="556" font-size="12" font-weight="600" text-anchor="middle">Operator activation gate</text>
    <text class="gd-meta" x="400" y="572" font-size="9" text-anchor="middle">PATCH /config/prompts/{id}/activate</text>

    <!-- Legend -->
    <line class="gd-rule" x1="30" y1="616" x2="970" y2="616" />
    <text class="gd-label" x="30" y="632" font-size="8" letter-spacing="0.14em">LEGEND</text>
    <rect class="gd-node" x="100" y="624" width="20" height="10" rx="5" />
    <text class="gd-legend" x="128" y="633" font-size="9">Start / end</text>
    <rect class="gd-node" x="220" y="624" width="16" height="10" rx="2" />
    <text class="gd-legend" x="244" y="633" font-size="9">Step</text>
    <polygon class="gd-node" points="308,624 320,629 308,634 296,629" />
    <text class="gd-legend" x="328" y="633" font-size="9">Decision</text>
    <rect class="gd-node gd-node--store" x="400" y="624" width="16" height="10" rx="2" />
    <text class="gd-legend" x="424" y="633" font-size="9">Persisted state</text>
    <line class="gd-edge" x1="520" y1="629" x2="540" y2="629" stroke-dasharray="5,4" :marker-end="`url(#${arrowId})`" />
    <text class="gd-legend" x="548" y="633" font-size="9">Write</text>
    <rect class="gd-node gd-node--focal" x="600" y="624" width="20" height="10" rx="5" />
    <text class="gd-legend" x="628" y="633" font-size="9">Only path that changes production</text>
  </svg>
</template>
