export type PrimaryAction =
  | 'trigger_rebuild'
  | 'trigger_fallback'
  | 'trigger_restart'
  | 'notify_human'
  | 'send_email'

export type SideAction = 'notify_human' | 'send_email' | null
export type Source = 'manual' | 'jenkins' | 'redfish'
export type RuleValue = number | string | boolean

export interface ArbiterResponse<T = Record<string, unknown>> {
  status: 'success' | 'error'
  data: T
  message: string
}

export interface PaginatedResponse<T> {
  total: number
  items: T[]
}

export interface AnalyzeRequest {
  log_snippet: string
  hardware_info?: Record<string, unknown>
  fail_count_24h?: number
  source?: string
}

export interface DecisionData {
  primary_action: PrimaryAction
  side_action: SideAction
  confidence: number
  reason: string
  thinking: string | null
  source: Source
  provider: string
  model?: string
  decision_id: number
  duration_ms?: number
}

export interface GetDecisionsParams {
  limit?: number
  offset?: number
  action?: string | null
  provider?: string | null
  since?: string | null
  until?: string | null
}

export interface GetStatsParams {
  window_hours?: number
}

export interface ProviderResponse {
  active_provider: string
  available_providers: string[]
}

export interface ProviderPatchBody {
  provider: string
}

export interface RulePatchBody {
  value: RuleValue
}

export interface PromptCreateRequest {
  label: string
  content: string
}

export interface EvaluateRequest {
  prompt_version_id: number | 'active'
  model?: string
}

export interface GetEvalResultsParams {
  prompt_version_id?: number
}

export interface TestCaseCreateRequest {
  description: string
  log_snippet: string
  expected_action: string
  hardware_info?: Record<string, unknown>
}

export interface DecisionRecord {
  id: number
  primary_action: PrimaryAction
  side_action: SideAction
  confidence: number
  source: Source
  provider: string
  model?: string
  created_at: string
  reason: string
  log_snippet: string
  thinking?: string
  hardware_info?: Record<string, unknown>
}

export interface DecisionsPaginatedResponse {
  decisions: DecisionRecord[]
  total: number
  limit: number
  offset: number
}

export interface DecisionStats {
  window_hours: number
  by_action: Partial<Record<PrimaryAction, number>>
  avg_confidence: number | null
}

export interface Rule {
  name: string
  value: RuleValue
  description?: string
}

export type ProviderInfo = ProviderResponse

export interface PromptVersion {
  id: number
  label: string
  content: string
  is_active: boolean
  active: boolean
  created: string
  created_at?: string
  eval_score?: number | null
}

export interface TestCase {
  id: number
  description: string
  log_snippet: string
  hardware_info?: Record<string, unknown>
  expected_action: PrimaryAction
}

export interface EvalResult {
  test_case_id: number
  description: string
  expected_action: PrimaryAction
  predicted_action: PrimaryAction | 'timeout'
  is_correct: boolean
  latency_ms: number | null
}

export interface EvaluationSummary {
  prompt_version_id: number
  total: number
  correct: number
  timeout_count: number
  accuracy: number
  results: EvalResult[]
  created_at?: string
  persisted?: boolean
  discard_reason?: 'timeout_ratio_exceeded' | null
}

export interface EvalRun {
  run_id: number
  prompt_version_id: number
  provider: string
  model: string
  started_at: string
  finished_at: string
  total: number
  correct: number
  timeout_count: number
  accuracy: number
}

export interface EvalRunResult {
  test_case_id: number
  expected_action: PrimaryAction
  predicted_action: PrimaryAction | 'timeout'
  is_correct: boolean
  latency_ms: number | null
}

export interface EvalRunDetail {
  run: EvalRun
  results: EvalRunResult[]
}

export interface EvalCompareGroupByProvider {
  provider: string
  model: string
  run_count: number
  avg_accuracy: number
  best_accuracy: number
  runs: EvalRun[]
}

export interface EvalCompareGroupByPromptVersion {
  prompt_version_id: number
  run_count: number
  avg_accuracy: number
  best_accuracy: number
  runs: EvalRun[]
}

export type EvalCompareGroup = EvalCompareGroupByProvider | EvalCompareGroupByPromptVersion

export interface EvalCompareResponse {
  dimension: 'provider' | 'prompt_version'
  groups: EvalCompareGroup[]
}

