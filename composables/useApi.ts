import type {
  ArbiterResponse,
  PaginatedResponse,
  DecisionsPaginatedResponse,
  AnalyzeRequest,
  DecisionData,
  DecisionRecord,
  DecisionStats,
  GetDecisionsParams,
  GetStatsParams,
  Rule,
  ProviderResponse,
  PromptVersion,
  TestCase,
  TestCaseCreateRequest,
  EvaluationSummary,
  AuditEvent,
  RuleValue,
  ProviderPatchBody,
  RulePatchBody,
  PromptCreateRequest,
  EvaluateRequest,
  GetEvalResultsParams,
} from '~/types/api'

interface GetCasesParams {
  limit?: number
  offset?: number
}

export function useApi() {
  const config = useRuntimeConfig()
  const apiKey = config.public.apiKey as string

  const api = $fetch.create({
    baseURL: config.public.apiBase as string,
    headers: { 'X-API-Key': apiKey },
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

    getDecisions: (params?: GetDecisionsParams) =>
      api<ArbiterResponse<DecisionsPaginatedResponse>>('/decisions', { query: params }),

    getDecisionStats: (params?: GetStatsParams) =>
      api<ArbiterResponse<DecisionStats>>('/decisions/stats', { query: params }),

    getRules: () =>
      api<ArbiterResponse<Rule[]>>('/config/rules'),

    updateRule: (name: string, value: RuleValue) =>
      api<ArbiterResponse<Rule>>(`/config/rules/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        body: { value } satisfies RulePatchBody,
      }),

    getProviders: () =>
      api<ProviderResponse>('/config/provider'),

    setProvider: (provider: string) =>
      api<ProviderResponse>('/config/provider', {
        method: 'PATCH',
        body: { provider } satisfies ProviderPatchBody,
      }),

    getPrompts: async () => {
      const res = await api<ArbiterResponse<PromptVersion[]>>('/config/prompts')
      return { ...res, data: res.data.map(normalizePrompt) }
    },

    createPrompt: (label: string, content: string) =>
      api<ArbiterResponse<PromptVersion>>('/config/prompts', {
        method: 'POST',
        body: { label, content } satisfies PromptCreateRequest,
      }).then(res => ({ ...res, data: normalizePrompt(res.data) })),

    activatePrompt: (id: number) =>
      api<ArbiterResponse<PromptVersion>>(`/config/prompts/${id}/activate`, {
        method: 'PATCH',
      }).then(res => ({ ...res, data: normalizePrompt(res.data) })),

    getCases: (params?: GetCasesParams) =>
      api<ArbiterResponse<PaginatedResponse<TestCase>>>('/cases', { query: params }),

    getCase: (id: number) =>
      api<ArbiterResponse<TestCase>>(`/cases/${id}`),

    createCase: (body: TestCaseCreateRequest) =>
      api<ArbiterResponse<TestCase>>('/cases', { method: 'POST', body }),

    deleteCase: (id: number) =>
      api<void>(`/cases/${id}`, { method: 'DELETE' }),

    seedCases: () =>
      api<ArbiterResponse<Record<string, unknown>>>('/cases/seed', { method: 'POST' }),

    runEvaluation: (promptId?: number) =>
      api<ArbiterResponse<EvaluationSummary>>('/evaluate', {
        method: 'POST',
        body: {
          prompt_version_id: promptId ?? 'active',
        } satisfies EvaluateRequest,
      }),

    getEvalResults: (params?: GetEvalResultsParams) =>
      api<ArbiterResponse<EvaluationSummary[]>>('/evaluate/results', { query: params }),

    getAudit: (params?: { limit?: number; offset?: number; since?: string }) =>
      api<ArbiterResponse<AuditEvent[]>>('/audit', { query: params }),

    healthCheck: () =>
      api<Record<string, unknown>>('/health'),
  }
}
