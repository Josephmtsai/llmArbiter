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
  total: number
  by_action: Record<PrimaryAction, number>
  auto_executed: number
  avg_confidence: number
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
  case_id: number
  description: string
  expected: PrimaryAction
  actual: PrimaryAction
  confidence: number
  pass: boolean
}

export interface EvaluationSummary {
  score: number
  pass_count: number
  total_count: number
  avg_confidence: number
  results: EvalResult[]
}

