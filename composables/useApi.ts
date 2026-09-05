import type {
  ArbiterResponse,
  PaginatedResponse,
  DecisionsPaginatedResponse,
  AnalyzeRequest,
  DecisionData,
  DecisionStats,
  GetDecisionsParams,
  GetStatsParams,
  Rule,
  ProviderResponse,
  PromptVersion,
  TestCase,
  TestCaseCreateRequest,
  EvaluationSummary,
  RuleValue,
  ProviderPatchBody,
  RulePatchBody,
  PromptCreateRequest,
  EvaluateRequest,
  GetEvalResultsParams,
  EvalRun,
  EvalRunDetail,
  EvalCompareResponse,
  AsyncEvalStartResponse,
  EvalJobsResponse,
  EvalPoolStats,
  ReviewQueueMutationRequest,
  ReviewQueueResponse,
  OptimizerHistoryResponse,
  OptimizerRun,
  OptimizerRunStartRequest,
  OptimizerRunStartResponse,
  OptimizerCancelResponse,
} from '~/types/api'

interface GetCasesParams {
  limit?: number
  offset?: number
}

export function useApi() {
  // Captured here in setup context rather than inside the interceptor: the
  // interceptor can fire after the call stack has left the Nuxt app context.
  // `route` stays reactive, so fullPath is still current when a 401 arrives.
  const route = useRoute()
  const authStore = useAuthStore()

  /**
   * A 401 on `/api/arbiter/*` has two unrelated causes: our own session expired,
   * or the upstream API rejected a request we were perfectly entitled to make.
   * Signing the user out on the second is wrong, and the response alone cannot
   * tell them apart -- so ask the server before touching anything.
   *
   * The same probe settles the race where a slow request's 401 arrives after
   * the user has signed back in: the session is valid by then, so nothing is
   * cleared.
   */
  async function verifyAndSignOut(): Promise<void> {
    if (await authStore.check()) return
    // Re-read the route: the probe is a round trip, and the user may have
    // reached the login page while it was outstanding.
    if (route.path === '/login') return
    authStore.reset()
    void navigateTo({ path: '/login', query: { redirect: route.fullPath } })
  }

  // Collapses a burst of simultaneous 401s into one probe and one redirect,
  // rather than one of each per failed request.
  let pendingSignOut: Promise<void> | null = null

  function handleUnauthorized(): void {
    pendingSignOut ??= verifyAndSignOut().finally(() => {
      pendingSignOut = null
    })
  }

  const api = $fetch.create({
    baseURL: '/api/arbiter',
    onResponseError({ response }) {
      if (response.status !== 401) return
      // SSR has its own gate in middleware/auth.ts; navigating mid-render
      // would abort the very request the server is still answering.
      if (!import.meta.client) return
      if (route.path === '/login') return
      handleUnauthorized()
    },
  })

  function normalizePrompt(prompt: PromptVersion): PromptVersion {
    const isActive = prompt.is_active ?? prompt.active
    return {
      ...prompt,
      is_active: isActive,
      active: isActive,
      created: prompt.created ?? prompt.created_at ?? '',
    }
  }

  return {
    analyze: (body: AnalyzeRequest) =>
      api<ArbiterResponse<DecisionData>>('/analyze', { method: 'POST', body }),

    getDecisions: (params?: GetDecisionsParams) => {
      const query = params
        ? Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
        : undefined
      return api<ArbiterResponse<DecisionsPaginatedResponse>>('/decisions', { query })
    },

    getDecisionStats: (params?: GetStatsParams) =>
      api<ArbiterResponse<DecisionStats>>('/decisions/stats', { query: params }),

    getRules: async () => {
      const res = await api<
        ArbiterResponse<
          Record<
            string,
            {
              rule_name: string
              rule_value: { value: RuleValue }
              description: string
              updated_at: string
            }
          >
        >
      >('/config/rules')
      const rules: Rule[] = Object.entries(res.data ?? {}).map(([name, entry]) => ({
        name,
        value: entry.rule_value.value,
        description: entry.description,
      }))
      return { ...res, data: rules }
    },

    updateRule: (name: string, value: RuleValue) =>
      api<ArbiterResponse<Rule>>(`/config/rules/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        body: { value } satisfies RulePatchBody,
      }),

    getProviders: () => api<ProviderResponse>('/config/provider'),

    setProvider: (provider: string) =>
      api<ProviderResponse>('/config/provider', {
        method: 'PATCH',
        body: { provider } satisfies ProviderPatchBody,
      }),

    getPrompts: async () => {
      const res = await api<ArbiterResponse<{ prompts: PromptVersion[] }>>('/config/prompts')
      return { ...res, data: (res.data.prompts ?? []).map(normalizePrompt) }
    },

    createPrompt: (label: string, content: string) =>
      api<ArbiterResponse<PromptVersion>>('/config/prompts', {
        method: 'POST',
        body: { label, content } satisfies PromptCreateRequest,
      }).then((res) => ({ ...res, data: normalizePrompt(res.data) })),

    activatePrompt: (id: number) =>
      api<ArbiterResponse<PromptVersion>>(`/config/prompts/${id}/activate`, {
        method: 'PATCH',
      }).then((res) => ({ ...res, data: normalizePrompt(res.data) })),

    getCases: (params?: GetCasesParams) =>
      api<ArbiterResponse<PaginatedResponse<TestCase>>>('/cases', { query: params }),

    getCase: (id: number) => api<ArbiterResponse<TestCase>>(`/cases/${id}`),

    createCase: (body: TestCaseCreateRequest) =>
      api<ArbiterResponse<TestCase>>('/cases', { method: 'POST', body }),

    deleteCase: (id: number) => api<void>(`/cases/${id}`, { method: 'DELETE' }),

    seedCases: () =>
      api<ArbiterResponse<Record<string, unknown>>>('/cases/seed', { method: 'POST' }),

    startEvaluation: (promptId?: number, model?: string) =>
      api<ArbiterResponse<AsyncEvalStartResponse>>('/evaluate', {
        method: 'POST',
        body: {
          prompt_version_id: promptId ?? 'active',
          ...(model ? { model } : {}),
        } satisfies EvaluateRequest,
      }),

    getEvalJobs: () => api<ArbiterResponse<EvalJobsResponse>>('/evaluate/jobs'),

    cancelEvalJob: async (runId: number): Promise<'cancelled' | 'already-ended' | 'timeout'> => {
      try {
        await api<void>(`/evaluate/jobs/${runId}`, { method: 'DELETE' })
        return 'cancelled'
      } catch (e: unknown) {
        const status =
          e && typeof e === 'object' && 'status' in e ? (e as { status: number }).status : 0
        if (status === 409) return 'already-ended'
        if (status === 503) return 'timeout'
        throw e
      }
    },

    getEvalResults: async (params?: GetEvalResultsParams) => {
      const res = await api<
        ArbiterResponse<
          | EvaluationSummary[]
          | { evaluations: EvaluationSummary[] }
          | { results: EvaluationSummary[] }
        >
      >('/evaluate/results', { query: params })
      let list: EvaluationSummary[]
      if (Array.isArray(res.data)) {
        list = res.data
      } else if ('evaluations' in res.data) {
        list = res.data.evaluations
      } else if ('results' in res.data) {
        list = (res.data as { results: EvaluationSummary[] }).results
      } else {
        list = []
      }
      return { ...res, data: list }
    },

    getEvalHistory: () => api<ArbiterResponse<{ runs: EvalRun[] }>>('/evaluate/history'),

    getEvalRunDetail: (runId: number) =>
      api<ArbiterResponse<EvalRunDetail>>(`/evaluate/history/${runId}`),

    getEvalCompare: (by: 'provider' | 'prompt_version') =>
      api<ArbiterResponse<EvalCompareResponse>>('/evaluate/history/compare', { query: { by } }),

    getEvalPoolStats: () => api<ArbiterResponse<EvalPoolStats>>('/eval-pool/stats'),

    getReviewQueue: () => api<ArbiterResponse<ReviewQueueResponse>>('/review-queue'),

    updateReviewQueueEntry: (id: string, body: ReviewQueueMutationRequest) =>
      api<ArbiterResponse<Record<string, never>>>(`/review-queue/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body,
      }),

    startPoolEvaluation: (promptId?: number, model?: string) =>
      api<ArbiterResponse<AsyncEvalStartResponse>>('/evaluate', {
        method: 'POST',
        body: {
          prompt_version_id: promptId ?? 'active',
          source: 'pool',
          ...(model ? { model } : {}),
        } satisfies EvaluateRequest,
      }),

    getOptimizerHistory: () => api<ArbiterResponse<OptimizerHistoryResponse>>('/optimizer/history'),

    getOptimizerRunDetail: (runId: number) =>
      api<ArbiterResponse<OptimizerRun>>(`/optimizer/history/${runId}`),

    startOptimizerRun: (body: OptimizerRunStartRequest) =>
      api<ArbiterResponse<OptimizerRunStartResponse>>('/optimizer/run', {
        method: 'POST',
        body,
      }),

    cancelOptimizerRun: (runId: number) =>
      api<ArbiterResponse<OptimizerCancelResponse>>(`/optimizer/runs/${runId}`, {
        method: 'DELETE',
      }),

    deleteEvalRun: async (runId: number) => {
      try {
        return await api<ArbiterResponse<null>>(`/evaluate/history/${runId}`, { method: 'DELETE' })
      } catch (e: unknown) {
        if (
          e &&
          typeof e === 'object' &&
          'status' in e &&
          (e as { status: number }).status === 404
        ) {
          return { status: 'success', data: null, message: '' } as ArbiterResponse<null>
        }
        throw e
      }
    },

    healthCheck: () => api<Record<string, unknown>>('/health'),
  }
}
