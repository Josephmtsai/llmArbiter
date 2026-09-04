import type {
  ArbiterAction,
  EvalPoolStats,
  OptimizerRun,
  PromptVersion,
  ReviewQueueEntry,
  ReviewQueueMutationRequest,
} from '~/types/api'
import {
  getLowestActionCoverage,
  isEvalPoolEmpty,
  isOptimizerRunActive,
  shouldPollOptimizerHistory,
} from '~/utils/optimizerState'

export type OptimizerTab = 'overview' | 'review' | 'evaluation' | 'history'

function extractOptimizerError(error: unknown): string {
  if (error && typeof error === 'object') {
    const data = 'data' in error ? (error as { data?: unknown }).data : undefined
    if (data && typeof data === 'object' && 'detail' in data) {
      const detail = (data as { detail: unknown }).detail
      return typeof detail === 'string' ? detail : JSON.stringify(detail)
    }
    if ('message' in error && typeof (error as { message: unknown }).message === 'string') {
      return (error as { message: string }).message
    }
  }
  return 'Request failed'
}

const VALID_TABS: OptimizerTab[] = ['overview', 'review', 'evaluation', 'history']
const TAB_PATHS: Record<OptimizerTab, string> = {
  overview: '/optimizer',
  review: '/optimizer/review',
  evaluation: '/optimizer/evaluation',
  history: '/optimizer/history',
}

function tabFromPath(path: string): OptimizerTab {
  if (path === '/optimizer/review') return 'review'
  if (path === '/optimizer/evaluation') return 'evaluation'
  if (path === '/optimizer/history') return 'history'
  return 'overview'
}

