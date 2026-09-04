<script setup lang="ts">
import { useId } from 'vue'

const uid = useId()
const titleId = `${uid}-title`
const descId = `${uid}-desc`
</script>

<template>
  <svg
    class="gd"
    viewBox="0 0 1000 792"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    :aria-labelledby="`${titleId} ${descId}`"
  >
    <title :id="titleId">Eval pool split and optimizer snapshot usage</title>
    <desc :id="descId">Sankey showing the 12,000-case eval pool splitting into train, validation and test, and how one optimizer run scores only a 200-case validation snapshot and a 400-case test snapshot while the rest is curated or held in reserve.</desc>

    <!-- Column headers -->
    <text class="gd-label" x="166" y="52" font-size="8" text-anchor="middle" letter-spacing="0.14em">EVAL POOL · TEST CASES</text>
    <text class="gd-label" x="500" y="52" font-size="8" text-anchor="middle" letter-spacing="0.14em">SPLIT · 60 / 20 / 20</text>
    <text class="gd-label" x="806" y="52" font-size="8" text-anchor="middle" letter-spacing="0.14em">USED IN ONE OPTIMIZER RUN</text>

    <!-- Ordinary ribbons (k = 0.04 px per case) -->
    <path class="gd-ribbon" d="M172,148 C333,148 333,108 494,108 L494,396 C333,396 333,436 172,436 Z" />
    <path class="gd-ribbon" d="M172,436 C333,436 333,436 494,436 L494,532 C333,532 333,532 172,532 Z" />
    <path class="gd-ribbon" d="M172,532 C333,532 333,572 494,572 L494,668 C333,668 333,628 172,628 Z" />
    <path class="gd-ribbon" d="M506,108 C653,108 653,88 800,88 L800,376 C653,376 653,396 506,396 Z" />
    <path class="gd-ribbon" d="M506,444 C653,444 653,464 800,464 L800,552 C653,552 653,532 506,532 Z" />
    <path class="gd-ribbon" d="M506,572 C653,572 653,552 800,552 L800,632 C653,632 653,652 506,652 Z" />

    <!-- Focal path: the cases the optimizer actually scores -->
    <path class="gd-ribbon gd-ribbon--focal" d="M506,436 C653,436 653,416 800,416 L800,424 C653,424 653,444 506,444 Z" />
    <path class="gd-ribbon gd-ribbon--focal" d="M506,652 C653,652 653,672 800,672 L800,688 C653,688 653,668 506,668 Z" />

    <!-- Node bars -->
    <rect class="gd-bar" x="160" y="148" width="12" height="480" />
    <rect class="gd-bar" x="494" y="108" width="12" height="288" />
    <rect class="gd-bar" x="494" y="436" width="12" height="96" />
    <rect class="gd-bar" x="494" y="572" width="12" height="96" />
    <rect class="gd-bar" x="800" y="88" width="12" height="288" />
    <rect class="gd-bar" x="800" y="416" width="12" height="8" />
    <rect class="gd-bar" x="800" y="464" width="12" height="168" />
    <rect class="gd-bar" x="800" y="672" width="12" height="16" />

    <!-- Column 1 labels -->
    <text class="gd-title" x="148" y="384" font-size="12" font-weight="600" text-anchor="end">Eval pool</text>
    <text class="gd-meta" x="148" y="400" font-size="9" text-anchor="end">12,000 cases</text>
    <text class="gd-meta" x="148" y="412" font-size="9" text-anchor="end">2,400 per action</text>

    <!-- Column 2 labels (centred in gutters) -->
    <text class="gd-title" x="500" y="88" font-size="12" font-weight="600" text-anchor="middle">Train</text>
    <text class="gd-meta" x="500" y="100" font-size="9" text-anchor="middle">7,200 · 60%</text>
    <text class="gd-title" x="500" y="412" font-size="12" font-weight="600" text-anchor="middle">Validation</text>
    <text class="gd-meta" x="500" y="424" font-size="9" text-anchor="middle">2,400 · 20%</text>
    <text class="gd-title" x="500" y="548" font-size="12" font-weight="600" text-anchor="middle">Test</text>
    <text class="gd-meta" x="500" y="560" font-size="9" text-anchor="middle">2,400 · 20%</text>

    <!-- Column 3 labels -->
    <text class="gd-title" x="816" y="228" font-size="12" font-weight="600">Relabel &amp; review only</text>
    <text class="gd-meta" x="816" y="244" font-size="9">7,200 · never scored</text>
    <text class="gd-title" x="816" y="416" font-size="12" font-weight="600">Val snapshot</text>
    <text class="gd-meta" x="816" y="432" font-size="9">200 · 40/action · fixed per run</text>
    <text class="gd-title" x="816" y="544" font-size="12" font-weight="600">Not drawn this run</text>
    <text class="gd-meta" x="816" y="560" font-size="9">4,200 · val 2,200 + test 2,000</text>
    <text class="gd-title" x="816" y="676" font-size="12" font-weight="600">Test snapshot</text>
    <text class="gd-meta" x="816" y="692" font-size="9">400 · 80/action · once after loop</text>

    <!-- Legend -->
    <line class="gd-rule" x1="30" y1="728" x2="970" y2="728" />
    <text class="gd-label" x="30" y="744" font-size="8" letter-spacing="0.14em">LEGEND</text>
    <rect class="gd-ribbon" x="100" y="736" width="16" height="8" />
    <text class="gd-legend" x="124" y="744" font-size="9">Split flow (cases)</text>
    <rect class="gd-ribbon gd-ribbon--focal" x="260" y="736" width="16" height="8" />
    <text class="gd-legend" x="284" y="744" font-size="9">Scored by the optimizer: 600 of 12,000</text>
    <text class="gd-callout" x="620" y="746" font-size="14">Only 5% of the pool is ever scored in a run.</text>
  </svg>
</template>
