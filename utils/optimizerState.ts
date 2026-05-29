import type { ArbiterAction, EvalPoolStats, OptimizerRun } from '~/types/api'

export const ARBITER_ACTIONS: readonly ArbiterAction[] = [
  'trigger_rebuild',
  'trigger_fallback',
  'trigger_restart',
  'notify_human',
  'send_email',
] as const

const TERMINAL_OPTIMIZER_STATUSES = new Set(['completed', 'completed_max_rounds', 'failed', 'cancelled'])

export function shouldPollOptimizerHistory(
  runs: Array<Pick<OptimizerRun, 'status'> & { optimizer_run_id: number; rounds: unknown[] }>,
): boolean {
  return runs.some(run => !TERMINAL_OPTIMIZER_STATUSES.has(run.status))
}

export function isEvalPoolEmpty(stats: EvalPoolStats | null | undefined): boolean {
  return !stats || stats.total === 0
}

export function getLowestActionCoverage(stats: EvalPoolStats): { action: ArbiterAction; count: number } {
  return ARBITER_ACTIONS.map(action => ({
    action,
    count: stats.by_action[action] ?? 0,
  })).sort((a, b) => a.count - b.count)[0]
}

export function bestOptimizerAccuracy(run: Pick<OptimizerRun, 'rounds'>): number | null {
  if (run.rounds.length === 0) return null
  return Math.max(...run.rounds.map(round => round.accuracy))
}
