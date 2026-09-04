<script setup lang="ts">
import type { OptimizerTab } from '~/composables/useOptimizerWorkflow'

const tabs: Array<{ id: OptimizerTab; label: string; href: string }> = [
  { id: 'overview', label: 'Overview', href: '/optimizer' },
  { id: 'review', label: 'Review queue', href: '/optimizer/review' },
  { id: 'evaluation', label: 'Pool evaluation', href: '/optimizer/evaluation' },
  { id: 'history', label: 'History', href: '/optimizer/history' },
]
const optimizerDefaultModel = useState<string | null>('sidebar:optimizerDefaultModel', () => null)

const {
  activeTab,
  stats,
  optimizerRuns,
  reviewTotal,
  prompts,
  selectedPromptId,
  loadingStats,
  loadingHistory,
  loadingRunDetail,
  loadingReview,
  loadingPrompts,
  globalError,
  maxRounds,
  targetAccuracy,
  startingOptimizer,
  cancellingRunId,
  optimizerMessage,
  reviewSearch,
  reviewActionFilter,
  selectedReview,
  correctionAction,
  reviewMutatingId,
  reviewError,
  poolModel,
  startingPoolEval,
  poolEvalRunId,
  poolEvalError,
  selectedRunId,
  lowestCoverage,
  poolIsEmpty,
  activeOptimizerRun,
  latestRun,
  selectedRun,
  filteredReviewItems,
  refreshAll,
  startOptimizer,
  cancelOptimizerRun,
  updateReview,
  startPoolEvaluation,
} = useOptimizerWorkflow()

function selectRun(id: number) {
  selectedRunId.value = id
  activeTab.value = 'history'
}
</script>

<template>
  <AppTopBar title="Auto Optimizer" subtitle="Prompt improvement pipeline" />

  <main class="optimizer-page">
    <div class="optimizer-page__toolbar">
      <div class="optimizer-page__tabs" role="tablist" aria-label="Optimizer sections">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.id"
          class="optimizer-page__tab"
          :class="{ 'optimizer-page__tab--active': activeTab === tab.id }"
          :to="tab.href"
        >
          {{ tab.label }}
        </NuxtLink>
      </div>
      <UiButton
        variant="secondary"
        size="sm"
        :loading="loadingStats || loadingHistory"
        @click="refreshAll"
      >
        Refresh
      </UiButton>
    </div>

    <div v-if="globalError" class="optimizer-page__error">{{ globalError }}</div>
    <div v-if="optimizerMessage" class="optimizer-page__notice">{{ optimizerMessage }}</div>

    <OptimizerOverview
      v-if="activeTab === 'overview'"
      v-model:max-rounds="maxRounds"
      v-model:target-accuracy="targetAccuracy"
      :stats="stats"
      :lowest-coverage="lowestCoverage"
      :review-total="reviewTotal"
      :latest-run="latestRun"
      :active-run="activeOptimizerRun"
      :runs="optimizerRuns"
      :loading-stats="loadingStats"
      :starting="startingOptimizer"
      :cancelling-run-id="cancellingRunId"
      :optimizer-default-model="optimizerDefaultModel"
      @start="startOptimizer"
      @cancel="cancelOptimizerRun"
      @select-run="selectRun"
    />

    <OptimizerReviewQueue
      v-if="activeTab === 'review'"
      v-model:search="reviewSearch"
      v-model:action-filter="reviewActionFilter"
      v-model:correction-action="correctionAction"
      :items="filteredReviewItems"
      :loading="loadingReview"
      :error="reviewError"
      :selected-review="selectedReview"
      :mutating-id="reviewMutatingId"
      @select-review="selectedReview = $event"
      @close-review="selectedReview = null"
      @mutate="updateReview"
    />

    <OptimizerPoolEvaluation
      v-if="activeTab === 'evaluation'"
      v-model:prompt-id="selectedPromptId"
      v-model:model="poolModel"
      :prompts="prompts"
      :loading-prompts="loadingPrompts"
      :pool-is-empty="poolIsEmpty"
      :starting="startingPoolEval"
      :accepted-run-id="poolEvalRunId"
      :error="poolEvalError"
      @start="startPoolEvaluation"
    />

    <OptimizerHistory
      v-if="activeTab === 'history'"
      :runs="optimizerRuns"
      :selected-run="selectedRun"
      :loading="loadingHistory || loadingRunDetail"
      @select-run="selectedRunId = $event"
    />
  </main>
</template>

<style scoped>
.optimizer-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  padding: var(--page-pad);
}
.optimizer-page__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.optimizer-page__tabs {
  display: inline-flex;
  gap: 2px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  padding: 3px;
  background: var(--bg-1);
}
.optimizer-page__tab {
  display: inline-flex;
  height: 30px;
  align-items: center;
  border: 0;
  border-radius: var(--r-sm);
  padding: 0 12px;
  background: transparent;
  color: var(--fg-3);
  cursor: pointer;
  font-size: 13px;
  text-decoration: none;
}
.optimizer-page__tab--active {
  background: var(--bg-3);
  color: var(--fg-0);
}
.optimizer-page__error,
.optimizer-page__notice {
  border-radius: var(--r-sm);
  padding: 10px 12px;
  font-size: 13px;
}
.optimizer-page__error {
  border: 1px solid rgba(248, 113, 113, 0.24);
  background: var(--bg-tint-danger);
  color: var(--action-notify);
}
.optimizer-page__notice {
  border: 1px solid rgba(96, 165, 250, 0.24);
  background: var(--accent-soft);
  color: var(--fg-1);
}
@media (max-width: 900px) {
  .optimizer-page__toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .optimizer-page__tabs {
    overflow-x: auto;
  }
}
</style>
