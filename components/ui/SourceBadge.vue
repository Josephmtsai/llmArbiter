<script setup lang="ts">
import type { Source } from '~/types/api'

defineProps<{ source: Source }>()

const SOURCE_COLOR: Record<Source, string> = {
  manual: 'var(--accent)',
  jenkins: 'var(--success)',
  redfish: 'var(--action-restart)',
}
</script>

<template>
  <UiChip :color="SOURCE_COLOR[source]">{{ source }}</UiChip>
</template>