export function useOptimizerWorkflow() {
  const api = useApi()
  const route = useRoute()
  const router = useRouter()

  const activeTab = ref<OptimizerTab>(tabFromPath(route.path))
  const stats = useState<EvalPoolStats | null>('optimizer:stats', () => null)
  const optimizerRuns = useState<OptimizerRun[]>('optimizer:runs', () => [])
  const optimizerRunDetails = useState<Record<number, OptimizerRun>>(
    'optimizer:runDetails',
    () => ({}),
  )
  const reviewItems = useState<ReviewQueueEntry[]>('optimizer:reviewItems', () => [])
  const reviewTotal = useState('optimizer:reviewTotal', () => 0)
  const prompts = useState<PromptVersion[]>('optimizer:prompts', () => [])
  const selectedPromptId = useState<number | undefined>(
    'optimizer:selectedPromptId',
    () => undefined,
  )

  const loadingStats = ref(false)
  const loadingHistory = ref(false)
  const loadingRunDetail = ref(false)
  const loadingReview = ref(false)
  const loadingPrompts = ref(false)
  const globalError = ref<string | null>(null)

  const maxRounds = ref(5)
  const targetAccuracy = ref(0.9)
  const startingOptimizer = ref(false)
  const cancellingRunId = ref<number | null>(null)
  const optimizerMessage = ref<string | null>(null)

  const reviewSearch = ref('')
  const reviewActionFilter = ref<'all' | ArbiterAction>('all')
  const selectedReview = ref<ReviewQueueEntry | null>(null)
  const correctionAction = ref<ArbiterAction>('trigger_rebuild')
  const reviewMutatingId = ref<string | null>(null)
  const reviewError = ref<string | null>(null)

  const optimizerDefaultModel = useState<string | null>('sidebar:optimizerDefaultModel', () => null)
  const poolModel = ref(optimizerDefaultModel.value ?? '')
  const startingPoolEval = ref(false)
  const poolEvalRunId = ref<number | null>(null)
  const poolEvalError = ref<string | null>(null)

  const selectedRunId = useState<number | null>('optimizer:selectedRunId', () => null)
  const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)

  const lowestCoverage = computed(() => (stats.value ? getLowestActionCoverage(stats.value) : null))
  const poolIsEmpty = computed(() => isEvalPoolEmpty(stats.value))
  const activeOptimizerRun = computed(
    () => optimizerRuns.value.find((run) => isOptimizerRunActive(run)) ?? null,
  )
  const latestRun = computed(() => optimizerRuns.value[0] ?? null)
  const selectedRun = computed(() => {
    const id = selectedRunId.value ?? latestRun.value?.optimizer_run_id ?? null
    if (id == null) return null
    return (
      optimizerRunDetails.value[id] ??
      optimizerRuns.value.find((run) => run.optimizer_run_id === id) ??
      null
    )
  })
  const filteredReviewItems = computed(() => {
    const query = reviewSearch.value.trim().toLowerCase()
    return reviewItems.value.filter((item) => {
      const matchesAction =
        reviewActionFilter.value === 'all' || item.expected_action === reviewActionFilter.value
      const matchesSearch =
        !query ||
        item.description.toLowerCase().includes(query) ||
        item.log_snippet.toLowerCase().includes(query) ||
        item.source_dataset.toLowerCase().includes(query)
      return matchesAction && matchesSearch
    })
  })

  async function loadStats() {
    loadingStats.value = true
    try {
      const res = await api.getEvalPoolStats()
      stats.value = res.data
    } catch (error) {
      globalError.value = extractOptimizerError(error)
    } finally {
      loadingStats.value = false
    }
  }

  async function loadHistory(showLoading = true) {
    if (showLoading) loadingHistory.value = true
    try {
      const res = await api.getOptimizerHistory()
      optimizerRuns.value = res.data.runs
      if (selectedRunId.value == null && res.data.runs.length > 0) {
        selectedRunId.value = res.data.runs[0].optimizer_run_id
      }
    } catch (error) {
      globalError.value = extractOptimizerError(error)
    } finally {
      loadingHistory.value = false
    }
  }

  async function loadOptimizerRunDetail(runId: number, showLoading = true) {
    if (showLoading) loadingRunDetail.value = true
    try {
      const res = await api.getOptimizerRunDetail(runId)
      optimizerRunDetails.value = {
        ...optimizerRunDetails.value,
        [runId]: res.data,
      }
    } catch (error) {
      globalError.value = extractOptimizerError(error)
    } finally {
      loadingRunDetail.value = false
    }
  }

  async function loadReviewQueue() {
    loadingReview.value = true
    try {
      const res = await api.getReviewQueue()
      reviewItems.value = res.data.items
      reviewTotal.value = res.data.total
    } catch (error) {
      globalError.value = extractOptimizerError(error)
    } finally {
      loadingReview.value = false
    }
  }

  async function loadPrompts() {
    loadingPrompts.value = true
    try {
      const res = await api.getPrompts()
      prompts.value = res.data
      selectedPromptId.value = res.data.find((prompt) => prompt.active)?.id ?? res.data[0]?.id
    } catch {
      prompts.value = []
    } finally {
      loadingPrompts.value = false
    }
  }

  async function refreshAll() {
    globalError.value = null
    await Promise.all([loadStats(), loadHistory(), loadReviewQueue(), loadPrompts()])
    // loadOptimizerRunDetail is triggered by watch(selectedRunId) — no explicit call needed here
  }

  function stopPolling() {
    if (pollTimer.value) {
      clearInterval(pollTimer.value)
      pollTimer.value = null
    }
  }

  function syncPolling() {
    if (!shouldPollOptimizerHistory(optimizerRuns.value)) {
      stopPolling()
      return
    }
    if (!pollTimer.value) {
      pollTimer.value = setInterval(async () => {
        await loadHistory(false)
        if (selectedRunId.value != null) await loadOptimizerRunDetail(selectedRunId.value, false)
      }, 3000)
    }
  }

  async function startOptimizer() {
    startingOptimizer.value = true
    optimizerMessage.value = null
    globalError.value = null
    try {
      await api.startOptimizerRun({
        max_rounds: Number(maxRounds.value),
        target_accuracy: Number(targetAccuracy.value),
      })
      optimizerMessage.value = 'Optimizer run started'
      await loadHistory(false)
    } catch (error) {
      const message = extractOptimizerError(error)
      if (message === 'optimizer-already-running') {
        optimizerMessage.value = 'An optimizer run is already active'
        await loadHistory(false)
      } else {
        globalError.value = message
      }
    } finally {
      startingOptimizer.value = false
    }
  }

  async function cancelOptimizerRun(run: OptimizerRun) {
    if (!window.confirm(`Cancel optimizer run #${run.optimizer_run_id}?`)) return
    cancellingRunId.value = run.optimizer_run_id
    optimizerMessage.value = null
    try {
      await api.cancelOptimizerRun(run.optimizer_run_id)
      optimizerMessage.value = 'Cancelling after current round'
      await loadHistory(false)
    } catch (error) {
      globalError.value = extractOptimizerError(error)
    } finally {
      cancellingRunId.value = null
    }
  }

  async function updateReview(
    item: ReviewQueueEntry,
    action: ReviewQueueMutationRequest['action'],
  ) {
    reviewError.value = null
    if (action === 'correct' && !correctionAction.value) {
      reviewError.value = 'Choose a corrected action'
      return
    }
    reviewMutatingId.value = item.id
    const body: ReviewQueueMutationRequest =
      action === 'correct' ? { action, expected_action: correctionAction.value } : { action }
    try {
      await api.updateReviewQueueEntry(item.id, body)
      selectedReview.value = null
      await loadReviewQueue()
      if (action !== 'reject') await loadStats()
    } catch (error) {
      const message = extractOptimizerError(error)
      if (message === 'entry-not-found') {
        reviewError.value = 'Entry was already processed'
        reviewItems.value = reviewItems.value.filter((row) => row.id !== item.id)
        selectedReview.value = null
      } else {
        reviewError.value = message
      }
    } finally {
      reviewMutatingId.value = null
    }
  }

  async function startPoolEvaluation() {
    poolEvalError.value = null
    poolEvalRunId.value = null
    startingPoolEval.value = true
    try {
      const res = await api.startPoolEvaluation(
        selectedPromptId.value,
        poolModel.value.trim() || undefined,
      )
      poolEvalRunId.value = res.data.run_id
    } catch (error) {
      const message = extractOptimizerError(error)
      poolEvalError.value =
        message === 'eval-pool-empty'
          ? 'Eval pool is empty. Import or review cases first.'
          : message
    } finally {
      startingPoolEval.value = false
    }
  }

  watch(optimizerRuns, syncPolling, { deep: true })

  // Single source of truth for run detail loading — immediate so URL-initialised
  // selectedRunId also triggers a load without waiting for a change event
  watch(
    selectedRunId,
    (runId) => {
      if (runId != null) void loadOptimizerRunDetail(runId)
    },
    { immediate: true },
  )

  watch(
    () => route.path,
    (path) => {
      activeTab.value = tabFromPath(path)
    },
  )

  watch(activeTab, (tab) => {
    if (!VALID_TABS.includes(tab)) return
    const nextPath = TAB_PATHS[tab]
    if (route.path !== nextPath) void router.push(nextPath)
  })

  onMounted(refreshAll)
  onUnmounted(stopPolling)

  return {
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
  }
}
